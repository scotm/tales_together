# Storybook Workshop — first visual direction

Exploratory FigCraft concept, 2026-11-08. This is a design proposal, not an
implementation specification or a description of the current app.

Source: `storybook-workshop.figcraft`. Page 1 contains world setup on desktop,
chapter choices on desktop, and world setup on a phone. Review exports are in
`exports/workshop-{world,chapter,phone}.png`. Page 2 contains the character
workflow: four desktop frames and four phone frames per character branch
(River otter and Kid Explorer). See
`character-workflow.md` for its interaction and implementation notes.

## Direction

A paper theatre for making stories together: ink blue, apricot, mint and chalky
ivory; bold Poppins headings; Source Serif 4 for the book itself. Original vector
scenery and large, labelled choices give the child something concrete to react
to. All artwork and text remain editable layers in FigCraft.

Setup becomes three focused steps: World → Hero → Backpack. Keep a place or a
problem while spinning the other. Chapter choices carry the same colours and
paper shapes, with an explicit selected border, a label and a separate writing
button. The five chapter markers and recap provide continuity.

## Relationship to the working app

The proposal uses the existing two world selectors, keep toggles, three-item
backpack, three beat cards, chosen beat, recap and five-chapter sequence. It
proposes a new presentation and setup navigation. The illustration and preview
sentences are sample artwork and copy; the app does not currently create a live
illustrated world preview. Card illustrations are also concept assets, not a
new image-generation requirement.

These frames show a selected world and a selected chapter choice. Character
creation is explored on page 2. Backpack, reading, completion, loading,
connection failures and retry states still need design. Phone world setup is a
scrolling composition; sticky controls and the placement of its illustration
should be checked on a physical device.

## Review prompts

- Does this feel playful enough for a child while remaining calm for bedtime?
- Should the next pass make the characters more prominent, or keep the world
  and the child's choices at the centre?
- Should the desktop layout also serve an iPad, or should iPad use an open-book
  composition?

The previous `story-forge.figcraft` study is preserved. No app code changes
are part of this exploration.
