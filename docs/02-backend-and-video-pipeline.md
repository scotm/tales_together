# 02 — Backend State Machine & Multimodal Video Pipeline

## 1. Architectural Overview

If an LLM is left to manage a multi-chapter story purely through chat history, by Chapter 4 it will forget what is in the hero's backpack, hallucinate new characters, or rush the ending.

Instead, the **Django + Celery** backend acts as a **deterministic Finite State Machine (FSM)** that owns a canonical `StoryState` in PostgreSQL, feeding strictly scoped context into the LLM at each step and orchestrating asynchronous image and video generation jobs in the background.

---

## 2. The Canonical `StoryState` Data Structure

```json
{
  "story_id": "st_98234",
  "status": "CHAPTER_3_DIRECTING",
  "config": {
    "reading_level": "AGES_7_9",
    "total_chapters": 5,
    "art_style_prompt": "Warm watercolour and ink children's book illustration, Quentin Blake meets Studio Ghibli",
    "vibe": "SILLY_ADVENTURE"
  },
  "world_bible": {
    "setting": "An underwater bakery inside a giant sunken teapot",
    "central_problem": "The Royal Sponge Cake has grown wings and floated out the chimney",
    "characters": [
      {
        "id": "char_1",
        "name": "Barnaby Whiskers",
        "role": "PROTAGONIST",
        "visual_description": "A small scruffy brown river otter wearing a tall crooked white chef hat and red polka-dot apron",
        "reference_image_url": "https://cdn.../char_1_ref.png",
        "quirk": "Hiccups floating rainbow bubbles whenever he gets nervous"
      }
    ],
    "inventory": [
      { "id": "item_1", "name": "Golden Whisk", "status": "IN_BACKPACK", "used_in_chapter": null },
      { "id": "item_2", "name": "Jar of Glow-Jam", "status": "USED", "used_in_chapter": 2 }
    ],
    "unresolved_threads": [
      "Catch the floating Royal Sponge Cake before the Coral Queen arrives"
    ]
  },
  "chapters": [
    {
      "index": 1,
      "arc_role": "HOOK_AND_INCITING_INCIDENT",
      "status": "LOCKED",
      "chosen_outline": "Barnaby discovers the Royal Sponge Cake has floated away.",
      "director_modifiers": {
        "use_item_id": null,
        "use_item_name": null,
        "spotlight_character": null,
        "weather_or_mood": "BUBBLY_CHAOS",
        "sound_effects_boost": true,
        "ending_style": "CLIFFHANGER"
      },
      "summary_bullets": [
        "Barnaby was preparing for the Coral Queen's party in the sunken teapot bakery.",
        "A mysterious purple current sucked the Royal Sponge Cake out the chimney.",
        "Barnaby grabbed his backpack and swam into the Kelp Forest."
      ],
      "prose_paragraphs": ["...", "..."],
      "media": {
        "is_key_video_chapter": true,
        "illustration_url": "https://cdn.../ch1_still.jpg",
        "video_url": "https://cdn.../ch1_loop.mp4",
        "video_status": "COMPLETED"
      }
    }
  ]
}
```

### The 6 Chapter Lifecycle State Transitions
For each chapter $N$ of $M$, the state machine steps through 6 strict states:

1. **`PITCHING` (Generating the 3 Tarot Cards):**
   * **Input to LLM:** `world_bible` + `chapters[1..N-1].summary_bullets` + the narrative role of Chapter $N$ (e.g., `Chapter 3 of 5: Rising Action Complication`).
   * **Output (Structured Pydantic JSON):** 3 distinct plot beat cards (`BOLD_ACTION`, `CLEVER_TRICK`, `SILLY_TWIST`).
   * *If the child uses the Voice Wildcard:* Audio goes to speech-to-text $\rightarrow$ Prompt 1 normalises their spoken ramble into a safe, hilarious 4th plot card (`KID_WILDCARD`).
