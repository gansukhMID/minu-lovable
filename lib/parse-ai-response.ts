/**
 * Canonical parser for LLM codegen output (<file>, packages, markdown fallbacks).
 * Shared by `/api/apply-ai-code-stream` and `/api/apply-ai-code`.
 */

export interface ParsedAiCodeResponse {
  explanation: string;
  template: string;
  files: Array<{ path: string; content: string }>;
  packages: string[];
  commands: string[];
  structure: string | null;
}

function extractPackagesFromCode(content: string): string[] {
  const packages: string[] = [];
  const importRegex =
    /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)(?:\s*,\s*(?:\{[^}]*\}|\*\s+as\s+\w+|\w+))*\s+from\s+)?['"]([^'"]+)['"]/g;
  let importMatch;

  while ((importMatch = importRegex.exec(content)) !== null) {
    const importPath = importMatch[1];
    if (
      !importPath.startsWith('.') &&
      !importPath.startsWith('/') &&
      importPath !== 'react' &&
      importPath !== 'react-dom' &&
      !importPath.startsWith('@/')
    ) {
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

export type ParseAiResponseOptions = {
  /** Infer packages from import lines inside parsed files & blocks */
  extractPackagesFromImports?: boolean;
  /** Include markdown / heuristic file extraction beyond strict <file> tags */
  extendedHeuristics?: boolean;
  logPrefix?: string;
};

export function parseAiCodeResponse(
  response: string,
  opts: ParseAiResponseOptions = {}
): ParsedAiCodeResponse {
  const {
    extractPackagesFromImports = false,
    extendedHeuristics = true,
    logPrefix = '[parse-ai-code]',
  } = opts;

  const sections: ParsedAiCodeResponse = {
    files: [],
    commands: [],
    packages: [],
    structure: null,
    explanation: '',
    template: '',
  };

  const pushPackagesFromContent = (content: string) => {
    if (!extractPackagesFromImports) return;
    for (const pkg of extractPackagesFromCode(content)) {
      if (!sections.packages.includes(pkg)) {
        sections.packages.push(pkg);
        console.log(`${logPrefix} Package detected from imports: ${pkg}`);
      }
    }
  };

  const fileMap = new Map<string, { content: string; isComplete: boolean }>();
  const fileRegex = /<file path="([^"]+)">([\s\S]*?)(?:<\/file>|$)/g;
  let match: RegExpExecArray | null;
  while ((match = fileRegex.exec(response)) !== null) {
    const filePath = match[1];
    const content = match[2].trim();
    const hasClosingTag = response.substring(match.index, match.index + match[0].length).includes('</file>');
    const existing = fileMap.get(filePath);

    let shouldReplace = false;
    if (!existing) {
      shouldReplace = true;
    } else if (!existing.isComplete && hasClosingTag) {
      shouldReplace = true;
      console.log(`${logPrefix} Replacing incomplete ${filePath} with complete version`);
    } else if (existing.isComplete && hasClosingTag && content.length > existing.content.length) {
      shouldReplace = true;
      console.log(`${logPrefix} Replacing ${filePath} with longer complete version`);
    } else if (!existing.isComplete && !hasClosingTag && content.length > existing.content.length) {
      shouldReplace = true;
    }

    if (shouldReplace) {
      if (content.includes('...') && !content.includes('...props') && !content.includes('...rest')) {
        console.warn(`${logPrefix} Warning: ${filePath} contains ellipsis, may be truncated`);
        if (!existing) {
          fileMap.set(filePath, { content, isComplete: hasClosingTag });
        }
      } else {
        fileMap.set(filePath, { content, isComplete: hasClosingTag });
      }
    }
  }

  for (const [path, { content, isComplete }] of fileMap.entries()) {
    if (!isComplete) {
      console.log(`${logPrefix} Warning: File ${path} appears truncated (no closing tag)`);
    }
    sections.files.push({ path, content });
    pushPackagesFromContent(content);
  }

  if (extendedHeuristics) {
    const markdownFileRegex = /```(?:file )?path="([^"]+)"\n([\s\S]*?)```/g;
    while ((match = markdownFileRegex.exec(response)) !== null) {
      const filePath = match[1];
      const content = match[2].trim();
      sections.files.push({ path: filePath, content });
      pushPackagesFromContent(content);
    }

    const generatedFilesMatch = response.match(/Generated Files?:\s*([^\n]+)/i);
    if (generatedFilesMatch) {
      const filesList = generatedFilesMatch[1]
        .split(',')
        .map((f) => f.trim())
        .filter(
          (f) =>
            f.endsWith('.jsx') ||
            f.endsWith('.js') ||
            f.endsWith('.tsx') ||
            f.endsWith('.ts') ||
            f.endsWith('.css') ||
            f.endsWith('.json') ||
            f.endsWith('.html')
        );
      console.log(`${logPrefix} Detected generated files from plain text: ${filesList.join(', ')}`);

      for (const fileName of filesList) {
        const fileContentRegex = new RegExp(
          `${fileName}[\\s\\S]*?(?:import[\\s\\S]+?)(?=Generated Files:|Applying code|$)`,
          'i'
        );
        const fileContentMatch = response.match(fileContentRegex);
        if (fileContentMatch) {
          const codeMatch = fileContentMatch[0].match(/^(import[\s\S]+)$/m);
          if (codeMatch) {
            const filePath = fileName.includes('/') ? fileName : `src/components/${fileName}`;
            sections.files.push({ path: filePath, content: codeMatch[1].trim() });
            pushPackagesFromContent(codeMatch[1]);
          }
        }
      }
    }

    const codeBlockRegex = /```(?:jsx?|tsx?|javascript|typescript)?\n([\s\S]*?)```/g;
    while ((match = codeBlockRegex.exec(response)) !== null) {
      const content = match[1].trim();
      const fileNameMatch = content.match(/\/\/\s*(?:File:|Component:)\s*([^\n]+)/);
      if (fileNameMatch) {
        const fileName = fileNameMatch[1].trim();
        const filePath = fileName.includes('/') ? fileName : `src/components/${fileName}`;
        if (!sections.files.some((f) => f.path === filePath)) {
          sections.files.push({ path: filePath, content });
          pushPackagesFromContent(content);
        }
      }
    }
  }

  const cmdRegex = /<command>(.*?)<\/command>/g;
  while ((match = cmdRegex.exec(response)) !== null) {
    sections.commands.push(match[1].trim());
  }

  const pkgRegex = /<package>(.*?)<\/package>/g;
  while ((match = pkgRegex.exec(response)) !== null) {
    sections.packages.push(match[1].trim());
  }

  const packagesRegex = /<packages>([\s\S]*?)<\/packages>/;
  const packagesMatch = response.match(packagesRegex);
  if (packagesMatch) {
    const packagesContent = packagesMatch[1].trim();
    const packagesList = packagesContent
      .split(/[\n,]+/)
      .map((pkg) => pkg.trim())
      .filter((pkg) => pkg.length > 0);
    sections.packages.push(...packagesList);
  }

  const structureMatch = /<structure>([\s\S]*?)<\/structure>/;
  const structResult = response.match(structureMatch);
  if (structResult) sections.structure = structResult[1].trim();

  const explanationMatch = /<explanation>([\s\S]*?)<\/explanation>/;
  const explResult = response.match(explanationMatch);
  if (explResult) sections.explanation = explResult[1].trim();

  const templateMatch = /<template>(.*?)<\/template>/;
  const templResult = response.match(templateMatch);
  if (templResult) sections.template = templResult[1].trim();

  return sections;
}
