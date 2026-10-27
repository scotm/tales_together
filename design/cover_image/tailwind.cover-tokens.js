/**
 * Tailwind tokens for the three cover designs.
 *
 * Merge into tailwind.config.js:
 *
 *   const cover = require("./design/cover_image/tailwind.cover-tokens.js");
 *   module.exports = {
 *     theme: { extend: { colors: cover.colors, fontFamily: cover.fontFamily } },
 *   };
 *
 * Fonts are loaded from Google Fonts in the app shell (see `googleFontsHref`),
 * and bundled as local TTF/WOFF2 for server-side rasterisation and the EPUB.
 */

const colors = {
  // Option A — The Penny Dreadful Deluxe
  dreadful: {
    parchment: "#F3E7CF",
    paper: "#EADCBB",
    ink: "#1F1A17",
    oxblood: "#8E2A2A",
    oxbloodDeep: "#6E1F1F",
    gilt: "#B8893A",
  },
  // Option B — Sticker Bomb Saturday
  pop: {
    blue: "#2563EB",
    sky: "#60A5FA",
    lemon: "#FDE047",
    pink: "#EC4899",
    orange: "#F97316",
    mint: "#4ADE80",
    ink: "#111111",
    otter: "#B5733A",
    otterLight: "#E8C39E",
  },
  // Option C — The Midnight Bedtime Atlas
  atlas: {
    navy: "#050A26",
    indigo: "#151A4F",
    plum: "#3B1D5E",
    hills: "#0A0F2E",
    gold: "#F5D77A",
    lavender: "#C7B8FF",
    mist: "#E9E4FF",
    window: "#FDE68A",
  },
};

const fontFamily = {
  // Option A
  rye: ["Rye", "Fraunces", "Georgia", "serif"],
  fraunces: ["Fraunces", "Georgia", "serif"],
  // Option B
  bangers: ["Bangers", "Impact", "Arial Black", "sans-serif"],
  fredoka: ["Fredoka", "Nunito", "Helvetica Neue", "sans-serif"],
  // Option C
  yeseva: ["Yeseva One", "Playfair Display", "Georgia", "serif"],
  nunito: ["Nunito", "Lexend", "Helvetica Neue", "sans-serif"],
  // Shared body font (already used across the app + EPUB)
  lexend: ["Lexend", "Helvetica Neue", "sans-serif"],
};

/** One <link> for the app shell; covers every cover design plus the body font. */
const googleFontsHref =
  "https://fonts.googleapis.com/css2" +
  "?family=Rye" +
  "&family=Fraunces:ital,opsz,wght@0,9..144,700;0,9..144,900;1,9..144,400;1,9..144,600" +
  "&family=Bangers" +
  "&family=Fredoka:wght@500;700" +
  "&family=Yeseva+One" +
  "&family=Nunito:ital,wght@0,400;0,700;0,800;1,300;1,400" +
  "&family=Lexend:wght@400;500;700" +
  "&display=swap";

module.exports = { colors, fontFamily, googleFontsHref };
