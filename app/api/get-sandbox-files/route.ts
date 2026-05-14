import { NextResponse } from 'next/server';
import { parseJavaScriptFile, buildComponentTree } from '@/lib/file-parser';
import { FileManifest, FileInfo, RouteInfo } from '@/types/file-manifest';
// SandboxState type used implicitly through global.activeSandbox

declare global {
  var activeSandbox: any;
  var activeSandboxProvider: any;
}

export async function GET() {
  try {
    const MAX_FILE_SIZE_BYTES = 200 * 1024; // keep UI responsive while showing most project files
    const updateGlobalFileCache = (
      filesContent: Record<string, string>,
      manifest: FileManifest,
      sandboxId: string | undefined
    ) => {
      if (!global.sandboxState) {
        global.sandboxState = {
          fileCache: {
            files: {},
            lastSync: Date.now(),
            sandboxId: sandboxId || 'unknown',
            manifest
          }
        } as any;
      } else if (!global.sandboxState.fileCache) {
        global.sandboxState.fileCache = {
          files: {},
          lastSync: Date.now(),
          sandboxId: sandboxId || 'unknown',
          manifest
        } as any;
      }

      if (global.sandboxState.fileCache) {
        const cachedFiles: Record<string, { content: string; lastModified: number }> = {};
        for (const [path, content] of Object.entries(filesContent)) {
          cachedFiles[path] = {
            content,
            lastModified: Date.now(),
          };
        }
        global.sandboxState.fileCache.files = cachedFiles;
        global.sandboxState.fileCache.manifest = manifest;
        global.sandboxState.fileCache.lastSync = Date.now();
        if (sandboxId) {
          global.sandboxState.fileCache.sandboxId = sandboxId;
        }
      }
    };

    if (global.activeSandboxProvider) {
      console.log('[get-sandbox-files] Fetching files via activeSandboxProvider...');
      const provider = global.activeSandboxProvider;
      const normalizeProjectPath = (filePath: string): string => {
        const trimmedPath = filePath.replace(/^\.\//, '').replace(/^\/+/, '');
        const workspaceMarker = '/workspace/';
        const workspaceIdx = filePath.lastIndexOf(workspaceMarker);
        if (workspaceIdx !== -1) {
          const relativeFromWorkspace = filePath.slice(workspaceIdx + workspaceMarker.length).replace(/^\/+/, '');
          if (relativeFromWorkspace) return relativeFromWorkspace;
        }
        const workspaceRelativeMarker = 'workspace/';
        const workspaceRelativeIdx = trimmedPath.indexOf(workspaceRelativeMarker);
        if (workspaceRelativeIdx !== -1) {
          const relativeFromWorkspace = trimmedPath.slice(workspaceRelativeIdx + workspaceRelativeMarker.length).replace(/^\/+/, '');
          if (relativeFromWorkspace) return relativeFromWorkspace;
        }

        const roots = [
          'src/',
          'public/',
          'app/',
          'index.html',
          'package.json',
          'package-lock.json',
          'tsconfig.json',
          'vite.config.ts',
          'vite.config.js',
          'README.md',
        ];

        for (const root of roots) {
          const idx = trimmedPath.indexOf(root);
          if (idx !== -1) return trimmedPath.slice(idx);
        }

        if (trimmedPath.startsWith('sessions/')) {
          const parts = trimmedPath.split('/');
          if (parts.length > 2) {
            return parts.slice(2).join('/');
          }
        }

        return trimmedPath;
      };
      const getReadCandidates = (originalPath: string, normalizedPath: string): string[] => {
        const candidates = new Set<string>();
        const add = (value?: string) => {
          if (!value) return;
          const v = value.trim();
          if (v) candidates.add(v);
        };

        add(originalPath);
        add(normalizedPath);
        add(`./${normalizedPath}`);
        add(`/app/${normalizedPath}`);
        add(`workspace/${normalizedPath}`);
        add(`/workspace/${normalizedPath}`);

        const trimmedOriginal = originalPath.replace(/^\.\//, '').replace(/^\/+/, '');
        const parts = trimmedOriginal.split('/').filter(Boolean);
        if (parts[0] === 'sessions' && parts[1]) {
          const sessionRoot = `sessions/${parts[1]}`;
          add(`${sessionRoot}/${normalizedPath}`);
          add(`./${sessionRoot}/${normalizedPath}`);
          add(`${sessionRoot}/workspace/${normalizedPath}`);
          add(`./${sessionRoot}/workspace/${normalizedPath}`);
        }

        return Array.from(candidates);
      };

      const treeApiBaseUrl = process.env.MINU_SANDBOX_URL || 'http://localhost:8080';
      const sandboxId = provider?.getSandboxInfo?.()?.sandboxId;
      const flattenTreePaths = (node: any): string[] => {
        if (!node) return [];
        if (Array.isArray(node)) {
          return node.flatMap(item => flattenTreePaths(item));
        }
        const collected: string[] = [];
        if (typeof node.path === 'string' && node.path.trim()) {
          collected.push(node.path);
        }
        if (Array.isArray(node.children)) {
          collected.push(...node.children.flatMap((child: any) => flattenTreePaths(child)));
        }
        return collected;
      };

      let allFiles: string[] = [];
      if (sandboxId) {
        try {
          const treeRes = await fetch(`${treeApiBaseUrl}/tree/${sandboxId}`);
          if (treeRes.ok) {
            const treeData = await treeRes.json();
            allFiles = flattenTreePaths(treeData.files ?? treeData.tree ?? treeData);
            console.log('[get-sandbox-files] Tree endpoint returned paths:', allFiles.length);
          } else {
            console.warn('[get-sandbox-files] Tree endpoint failed, falling back to listFiles:', treeRes.status);
          }
        } catch (treeError) {
          console.warn('[get-sandbox-files] Tree endpoint error, falling back to listFiles:', treeError);
        }
      }

      if (allFiles.length === 0) {
        allFiles = await provider.listFiles();
      }
      const fileList = allFiles.filter((filePath: string) => {
        const normalizedPath = normalizeProjectPath(filePath);
        if (!normalizedPath) return false;
        if (normalizedPath.includes('node_modules/')) {
          return false;
        }
        return !normalizedPath.endsWith('/');
      });

      const filesContent: Record<string, string> = {};
      for (const filePath of fileList) {
        const normalizedPath = normalizeProjectPath(filePath);
        try {
          const candidates = getReadCandidates(filePath, normalizedPath);
          let content: string | null = null;
          let readOk = false;

          for (const candidatePath of candidates) {
            try {
              content = await provider.readFile(candidatePath);
              readOk = true;
              break;
            } catch {
              // Try next candidate path
            }
          }

          if (readOk && typeof content === 'string' && content.length <= MAX_FILE_SIZE_BYTES) {
            filesContent[normalizedPath] = content;
          } else if (readOk) {
            console.debug('[get-sandbox-files] Skipping large file:', { normalizedPath, size: content?.length });
          } else if (!readOk) {
            console.debug('[get-sandbox-files] Failed to read with all candidates:', { filePath, normalizedPath, candidates });
          }
        } catch (readError) {
          console.debug('[get-sandbox-files] Error reading file:', filePath, readError);
        }
      }

      const dirs = new Set<string>(['.']);
      for (const filePath of Object.keys(filesContent)) {
        const parts = filePath.split('/').filter(Boolean);
        let current = '';
        for (let i = 0; i < parts.length - 1; i += 1) {
          current = current ? `${current}/${parts[i]}` : parts[i];
          dirs.add(`./${current}`);
        }
      }
      const structure = Array.from(dirs).sort().slice(0, 50).join('\n');

      const fileManifest: FileManifest = {
        files: {},
        routes: [],
        componentTree: {},
        entryPoint: '',
        styleFiles: [],
        timestamp: Date.now(),
      };

      for (const [relativePath, content] of Object.entries(filesContent)) {
        const fullPath = `/${relativePath}`;
        const fileInfo: FileInfo = {
          content,
          type: 'utility',
          path: fullPath,
          relativePath,
          lastModified: Date.now(),
        };

        if (relativePath.match(/\.(jsx?|tsx?)$/)) {
          const parseResult = parseJavaScriptFile(content, fullPath);
          Object.assign(fileInfo, parseResult);

          if (
            relativePath === 'src/main.jsx' ||
            relativePath === 'src/main.tsx' ||
            relativePath === 'src/index.jsx' ||
            relativePath === 'src/index.tsx'
          ) {
            fileManifest.entryPoint = fullPath;
          }

          if (relativePath === 'src/App.jsx' || relativePath === 'src/App.tsx' || relativePath === 'App.jsx' || relativePath === 'App.tsx') {
            fileManifest.entryPoint = fileManifest.entryPoint || fullPath;
          }
        }

        if (relativePath.endsWith('.css')) {
          fileManifest.styleFiles.push(fullPath);
          fileInfo.type = 'style';
        }

        fileManifest.files[fullPath] = fileInfo;
      }

      fileManifest.componentTree = buildComponentTree(fileManifest.files);
      fileManifest.routes = extractRoutes(fileManifest.files);

      updateGlobalFileCache(filesContent, fileManifest, sandboxId);

      return NextResponse.json({
        success: true,
        files: filesContent,
        structure,
        fileCount: Object.keys(filesContent).length,
        manifest: fileManifest,
      });
    }

    if (!global.activeSandbox) {
      return NextResponse.json({
        success: false,
        error: 'No active sandbox'
      }, { status: 404 });
    }

    console.log('[get-sandbox-files] Fetching and analyzing file structure...');
    
    // Get list of all relevant files
    const findResult = await global.activeSandbox.runCommand({
      cmd: 'find',
      args: [
        '.',
        '-name', 'node_modules', '-prune', '-o',
        '-type', 'f',
        '-print'
      ]
    });
    
    if (findResult.exitCode !== 0) {
      throw new Error('Failed to list files');
    }
    
    const fileList = (await findResult.stdout()).split('\n').filter((f: string) => f.trim());
    console.log('[get-sandbox-files] Found', fileList.length, 'files');
    
    // Read content of each file (limit to reasonable sizes)
    const filesContent: Record<string, string> = {};
    
    for (const filePath of fileList) {
      try {
        // Check file size first
        const statResult = await global.activeSandbox.runCommand({
          cmd: 'stat',
          args: ['-f', '%z', filePath]
        });
        
        if (statResult.exitCode === 0) {
          const fileSize = parseInt(await statResult.stdout());
          
          // Keep file preview reasonably sized for the UI panel
          if (fileSize <= MAX_FILE_SIZE_BYTES) {
            const catResult = await global.activeSandbox.runCommand({
              cmd: 'cat',
              args: [filePath]
            });
            
            if (catResult.exitCode === 0) {
              const content = await catResult.stdout();
              // Remove leading './' from path
              const relativePath = filePath.replace(/^\.\//, '');
              filesContent[relativePath] = content;
            }
          }
        }
      } catch (parseError) {
        console.debug('Error parsing component info:', parseError);
        // Skip files that can't be read
        continue;
      }
    }
    
    // Get directory structure
    const treeResult = await global.activeSandbox.runCommand({
      cmd: 'find',
      args: ['.', '-type', 'd', '-not', '-path', '*/node_modules*', '-not', '-path', '*/.git*']
    });
    
    let structure = '';
    if (treeResult.exitCode === 0) {
      const dirs = (await treeResult.stdout()).split('\n').filter((d: string) => d.trim());
      structure = dirs.slice(0, 50).join('\n'); // Limit to 50 lines
    }
    
    // Build enhanced file manifest
    const fileManifest: FileManifest = {
      files: {},
      routes: [],
      componentTree: {},
      entryPoint: '',
      styleFiles: [],
      timestamp: Date.now(),
    };
    
    // Process each file
    for (const [relativePath, content] of Object.entries(filesContent)) {
      const fullPath = `/${relativePath}`;
      
      // Create base file info
      const fileInfo: FileInfo = {
        content: content,
        type: 'utility',
        path: fullPath,
        relativePath,
        lastModified: Date.now(),
      };
      
      // Parse JavaScript/JSX files
      if (relativePath.match(/\.(jsx?|tsx?)$/)) {
        const parseResult = parseJavaScriptFile(content, fullPath);
        Object.assign(fileInfo, parseResult);
        
        // Identify entry point
        if (relativePath === 'src/main.jsx' || relativePath === 'src/index.jsx') {
          fileManifest.entryPoint = fullPath;
        }
        
        // Identify App.jsx
        if (relativePath === 'src/App.jsx' || relativePath === 'App.jsx') {
          fileManifest.entryPoint = fileManifest.entryPoint || fullPath;
        }
      }
      
      // Track style files
      if (relativePath.endsWith('.css')) {
        fileManifest.styleFiles.push(fullPath);
        fileInfo.type = 'style';
      }
      
      fileManifest.files[fullPath] = fileInfo;
    }
    
    // Build component tree
    fileManifest.componentTree = buildComponentTree(fileManifest.files);
    
    // Extract routes (simplified - looks for Route components or page pattern)
    fileManifest.routes = extractRoutes(fileManifest.files);
    
    // Update global file cache with manifest
    updateGlobalFileCache(
      filesContent,
      fileManifest,
      global.sandboxState?.fileCache?.sandboxId || global.sandboxData?.sandboxId
    );

    return NextResponse.json({
      success: true,
      files: filesContent,
      structure,
      fileCount: Object.keys(filesContent).length,
      manifest: fileManifest,
    });

  } catch (error) {
    console.error('[get-sandbox-files] Error:', error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message
    }, { status: 500 });
  }
}

function extractRoutes(files: Record<string, FileInfo>): RouteInfo[] {
  const routes: RouteInfo[] = [];
  
  // Look for React Router usage
  for (const [path, fileInfo] of Object.entries(files)) {
    if (fileInfo.content.includes('<Route') || fileInfo.content.includes('createBrowserRouter')) {
      // Extract route definitions (simplified)
      const routeMatches = fileInfo.content.matchAll(/path=["']([^"']+)["'].*(?:element|component)={([^}]+)}/g);
      
      for (const match of routeMatches) {
        const [, routePath] = match;
        // componentRef available in match but not used currently
        routes.push({
          path: routePath,
          component: path,
        });
      }
    }
    
    // Check for Next.js style pages
    if (fileInfo.relativePath.startsWith('pages/') || fileInfo.relativePath.startsWith('src/pages/')) {
      const routePath = '/' + fileInfo.relativePath
        .replace(/^(src\/)?pages\//, '')
        .replace(/\.(jsx?|tsx?)$/, '')
        .replace(/index$/, '');
        
      routes.push({
        path: routePath,
        component: path,
      });
    }
  }
  
  return routes;
}