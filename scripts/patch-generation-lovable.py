#!/usr/bin/env python3
from pathlib import Path

path = Path(__file__).resolve().parents[1] / "app" / "generation" / "page.tsx"
s = path.read_text()

s = s.replace(
    "const [homeUrlInput, setHomeUrlInput] = useState('');",
    "const [starterPrompt, setStarterPrompt] = useState('');",
)
s = s.replace("homeUrlInput", "starterPrompt")
s = s.replace("setHomeUrlInput", "setStarterPrompt")

old_init = r"""      // First check URL parameters (from home page navigation)
      const urlParam = searchParams.get('url');
      const templateParam = searchParams.get('template');
      const detailsParam = searchParams.get('details');
      
      // Then check session storage as fallback
      const storedUrl = urlParam || sessionStorage.getItem('targetUrl');
      const storedStyle = templateParam || sessionStorage.getItem('selectedStyle');
      const storedModel = sessionStorage.getItem('selectedModel');
      const storedInstructions = sessionStorage.getItem('additionalInstructions');
      
      if (storedUrl) {
        // Mark that we have an initial submission since we're loading with a URL
        setHasInitialSubmission(true);
        
        // Clear sessionStorage after reading  
        sessionStorage.removeItem('targetUrl');
        sessionStorage.removeItem('selectedStyle');
        sessionStorage.removeItem('selectedModel');
        sessionStorage.removeItem('additionalInstructions');
        // Note: Don't clear siteMarkdown here, it will be cleared when used
        
        // Set the values in the component state
        setStarterPrompt(storedUrl);
        setSelectedStyle(storedStyle || 'modern');
        
        // Add details to context if provided
        if (detailsParam) {
          setHomeContextInput(detailsParam);
        } else if (storedStyle && !urlParam) {
          // Only apply stored style if no screenshot URL is provided
          // This prevents unwanted style inheritance when using screenshot search
          const styleNames: Record<string, string> = {
            '1': 'Glassmorphism',
            '2': 'Neumorphism',
            '3': 'Brutalism',
            '4': 'Minimalist',
            '5': 'Dark Mode',
            '6': 'Gradient Rich',
            '7': '3D Depth',
            '8': 'Retro Wave',
            'modern': 'Modern clean and minimalist',
            'playful': 'Fun colorful and playful',
            'professional': 'Corporate professional and sleek',
            'artistic': 'Creative artistic and unique'
          };
          const styleName = styleNames[storedStyle] || storedStyle;
          let contextString = `${styleName} style design`;
          
          // Add additional instructions if provided
          if (storedInstructions) {
            contextString += `. ${storedInstructions}`;
          }
          
          setHomeContextInput(contextString);
        } else if (storedInstructions && !urlParam) {
          // Apply only instructions if no style but instructions are provided
          // and no screenshot URL is provided
          setHomeContextInput(storedInstructions);
        }
        
        if (storedModel) {
          setAiModel(storedModel);
        }
        
        // Skip the home screen and go directly to builder
        setShowHomeScreen(false);
        setHomeScreenFading(false);
        
        // Set flag to auto-trigger generation after component updates
        setShouldAutoGenerate(true);
        
        // Also set autoStart flag for the effect
        sessionStorage.setItem('autoStart', 'true');
      }"""

