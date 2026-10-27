"""
generate_cover_image — turn one of the three SVG cover designs into the
EPUB's `images/cover.jpg` (and the `Story.cover_image` field).

Pipeline
--------
  Story (title, author, cover_design, cover_blurb, hero illustration)
    → load design SVG from design/cover_image/
    → fill `id="slot-*"` nodes (lxml, no Jinja — the SVGs stay previewable)
    → optionally inject the real hero illustration into `slot-hero`
      and drop the hand-drawn `slot-hero-placeholder`
    → rasterise with resvg (local font dir; the SVG `@import` is ignored)
    → PNG → JPEG via Pillow → save to Story.cover_image

Why resvg, not cairosvg/Playwright?
  * cairosvg ignores `paint-order`, `feDropShadow` and most font fallbacks.
  * Playwright gives perfect parity with the browser preview but needs a
    Chromium in the Celery worker image. Keep it as the documented fallback.
  * resvg is a single static binary, supports filters/masks/patterns used
    here, and takes `--use-fonts-dir` so we can ship the Google Fonts TTFs.

Fonts live in design/cover_image/fonts/ (OFL licences, see README).
"""

from __future__ import annotations

import base64
import io
import re
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

from lxml import etree
from PIL import Image

DESIGN_DIR = Path(__file__).resolve().parent
FONTS_DIR = DESIGN_DIR / "fonts"
SVG_NS = "http://www.w3.org/2000/svg"
XLINK_NS = "http://www.w3.org/1999/xlink"

COVER_WIDTH, COVER_HEIGHT = 1600, 2400  # 2:3, Apple Books / Kobo / Kindle happy


# ---------------------------------------------------------------------------
# Design registry
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class CoverDesign:
    id: str
    file: str
    # Approximate em-width per character for the display font; used to shrink
    # titles that are longer than the sample "BARNABY / WHISKERS".
    display_char_em: float
    title_max_width: float
    title_base_size: float
    subtitle_max_width: float
    subtitle_base_size: float
    uppercase_title: bool
    uppercase_subtitle: bool
    two_line_hero_name: bool  # split "Barnaby Whiskers" across title-1/title-2


COVER_DESIGNS: dict[str, CoverDesign] = {
    "penny_dreadful": CoverDesign(
        id="penny_dreadful", file="option-a-penny-dreadful.svg",
        display_char_em=0.68, title_max_width=1380, title_base_size=210,
        subtitle_max_width=1040, subtitle_base_size=80,
        uppercase_title=True, uppercase_subtitle=True, two_line_hero_name=True,
    ),
    "sticker_pop": CoverDesign(
        id="sticker_pop", file="option-b-sticker-pop.svg",
        display_char_em=0.52, title_max_width=1400, title_base_size=240,
        subtitle_max_width=1560, subtitle_base_size=112,
        uppercase_title=True, uppercase_subtitle=True, two_line_hero_name=True,
    ),
    "midnight_atlas": CoverDesign(
        id="midnight_atlas", file="option-c-midnight-atlas.svg",
        display_char_em=0.56, title_max_width=1400, title_base_size=150,
        subtitle_max_width=1300, subtitle_base_size=62,
        uppercase_title=False, uppercase_subtitle=False, two_line_hero_name=False,
    ),
}


# ---------------------------------------------------------------------------
# Text helpers
# ---------------------------------------------------------------------------

_TITLE_SPLIT = re.compile(r"\s+(?:&|and)\s+(?:the\s+)?", re.IGNORECASE)


def split_title(title: str) -> tuple[str, str]:
    """
    "Barnaby Whiskers & the Runaway Royal Cake" -> ("Barnaby Whiskers", "Runaway Royal Cake")
    "Barnaby Whiskers"                           -> ("Barnaby Whiskers", "")
    """
    parts = _TITLE_SPLIT.split(title, maxsplit=1)
    hero = parts[0].strip()
    rest = parts[1].strip() if len(parts) > 1 else ""
    return hero, rest