2. **`DIRECTING` (Child Selecting Card & Spice Rack Modifiers):**
   * Child selects a card and toggles modifiers (e.g., *"Use the Golden Whisk"* + *"Stormy & Wild"*).
   * The backend marks `Golden Whisk` as `RESERVED_THIS_CHAPTER` so the prose prompt enforces its usage.
3. **`WRITING` (Streaming Prose via SSE):**
   * **Input to LLM:** Reading Level Matrix constraints + `world_bible` + summaries of prior chapters + **the exact verbatim last 2 paragraphs of Chapter $N-1$** (for seamless scene continuity) + the chosen card and active Spice Rack modifiers.
   * **Output:** Streams paragraph-by-paragraph over Server-Sent Events (`StreamingHttpResponse`) so the child can start reading immediately.
4. **`POST_PROSE_EXTRACTION` (Background Hook):**
   * Immediately upon stream completion, a fast structured LLM call extracts:
     1. A 3-bullet summary of Chapter $N$.
     2. Updated inventory state (`items_used`, `new_items_found`).
     3. Self-contained **Static Illustration Prompt** and **5-Second Cinemagraph Video Motion Prompt**.
   * Simultaneously triggers pre-generation of Chapter $N+1$'s Beat Cards so the next chapter loads in `0ms`.
5. **`REVIEWING` (Reading & Magic Wand Remixing):**
   * If the child taps Paragraph 3 and clicks **"😂 Funnier"**, the backend sends `Paragraph 2 (context) + Paragraph 3 (target) + Paragraph 4 (context)` to a fast model, replaces `paragraphs[2]` in place, and leaves the running media pipeline untouched.
6. **`LOCKED`:**
   * Child clicks **"Next Chapter!"**, locking the text and advancing the pointer to $N+1$.

---

## 3. Django Models (`stories/models.py`)

Combining relational tables (`Story`, `Character`, `Chapter`) with typed `JSONField` attributes gives both relational integrity and schema agility:

