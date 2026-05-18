import { NextRequest, NextResponse } from 'next/server';
import { parseEditBlocks, resolveEditApply } from '@/lib/parse-edit-blocks';
import { parseAiCodeResponse } from '@/lib/parse-ai-response';
// Sandbox import not needed - using global sandbox from sandbox-manager
import type { SandboxState } from '@/types/sandbox';
import type { ConversationState } from '@/types/conversation';
import { sandboxManager } from '@/lib/sandbox/sandbox-manager';
import { canonicalProjectRelativePath } from '@/lib/sandbox-project-path';
import { validateBuild, extractMissingPackages } from '@/lib/build-validator';
import { appConfig } from '@/config/app.config';
import { persistApplyToProject, type PersistedFile } from '@/lib/project-persist';

declare global {
  var conversationState: ConversationState | null;
  var activeSandboxProvider: any;
  var existingFiles: Set<string>;
  var sandboxState: SandboxState;
  var lastSandboxActivityAt: number | undefined;
}

function readSandboxCachedFile(normPath: string): string | undefined {
  const files = global.sandboxState?.fileCache?.files;
  if (!files) return undefined;
  const variants = [
    normPath,
    normPath.startsWith('src/') ? normPath : `src/${normPath}`,
    normPath.replace(/^src\//, ''),
  ];
  for (const key of [...new Set(variants)]) {
    const hit = files[key];
    if (hit?.content) return hit.content as string;
  }
  return undefined;
}

export async function POST(request: NextRequest) {
  try {
    const { response, isEdit = false, packages = [], sandboxId, projectId: incomingProjectId } = await request.json();
    const parsedProjectId =
      typeof incomingProjectId === 'string' && incomingProjectId.length > 0 ? incomingProjectId : undefined;

    if (!response) {
      return NextResponse.json({
        error: 'response is required'
      }, { status: 400 });
    }

    // Debug log the response
    console.log('[apply-ai-code-stream] Received response to parse:');
    console.log('[apply-ai-code-stream] Response length:', response.length);
    console.log('[apply-ai-code-stream] Response preview:', response.substring(0, 500));
    console.log('[apply-ai-code-stream] isEdit:', isEdit);
    console.log('[apply-ai-code-stream] packages:', packages);

    // Parse the AI response
    const parsed = parseAiCodeResponse(response, {
      extractPackagesFromImports: true,
      extendedHeuristics: true,
      logPrefix: '[apply-ai-code-stream]',
    });
    const editBlocks = parseEditBlocks(response);
    console.log('[apply-ai-code-stream] Parsed <edit> blocks:', editBlocks.length);
    
    // Log what was parsed
    console.log('[apply-ai-code-stream] Parsed result:');
    console.log('[apply-ai-code-stream] Files found:', parsed.files.length);
    if (parsed.files.length > 0) {
      parsed.files.forEach(f => {
        console.log(`[apply-ai-code-stream] - ${f.path} (${f.content.length} chars)`);
      });
    }
    console.log('[apply-ai-code-stream] Packages found:', parsed.packages);

    // Initialize existingFiles if not already
    if (!global.existingFiles) {
      global.existingFiles = new Set<string>();
    }

    // Try to get provider from sandbox manager first
    let provider = sandboxId ? sandboxManager.getProvider(sandboxId) : sandboxManager.getActiveProvider();

    // Fall back to global state if not found in manager
    if (!provider) {
      provider = global.activeSandboxProvider;
    }

    // If we have a sandboxId but no provider, try to get or create one
    if (!provider && sandboxId) {
      console.log(`[apply-ai-code-stream] No provider found for sandbox ${sandboxId}, attempting to get or create...`);

      try {
        provider = await sandboxManager.getOrCreateProvider(sandboxId);

        // If we got a new provider (not reconnected), we need to create a new sandbox
        if (!provider.getSandboxInfo()) {
          console.log(`[apply-ai-code-stream] Creating new sandbox since reconnection failed for ${sandboxId}`);
          await provider.createSandbox();
          await provider.setupViteApp();
          sandboxManager.registerSandbox(sandboxId, provider);
        }

        // Update legacy global state
        global.activeSandboxProvider = provider;
        console.log(`[apply-ai-code-stream] Successfully got provider for sandbox ${sandboxId}`);
      } catch (providerError) {
        console.error(`[apply-ai-code-stream] Failed to get or create provider for sandbox ${sandboxId}:`, providerError);
        return NextResponse.json({
          success: false,
          error: `Failed to create sandbox provider for ${sandboxId}. The sandbox may have expired.`,
          results: {
            filesCreated: [],
            packagesInstalled: [],
            commandsExecuted: [],
            errors: [`Sandbox provider creation failed: ${(providerError as Error).message}`]
          },
          explanation: parsed.explanation,
          structure: parsed.structure,
          parsedFiles: parsed.files,
          message: `Parsed ${parsed.files.length} files but couldn't apply them - sandbox reconnection failed.`
        }, { status: 500 });
      }
    }

    // If we still don't have a provider, create a new one
    if (!provider) {
      console.log(`[apply-ai-code-stream] No active provider found, creating new sandbox...`);
      try {
        const { SandboxFactory } = await import('@/lib/sandbox/factory');
        provider = SandboxFactory.create();
        const sandboxInfo = await provider.createSandbox();
        await provider.setupViteApp();

        // Register with sandbox manager
        sandboxManager.registerSandbox(sandboxInfo.sandboxId, provider);

        // Store in legacy global state
        global.activeSandboxProvider = provider;
        global.sandboxData = {
          sandboxId: sandboxInfo.sandboxId,
          url: sandboxInfo.url
        };

        console.log(`[apply-ai-code-stream] Created new sandbox successfully`);
      } catch (createError) {
        console.error(`[apply-ai-code-stream] Failed to create new sandbox:`, createError);
        return NextResponse.json({
          success: false,
          error: `Failed to create new sandbox: ${createError instanceof Error ? createError.message : 'Unknown error'}`,
          results: {
            filesCreated: [],
            packagesInstalled: [],
            commandsExecuted: [],
            errors: [`Sandbox creation failed: ${createError instanceof Error ? createError.message : 'Unknown error'}`]
          },
          explanation: parsed.explanation,
          structure: parsed.structure,
          parsedFiles: parsed.files,
          message: `Parsed ${parsed.files.length} files but couldn't apply them - sandbox creation failed.`
        }, { status: 500 });
      }
    }

    // Create a response stream for real-time updates
    const encoder = new TextEncoder();
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();

    // Function to send progress updates
    const sendProgress = async (data: any) => {
      const message = `data: ${JSON.stringify(data)}\n\n`;
      await writer.write(encoder.encode(message));
    };

    // Start processing in background (pass provider and request to the async function)
    (async (providerInstance, req, projId?: string) => {
      const results = {
        filesCreated: [] as string[],
        filesUpdated: [] as string[],
        packagesInstalled: [] as string[],
        packagesAlreadyInstalled: [] as string[],
        packagesFailed: [] as string[],
        commandsExecuted: [] as string[],
        errors: [] as string[]
      };

      const persistedWrites: PersistedFile[] = [];

      try {
        await sendProgress({
          type: 'start',
          message: 'Starting code application...',
          totalSteps: 3
        });
        // Step 1: Install packages
        const packagesArray = Array.isArray(packages) ? packages : [];
        const parsedPackages = Array.isArray(parsed.packages) ? parsed.packages : [];

        // Combine and deduplicate packages
        const allPackages = [...packagesArray.filter(pkg => pkg && typeof pkg === 'string'), ...parsedPackages];

        // Use Set to remove duplicates, then filter out pre-installed packages
        const uniquePackages = [...new Set(allPackages)]
          .filter(pkg => pkg && typeof pkg === 'string' && pkg.trim() !== '') // Remove empty strings
          .filter(pkg => pkg !== 'react' && pkg !== 'react-dom'); // Filter pre-installed

        // Log if we found duplicates
        if (allPackages.length !== uniquePackages.length) {
          console.log(`[apply-ai-code-stream] Removed ${allPackages.length - uniquePackages.length} duplicate packages`);
          console.log(`[apply-ai-code-stream] Original packages:`, allPackages);
          console.log(`[apply-ai-code-stream] Deduplicated packages:`, uniquePackages);
        }

        if (uniquePackages.length > 0) {
          await sendProgress({
            type: 'step',
            step: 1,
            message: `Installing ${uniquePackages.length} packages...`,
            packages: uniquePackages
          });

          // Use streaming package installation
          try {
            // Construct the API URL properly for both dev and production
            const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
            const host = req.headers.get('host') || 'localhost:3000';
            const apiUrl = `${protocol}://${host}/api/install-packages`;

            const installResponse = await fetch(apiUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                packages: uniquePackages,
                sandboxId: sandboxId || providerInstance.getSandboxInfo()?.sandboxId
              })
            });

            if (installResponse.ok && installResponse.body) {
              const reader = installResponse.body.getReader();
              const decoder = new TextDecoder();

              while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value);
                if (!chunk) continue;
                const lines = chunk.split('\n');

                for (const line of lines) {
                  if (line.startsWith('data: ')) {
                    try {
                      const data = JSON.parse(line.slice(6));

                      // Forward package installation progress
                      await sendProgress({
                        type: 'package-progress',
                        ...data
                      });

                      // Track results
                      if (data.type === 'success' && data.installedPackages) {
                        results.packagesInstalled = data.installedPackages;
                      }
                    } catch (parseError) {
                      console.debug('Error parsing terminal output:', parseError);
                    }
                  }
                }
              }
            }
          } catch (error) {
            console.error('[apply-ai-code-stream] Error installing packages:', error);
            await sendProgress({
              type: 'warning',
              message: `Package installation skipped (${(error as Error).message}). Continuing with file creation...`
            });
            results.errors.push(`Package installation failed: ${(error as Error).message}`);
          }
        } else {
          await sendProgress({
            type: 'step',
            step: 1,
            message: 'No additional packages to install, skipping...'
          });
        }

        // Step 2: Create/update files
        const filesArray = Array.isArray(parsed.files) ? parsed.files : [];
        await sendProgress({
          type: 'step',
          step: 2,
          message: `Creating ${filesArray.length} files...`
        });

        // Filter out config files that shouldn't be created
        const configFiles = ['tailwind.config.js', 'vite.config.js', 'package.json', 'package-lock.json', 'tsconfig.json', 'postcss.config.js'];
        let filteredFiles = filesArray.filter(file => {
          if (!file || typeof file !== 'object') return false;
          const fileName = (file.path || '').split('/').pop() || '';
          return !configFiles.includes(fileName);
        });

        if (editBlocks.length > 0 && filteredFiles.length === 0) {
          const fromEdits: Array<{ path: string; content: string }> = [];
          for (const edit of editBlocks) {
            if (typeof edit.update !== 'string' || !edit.update.trim()) continue;
            const normalizedForCache = canonicalProjectRelativePath(edit.targetFile);
            const existingBody = readSandboxCachedFile(normalizedForCache);
            const resolved = resolveEditApply(edit, existingBody);
            if (!resolved.ok) {
              console.warn(resolved.reason);
              await sendProgress({ type: 'warning', message: resolved.reason });
              continue;
            }
            fromEdits.push({ path: edit.targetFile, content: resolved.content });
          }
          filteredFiles = fromEdits;
          if (filteredFiles.length > 0) {
            await sendProgress({
              type: 'warning',
              message: `Using <edit> fallback for ${filteredFiles.length} file(s) (patch where possible).`,
            });
          }
        }

        let hardReloadSuggested =
          uniquePackages.length > 0 ||
          filteredFiles.some((file) => {
            const base = (canonicalProjectRelativePath(file.path).split('/').pop() || '').toLowerCase();
            return (
              base === 'package.json' ||
              base === 'vite.config.ts' ||
              base === 'vite.config.js' ||
              base === 'vite.config.mts'
            );
          });
        
        for (const [index, file] of filteredFiles.entries()) {
          try {
            // Send progress for each file
            await sendProgress({
              type: 'file-progress',
              current: index + 1,
              total: filteredFiles.length,
              fileName: file.path,
              action: 'creating'
            });

            // Normalize duplicated container paths (/home/user/app/src/…) to vite-relative paths.
            let normalizedPath = canonicalProjectRelativePath(file.path);
            if (!normalizedPath.startsWith('src/') &&
              !normalizedPath.startsWith('public/') &&
              normalizedPath !== 'index.html' &&
              !configFiles.includes(normalizedPath.split('/').pop() || '')) {
              normalizedPath = 'src/' + normalizedPath;
            }

            const isUpdate = global.existingFiles.has(normalizedPath);

            // Remove component-scoped CSS imports from JSX/JS files (we're using Tailwind)
            // Keep index.css and App.css imports — those carry Tailwind directives and global styles
            let fileContent = file.content;
            if (file.path.endsWith('.jsx') || file.path.endsWith('.js') || file.path.endsWith('.tsx') || file.path.endsWith('.ts')) {
              fileContent = fileContent.replace(/import\s+['"]\.\/(?!index\.css|App\.css)[^'"]+\.css['"];?\s*\n?/g, '');
            }

            // Fix common Tailwind CSS errors in CSS files
            if (file.path.endsWith('.css')) {
              // Replace shadow-3xl with shadow-2xl (shadow-3xl doesn't exist)
              fileContent = fileContent.replace(/shadow-3xl/g, 'shadow-2xl');
              // Replace any other non-existent shadow utilities
              fileContent = fileContent.replace(/shadow-4xl/g, 'shadow-2xl');
              fileContent = fileContent.replace(/shadow-5xl/g, 'shadow-2xl');
            }

            // Create directory if needed
            const dirPath = normalizedPath.includes('/') ? normalizedPath.substring(0, normalizedPath.lastIndexOf('/')) : '';
            if (dirPath) {
              await providerInstance.runCommand(`mkdir -p ${dirPath}`);
            }

            // Write the file using provider
            await providerInstance.writeFile(normalizedPath, fileContent);

            persistedWrites.push({ path: normalizedPath, content: fileContent });

            // Update file cache
            if (global.sandboxState?.fileCache) {
              global.sandboxState.fileCache.files[normalizedPath] = {
                content: fileContent,
                lastModified: Date.now()
              };
            }

            if (isUpdate) {
              if (results.filesUpdated) results.filesUpdated.push(normalizedPath);
            } else {
              if (results.filesCreated) results.filesCreated.push(normalizedPath);
              if (global.existingFiles) global.existingFiles.add(normalizedPath);
            }

            await sendProgress({
              type: 'file-complete',
              fileName: normalizedPath,
              action: isUpdate ? 'updated' : 'created'
            });
          } catch (error) {
            if (results.errors) {
              results.errors.push(`Failed to create ${file.path}: ${(error as Error).message}`);
            }
            await sendProgress({
              type: 'file-error',
              fileName: file.path,
              error: (error as Error).message
            });
          }
        }

        // Step 3: Execute commands
        const commandsArray = Array.isArray(parsed.commands) ? parsed.commands : [];
        if (commandsArray.length > 0) {
          await sendProgress({
            type: 'step',
            step: 3,
            message: `Executing ${commandsArray.length} commands...`
          });

          for (const [index, cmd] of commandsArray.entries()) {
            try {
              await sendProgress({
                type: 'command-progress',
                current: index + 1,
                total: parsed.commands.length,
                command: cmd,
                action: 'executing'
              });

              // Use provider runCommand
              const result = await providerInstance.runCommand(cmd);

              // Get command output from provider result
              const stdout = result.stdout;
              const stderr = result.stderr;

              if (stdout) {
                await sendProgress({
                  type: 'command-output',
                  command: cmd,
                  output: stdout,
                  stream: 'stdout'
                });
              }

              if (stderr) {
                await sendProgress({
                  type: 'command-output',
                  command: cmd,
                  output: stderr,
                  stream: 'stderr'
                });
              }

              if (results.commandsExecuted) {
                results.commandsExecuted.push(cmd);
              }

              await sendProgress({
                type: 'command-complete',
                command: cmd,
                exitCode: result.exitCode,
                success: result.exitCode === 0
              });
            } catch (error) {
              if (results.errors) {
                results.errors.push(`Failed to execute ${cmd}: ${(error as Error).message}`);
              }
              await sendProgress({
                type: 'command-error',
                command: cmd,
                error: (error as Error).message
              });
            }
          }
        }

        // Step 3.5: Validate preview / recover missing packages from Vite errors
        let buildValidation: {
          success: boolean;
          errors: string[];
          isRendering: boolean;
          missingPackagesDetected: string[];
          missingPackagesInstalled: string[];
          retried: boolean;
        } | null = null;

        try {
          const sandboxInfo = providerInstance.getSandboxInfo?.();
          const previewUrl = sandboxInfo?.url as string | undefined;
          const effectiveId = (sandboxId || sandboxInfo?.sandboxId) as string | undefined;
          if (previewUrl && effectiveId) {
            await sendProgress({
              type: 'step',
              step: 4,
              message: 'Verifying preview build…',
            });
            let v = await validateBuild(previewUrl, effectiveId);
            const errorText = v.errors.join('\n');
            let missing = extractMissingPackages({ message: errorText }).filter(
              (p) => !p.startsWith('.') && !p.startsWith('@/')
            );
            missing = [...new Set(missing)];
            const installedFromErrors: string[] = [];
            let retried = false;

            if (!v.success && missing.length > 0) {
              await sendProgress({
                type: 'info',
                message: `Build check reported missing modules; installing: ${missing.join(', ')}`,
              });
              const flag = appConfig.packages.useLegacyPeerDeps ? ' --legacy-peer-deps' : '';
              const installCmd = `npm install ${missing.join(' ')}${flag}`.trim();
              const installResult = await providerInstance.runCommand(installCmd);
              retried = true;
              if (installResult.exitCode === 0) {
                installedFromErrors.push(...missing);
                missing.forEach((p) => {
                  if (!results.packagesInstalled.includes(p)) results.packagesInstalled.push(p);
                });
                if (appConfig.packages.autoRestartVite) {
                  try {
                    await providerInstance.runCommand('pkill -f vite || true');
                    await new Promise((r) => setTimeout(r, 1500));
                    await providerInstance.runCommand('nohup npm run dev > /tmp/vite.log 2>&1 &');
                    await new Promise((r) => setTimeout(r, 2000));
                  } catch (re) {
                    console.warn('[apply-ai-code-stream] Vite restart after error-install:', re);
                  }
                }
                v = await validateBuild(previewUrl, effectiveId);
              }
            }

            buildValidation = {
              success: v.success,
              errors: v.errors,
              isRendering: v.isRendering,
              missingPackagesDetected: missing,
              missingPackagesInstalled: installedFromErrors,
              retried,
            };
          }
        } catch (bvErr) {
          console.warn('[apply-ai-code-stream] Build validation skipped/failed:', bvErr);
        }

        if ((buildValidation?.missingPackagesInstalled?.length ?? 0) > 0) {
          hardReloadSuggested = true;
        }

        globalThis.lastSandboxActivityAt = Date.now();

        let snapshotId: string | undefined;
        if (projId && persistedWrites.length > 0) {
          snapshotId = await persistApplyToProject(projId, persistedWrites, parsed.explanation || 'Code apply');
        }

        // Send final results
        await sendProgress({
          type: 'complete',
          results,
          explanation: parsed.explanation,
          structure: parsed.structure,
          message: `Successfully applied ${results.filesCreated.length} files`,
          buildValidation: buildValidation ?? undefined,
          hardReloadSuggested,
          snapshotId,
        });

        // Track applied files in conversation state
        if (global.conversationState && results.filesCreated.length > 0) {
          const messages = global.conversationState.context.messages;
          if (messages.length > 0) {
            const lastMessage = messages[messages.length - 1];
            if (lastMessage.role === 'user') {
              lastMessage.metadata = {
                ...lastMessage.metadata,
                editedFiles: results.filesCreated
              };
            }
          }

          // Track applied code in project evolution
          if (global.conversationState.context.projectEvolution) {
            global.conversationState.context.projectEvolution.majorChanges.push({
              timestamp: Date.now(),
              description: parsed.explanation || 'Code applied',
              filesAffected: results.filesCreated || []
            });
          }

          global.conversationState.lastUpdated = Date.now();
        }

      } catch (error) {
        await sendProgress({
          type: 'error',
          error: (error as Error).message
        });
      } finally {
        await writer.close();
      }
    })(provider, request, parsedProjectId);

    // Return the stream
    return new Response(stream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error('Apply AI code stream error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to parse AI code' },
      { status: 500 }
    );
  }
}