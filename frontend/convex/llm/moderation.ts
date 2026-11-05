export type ModerationResult = { ok: true } | { ok: false; reason: string };

/**
 * Every provider call passes through here before its text can be stored, so no
 * call site is ever added without moderation. Docs: decisions.md "Safety, spend,
 * delivery".
 *
 * shortcut: pass-through until a moderation vendor is picked (build plan S2);
 * replace before any real child uses the app.
 */
export async function moderate(text: string): Promise<ModerationResult> {
  void text;
  return { ok: true };
}