```python
# stories/models.py
import uuid
from django.db import models

class StoryStatus(models.TextChoices):
    SETUP = "SETUP", "World & Character Setup"
    OUTLINING = "OUTLINING", "Macro Story Map"
    IN_PROGRESS = "IN_PROGRESS", "Writing Chapters"
    COMPLETED = "COMPLETED", "Published"

class Story(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=255, blank=True)
    status = models.CharField(max_length=20, choices=StoryStatus.choices, default=StoryStatus.SETUP)
    
    # Pedagogical & Style Locks
    reading_level = models.CharField(max_length=20, default="AGES_7_9")  # AGES_4_6, AGES_7_9, AGES_10_12
    total_chapters = models.PositiveSmallIntegerField(default=5)
    art_style_prompt = models.TextField(
        default="Warm watercolour and ink children's storybook illustration, whimsical, vibrant"
    )
    vibe = models.CharField(max_length=50, default="SILLY_ADVENTURE")
    
    # Structured rolling state: {"setting": "...", "central_problem": "...", "inventory": [...], "unresolved_threads": [...]}
    world_state = models.JSONField(default=dict)
    
    # Child's SVG signature from the Publishing Ceremony
    author_name = models.CharField(max_length=100)
    author_signature_svg = models.TextField(blank=True)
    
    # Generated by `generate_cover_image` (Celery) once the title is locked; declared with
    # properties="cover-image" in content.opf so Apple Books / Kindle show it on the bookshelf.
    cover_image = models.ImageField(upload_to="covers/", null=True, blank=True)
    
    epub_deluxe_file = models.FileField(upload_to="epubs/deluxe/", null=True, blank=True)
    epub_eink_file = models.FileField(upload_to="epubs/eink/", null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

class Character(models.Model):
    story = models.ForeignKey(Story, related_name="characters", on_delete=models.CASCADE)
    name = models.CharField(max_length=100)
    role = models.CharField(max_length=50)  # PROTAGONIST, SIDEKICK, PET, ANTAGONIST
    quirk = models.CharField(max_length=255)
    visual_description = models.TextField(help_text="Canonical prompt snippet for image/video consistency")
    reference_image = models.ImageField(upload_to="characters/refs/", null=True, blank=True)

class ChapterStatus(models.TextChoices):
    PITCHING = "PITCHING", "Pitching 3 Plot Cards"
    DIRECTING = "DIRECTING", "Child Picking Modifiers"
    WRITING = "WRITING", "Streaming Prose"
    REVIEWING = "REVIEWING", "Reading & Remixing"
    LOCKED = "LOCKED", "Locked & Staged for EPUB"

class Chapter(models.Model):
    story = models.ForeignKey(Story, related_name="chapters", on_delete=models.CASCADE)
    index = models.PositiveSmallIntegerField()  # 1-based (1..total_chapters)
    title = models.CharField(max_length=255, blank=True)
    arc_role = models.CharField(max_length=50)  # e.g., HOOK_AND_INCITING_INCIDENT, RISING_ACTION, CLIMAX
    status = models.CharField(max_length=20, choices=ChapterStatus.choices, default=ChapterStatus.PITCHING)
    
    # The 3 pitched cards + any voice-wildcard card (shape: StoryBeatCard, snake_case)
    pitched_beats = models.JSONField(default=list)
    chosen_beat = models.JSONField(default=dict)
    # Shape: DirectorModifiers (see schemas.py). Validated on write so the prose prompt
    # and the EPUB appendix can rely on the same keys.
    director_modifiers = models.JSONField(default=dict)
    
    # Stored as a list of paragraph strings for surgical "tap-paragraph-to-remix" editing
    paragraphs = models.JSONField(default=list)
    summary_bullets = models.JSONField(default=list)
    vocab_notes = models.JSONField(default=list)  # [{"word": "buoyant", "kid_definition": "..."}]
    
    # Multimodal Assets
    is_key_video_chapter = models.BooleanField(default=False)
    illustration_prompt = models.TextField(blank=True)
    video_motion_prompt = models.TextField(blank=True)
    illustration_file = models.ImageField(upload_to="chapters/images/", null=True, blank=True)
    video_file = models.FileField(upload_to="chapters/videos/", null=True, blank=True)
    video_job_id = models.CharField(max_length=128, blank=True)

    class Meta:
        unique_together = ("story", "index")
        ordering = ["index"]
```

---

## 4. Structured LLM Contracts with Pydantic (`stories/schemas.py`)

Using Pydantic schemas with Structured Outputs (supported natively across Gemini, OpenAI, and xAI) guarantees that UI cards and state transitions never fail due to malformed JSON.

