#!/usr/bin/env python3
"""Rewrite startGeneration clone/scrape → greenfield brief (Lovable-style)."""
from pathlib import Path

path = Path(__file__).resolve().parents[1] / "app" / "generation" / "page.tsx"
lines = path.read_text().splitlines(keepends=True)


def splice_delete_wait_block(ls: list[str]) -> list[str]:
    out: list[str] = []
    i = 0
    while i < len(ls):
        if "Wait for sandbox to be ready (if it's still creating)" in ls[i]:
            i += 1
            while i < len(ls) and not (
                ls[i].strip() == "try {" and ls[i].startswith("      ")
            ):
                i += 1
            continue
        out.append(ls[i])
        i += 1
    return out


def main() -> None:
    raw = "".join(lines)
    raw = raw.replace(
        "const [homeUrlInput, setHomeUrlInput] = useState('');",
        "const [starterPrompt, setStarterPrompt] = useState('');",
    )
    raw = raw.replace("homeUrlInput", "starterPrompt")
    raw = raw.replace("setHomeUrlInput", "setStarterPrompt")
    ls = raw.splitlines(keepends=True)

    old_init = """      // First check URL parameters (from home page navigation)\n"""
    if old_init not in "".join(ls):
        raise RuntimeError("old init anchor missing")
    joined = "".join(ls)

    new_init_seg = """      // Starter brief: ?idea= / starterBrief, legacy ?url= / targetUrl\n      const ideaParam = searchParams.get('idea')?.trim();\n      const legacyUrlParam = searchParams.get('url')?.trim();\n      const starterFromStorage = sessionStorage.getItem('starterBrief')?.trim();\n      const legacyTargetUrl = sessionStorage.getItem('targetUrl')?.trim();\n      const storedStarter =\n        ideaParam ||\n        starterFromStorage ||\n        legacyUrlParam ||\n        legacyTargetUrl ||\n        '';\n      const templateParam = searchParams.get('template');\n      const detailsParam = searchParams.get('details');\n\n      const storedStyle = templateParam || sessionStorage.getItem('selectedStyle');\n      const storedModel = sessionStorage.getItem('selectedModel');\n      const storedInstructions = sessionStorage.getItem('additionalInstructions');\n      const fromIdeasOnly = !!(ideaParam || starterFromStorage);\n\n      if (storedStarter) {\n        setHasInitialSubmission(true);\n\n        sessionStorage.removeItem('starterBrief');\n        sessionStorage.removeItem('targetUrl');\n        sessionStorage.removeItem('selectedStyle');\n        sessionStorage.removeItem('selectedModel');\n        sessionStorage.removeItem('additionalInstructions');\n        sessionStorage.removeItem('siteMarkdown');\n\n        setStarterPrompt(storedStarter);\n        setSelectedStyle(storedStyle || 'modern');\n\n        if (detailsParam) {\n          setHomeContextInput(detailsParam);\n        } else if (storedStyle && !fromIdeasOnly) {\n          const styleNames: Record<string, string> = {\n            '1': 'Glassmorphism',\n            '2': 'Neumorphism',\n            '3': 'Brutalism',\n            '4': 'Minimalist',\n            '5': 'Dark Mode',\n            '6': 'Gradient Rich',\n            '7': '3D Depth',\n            '8': 'Retro Wave',\n            modern: 'Modern clean and minimalist',\n            playful: 'Fun colorful and playful',\n            professional: 'Corporate professional and sleek',\n            artistic: 'Creative artistic and unique',\n          };\n          const styleName = styleNames[storedStyle] || storedStyle;\n          let contextString = `${styleName} style design`;\n\n          if (storedInstructions) {\n            contextString += `. ${storedInstructions}`;\n          }\n\n          setHomeContextInput(contextString);\n        } else if (storedInstructions && !fromIdeasOnly) {\n          setHomeContextInput(storedInstructions);\n        }\n\n        if (storedModel) {\n          setAiModel(storedModel);\n        }\n\n        setShowHomeScreen(false);\n        setHomeScreenFading(false);\n        setShouldAutoGenerate(true);\n        sessionStorage.setItem('autoStart', 'true');\n      }\n"""

    marker = joined.index(old_init)
    close_gap_clear = "      }\n      \n      // Clear old conversation\n"
    end_old = joined.index(close_gap_clear, marker)
    joined = joined[:marker] + new_init_seg + joined[end_old + len("      }\n      \n      "):]

    joined = joined.replace("if (storedUrl && isMounted)", "if (storedStarter && isMounted)", 1)

    fx = """  // Start capturing screenshot if URL is provided on mount (from home screen)\n  useEffect(() => {\n    if (!showHomeScreen && starterPrompt && !urlScreenshot && !isCapturingScreenshot) {\n      let screenshotUrl = starterPrompt.trim();\n      if (!screenshotUrl.match(/^https?:\\/\\//i)) {\n        screenshotUrl = 'https://' + screenshotUrl;\n      }\n      captureUrlScreenshot(screenshotUrl);\n    }\n  }, [showHomeScreen, starterPrompt]); // eslint-disable-line react-hooks/exhaustive-deps\n\n"""
    if fx not in joined:
        raise RuntimeError("screenshot effect blob missing")
    joined = joined.replace(fx, "\n")

    ls = joined.splitlines(keepends=True)
    ls = splice_delete_wait_block(ls)
    joined = "".join(ls)

    pre_start = joined.index("    // Clear messages and immediately show the initial message\n")
    pre_end = joined.index("    setTimeout(async () => {", pre_start)
    new_pre = """    setChatMessages([]);\n    addChatMessage('Таны төслийг эхлүүлж байна — AI бүтцийг гаргаж байна.', 'system');\n\n    const sandboxPromise = !sandboxData ? createSandbox(true) : Promise.resolve(null);\n\n"""
    joined = joined[:pre_start] + new_pre + joined[pre_end:]

    snip_start = joined.index("        // Scrape the website\n")

    needle_fetch = """        const aiResponse = await fetch('/api/generate-ai-code-stream', {\n          method: 'POST',\n          headers: { 'Content-Type': 'application/json' },\n          body: JSON.stringify({ \n            prompt,\n            model: aiModel,\n            context: {\n              sandboxId: sandboxData?.sandboxId,\n              structure: structureContent,\n              conversationContext: conversationContext\n            }\n          })\n        });"""

    fn = joined.index(needle_fetch, snip_start)
    insertion_head = """        await sandboxPromise;\n\n        setUrlInput('');\n        setUrlOverlayVisible(false);\n        setUrlStatus(['AI-тай холбогдож байна…']);\n\n        let filteredContext = homeContextInput;\n        if (homeContextInput) {\n          const stylePatterns = [\n            'Glassmorphism style design',\n            'Neumorphism style design',\n            'Brutalism style design',\n            'Minimalist style design',\n            'Dark Mode style design',\n            'Gradient Rich style design',\n            '3D Depth style design',\n            'Retro Wave style design',\n            'Modern clean and minimalist style design',\n            'Fun colorful and playful style design',\n            'Corporate professional and sleek style design',\n            'Creative artistic and unique style design'\n          ];\n\n          const startsWithStyle = stylePatterns.some(pattern =>\n            homeContextInput.trim().startsWith(pattern)\n          );\n\n          if (startsWithStyle) {\n            const additionalMatch = homeContextInput.match(/\\. (.+)$/);\n            filteredContext = additionalMatch ? additionalMatch[1] : '';\n          }\n        }\n\n        const mergedConversation = {\n          ...conversationContext,\n          currentProject: projectName.trim() ? projectName : starterPrompt.trim().slice(0, 120),\n        };\n        setConversationContext(mergedConversation);\n\n        const prompt = `Generate a NEW React + Vite + TypeScript + Tailwind CSS application from this brief (greenfield / Lovable-style — not scraping or cloning).\n\nSANDBOX: The dev container boots as Vite react-ts — use .tsx/.ts, typical entry src/main.tsx and shell src/App.tsx.\n\nUSER BRIEF:\n${starterPrompt.trim()}\n\n${filteredContext ? `DESIGN / EXTRA CONTEXT:\n${filteredContext}\n` : ''}\nREQUIREMENTS:\n- Sections and copy should match the product described — not unrelated template pages.\n- Follow sandbox system rules for Tailwind, edits, etc.\n`;\n\n        setIsPreparingDesign(false);\n        setIsScreenshotLoaded(false);\n        setUrlScreenshot(null);\n        setTargetUrl('');\n        setUrlStatus(['Төлөвлөлт…', 'Код гаргаж байна…']);\n        setLoadingStage('planning');\n        setTimeout(() => {\n          setLoadingStage('generating');\n          setActiveTab('generation');\n        }, 1500);\n\n        setGenerationProgress(prev => ({\n          isGenerating: true,\n          status: 'Initializing AI...',\n          components: [],\n          currentComponent: 0,\n          streamedCode: '',\n          isStreaming: true,\n          isThinking: false,\n          thinkingText: undefined,\n          thinkingDuration: undefined,\n          // Keep previous files until new ones are generated\n          files: prev.files || [],\n          currentFile: undefined,\n          lastProcessedPosition: 0\n        }));\n\n        """

    needle_fetch_merged = needle_fetch.replace(
        "conversationContext: conversationContext", "conversationContext: mergedConversation"
    )

    fn_end = joined.index("        });", fn) + len("        });")

    joined = joined[:snip_start] + insertion_head + needle_fetch_merged + joined[fn_end:]

    succ_old = """          addChatMessage(
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
    if succ_old in joined:
        joined = joined.replace(
            succ_old,
            """          addChatMessage(\n            `Анхны хувилал бэлэн болсон.${homeContextInput ? ` Контекст: ${homeContextInput.slice(0, 140)}…` : ''}`,\n            'ai',\n            {\n              generatedCode: generatedCode\n            }\n          );""",
        )

    joined = joined.replace(
        "`Failed to clone website: ${error.message}`",
        "`Генераци амжилтгүй: ${error.message}`",
    )

    sidebar_old = """                onSubmit={(url, style, model, instructions) => {\n                  // Mark that we've had an initial submission\n                  setHasInitialSubmission(true);\n                  \n                  // Store the configuration in sessionStorage (same as home page)\n                  sessionStorage.setItem('targetUrl', url);\n                  sessionStorage.setItem('selectedStyle', style);\n                  sessionStorage.setItem('selectedModel', model);\n                  if (instructions) {\n                    sessionStorage.setItem('additionalInstructions', instructions);\n                  }\n                  sessionStorage.setItem('autoStart', 'true');\n                  \n                  // Start generation using the existing logic\n                  setStarterPrompt(url);\n                  setHomeContextInput(instructions || '');\n                  startGeneration();\n                }}"""
    sidebar_new = """                onSubmit={(brief, style, model, instructions) => {\n                  setHasInitialSubmission(true);\n\n                  sessionStorage.setItem('starterBrief', brief);\n                  sessionStorage.setItem('selectedStyle', style);\n                  sessionStorage.setItem('selectedModel', model);\n                  if (instructions) {\n                    sessionStorage.setItem('additionalInstructions', instructions);\n                  }\n                  sessionStorage.setItem('autoStart', 'true');\n\n                  const styleNames: Record<string, string> = {\n                    '1': 'Glassmorphism',\n                    '2': 'Neumorphism',\n                    '3': 'Brutalism',\n                    '4': 'Minimalist',\n                    '5': 'Dark Mode',\n                    '6': 'Gradient Rich',\n                    '7': '3D Depth',\n                    '8': 'Retro Wave',\n                  };\n                  const stylePhrase = `${styleNames[style] || style} style design`;\n                  const ctx =\n                    instructions && instructions.length > 0\n                      ? instructions.startsWith(stylePhrase)\n                        ? instructions\n                        : `${stylePhrase}. ${instructions}`\n                      : stylePhrase;\n                  setStarterPrompt(brief);\n                  setHomeContextInput(ctx);\n                  startGeneration();\n                }}"""
    if sidebar_old not in joined:
        raise RuntimeError("sidebar snippet not found")
    joined = joined.replace(sidebar_old, sidebar_new)

    ov_old = """      const isInitialGeneration = !sandboxData?.url && (urlScreenshot || isCapturingScreenshot || isPreparingDesign || loadingStage);\n      const isNewGenerationWithSandbox = isStartingNewGeneration && sandboxData?.url;\n      const shouldShowLoadingOverlay = (isInitialGeneration || isNewGenerationWithSandbox) && \n        (loading || generationProgress.isGenerating || isPreparingDesign || loadingStage || isCapturingScreenshot || isStartingNewGeneration);"""
    ov_new = """      const isInitialGeneration = !sandboxData?.url && (loadingStage !== null || isStartingNewGeneration);\n      const isNewGenerationWithSandbox = isStartingNewGeneration && sandboxData?.url;\n      const shouldShowLoadingOverlay = (isInitialGeneration || isNewGenerationWithSandbox) &&\n        (loading || generationProgress.isGenerating || loadingStage !== null || isStartingNewGeneration);"""
    if ov_old in joined:
        joined = joined.replace(ov_old, ov_new)

    st_old = """                  <p className=\"text-white text-lg font-medium\">\n                    {isCapturingScreenshot ? 'Analyzing website...' :\n                     isPreparingDesign ? 'Preparing design...' :\n                     generationProgress.isGenerating ? 'Generating code...' :\n                     'Loading...'}\n                  </p>\n                  \n                  {/* Subtle progress hint */}\n                  <p className=\"text-white/60 text-sm mt-2\">\n                    {isCapturingScreenshot ? 'Taking a screenshot of the site' :\n                     isPreparingDesign ? 'Understanding the layout and structure' :\n                     generationProgress.isGenerating ? 'Writing React components' :\n                     'Please wait...'}\n                  </p>"""
    st_new = """                  <p className=\"text-white text-lg font-medium\">\n                    {generationProgress.isGenerating ? 'Код гаргаж байна…' : 'Sandbox болон AI бэлдэж байна…'}\n                  </p>\n\n                  <p className=\"text-white/60 text-sm mt-2\">\n                    Тайлбараас апп барьж байна\n                  </p>"""
    if st_old in joined:
        joined = joined.replace(st_old, st_new)

    path.write_text(joined)
    print("OK:", path)


if __name__ == "__main__":
    main()
