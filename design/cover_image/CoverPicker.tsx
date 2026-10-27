/**
 * CoverPicker — the "Publishing Ceremony" screen where the child chooses
 * which of the three generated covers becomes the front of their book.
 *
 * Design notes
 * ------------
 * - Three physical-feeling books on a wooden shelf. Hover/tap tilts them in 3D.
 * - Tapping a book "pulls it off the shelf" (scale + lift), reads its silly
 *   blurb aloud, and buzzes the haptics once.
 * - 🎲 "Spin the Silly Blurb" cycles the ridiculous disclaimers printed on the
 *   cover. The chosen blurb is persisted on the Story (`cover_blurb`) and
 *   rendered into the EPUB cover by `generate_cover_image`.
 * - The SVGs are imported as React components (SVGR) so the Google Fonts
 *   `@import` inside them loads in the browser. `<img src="...svg">` would NOT
 *   load external fonts — don't swap it out.
 * - Calm Bedtime Mode flips the shelf to `bg-slate-950` and dims everything but
 *   the Midnight Atlas, which was designed for that mode.
 *
 * Tailwind tokens used here come from ./tailwind.cover-tokens.js.
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

// Vite: `?react`; Next.js: configure @svgr/webpack and drop the suffix.
import PennyDreadfulCover from "./option-a-penny-dreadful.svg?react";
import StickerPopCover from "./option-b-sticker-pop.svg?react";
import MidnightAtlasCover from "./option-c-midnight-atlas.svg?react";

import { useStoryStore } from "@/stores/storyStore";
import { speak } from "@/lib/tts";
import { buzz } from "@/lib/haptics";

export type CoverDesignId = "penny_dreadful" | "sticker_pop" | "midnight_atlas";

export interface CoverOption {
  id: CoverDesignId;
  name: string;
  tagline: string;
  Svg: React.FC<React.SVGProps<SVGSVGElement>>;
  /** Tailwind classes for the picker card chrome (NOT the cover itself). */
  chrome: {
    shelfLabel: string;
    titleFont: string;
    ring: string;
    button: string;
    spine: string;
  };
  /** Pairs of [line1, line2] printed on the cover's stamp/sticker/footer. */
  sillyBlurbs: [string, string][];
}

export const COVER_OPTIONS: CoverOption[] = [
  {
    id: "penny_dreadful",
    name: "The Penny Dreadful Deluxe",
    tagline: "Terribly old-fashioned. Astonishingly dramatic.",
    Svg: PennyDreadfulCover,
    chrome: {
      shelfLabel: "bg-dreadful-parchment text-dreadful-ink",
      titleFont: "font-rye",
      ring: "ring-dreadful-oxblood",
      button: "bg-dreadful-oxblood text-dreadful-parchment",
      spine: "bg-dreadful-ink",
    },
    sillyBlurbs: [
      ["CONTAINS 100% GENUINE IMAGINATION", "NO DRAGONS WERE HARMED"],
      ["APPROVED BY THE ROYAL SOCIETY", "OF VERY SERIOUS OTTERS"],
      ["WARNING: MAY CONTAIN", "AN UNREASONABLE QUANTITY OF CAKE"],
      ["NOT TO BE READ", "WHILE OPERATING A SUBMARINE"],
      ["PRINTED ON GENUINE", "IMAGINARY PAPER"],
    ],
  },
  {
    id: "sticker_pop",
    name: "Sticker Bomb Saturday",
    tagline: "Loud. Shiny. Absolutely covered in stickers.",
    Svg: StickerPopCover,
    chrome: {
      shelfLabel: "bg-pop-lemon text-pop-ink",
      titleFont: "font-bangers tracking-wider",
      ring: "ring-pop-pink",
      button: "bg-pop-pink text-white",
      spine: "bg-pop-ink",
    },
    sillyBlurbs: [
      ["WARNING:", "MAY CAUSE GIGGLES"],
      ["NOW WITH", "EXTRA WHOOSH"],
      ["DANGER:", "CONTAINS A WHISK"],
      ["FREE INSIDE:", "ONE (1) ENTIRE STORY"],
      ["BATTERIES", "NOT REQUIRED"],
    ],
  },
  {
    id: "midnight_atlas",
    name: "The Midnight Bedtime Atlas",
    tagline: "Hush. Your hero is up there, in the stars.",
    Svg: MidnightAtlasCover,
    chrome: {
      shelfLabel: "bg-atlas-navy text-atlas-gold",
      titleFont: "font-yeseva",
      ring: "ring-atlas-gold",
      button: "bg-atlas-gold text-atlas-navy",
      spine: "bg-atlas-plum",
    },
    sillyBlurbs: [
      ["CERTIFIED BY THE MINISTRY OF BEDTIME", "Approx. one yawn per chapter · results may vary"],
      ["OFFICIALLY SLEEPY", "Do not read to owls"],
      ["STAR CHART ACCURACY: 3%", "Otter accuracy: 100%"],
      ["SUITABLE FOR PILLOW FORTS", "and most blanket caves"],
    ],
  },
];