new_init = r"""      // Starter brief: ?idea= / starterBrief, legacy ?url= / targetUrl
      const ideaParam = searchParams.get('idea')?.trim();
      const legacyUrlParam = searchParams.get('url')?.trim();
      const starterFromStorage = sessionStorage.getItem('starterBrief')?.trim();
      const legacyTargetUrl = sessionStorage.getItem('targetUrl')?.trim();
      const storedStarter =
        ideaParam ||
        starterFromStorage ||
        legacyUrlParam ||
        legacyTargetUrl ||
        '';
      const templateParam = searchParams.get('template');
      const detailsParam = searchParams.get('details');

      const storedStyle = templateParam || sessionStorage.getItem('selectedStyle');
      const storedModel = sessionStorage.getItem('selectedModel');
      const storedInstructions = sessionStorage.getItem('additionalInstructions');
      const fromIdeasOnly = !!(ideaParam || starterFromStorage);

      if (storedStarter) {
        setHasInitialSubmission(true);

        sessionStorage.removeItem('starterBrief');
        sessionStorage.removeItem('targetUrl');
        sessionStorage.removeItem('selectedStyle');
        sessionStorage.removeItem('selectedModel');
        sessionStorage.removeItem('additionalInstructions');
        sessionStorage.removeItem('siteMarkdown');

        setStarterPrompt(storedStarter);
        setSelectedStyle(storedStyle || 'modern');

        if (detailsParam) {
          setHomeContextInput(detailsParam);
        } else if (storedStyle && !fromIdeasOnly) {
          const styleNames: Record<string, string> = {
            '1': 'Glassmorphism',
            '2': 'Neumorphism',
            '3': 'Brutalism',
            '4': 'Minimalist',
            '5': 'Dark Mode',
            '6': 'Gradient Rich',
            '7': '3D Depth',
            '8': 'Retro Wave',
            modern: 'Modern clean and minimalist',
            playful: 'Fun colorful and playful',
            professional: 'Corporate professional and sleek',
            artistic: 'Creative artistic and unique',
          };
          const styleName = styleNames[storedStyle] || storedStyle;
          let contextString = `${styleName} style design`;

          if (storedInstructions) {
            contextString += `. ${storedInstructions}`;
          }

          setHomeContextInput(contextString);
        } else if (storedInstructions && !fromIdeasOnly) {
          setHomeContextInput(storedInstructions);
        }

        if (storedModel) {
          setAiModel(storedModel);
        }

        setShowHomeScreen(false);
        setHomeScreenFading(false);
        setShouldAutoGenerate(true);
        sessionStorage.setItem('autoStart', 'true');
      }"""

if old_init not in s:
    raise SystemExit("init blob not found")
s = s.replace(old_init, new_init)
s = s.replace("if (storedUrl && isMounted)", "if (storedStarter && isMounted)", 1)

fx = """  // Start capturing screenshot if URL is provided on mount (from home screen)
  useEffect(() => {
    if (!showHomeScreen && starterPrompt && !urlScreenshot && !isCapturingScreenshot) {
      let screenshotUrl = starterPrompt.trim();
      if (!screenshotUrl.match(/^https?:\\/\\//i)) {
        screenshotUrl = 'https://' + screenshotUrl;
      }
      captureUrlScreenshot(screenshotUrl);
    }
  }, [showHomeScreen, starterPrompt]); // eslint-disable-line react-hooks/exhaustive-deps

"""

if fx not in s:
    raise SystemExit("screenshot effect not found")
s = s.replace(fx, "\n")

PRE_START = "    // Clear messages and immediately show the initial message\n"
PRE_END = "    setTimeout(async () => {\n"
NEW_PRE = """    setChatMessages([]);
    addChatMessage('Таны төслийг эхлүүлж байна — AI бүтцийг гаргаж байна.', 'system');

    const sandboxPromise = !sandboxData ? createSandbox(true) : Promise.resolve(null);

"""

i = s.index(PRE_START)
j = s.index(PRE_END, i)
s = s[:i] + NEW_PRE + s[j:]

junk = """      // Wait for sandbox to be ready (if it's still creating)
      const createdSandbox = await sandboxPromise;
      
      // Now start the clone process which will stream the generation
      setUrlInput(starterPrompt);
      setUrlOverlayVisible(false); // Make sure overlay is closed
      setUrlStatus(['Scraping website content...']);
      

"""

if junk not in s:
    raise SystemExit("inner junk prelude not found")
s = s.replace(junk, "", 1)


needle_start = """        // Scrape the website
        let url = starterPrompt.trim();
        if (!url.match(/^https?:\\/\\//i)) {
          url = 'https://' + url;
        }"""

needle_end = """        setGenerationProgress(prev => ({
          isGenerating: true,
          status: 'Initializing AI...',
          components: [],
          currentComponent: 0,
          streamedCode: '',
          isStreaming: true,
          isThinking: false,
          thinkingText: undefined,
          thinkingDuration: undefined,
          // Keep previous files until new ones are generated
          files: prev.files || [],
          currentFile: undefined,
          lastProcessedPosition: 0
        }));
        
        const aiResponse = await fetch('/api/generate-ai-code-stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            prompt,
            model: aiModel,
            context: {
              sandboxId: sandboxData?.sandboxId,
              structure: structureContent,
              conversationContext: conversationContext
            }
          })
        });"""

