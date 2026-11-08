# Sixteen choices per shelf

The latest character workflow is on page `03 · Scroll & shuffle` in
`storybook-workshop.figcraft`. It has three desktop screens, three phone
screens and three complete catalogue boards. Page 2 preserves the earlier
four-option study and its Kid Explorer branch.

`character-options.json` defines sixteen characters, sixteen outfits and
sixteen quirks. It preserves the existing twelve catalogue identifiers and
prompt fragments. Each entry has a short display label and an original SVG
under `assets/characters/`, `assets/outfits/` or `assets/quirks/`. These SVGs
are imported as editable FigCraft components and reused in the shelves.

## Browse or shuffle

- Keep the catalogue in a stable order. Scroll the shelf with a trackpad,
  mouse wheel, touch or keyboard. The clipped next row, visible scrollbar and
  `Scroll for more` label make the extra choices discoverable.
- Keep Shuffle and Continue outside the shelf so they remain available while
  browsing. Desktop uses four columns; the phone composition uses two.
- Shuffle selects one different option from the current shelf. It does not
  reorder the catalogue, reset the other categories, change an entered name
  or randomise the optional gender. Bring the new selection into view and
  announce its label. Every other option has the same chance of selection.
- Tap a choice directly if the child has a favourite. A check and a border
  identify the current selection. Each category contains exactly sixteen
  choices, not sixteen visible cards plus additional hidden variants.

## Interactive review

`exports/hero-picker.html` is a self-contained interactive review, with all 48
choices, scrolling, Shuffle, keyboard selection, optional Kid Explorer gender,
name entry and a confirmation. It updates a local paper-doll preview; the
quirk is represented by a small badge. It makes no generation or network calls.
It ends at a hero confirmation rather than implementing backpack packing.

The FigCraft screens contain real overflow frames and linked step navigation.
Their Shuffle buttons describe the intended control; random selection is
implemented in the HTML review. Earlier PNG frame viewers remain static.

Naming stays last. The name begins empty; the preview shows the character type
until a name is entered. Returning to an earlier shelf preserves an explicitly
entered name. Gender is optional for Kid Explorer alone, defaults to Leave
open, and does not constrain clothing or quirks.

This is a design catalogue and prototype. The Expo app still uses its existing
catalogue and controls. Applying the 48 choices and these interactions to the
app is a separate implementation step.

## Validation

Interaction checks at phone and desktop widths covered all 48 selections,
scrolling to the final option, Shuffle preserving other fields and always
picking a different option, optional-gender visibility and retention, an empty
initial name, whitespace rejection, plain-text name rendering, keyboard
Home/End selection, and confirmation followed by editing. All SVGs parse.
