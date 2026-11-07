/**
 * The recap prompt asks for "Previously on…", so models often answer with the
 * preamble the UI also prints. Strip one so the line reads once.
 */
export function recapSentence(recap: string): string {
  return recap.replace(/^previously(?: on)?[,:!.\s]*/i, "");
}