replacement_mid = """        await sandboxPromise;

        setUrlInput('');
        setUrlOverlayVisible(false);
        setUrlStatus(['AI-тай холбогдож байна…']);

        let filteredContext = homeContextInput;
        if (homeContextInput) {
          const stylePatterns = [
            'Glassmorphism style design',
            'Neumorphism style design',
            'Brutalism style design',
            'Minimalist style design',
            'Dark Mode style design',
            'Gradient Rich style design',
            '3D Depth style design',
            'Retro Wave style design',
            'Modern clean and minimalist style design',
            'Fun colorful and playful style design',
            'Corporate professional and sleek style design',
            'Creative artistic and unique style design'
          ];

          const startsWithStyle = stylePatterns.some(pattern =>
            homeContextInput.trim().startsWith(pattern)
          );

          if (startsWithStyle) {
            const additionalMatch = homeContextInput.match(/\\. (.+)$/);
            filteredContext = additionalMatch ? additionalMatch[1] : '';
          }
        }

        const mergedConversation = {
          ...conversationContext,
          currentProject: projectName.trim() ? projectName : starterPrompt.trim().slice(0, 120),
        };
        setConversationContext(mergedConversation);

        const prompt = `Generate a NEW React + Vite + Tailwind CSS application based on this product brief (greenfield builder like Lovable — not scraping/cloning unless the brief explicitly asks to imitate another site).

USER BRIEF:
${starterPrompt.trim()}

${filteredContext ? `DESIGN / EXTRA CONTEXT FROM USER:
${filteredContext}
` : ''}

REQUIREMENTS:
- Turn the brief into a cohesive UI with sections that fit the stated product — not unrelated template pages.
- Follow project system rules about Tailwind, edits, etc.
`;

        setIsPreparingDesign(false);
        setIsScreenshotLoaded(false);
        setUrlScreenshot(null);
        setTargetUrl('');
        setUrlStatus(['Төлөвлөлт…', 'Код гаргаж байна…']);
        setLoadingStage('planning');
        setTimeout(() => {
          setLoadingStage('generating');
          setActiveTab('generation');
        }, 1500);

        setGenerationProgress(prev => ({
          isGenerating: true,
          status: 'Initializing AI...',
          components: [],
          currentComponent: 0,
          streamedCode: '',
          isStreaming: true,
          isThinking: false,
          thinkingText: undefined,
          thinkingDuration: undefined,
          // Keep previous files until new ones are generated
          files: prev.files || [],
          currentFile: undefined,
          lastProcessedPosition: 0
        }));
        
        const aiResponse = await fetch('/api/generate-ai-code-stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            prompt,
            model: aiModel,
            context: {
              sandboxId: sandboxData?.sandboxId,
              structure: structureContent,
              conversationContext: mergedConversation
            }
          })
        });"""

k = s.index(needle_start)
ell = s.index(needle_end, k)
s = s[:k] + replacement_mid + s[ell + len(needle_end):]

succ = """          addChatMessage(
            brandExtensionMode
              ? `Successfully built your custom component using ${cleanUrl}'s brand guidelines! You can now ask me to modify it or add more features.`
              : `Successfully recreated ${url} as a modern React app${homeContextInput ? ` with your requested context: "${homeContextInput}"` : ''}! The scraped content is now in my context, so you can ask me to modify specific sections or add features based on the original site.`,
            'ai',
            {
              scrapedUrl: url,
              scrapedContent: brandExtensionMode ? { brandGuidelines } : scrapeData,
              generatedCode: generatedCode
            }
          );"""

if succ in s:
    s = s.replace(
        succ,
        """          addChatMessage(
            `Анхны хувилал бэлэн болсон.${homeContextInput ? ` Контекст: ${homeContextInput.slice(0, 140)}…` : ''}`,
            'ai',
            { generatedCode: generatedCode },
          );""",
    )

