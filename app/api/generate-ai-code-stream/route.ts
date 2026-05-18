import { NextRequest, NextResponse } from 'next/server';
import { createGroq } from '@ai-sdk/groq';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { streamText } from 'ai';
import type { SandboxState } from '@/types/sandbox';
import { selectFilesForEdit, getFileContents, formatFilesForAI } from '@/lib/context-selector';
import { executeSearchPlan, formatSearchResultsForAI, selectTargetFile } from '@/lib/file-search-executor';
import { FileManifest } from '@/types/file-manifest';
import { canonicalProjectRelativePath, manifestFileKey } from '@/lib/sandbox-project-path';
import type { ConversationState, ConversationMessage, ConversationEdit } from '@/types/conversation';
import { appConfig } from '@/config/app.config';

// Force dynamic route to enable streaming
export const dynamic = 'force-dynamic';

// Check if we're using Vercel AI Gateway
const isUsingAIGateway = !!process.env.AI_GATEWAY_API_KEY;
const aiGatewayBaseURL = 'https://ai-gateway.vercel.sh/v1';

console.log('[generate-ai-code-stream] AI Gateway config:', {
  isUsingAIGateway,
  hasGroqKey: !!process.env.GROQ_API_KEY,
  hasAIGatewayKey: !!process.env.AI_GATEWAY_API_KEY
});

const groq = createGroq({
  apiKey: process.env.AI_GATEWAY_API_KEY ?? process.env.GROQ_API_KEY,
  baseURL: isUsingAIGateway ? aiGatewayBaseURL : undefined,
});

const anthropic = createAnthropic({
  apiKey: process.env.AI_GATEWAY_API_KEY ?? process.env.ANTHROPIC_API_KEY,
  baseURL: isUsingAIGateway ? aiGatewayBaseURL : (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com/v1'),
});

const googleGenerativeAI = createGoogleGenerativeAI({
  apiKey: process.env.AI_GATEWAY_API_KEY ?? process.env.GEMINI_API_KEY,
  baseURL: isUsingAIGateway ? aiGatewayBaseURL : undefined,
});

const openai = createOpenAI({
  apiKey: process.env.AI_GATEWAY_API_KEY ?? process.env.OPENAI_API_KEY,
  baseURL: isUsingAIGateway ? aiGatewayBaseURL : process.env.OPENAI_BASE_URL,
});

// Helper function to analyze user preferences from conversation history
function analyzeUserPreferences(messages: ConversationMessage[]): {
  commonPatterns: string[];
  preferredEditStyle: 'targeted' | 'comprehensive';
} {
  const userMessages = messages.filter(m => m.role === 'user');
  const patterns: string[] = [];
  
  // Count edit-related keywords
  let targetedEditCount = 0;
  let comprehensiveEditCount = 0;
  
  userMessages.forEach(msg => {
    const content = msg.content.toLowerCase();
    
    // Check for targeted edit patterns
    if (content.match(/\b(update|change|fix|modify|edit|remove|delete)\s+(\w+\s+)?(\w+)\b/)) {
      targetedEditCount++;
    }
    
    // Check for comprehensive edit patterns
    if (content.match(/\b(rebuild|recreate|redesign|overhaul|refactor)\b/)) {
      comprehensiveEditCount++;
    }
    
    // Extract common request patterns
    if (content.includes('hero')) patterns.push('hero section edits');
    if (content.includes('header')) patterns.push('header modifications');
    if (content.includes('color') || content.includes('style')) patterns.push('styling changes');
    if (content.includes('button')) patterns.push('button updates');
    if (content.includes('animation')) patterns.push('animation requests');
  });
  
  return {
    commonPatterns: [...new Set(patterns)].slice(0, 3), // Top 3 unique patterns
    preferredEditStyle: targetedEditCount > comprehensiveEditCount ? 'targeted' : 'comprehensive'
  };
}

/** Lightweight truncation / structural checks on LLM-generated XML-ish bundle */
function analyzeGenerationTruncation(generatedCode: string): string[] {
  const truncationWarnings: string[] = [];

  const fileOpenCount = (generatedCode.match(/<file path="/g) || []).length;
  const fileCloseCount = (generatedCode.match(/<\/file>/g) || []).length;
  if (fileOpenCount !== fileCloseCount) {
    truncationWarnings.push(`Unclosed file tags detected: ${fileOpenCount} open, ${fileCloseCount} closed`);
  }

  const truncationCheckRegex = /<file path="([^"]+)">([\s\S]*?)(?:<\/file>|$)/g;
  let truncationMatch;
  while ((truncationMatch = truncationCheckRegex.exec(generatedCode)) !== null) {
    const filePath = truncationMatch[1];
    const content = truncationMatch[2];

    if (content.trim().endsWith('<') || content.trim().endsWith('</')) {
      truncationWarnings.push(`File ${filePath} appears to have incomplete HTML tags`);
    }

    if (filePath.match(/\.(jsx?|tsx?)$/)) {
      const openBraces = (content.match(/{/g) || []).length;
      const closeBraces = (content.match(/}/g) || []).length;
      const braceDiff = Math.abs(openBraces - closeBraces);
      if (braceDiff > 3) {
        truncationWarnings.push(
          `File ${filePath} has severely unmatched braces (${openBraces} open, ${closeBraces} closed)`
        );
      }
      if (content.length < 20 && content.includes('function') && !content.includes('}')) {
        truncationWarnings.push(`File ${filePath} appears severely truncated`);
      }
    }
  }

  return truncationWarnings;
}

function collectTruncatedRepairTargets(generatedCode: string): string[] {
  const truncatedFiles: string[] = [];
  const fileRepairRegex = /<file path="([^"]+)">([\s\S]*?)(?:<\/file>|$)/g;
  let rm: RegExpExecArray | null;
  while ((rm = fileRepairRegex.exec(generatedCode)) !== null) {
    const filePath = rm[1];
    const content = rm[2];

    const hasEllipsis =
      content.includes('...') &&
      !content.includes('...rest') &&
      !content.includes('...props') &&
      !content.includes('spread');

    const endsAbruptly =
      content.trim().endsWith('...') || content.trim().endsWith(',') || content.trim().endsWith('(');

    const hasUnclosedTags =
      content.includes('</') && !content.match(/<\/[a-zA-Z0-9]+>/) && content.includes('<');

    const tooShort = content.length < 50 && !!filePath.match(/\.(jsx?|tsx?)$/);

    const openBraceCount = (content.match(/{/g) || []).length;
    const closeBraceCount = (content.match(/}/g) || []).length;
    const hasUnmatchedBraces = Math.abs(openBraceCount - closeBraceCount) > 1;

    const isTruncated =
      (hasEllipsis && endsAbruptly) ||
      hasUnclosedTags ||
      (tooShort && !content.includes('export')) ||
      hasUnmatchedBraces;

    if (isTruncated) {
      truncatedFiles.push(filePath);
    }
  }
  return [...new Set(truncatedFiles)];
}

declare global {
  var sandboxState: SandboxState;
  var conversationState: ConversationState | null;
  var activeSandbox: any;
  var activeSandboxProvider: any;
}