```python
# stories/schemas.py
from pydantic import BaseModel, Field
from typing import Literal

class StoryBeatCard(BaseModel):
    card_id: str
    style: Literal["BOLD_ACTION", "CLEVER_TRICK", "SILLY_TWIST", "KID_WILDCARD"]
    title: str = Field(description="Short punchy title for the UI card, max 5 words")
    kid_friendly_pitch: str = Field(description="1-2 sentences written directly to the child, max 25 words")
    icon_emoji: str = Field(description="Single emoji representing this choice")
    suggested_item_id: str | None = Field(description="ID of a backpack item that fits this beat, if any")

class ChapterBeatPitchResponse(BaseModel):
    recap_one_liner: str = Field(description="Exciting 'Previously on...' sentence")
    cards: list[StoryBeatCard] = Field(min_length=3, max_length=3)

class DirectorModifiers(BaseModel):
    """Canonical shape of Chapter.director_modifiers.

    The frontend store uses camelCase (useItemId, weatherOrMood, ...); the API layer
    converts to this snake_case contract on write. Prompt 3 reads `use_item_name`,
    `spotlight_character`, `weather_or_mood`, `sound_effects_boost`, `ending_style`;
    the EPUB appendix reads `use_item_name`.
    """
    use_item_id: str | None = None
    use_item_name: str | None = None  # Denormalised at write time from world_state.inventory
    spotlight_character: str | None = None  # Character name, not ID, so prompts can inline it
    weather_or_mood: Literal["SUNNY", "STORMY", "SPOOKY_NIGHT", "BUBBLY_CHAOS"] | None = None
    sound_effects_boost: bool = True
    ending_style: Literal["CLIFFHANGER", "COZY_PAUSE"] = "CLIFFHANGER"


class VocabNote(BaseModel):
    """One entry in Chapter.vocab_notes. Rendered as an EPUB 3 pop-up footnote."""
    word: str
    kid_definition: str


class PostChapterExtraction(BaseModel):
    chapter_title: str
    summary_bullets: list[str] = Field(min_length=3, max_length=3)
    items_used: list[str] = Field(description="IDs of backpack items consumed or used in this chapter")
    new_items_found: list[str] = Field(description="Names of any new items picked up")
    unresolved_threads: list[str] = Field(description="Remaining open mysteries or goals for future chapters")
    static_illustration_prompt: str = Field(
        description="Detailed visual description of the best moment in this chapter, inlining full character visual_descriptions"
    )
    video_motion_prompt: str = Field(
        description="Subtle 5-second cinemagraph motion description based on the static illustration (e.g. 'gentle camera pan, sparkling bubbles rising, character waving')"
    )

class ScannedToyCharacterSheet(BaseModel):
    """Used when a child snaps a photo of their real stuffed animal, LEGO build, or drawing."""
    suggested_name: str = Field(description="A fun, affectionate storybook name for this toy")
    species_or_type: str = Field(description="Short label, e.g. 'Floppy Plush Bunny' or 'Red Lego Knight'")
    canonical_visual_description: str = Field(
        description=(
            "Detailed, objective visual description of the toy's colours, textures, clothing, and proportions "
            "so an illustrator can draw this exact toy in every chapter (30-45 words)."
        )
    )
    suggested_quirk: str = Field(
        description="A cute, funny personality quirk inspired by how the toy looks (e.g. 'One ear flops over when thinking')"
    )
```

---

## 5. The Celery Media Pipeline (Static Image $\rightarrow$ Grok/Veo Video $\rightarrow$ FFmpeg)

### Solving Character Consistency & Async Latency
1. **Image-to-Video Anchor:** First, generate the static chapter illustration (`ch_N.jpg`) in ~3 seconds and push it immediately to the UI over WebSocket/SSE.
2. **Seamless First Frame:** For key chapters (`is_key_video_chapter=True`), pass that exact static illustration URL (`image_url`) to **xAI's `grok-imagine-video`** (or **Google Veo**). This guarantees **100% visual continuity** between the static poster image and the first frame of the animated video!
3. **FFmpeg WebKit/EPUB 3 Pass:** E-readers like Apple Books require H.264 Main Profile (`yuv420p`) and small file sizes. The Celery worker runs a fast FFmpeg pass to compress the 5-second clip to ~1.2 MB with `-movflags +faststart`.

