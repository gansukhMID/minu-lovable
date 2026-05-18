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

export type EditApplyResolution =
  | { ok: true; content: string; mode: 'full' | 'patch' }
  | { ok: false; reason: string };

/**
 * Prefer a small Find/Replace patch when instructions say so; otherwise full-file write.
 * Avoids clobbering entire files when the model only meant a surgical change.
 */
export function resolveEditApply(
  edit: ParsedEditBlock,
  existingBody: string | undefined
): EditApplyResolution {
  const inst = edit.instructions.trim();
  const upd = edit.update;

  const treatAsFull =
    !inst ||
    /\b(full|entire|whole)\s+file\b/i.test(inst) ||
    /\bREPLACE_(ENTIRE_FILE|WHOLE_FILE)\b/i.test(inst);

  if (treatAsFull) {
    return { ok: true, content: upd, mode: 'full' };
  }

  const paired = inst.match(/\bFind:\s*([\s\S]+?)\s*\bReplace:\s*([\s\S]+)$/im);
  if (paired && existingBody != null && existingBody.length > 0) {
    const find = paired[1].trim();
    const replace = paired[2].trim();
    if (!existingBody.includes(find)) {
      return {
        ok: false,
        reason: `<edit> patch for ${edit.targetFile}: Find block not found in current file — skipped full-file overwrite to avoid clobbering.`,
      };
    }
    const once = existingBody.replace(find, replace);
    return { ok: true, content: once, mode: 'patch' };
  }

  if (existingBody == null || existingBody.length === 0) {
    console.warn(
      `[parse-edit-blocks] No existing file body for ${edit.targetFile}; using <update> as full file (instructions present)`
    );
    return { ok: true, content: upd, mode: 'full' };
  }

  return {
    ok: false,
    reason: `<edit> for ${edit.targetFile}: instructions present but not a recognized patch (use Find:/Replace: or mark full file). Skipped overwrite.`,
  };
}
