/** Original world/item seed fixture. Runtime choices live in catalogOptions. */
export interface CatalogOption {
  id: string;
  label: string;
  promptFragment: string;
}

/** Problems also name the book, so the title reads right for every option. */
export interface ProblemOption extends CatalogOption {
  titleSuffix: string;
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

export const WORLD_PROBLEMS: ProblemOption[] = [
  {
    id: "prob_cake",
    label: "The Royal Cake Floated Away!",
    titleSuffix: "the Royal Cake Escape",
    promptFragment:
      "The giant triple-decker Royal Sponge Cake has grown wings and floated out the chimney right before the Queen's party",
  },
  {
    id: "prob_gravity",
    label: "Someone Turned Off Gravity!",
    titleSuffix: "the Day Gravity Turned Off",
    promptFragment:
      "The town's Gravity Switch has gone missing and everyone's furniture, pets, and teacups are floating toward the ceiling",
  },
  {
    id: "prob_map",
    label: "The Whispering Treasure Map",
    titleSuffix: "the Whispering Treasure Map",
    promptFragment:
      "They found a mysterious rolled-up map in the attic that giggles and gives riddles leading to a hidden vault",
  },
  {
    id: "prob_monster",
    label: "A Grumpy Monster Under the Bed",
    titleSuffix: "the Grumpy Monster Under the Bed",
    promptFragment:
      "A fuzzy purple monster moved into the pantry because he lost his favourite teddy bear and won't stop snoring loudly",
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
