/**
 * Composes the portrait cover: AI art as the background, with the title and
 * typed author credit drawn on top. The image model never draws text.
 *
 * Pure string output so it can be tested in the edge runtime; the Node action
 * in rasterize.ts turns it into the JPEG that ships in the EPUB.
 */

const COVER_WIDTH = 1600;
const COVER_HEIGHT = 2400;
const TITLE_MAX_WIDTH = 1360;
const TITLE_MAX_LINES = 3;
const TITLE_MAX_SIZE = 168;
const TITLE_MIN_SIZE = 76;
const TITLE_CHAR_EM = 0.58;
const AUTHOR_BASE_SIZE = 64;
const AUTHOR_MAX_WIDTH = 1200;
const AUTHOR_CHAR_EM = 0.55;

const escapeXml = (text: string): string =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function wrapTitle(title: string, size: number): string[] {
  const maxChars = Math.max(
    1,
    Math.floor(TITLE_MAX_WIDTH / (size * TITLE_CHAR_EM)),
  );
  const lines: string[] = [];
  let line = "";

  for (const word of title.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && next.length > maxChars) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function fitTitle(title: string): { size: number; lines: string[] } {
  for (let size = TITLE_MAX_SIZE; size >= TITLE_MIN_SIZE; size -= 4) {
    const lines = wrapTitle(title, size);
    if (lines.length <= TITLE_MAX_LINES) return { size, lines };
  }
  return { size: TITLE_MIN_SIZE, lines: wrapTitle(title, TITLE_MIN_SIZE) };
}

/** Force the text to fit when the rough width estimate still overflows. */
function lengthAttribute(text: string, size: number, charEm: number): string {
  return text.length * size * charEm > TITLE_MAX_WIDTH
    ? ` textLength="${TITLE_MAX_WIDTH}" lengthAdjust="spacingAndGlyphs"`
    : "";
}

export interface CoverSvgInput {
  title: string;
  authorName?: string;
  /** `data:<mime>;base64,…` for the portrait art. */
  artHref: string;
}

export function renderCoverSvg(input: CoverSvgInput): string {
  const title = escapeXml(input.title.trim() || "Untitled");
  const author = escapeXml(input.authorName?.trim() || "A Young Author");
  const { size, lines } = fitTitle(title);

  const lineHeight = Math.round(size * 1.12);
  const blockHeight = size + (lines.length - 1) * lineHeight;
  const firstBaseline = Math.round(110 + (770 - blockHeight) / 2 + size * 0.82);

  const titleLines = lines
    .map((line, index) => {
      const y = firstBaseline + index * lineHeight;
      return `<text x="800" y="${y}" font-family="Fraunces" font-weight="700" font-size="${size}" fill="#FFF8E7" text-anchor="middle" paint-order="stroke" stroke="#000" stroke-opacity="0.32" stroke-width="6"${lengthAttribute(
        line,
        size,
        TITLE_CHAR_EM,
      )}>${line}</text>`;
    })
    .join("\n");

  const authorText = `Written by ${author}`;
  const authorSize = Math.min(
    AUTHOR_BASE_SIZE,
    Math.max(
      36,
      Math.floor(AUTHOR_MAX_WIDTH / (authorText.length * AUTHOR_CHAR_EM)),
    ),
  );
  const authorLength =
    authorText.length * authorSize * AUTHOR_CHAR_EM > AUTHOR_MAX_WIDTH
      ? ` textLength="${AUTHOR_MAX_WIDTH}" lengthAdjust="spacingAndGlyphs"`
      : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${COVER_WIDTH}" height="${COVER_HEIGHT}" viewBox="0 0 ${COVER_WIDTH} ${COVER_HEIGHT}">
  <defs>
    <linearGradient id="top-scrim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#000" stop-opacity="0.62"/>
      <stop offset="1" stop-color="#000" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="bottom-scrim" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stop-color="#000" stop-opacity="0.66"/>
      <stop offset="1" stop-color="#000" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <image href="${escapeXml(input.artHref)}" width="${COVER_WIDTH}" height="${COVER_HEIGHT}" preserveAspectRatio="xMidYMid slice"/>
  <rect width="${COVER_WIDTH}" height="820" fill="url(#top-scrim)"/>
  <rect y="1960" width="${COVER_WIDTH}" height="440" fill="url(#bottom-scrim)"/>
${titleLines}
  <text x="800" y="2270" font-family="Lexend" font-size="${authorSize}" fill="#FFF8E7" text-anchor="middle"${authorLength}>${authorText}</text>
</svg>`;
}
