export function bookFilename(title: string): string {
  const name = title
    // biome-ignore lint/suspicious/noControlCharactersInRegex: filenames must exclude control characters
    .replace(/[\u0000-\u001f\u007f/\\:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[. ]+|[. ]+$/g, "")
    .slice(0, 100);
  return `${name || "My Storybook"}.epub`;
}