def split_hero_name(hero: str) -> tuple[str, str]:
    """Two display lines. 'Barnaby Whiskers' -> ('BARNABY','WHISKERS'); 'Zog' -> ('ZOG','')."""
    words = hero.split()
    if len(words) == 1:
        return words[0], ""
    mid = len(words) // 2
    return " ".join(words[:mid]), " ".join(words[mid:])


def fit_font_size(text: str, *, max_width: float, base_size: float, char_em: float) -> float:
    """Shrink (never grow) a font size so `text` fits in `max_width` px."""
    if not text:
        return base_size
    est = len(text) * char_em * base_size
    if est <= max_width:
        return base_size
    return round(base_size * max_width / est, 1)


# ---------------------------------------------------------------------------
# SVG filling
# ---------------------------------------------------------------------------

def _find(root: etree._Element, slot_id: str) -> etree._Element | None:
    return root.find(f".//*[@id='{slot_id}']")


def _set_text(root, slot_id: str, text: str, font_size: float | None = None) -> None:
    node = _find(root, slot_id)
    if node is None:
        return
    node.text = text
    if font_size is not None:
        node.set("font-size", str(font_size))
    if not text:
        node.set("display", "none")


def fill_cover_svg(
    design: CoverDesign,
    *,
    title: str,
    author_name: str,
    author_age: int | None,
    blurb: tuple[str, str],
    hero_image: bytes | None = None,
    hero_mime: str = "image/jpeg",
) -> bytes:
    """Return the filled SVG as bytes."""
    tree = etree.parse(str(DESIGN_DIR / design.file))
    root = tree.getroot()

    hero, rest = split_title(title)
    up = str.upper if design.uppercase_title else (lambda s: s)
    up_sub = str.upper if design.uppercase_subtitle else (lambda s: s)

    # --- title lines ---
    if design.two_line_hero_name:
        l1, l2 = split_hero_name(hero)
        longest = max(l1, l2, key=len)
        size = fit_font_size(up(longest), max_width=design.title_max_width,
                             base_size=design.title_base_size, char_em=design.display_char_em)
        _set_text(root, "slot-title-1", up(l1), size)
        _set_text(root, "slot-title-2", up(l2), size)
    else:
        size = fit_font_size(hero, max_width=design.title_max_width,
                             base_size=design.title_base_size, char_em=design.display_char_em)
        _set_text(root, "slot-title-1", hero, size)

    # --- subtitle ---
    if design.id == "sticker_pop":
        sub = f"& THE {rest}" if rest else ""
    elif design.id == "midnight_atlas":
        sub = f"and the {rest}" if rest else ""
    else:
        sub = rest
    sub = up_sub(sub) if design.uppercase_subtitle else sub
    sub_size = fit_font_size(sub, max_width=design.subtitle_max_width,
                             base_size=design.subtitle_base_size, char_em=design.display_char_em)
    _set_text(root, "slot-subtitle", sub, sub_size)

    # --- author ---
    age = f", age {author_age}" if author_age else ""
    author_by_design = {
        "penny_dreadful": f"{author_name}{age}".upper(),
        "sticker_pop": f"by {author_name}{age}",
        "midnight_atlas": f"Charted by {author_name}{age}",
    }
    _set_text(root, "slot-author", author_by_design[design.id])
    _set_text(root, "slot-seal-initial", (author_name[:1] or "✦").upper())
    _set_text(root, "slot-imprint", {
        "penny_dreadful": f"PUBLISHED BY {author_name.upper()} PRESS · FIRST EDITION",
        "sticker_pop": "A TALES TOGETHER PRODUCTION · CONTAINS REAL IMAGINATION",
        "midnight_atlas": "",
    }[design.id])

    # --- silly blurb ---
    _set_text(root, "slot-blurb-1", blurb[0])
    _set_text(root, "slot-blurb-2", blurb[1])

    # --- hero illustration ---
    if hero_image:
        img = _find(root, "slot-hero")
        placeholder = _find(root, "slot-hero-placeholder")
        if img is not None:
            data_uri = f"data:{hero_mime};base64," + base64.b64encode(hero_image).decode("ascii")
            img.set("href", data_uri)
            img.set(f"{{{XLINK_NS}}}href", data_uri)  # resvg/older renderers
            img.attrib.pop("display", None)
        if placeholder is not None:
            placeholder.getparent().remove(placeholder)

    return etree.tostring(tree, xml_declaration=True, encoding="UTF-8")


