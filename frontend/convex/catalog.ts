export interface CatalogOption {
  id: string;
  label: string;
  promptFragment: string;
}

/**
 * Catalog ids are minted here and never rewritten: prompts, `suggestedItemId`
 * and the stored backpack all share them (docs/02, decisions.md).
 */
export const WORLD_SETTINGS: CatalogOption[] = [
  {
    id: "set_bakery",
    label: "Underwater Teapot Bakery",
    promptFragment:
      "An underwater bakery inside a giant sunken porcelain teapot surrounded by glowing coral",
  },
  {
    id: "set_treehouse",
    label: "Cloud-Top Treehouse Express",
    promptFragment:
      "A brass-and-wood steam train that drives along giant branches of a mile-high cloud tree",
  },
  {
    id: "set_museum",
    label: "Midnight Dinosaur Museum",
    promptFragment:
      "A grand museum at midnight where the dinosaur skeletons and exhibits come alive when the clock strikes twelve",
  },
  {
    id: "set_moon",
    label: "Cheese-Crater Moon Camp",
    promptFragment:
      "A cosy space station built inside a giant yellow Swiss-cheese crater on the Moon",
  },
];

export const WORLD_PROBLEMS: CatalogOption[] = [
  {
    id: "prob_cake",
    label: "The Royal Cake Floated Away!",
    promptFragment:
      "The giant triple-decker Royal Sponge Cake has grown wings and floated out the chimney right before the Queen's party",
  },
  {
    id: "prob_gravity",
    label: "Someone Turned Off Gravity!",
    promptFragment:
      "The town's Gravity Switch has gone missing and everyone's furniture, pets, and teacups are floating toward the ceiling",
  },
  {
    id: "prob_map",
    label: "The Whispering Treasure Map",
    promptFragment:
      "They found a mysterious rolled-up map in the attic that giggles and gives riddles leading to a hidden vault",
  },
  {
    id: "prob_monster",
    label: "A Grumpy Monster Under the Bed",
    promptFragment:
      "A fuzzy purple monster moved into the pantry because he lost his favourite teddy bear and won't stop snoring loudly",
  },
];

export const HERO_ARCHETYPES: CatalogOption[] = [
  {
    id: "hero_otter",
    label: "Scruffy River Otter",
    promptFragment:
      "a small scruffy brown river otter with bright curious eyes and long whiskers",
  },
  {
    id: "hero_badger",
    label: "Grumpy Little Badger",
    promptFragment:
      "a stout, slightly grumpy black-and-white woodland badger with fluffy ears",
  },
  {
    id: "hero_robot",
    label: "Rusty Clockwork Robot",
    promptFragment:
      "a small round copper clockwork robot with glowing warm lightbulb eyes and a wind-up key on its back",
  },
  {
    id: "hero_kid",
    label: "Brave Kid Explorer",
    promptFragment:
      "an energetic 8-year-old child explorer with messy hair, plaster on one knee, and a wide grin",
  },
];

export const HERO_OUTFITS: CatalogOption[] = [
  {
    id: "out_chef",
    label: "Crooked Chef Hat & Apron",
    promptFragment:
      "wearing a tall crooked white chef hat and a red polka-dot apron dusted with flour",
  },
  {
    id: "out_detective",
    label: "Oversized Detective Coat",
    promptFragment:
      "wearing an oversized checkered detective coat and carrying a brass magnifying glass",
  },
  {
    id: "out_space",
    label: "Cardboard Spacesuit",
    promptFragment:
      "wearing a homemade silver tin-foil spacesuit with a fishbowl helmet and colourful buttons",
  },
  {
    id: "out_pyjamas",
    label: "Dinosaur Pyjamas",
    promptFragment:
      "wearing cosy green dinosaur onesie pyjamas with fabric spikes down the hood and fuzzy slippers",
  },
];

export const QUIRK_STICKERS: CatalogOption[] = [
  {
    id: "quirk_bubbles",
    label: "Hiccups Rainbow Bubbles",
    promptFragment:
      "Hiccups floating rainbow bubbles whenever they get nervous or excited",
  },
  {
    id: "quirk_squirrels",
    label: "Speaks Fluent Squirrel",
    promptFragment:
      "Can chatter, squeak, and negotiate with any woodland creature or tiny bug",
  },
  {
    id: "quirk_broccoli",
    label: "Terrified of Broccoli",
    promptFragment:
      "Brave against giant monsters, but dramatically faints at the sight of green vegetables",
  },
  {
    id: "quirk_pockets",
    label: "Bottomless Snack Pockets",
    promptFragment:
      "Always pulls half-melted biscuits or cheese crackers out of their pockets at the worst moment",
  },
];

export const CONVEYOR_ITEMS: CatalogOption[] = [
  {
    id: "item_whisk",
    label: "Golden Whisk",
    promptFragment: "A glowing golden baking whisk",
  },
  {
    id: "item_jam",
    label: "Jar of Glow-Jam",
    promptFragment: "A jar of neon-purple glowing berry jam",
  },
  {
    id: "item_kazoo",
    label: "Grandma's Kazoo",
    promptFragment: "A loud brass kazoo that echoes",
  },
  {
    id: "item_boot",
    label: "Spring-Loaded Boot",
    promptFragment: "A single mechanical boot with a giant coiled spring",
  },
  {
    id: "item_umbrella",
    label: "Inside-Out Umbrella",
    promptFragment: "A striped umbrella that floats like a parachute",
  },
  {
    id: "item_tape",
    label: "Unstoppable Sticky Tape",
    promptFragment: "A roll of sparkly silver tape that can stick anything",
  },
];

export const BACKPACK_SIZE = 3;
