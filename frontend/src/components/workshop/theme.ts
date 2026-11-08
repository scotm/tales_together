import type { TextStyle } from "react-native";

/**
 * Storybook Workshop tokens, extracted from storybook-workshop.figcraft
 * (docs/design/storybook-workshop-implementation.md §6). The design defines no
 * styles/variables of its own, so these are the canonical values.
 */
export const colors = {
  paper: "#F5F3EB",
  surface: "#FFFEF8",
  ink: "#192F3D",
  mutedInk: "#536673",
  mint: "#CDE4D1",
  /** Pool-of-light mint used inside the paper theatre. */
  mintSoft: "#E0ECDD",
  mintDeep: "#AECABD",
  apricot: "#F6AE89",
  apricotDeep: "#CE7446",
  violet: "#5267BB",
  gold: "#F2D574",
  lavender: "#DCE2F4",
  border: "#D4D8CE",
  /** Not in the mockups: error text with AA contrast on paper/surface. */
  danger: "#A3261B",
  /** Pressed depth under ink buttons. */
  inkShadow: "#0D1C26",
  /** Pressed depth under apricot buttons. */
  apricotShadow: "#C97F5A",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  phoneGutter: 20,
  desktopGutter: 44,
} as const;

export const radii = {
  control: 12,
  card: 20,
  panel: 24,
  postcard: 28,
  pill: 999,
} as const;

/** Implementation defaults to verify on devices, not design measurements. */
export const layout = {
  contentMaxWidth: 1440,
  readingMaxWidth: 720,
  /** Wide split (shelf beside preview) only when both fit. */
  splitMinWidth: 1100,
  phoneMaxWidth: 600,
  minTarget: 44,
} as const;

/**
 * Font faces loaded in `_layout.tsx`. Each weight is its own family so Android
 * does not synthesise bold; never combine these with `fontWeight`.
 */
export const fontFaces = {
  regular: "Poppins-Regular",
  medium: "Poppins-Medium",
  semiBold: "Poppins-SemiBold",
  bold: "Poppins-Bold",
  serif: "SourceSerif4-Regular",
  serifSemiBold: "SourceSerif4-Semibold",
} as const;

/** Semantic type variants, following the 130% line height in the design. */
export const type = {
  /** Desktop "What if…" display. Components step this down on phones. */
  display: { fontFamily: fontFaces.bold, fontSize: 76, lineHeight: 92 },
  /** Chapter questions and large page titles. */
  chapter: { fontFamily: fontFaces.bold, fontSize: 56, lineHeight: 64 },
  heading: { fontFamily: fontFaces.bold, fontSize: 44, lineHeight: 52 },
  title: { fontFamily: fontFaces.semiBold, fontSize: 20, lineHeight: 28 },
  intro: { fontFamily: fontFaces.regular, fontSize: 21, lineHeight: 30 },
  body: { fontFamily: fontFaces.regular, fontSize: 17, lineHeight: 26 },
  bodyStrong: { fontFamily: fontFaces.medium, fontSize: 17, lineHeight: 26 },
  label: { fontFamily: fontFaces.semiBold, fontSize: 15, lineHeight: 20 },
  button: { fontFamily: fontFaces.semiBold, fontSize: 17, lineHeight: 22 },
  small: { fontFamily: fontFaces.regular, fontSize: 14, lineHeight: 20 },
  /** A world or hero choice, set in Poppins rather than the book serif. */
  reel: { fontFamily: fontFaces.semiBold, fontSize: 27, lineHeight: 35 },
  eyebrow: {
    fontFamily: fontFaces.semiBold,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 1.6,
    textTransform: "uppercase",
  },
  storyTitle: {
    fontFamily: fontFaces.serifSemiBold,
    fontSize: 35,
    lineHeight: 45,
  },
  bookTitle: {
    fontFamily: fontFaces.serifSemiBold,
    fontSize: 44,
    lineHeight: 54,
  },
  cardTitle: {
    fontFamily: fontFaces.serifSemiBold,
    fontSize: 26,
    lineHeight: 34,
  },
  prose: { fontFamily: fontFaces.serif, fontSize: 19, lineHeight: 31 },
} as const satisfies Record<string, TextStyle>;