# ---------------------------------------------------------------------------
# Rasterisation
# ---------------------------------------------------------------------------

def rasterise_svg(svg_bytes: bytes, *, width: int = COVER_WIDTH) -> Image.Image:
    """SVG → PIL Image via the resvg CLI (falls back to Playwright if absent)."""
    if shutil.which("resvg"):
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / "cover.svg"
            out = Path(tmp) / "cover.png"
            src.write_bytes(svg_bytes)
            subprocess.run(
                ["resvg", "--use-fonts-dir", str(FONTS_DIR), "--width", str(width), str(src), str(out)],
                check=True, capture_output=True,
            )
            return Image.open(out).convert("RGB")

    # Fallback: headless Chromium gives pixel-parity with the in-app preview.
    from playwright.sync_api import sync_playwright  # type: ignore

    html = (
        "<!doctype html><html><head><meta charset='utf-8'>"
        "<style>html,body{margin:0;background:#000}svg{display:block}</style>"
        f"</head><body>{svg_bytes.decode('utf-8')}</body></html>"
    )
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": COVER_WIDTH, "height": COVER_HEIGHT})
        page.set_content(html, wait_until="networkidle")  # lets Google Fonts @import resolve
        png = page.screenshot(full_page=False)
        browser.close()
    return Image.open(io.BytesIO(png)).convert("RGB")


def to_jpeg(img: Image.Image, *, quality: int = 88) -> bytes:
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=quality, optimize=True, progressive=True)
    return buf.getvalue()


# ---------------------------------------------------------------------------
# Celery task (replaces the stub in docs/02-backend-and-video-pipeline.md)
# ---------------------------------------------------------------------------

def generate_cover_image(story_id: int) -> None:  # @shared_task(bind=True, max_retries=3)
    from django.core.files.base import ContentFile
    from stories.models import Story

    story = Story.objects.select_related("hero").get(pk=story_id)
    design = COVER_DESIGNS[story.cover_design or "sticker_pop"]

    hero_bytes: bytes | None = None
    # Prefer the chapter-1 illustration (full scene); fall back to the
    # character reference sheet; fall back to the built-in SVG art.
    first = story.chapters.filter(illustration__isnull=False).order_by("index").first()
    if first and first.illustration:
        hero_bytes = first.illustration.read()
    elif story.hero and story.hero.reference_image:
        hero_bytes = story.hero.reference_image.read()

    blurb = tuple(story.cover_blurb or ("CONTAINS 100% GENUINE IMAGINATION", "NO DRAGONS WERE HARMED"))

    svg = fill_cover_svg(
        design,
        title=story.title,
        author_name=story.author_display_name,
        author_age=story.author_age,
        blurb=blurb,  # type: ignore[arg-type]
        hero_image=hero_bytes,
    )
    jpeg = to_jpeg(rasterise_svg(svg))
    story.cover_image.save(f"story_{story.pk}_cover.jpg", ContentFile(jpeg), save=True)
    # Keep the filled SVG too — it's the lossless source for a reprint / share card.
    story.cover_svg.save(f"story_{story.pk}_cover.svg", ContentFile(svg), save=True)


if __name__ == "__main__":
    # Quick local preview: python generate_cover_image.py sticker_pop
    import sys

    d = COVER_DESIGNS[sys.argv[1] if len(sys.argv) > 1 else "penny_dreadful"]
    svg = fill_cover_svg(
        d,
        title="Barnaby Whiskers & the Runaway Royal Cake",
        author_name="Leo",
        author_age=7,
        blurb=("CONTAINS 100% GENUINE IMAGINATION", "NO DRAGONS WERE HARMED"),
    )
    out = DESIGN_DIR / f"preview_{d.id}.jpg"
    out.write_bytes(to_jpeg(rasterise_svg(svg)))
    print("wrote", out)