export function CoverPicker({
  onChoose,
}: {
  onChoose: (designId: CoverDesignId, blurb: [string, string]) => void;
}) {
  const calmMode = useStoryStore((s) => s.calmMode);
  const story = useStoryStore((s) => s.story);

  const [selected, setSelected] = useState<CoverDesignId | null>(null);
  const [blurbIndex, setBlurbIndex] = useState<Record<CoverDesignId, number>>({
    penny_dreadful: 0,
    sticker_pop: 0,
    midnight_atlas: 0,
  });

  const pick = (opt: CoverOption) => {
    setSelected(opt.id);
    buzz("medium");
    const [a, b] = opt.sillyBlurbs[blurbIndex[opt.id]];
    speak(`${opt.name}. ${a}. ${b}.`);
  };

  const spinBlurb = (opt: CoverOption) => {
    buzz("light");
    setBlurbIndex((prev) => ({
      ...prev,
      [opt.id]: (prev[opt.id] + 1) % opt.sillyBlurbs.length,
    }));
  };

  const chosen = COVER_OPTIONS.find((o) => o.id === selected);

  return (
    <section
      className={[
        "min-h-screen px-6 py-10 flex flex-col items-center gap-8 transition-colors duration-700",
        calmMode ? "bg-slate-950 text-amber-100" : "bg-[#FDF6E3] text-stone-900",
      ].join(" ")}
      aria-labelledby="cover-picker-heading"
    >
      <header className="text-center space-y-2">
        <p className="text-sm uppercase tracking-[0.3em] opacity-70">The Publishing Ceremony</p>
        <h1 id="cover-picker-heading" className="font-fraunces text-4xl md:text-5xl font-black">
          Which cover goes on <span className="italic">{story?.title ?? "your book"}</span>?
        </h1>
        <p className="text-lg opacity-80">Tap a book to hear it. Spin the silly sticker if you like.</p>
      </header>

      {/* ---- the shelf ---- */}
      <div className="relative w-full max-w-6xl">
        <ul
          className="grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-6 px-4 pb-10"
          style={{ perspective: "1600px" }}
          role="radiogroup"
          aria-label="Cover designs"
        >
          {COVER_OPTIONS.map((opt) => {
            const isSelected = selected === opt.id;
            const dimmed = calmMode && opt.id !== "midnight_atlas" && !isSelected;
            const blurb = opt.sillyBlurbs[blurbIndex[opt.id]];

            return (
              <li key={opt.id} className="flex flex-col items-center gap-4">
                <motion.button
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  aria-label={`${opt.name}. ${opt.tagline}`}
                  onClick={() => pick(opt)}
                  initial={false}
                  animate={{
                    rotateY: isSelected ? 0 : -14,
                    scale: isSelected ? 1.06 : 1,
                    y: isSelected ? -18 : 0,
                    opacity: dimmed ? 0.45 : 1,
                  }}
                  whileHover={{ rotateY: -4, scale: 1.04, y: -10 }}
                  whileTap={{ scale: 0.98 }}
                  transition={{ type: "spring", stiffness: 220, damping: 18 }}
                  className={[
                    "relative w-[260px] md:w-[300px] aspect-[2/3] rounded-r-2xl rounded-l-md overflow-hidden",
                    "shadow-[0_30px_60px_-20px_rgba(0,0,0,0.45)]",
                    "focus:outline-none focus-visible:ring-8",
                    opt.chrome.ring,
                    isSelected ? "ring-8" : "ring-0",
                  ].join(" ")}
                  style={{ transformStyle: "preserve-3d" }}
                >
                  {/* spine */}
                  <span
                    aria-hidden
                    className={`absolute inset-y-0 left-0 w-4 ${opt.chrome.spine} opacity-80`}
                    style={{ transform: "translateZ(-2px)" }}
                  />
                  {/* page edge */}
                  <span
                    aria-hidden
                    className="absolute inset-y-2 right-0 w-2 bg-stone-100"
                    style={{ transform: "translateZ(-1px)" }}
                  />
                  {/* the cover art itself */}
                  <opt.Svg className="w-full h-full block" aria-hidden />
                  {/* glossy sweep */}
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-white/0 via-white/15 to-white/0"
                  />
                </motion.button>

                {/* shelf label */}
                <div
                  className={[
                    "w-[260px] md:w-[300px] rounded-xl border-2 border-stone-900 border-b-[6px] px-4 py-3 text-center",
                    opt.chrome.shelfLabel,
                  ].join(" ")}
                >
                  <p className={`${opt.chrome.titleFont} text-2xl leading-tight`}>{opt.name}</p>
                  <p className="text-sm opacity-80 mt-1">{opt.tagline}</p>
                </div>

                {/* silly blurb spinner */}
                <div className="flex items-center gap-2">
                  <AnimatePresence mode="wait">
                    <motion.p
                      key={`${opt.id}-${blurbIndex[opt.id]}`}
                      initial={{ y: 8, opacity: 0, rotate: -2 }}
                      animate={{ y: 0, opacity: 1, rotate: 0 }}
                      exit={{ y: -8, opacity: 0, rotate: 2 }}
                      transition={{ duration: 0.18 }}
                      className="text-xs font-lexend uppercase tracking-wide text-center max-w-[200px] opacity-80"
                    >
                      {blurb[0]}
                      <br />
                      {blurb[1]}
                    </motion.p>
                  </AnimatePresence>
                  <button
                    type="button"
                    onClick={() => spinBlurb(opt)}
                    aria-label={`Spin the silly sticker on ${opt.name}`}
                    className="rounded-full border-2 border-stone-900 border-b-[6px] active:border-b-2 active:translate-y-[4px] bg-amber-300 text-stone-900 w-12 h-12 text-2xl leading-none"
                  >
                    🎲
                  </button>
                </div>
              </li>
            );
          })}
        </ul>

        {/* wooden shelf plank */}
        <div
          aria-hidden
          className="absolute left-0 right-0 bottom-0 h-6 rounded-md bg-gradient-to-b from-amber-700 to-amber-900 shadow-[0_12px_20px_-6px_rgba(0,0,0,0.5)]"
        />
      </div>

      {/* ---- confirm ---- */}
      <AnimatePresence>
        {chosen && (
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            className="sticky bottom-6 flex flex-col sm:flex-row items-center gap-4"
          >
            <button
              type="button"
              onClick={() => speak(`${chosen.name}. ${chosen.sillyBlurbs[blurbIndex[chosen.id]].join(". ")}`)}
              className="rounded-full border-2 border-stone-900 border-b-[6px] active:border-b-2 active:translate-y-[4px] bg-white text-stone-900 px-5 py-3 text-lg"
              aria-label="Read the chosen cover aloud"
            >
              🔊 Read it to me
            </button>
            <button
              type="button"
              onClick={() => {
                buzz("heavy");
                onChoose(chosen.id, chosen.sillyBlurbs[blurbIndex[chosen.id]]);
              }}
              className={[
                "rounded-full border-2 border-stone-900 border-b-[6px] active:border-b-2 active:translate-y-[4px]",
                "px-8 py-4 text-2xl font-fraunces font-black",
                chosen.chrome.button,
              ].join(" ")}
            >
              📚 Make my book with “{chosen.name}”!
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
