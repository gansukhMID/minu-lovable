/** Parse `<edit>` blocks from model output (direct file-write fallback; not tied to any external merge API). */
export interface ParsedEditBlock {
  targetFile: string;
  instructions: string;
  update: string;
}

export function parseEditBlocks(text: string): ParsedEditBlock[] {
  const edits: ParsedEditBlock[] = [];
  const editRegex = /<edit\s+target_file="([^"]+)">([\s\S]*?)<\/edit>/g;
  let match: RegExpExecArray | null;
  while ((match = editRegex.exec(text)) !== null) {
    const targetFile = match[1].trim();
    const inner = match[2];
    const instrMatch = inner.match(/<instructions>([\s\S]*?)<\/instructions>/);
    const updateMatch = inner.match(/<update>([\s\S]*?)<\/update>/);
    const instructions = instrMatch ? instrMatch[1].trim() : '';
    const update = updateMatch ? updateMatch[1].trim() : '';
    if (targetFile && update) {
      edits.push({ targetFile, instructions, update });
    }
  }
  return edits;
}
