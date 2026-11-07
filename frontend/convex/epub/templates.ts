/** Everything untrusted stops being text here. Templates never see raw prose. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export const CONTENT_OPF_PATH = "OEBPS/content.opf";

export const renderContainer =
  (): string => `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="${CONTENT_OPF_PATH}" media-type="application/oebps-package+xml" />
  </rootfiles>
</container>`;

export const STORYBOOK_CSS = `
body {
  font-family: Georgia, "Times New Roman", serif;
  line-height: 1.6;
  margin: 0 auto;
  max-width: 34em;
  padding: 1.2em;
  color: #292524;
}
h1 { font-size: 1.6em; line-height: 1.2; margin: 0.4em 0 0.8em; }
.chapter-header { margin-top: 2em; }
.chapter-number {
  display: block;
  font-size: 0.8em;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #78716c;
}
.chapter-media { margin: 0 0 1.2em; text-align: center; page-break-inside: avoid; }
.chapter-media img { max-width: 100%; height: auto; border-radius: 10px; }
.caption { font-size: 0.85em; color: #78716c; font-style: italic; }
p { text-indent: 1.4em; margin: 0 0 0.9em; }
p.first-para { text-indent: 0; }
p.first-para::first-letter {
  float: left;
  font-size: 3.2em;
  line-height: 0.85;
  padding: 0.05em 0.08em 0 0;
}
.titlepage { text-align: center; }
.cover-title { font-size: 2.2em; margin: 0.6em 0 0.2em; }
.muted { color: #78716c; font-style: italic; }
nav ol { list-style: none; padding-left: 0; }
nav li { margin: 0.4em 0; }
`.trim();

export interface ChapterForEpub {
  index: number;
  title?: string;
  paragraphs: string[];
  hasImage: boolean;
}

/** A single fixed-layout cover; chapter typography must not add margins here. */
export function renderCover(title: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en" lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=1600, height=2400" />
  <title>${escapeHtml(title)} — Cover</title>
  <style>html, body { margin: 0; padding: 0; width: 100%; height: 100%; } svg { display: block; width: 100%; height: 100%; }</style>
</head>
<body epub:type="cover">
  <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 1600 2400" role="img" aria-labelledby="cover-title">
    <title id="cover-title">${escapeHtml(title)}</title>
    <image width="1600" height="2400" preserveAspectRatio="xMidYMid meet" xlink:href="../images/cover.jpg" />
  </svg>
</body>
</html>`;
}

export function renderTitlepage(input: {
  title: string;
  setting: string;
}): string {
  const title = escapeHtml(input.title);
  const setting = escapeHtml(input.setting);
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en" lang="en">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <link rel="stylesheet" type="text/css" href="../css/storybook.css" />
</head>
<body epub:type="frontmatter">
  <section class="titlepage" epub:type="titlepage">
    <h1 class="cover-title">${title}</h1>
    <p class="muted">${setting}</p>
  </section>
</body>
</html>`;
}

export function renderChapter(chapter: ChapterForEpub): string {
  const title = escapeHtml(chapter.title ?? "");
  const media = chapter.hasImage
    ? `<figure class="chapter-media">
      <img src="../images/ch_${chapter.index}.jpg" alt="${title} illustration" />
      <figcaption class="caption">${title}</figcaption>
    </figure>`
    : "";
  const prose = chapter.paragraphs
    .map(
      (paragraph, index) =>
        `<p class="${index === 0 ? "first-para" : ""}">${escapeHtml(paragraph)}</p>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en" lang="en">
<head>
  <meta charset="utf-8" />
  <title>Chapter ${chapter.index}: ${title}</title>
  <link rel="stylesheet" type="text/css" href="../css/storybook.css" />
</head>
<body epub:type="bodymatter">
  <section epub:type="chapter" id="ch-${chapter.index}">
    <header class="chapter-header">
      <span class="chapter-number">Chapter ${chapter.index}</span>
      <h1 class="chapter-title">${title}</h1>
    </header>
    ${media}
    <div class="chapter-prose">
${prose}
    </div>
  </section>
</body>
</html>`;
}

export interface ManifestItem {
  id: string;
  href: string;
  mediaType: string;
  properties?: string;
}

export function renderContentOpf(input: {
  storyId: string;
  title: string;
  createdAt: number;
  manifest: ManifestItem[];
  spine: string[];
}): string {
  const iso = new Date(input.createdAt).toISOString();
  const modified = `${iso.slice(0, 19)}Z`;
  const items = [
    '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav" />',
    '<item id="css" href="css/storybook.css" media-type="text/css" />',
    '<item id="titlepage" href="text/titlepage.xhtml" media-type="application/xhtml+xml" />',
    ...input.manifest.map(
      (item) =>
        `<item id="${item.id}" href="${item.href}" media-type="${item.mediaType}"${
          item.properties ? ` properties="${item.properties}"` : ""
        } />`,
    ),
  ].join("\n    ");
  const spineItems = input.spine
    .map(
      (idref) =>
        `<itemref idref="${idref}"${idref === "cover" ? ' properties="rendition:layout-pre-paginated rendition:spread-none"' : ""} />`,
    )
    .join("\n    ");

  return `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id" xml:lang="en">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">urn:tales-together:${escapeHtml(input.storyId)}</dc:identifier>
    <dc:title>${escapeHtml(input.title)}</dc:title>
    <dc:creator>A Young Author</dc:creator>
    <dc:language>en</dc:language>
    <dc:date>${iso.slice(0, 10)}</dc:date>
    <meta property="dcterms:modified">${modified}</meta>
  </metadata>
  <manifest>
    ${items}
  </manifest>
  <spine>
    ${spineItems}
  </spine>
</package>`;
}

export function renderNav(
  chapters: { index: number; title?: string }[],
  hasCover = false,
): string {
  const entries = chapters
    .map(
      (chapter) =>
        `<li><a href="text/chapter_${chapter.index}.xhtml">Chapter ${chapter.index}: ${escapeHtml(chapter.title ?? "")}</a></li>`,
    )
    .join("\n      ");

  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en" lang="en">
<head>
  <meta charset="utf-8" />
  <title>Contents</title>
  <link rel="stylesheet" type="text/css" href="css/storybook.css" />
</head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>Contents</h1>
    <ol>
      <li><a href="text/titlepage.xhtml">Title Page</a></li>
      ${entries}
    </ol>
  </nav>
  <nav epub:type="landmarks" hidden="hidden">
    <h2>Landmarks</h2>
    <ol>
      ${hasCover ? '<li><a epub:type="cover" href="text/cover.xhtml">Cover</a></li>' : ""}
      <li><a epub:type="titlepage" href="text/titlepage.xhtml">Title Page</a></li>
    </ol>
  </nav>
</body>
</html>`;
}