s = s.replace(
    "`Failed to clone website: ${error.message}`",
    "`Генераци амжилтгүй: ${error.message}`",
)

sidebar_old = """                onSubmit={(url, style, model, instructions) => {
                  // Mark that we've had an initial submission
                  setHasInitialSubmission(true);
                  
                  // Store the configuration in sessionStorage (same as home page)
                  sessionStorage.setItem('targetUrl', url);
                  sessionStorage.setItem('selectedStyle', style);
                  sessionStorage.setItem('selectedModel', model);
                  if (instructions) {
                    sessionStorage.setItem('additionalInstructions', instructions);
                  }
                  sessionStorage.setItem('autoStart', 'true');
                  
                  // Start generation using the existing logic
                  setStarterPrompt(url);
                  setHomeContextInput(instructions || '');
                  startGeneration();
                }}"""

sidebar_new = """                onSubmit={(brief, style, model, instructions) => {
                  setHasInitialSubmission(true);

                  sessionStorage.setItem('starterBrief', brief);
                  sessionStorage.setItem('selectedStyle', style);
                  sessionStorage.setItem('selectedModel', model);
                  if (instructions) {
                    sessionStorage.setItem('additionalInstructions', instructions);
                  }
                  sessionStorage.setItem('autoStart', 'true');

                  const styleNames: Record<string, string> = {
                    '1': 'Glassmorphism',
                    '2': 'Neumorphism',
                    '3': 'Brutalism',
                    '4': 'Minimalist',
                    '5': 'Dark Mode',
                    '6': 'Gradient Rich',
                    '7': '3D Depth',
                    '8': 'Retro Wave',
                  };
                  const stylePhrase = `${styleNames[style] || style} style design`;

                  const ctx =
                    instructions && instructions.length > 0
                      ? instructions.startsWith(stylePhrase)
                        ? instructions
                        : `${stylePhrase}. ${instructions}`
                      : stylePhrase;

                  setStarterPrompt(brief);
                  setHomeContextInput(ctx);
                  startGeneration();
                }}"""

if sidebar_old not in s:
    raise SystemExit("sidebar snippet not found")
s = s.replace(sidebar_old, sidebar_new)

ov_old = """      const isInitialGeneration = !sandboxData?.url && (urlScreenshot || isCapturingScreenshot || isPreparingDesign || loadingStage);
      const isNewGenerationWithSandbox = isStartingNewGeneration && sandboxData?.url;
      const shouldShowLoadingOverlay = (isInitialGeneration || isNewGenerationWithSandbox) && 
        (loading || generationProgress.isGenerating || isPreparingDesign || loadingStage || isCapturingScreenshot || isStartingNewGeneration);"""

ov_new = """      const isInitialGeneration = !sandboxData?.url && (loadingStage !== null || isStartingNewGeneration);
      const isNewGenerationWithSandbox = isStartingNewGeneration && sandboxData?.url;
      const shouldShowLoadingOverlay = (isInitialGeneration || isNewGenerationWithSandbox) &&
        (loading || generationProgress.isGenerating || loadingStage !== null || isStartingNewGeneration);"""

if ov_old in s:
    s = s.replace(ov_old, ov_new)

st_old = """                  <p className="text-white text-lg font-medium">
                    {isCapturingScreenshot ? 'Analyzing website...' :
                     isPreparingDesign ? 'Preparing design...' :
                     generationProgress.isGenerating ? 'Generating code...' :
                     'Loading...'}
                  </p>
                  
                  {/* Subtle progress hint */}
                  <p className="text-white/60 text-sm mt-2">
                    {isCapturingScreenshot ? 'Taking a screenshot of the site' :
                     isPreparingDesign ? 'Understanding the layout and structure' :
                     generationProgress.isGenerating ? 'Writing React components' :
                     'Please wait...'}
                  </p>"""

st_new = """                  <p className="text-white text-lg font-medium">
                    {generationProgress.isGenerating ? 'Код гаргаж байна…' : 'Sandbox болон AI бэлдэж байна…'}
                  </p>

                  <p className="text-white/60 text-sm mt-2">
                    Тайлбараас апп барьж байна
                  </p>"""

if st_old in s:
    s = s.replace(st_old, st_new)

path.write_text(s)
