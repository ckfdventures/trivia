/**
 * The word decks shipped with a fresh database.
 *
 * Seeded on startup if the collection is empty, then owned by the admin panel — these are a
 * starting point, not a fixed list (DECISIONS.md D9).
 *
 * Three rules shaped the content:
 *  - Every word has to be *drawable*. Concrete nouns only; no abstractions, no verbs.
 *  - Nothing trademarked. Generic concepts only — "superhero", never a character's name.
 *  - Aimed at a Gen Z audience while staying family-safe (DECISIONS.md D3), so the decks
 *    skew current and funny rather than either childish or edgy.
 */

export interface SeedDeck {
  id: string;
  name: string;
  blurb: string;
  emoji: string;
  words: string[];
}

/** Comma-separated for density; split and trimmed here so the lists stay readable. */
const words = (list: string): string[] =>
  list
    .split(",")
    .map((w) => w.trim())
    .filter(Boolean);

export const SEED_DECKS: SeedDeck[] = [
  {
    id: "animals",
    name: "Animals",
    blurb: "Pets, beasts and things with too many legs",
    emoji: "🐾",
    words: words(`
      penguin, otter, sloth, axolotl, hedgehog, raccoon, narwhal, jellyfish, octopus, flamingo,
      chameleon, koala, panda, tiger, giraffe, elephant, rhino, hippo, zebra, camel,
      kangaroo, wombat, platypus, armadillo, porcupine, badger, ferret, weasel, meerkat, lemur,
      gorilla, chimpanzee, orangutan, baboon, sea lion, walrus, seal, dolphin, whale, shark,
      stingray, pufferfish, seahorse, starfish, crab, lobster, shrimp, snail, slug, worm,
      butterfly, moth, caterpillar, bee, wasp, ant, beetle, ladybug, dragonfly, grasshopper,
      cricket, spider, scorpion, centipede, praying mantis, snake, cobra, python, lizard, gecko,
      iguana, crocodile, alligator, turtle, tortoise, frog, toad, newt, salamander, bat,
      owl, eagle, hawk, falcon, parrot, toucan, peacock, ostrich, emu, swan,
      duck, goose, chicken, rooster, turkey, pigeon, seagull, crow, raven, woodpecker,
      hummingbird, robin, sparrow, cat, kitten, dog, puppy, hamster, guinea pig, rabbit,
      squirrel, chipmunk, mouse, rat, fox, wolf, bear, deer, moose, elk,
      bison, horse, pony, donkey, zebra foal, cow, pig, sheep, goat, llama,
      alpaca, reindeer, polar bear, sea otter, manatee, pelican, puffin, lynx, cheetah, leopard
    `),
  },
  {
    id: "food",
    name: "Food & Drink",
    blurb: "Snacks, meals and questionable late-night choices",
    emoji: "🍜",
    words: words(`
      ramen, sushi, dumpling, taco, burrito, quesadilla, nachos, pizza, calzone, lasagna,
      spaghetti, meatball, burger, hot dog, sandwich, wrap, bagel, croissant, baguette, pretzel,
      donut, cupcake, muffin, brownie, cookie, waffle, pancake, crepe, churro, cinnamon roll,
      ice cream, popsicle, milkshake, smoothie, bubble tea, iced coffee, latte, espresso, hot chocolate, lemonade,
      soda, juice box, energy drink, coconut water, watermelon, pineapple, mango, banana, strawberry, blueberry,
      raspberry, cherry, peach, plum, apple, pear, grape, orange, lemon, lime,
      kiwi, avocado, tomato, cucumber, carrot, broccoli, cauliflower, lettuce, spinach, mushroom,
      onion, garlic, pepper, chili, corn, potato, sweet potato, pumpkin, eggplant, zucchini,
      rice bowl, noodles, curry, soup, stew, salad, omelette, fried egg, bacon, sausage,
      steak, chicken wing, fish sticks, popcorn, chips, fries, onion rings, nuggets, cereal, toast,
      peanut butter, jam, honey, cheese, butter, yogurt, pudding, jelly, marshmallow, candy cane,
      lollipop, gummy bear, chocolate bar, cotton candy, pie, cheesecake, birthday cake, macaron, croquette, spring roll,
      pho, kimchi, falafel, hummus, gyro, kebab, paella, risotto, tempura, poke bowl
    `),
  },
  {
    id: "everyday",
    name: "Everyday Stuff",
    blurb: "The things cluttering your room right now",
    emoji: "🎒",
    words: words(`
      backpack, tote bag, wallet, keychain, sunglasses, umbrella, water bottle, thermos, lunchbox, notebook,
      pencil case, highlighter, sticky note, stapler, scissors, ruler, eraser, sharpener, calculator, textbook,
      headphones, earbuds, speaker, charger, power bank, laptop, tablet, mouse, keyboard, monitor,
      webcam, microphone, remote control, game controller, console, camera, tripod, drone, smartwatch, alarm clock,
      lamp, desk, chair, beanbag, couch, pillow, blanket, mattress, wardrobe, mirror,
      bookshelf, poster, fairy lights, candle, plant pot, cactus, vase, picture frame, rug, curtain,
      doormat, laundry basket, hanger, iron, hairdryer, toothbrush, toothpaste, hairbrush, comb, razor,
      soap, shampoo, towel, bathrobe, slippers, sneakers, boots, sandals, socks, scarf,
      beanie, cap, hoodie, jacket, raincoat, jeans, shorts, skirt, dress, sweater,
      t-shirt, pyjamas, watch, bracelet, necklace, earring, ring, glasses, mask, gloves,
      skateboard, scooter, bicycle, helmet, roller skates, surfboard, snowboard, tennis racket, basketball, football,
      soccer ball, baseball bat, skipping rope, yoga mat, dumbbell, treadmill, guitar, ukulele, piano, drum,
      microwave, kettle, toaster, blender, fridge, oven, frying pan, mug, teapot, cutting board
    `),
  },
  {
    id: "fantasy",
    name: "Fantasy & Heroes",
    blurb: "Dragons, capes and other made-up nonsense",
    emoji: "🦸",
    words: words(`
      dragon, wizard, witch, sorcerer, knight, castle, sword, shield, crown, throne,
      wand, spellbook, potion, cauldron, crystal ball, magic carpet, treasure chest, gold coin, map, compass,
      pirate, pirate ship, anchor, kraken, mermaid, merman, trident, siren, sea monster, lighthouse,
      unicorn, pegasus, griffin, phoenix, centaur, minotaur, cyclops, giant, troll, ogre,
      goblin, elf, dwarf, fairy, pixie, gnome, mermaid tail, genie, lamp, sphinx,
      zombie, vampire, werewolf, ghost, skeleton, mummy, haunted house, graveyard, cauldron fire, black cat,
      superhero, cape, mask, sidekick, villain, lair, secret base, jetpack, laser beam, force field,
      robot, android, cyborg, spaceship, rocket, astronaut, alien, flying saucer, space station, moon base,
      ray gun, time machine, portal, wormhole, meteor, comet, galaxy, planet, satellite, telescope,
      ninja, samurai, warrior, archer, crossbow, catapult, battering ram, watchtower, drawbridge, moat,
      dungeon, labyrinth, riddle, curse, prophecy, quest, scroll, rune, amulet, talisman,
      beanstalk, gingerbread house, glass slipper, golden egg, wishing well, rainbow bridge, ice palace, enchanted forest, talking tree, shooting star
    `),
  },
  {
    id: "online",
    name: "Online Life",
    blurb: "Screens, feeds and the group chat",
    emoji: "📱",
    words: words(`
      selfie, group chat, notification, screenshot, playlist, podcast, livestream, video call, meme, emoji,
      hashtag, profile picture, avatar, filter, follower, unboxing, tutorial, vlog, thumbnail, subscribe button,
      loading spinner, buffering, wifi signal, dead battery, low storage, spam folder, inbox, password, two-factor, captcha,
      shopping cart, wishlist, gift card, package, delivery van, tracking number, review star, thumbs up, heart button, share arrow,
      streaming, binge watch, cliffhanger, spoiler, subtitle, headphones, karaoke, dance trend, duet, remix,
      gaming setup, boss fight, checkpoint, power up, loot box, leaderboard, respawn, speedrun, lag, controller drift,
      typing bubble, read receipt, voice note, disappearing message, pinned chat, mute button, block list, status update, story, poll,
      keyboard smash, autocorrect fail, wrong chat, left on read, double text, screen time, do not disturb, airplane mode, dark mode, screenshot folder,
      cloud backup, hard drive, usb stick, charging cable, wireless earbuds, ring light, green screen, tripod, microphone, webcam,
      food delivery, rideshare, map pin, step counter, alarm snooze, weather app, calendar invite, reminder, to-do list, focus timer
    `),
  },
];
