# Coven

An open-world survival RPG in the browser. You play a witch of a broken coven on a 5 km × 5 km island. Gather, hunt and brew to survive, build a village, level your skills, and recruit three sister witches. Coven spells need two, three or four witches, and only the four-witch Grand Rite can break the ward of the Unwitch at the Crown.

Built with JavaScript and Three.js (WebGL 2). The world keeps a stylised, low-poly look, but it is lit and shaded physically: sun and moon shadows, filmic tone and adaptive exposure, aerial haze, swaying grass and trees, water that reflects the sky, and witch heroes with sculpted faces, real eyes that blink and look about, jointed fingers, and skin, hair, cloth and metal that each catch the light their own way.

## Play

**[Play Coven](https://darkstalkermap-prog.github.io/Coven/)** (once GitHub Pages is enabled for this repository), or download `Browser/Play-Coven.html` and open it offline. It is a single self-contained file.

Use a desktop browser with a keyboard and mouse. Progress saves in the browser's local storage.

**Graphics** (title screen):

| Level | What you get |
| --- | --- |
| Ultra | 4× anti-aliasing, 4096 shadows over 80 m, dense grass, a longer view, up to 1.5× resolution on sharp screens. For strong graphics cards. |
| High | 2× anti-aliasing and the final grade, 2048 shadows over 55 m, grass, sky-lit heroes with cloth and hair sheen, reflecting water. |
| Medium | Shadows (1024, updated every other frame), fuller trees, surface detail and water; no grass or final pass. |
| Low | The plain look of the earlier versions: no shadows, simple trees, a shorter view at 60% resolution. For older computers. |
| Auto | Starts at High, lowers the resolution when frames slow down and drops to a simpler level if that isn't enough (it settles on the title screen, before you begin). |

**Speed test** (title screen or pause menu, or open the game with `?benchmark` at the end of its address): the witch walks the same route through Springvale at each graphics level while the game measures the frame rate. A table shows each level's average and slowest 1% (as frames per second) with a verdict (smooth: 55 or more, rarely below 40; playable: 30, rarely below 20), the graphics card, window and browser; **Use** picks the recommended level and **Copy results** copies the table to share. Esc stops it; your game is left as it was.

**Music** (title screen and [N] in game): witchy music made as you play: a drone, slow minor chords, a harp and a wooden flute by day, a music box by night, drums when something hunts you or the Unwitch is near. At the default volume it sits near -21 dBFS, gentle but plainly audible (it was about 13 dB quieter before), and even full volume never clips. **How to play** (title screen and [H]) explains the goal, the rules and the controls, and ends with **All spells**: every path's two spells and every coven rite, with what each does, its key, mana, cooldown, how many witches it needs and its reagents (the Coven tab describes the rites too). Hovering spells, items, recipes and the health bars (with the inventory or map open) shows what they do. **Quit game** (in the pause menu, Esc) saves and returns to the title screen, where Continue picks up where you left off.

| Input | Action |
| --- | --- |
| WASD / Shift / Space | Move / sprint / jump |
| Mouse (or ← →) | Look |
| Left mouse | Strike, or gather from the tree, rock, bush or herb in front of you |
| Right mouse or 1 | Your first spell |
| 1–0 | Spells: 1–2 your class, 3–4 two-witch rites, 5–6 three-witch rites, 7 the Grand Rite, 8 Glamour, 9 Summon the Wyrd Titan, 0 Skyward Charm |
| F | Mount or dismount your broom |
| Space / X (on a Skyward Broom) | Fly up / down |
| E | Interact: talk, recruit, attune, rest, cook, harvest, drink |
| Q | Eat your best food |
| Tab or I / B / K / C | Inventory, build, skills, coven panels (Inventory · Craft · Alchemy · Build · Skills · Coven · Trade) |
| M | World map |
| H | How to play: the goal, the rules and the controls |
| N | Music on or off |
| Enter | Chat (online) |
| Esc | Pause (the pause menu has Quit game) / close panel |

## Playing alone

In single player (not online), any spell can be cast as long as its materials are met: its mana and reagents. Coven rites need no Spellcraft level and no sisters beside you; online, the coven rules apply.

## Multiplayer

Tick **Play online with others** on the title screen, pick a name and optionally a **coven name**, then choose how to connect:

- **Host a game**: your browser runs the world. Once you enter the isle you get a four-letter **game code** (also shown top-left) to give your friends. Keep the tab open: if you close it, the game ends for everyone. Up to eight players.
- **Join with a code**: enter the host's code.
- **Server**: connect to a Coven server (see below) and pick a **world** name; for larger or always-on games.

Hosted games need no server of your own: browsers connect directly (WebRTC, via [PeerJS](https://peerjs.com/)), and PeerJS's free public service only introduces them by code. A few strict networks block direct connections; use a server there.

Everyone in the same game shares the isle:

- You see each other's witches (class colours, name and coven overhead) and can chat with **Enter**.
- Players who enter the **same coven name** form a real coven: each one within 25 m counts toward coven rites, alongside any AI sisters. Four real players can cast the Grand Rite together.
- Trees, rocks and herbs someone depletes disappear for everyone until they regrow.
- Everyone's village buildings are visible (and solid) to all.
- The Unwitch is shared: her health, a broken ward and the final blow count for everyone at the Crown.
- Wildlife is shared: everyone sees the same creatures, they hunt whichever player is nearest, and the player who lands the killing blow gets the loot and experience. Each creature is run by the player who spawned it; if that player leaves or walks away, the nearest other player takes it over.

On a server, worlds are named rooms (default `isle`), up to 32 players each. A game's shared state lasts while someone is in it (or, when hosted, while the host stays); your own progress always saves in your browser.

### Running a server

The server (`server/`) serves the game and hosts the worlds over WebSockets at `/ws`.

- **Render (free):** in Render choose *New → Blueprint* and pick this repository; `render.yaml` does the rest. Players can then play at the Render address directly, online by default.
- **GitHub Pages:** to make the Pages build connect to that server, add a repository variable `COVEN_SERVER` (Settings → Secrets and variables → Actions → Variables) set to the server address, e.g. `https://coven.onrender.com`, and re-run the Pages workflow. Players can also paste a server address into the menu.
- **Locally / LAN:** `npm start` builds and serves on port 8080 with multiplayer; friends on your network can join at `http://<your-ip>:8080`.

Render's free tier sleeps when idle, so the first connection after a quiet spell can take up to a minute.

## The world

The island is split into four lands around the Crown, a mountain summit at its centre. Mountain ridges with passes divide the lands, and inside them open lowland gives way to rolling hill country and craggy ranges: the Gloamwood is the most rugged, the Greenwood and the meadows rolling, the Mirefen low and flat. The coasts, the ground round each Hearth and the human villages' sites stay gentle. Danger rises from 1 at the coast to 12 at the Crown.

Each land is mapped into three **zones** by level, ringed towards the Crown; the HUD shows the zone you are in and its levels, and the map [M] outlines them:

| Levels | Mirefen | Gloamwood | Springvale | Greenwood |
| --- | --- | --- | --- | --- |
| 1–3 (green) | Mirefen Shallows | Gloam Edge | Springvale Fields | Greenwood Glades |
| 4–7 (yellow) | Rotwater Reach | Hollow Night Wood | Hive Hills | Howling Pines |
| 8–11 (orange) | Wyrmdeep Bog | Mourning Thicket | Bramble Heath | Elderhorn Old Growth |
| 12–15 (red) | The Crown | | | |

Ponds and small lakes lie all over the lowlands (one a short walk from every Hearth), so there is always water to drink nearby.

**The sky** turns from blue day through a glowing sunset to a starry night: a rayed sun with a warm halo, a cratered moon ringed by slowly turning runes, aurora ribbons over the north, shooting stars, and fireflies round you after dark.

| Land | Quadrant | Witch | Herbs |
| --- | --- | --- | --- |
| The Mirefen (swamp) | south-west | Bog Witch | Mirecap, Bog Myrtle, Leechweed |
| The Gloamwood (dark forest) | north-west | Hex Witch | Nightshade, Gravemoss, Shadowcap |
| Springvale Meadows | south-east | Bloom Witch | Sunpetal, Honeyclover, Dewbell |
| The Greenwood (forest) | north-east | Wild Witch | Wolfsbane, Elderberry, Fernheart |

Each land has a **Hearth** (class starting point, with that path's elder) and a **Lair** guarded by an elite. Stone circles (attune to make them your respawn point), ruins (one-time caches) and shrines (daily full restore) are scattered across the isle. Moonstone is mined in the Crown mountains with a Stone Pick.

## Human villages

Eight walled villages (two in each land) hold houses, a chapel, a market stall, villagers, gate guards and **witch hunters**. Humans hate witches:

- Walk in as yourself and the **alarm** goes up: witch hunters chase you down and villagers flee. An alarm lasts three minutes.
- Cast **Glamour** [8] (needs Glamour Dust, brewed from Dewbell, Nightshade and a feather; your elder sends you two pinches when you brew your first potion) to wear a human face for 150 seconds. Your coven sisters and familiar wait outside. Enter through a gate and trade with the merchant [E]: sell hides, herbs, potions and essences for **silver**; buy bread, ale, bandages, a Wool Cloak, and Iron Hatchets and Picks that gather far more.
- Casting any other spell, striking anyone, or letting the glamour run out inside the walls breaks the illusion and raises the alarm. You cannot glamour a village that is already on guard.
- A human who dies near you leaves a **soul**. Carry empty **Soul Jars** (made at your Ritual Altar from moonstone and slime) to capture them.
- **Human Souls** are the price of the ultimate summon: **Summon the Wyrd Titan** [9] needs four witches, three souls and a Heartfire Sigil, and raises a colossal ally for 90 seconds. Summon her at the Crown, where she can face the Unwitch.

## Witch classes and familiars

| Class | Spells | Familiar | Bonus | Ability |
| --- | --- | --- | --- | --- |
| Bog Witch | Leech Bolt, Miasma | Grimtoad | Immune to poison | Strikes and spells poison foes |
| Hex Witch | Shadow Bolt, Withering Hex (its curse also makes the target strike 45% softer for 8 s, the Unwitch included) | Corvin the Raven | Undiscovered places show on the compass | +25% spell damage at night |
| Bloom Witch | Sunburst, Renewal | Clover the Hare | +15% move speed | Herbs and berries yield double |
| Wild Witch | Thorn Lash, Barkskin | Ember the Fox | +1 meat and hide from hunts | Ember fights beside you |

## Creatures

**Name plates** over each creature within 40 m show its level and name, coloured by how dangerous it is for you: grey trivial, green easy, yellow an even fight, orange hard, red deadly (more than four levels above you). An elite, marked ◆, counts four levels harder. A health bar appears once it is hurt, and the one your spells would strike shows the verdict in words.

Ten per land (40 in all), from timid prey to hunters that only come out at night. The tenth of each land is an elite that drops **Heartfire**:

- **Mirefen:** Bog Toad, Marsh Heron, Mire Leech, Mudback Boar, Fen Crawler, Will-o'-Wisp, Bog Serpent, Rotting Shambler, Moss Troll, *Grendlemaw the Fen Wyrm*
- **Gloamwood:** Gloom Bat, Shadow Hare, Gravecrow, Duskwolf, Webweaver, Hollow Stag, Gloam Stalker, Bone Revenant, Night Hag's Shade, *Old Mournhide the Shadow Bear*
- **Springvale:** Meadow Rabbit, Bumble Drone, Spring Deer, Gilded Pheasant, Thornback Hedgehog, Hollow Scarecrow, Highmeadow Ram, Pixie Swarm, Bramble Bull, *Queen Vesperia the Great Hornet*
- **Greenwood:** Red Squirrel, Greenwood Deer, Wild Boar, Tusked Badger, Grey Wolf, Horned Owl, Treant Sapling, Brown Bear, Moonhowler, *Elderhorn the Ancient Stag*

Creatures drop meat, hide, bone, feathers, slime, chitin, silk, venom, ectoplasm, honeycomb and the essences of their land.

## Getting started

Every Hearth sits in a generous patch of its land's trees, bushes, rocks and herbs (about 350 m around), with **bird's nests** that give feathers. Two trees, two bushes and one nest are enough for your first **Witch's Broom** (8 wood, 6 fiber, 4 feathers).

## Loot and rarity

Creatures drop armor and weapons scaled to their level, in five rarities: **grey** (Poor), **green** (Uncommon), **blue** (Rare), **purple** (Epic) and **gold** (Legendary). Higher rarity means bigger stats and more bonus stats (health, mana, spell power, armor, speed). Better rarities grow likelier with level; elites never drop grey, gold only drops from level 6 up, and the Unwitch leaves two purple or gold pieces. Drops cover head (hats, hoods, circlets), chest (robes, jerkins, mail), hands, feet, cloak, amulet and weapons (staffs, wands, sickles, spears). In the Inventory, names are coloured by rarity, ▲/▼ compares a piece with what you wear, and **Salvage** breaks unwanted gear into materials; merchants buy gear for silver.

## The witches

Every witch (you, your coven sisters, the elders and other players) is a detailed hero, and each path has its own look:

- **Bloom Witch:** pink hair streaked with green, a wide pink hat covered in flowers and hung with crystals, a petal gown in pink and spring green, butterflies about her, a green spell orb in one hand and a staff crowned with a glowing crystal lotus.
- **Bog Witch:** a hunched moss hag under a shroud of moss and hanging strands, glowing yellow eyes and a crooked grin, a little cauldron bubbling in one hand and a staff topped with a glowing mushroom trailing tendrils.
- **Hex Witch:** black and crimson laced with gold filigree, violet eyes, violet crystals on her hat, a swirl of runes turning in her off hand and a thorned staff holding a crystal.
- **Wild Witch:** an antler crown with a skull and feathers, face paint, fringed hides and a skull belt, bare feet, and a forked antler staff with a hanging lantern.

Faces are sculpted (cheekbones, a jaw narrowing to the chin, eye sockets and a brow, a shaped nose and ears) in natural proportion, about seven heads tall. Each eye has an iris with fibres and a darker rim, a clear cornea that catches the light, and lids with lashes; she blinks every few seconds, her eyes dart about, and she turns her head to what holds her attention (the elders watch you as you come near). Hands have four jointed fingers and a thumb, gripping the staff or open round the spell in the other hand. Skin lets light bleed red past the shadow line as real skin does, with fine pores; cloth has a woven texture and a faint velvet sheen; hair has a gloss; metal is finely scratched. Her stride follows how fast she really moves, so her feet don't slide; on slopes her hips drop to the lower foot and the other knee bends to meet the ground; standing, she shifts her weight from foot to foot; she leans into speed and into turns. A tall staff or spear is held as a real hand holds one: forearm forward, the pole upright through the fist. A strike is a whole-body blow: the staff cocked back over the shoulder, hips then chest turning into it as the arm and wrist bring it over the top and down onto what is in front of her, knees bending, eyes on the target, then follow-through and recovery; a cast lifts the staff and points its head at the target while the off hand pushes forward. The camera rides fixed to her (only its height eases), and everything is drawn between the game's 1/60 s steps, so sprinting or flying sideways is smooth.

The **elders** who give the quests wear their path's style in a revealing cut: bare shoulders, arms and midriff, wrapped in their land's flowers, moss, lace or hides, with a great staff, crown and amulet.

Each worn piece of gear appears on her and grows richer with rarity: coloured trims, polished silver and gold, glowing gems and runes, and motes of light around epic and legendary gear. Capes ripple and trail, hair sways, and she walks, casts and rides her broom. The Inventory shows her in a turning portrait.

## Equipment and the broom

The **Inventory** shows ten slots: Head, Chest, Hands, Feet, Cloak, Amulet, Weapon, two Tools and Mount. Only worn gear counts: equipped tools set how much each strike gathers (a hatchet for wood, a pick for stone and moonstone), the weapon slot sets your strike (otherwise you hit with your best tool), armor reduces damage taken (25 armor blocks a third), a cloak keeps out the cold, and a Moonstone Amulet adds 25 mana. Newly crafted or bought gear puts itself on if its slot is free.

| Gear | Slot | Made from |
| --- | --- | --- |
| Hide Cap (armor 4), Bone Helm (9) | Head | hide + fiber; bone + hide |
| Hide Jerkin (10), Chitin Mail (20), Iron Mail (26) | Chest | hide + fiber; chitin + silk + hide; bought for 70 silver |
| Hide Cloak (2), Wool Cloak (3) | Cloak | hide + fiber; bought |
| Moonstone Amulet (+25 mana) | Amulet | moonstone + silk |
| Witch's Broom | Mount | wood + fiber + feathers |

Mount the broom with **F** to travel 70% faster; it skims over water as well as land. A plain broom cannot fly: cast the **Skyward Charm** [0] with a second witch beside you (an AI sister or another player in your coven) and it becomes a **Skyward Broom** for good, which flies on its own at 200% faster than walking: hold **Space** to climb and **X** to descend. Coven sisters ride alongside. Stepping off high in the air means a hard landing.

## Progression

- **Survival:** health, mana, stamina, food and water, with a warning as hunger and thirst set in. Cook meat at any fire [E] (your Hearth has one, and a campfire can be built anywhere), pick berries from bushes, and drink at ponds or a well. Cold in the high mountains (craft a Hide Cloak or stay near fire). Poison from bites.
- **Skills** level with use: Gathering, Herbalism, Hunting, Alchemy, Spellcraft, Building.
- **Crafting** by hand: hatchet, pick, spear, staff, cloak, bandages.
- **Alchemy** at your Cauldron: Healing Draught, Mana Tonic, Swiftfoot Elixir, Venom Coating, Ironbark Brew, Gloamsight Philter, Coven Ink. At a Ritual Altar: Moonstone Dust and Heartfire Sigils.
- **Village:** found it with a Village Heart, then build within 60 m: Cauldron, Witch Hut (rest and respawn), Well, Herb Garden (grows homeland herbs), Warding Totem (beasts stay away), Ritual Altar, Palisade walls and Lantern Posts. Campfires can go anywhere.
- **The coven:** recruit the elder of each other path at her Hearth: the first at level 3, the second at level 6, the third at level 9, each for a potion gift brewed from her own land's herbs (Ironbark Brew for the Bog elder, Gloamsight Philter for the Hex elder, Healing Draught for the Bloom elder, Swiftfoot Elixir for the Wild elder). Sisters follow you and fight with their own spells.
- **Coven rites:** Summon Beast and Binding Circle (2 witches, Coven Ink), Storm of the Three and Call the Guardian (3 witches, Moonstone Dust), the Grand Rite (4 witches, Heartfire Sigil).
- **The ultimate summon:** the Wyrd Titan, paid for in human souls (see Human villages).
- **The beacon:** a pillar of light rises from the Crown, seen from anywhere on the isle: crimson while the Unwitch lives, gold once she is unmade. Before your first game, the title screen shows a witch on a ridge at dusk, watching it.
- **The end:** the Unwitch at the Crown takes only 10% damage until a Grand Rite cast within reach shatters her ward for 30 seconds, and she calls up to three thralls at a time. One batch of Heartfire Sigils (three) is enough for a Titan and two rites.

A fifteen-step quest line guides the way from first gathering to the Grand Rite.

## Realism: what code can do, and what it can't

The heroes, the world and the light are now as convincing as a procedural, code-only build reasonably gets in a browser. Real lifelike quality needs authored assets that code cannot stand in for:

| Asset | What it would take |
| --- | --- |
| Hero models | One sculpted, retopologised body per path, 30–60k triangles at the highest level of detail with 2–3 lower levels, UV-unwrapped, rigged to a standard humanoid skeleton with proper skin weights (the current heroes are rigid parts on bones), and facial blendshapes (the 52 ARKit shapes) for blinks, speech and expression. glTF 2.0, metres, Y up. |
| Skin, hair and cloth textures | PBR sets per material at 2K (4K for faces): base colour, normal, roughness, ambient occlusion, and for skin a subsurface thickness/colour map; hair as alpha-tested hair cards with flow and anisotropy maps; KTX2/Basis-compressed for the web. |
| Animation | Motion-captured clips on the same skeleton: idle variations, walk, jog, run and sprint at matched speeds, starts, stops and turns, strike and cast for each path, broom riding, hit reactions and death, plus blend trees and two-bone foot IK in the engine. |
| The world | Tiling PBR terrain materials (grass, moss, soil, rock, sand, snow) at 1–2K with height-based blending; tree and foliage models with LODs and impostors; an HDR sky set for image-based light. |
| Sound | Recorded or professionally produced music stems and spot effects (footsteps by surface, spells, creatures, ambience) to replace the procedural music. |

The next upgrade with the biggest payoff would be the hero models: a properly sculpted, skinned and blend-shaped character for each path, with matching PBR textures, dropped into the existing pipeline (shadows, sky light, materials and tone are ready for them).

## Current limits

This is a prototype. Players cannot damage each other, and human villages, their people and alarms are local to each player. The art is procedural (see above). Balance numbers come from bot playthroughs, not yet from many human players.

## Development

Requires Node.js 24 (22 works locally).

```sh
npm ci
npm test
npm run build
npm start
```

`npm start` rebuilds and runs the Coven server on port 8080 (set `PORT` to change it), with multiplayer. Do not open `Browser/index.html` directly; it is the build template. `npm run build` writes `Browser/Play-Coven.html` and `_site/index.html`.

| File | Contents |
| --- | --- |
| `Browser/world.mjs` | Deterministic terrain, regions, points of interest, resource scatter |
| `Browser/data.mjs` | Classes, familiars, spells, items, recipes, buildings, skills |
| `Browser/bestiary.mjs` | The 40 creatures and the boss |
| `Browser/rules.mjs` | Inventory, skills, crafting, alchemy, building, needs, magic, coven, quests |
| `Browser/creatures.mjs` | Creature and ally behaviour |
| `Browser/view.mjs` | Three.js rendering |
| `Browser/hero.mjs` | The detailed witch heroes and the gear they wear |
| `Browser/sky.mjs` | The sky: day, dusk and night, sun, moon, stars, aurora, fireflies |
| `Browser/graphics.mjs` | Quality levels, shadows, ground, foliage, grass and water shaders, the beacon, sky light for heroes, the final image |
| `Browser/music.mjs` | Procedural witchy music (Web Audio) |
| `Browser/loot.mjs` | Gear drops in five rarities |
| `Browser/game.mjs` | Game loop, input, HUD and panels |
| `Browser/net.mjs` | Connection to a shared world: server WebSocket, or a hosted game |
| `Browser/peer.mjs` | Player-hosted games over WebRTC: host (runs `server/hub.mjs` in the browser) and join by code |
| `server/hub.mjs` | Shared-world rules: players, creatures, harvests, villages, the Unwitch, chat |
| `server/server.mjs` | HTTP and WebSocket server |

### Performance

`npm run profile -- [class] [seconds] [auto|high|low]` builds an unminified copy, plays it in headless Chromium and prints frame times, draw calls, triangles and the JavaScript functions that cost the most per frame (set `CHROMIUM_PATH` to use an installed Chromium).

What keeps it light: each hero is drawn in a handful of calls, as one skinned mesh per finish (matte, satin, metal, see-through, glowing) whose bones are her moving parts, with colours painted into the vertices; the sky's gradient and glows are worked out per vertex, with stars as points and the aurora on a band of its own; terrain and resource nodes are lit once per vertex rather than per pixel; terrain heights are cached and distant chunks use fewer vertices (with skirts to hide seams); herbs, bushes and rocks are only drawn near you; landmarks and buildings are merged into one or two meshes each; nothing past the fog is drawn; campfire lights leave the shader in daylight; the HUD updates ten times a second and only touches what changed; and the server encodes each broadcast once.

### Graphics comparisons

`node Scripts/beauty_shots.mjs <page.html> <folder> [quality] [views]` takes the same views (the inventory portraits, the heroes by day and by night, a wide view of the hills) from any build, for before-and-after comparisons.

Frame rates in headless Chromium's software renderer (SwiftShader, no graphics card: the worst case), at 1280×800 with Bloom at her hearth:

| Level | Before this upgrade | After |
| --- | --- | --- |
| Low | 18.1 fps | 14.7 fps |
| Medium | — | 5.0 fps |
| High | 12.5 fps (no shadows, no anti-aliasing) | 1.5 fps |

Software rendering pays for every pixel on the CPU, so shadows, anti-aliasing and per-pixel shading cost it far more than a graphics card; on a real GPU High is a light load. Auto settles at the level the computer can carry (in the software renderer it falls to Low at half resolution, 9.7 fps with four witches in view).

### Four players

`node Scripts/four_player_sim.mjs [seconds] [quality]` starts the real server and four browsers in one coven, gathers them and has them walk, fight and cast together, then reports each one's frame rate, network traffic, how far and how smoothly she sees the other three move, and the server's load. In a 45-second run: about 1–8 KB/s up and 11–31 KB/s down per player at 10 updates a second, the others drawn within 1.3 m of where they really are with smooth motion, no errors, and the server at about 2% of one CPU core.

### Hero lab

`node Scripts/hero_shots.mjs <folder> [class…]` renders each class's hero at three looks (starting gear, legendary gear, and the revealing elder) from the front, the back and close up, for checking the models.

### Playthrough

`npm run build && npm run playthrough -- [class] [first quest] [last quest]` lets a bot witch play the whole quest line in headless Chromium, through the game's own keys, mouse and pack buttons, many times faster than real time (`Scripts/playbot.mjs`): she walks round the Crown and the lairs, gathers, crafts, builds her village, brews, trades in a glamour, recruits her sisters, hunts the elite, takes souls, summons the Titan and fights the Unwitch, eating, drinking and healing as she goes. Whatever stops her (getting stuck, dying, a quest she cannot finish) is written to `test-results/playthrough-<class>.md` with screenshots along the way; if she cannot finish a quest she is helped past it and the run goes on. A quest that runs far past her own time limit is paused and the place it was stuck is printed.

### Browser test

```sh
npx playwright install --with-deps chromium
npm run build
npm run test:browser
```

`BROWSER=chrome`, `BROWSER=firefox` or `BROWSER=webkit` (the engine of Safari) runs the same tests in another browser (`npx playwright install --with-deps firefox` etc. first; Google Chrome must be installed). On GitHub the suite runs in all four, Chromium, Google Chrome, Firefox and WebKit, side by side for every change, and after each deploy `Scripts/live_check.mjs` opens the live site in each and starts a game there. `node Scripts/music_check.mjs` renders each mood of the music offline, checks it is audible, never silent and never clipping, and saves WAV recordings in `test-results/` (CI keeps them as the *music-recordings* download).

Set `CHROMIUM_PATH` to use an installed Chromium. The test serves the game at the Pages subpath, picks a class, walks, builds a village, brews at the cauldron, checks coven-spell gating, hunts a wolf with spells, opens the map, and breaks the Unwitch's ward with a four-witch Grand Rite. A third test runs a player-hosted game through a local PeerJS broker: a host gets a code, a guest joins with it, they share the world, a wrong code is reported and the host leaving is handled. A second test starts the real server with two browsers and checks presence, a real two-player coven rite, shared harvesting, shared villages, chat, shared creatures (kill credit, bites across players, handover when a player leaves) and leaving. Both fail on any browser error. A fourth, `Scripts/ui_check.mjs`, goes through everything a player touches: the Low and Medium graphics levels and switching them in game (`UI_CHECK_ALL_GFX=1` adds High, Ultra and Auto), the title screens, How to play and the spell list, music and [N], moving, jumping, gathering, eating, casting, every panel, tab and key, tooltips, the map, the elder, the broom, pausing, falling, resizing, the beacon turning gold, quit and continue, a new game and a phone-sized screen. Screenshots go to `test-results/`.