```python
# stories/tasks.py
import subprocess
import tempfile
import httpx
import xai_sdk
from celery import shared_task, chain
from django.core.files.base import ContentFile
from .models import Chapter

@shared_task
def trigger_chapter_media_pipeline(chapter_id: int):
    chapter = Chapter.objects.select_related("story").get(id=chapter_id)
    if chapter.is_key_video_chapter:
        chain(
            generate_chapter_illustration.s(chapter.id),
            generate_key_chapter_video.s(),
            optimize_video_for_epub.s(),
        ).apply_async()
    else:
        generate_chapter_illustration.delay(chapter.id)

@shared_task
def generate_cover_image(story_id: str) -> str:
    """Runs once the title is locked (after Chapter 1 extraction). Uses the protagonist's
    reference image + art_style_prompt so the cover matches the chapter illustrations.
    Saves to Story.cover_image, which Epub3Compiler declares as properties="cover-image"."""
    ...
    return story_id

@shared_task
def generate_chapter_illustration(chapter_id: int) -> int:
    chapter = Chapter.objects.select_related("story").get(id=chapter_id)
    # 1. Generate static illustration using Grok Imagine / Imagen 3
    # 2. Save to chapter.illustration_file
    # 3. Broadcast WebSocket/SSE event:
    #    {"type": "ILLUSTRATION_READY", "chapter_id": chapter.id, "url": chapter.illustration_file.url}
    return chapter.id

@shared_task(bind=True, max_retries=3)
def generate_key_chapter_video(self, chapter_id: int) -> tuple[int, str]:
    chapter = Chapter.objects.select_related("story").get(id=chapter_id)
    
    # Using xAI SDK's image-to-video capability (handles async polling under the hood)
    client = xai_sdk.Client()
    
    full_motion_prompt = (
        f"{chapter.video_motion_prompt}. "
        f"Style: {chapter.story.art_style_prompt}. "
        "Gentle storybook animation, smooth cinemagraph motion, child-friendly."
    )
    
    # Pass the just-generated chapter illustration as the starting frame!
    response = client.video.generate(
        prompt=full_motion_prompt,
        model="grok-imagine-video",
        image_url=chapter.illustration_file.url,  # Presigned S3/R2 URL
        duration=5,          # 5-second storybook cinemagraph
        aspect_ratio="4:3",  # Classic storybook proportion
        resolution="480p",   # Ideal balance of crispness and nimble EPUB file size
    )
    
    return chapter.id, response.url

@shared_task
def optimize_video_for_epub(payload: tuple[int, str]) -> int:
    chapter_id, remote_video_url = payload
    chapter = Chapter.objects.get(id=chapter_id)
    
    with tempfile.NamedTemporaryFile(suffix=".mp4") as raw_in, \
         tempfile.NamedTemporaryFile(suffix=".mp4") as opt_out:
        
        # Download raw MP4 from Grok / Veo
        with httpx.stream("GET", remote_video_url) as r:
            r.raise_for_status()
            for chunk in r.iter_bytes():
                raw_in.write(chunk)
        raw_in.flush()
        
        # FFmpeg pass for strict EPUB 3 / Apple Books / iOS Safari compatibility:
        # - H.264 Main Profile, yuv420p pixel format (required by Apple Books WebKit)
        # - CRF 26 to keep a 5-second clip around ~1.2 MB
        # - -movflags +faststart so the video plays immediately on page turn
        # - -an strips silent/unneeded audio tracks so it doesn't interrupt background audio
        cmd = [
            "ffmpeg", "-y",
            "-i", raw_in.name,
            "-c:v", "libx264",
            "-profile:v", "main",
            "-pix_fmt", "yuv420p",
            "-crf", "26",
            "-preset", "fast",
            "-movflags", "+faststart",
            "-an",
            opt_out.name,
        ]
        subprocess.run(cmd, check=True, capture_output=True)
        
        opt_out.seek(0)
        chapter.video_file.save(
            f"ch_{chapter.index}_living.mp4",
            ContentFile(opt_out.read()),
            save=True,
        )
    
    # Broadcast WebSocket/SSE event:
    # {"type": "VIDEO_READY", "chapter_id": chapter.id, "video_url": chapter.video_file.url}
    return chapter.id
```

---

## 6. Cost & Token Guardrails for Production

Because video generation is the highest marginal cost in the pipeline, you can control unit economics gracefully while making the feature feel *even more special* to the child:

* **"Magic Living Picture Tickets" per Book:**
  * Every 5-chapter book includes **2 or 3 Living Picture Tickets** (e.g., automatically applied to **Chapter 1** and the **Final Chapter**, plus **1 Golden Ticket** the child can slap onto whichever middle chapter they loved best!).
* **480p / 5-Second Cinemagraphs:**
  * Inside an e-reader frame (`max-height: 62vh`), a 5-second `480p` watercolour loop looks indistinguishable from `1080p`, generates twice as fast, costs significantly less, and keeps the final Deluxe `.epub` archive around **6–10 MB**—small enough to AirDrop or email in seconds.