export async function POST(request: NextRequest) {
  try {
    const {
      prompt,
      model = appConfig.ai.defaultModel,
      context,
      isEdit = false,
      plan,
    } = await request.json();
    
    console.log('[generate-ai-code-stream] Received request:');
    console.log('[generate-ai-code-stream] - prompt:', prompt);
    console.log('[generate-ai-code-stream] - isEdit:', isEdit);
    console.log('[generate-ai-code-stream] - context.sandboxId:', context?.sandboxId);
    console.log('[generate-ai-code-stream] - context.currentFiles:', context?.currentFiles ? Object.keys(context.currentFiles) : 'none');
    console.log('[generate-ai-code-stream] - currentFiles count:', context?.currentFiles ? Object.keys(context.currentFiles).length : 0);
    
    // Initialize conversation state if not exists
    if (!global.conversationState) {
      global.conversationState = {
        conversationId: `conv-${Date.now()}`,
        startedAt: Date.now(),
        lastUpdated: Date.now(),
        context: {
          messages: [],
          edits: [],
          projectEvolution: { majorChanges: [] },
          userPreferences: {}
        }
      };
    }
    
    // Add user message to conversation history
    const userMessage: ConversationMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: prompt,
      timestamp: Date.now(),
      metadata: {
        sandboxId: context?.sandboxId
      }
    };
    global.conversationState.context.messages.push(userMessage);
    
    // Clean up old messages to prevent unbounded growth
    if (global.conversationState.context.messages.length > 20) {
      // Keep only the last 15 messages
      global.conversationState.context.messages = global.conversationState.context.messages.slice(-15);
      console.log('[generate-ai-code-stream] Trimmed conversation history to prevent context overflow');
    }
    
    // Clean up old edits
    if (global.conversationState.context.edits.length > 10) {
      global.conversationState.context.edits = global.conversationState.context.edits.slice(-8);
    }
    
    // Debug: Show a sample of actual file content
    if (context?.currentFiles && Object.keys(context.currentFiles).length > 0) {
      const firstFile = Object.entries(context.currentFiles)[0];
      console.log('[generate-ai-code-stream] - sample file:', firstFile[0]);
      console.log('[generate-ai-code-stream] - sample content preview:', 
        typeof firstFile[1] === 'string' ? firstFile[1].substring(0, 100) + '...' : 'not a string');
    }
    
    if (!prompt) {
      return NextResponse.json({ 
        success: false, 
        error: 'Prompt is required' 
      }, { status: 400 });
    }
    
    // Create a stream for real-time updates
    const encoder = new TextEncoder();
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();
    
    // Function to send progress updates with flushing
    const sendProgress = async (data: any) => {
      const message = `data: ${JSON.stringify(data)}\n\n`;
      try {
        await writer.write(encoder.encode(message));
        // Force flush by writing a keep-alive comment
        if (data.type === 'stream' || data.type === 'conversation') {
          await writer.write(encoder.encode(': keepalive\n\n'));
        }
      } catch (error) {
        console.error('[generate-ai-code-stream] Error writing to stream:', error);
      }
    };
    
    // Start processing in background
    (async () => {
      try {
        // Send initial status
        await sendProgress({ type: 'status', message: 'Initializing AI...' });
        
        // No keep-alive needed - sandbox provisioned for 10 minutes
        
        // Check if we have a file manifest for edit mode
        let editContext = null;
        let enhancedSystemPrompt = '';
        
        if (isEdit) {
          console.log('[generate-ai-code-stream] Edit mode detected - starting agentic search workflow');
          console.log('[generate-ai-code-stream] Has fileCache:', !!global.sandboxState?.fileCache);
          console.log('[generate-ai-code-stream] Has manifest:', !!global.sandboxState?.fileCache?.manifest);
          
          const manifest: FileManifest | undefined = global.sandboxState?.fileCache?.manifest;
          
          if (manifest) {
            await sendProgress({ type: 'status', message: '🔍 Creating search plan...' });
            
            const fileContents = global.sandboxState.fileCache?.files || {};
            console.log('[generate-ai-code-stream] Files available for search:', Object.keys(fileContents).length);
            
            // STEP 1: Get search plan from AI
            try {
              const intentResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/analyze-edit-intent`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt, manifest, model })
              });
              
              if (intentResponse.ok) {
                const { searchPlan } = await intentResponse.json();
                console.log('[generate-ai-code-stream] Search plan received:', searchPlan);
                
                await sendProgress({ 
                  type: 'status', 
                  message: `🔎 Searching for: "${searchPlan.searchTerms.join('", "')}"`
                });
                
                // STEP 2: Execute the search plan
                const searchExecution = executeSearchPlan(
                  searchPlan,
                  Object.fromEntries(
                    Object.entries(fileContents).map(([path, data]) => {
                      const body =
                        typeof data === 'string'
                          ? data
                          : ((data as { content?: string }).content ?? '');
                      return [manifestFileKey(path), body];
                    })
                  )
                );
                
                console.log('[generate-ai-code-stream] Search execution:', {
                  success: searchExecution.success,
                  resultsCount: searchExecution.results.length,
                  filesSearched: searchExecution.filesSearched,
                  time: searchExecution.executionTime + 'ms'
                });
                
                if (searchExecution.success && searchExecution.results.length > 0) {
                  // STEP 3: Select the best target file
                  const target = selectTargetFile(searchExecution.results, searchPlan.editType);
                  
                  if (target) {
                    await sendProgress({ 
                      type: 'status', 
                      message: `✅ Found code in ${target.filePath.split('/').pop()} at line ${target.lineNumber}`
                    });
                    
                    console.log('[generate-ai-code-stream] Target selected:', target);
                    
                    // Create surgical edit context with exact location
                    // normalizedPath would be: target.filePath.replace('/home/user/app/', '');
                    // fileContent available but not used in current implementation
                    // const fileContent = fileContents[normalizedPath]?.content || '';
                    
                    // Build enhanced context with search results
                    const mfKey = manifestFileKey(target.filePath);
                    const relPath = canonicalProjectRelativePath(target.filePath);

                    enhancedSystemPrompt = `
${formatSearchResultsForAI(searchExecution.results)}

SURGICAL EDIT INSTRUCTIONS:
You have been given the EXACT location of the code to edit.
- File (project-relative): ${relPath}
- Line: ${target.lineNumber}
- Reason: ${target.reason}

In your output include exactly ONE <file ...> block and set path exactly to "${relPath}" (already under src/public as needed — never nest src/src/... or use /home/user/ paths).

Make ONLY the change requested by the user. Do not modify any other code.
User request: "${prompt}"`;
                    
                    // Set up edit context with just this one file
                    editContext = {
                      primaryFiles: [mfKey],
                      contextFiles: [],
                      systemPrompt: enhancedSystemPrompt,
                      editIntent: {
                        type: searchPlan.editType,
                        description: searchPlan.reasoning,
                        targetFiles: [mfKey],
                        suggestedContext: [],
                        confidence: 0.95
                      }
                    };
                    
                    console.log('[generate-ai-code-stream] Surgical edit context created');
                  }
                } else {
                  // Search failed - fall back to old behavior but inform user
                  console.warn('[generate-ai-code-stream] Search found no results, falling back to broader context');
                  await sendProgress({ 
                    type: 'status', 
                    message: '⚠️ Could not find exact match, using broader search...'
                  });
                }
              } else {
                console.error('[generate-ai-code-stream] Failed to get search plan');
              }
            } catch (error) {
              console.error('[generate-ai-code-stream] Error in agentic search workflow:', error);
              await sendProgress({ 
                type: 'status', 
                message: '⚠️ Search workflow error, falling back to keyword method...'
              });
              // Fall back to old method on any error if we have a manifest
              if (manifest) {
                editContext = selectFilesForEdit(prompt, manifest);
              }
            }
          } else {
            // Fall back to old method if AI analysis fails
            console.warn('[generate-ai-code-stream] AI intent analysis failed, falling back to keyword method');
            if (manifest) {
              editContext = selectFilesForEdit(prompt, manifest);
            } else {
              console.log('[generate-ai-code-stream] No manifest available for fallback');
              await sendProgress({ 
                type: 'status', 
                message: '⚠️ No file manifest available, will use broad context'
              });
            }
          }
          
          // If we got an edit context from any method, use its system prompt
          if (editContext) {
            enhancedSystemPrompt = editContext.systemPrompt;
            
            await sendProgress({ 
              type: 'status', 
              message: `Identified edit type: ${editContext.editIntent?.description || 'Code modification'}`
            });
          } else if (!manifest) {
            console.log('[generate-ai-code-stream] WARNING: No manifest available for edit mode!');
            
            // Try to fetch files from sandbox if we have one
            if (global.activeSandbox) {
              await sendProgress({ type: 'status', message: 'Fetching current files from sandbox...' });
              
              try {
                // Fetch files directly from sandbox
                const filesResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/get-sandbox-files`, {
                  method: 'GET',
                  headers: { 'Content-Type': 'application/json' }
                });
                
                if (filesResponse.ok) {
                  const filesData = await filesResponse.json();
                  
                  if (filesData.success && filesData.manifest) {
                    console.log('[generate-ai-code-stream] Successfully fetched manifest from sandbox');
                    const manifest = filesData.manifest;
                    
                    // Now try to analyze edit intent with the fetched manifest
                    try {
                      const intentResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/analyze-edit-intent`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ prompt, manifest, model })
                      });
                      
                      if (intentResponse.ok) {
                        const { searchPlan } = await intentResponse.json();
                        console.log('[generate-ai-code-stream] Search plan received (after fetch):', searchPlan);
                        
                        // For now, fall back to keyword search since we don't have file contents for search execution
                        // This path happens when no manifest was initially available
                        let targetFiles: any[] = [];
                        if (!searchPlan || searchPlan.searchTerms.length === 0) {
                          console.warn('[generate-ai-code-stream] No target files after fetch, searching for relevant files');
                          
                          const promptLower = prompt.toLowerCase();
                          const allFilePaths = Object.keys(manifest.files);
                          
                          // Look for component names mentioned in the prompt
                          if (promptLower.includes('hero')) {
                            targetFiles = allFilePaths.filter(p => p.toLowerCase().includes('hero'));
                          } else if (promptLower.includes('header')) {
                            targetFiles = allFilePaths.filter(p => p.toLowerCase().includes('header'));
                          } else if (promptLower.includes('footer')) {
                            targetFiles = allFilePaths.filter(p => p.toLowerCase().includes('footer'));
                          } else if (promptLower.includes('nav')) {
                            targetFiles = allFilePaths.filter(p => p.toLowerCase().includes('nav'));
                          } else if (promptLower.includes('button')) {
                            targetFiles = allFilePaths.filter(p => p.toLowerCase().includes('button'));
                          }
                          
                          if (targetFiles.length > 0) {
                            console.log('[generate-ai-code-stream] Found target files by keyword search after fetch:', targetFiles);
                          }
                        }
                        
                        const allFiles = Object.keys(manifest.files)
                          .filter(path => !targetFiles.includes(path));
                        
                        editContext = {
                          primaryFiles: targetFiles,
                          contextFiles: allFiles,
                          systemPrompt: `
You are an expert senior software engineer performing a surgical, context-aware code modification. Your primary directive is **precision and preservation**.

Think of yourself as a surgeon making a precise incision, not a construction worker demolishing a wall.

## Search-Based Edit
Search Terms: ${searchPlan?.searchTerms?.join(', ') || 'keyword-based'}
Edit Type: ${searchPlan?.editType || 'UPDATE_COMPONENT'}
Reasoning: ${searchPlan?.reasoning || 'Modifying based on user request'}

Files to Edit: ${targetFiles.join(', ') || 'To be determined'}
User Request: "${prompt}"

## Your Mandatory Thought Process (Execute Internally):
Before writing ANY code, you MUST follow these steps:

1. **Understand Intent:**
   - What is the user's core goal? (adding feature, fixing bug, changing style?)
   - Does the conversation history provide extra clues?

2. **Locate the Code:**
   - First examine the Primary Files provided
   - Check the "ALL PROJECT FILES" list to find the EXACT file name
   - "nav" might be Navigation.tsx, NavBar.tsx, Nav.tsx, or Header.tsx
   - DO NOT create a new file if a similar one exists!

3. **Plan the Changes (Mental Diff):**
   - What is the *minimal* set of changes required?
   - Which exact lines need to be added, modified, or deleted?
   - Will this require new packages?

4. **Verify Preservation:**
   - What existing code, props, state, and logic must NOT be touched?
   - How can I make my change without disrupting surrounding code?

5. **Construct the Final Code:**
   - Only after completing steps above, generate the final code
   - Provide the ENTIRE file content with modifications integrated

## Critical Rules & Constraints:

**PRESERVATION IS KEY:** You MUST NOT rewrite entire components or files. Integrate your changes into the existing code. Preserve all existing logic, props, state, and comments not directly related to the user's request.

**MINIMALISM:** Only output files you have actually changed. If a file doesn't need modification, don't include it.

**COMPLETENESS:** Each file must be COMPLETE from first line to last:
- NEVER TRUNCATE - Include EVERY line
- NO ellipsis (...) to skip content
- ALL imports, functions, JSX, and closing tags must be present
- The file MUST be runnable

**SURGICAL PRECISION:**
- Change ONLY what's explicitly requested
- If user says "change background to green", change ONLY the background class
- 99% of the original code should remain untouched
- NO refactoring, reformatting, or "improvements" unless requested

**NO CONVERSATION:** Your output must contain ONLY the code. No explanations or apologies.

## EXAMPLES:

### CORRECT APPROACH for "change hero background to blue":
<thinking>
I need to change the background color of the Hero component. Looking at the file, I see the main div has 'bg-gray-900'. I will change ONLY this to 'bg-blue-500' and leave everything else exactly as is.
</thinking>

Then return the EXACT same file with only 'bg-gray-900' changed to 'bg-blue-500'.

### WRONG APPROACH (DO NOT DO THIS):
- Rewriting the Hero component from scratch
- Changing the structure or reorganizing imports
- Adding or removing unrelated code
- Reformatting or "cleaning up" the code

Remember: You are a SURGEON making a precise incision, not an artist repainting the canvas!`,
                          editIntent: {
                            type: searchPlan?.editType || 'UPDATE_COMPONENT',
                            targetFiles: targetFiles,
                            confidence: searchPlan ? 0.85 : 0.6,
                            description: searchPlan?.reasoning || 'Keyword-based file selection',
                            suggestedContext: []
                          }
                        };
                        
                        enhancedSystemPrompt = editContext.systemPrompt;
                        
                        await sendProgress({ 
                          type: 'status', 
                          message: `Identified edit type: ${editContext.editIntent.description}`
                        });
                      }
                    } catch (error) {
                      console.error('[generate-ai-code-stream] Error analyzing intent after fetch:', error);
                    }
                  } else {
                    console.error('[generate-ai-code-stream] Failed to get manifest from sandbox files');
                  }
                } else {
                  console.error('[generate-ai-code-stream] Failed to fetch sandbox files:', filesResponse.status);
                }
              } catch (error) {
                console.error('[generate-ai-code-stream] Error fetching sandbox files:', error);
                await sendProgress({ 
                  type: 'warning', 
                  message: 'Could not analyze existing files for targeted edits. Proceeding with general edit mode.'
                });
              }
            } else {
              console.log('[generate-ai-code-stream] No active sandbox to fetch files from');
              await sendProgress({ 
                type: 'warning', 
                message: 'No existing files found. Consider generating initial code first.'
              });
            }
          }
        }
        
        // Build conversation context for system prompt
        let conversationContext = '';
        if (global.conversationState && global.conversationState.context.messages.length > 1) {
          console.log('[generate-ai-code-stream] Building conversation context');
          console.log('[generate-ai-code-stream] Total messages:', global.conversationState.context.messages.length);
          console.log('[generate-ai-code-stream] Total edits:', global.conversationState.context.edits.length);
          
          conversationContext = `\n\n## Conversation History (Recent)\n`;
          
          // Include only the last 3 edits to save context
          const recentEdits = global.conversationState.context.edits.slice(-3);
          if (recentEdits.length > 0) {
            console.log('[generate-ai-code-stream] Including', recentEdits.length, 'recent edits in context');
            conversationContext += `\n### Recent Edits:\n`;
            recentEdits.forEach(edit => {
              conversationContext += `- "${edit.userRequest}" → ${edit.editType} (${edit.targetFiles.map(f => f.split('/').pop()).join(', ')})\n`;
            });
          }
          
          // Include recently created files - CRITICAL for preventing duplicates
          const recentMsgs = global.conversationState.context.messages.slice(-5);
          const recentlyCreatedFiles: string[] = [];
          recentMsgs.forEach(msg => {
            if (msg.metadata?.editedFiles) {
              recentlyCreatedFiles.push(...msg.metadata.editedFiles);
            }
          });
          
          if (recentlyCreatedFiles.length > 0) {
            const uniqueFiles = [...new Set(recentlyCreatedFiles)];
            conversationContext += `\n### 🚨 RECENTLY CREATED/EDITED FILES (DO NOT RECREATE THESE):\n`;
            uniqueFiles.forEach(file => {
              conversationContext += `- ${file}\n`;
            });
            conversationContext += `\nIf the user mentions any of these components, UPDATE the existing file!\n`;
          }
          
          // Include only last 5 messages for context (reduced from 10)
          const recentMessages = recentMsgs;
          if (recentMessages.length > 2) { // More than just current message
            conversationContext += `\n### Recent Messages:\n`;
            recentMessages.slice(0, -1).forEach(msg => { // Exclude current message
              if (msg.role === 'user') {
                const truncatedContent = msg.content.length > 100 ? msg.content.substring(0, 100) + '...' : msg.content;
                conversationContext += `- "${truncatedContent}"\n`;
              }
            });
          }
          
          // Include only last 2 major changes
          const majorChanges = global.conversationState.context.projectEvolution.majorChanges.slice(-2);
          if (majorChanges.length > 0) {
            conversationContext += `\n### Recent Changes:\n`;
            majorChanges.forEach(change => {
              conversationContext += `- ${change.description}\n`;
            });
          }
          
          // Keep user preferences - they're concise
          const userPrefs = analyzeUserPreferences(global.conversationState.context.messages);
          if (userPrefs.commonPatterns.length > 0) {
            conversationContext += `\n### User Preferences:\n`;
            conversationContext += `- Edit style: ${userPrefs.preferredEditStyle}\n`;
          }
          
          // Limit total conversation context length
          if (conversationContext.length > 2000) {
            conversationContext = conversationContext.substring(0, 2000) + '\n[Context truncated to prevent length errors]';
          }
        }
        
        const planPayload = plan && typeof plan === 'object' ? plan : null;
        const planBlock = planPayload
          ? `

### Router plan (follow this scope; do not expand with unrelated redesigns)
**Title:** ${String(planPayload.title ?? '')}
**Summary:** ${String(planPayload.summary ?? '')}
**Steps:**
${Array.isArray(planPayload.steps) ? planPayload.steps.map((s: string, i: number) => `${i + 1}. ${s}`).join('\n') : ''}
**Files to touch (hints):** ${Array.isArray(planPayload.filesToTouch) ? planPayload.filesToTouch.join(', ') : ''}
**Initial greenfield build:** ${planPayload.isInitialBuild ? 'yes' : 'no'}
`
          : '';

        // Build system prompt with conversation awareness
        let systemPrompt = `You are an expert React + TypeScript developer with perfect memory of the conversation. You maintain context across messages: user briefs, any reference snippets in context, generated components, and applied code. Generate clean, modern React code for Vite applications (greenfield from descriptions; treat clone/scrape payloads as optional reference material, not mandatory pixel-perfect copies).

SANDBOX RUNTIME: New developer sandboxes are provisioned as **Vite + React + TypeScript** (Minu \`react-ts\`). That is the **stock Vite react-ts starter** — it does **not** ship with Tailwind or PostCSS pre-wired. You should still style with **Tailwind utility classes in JSX**, but only **after** a working Tailwind setup exists in the project.
- **If context shows no real Tailwind setup** (no \`tailwind.config.*\`, no \`postcss.config.*\`, or \`src/index.css\` lacks \`@tailwind\` directives), you MUST output a standard **Tailwind v3 + PostCSS + autoprefixer** stack in the **same response** as your UI:
  1. **package.json** — merge \`devDependencies\`: \`tailwindcss\`, \`postcss\`, \`autoprefixer\`; preserve every existing dependency/script from context; never replace the file with an empty stub.
  2. **postcss.config.js** (or \`.mjs\` / \`.cjs\` to match \`"type"\` in package.json) — \`tailwindcss\` + \`autoprefixer\` plugins.
  3. **tailwind.config.js** (or \`.ts\`/\`.cjs\` consistent with the repo) — \`content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"]\`.
  4. **src/index.css** — \`@tailwind base;\` \`@tailwind components;\` \`@tailwind utilities;\`
  5. **src/main.tsx** (or entry in context) — ensure \`import './index.css'\` is present.
- **If context already shows those files configured**, do **not** re-scaffold or duplicate; only change what the user asked for.
- Do not assume shell commands ran — emit file contents only; missing npm packages are resolved from \`package.json\`/imports when applied.
Typical entry is \`src/main.tsx\` and shell is \`src/App.tsx\`. Prefer **\`.tsx\` / \`.ts\`** for new components. If context shows \`.jsx\`/\`.js\` for a path, keep that extension. Never assume vanilla (non-React) Vite — React+TS-first.
${conversationContext}
${planBlock}

🚨 CRITICAL RULES - YOUR MOST IMPORTANT INSTRUCTIONS:
1. **DO EXACTLY WHAT IS ASKED - NOTHING MORE, NOTHING LESS**
   - Don't add features not requested
   - Don't fix unrelated issues
   - Don't improve things not mentioned
2. **CHECK THE APP ENTRY FIRST** (normally \`src/App.tsx\` in fresh sandboxes) — see imports and components that already exist before creating new ones (\`App.jsx\` only if that is what appears in context)
3. **NAVIGATION LIVES IN THE HEADER COMPONENT** — use \`Header.tsx\` / \`Header.jsx\` as in context; don't create \`Nav.tsx\`/\`Nav.jsx\` if Header already contains nav
4. **USE STANDARD TAILWIND CLASSES ONLY**:
   - ✅ CORRECT: bg-white, text-black, bg-blue-500, bg-gray-100, text-gray-900
   - ❌ WRONG: bg-background, text-foreground, bg-primary, bg-muted, text-secondary
   - Use ONLY classes from the official Tailwind CSS documentation
5. **FILE COUNT LIMITS**:
   - Simple style/text change = 1 file ONLY
   - New component = 2 files MAX (component + parent)
   - **Exception:** Bootstrapping Tailwind on bare \`react-ts\` (package.json merge + postcss + tailwind config + index.css + main import) counts as required setup — not “too many files” if Tailwind was missing from context.
   - If >3 files **and** you're not doing that Tailwind bootstrap, YOU'RE DOING TOO MUCH
6. **DO NOT CREATE SVGs FROM SCRATCH**:
   - NEVER generate custom SVG code unless explicitly asked
   - Use existing icon libraries (lucide-react, heroicons, etc.)
   - Or use placeholder elements/text if icons are not critical
   - Only create custom SVGs when user specifically requests "create an SVG" or "draw an SVG"

COMPONENT RELATIONSHIPS (CHECK THESE FIRST):
- Navigation usually lives INSIDE Header.tsx/Header.jsx (match context), not a separate Nav file
- Logo is typically in Header, not standalone
- Footer often contains nav links already
- Menu/Hamburger is part of Header, not separate

PACKAGE USAGE RULES:
- DO NOT use react-router-dom unless user explicitly asks for routing
- For simple nav links in a single-page app, use scroll-to-section or href="#"
- Only add routing if building a multi-page application
- Common packages are auto-installed from your imports

DEFAULT LANDING SITE STRUCTURE (from a written brief OR reference pages in context — implement what matches the product, not unrelated boilerplate):
For a typical marketing/site build, include when appropriate (use \`.tsx\` in new sandboxes unless context shows \`.jsx\`):
1. **Header with Navigation** - Usually Header.tsx containing nav
2. **Hero Section** - Hero.tsx
3. **Main Content Sections** - Features, Services, About, etc.
4. **Footer** - Contact info, links, copyright (Footer.tsx)
5. **App.tsx** - Main app component that imports and wires sections

${isEdit ? `CRITICAL: THIS IS AN EDIT TO AN EXISTING APPLICATION

YOU MUST FOLLOW THESE EDIT RULES:
0. Do NOT recreate \`vite.config.*\`, \`tailwind.config.*\`, \`postcss.config.*\`, or re-write \`package.json\` **when those files already appear in context with real content**. If Tailwind/PostCSS is **missing** but styled UI needs Tailwind, add the standard setup files (see SANDBOX RUNTIME) in this response—\`react-ts\` does not include them by default.
1. DO NOT regenerate the entire application
2. DO NOT create files that already exist (like App.jsx, index.css) unless you are **replacing** empty/stub content or adding the Tailwind stack per SANDBOX RUNTIME
3. ONLY edit the EXACT files needed for the requested change - NO MORE, NO LESS
4. If the user says "update the header", ONLY edit the Header component - DO NOT touch Footer, Hero, or any other components
5. If the user says "change the color", ONLY edit the relevant style or component file - DO NOT "improve" other parts
6. If you're unsure which file to edit, choose the SINGLE most specific one related to the request
7. IMPORTANT: When adding new components or libraries:
   - Create the new component file
   - UPDATE ONLY the parent component that will use it
   - Example: Adding a Newsletter component means:
     * Create Newsletter.jsx
     * Update ONLY the file that will use it (e.g., Footer.jsx OR App.jsx) - NOT both
8. When adding npm packages:
   - Import them ONLY in the files where they're actually used
   - The system will auto-install missing packages

CRITICAL FILE MODIFICATION RULES - VIOLATION = FAILURE:
- **NEVER TRUNCATE FILES** - Always return COMPLETE files with ALL content
- **NO ELLIPSIS (...)** - Include every single line of code, no skipping
- Files MUST be complete and runnable - include ALL imports, functions, JSX, and closing tags
- Count the files you're about to generate
- If the user asked to change ONE thing, you should generate ONE file (or at most two if adding a new component)
- DO NOT "fix" or "improve" files that weren't mentioned in the request
- DO NOT update multiple components when only one was requested
- DO NOT add features the user didn't ask for
- RESIST the urge to be "helpful" by updating related files

CRITICAL: DO NOT REDESIGN OR REIMAGINE COMPONENTS
- "update" means make a small change, NOT redesign the entire component
- "change X to Y" means ONLY change X to Y, nothing else
- "fix" means repair what's broken, NOT rewrite everything
- "remove X" means delete X from the existing file, NOT create a new file
- "delete X" means remove X from where it currently exists
- Preserve ALL existing functionality and design unless explicitly asked to change it

NEVER CREATE NEW FILES WHEN THE USER ASKS TO REMOVE/DELETE SOMETHING
If the user says "remove X", you must:
1. Find which existing file contains X
2. Edit that file to remove X
3. DO NOT create any new files

${editContext ? `
TARGETED EDIT MODE ACTIVE
- Edit Type: ${editContext.editIntent.type}
- Confidence: ${editContext.editIntent.confidence}
- Files to Edit: ${editContext.primaryFiles.join(', ')}

🚨 CRITICAL RULE - VIOLATION WILL RESULT IN FAILURE 🚨
YOU MUST ***ONLY*** GENERATE THE FILES LISTED ABOVE!

ABSOLUTE REQUIREMENTS:
1. COUNT the files in "Files to Edit" - that's EXACTLY how many files you must generate
2. If "Files to Edit" shows ONE file, generate ONLY that ONE file
3. DO NOT generate App.jsx unless it's EXPLICITLY listed in "Files to Edit"
4. DO NOT generate ANY components that aren't listed in "Files to Edit"
5. DO NOT "helpfully" update related files
6. DO NOT fix unrelated issues you notice
7. DO NOT improve code quality in files not being edited
8. DO NOT add bonus features

EXAMPLE VIOLATIONS (THESE ARE FAILURES):
❌ User says "update the hero" → You update Hero, Header, Footer, and App.jsx
❌ User says "change header color" → You redesign the entire header
❌ User says "fix the button" → You update multiple components
❌ Files to Edit shows "Hero.jsx" → You also generate App.jsx "to integrate it"
❌ Files to Edit shows "Header.jsx" → You also update Footer.jsx "for consistency"

CORRECT BEHAVIOR (THIS IS SUCCESS):
✅ User says "update the hero" → You ONLY edit Hero.jsx with the requested change
✅ User says "change header color" → You ONLY change the color in Header.jsx
✅ User says "fix the button" → You ONLY fix the specific button issue
✅ Files to Edit shows "Hero.jsx" → You generate ONLY Hero.jsx
✅ Files to Edit shows "Header.jsx, Nav.jsx" → You generate EXACTLY 2 files: Header.jsx and Nav.jsx

THE AI INTENT ANALYZER HAS ALREADY DETERMINED THE FILES.
DO NOT SECOND-GUESS IT.
DO NOT ADD MORE FILES.
ONLY OUTPUT THE EXACT FILES LISTED IN "Files to Edit".

FILE PATH RULE: In each <file path="..."> tag use exactly the paths listed above (typically /src/...), or the same path without the leading slash. Never nest repeated src/ segments (src/src/...). Do NOT nest or prefix with /home/user/app or other container paths.
` : ''}

VIOLATION OF THESE RULES WILL RESULT IN FAILURE!
` : ''}

CRITICAL INCREMENTAL UPDATE RULES:
- When the user asks for additions or modifications (like "add a videos page", "create a new component", "update the header"):
  - DO NOT regenerate the entire application
  - DO NOT recreate files that already exist unless explicitly asked
  - ONLY create/modify the specific files needed for the requested change
  - Preserve all existing functionality and files
  - If adding a new page/route, integrate it with the existing routing system
  - Reference existing components and styles rather than duplicating them
  - NEVER recreate config files that already exist in context (tailwind.config.js, vite.config.js, package.json, etc.) — but you MAY add Tailwind/PostCSS/package.json updates when context shows they are missing (see SANDBOX RUNTIME)

IMPORTANT: When the user asks for edits or modifications:
- You have access to the current file contents in the context
- Make targeted changes to existing files rather than regenerating everything
- Preserve the existing structure and only modify what's requested
- If you need to see a specific file that's not in context, mention it

IMPORTANT: You have access to the full conversation context including:
- The user's stated goals and brief (priority)
- Any saved reference pages/markdown in context (legacy paths may still supply this)
- Components already generated and applied
- The current project being worked on
- Recent conversation history
- Any Vite errors that need to be resolved

When the user references "the app", "the website", or "the site" without specifics, refer to:
1. The user's latest brief / product description
2. The current project name in the context
3. The files currently in the sandbox
4. Any reference URLs or pasted content only as supporting detail

Reference pages in context are inspiration or copy source — still ship a coherent NEW app aligned to the brief.

CRITICAL UI/UX RULES:
- NEVER use emojis in any code, text, console logs, or UI elements
- ALWAYS ensure responsive design using proper Tailwind classes (sm:, md:, lg:, xl:)
- ALWAYS use proper mobile-first responsive design patterns
- NEVER hardcode pixel widths - use relative units and responsive classes
- ALWAYS test that the layout works on mobile devices (320px and up)
- ALWAYS make sections full-width by default - avoid max-w-7xl or similar constraints
- For full-width layouts: use className="w-full" or no width constraint at all
- Only add max-width constraints when explicitly needed for readability (like blog posts)
- Prefer system fonts and clean typography
- Ensure all interactive elements have proper hover/focus states
- Use proper semantic HTML elements for accessibility

CRITICAL STYLING RULES - MUST FOLLOW:
- NEVER use inline styles with style={{ }} in JSX
- NEVER use <style jsx> tags or any CSS-in-JS solutions
- NEVER create App.css, Component.css, or any component-specific CSS files
- NEVER import './App.css' or any CSS files except index.css
- ALWAYS use Tailwind CSS classes for ALL styling
- ONLY create src/index.css with the @tailwind directives
- The ONLY CSS file should be src/index.css with:
  @tailwind base;
  @tailwind components;
  @tailwind utilities;
- Use Tailwind's full utility set: spacing, colors, typography, flexbox, grid, animations, etc.
- ALWAYS add smooth transitions and animations where appropriate:
  - Use transition-all, transition-colors, transition-opacity for hover states
  - Use animate-fade-in, animate-pulse, animate-bounce for engaging UI elements
  - Add hover:scale-105 or hover:scale-110 for interactive elements
  - Use transform and transition utilities for smooth interactions
- For complex layouts, combine Tailwind utilities rather than writing custom CSS
- NEVER use non-standard Tailwind classes like "border-border", "bg-background", "text-foreground", etc.
- Use standard Tailwind classes only:
  - For borders: use "border-gray-200", "border-gray-300", etc. NOT "border-border"
  - For backgrounds: use "bg-white", "bg-gray-100", etc. NOT "bg-background"
  - For text: use "text-gray-900", "text-black", etc. NOT "text-foreground"
- Examples of good Tailwind usage:
  - Buttons: className="px-4 py-2 bg-blue-600 text-white rounded-lg shadow-md hover:bg-blue-700 hover:shadow-lg transform hover:scale-105 transition-all duration-200"
  - Cards: className="bg-white rounded-lg shadow-md p-6 border border-gray-200 hover:shadow-xl transition-shadow duration-300"
  - Full-width sections: className="w-full px-4 sm:px-6 lg:px-8"
  - Constrained content (only when needed): className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8"
  - Dark backgrounds: className="min-h-screen bg-gray-900 text-white"
  - Hero sections: className="animate-fade-in-up"
  - Feature cards: className="transform hover:scale-105 transition-transform duration-300"
  - CTAs: className="animate-pulse hover:animate-none"

CRITICAL STRING AND SYNTAX RULES:
- ALWAYS escape apostrophes in strings: use \' instead of ' or use double quotes
- ALWAYS escape quotes properly in JSX attributes
- NEVER use curly quotes or smart quotes ('' "" '' "") - only straight quotes (' ")
- ALWAYS convert smart/curly quotes to straight quotes:
  - ' and ' → '
  - " and " → "
  - Any other Unicode quotes → straight quotes
- When strings contain apostrophes, either:
  1. Use double quotes: "you're" instead of 'you're'
  2. Escape the apostrophe: 'you\'re'
- When working with pasted or externally supplied text (including scraped HTML/text), ALWAYS sanitize quotes first
- Replace all smart quotes with straight quotes before using in code
- Be extra careful with user-generated content or pasted text
- Always validate that JSX syntax is correct before generating

CRITICAL CODE SNIPPET DISPLAY RULES:
- When displaying code examples in JSX, NEVER put raw curly braces { } in text
- ALWAYS wrap code snippets in template literals with backticks
- For code examples in components, use one of these patterns:
  1. Template literals: <div>{\`const example = { key: 'value' }\`}</div>
  2. Pre/code blocks: <pre><code>{\`your code here\`}</code></pre>
  3. Escape braces: <div>{'{'}key: value{'}'}</div>
- NEVER do this: <div>const example = { key: 'value' }</div> (causes parse errors)
- For multi-line code snippets, always use:
  <pre className="bg-gray-900 text-gray-100 p-4 rounded">
    <code>{\`
      // Your code here
      const example = {
        key: 'value'
      }
    \`}</code>
  </pre>

CRITICAL: When asked to create a React app or components:
- ALWAYS CREATE ALL FILES IN FULL - never provide partial implementations
- ALWAYS CREATE EVERY COMPONENT that you import - no placeholders
- ALWAYS IMPLEMENT COMPLETE FUNCTIONALITY - don't leave TODOs unless explicitly asked
- If the brief describes a multi-section site or product, implement the sections it calls for completely
- When Tailwind is **missing** from context, CREATE/UPDATE tailwind + postcss configs + package.json + \`src/index.css\` per SANDBOX RUNTIME; when already present, do not churn them
- When the brief implies a multi-section page, include navigation (prefer Nav.tsx / Header.tsx in TS sandboxes; match context).

COMMON COMPONENTS for brief-driven apps (adapt to scope — omit what the brief doesn't need; prefer \`.tsx\` in react-ts sandbox):
1. Nav.tsx / Header.tsx (or \`.jsx\` if context shows that) — navigation when the product is a multi-section page
2. Hero.tsx — main landing focal area when relevant
3. Features/Services/Products sections — driven by the brief
4. Footer.tsx — footer when it fits the brief
5. App.tsx — main component that wires sections together when needed
- Do not emit a **from-scratch** \`vite.config.*\` if context already has one — only patch if required
- Do not replace \`package.json\` wholesale — always **merge** dependencies/scripts with what context shows

WHEN WORKING WITH PASTED / SUPPLIED TEXT (scraped or markdown):
- ALWAYS sanitize all text content before using in code
- Convert ALL smart quotes to straight quotes
- Example transformations:
  - "Vendor's API" → escape apostrophes in JSX strings appropriately
  - 'It's amazing' → "It's amazing" or 'It\\'s amazing'
  - "Best tool ever" → "Best tool ever"
- When in doubt, use double quotes for strings containing apostrophes
- For testimonials or quotes taken from pasted text, ALWAYS clean the text:
  - Bad: content: 'Moved our internal agent's web scraping...'
  - Good: content: "Moved our internal agent's web scraping..."
  - Also good: content: 'Moved our internal agent\\'s web scraping...'

When generating code, FOLLOW THIS PROCESS:
1. If Tailwind is missing from context: emit **package.json** (merge), **postcss** + **tailwind** configs, then **src/index.css** — see SANDBOX RUNTIME
2. List ALL components you plan to import in App.tsx (or App.jsx if that is the app shell in context)
3. Count them - if there are 10 imports, you MUST create 10 component files
4. Generate src/index.css early (with @tailwind directives once setup exists)
5. Generate App.tsx second (sandbox default shell)
6. Then generate EVERY SINGLE component file you imported
7. Do NOT stop until all imports are satisfied

Use this XML format for React components (include Tailwind/PostCSS/package.json files when setup is missing — see SANDBOX RUNTIME):

<file path="src/index.css">
@tailwind base;
@tailwind components;
@tailwind utilities;
</file>

<file path="src/App.tsx">
// Main App component that imports and uses other components (TypeScript)
// Use Tailwind classes: className="min-h-screen bg-gray-50"
</file>

<file path="src/components/Example.tsx">
// Your React component code here
// Use Tailwind classes for ALL styling
</file>

CRITICAL COMPLETION RULES:
1. NEVER say "I'll continue with the remaining components"
2. NEVER say "Would you like me to proceed?"
3. NEVER use <continue> tags
4. Generate ALL components in ONE response
5. If App.tsx imports 10 components, generate ALL 10
6. Complete EVERYTHING before ending your response

With 16,000 tokens available, you have plenty of space to generate a complete application. Use it!

UNDERSTANDING USER INTENT FOR INCREMENTAL VS FULL GENERATION:
- "add/create/make a [specific feature]" → Add ONLY that feature to existing app
- "add a videos page" → Create ONLY Videos.tsx (or Videos.jsx matching context) and update routing if needed
- "update the header" → Modify ONLY header component
- "fix the styling" → Update ONLY the affected components
- "change X to Y" → Find the file containing X and modify it
- "make the header black" → Find Header component and change its color
- "rebuild/recreate/start over" → Full regeneration
- Default to incremental updates when working on an existing app

SURGICAL EDIT RULES (CRITICAL FOR PERFORMANCE):
- **PREFER TARGETED CHANGES**: Don't regenerate entire components for small edits
- For color/style changes: Edit ONLY the specific className or style prop
- For text changes: Change ONLY the text content, keep everything else
- For adding elements: INSERT into existing JSX, don't rewrite the whole return
- **PRESERVE EXISTING CODE**: Keep all imports, functions, and unrelated code exactly as-is
- Maximum files to edit:
  - Style change = 1 file ONLY
  - Text change = 1 file ONLY
  - New feature = 2 files MAX (feature + parent)
- If you're editing >3 files for a simple request, STOP - you're doing too much

EXAMPLES OF CORRECT SURGICAL EDITS:
✅ "change header to black" → Find className="..." in Header.tsx/jsx from context, change ONLY color classes
✅ "update hero text" → Find the <h1> or <p> in Hero.tsx/jsx, change ONLY the text inside
✅ "add a button to hero" → Find the return statement, ADD button, keep everything else
❌ WRONG: Regenerating entire Header.tsx to change one color
❌ WRONG: Rewriting Hero.tsx to add one button

NAVIGATION/HEADER INTELLIGENCE:
- ALWAYS check App.tsx/App.jsx imports first (TS sandboxes → App.tsx)
- Navigation is usually INSIDE Header.tsx/Header.jsx, not separate
- If user says "nav", check Header FIRST
- Only create Nav.tsx/Nav.jsx if no navigation exists anywhere
- Logo, menu, hamburger = all typically in Header

CRITICAL: When files are provided in the context:
1. The user is asking you to MODIFY the existing app, not create a new one
2. Find the relevant file(s) from the provided context
3. Generate ONLY the files that need changes
4. Do NOT ask to see files - they are already provided in the context above
5. Make the requested change immediately`;

        // Build full prompt with context
        let fullPrompt = prompt;
        if (context) {
          const contextParts = [];
          
          if (context.sandboxId) {
            contextParts.push(`Current sandbox ID: ${context.sandboxId}`);
          }

          if (Array.isArray(context.previewConsoleErrors) && context.previewConsoleErrors.length > 0) {
            const lines = context.previewConsoleErrors.slice(-25).map(
              (
                err: {
                  kind?: string;
                  message?: string;
                  filename?: string;
                  lineno?: number;
                  stack?: string;
                },
                i: number
              ) => {
                const loc =
                  err.filename != null ? ` (${err.filename}${err.lineno != null ? `:${err.lineno}` : ''})` : '';
                const stk = err.stack ? `\n   stack: ${String(err.stack).slice(0, 800)}` : '';
                return `  ${i + 1}. [${String(err.kind || 'error').replace(/\n/g, ' ')}] ${String(err.message || '').slice(0, 500)}${loc}${stk}`;
              }
            );
            contextParts.push(
              `\nPREVIEW WEB ERRORS (browser console/runtime only — logs and console.log are excluded):\n${lines.join('\n')}`
            );
          }

          if (context.structure) {
            contextParts.push(`Current file structure:\n${context.structure}`);
          }
          
          // Use backend file cache instead of frontend-provided files
          let backendFiles = global.sandboxState?.fileCache?.files || {};
          let hasBackendFiles = Object.keys(backendFiles).length > 0;
          
          console.log('[generate-ai-code-stream] Backend file cache status:');
          console.log('[generate-ai-code-stream] - Has sandboxState:', !!global.sandboxState);
          console.log('[generate-ai-code-stream] - Has fileCache:', !!global.sandboxState?.fileCache);
          console.log('[generate-ai-code-stream] - File count:', Object.keys(backendFiles).length);
          console.log('[generate-ai-code-stream] - Has manifest:', !!global.sandboxState?.fileCache?.manifest);
          
          // If no backend files and we're in edit mode, try to fetch from sandbox
          if (!hasBackendFiles && (global.activeSandboxProvider || global.activeSandbox || context?.sandboxId)) {
            console.log('[generate-ai-code-stream] No backend files, attempting to fetch from sandbox...');
            
            try {
              const filesResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/get-sandbox-files`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
              });
              
              if (filesResponse.ok) {
                const filesData = await filesResponse.json();
                if (filesData.success && filesData.files) {
                  console.log('[generate-ai-code-stream] Successfully fetched', Object.keys(filesData.files).length, 'files from sandbox');
                  
                  // Initialize sandboxState if needed
                  if (!global.sandboxState) {
                    global.sandboxState = {
                      fileCache: {
                        files: {},
                        lastSync: Date.now(),
                        sandboxId: context?.sandboxId || 'unknown'
                      }
                    } as any;
                  } else if (!global.sandboxState.fileCache) {
                    global.sandboxState.fileCache = {
                      files: {},
                      lastSync: Date.now(),
                      sandboxId: context?.sandboxId || 'unknown'
                    };
                  }
                  
                  // Store files in cache
                  for (const [path, content] of Object.entries(filesData.files)) {
                    const normalizedPath = canonicalProjectRelativePath(path);
                    if (global.sandboxState.fileCache) {
                      global.sandboxState.fileCache.files[normalizedPath] = {
                        content: content as string,
                        lastModified: Date.now()
                      };
                    }
                  }
                  
                  if (filesData.manifest && global.sandboxState.fileCache) {
                    global.sandboxState.fileCache.manifest = filesData.manifest;
                    
                    // Now try to analyze edit intent with the fetched manifest
                    if (!editContext) {
                      console.log('[generate-ai-code-stream] Analyzing edit intent with fetched manifest');
                      try {
                        const intentResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/analyze-edit-intent`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ prompt, manifest: filesData.manifest, model })
                        });
                        
                        if (intentResponse.ok) {
                          const { searchPlan } = await intentResponse.json();
                          console.log('[generate-ai-code-stream] Search plan received:', searchPlan);
                          
                          // Create edit context from AI analysis
                          // Note: We can't execute search here without file contents, so fall back to keyword method
                          const fileContext = selectFilesForEdit(prompt, filesData.manifest);
                          editContext = fileContext;
                          enhancedSystemPrompt = fileContext.systemPrompt;
                          
                          console.log('[generate-ai-code-stream] Edit context created with', editContext.primaryFiles.length, 'primary files');
                        }
                      } catch (error) {
                        console.error('[generate-ai-code-stream] Failed to analyze edit intent:', error);
                      }
                    }
                  }
                  
                  // Update variables
                  backendFiles = global.sandboxState.fileCache?.files || {};
                  hasBackendFiles = Object.keys(backendFiles).length > 0;
                  console.log('[generate-ai-code-stream] Updated backend cache with fetched files');
                }
              }
            } catch (error) {
              console.error('[generate-ai-code-stream] Failed to fetch sandbox files:', error);
            }
          }
          
          // Include current file contents from backend cache
          if (hasBackendFiles) {
            // If we have edit context, use intelligent file selection
            if (editContext && editContext.primaryFiles.length > 0) {
              contextParts.push('\nEXISTING APPLICATION - TARGETED EDIT MODE');
              contextParts.push(`\n${editContext.systemPrompt || enhancedSystemPrompt}\n`);
              
              // Get contents of primary and context files
              const primaryFileContents = await getFileContents(editContext.primaryFiles, global.sandboxState!.fileCache!.manifest!);
              const contextFileContents = await getFileContents(editContext.contextFiles, global.sandboxState!.fileCache!.manifest!);
              
              // Format files for AI
              const formattedFiles = formatFilesForAI(primaryFileContents, contextFileContents);
              contextParts.push(formattedFiles);
              
              contextParts.push('\nIMPORTANT: Only modify the files listed under "Files to Edit". The context files are provided for reference only.');
            } else {
              // Fallback to showing all files if no edit context
              console.log('[generate-ai-code-stream] WARNING: Using fallback mode - no edit context available');
              contextParts.push('\nEXISTING APPLICATION - TARGETED EDIT REQUIRED');
              contextParts.push('\nYou MUST analyze the user request and determine which specific file(s) to edit.');
              contextParts.push('\nCurrent project files (DO NOT regenerate all of these):');
              
              const fileEntries = Object.entries(backendFiles);
              console.log(`[generate-ai-code-stream] Using backend cache: ${fileEntries.length} files`);
              
              // Show file list first for reference
              contextParts.push('\n### File List:');
              for (const [path] of fileEntries) {
                contextParts.push(`- ${path}`);
              }
              
              // Include ALL files as context in fallback mode
              contextParts.push('\n### File Contents (ALL FILES FOR CONTEXT):');
              for (const [path, fileData] of fileEntries) {
                const content = fileData.content;
                if (typeof content === 'string') {
                  contextParts.push(`\n<file path="${path}">\n${content}\n</file>`);
                }
              }
              
              contextParts.push('\n🚨 CRITICAL INSTRUCTIONS - VIOLATION = FAILURE 🚨');
              contextParts.push('1. Analyze the user request: "' + prompt + '"');
              contextParts.push('2. Identify the MINIMUM number of files that need editing (usually just ONE)');
              contextParts.push('3. PRESERVE ALL EXISTING CONTENT in those files');
              contextParts.push('4. ONLY ADD/MODIFY the specific part requested');
              contextParts.push('5. DO NOT regenerate entire components from scratch');
              contextParts.push('6. DO NOT change unrelated parts of any file');
              contextParts.push('7. Generate ONLY the files that MUST be changed - NO EXTRAS');
              contextParts.push('\n⚠️ FILE COUNT RULE:');
              contextParts.push('- Simple change (color, text, spacing) = 1 file ONLY');
              contextParts.push('- Adding new component = 2 files MAX (new component + parent that imports it)');
              contextParts.push('- DO NOT exceed these limits unless absolutely necessary');
              contextParts.push('\nEXAMPLES OF CORRECT BEHAVIOR:');
              contextParts.push('✅ "add a chart to the hero" → Edit ONLY Hero.jsx, ADD the chart, KEEP everything else');
              contextParts.push('✅ "change header to black" → Edit ONLY Header.jsx, change ONLY the color');
              contextParts.push('✅ "fix spacing in footer" → Edit ONLY Footer.jsx, adjust ONLY spacing');
              contextParts.push('\nEXAMPLES OF FAILURES:');
              contextParts.push('❌ "change header color" → You edit Header, Footer, and App "for consistency"');
              contextParts.push('❌ "add chart to hero" → You regenerate the entire Hero component');
              contextParts.push('❌ "fix button" → You update 5 different component files');
              contextParts.push('\n⚠️ FINAL WARNING:');
              contextParts.push('If you generate MORE files than necessary, you have FAILED');
              contextParts.push('If you DELETE or REWRITE existing functionality, you have FAILED');
              contextParts.push('ONLY change what was EXPLICITLY requested - NOTHING MORE');
            }
          } else if (context.currentFiles && Object.keys(context.currentFiles).length > 0) {
            // Fallback to frontend-provided files if backend cache is empty
            console.log('[generate-ai-code-stream] Warning: Backend cache empty, using frontend files');
            contextParts.push('\nEXISTING APPLICATION - DO NOT REGENERATE FROM SCRATCH');
            contextParts.push('Current project files (modify these, do not recreate):');
            
            const fileEntries = Object.entries(context.currentFiles);
            for (const [path, content] of fileEntries) {
              if (typeof content === 'string') {
                contextParts.push(`\n<file path="${path}">\n${content}\n</file>`);
              }
            }
            contextParts.push('\nThe above files already exist. When the user asks to modify something (like "change the header color to black"), find the relevant file above and generate ONLY that file with the requested changes.');
          }
          
          // Add explicit edit mode indicator
          if (isEdit) {
            contextParts.push('\nEDIT MODE ACTIVE');
            contextParts.push('This is an incremental update to an existing application.');
            contextParts.push('DO NOT regenerate App.jsx, index.css, or other core files unless explicitly requested.');
            contextParts.push('ONLY create or modify the specific files needed for the user\'s request.');
            contextParts.push('\n⚠️ CRITICAL FILE OUTPUT FORMAT - VIOLATION = FAILURE:');
            contextParts.push('YOU MUST OUTPUT EVERY FILE IN THIS EXACT XML FORMAT:');
            contextParts.push('<file path="src/components/ComponentName.jsx">');
            contextParts.push('// Complete file content here');
            contextParts.push('</file>');
            contextParts.push('<file path="src/index.css">');
            contextParts.push('/* CSS content here */');
            contextParts.push('</file>');
            contextParts.push('\n❌ NEVER OUTPUT: "Generated Files: index.css, App.jsx"');
            contextParts.push('❌ NEVER LIST FILE NAMES WITHOUT CONTENT');
            contextParts.push('✅ ALWAYS: One <file> tag per file with COMPLETE content');
            contextParts.push('✅ ALWAYS: Include EVERY file you modified');
          } else if (!hasBackendFiles) {
            // First generation mode - make it beautiful!
            contextParts.push('\n🎨 FIRST GENERATION MODE - CREATE SOMETHING BEAUTIFUL!');
            contextParts.push('\nThis is the user\'s FIRST experience. Make it impressive:');
            contextParts.push('0. **TAILWIND SETUP** - Default sandbox is bare react-ts (no Tailwind). If file context shows no tailwind/postcss configs, output package.json merge + tailwind + postcss + src/index.css @tailwind + main.tsx import (see SANDBOX RUNTIME in system prompt).');
            contextParts.push('1. **USE TAILWIND PROPERLY** - Use standard Tailwind color classes');
            contextParts.push('2. **NO PLACEHOLDERS** - Use real content, not lorem ipsum');
            contextParts.push('3. **COMPLETE COMPONENTS** - Header, Hero, Features, Footer minimum');
            contextParts.push('4. **VISUAL POLISH** - Shadows, hover states, transitions');
            contextParts.push('5. **STANDARD CLASSES** - bg-white, text-gray-900, bg-blue-500, NOT bg-background');
            contextParts.push('\nCreate a polished, professional application that works perfectly on first load.');
            contextParts.push('\n⚠️ OUTPUT FORMAT:');
            contextParts.push('Use <file path="...">content</file> tags for EVERY file');
            contextParts.push('NEVER output "Generated Files:" as plain text');
          }
          
          // Add conversation context (scraped websites, etc)
          if (context.conversationContext) {
            if (context.conversationContext.scrapedWebsites?.length > 0) {
              contextParts.push('\nScraped Websites in Context:');
              context.conversationContext.scrapedWebsites.forEach((site: any) => {
                contextParts.push(`\nURL: ${site.url}`);
                contextParts.push(`Scraped: ${new Date(site.timestamp).toLocaleString()}`);
                if (site.content) {
                  // Include a summary of the scraped content
                  const contentPreview = typeof site.content === 'string' 
                    ? site.content.substring(0, 1000) 
                    : JSON.stringify(site.content).substring(0, 1000);
                  contextParts.push(`Content Preview: ${contentPreview}...`);
                }
              });
            }
            
            if (context.conversationContext.currentProject) {
              contextParts.push(`\nCurrent Project: ${context.conversationContext.currentProject}`);
            }
          }
          
          if (contextParts.length > 0) {
            fullPrompt = `CONTEXT:\n${contextParts.join('\n')}\n\nUSER REQUEST:\n${prompt}`;
          }
        }
        
        await sendProgress({ type: 'status', message: 'Planning application structure...' });
        
        console.log('\n[generate-ai-code-stream] Starting streaming response...\n');
        
        // Track packages that need to be installed
        const packagesToInstall: string[] = [];
        
        // Determine which provider to use based on model
        const isAnthropic = model.startsWith('anthropic/');
        const isGoogle = model.startsWith('google/');
        const isOpenAI = model.startsWith('openai/');
        const isKimiGroq = model === 'moonshotai/kimi-k2-instruct-0905';
        const modelProvider = isAnthropic ? anthropic : 
                              (isOpenAI ? openai : 
                              (isGoogle ? googleGenerativeAI : 
                              (isKimiGroq ? groq : groq)));
        
        // Fix model name transformation for different providers
        let actualModel: string;
        if (isAnthropic) {
          actualModel = model.replace('anthropic/', '');
        } else if (isOpenAI) {
          actualModel = model.replace('openai/', '');
        } else if (isKimiGroq) {
          // Kimi on Groq - use full model string
          actualModel = 'moonshotai/kimi-k2-instruct-0905';
        } else if (isGoogle) {
          // Google uses specific model names - convert our naming to theirs  
          actualModel = model.replace('google/', '');
        } else {
          actualModel = model;
        }

        console.log(`[generate-ai-code-stream] Using provider: ${isAnthropic ? 'Anthropic' : isGoogle ? 'Google' : isOpenAI ? 'OpenAI' : 'Groq'}, model: ${actualModel}`);
        console.log(`[generate-ai-code-stream] AI Gateway enabled: ${isUsingAIGateway}`);
        console.log(`[generate-ai-code-stream] Model string: ${model}`);

        // Make streaming API call with appropriate provider
        const streamOptions: any = {
          model: modelProvider(actualModel),
          messages: [
            { 
              role: 'system', 
              content: systemPrompt + `

🚨 CRITICAL CODE GENERATION RULES - VIOLATION = FAILURE 🚨:
1. NEVER truncate ANY code - ALWAYS write COMPLETE files
2. NEVER use "..." anywhere in your code - this causes syntax errors
3. NEVER cut off strings mid-sentence - COMPLETE every string
4. NEVER leave incomplete class names or attributes
5. ALWAYS close ALL tags, quotes, brackets, and parentheses
6. If you run out of space, prioritize completing the current file

CRITICAL STRING RULES TO PREVENT SYNTAX ERRORS:
- NEVER write: className="px-8 py-4 bg-black text-white font-bold neobrut-border neobr...
- ALWAYS write: className="px-8 py-4 bg-black text-white font-bold neobrut-border neobrut-shadow"
- COMPLETE every className attribute
- COMPLETE every string literal
- NO ellipsis (...) ANYWHERE in code

PACKAGE RULES:
- For INITIAL generation: Use ONLY React, no external packages
- For EDITS: You may use packages, specify them with <package> tags
- NEVER install scraping or third-party packages unless explicitly requested

Examples of SYNTAX ERRORS (NEVER DO THIS):
❌ className="px-4 py-2 bg-blue-600 hover:bg-blue-7...
❌ <button className="btn btn-primary btn-...
❌ const title = "Welcome to our...
❌ import { useState, useEffect, ... } from 'react'

Examples of CORRECT CODE (ALWAYS DO THIS):
✅ className="px-4 py-2 bg-blue-600 hover:bg-blue-700"
✅ <button className="btn btn-primary btn-large">
✅ const title = "Welcome to our application"
✅ import { useState, useEffect, useCallback } from 'react'

REMEMBER: It's better to generate fewer COMPLETE files than many INCOMPLETE files.`
            },
            { 
              role: 'user', 
              content: fullPrompt + `

CRITICAL: You MUST complete EVERY file you start. If you write:
<file path="src/components/Hero.jsx">

You MUST include the closing </file> tag and ALL the code in between.

NEVER write partial code like:
<h1>Build and deploy on the AI Cloud.</h1>
<p>Some text...</p>  ❌ WRONG

ALWAYS write complete code:
<h1>Build and deploy on the AI Cloud.</h1>
<p>Some text here with full content</p>  ✅ CORRECT

If you're running out of space, generate FEWER files but make them COMPLETE.
It's better to have 3 complete files than 10 incomplete files.`
            }
          ],
          maxOutputTokens: appConfig.ai.maxTokens,
          stopSequences: [] // Don't stop early
          // Note: Neither Groq nor Anthropic models support tool/function calling in this context
          // We use XML tags for package detection instead
        };
        
        // Add temperature for non-reasoning models
        if (!model.startsWith('openai/gpt-5')) {
          streamOptions.temperature = 0.7;
        }
        
        // Add reasoning effort for GPT-5 models
        if (isOpenAI) {
          streamOptions.experimental_providerMetadata = {
            openai: {
              reasoningEffort: 'high'
            }
          };
        }
        
        let result;
        const maxRetries = 2;
        let streamOptionsGroqFallenBack = false;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          try {
            result = await streamText(streamOptions);
            break;
          } catch (streamError: any) {
            console.error(`[generate-ai-code-stream] Error calling streamText (attempt ${attempt + 1}/${maxRetries + 1}):`, streamError);

            const msg = streamError.message || '';
            const isGroqServiceError =
              (model === 'moonshotai/kimi-k2-instruct-0905' || model.startsWith('groq')) &&
              (/Service unavailable/i.test(msg) || /Groq/i.test(msg));
            const isRetryableError =
              /Service unavailable/i.test(msg) ||
              /rate limit/i.test(msg) ||
              /timeout/i.test(msg);

            if (attempt < maxRetries && isRetryableError) {
              if (isGroqServiceError && isKimiGroq && !streamOptionsGroqFallenBack) {
                console.log('[generate-ai-code-stream] Groq exhausted/unavailable — falling back to OpenAI');
                await sendProgress({
                  type: 'info',
                  message: `Groq unavailable; using fallback model ${appConfig.ai.fallbackModelOpenAIId}…`,
                });
                streamOptions.model = openai(appConfig.ai.fallbackModelOpenAIId);
                streamOptionsGroqFallenBack = true;
              } else if (attempt < maxRetries - 1) {
                console.log(`[generate-ai-code-stream] Retrying in ${(attempt + 1) * 2}s…`);
                await sendProgress({
                  type: 'info',
                  message: `Service temporarily unavailable, retrying (${attempt + 2}/${maxRetries + 1})…`,
                });
                await new Promise((resolve) => setTimeout(resolve, (attempt + 1) * 2000));
              }
              continue;
            }

            await sendProgress({
              type: 'error',
              message: `Failed to initialize ${
                isGoogle ? 'Gemini'
                : isAnthropic ? 'Claude'
                : isOpenAI ? 'GPT-5'
                : isKimiGroq ? 'Kimi (Groq)'
                : 'Groq'
              } streaming: ${streamError.message}`,
            });

            if (isGoogle) {
              await sendProgress({
                type: 'info',
                message: 'Tip: Make sure your GEMINI_API_KEY is set correctly and has proper permissions.',
              });
            }

            throw streamError;
          }
        }

        if (!result) {
          throw new Error('Failed to initialize LLM streaming after retries.');
        }

        // Stream the response and parse in real-time
        let generatedCode = '';
        let currentFile = '';
        let currentFilePath = '';
        let componentCount = 0;
        let isInFile = false;
        let isInTag = false;
        let conversationalBuffer = '';
        
        // Buffer for incomplete tags
        let tagBuffer = '';
        
        // Stream the response and parse for packages in real-time
        for await (const textPart of result?.textStream || []) {
          const text = textPart || '';
          generatedCode += text;
          currentFile += text;
          
          // Combine with buffer for tag detection
          const searchText = tagBuffer + text;
          
          // Log streaming chunks to console
          process.stdout.write(text);
          
          // Check if we're entering or leaving a tag
          const hasOpenTag = /<(file|package|packages|explanation|command|structure|template)\b/.test(text);
          const hasCloseTag = /<\/(file|package|packages|explanation|command|structure|template)>/.test(text);
          
          if (hasOpenTag) {
            // Send any buffered conversational text before the tag
            if (conversationalBuffer.trim() && !isInTag) {
              await sendProgress({ 
                type: 'conversation', 
                text: conversationalBuffer.trim()
              });
              conversationalBuffer = '';
            }
            isInTag = true;
          }
          
          if (hasCloseTag) {
            isInTag = false;
          }
          
          // If we're not in a tag, buffer as conversational text
          if (!isInTag && !hasOpenTag) {
            conversationalBuffer += text;
          }
          
          // Stream the raw text for live preview
          await sendProgress({ 
            type: 'stream', 
            text: text,
            raw: true 
          });
          
          // Debug: Log every 100 characters streamed
          if (generatedCode.length % 100 < text.length) {
            console.log(`[generate-ai-code-stream] Streamed ${generatedCode.length} chars`);
          }
          
          // Check for package tags in buffered text (ONLY for edits, not initial generation)
          let lastIndex = 0;
          if (isEdit) {
            const packageRegex = /<package>([^<]+)<\/package>/g;
            let packageMatch;
            
            while ((packageMatch = packageRegex.exec(searchText)) !== null) {
              const packageName = packageMatch[1].trim();
              if (packageName && !packagesToInstall.includes(packageName)) {
                packagesToInstall.push(packageName);
                console.log(`[generate-ai-code-stream] Package detected: ${packageName}`);
                await sendProgress({ 
                  type: 'package', 
                  name: packageName,
                  message: `Package detected: ${packageName}`
                });
              }
              lastIndex = packageMatch.index + packageMatch[0].length;
            }
          }
          
          // Keep unmatched portion in buffer for next iteration
          tagBuffer = searchText.substring(Math.max(0, lastIndex - 50)); // Keep last 50 chars
          
          // Check for file boundaries
          if (text.includes('<file path="')) {
            const pathMatch = text.match(/<file path="([^"]+)"/);
            if (pathMatch) {
              currentFilePath = pathMatch[1];
              isInFile = true;
              currentFile = text;
            }
          }
          
          // Check for file end
          if (isInFile && currentFile.includes('</file>')) {
            isInFile = false;
            
            // Send component progress update
            if (currentFilePath.includes('components/')) {
              componentCount++;
              const componentName = currentFilePath.split('/').pop()?.replace('.jsx', '') || 'Component';
              await sendProgress({ 
                type: 'component', 
                name: componentName,
                path: currentFilePath,
                index: componentCount
              });
            } else if (currentFilePath.includes('App.jsx')) {
              await sendProgress({ 
                type: 'app', 
                message: 'Generated main App.jsx',
                path: currentFilePath
              });
            }
            
            currentFile = '';
            currentFilePath = '';
          }
        }
        
        console.log('\n\n[generate-ai-code-stream] Streaming complete.');
        
        // Send any remaining conversational text
        if (conversationalBuffer.trim()) {
          await sendProgress({ 
            type: 'conversation', 
            text: conversationalBuffer.trim()
          });
        }
        
        // Also parse <packages> tag for multiple packages - ONLY for edits
        if (isEdit) {
          const packagesRegex = /<packages>([\s\S]*?)<\/packages>/g;
          let packagesMatch;
          while ((packagesMatch = packagesRegex.exec(generatedCode)) !== null) {
            const packagesContent = packagesMatch[1].trim();
            const packagesList = packagesContent.split(/[\n,]+/)
              .map(pkg => pkg.trim())
              .filter(pkg => pkg.length > 0);
            
            for (const packageName of packagesList) {
              if (!packagesToInstall.includes(packageName)) {
                packagesToInstall.push(packageName);
                console.log(`[generate-ai-code-stream] Package from <packages> tag: ${packageName}`);
                await sendProgress({ 
                  type: 'package', 
                  name: packageName,
                  message: `Package detected: ${packageName}`
                });
              }
            }
          }
        }
        
        // Function to extract packages from import statements
        function extractPackagesFromCode(content: string): string[] {
          const packages: string[] = [];
          // Match ES6 imports
          const importRegex = /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)(?:\s*,\s*(?:\{[^}]*\}|\*\s+as\s+\w+|\w+))*\s+from\s+)?['"]([^'"]+)['"]/g;
          let importMatch;
          
          while ((importMatch = importRegex.exec(content)) !== null) {
            const importPath = importMatch[1];
            // Skip relative imports and built-in React
            if (!importPath.startsWith('.') && !importPath.startsWith('/') && 
                importPath !== 'react' && importPath !== 'react-dom' &&
                !importPath.startsWith('@/')) {
              // Extract package name (handle scoped packages like @heroicons/react)
              const packageName = importPath.startsWith('@') 
                ? importPath.split('/').slice(0, 2).join('/')
                : importPath.split('/')[0];
              
              if (!packages.includes(packageName)) {
                packages.push(packageName);
              }
            }
          }
          
          return packages;
        }
        
        // Extract explanation (after any truncation repair)
        const explanationMatch = generatedCode.match(/<explanation>([\s\S]*?)<\/explanation>/);
        const explanation = explanationMatch ? explanationMatch[1].trim() : '';

        let truncationRecoveryPassesUsed = 0;
        const maxRecoveryPasses = appConfig.codeApplication.enableTruncationRecovery
          ? appConfig.codeApplication.maxTruncationRecoveryAttempts
          : 0;

        for (let pass = 0; pass < maxRecoveryPasses; pass++) {
          let truncationWarningsPass = analyzeGenerationTruncation(generatedCode);
          const repairTargets = collectTruncatedRepairTargets(generatedCode);
          if (truncationWarningsPass.length === 0 && repairTargets.length === 0) {
            break;
          }
          if (repairTargets.length === 0) {
            break;
          }

          console.warn(
            `[generate-ai-code-stream] Truncation pass ${pass + 1}/${maxRecoveryPasses}:`,
            truncationWarningsPass
          );
          truncationRecoveryPassesUsed++;

          await sendProgress({
            type: 'warning',
            message: `Detected incomplete code (pass ${pass + 1}/${maxRecoveryPasses}). Attempting to complete…`,
            warnings: truncationWarningsPass,
          });

          for (const filePath of repairTargets) {
            await sendProgress({
              type: 'info',
              message: `Completing ${filePath}…`,
            });

            try {
              const completionPrompt = `Complete the following file that was truncated. Provide the FULL file content.

File: ${filePath}
Original request: ${prompt}

Provide the complete file content without any truncation. Include all necessary imports, complete all functions, and close all tags properly.`;

              let completionClient;
              if (model.includes('gpt') || model.includes('openai')) {
                completionClient = openai;
              } else if (model.includes('claude')) {
                completionClient = anthropic;
              } else if (model === 'moonshotai/kimi-k2-instruct-0905') {
                completionClient = groq;
              } else {
                completionClient = groq;
              }

              let completionModelName: string;
              if (model === 'moonshotai/kimi-k2-instruct-0905') {
                completionModelName = 'moonshotai/kimi-k2-instruct-0905';
              } else if (model.includes('openai')) {
                completionModelName = model.replace('openai/', '');
              } else if (model.includes('anthropic')) {
                completionModelName = model.replace('anthropic/', '');
              } else if (model.includes('google')) {
                completionModelName = model.replace('google/', '');
              } else {
                completionModelName = model;
              }

              const completionOpts: Parameters<typeof streamText>[0] = {
                model: completionClient(completionModelName),
                messages: [
                  {
                    role: 'system',
                    content:
                      'You are completing a truncated file. Provide the complete, working file content.',
                  },
                  { role: 'user', content: completionPrompt },
                ],
                maxOutputTokens: appConfig.ai.truncationRecoveryMaxTokens,
              };
              if (!model.startsWith('openai/gpt-5')) {
                completionOpts.temperature = appConfig.ai.defaultTemperature;
              }

              const completionResult = await streamText(completionOpts);

              let completedContent = '';
              for await (const chunk of completionResult.textStream) {
                completedContent += chunk;
              }

              const filePattern = new RegExp(
                `<file path="${filePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}">[\\s\\S]*?(?:</file>|$)`,
                'g'
              );

              let cleanContent = completedContent;
              if (cleanContent.includes('```')) {
                const codeMatch = cleanContent.match(/```[\w]*\n([\s\S]*?)```/);
                if (codeMatch) {
                  cleanContent = codeMatch[1];
                }
              }

              generatedCode = generatedCode.replace(
                filePattern,
                `<file path="${filePath}">\n${cleanContent}\n</file>`
              );

              console.log(`[generate-ai-code-stream] Successfully completed ${filePath}`);
            } catch (completionError) {
              console.error(`[generate-ai-code-stream] Failed to complete ${filePath}:`, completionError);
              await sendProgress({
                type: 'warning',
                message: `Could not auto-complete ${filePath}. Manual review may be needed.`,
              });
            }
          }

          await sendProgress({
            type: 'info',
            message: `Truncation recovery pass ${pass + 1} finished`,
          });
        }

        const truncationWarningsFinal = analyzeGenerationTruncation(generatedCode);

        // Parse files and send progress for each (after repair so manifests match)
        const fileRegex = /<file path="([^"]+)">([\s\S]*?)<\/file>/g;
        const files: { path: string; content: string }[] = [];
        let match;

        while ((match = fileRegex.exec(generatedCode)) !== null) {
          const filePath = match[1];
          const content = match[2].trim();
          files.push({ path: filePath, content });

          // Extract packages from file content - ONLY for edits
          if (isEdit) {
            const filePackages = extractPackagesFromCode(content);
            for (const pkg of filePackages) {
              if (!packagesToInstall.includes(pkg)) {
                packagesToInstall.push(pkg);
                console.log(`[generate-ai-code-stream] Package detected from imports: ${pkg}`);
                await sendProgress({
                  type: 'package',
                  name: pkg,
                  message: `Package detected from imports: ${pkg}`,
                });
              }
            }
          }

          // Send progress for each file (reusing componentCount from streaming)
          if (filePath.includes('components/')) {
            const componentName = filePath.split('/').pop()?.replace('.jsx', '') || 'Component';
            await sendProgress({
              type: 'component',
              name: componentName,
              path: filePath,
              index: componentCount,
            });
          } else if (filePath.includes('App.jsx')) {
            await sendProgress({
              type: 'app',
              message: 'Generated main App.jsx',
              path: filePath,
            });
          }
        }

        // Send completion with packages info
        await sendProgress({
          type: 'complete',
          generatedCode,
          explanation,
          files: files.length,
          components: componentCount,
          model,
          packagesToInstall: packagesToInstall.length > 0 ? packagesToInstall : undefined,
          warnings: truncationWarningsFinal.length > 0 ? truncationWarningsFinal : undefined,
          truncationRecoveryPassesUsed:
            truncationRecoveryPassesUsed > 0 ? truncationRecoveryPassesUsed : undefined,
        });
        
        // Track edit in conversation history
        if (isEdit && editContext && global.conversationState) {
          const editRecord: ConversationEdit = {
            timestamp: Date.now(),
            userRequest: prompt,
            editType: editContext.editIntent.type,
            targetFiles: editContext.primaryFiles,
            confidence: editContext.editIntent.confidence,
            outcome: 'success' // Assuming success if we got here
          };
          
          global.conversationState.context.edits.push(editRecord);
          
          // Track major changes
          if (editContext.editIntent.type === 'ADD_FEATURE' || files.length > 3) {
            global.conversationState.context.projectEvolution.majorChanges.push({
              timestamp: Date.now(),
              description: editContext.editIntent.description,
              filesAffected: editContext.primaryFiles
            });
          }
          
          // Update last updated timestamp
          global.conversationState.lastUpdated = Date.now();
          
          console.log('[generate-ai-code-stream] Updated conversation history with edit:', editRecord);
        }
        
      } catch (error) {
        console.error('[generate-ai-code-stream] Stream processing error:', error);
        
        // Check if it's a tool validation error
        if ((error as any).message?.includes('tool call validation failed')) {
          console.error('[generate-ai-code-stream] Tool call validation error - this may be due to the AI model sending incorrect parameters');
          await sendProgress({ 
            type: 'warning', 
            message: 'Package installation tool encountered an issue. Packages will be detected from imports instead.'
          });
          // Continue processing - packages can still be detected from the code
        } else {
          await sendProgress({ 
            type: 'error', 
            error: (error as Error).message 
          });
        }
      } finally {
        try {
          await writer.close();
        } catch {
          // Stream already closed (e.g. client disconnected)
        }
      }
    })();
    
    // Return the stream with proper headers for streaming support
    return new Response(stream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Transfer-Encoding': 'chunked',
        'Content-Encoding': 'none', // Prevent compression that can break streaming
        'X-Accel-Buffering': 'no', // Disable nginx buffering
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
    
  } catch (error) {
    console.error('[generate-ai-code-stream] Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: (error as Error).message 
    }, { status: 500 });
  }
}