import { createWorld, HALF, WORLD_SIZE, NODES, REGIONS, CROWN, HUMAN_VILLAGE } from './world.mjs';
import { WorldView, HeroPreview } from './view.mjs';
import { Music } from './music.mjs';
import { CLASSES, SPELLS, ITEMS, RECIPES, BUILDINGS, SKILLS, VILLAGE_RADIUS, SELL, BUY, COVEN_SPELLS, SLOTS } from './data.mjs';
import { CREATURE, BESTIARY, BOSS, ELITE_RESPAWN } from './bestiary.mjs';
import * as R from './rules.mjs';
import { makeCreature, pickCreature, updateCreature, hurtCreature, makeAlly, updateAlly, ALLIES, WEAKENED } from './creatures.mjs';
import { Net, defaultServer } from './net.mjs';
import { RARITIES, dropGear, generateGear, addGear, registerGear, salvage, lookOf, encodeLook } from './loot.mjs';

const SAVE_KEY = 'coven-save-v2', ONLINE_KEY = 'coven-online', DAY_LENGTH = 1200, NODE_RESPAWN = 600, EXPLORE = 64, MAX_CREATURES = 16, COVEN_REACH = 25;
const REGION_CLASS = { swamp: 'bog', darkforest: 'hex', meadow: 'bloom', forest: 'wild' };
const SPELL_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0'];
const ALARM = 180, HUMAN_SPAWN = 300, HUMAN_DESPAWN = 450;
// Cached element lookup (re-queried if the element was replaced).
const found = new Map();
const $ = s => { let el = found.get(s); if (!el?.isConnected) { el = document.querySelector(s); found.set(s, el); } return el; };
const canvas = $('#world');
const world = createWorld(1337);

let view;
try { view = new WorldView(canvas, world); }
catch (error) {
  $('#description').textContent = '3D graphics could not start. Enable hardware acceleration and use a browser with WebGL 2 support.';
  $('#play').disabled = true;
  throw error;
}

function freshState(classId) {
  const p = R.newPlayer(classId, world.spawnPoint(CLASSES[classId].region));
  p.yaw = Math.atan2(world.hearthOf(CLASSES[classId].region).z - p.z, world.hearthOf(CLASSES[classId].region).x - p.x);
  return { version: 3, player: p, clock: 0, dayTime: .3, day: 1, harvested: {}, nodeHp: {}, buildings: [], discovered: [], attuned: [], looted: [], blessedDay: {}, explored: [], elites: {}, bossHp: BOSS.hp, bossDefeated: false };
}
// Version 2 saves come from the 10 km island: move everything to the same spot on the 5 km one, and let go of
// what was tied to old ground (depleted nodes, the explored map).
function migrate(s) {
  if (s?.version !== 2) return s;
  const k = WORLD_SIZE / 10000, p = s.player;
  for (const o of [p, p.home, ...s.buildings]) { o.x *= k; o.z *= k; }
  p.y = world.ground(p.x, p.z); p.mounted = p.flying = false;
  for (const b of s.buildings) b.y = world.ground(b.x, b.z);
  Object.assign(s, { version: 3, harvested: {}, nodeHp: {}, explored: [] });
  return s;
}
function loadState() {
  try { const s = migrate(JSON.parse(localStorage.getItem(SAVE_KEY))); return s?.version === 3 && CLASSES[s.player?.class] ? s : null; } catch { return null; }
}
function saveState() { if (state) try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch { /* storage unavailable: progress lasts this session only */ } }

const net = new Net();
let remotes = new Map(), villages = new Map(), serverBoss = null, netTimer = 0, lastSent = '', heartbeat = 0;
let state = null, explored, creatures = [], allies = [], projectiles = [], boss = null, keys = new Set(), jumpTap = false, mode = 'menu';
let yaw = 0, pitch = .3, swing = 0, swingKind = 'strike', swingCooldown = 0, last = 0, accumulator = 0, saveTimer = 0, spawnTimer = 0, moving = false, hurtFlash = 0, mapBase = null, tab = 'items', nextId = 1;

function begin(s) {
  state = s; buildingsChanged();
  registerGear(state.player);
  R.ensureEquip(state.player);
  const p = state.player;
  explored = new Uint8Array(EXPLORE * EXPLORE);
  for (const i of state.explored) explored[i] = 1;
  for (const id of [...view.hidden]) view.showNode(id);
  for (const id of Object.keys(state.harvested)) view.hideNode(id);
  creatures = []; projectiles = []; boss = null;
  allies = p.coven.map(cls => Object.assign(makeAlly('witch', p.x + 2, p.z + 2), { cls }));
  if (p.class === 'wild') allies.push(makeAlly('fox', p.x - 1, p.z));
  view.ensurePlayer(p.class, CLASSES[p.class].familiar.species);
  p.y = Math.max(world.ground(p.x, p.z), -1.1);
  yaw = p.yaw;
  view.stream(p.x, p.z, 30);
}

// ---------- messages ----------
// `rarity` (0-4) colours the message like the item it announces.
const messages = []; // every toast, for the playthrough bot
function toast(text, big = false, rarity = null) {
  messages.push(text); if (messages.length > 400) messages.shift();
  const el = document.createElement('div');
  el.textContent = text; if (big) el.className = 'big';
  if (rarity !== null) el.style.color = RARITIES[rarity].color;
  $('#toast').prepend(el);
  while ($('#toast').children.length > 5) $('#toast').lastChild.remove();
  setTimeout(() => el.remove(), 4500);
}
function reward(amount) {
  const p = state.player, levels = R.gainXp(p, amount);
  if (levels) toast(`Level ${p.level}. Your power grows.`, true);
}
function trained(skill, level) { if (level) toast(`${SKILLS[skill].name} rises to ${level}.`); }
// Completes every quest that is done, in order: one finished earlier (an elite slain on the way) completes as
// soon as it comes up.
function quests() {
  let q, any = false;
  while ((q = R.checkQuest(state.player))) {
    any = true;
    toast(`Quest complete: ${q.title}`, true);
    if (q.gift) toast(`Your elder sends ${Object.entries(q.gift).map(([id, n]) => `${n} ${ITEMS[id].name}`).join(', ')}: enough to walk among humans unseen.`);
  }
  if (any && R.QUESTS[state.player.quest]) toast(`New task: ${R.QUESTS[state.player.quest].title}`);
}

// ---------- world queries ----------
const isNight = () => state.dayTime < .23 || state.dayTime > .77;
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const near = (a, b, r) => dist(a, b) < r;
const facing = (p, x, z) => { const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz) || 1; return (dx * Math.cos(p.yaw) + dz * Math.sin(p.yaw)) / d; };
const builtNear = (type, r) => state.buildings.find(b => b.type === type && near(b, state.player, r));
const heart = () => state.buildings.find(b => b.type === 'heart');
const hearthFires = () => world.pois.filter(p => p.type === 'hearth');
const nearFire = r => !!builtNear('campfire', r) || hearthFires().some(h => near(h, state.player, r));
const stations = () => new Set(['cauldron', 'altar'].filter(t => builtNear(t, 8)));
const sisters = () => allies.filter(a => a.ally === 'witch');
const covenMates = () => { const c = online.coven.toLowerCase(); return c ? [...remotes.values()].filter(r => r.coven.toLowerCase() === c) : []; };
const covenNearby = () => Math.min(4, 1 + sisters().filter(s => near(s, state.player, COVEN_REACH)).length + covenMates().filter(r => r.hp > 0 && near(r, state.player, COVEN_REACH)).length);
// Built once and reused until a building is placed or another player's village changes.
let builtCache = null, lightCache = null;
const allBuildings = () => builtCache ??= [...state.buildings, ...[...villages.values()].flatMap(v => v.list)];
const lightSources = () => lightCache ??= [...allBuildings().filter(b => b.type === 'campfire' || b.type === 'lantern'), ...hearthFires()];
const buildingsChanged = () => { builtCache = lightCache = null; };
const ELDERS = world.pois.filter(p => p.type === 'hearth').map(h => ({ id: `elder-${h.region}`, cls: REGION_CLASS[h.region], x: h.x + 3, z: h.z + 3, y: h.y, yaw: Math.PI / 4, hearth: h }));
let elderCache = null, elderKey = '';
const elders = () => { const key = state.player.coven.join(); if (key !== elderKey || !elderCache) { elderKey = key; elderCache = ELDERS.filter(e => !state.player.coven.includes(e.cls)); } return elderCache; };
const wards = () => allBuildings().filter(b => b.type === 'totem');

// ---------- shared creatures ----------
// Online, wild creatures are owned by whoever spawned them: we run the AI for ours and report it; others'
// (flagged `remote`) arrive in snapshots and are only drawn and targeted here. Village humans stay local.
const ID_SPAN = 1e6;
let creatureSeq = 0, creatureTimer = 0, goneIds = [];
const shared = c => c.village === undefined && !c.remote;
function newCreature(kind, x, z, extra) {
  const c = makeCreature(kind, x, z, extra);
  if (net.online) c.id = net.id * ID_SPAN + (++creatureSeq % ID_SPAN);
  return c;
}
// The living player (us or another) a creature should go for: the nearest within 80 m.
function preyFor(c) {
  let prey = state.player, best = dist(c, prey) + (prey.hp > 0 ? 0 : 1e9);
  for (const r of remotes.values()) { const d = dist(c, r); if (r.hp > 0 && d < best && d < 80) { prey = r; best = d; } }
  return prey;
}
const r2 = v => Math.round(v * 100) / 100;
function reportCreatures(dt) {
  if (!net.online || (creatureTimer -= dt) > 0) return;
  creatureTimer = .1;
  const list = remotes.size ? creatures.filter(shared).map(c => ({ id: c.id, kind: c.kind, x: r2(c.x), y: r2(c.y), z: r2(c.z), yaw: r2(c.yaw), hp: Math.ceil(c.hp), maxHp: c.maxHp, state: c.state, walk: r2(c.walk), hurt: r2(c.hurt), ...(c.homeX !== undefined ? { hx: c.homeX, hz: c.homeZ } : {}) })) : [];
  if (list.length || goneIds.length) net.send({ type: 'creatures', list, gone: goneIds });
  goneIds = [];
}
// Stop running the given creatures; online, the server may pass them to someone nearer.
function dropCreatures(keep) {
  const kept = [];
  for (const c of creatures) { if (keep(c)) kept.push(c); else if (shared(c) && net.online && c.hp > 0) goneIds.push(c.id); }
  creatures = kept;
}

// ---------- human villages ----------
const humanVillages = world.pois.filter(o => o.type === 'village');
const villageState = new Map(humanVillages.map(v => [v.id, { alarm: 0, spawned: false }]));
const glamoured = () => !!state.player.effects.glamour;
const villageAt = (o, extra = 0) => humanVillages.find(v => near(v, o, HUMAN_VILLAGE.radius + extra));
const merchantNear = () => creatures.find(c => c.kind === 'merchant' && c.hp > 0 && near(c, state.player, 5));
const canTrade = () => glamoured() && merchantNear() && !(villageState.get(merchantNear().village).alarm > 0);

function raiseAlarm(v, why) {
  const vs = villageState.get(v.id), was = vs.alarm > 0;
  vs.alarm = ALARM;
  if (glamoured()) { delete state.player.effects.glamour; toast('Your glamour shatters!'); }
  if (!was) toast(`${why} The witch hunters of ${v.name} are coming!`, true);
}

function spawnVillagers(v) {
  const add = (kind, x, z, roam) => creatures.push(makeCreature(kind, x, z, { village: v.id, homeX: x, homeZ: z, roam, calm: true }));
  const L = v.layout;
  add('merchant', L.stall.x, L.stall.z, 0);
  for (const g of L.gates) { const ix = v.x + Math.cos(g.angle) * (HUMAN_VILLAGE.radius - 4), iz = v.z + Math.sin(g.angle) * (HUMAN_VILLAGE.radius - 4); add('hunter', ix, iz, 3); }
  for (let i = 0; i < 2; i++) add('hunter', v.x + (i ? 10 : -10), v.z + 6, 25);
  for (let i = 0; i < 5; i++) { const a = i * 1.3; add('villager', v.x + Math.cos(a) * 15, v.z + Math.sin(a) * 15, 25); }
}

function updateVillages(dt) {
  const p = state.player;
  for (const v of humanVillages) {
    const vs = villageState.get(v.id), d = dist(v, p);
    vs.alarm = Math.max(0, vs.alarm - dt);
    if (d < HUMAN_SPAWN && !vs.spawned) { vs.spawned = true; spawnVillagers(v); }
    if (d > HUMAN_DESPAWN && vs.spawned) { vs.spawned = false; creatures = creatures.filter(c => c.village !== v.id); }
    if (!vs.spawned) continue;
    if (d < HUMAN_VILLAGE.radius + 3 && p.hp > 0 && !glamoured() && vs.alarm <= 0) raiseAlarm(v, `A witch walks in ${v.name}!`);
    const alarm = vs.alarm > 0;
    for (const c of creatures) {
      if (c.village !== v.id) continue;
      c.calm = !alarm;
      if (c.kind === 'hunter') { c.angry = alarm && d < 160; if (c.angry) c.state = 'chase'; }
    }
  }
  if (p.wasGlamoured && !glamoured()) { const v = villageAt(p, 10); if (v) raiseAlarm(v, 'Your glamour fades!'); else toast('Your glamour fades.'); }
  p.wasGlamoured = glamoured();
}

// The palisade has two gates; houses are solid.
function villageWalls(x, z, px, pz) {
  for (const v of humanVillages) {
    if (Math.abs(v.x - x) > 50 || Math.abs(v.z - z) > 50) continue;
    const R = HUMAN_VILLAGE.radius, dx = x - v.x, dz = z - v.z, d = Math.hypot(dx, dz) || 1;
    if (Math.abs(d - R) < 1.1) {
      const a = Math.atan2(dz, dx), gap = Math.min(...v.layout.gates.map(g => Math.abs(((a - g.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI)));
      if (gap > HUMAN_VILLAGE.gate * .75) { const r = Math.hypot(px - v.x, pz - v.z) < R ? R - 1.1 : R + 1.1; x = v.x + dx / d * r; z = v.z + dz / d * r; }
    }
    for (const h of v.layout.houses) {
      const r = Math.max(h.w, h.d) / 2 + .5, hx = x - h.x, hz = z - h.z, hd = Math.hypot(hx, hz);
      if (hd < r && hd > 0) { x = h.x + hx / hd * r; z = h.z + hz / hd * r; }
    }
  }
  return [x, z];
}

// ---------- the broom ----------
function toggleMount() {
  const p = state.player;
  if (p.mounted) {
    const high = p.flying && p.y > world.ground(p.x, p.z) + 3;
    p.mounted = p.flying = false; p.vy = 0;
    toast(high ? 'You leap from your broom!' : 'You step off your broom.');
    return;
  }
  const blocker = R.mountBlocker(p, { swimming: world.ground(p.x, p.z) < -1.3 });
  if (blocker) { toast(blocker); return; }
  p.mounted = true;
  toast(R.flightBlocker(p) ? `You mount your broom: ${Math.round((ITEMS[p.equip.mount].speed - 1) * 100)}% faster. Enchant it with the Skyward Charm [0] and it will fly.` : 'You mount your Skyward Broom. Hold Space to fly, X to descend.');
}

// ---------- interaction ----------
function interaction() {
  const p = state.player;
  const merchant = merchantNear();
  if (merchant) return canTrade()
    ? { label: 'Trade with the merchant', act: () => openPanel('pack', 'trade') }
    : { label: villageState.get(merchant.village).alarm > 0 ? 'The merchant cowers. The village is on guard.' : 'The merchant would see a witch. Cast Glamour [8] first.', act: () => {} };
  const elder = elders().find(e => near(e, p, 5));
  if (elder) {
    const k = CLASSES[elder.cls];
    if (elder.cls === p.class) return { label: `Speak with ${k.elder}`, act: () => {
      if (!p.stats.talked) { p.stats.talked = 1; toast(`${k.elder}: "The coven broke when the Unwitch rose at the Crown. Grow strong, find your sisters in the other lands, and together end her."`); reward(20); quests(); }
      else toast(`${k.elder}: "${R.QUESTS[p.quest]?.text ?? 'You have done all I asked, sister.'}"`);
    } };
    const blocker = R.recruitBlocker(p, elder.cls);
    return blocker
      ? { label: `${k.elder} (${k.name}): ${blocker}`, act: () => toast(`${k.elder}: "${blocker}, and I will join your coven."`) }
      : { label: `Ask ${k.elder} to join your coven`, act: () => {
        R.recruit(p, elder.cls);
        allies.push(Object.assign(makeAlly('witch', elder.x, elder.z), { cls: elder.cls }));
        toast(`${k.elder} the ${k.name} joins your coven!`, true); quests();
      } };
  }
  const poi = world.pois.find(o => near(o, p, o.type === 'hearth' ? 0 : 14));
  if (poi?.type === 'circle') return state.attuned.includes(poi.id)
    ? { label: `Rest at the ${poi.name} circle`, act: () => { p.home = { x: poi.x + 3, z: poi.z + 3, name: poi.name }; p.hp = p.maxHp; p.mana = p.maxMana; saveState(); toast('You rest within the stones. Progress saved.'); } }
    : { label: `Attune to the ${poi.name} circle`, act: () => { state.attuned.push(poi.id); p.stats.attuned++; p.home = { x: poi.x + 3, z: poi.z + 3, name: poi.name }; reward(80); toast(`The ${poi.name} circle remembers you. You will return here if you fall.`, true); } };
  if (poi?.type === 'ruin' && !state.looted.includes(poi.id)) return { label: `Search the ruins of ${poi.name}`, act: () => {
    state.looted.push(poi.id);
    const loot = { stone: 6, hide: 2, bandage: 2, feather: 3, ectoplasm: 1 };
    for (const [id, n] of Object.entries(loot)) R.addItem(p, id, n);
    reward(40); toast('An old witch\'s cache: stone, hide, bandages, feathers and ectoplasm.');
  } };
  if (poi?.type === 'shrine') return state.blessedDay[poi.id] === state.day
    ? { label: 'The shrine is quiet until tomorrow', act: () => {} }
    : { label: `Pray at the ${poi.name} shrine`, act: () => { state.blessedDay[poi.id] = state.day; Object.assign(p, { hp: p.maxHp, mana: p.maxMana, stamina: p.maxStamina, poison: 0 }); p.food = Math.max(p.food, 80); p.water = Math.max(p.water, 80); reward(30); toast('A green light washes over you. Fully restored.'); } };
  const hut = builtNear('hut', 5);
  if (hut) return { label: 'Rest in your hut', act: () => { Object.assign(p, { hp: p.maxHp, mana: p.maxMana, stamina: p.maxStamina }); p.home = { x: hut.x + 4, z: hut.z, name: 'your hut' }; saveState(); toast('You rest. You will wake here if you fall. Progress saved.'); } };
  const garden = builtNear('garden', 4);
  if (garden?.stock) return { label: `Harvest the garden (${garden.stock})`, act: () => {
    const herbs = Object.keys(ITEMS).filter(id => ITEMS[id].herb === CLASSES[p.class].region);
    for (let i = 0; i < garden.stock; i++) R.addItem(p, herbs[Math.floor(Math.random() * herbs.length)]);
    toast(`Harvested ${garden.stock} herbs.`); trained('herbalism', R.train(p, 'herbalism', 4 * garden.stock)); garden.stock = 0;
  } };
  if (nearFire(3) && R.count(p, 'rawMeat')) return { label: `Cook ${R.count(p, 'rawMeat')} raw meat`, act: () => { const n = R.count(p, 'rawMeat'); R.removeItem(p, 'rawMeat', n); R.addItem(p, 'cookedMeat', n); reward(n * 3); toast(`Cooked ${n} meat.`); } };
  const ahead = world.ground(p.x + Math.cos(p.yaw) * 1.5, p.z + Math.sin(p.yaw) * 1.5);
  if ((builtNear('well', 3) || ahead < .2 || world.ground(p.x, p.z) < .2) && p.water < 100) return { label: 'Drink', act: () => R.drink(p) };
  return null;
}

// A spell ring, shown here and to other players.
function ring(x, y, z, r, color) { view.ring(x, y, z, r, color); net.send({ type: 'fx', x, y, z, r, color }); }

// ---------- combat ----------
function hostiles() { return boss ? [...creatures, boss] : creatures; }

// Best target near the centre of view, within `range` metres.
function pickTarget(range) {
  const p = state.player, fx = Math.cos(yaw), fz = Math.sin(yaw);
  let best = null, score = Infinity;
  for (const c of hostiles()) {
    if (c.hp <= 0) continue;
    const dx = c.x - p.x, dz = c.z - p.z, d = Math.hypot(dx, dz);
    if (d > range) continue;
    const angle = Math.acos(Math.max(-1, Math.min(1, (dx * fx + dz * fz) / (d || 1))));
    if (angle > .6 && d > 6) continue;
    const s = angle * 20 + d;
    if (s < score) { score = s; best = c; }
  }
  return best;
}

function damage(target, amount, opts = {}, fromPlayer = true) {
  const p = state.player;
  if (target === boss) {
    if (opts.weaken) boss.weak = Math.max(boss.weak ?? 0, opts.weaken);
    if (net.online) { net.send({ type: 'bossHit', amount }); boss.hp -= amount * (boss.warded ? .1 : 1); boss.hurt = 3; return; }
    boss.hp -= amount * (boss.warded ? .1 : 1); boss.hurt = 3;
    state.bossHp = boss.hp;
    if (boss.hp <= 0) {
      boss = null; state.bossDefeated = true; p.stats.boss = 1;
      toast('The Unwitch is unmade. The coven is whole again.', true); bossLoot(); reward(BOSS.xp); quests(); saveState();
    }
    return;
  }
  const b = CREATURE[target.kind];
  if (target.remote) {
    const bonus = fromPlayer ? 1 + (R.skillLevel(p, 'hunting') - 1) * .02 : 1, poison = fromPlayer && R.poisonsOnHit(p) ? Math.max(opts.poison ?? 0, 4) : opts.poison ?? 0;
    net.send({ type: 'hit', id: target.id, amount: amount * bonus, poison, slow: opts.slow ?? 0, root: opts.root ?? 0, weaken: opts.weaken ?? 0 });
    target.hurt = 3; // the owner applies the damage; show the flinch now
    return;
  }
  target.lastHitBy = 0;
  if (b.human && target.village !== undefined) { const v = humanVillages.find(o => o.id === target.village); if (v) raiseAlarm(v, `You attacked the people of ${v.name}.`); }
  if (fromPlayer && R.poisonsOnHit(p)) opts = { ...opts, poison: Math.max(opts.poison ?? 0, 4) };
  if (hurtCreature(target, amount * (fromPlayer ? 1 + (R.skillLevel(p, 'hunting') - 1) * .02 : 1), opts)) died(target);
}

// One of our creatures died. Whoever struck last (`lastHitBy`: 0 for us, else a player id) gets the spoils.
function died(c) {
  c.hp = 0; c.dead = true;
  const b = CREATURE[c.kind], by = c.lastHitBy || 0;
  if (net.online && shared(c)) net.send({ type: 'died', id: c.id, by: by || net.id });
  if (by) { if (b.elite) state.elites[b.region] = state.clock + ELITE_RESPAWN; return; }
  slain(c, b);
}

// The Unwitch leaves two pieces, purple or gold, for everyone who stood at the Crown.
function bossLoot() {
  for (let i = 0; i < 2; i++) {
    const gear = generateGear(BOSS.level, { region: 'crown', boss: true });
    addGear(state.player, gear); toast(`${RARITIES[gear.rarity].name}: ${gear.name}`, true, gear.rarity);
  }
}

function slain(c, b) {
  const p = state.player;
  c.hp = 0; c.dead = true;
  const loot = R.lootFor(p, b.loot);
  p.stats.kills++;
  if (b.elite) { p.stats.eliteKills++; state.elites[b.region] = state.clock + ELITE_RESPAWN; toast(`${b.name} has fallen!`, true); }
  toast(`${b.name} slain. ${Object.entries(loot).map(([id, n]) => `+${n} ${ITEMS[id].name}`).join(', ')}`);
  const gear = dropGear(b);
  if (gear) { addGear(p, gear); toast(`${RARITIES[gear.rarity].name}: ${gear.name} (level ${gear.level})`, gear.rarity >= 3, gear.rarity); }
  trained('hunting', R.train(p, 'hunting', b.level * 4 + (b.elite ? 80 : 0)));
  if (b.human) toast(R.captureSoul(p) ? 'A soul is drawn into your Soul Jar.' : 'A soul slips away. Carry an empty Soul Jar to capture it.');
  reward(b.xp); quests();
}

function strike() {
  const p = state.player;
  if (swingCooldown > 0 || p.hp <= 0) return;
  if (p.mounted) { toast('Step off your broom [F] to strike or gather.'); swingCooldown = 1; return; }
  swing = 1; swingKind = 'strike'; swingCooldown = .55; p.yaw = yaw;
  p.stamina = Math.max(0, p.stamina - 5);
  const w = R.weapon(p), tired = p.stamina < 5 ? .5 : 1;
  const target = hostiles().filter(c => c.hp > 0 && near(c, p, w.reach + 1 + (c === boss ? BOSS.size : CREATURE[c.kind].size * .6)) && facing(p, c.x, c.z) > .4).sort((a, b) => dist(a, p) - dist(b, p))[0];
  if (target) { damage(target, w.damage * tired); return; }
  const node = view.nodesNear(p.x, p.z, 5).map(n => ({ n, d: dist(n, p) })).filter(({ n, d }) => d < 2.1 + Math.max(.6, NODES[n.type].radius) * n.s && facing(p, n.x, n.z) > .2).sort((a, b) => a.d - b.d)[0]?.n;
  if (!node) return;
  const before = { ...p.skills }, got = R.gatherYield(p, node.type);
  if (!Object.keys(got).length) { toast('Equip a pick to mine moonstone.'); return; }
  for (const s of Object.keys(SKILLS)) if (R.skillLevel({ skills: before }, s) < R.skillLevel(p, s)) trained(s, R.skillLevel(p, s));
  toast(Object.entries(got).map(([id, n]) => `+${n} ${ITEMS[id].name}`).join('  '));
  const hp = (state.nodeHp[node.id] ?? NODES[node.type].hp) - 1;
  if (hp <= 0) { delete state.nodeHp[node.id]; state.harvested[node.id] = state.clock + NODE_RESPAWN; view.hideNode(node.id); net.send({ type: 'harvest', node: node.id, seconds: NODE_RESPAWN }); }
  else state.nodeHp[node.id] = hp;
  reward(2); quests();
}

function bolt(from, target, amount, color, opts = {}, fromPlayer = true) {
  projectiles.push({ id: nextId++, x: from.x, y: from.y + 1.6, z: from.z, target, amount, color, opts, fromPlayer });
}

function cast(index) {
  const p = state.player, id = R.knownSpells(p)[index];
  if (!id || p.hp <= 0) return;
  const s = SPELLS[id], blocker = R.castBlocker(p, id, covenNearby(), { solo: !net.online });
  if (blocker) { toast(`${s.name}: ${blocker}`); return; }
  if (s.kind === 'glamour') {
    const v = humanVillages.find(o => near(o, p, 150) && villageState.get(o.id).alarm > 0);
    if (v) { toast(`Glamour: ${v.name} is on guard. Wait for the alarm to die down.`); return; }
  } else if (glamoured()) {
    delete p.effects.glamour; p.wasGlamoured = false;
    const v = villageAt(p, 15);
    if (v) raiseAlarm(v, 'Witchcraft in plain sight!'); else toast('Casting breaks your glamour.');
  }
  const power = R.spellPower(p, isNight());
  let target = null;
  if (s.kind === 'bolt' || s.kind === 'aoe') {
    target = pickTarget(36);
    if (!target) { toast(`${s.name}: no target in sight`); return; }
  }
  trained('spellcraft', R.payCast(p, id));
  swing = 1; swingKind = 'cast'; p.yaw = yaw;
  const area = (x, z, radius, fn) => hostiles().filter(c => c.hp > 0 && Math.hypot(c.x - x, c.z - z) < radius).forEach(fn);
  if (s.kind === 'bolt') bolt(p, target, s.damage * power, s.color, { poison: s.poison, slow: s.slow, lifesteal: s.lifesteal, weaken: s.weaken });
  if (s.kind === 'aoe') {
    ring(target.x, target.y, target.z, s.radius, s.color);
    area(target.x, target.z, s.radius, c => damage(c, s.damage * power, { poison: s.poison }));
    if (s.healCoven) p.hp = Math.min(p.maxHp, p.hp + s.healCoven);
  }
  if (s.kind === 'self') {
    if (s.regen) { p.effects.regen = s.duration; p.effects.regenRate = s.regen; }
    if (s.shield) p.effects.barkskin = s.duration;
    ring(p.x, p.y, p.z, 3, s.color);
  }
  if (s.kind === 'nova' || s.kind === 'rite') {
    ring(p.x, p.y, p.z, s.radius, s.color);
    if (s.breakWard && boss && near(boss, p, s.radius + 10)) { boss.warded = false; boss.wardTimer = s.breakWard; net.send({ type: 'ward', seconds: s.breakWard }); toast('The ward shatters! Strike now!', true); }
    area(p.x, p.z, s.radius, c => damage(c, s.damage * power, { root: s.root }));
    if (s.kind === 'rite') toast('Four voices rise as one: THE GRAND RITE!', true);
  }
  if (s.kind === 'summon') {
    const a = makeAlly(s.summon, p.x + Math.cos(yaw) * 3, p.z + Math.sin(yaw) * 3, s.duration);
    allies.push(a); ring(a.x, p.y, a.z, s.summon === 'titan' ? 12 : 3, s.color);
    if (s.summon === 'titan') {
      toast('Three souls burn. The earth splits, and the Wyrd Titan rises!', true);
      // She is summoned to fight the Unwitch: only at the Crown does she answer the quest.
      if (Math.hypot(p.x - CROWN.x, p.z - CROWN.z) < 250) p.stats.titans++; else toast('Far from the Crown, she will fade before she meets the Unwitch.');
    }
    else toast(`${ALLIES[s.summon].name} answers the coven's call.`);
  }
  if (s.kind === 'enchant' && R.enchantBroom(p)) { ring(p.x, p.y, p.z, 4, s.color); toast('Two voices bind the wind into the bristles. Your broom is now a Skyward Broom: mount it [F] and hold Space to fly.', true); }
  if (s.kind === 'glamour') { p.effects.glamour = s.duration; p.wasGlamoured = true; ring(p.x, p.y, p.z, 2, s.color); toast('You wear a borrowed human face. Spells or violence will break it.'); if (allies.some(a => a.ally === 'witch' || a.ally === 'fox')) toast('Your companions will wait here until the glamour ends.'); }
  if (s.coven > 1) quests();
}

// ---------- building ----------
function placeBuilding(type) {
  const p = state.player, x = p.x + Math.cos(p.yaw) * 5, z = p.z + Math.sin(p.yaw) * 5, y = world.ground(x, z), h = heart();
  const blocker = R.buildBlocker(p, type, { hasHeart: !!h, nearHeart: !!h && Math.hypot(h.x - x, h.z - z) < VILLAGE_RADIUS });
  if (blocker) { toast(`${BUILDINGS[type].name}: ${blocker}`); return false; }
  if (y < .3) { toast('The ground here is too wet to build on.'); return false; }
  const before = R.skillLevel(p, 'building');
  R.build(p, type);
  if (R.skillLevel(p, 'building') > before) trained('building', R.skillLevel(p, 'building'));
  buildingsChanged();
  state.buildings.push({ id: `b${Date.now()}${Math.random()}`, type, x, y, z, rot: -p.yaw + Math.PI / 2, stock: 0, grow: 0 });
  if (type === 'heart') { p.home = { x: x + 3, z, name: 'your village' }; toast('Your village is founded. Build within 60 m of the Heart.', true); }
  else toast(`Built: ${BUILDINGS[type].name}.`);
  quests(); saveState(); sendVillage();
  return true;
}

// Push (x, z) out of solid nodes and buildings.
function collide(x, z) {
  for (const n of view.nodesNear(x, z, 3)) {
    const r0 = NODES[n.type].radius;
    if (!r0) continue;
    const r = r0 * n.s + .35, dx = x - n.x, dz = z - n.z, d = Math.hypot(dx, dz);
    if (d < r && d > 0) { x = n.x + dx / d * r; z = n.z + dz / d * r; }
  }
  for (const b of allBuildings()) {
    const def = BUILDINGS[b.type];
    if (Math.abs(b.x - x) > 6 || Math.abs(b.z - z) > 6 || ['campfire', 'garden', 'lantern'].includes(b.type)) continue;
    let px = b.x, pz = b.z;
    if (def.wall) { const ux = Math.cos(b.rot), uz = -Math.sin(b.rot), t = Math.max(-2, Math.min(2, (x - b.x) * ux + (z - b.z) * uz)); px = b.x + ux * t; pz = b.z + uz * t; }
    const r = (def.wall ? .3 : def.size) + .4, dx = x - px, dz = z - pz, d = Math.hypot(dx, dz);
    if (d < r && d > 0) { x = px + dx / d * r; z = pz + dz / d * r; }
  }
  return [x, z];
}

// ---------- simulation ----------
const warned = new Set();
function need(p, key, low, text) {
  if (p[key] < low) { if (!warned.has(key + low)) { warned.add(key + low); toast(text); } }
  else if (p[key] > low + 10) warned.delete(key + low);
}
function updatePlayer(dt) {
  const p = state.player;
  const f = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0), s = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
  yaw += ((keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0)) * dt * 1.8;
  let mx = Math.cos(yaw) * f - Math.sin(yaw) * s, mz = Math.sin(yaw) * f + Math.cos(yaw) * s;
  const len = Math.hypot(mx, mz), g0 = world.ground(p.x, p.z), swimming = !p.mounted && g0 < -1.3;
  const airborne = p.y > Math.max(g0, 0) + 5; // above trees, walls and roofs
  moving = len > 0 && p.hp > 0;
  p.sprinting = moving && (keys.has('ShiftLeft') || keys.has('ShiftRight')) && p.stamina > 1 && !swimming;
  if (moving) {
    mx /= len; mz /= len;
    if (swing <= 0) p.yaw += Math.max(-dt * 12, Math.min(dt * 12, ((Math.atan2(mz, mx) - p.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI));
    const speed = (swimming ? 3 : p.sprinting ? 9 : 5) * R.moveSpeedFactor(p);
    let nx = Math.max(-HALF + 20, Math.min(HALF - 20, p.x + mx * speed * dt)), nz = Math.max(-HALF + 20, Math.min(HALF - 20, p.z + mz * speed * dt));
    if (!airborne) { [nx, nz] = collide(nx, nz); [nx, nz] = villageWalls(nx, nz, p.x, p.z); }
    p.x = nx; p.z = nz;
  }
  const g = world.ground(p.x, p.z);
  if (p.mounted) {
    // A broom hovers just above land or water. A Skyward Broom also flies: Space climbs, X descends.
    // Should it lose its lift (the broom taken off mid-air), it lowers you gently to the ground.
    const floor = Math.max(g, -.6), grounded = R.flightBlocker(p), up = keys.has('Space'), down = keys.has('KeyX');
    if (!grounded && up) p.flying = true;
    if (p.flying) {
      if (!grounded) { p.vy = up ? 9 : down ? -9 : 0; p.liftLost = false; }
      else { p.vy = -4; if (!p.liftLost) { toast(`Your broom sinks: ${grounded}.`); p.liftLost = true; } }
      p.y = Math.min(p.y + p.vy * dt, floor + R.FLIGHT_CEILING);
      if (p.y <= floor + .5) { p.y = floor + .4; p.flying = false; p.vy = 0; }
    } else { p.y = floor + .4; p.vy = 0; }
    p.grounded = !p.flying;
  } else if (g < -1.3) { p.y += (-1.1 - p.y) * Math.min(1, dt * 6); p.vy = 0; p.grounded = false; }
  else if (p.grounded && p.vy <= 0 && p.y - g < .6) { p.y = g; p.vy = 0; } // walking downhill keeps your feet on the slope
  else {
    p.vy -= 22 * dt; p.y += p.vy * dt;
    if (p.y <= g) {
      if (p.vy < -16) { R.damagePlayer(p, (-p.vy - 16) * 4); hurtFlash = .4; toast('You hit the ground hard.'); }
      p.y = g; p.vy = 0; p.grounded = true;
    } else if (p.y > g + .3) p.grounded = false;
  }
  const jump = keys.has('Space') || jumpTap; jumpTap = false;
  if (jump && p.grounded && !p.mounted && p.stamina > 8 && p.hp > 0) { p.vy = 7.5; p.grounded = false; p.stamina -= 8; }

  const surface = world.surface(p.x, p.z), cold = (surface === 'snow' || surface === 'peaks' && isNight()) && !nearFire(10);
  if (cold && !p.cold && !R.warm(p)) toast('The cold bites. Find a fire or craft a Hide Cloak.');
  p.cold = cold;
  const died = R.tickSurvival(p, dt, { sprinting: p.sprinting, swimming: !p.mounted && g < -1.3, cold });
  // Warn once as hunger and thirst set in: the bars alone are easy to miss.
  need(p, 'food', 20, 'You are hungry. Eat [Q]: cook meat at a fire [E], or gather berries from bushes.');
  need(p, 'food', .01, 'You are starving and losing health! Eat something [Q].');
  need(p, 'water', 20, 'You are thirsty. Drink at a pond or a well [E].');
  need(p, 'water', .01, 'You are dying of thirst! Find water [E].');
  if (died) {
    toast('You have fallen.', true); toast(`You wake at ${p.home.name}.`);
    R.respawn(p); p.mounted = p.flying = false; p.y = world.ground(p.x, p.z);
    dropCreatures(c => !near(c, p, 80) || c.remote);
    for (const a of allies) { a.x = p.x + 2; a.z = p.z + 2; a.target = null; }
  }
}

function bite(dmg, c, prey = state.player) {
  const b = CREATURE[c.kind];
  if (prey !== state.player) { net.send({ type: 'bite', to: prey.id, damage: dmg, poison: !!b.poison, kind: c.kind }); return; }
  R.damagePlayer(state.player, dmg, { poison: b.poison });
  hurtFlash = .3;
}

function updateCreatures(dt) {
  const p = state.player, night = isNight(), w = wards();
  for (const c of creatures) {
    if (c.remote) continue;
    const prey = preyFor(c);
    updateCreature(c, prey, world.ground, dt, night, (d, who) => bite(d, who, prey), w);
    if (c.hp <= 0 && !c.dead) died(c);
  }
  creatures = creatures.filter(c => c.hp > 0 || (c.remote && !c.dead));
  reportCreatures(dt);
  allies = allies.filter(a => a.life > 0);
  const hiding = glamoured();
  allies.forEach((a, i) => {
    // While you ride, coven sisters ride their brooms in formation beside you, on the ground or in the air.
    a.riding = p.mounted && a.ally === 'witch';
    if (a.riding) {
      const side = (i % 2 ? 1 : -1) * (2.5 + i), back = 3, k = Math.min(1, dt * 3);
      a.x += (p.x - Math.cos(p.yaw) * back - Math.sin(p.yaw) * side - a.x) * k;
      a.z += (p.z - Math.sin(p.yaw) * back + Math.cos(p.yaw) * side - a.z) * k;
      a.y += ((p.flying ? p.y : Math.max(world.ground(a.x, a.z), -.6) + .4) - a.y) * k;
      a.yaw = p.yaw;
      return;
    }
    (hiding && (a.ally === 'witch' || a.ally === 'fox') && near(a, p, 200)) || updateAlly(a, p, hostiles(), world.ground, dt, (target, dmg) => {
    if (ALLIES[a.ally].ranged) bolt(a, target, dmg * (1 + p.level * .05), SPELLS[CLASSES[a.cls].spells[0]].color, {}, false);
    else damage(target, dmg * (1 + p.level * .05), {}, false);
  }, i);
  });

  spawnTimer -= dt;
  if (spawnTimer > 0) return;
  spawnTimer = 1;
  dropCreatures(c => c.village !== undefined || c.remote || near(c, p, CREATURE[c.kind].elite ? 500 : 360));
  for (const lair of world.pois.filter(o => o.type === 'lair' && near(o, p, 220))) {
    const elite = BESTIARY.find(b => b.elite && b.region === lair.region);
    if ((state.elites[lair.region] ?? 0) <= state.clock && !creatures.some(c => c.kind === elite.id)) {
      creatures.push(newCreature(elite.id, lair.x, lair.z, { homeX: lair.x, homeZ: lair.z }));
      toast(`You sense ${elite.name} nearby…`);
    }
  }
  // The cap counts everyone's creatures around us, so a group of players doesn't flood the area.
  if (creatures.filter(c => c.village === undefined && near(c, p, 360)).length >= MAX_CREATURES) return;
  const a = Math.random() * Math.PI * 2, r = 90 + Math.random() * 140, x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
  if (Math.abs(x) > HALF - 50 || Math.abs(z) > HALF - 50 || world.ground(x, z) < 1 || w.some(t => Math.hypot(t.x - x, t.z - z) < 40)) return;
  if (world.pois.some(o => (o.type === 'hearth' || o.type === 'village') && Math.hypot(o.x - x, o.z - z) < 80)) return;
  const kind = pickCreature(world.region(x, z), world.danger(x, z), night);
  if (kind) creatures.push(newCreature(kind, x, z));
}

function updateBoss(dt) {
  const p = state.player, dCrown = Math.hypot(p.x - CROWN.x, p.z - CROWN.z);
  if (net.online ? serverBoss?.down : state.bossDefeated) { boss = null; return; }
  if (!boss && dCrown < 160) {
    boss = { id: 'boss', x: CROWN.x, z: CROWN.z, y: world.ground(0, 0), yaw: 0, hp: net.online ? serverBoss.hp : state.bossHp, maxHp: BOSS.hp, warded: true, wardTimer: 0, slam: 3, cast: 2, summon: 12, walk: 0, hurt: 0, state: 'chase' }; // always a target for allies
    toast('The Unwitch awakens at the Crown. Only the Grand Rite of a full coven can break her ward.', true);
  }
  if (!boss) return;
  if (dCrown > 400) { boss = null; if (!net.online) state.bossHp = BOSS.hp; return; }
  boss.hurt = Math.max(0, boss.hurt - dt); boss.weak = Math.max(0, (boss.weak ?? 0) - dt);
  const blow = boss.weak > 0 ? WEAKENED : 1; // a withering curse softens her too
  if (!boss.warded && !net.online) { boss.wardTimer -= dt; if (boss.wardTimer <= 0) { boss.warded = true; toast('The Unwitch\'s ward knits itself back together.'); } }
  const d = dist(boss, p);
  boss.yaw = Math.atan2(p.z - boss.z, p.x - boss.x);
  if (d > 6 && dCrown < 90 && p.hp > 0) { const nx = boss.x + Math.cos(boss.yaw) * 4 * dt, nz = boss.z + Math.sin(boss.yaw) * 4 * dt; if (Math.hypot(nx, nz) < 80) { boss.x = nx; boss.z = nz; boss.walk += 4 * dt; } }
  boss.y = world.ground(boss.x, boss.z);
  boss.slam -= dt; boss.cast -= dt; boss.summon -= dt;
  if (boss.slam <= 0 && d < 8) { boss.slam = 3.5; view.ring(boss.x, boss.y, boss.z, 8, '#ff3c6e'); R.damagePlayer(p, BOSS.damage * blow); hurtFlash = .4; }
  if (boss.cast <= 0 && d < 45 && p.hp > 0) { boss.cast = 3; projectiles.push({ id: nextId++, x: boss.x, y: boss.y + 6, z: boss.z, target: 'player', amount: 18 * blow, color: '#ff3c6e', opts: {}, fromPlayer: false }); }
  // Online, only the lowest-numbered player at the Crown raises thralls, so they are not doubled.
  if (boss.summon <= 0 && net.online && [...remotes.values()].some(r => r.id < net.id && Math.hypot(r.x - CROWN.x, r.z - CROWN.z) < 160)) boss.summon = 28;
  // At most three thralls at a time, so a long fight doesn't become a flood.
  if (boss.summon <= 0 && creatures.filter(c => c.thrall && c.hp > 0).length > 1) boss.summon = 8;
  if (boss.summon <= 0) {
    boss.summon = 28;
    const pool = BESTIARY.filter(b => !b.elite && b.level >= 6 && !b.fly);
    for (let i = 0; i < 2; i++) { const b = pool[Math.floor(Math.random() * pool.length)], a = Math.random() * 6.28; creatures.push(Object.assign(newCreature(b.id, boss.x + Math.cos(a) * 10, boss.z + Math.sin(a) * 10), { state: 'chase', angry: true, thrall: true })); }
    toast('The Unwitch calls her thralls!');
  }
}

function updateProjectiles(dt) {
  const p = state.player;
  projectiles = projectiles.filter(pr => {
    const t = pr.target === 'player' ? p : pr.target;
    if (!t || t.hp <= 0 || (t !== p && t !== boss && !creatures.includes(t))) return false;
    const ty = t.y + (t === boss ? BOSS.size * 1.5 : 1), dx = t.x - pr.x, dy = ty - pr.y, dz = t.z - pr.z, d = Math.hypot(dx, dy, dz), step = 32 * dt;
    if (d > step) { pr.x += dx / d * step; pr.y += dy / d * step; pr.z += dz / d * step; return true; }
    if (t === p) { R.damagePlayer(p, pr.amount); hurtFlash = .3; }
    else {
      damage(t, pr.amount, pr.opts, pr.fromPlayer);
      if (pr.opts.lifesteal) p.hp = Math.min(p.maxHp, p.hp + pr.amount * pr.opts.lifesteal);
    }
    return false;
  });
}

function updateWorld(dt) {
  const p = state.player;
  state.clock += dt;
  state.dayTime += dt / DAY_LENGTH;
  if (state.dayTime >= 1) { state.dayTime -= 1; state.day++; toast(`Day ${state.day} dawns.`); }
  for (const b of state.buildings) if (b.type === 'garden' && b.stock < 3) { b.grow += dt; if (b.grow >= 120) { b.grow = 0; b.stock++; } }
  if (Math.floor(state.clock) !== Math.floor(state.clock - dt)) {
    for (const [id, t] of Object.entries(state.harvested)) if (state.clock >= t) { delete state.harvested[id]; view.showNode(id); }
    const ex = Math.floor((p.x + HALF) / WORLD_SIZE * EXPLORE), ez = Math.floor((p.z + HALF) / WORLD_SIZE * EXPLORE), reach = p.class === 'hex' ? 3 : 2;
    for (let j = -reach; j <= reach; j++) for (let i = -reach; i <= reach; i++) {
      const x = ex + i, z = ez + j;
      if (x >= 0 && z >= 0 && x < EXPLORE && z < EXPLORE && i * i + j * j <= reach * reach + 1 && !explored[z * EXPLORE + x]) { explored[z * EXPLORE + x] = 1; state.explored.push(z * EXPLORE + x); }
    }
    for (const poi of world.pois) if (!state.discovered.includes(poi.id) && near(poi, p, poi.type === 'village' ? 140 : 50)) {
      state.discovered.push(poi.id); p.stats.discovered++;
      toast(`Discovered: ${poi.name}`, true); if (poi.type === 'village') toast('A human village. Its people hunt witches: go in glamoured [8], or not at all.'); reward(75); quests();
    }
  }
  saveTimer += dt;
  if (saveTimer > 20) { saveTimer = 0; saveState(); }
}

function update(dt) {
  netTimer -= dt;
  if (netTimer <= 0 && net.online) {
    netTimer = .1;
    const p = state.player, r = v => Math.round(v * 100) / 100;
    const msg = { type: 'state', x: r(p.x), y: r(p.y), z: r(p.z), yaw: r(p.yaw), hp: Math.ceil(p.hp), maxHp: p.maxHp, level: p.level, cls: p.class, moving, swing: r(swing), mounted: !!p.mounted, look: encodeLook(lookOf(p)) };
    const key = JSON.stringify(msg);
    // Idle witches send nothing new except a once-a-second heartbeat.
    if (key !== lastSent || (heartbeat -= .1) <= 0) { net.send(msg); lastSent = key; heartbeat = 1; }
  }
  swing = Math.max(0, swing - dt / .45); swingCooldown -= dt; hurtFlash = Math.max(0, hurtFlash - dt);
  updatePlayer(dt); updateVillages(dt); updateCreatures(dt); updateBoss(dt); updateProjectiles(dt); updateWorld(dt);
}

// ---------- HUD ----------
// The HUD redraws ten times a second and writes to the page only what changed: layout is costly.
const shown = new Map();
const put = (sel, prop, value) => { const key = sel + prop; if (shown.get(key) === value) return; shown.set(key, value); const el = $(sel); if (prop === 'width') el.style.width = value; else el[prop] = value; };
const esc = t => String(t).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const bar = (id, v, max) => { put(`#${id}`, 'width', `${Math.max(0, Math.round(v / max * 1000) / 10)}%`); put(`#${id}Text`, 'textContent', `${Math.ceil(Math.max(0, v))}`); };
function hud() {
  const p = state.player;
  bar('hp', p.hp, p.maxHp); bar('mp', p.mana, p.maxMana); bar('st', p.stamina, p.maxStamina); bar('food', p.food, 100); bar('water', p.water, 100);
  put('#level', 'textContent', String(p.level));
  put('#className', 'textContent', CLASSES[p.class].name.toUpperCase());
  put('#xp', 'width', `${Math.round(p.xp / R.xpToNext(p.level) * 1000) / 10}%`);
  const minutes = Math.floor(state.dayTime * 24 * 60), fx = Object.keys(p.effects).filter(e => e !== 'regenRate');
  put('#clock', 'textContent', `DAY ${state.day} · ${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}${p.cold && !R.warm(p) ? ' · FREEZING' : ''}${p.poison > 0 ? ' · POISONED' : ''}${p.flying ? ' · FLYING' : p.mounted ? ' · ON BROOM' : ''}${fx.length ? ' · ' + fx.join(' ').toUpperCase() : ''}`);
  const alarmed = humanVillages.find(v => near(v, p, 150) && villageState.get(v.id).alarm > 0);
  // Where you are: the place or zone, its level range, and how it suits your level (green, yellow, red).
  const zone = world.zone(p.x, p.z), place = world.placeName(p.x, p.z), here = place === zone.name || place === REGIONS[zone.region]?.name ? zone.name : `${place} · ${zone.name}`;
  put('#region', 'textContent', `${here} · Lv ${zone.min}–${zone.max}${alarmed ? ' · ALARM RAISED' : ''}`);
  put('#region', 'className', p.level >= zone.min ? 'safe' : p.level >= zone.min - 2 ? 'risky' : 'deadly');
  const q = R.QUESTS[p.quest];
  put('#questTitle', 'textContent', q ? q.title : 'The Coven is Whole');
  put('#questText', 'textContent', q ? q.text : 'You have done all the coven asked. The isle is yours.');
  put('#questBar', 'width', `${Math.round((q ? q.progress(p) : 1) * 1000) / 10}%`);
  const act = mode === 'playing' && interaction();
  put('#prompt', 'innerHTML', act ? `<kbd>E</kbd>${esc(act.label)}` : '');
  const covenHere = covenNearby();
  put('#covenList', 'innerHTML', [p.class, ...p.coven].map((c, i) => `<span class="${i && !near(sisters()[i - 1] ?? p, p, COVEN_REACH) ? 'far' : ''}" style="--robe:${CLASSES[c].robe}" title="${CLASSES[c].name}">${CLASSES[c].name[0]}</span>`).join('')
    + covenMates().map(r => `<span class="real${near(r, p, COVEN_REACH) ? '' : ' far'}" style="--robe:${CLASSES[r.cls]?.robe ?? '#555'}" title="${esc(r.name)}">${esc(r.name[0]?.toUpperCase() ?? '?')}</span>`).join('')
    + `<small>COVEN ${covenHere}/4</small>`);
  put('#spells', 'innerHTML', R.knownSpells(p).map((id, i) => {
    const s = SPELLS[id], blocker = R.castBlocker(p, id, covenHere, { solo: !net.online }), cd = p.cooldowns[id];
    return `<div class="spell${blocker ? ' locked' : ''}" data-tip="${esc(spellTip(id, blocker))}" style="--c:${s.color}"><kbd>${(i + 1) % 10}</kbd><b>${s.name}</b><small>${s.coven > 1 ? `${s.coven} witches` : `${s.mana} mana`}</small>${cd ? `<i style="height:${Math.round(cd / s.cooldown * 20) * 5}%"></i>` : ''}</div>`;
  }).join(''));
  const where = net.mode === 'host' ? `HOSTING · CODE ${net.code}` : net.mode === 'join' ? `GAME ${net.code}` : `ONLINE · ${net.world ?? online.world}`;
  put('#netStatus', 'textContent', net.status === 'online' ? `${where} · ${remotes.size} other${remotes.size === 1 ? '' : 's'}${online.coven ? ` · coven ‹${online.coven}›` : ''}` : net.status === 'offline' ? '' : net.status.toUpperCase() + '…');
  const bossShown = !!boss && near(boss, p, 120);
  put('#boss', 'className', bossShown ? '' : 'hidden');
  if (bossShown) { put('#bossHp', 'width', `${Math.round(boss.hp / BOSS.hp * 1000) / 10}%`); put('#bossWard', 'textContent', boss.warded ? 'WARDED: cast the Grand Rite [7]' : `WARD BROKEN · ${Math.ceil(boss.wardTimer)}s`); }
  compass();
}

function compass() {
  const p = state.player, heading = Math.atan2(Math.cos(yaw), -Math.sin(yaw)), marks = [];
  const place = (bearing, html, cls) => {
    const rel = ((bearing - heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    if (Math.abs(rel) < Math.PI / 2) marks.push(`<span class="${cls}" style="left:${50 + rel / (Math.PI / 2) * 50}%">${html}</span>`);
  };
  [['N', 0], ['E', Math.PI / 2], ['S', Math.PI], ['W', -Math.PI / 2]].forEach(([l, b]) => place(b, l, 'cardinal'));
  for (const poi of world.pois) {
    const d = dist(poi, p), found = state.discovered.includes(poi.id), raven = p.class === 'hex';
    if (found && d < 4000 || d < 1500 || raven || poi.type === 'hearth' || poi.type === 'crown') place(Math.atan2(poi.x - p.x, -(poi.z - p.z)), poi.type === 'crown' ? '♛' : poi.type === 'hearth' ? '⌂' : poi.type === 'village' && found ? '♜' : found ? '◆' : '◇', `poi${found ? ' found' : ''}`);
  }
  const h = heart();
  if (h) place(Math.atan2(h.x - p.x, -(h.z - p.z)), '✦', 'home');
  put('#compassStrip', 'innerHTML', marks.join(''));
}

// ---------- panels ----------
function gearText(it) {
  return [it.level && `level ${it.level}`, it.armor && `armor ${it.armor}`, it.damage && `${it.damage} damage`, it.chop && `${it.chop} wood per strike`, it.mine && `${it.mine} stone per strike`, it.power && `spells ×${it.power}`,
    it.spell && `+${it.spell}% spell power`, it.mana && `+${it.mana} max mana`, it.health && `+${it.health} max health`, it.haste && `+${it.haste}% speed`,
    it.warm && 'keeps out the cold', it.speed && `${Math.round((it.speed - 1) * 100)}% faster`, it.speed && (it.flies ? `flies ${Math.round((it.flySpeed - 1) * 100)}% faster` : 'enchant with the Skyward Charm to fly')].filter(Boolean).join(', ');
}
// Rarity colour for an item's name: grey, green, blue, purple or gold.
const rarityStyle = it => (it?.rarity >= 0 ? ` style="color:${RARITIES[it.rarity].color}"` : '');
// One number to compare two pieces for the same slot.
const gearScore = it => !it ? 0 : (it.armor ?? 0) + (it.damage ?? 0) * .6 + ((it.power ?? 1) - 1) * 100 + (it.spell ?? 0) * 1.5 + (it.mana ?? 0) * .3 + (it.health ?? 0) * .3 + (it.haste ?? 0) * 1.2 + (it.chop ?? 0) + (it.mine ?? 0);
function compare(p, it) {
  if (!it.slot || it.slot === 'mount' || it.slot === 'tool') return '';
  const diff = gearScore(it) - gearScore(ITEMS[p.equip[it.slot]]);
  return Math.abs(diff) < .5 ? '' : diff > 0 ? ' <b class="up">▲</b>' : ' <b class="down">▼</b>';
}
function needsText(p, needs) { return Object.entries(needs).map(([id, n]) => `<span class="${R.count(p, id) < n ? 'short' : ''}">${n} ${ITEMS[id].name}</span>`).join(' · '); }
function renderPack() {
  const p = state.player, st = stations();
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  $('#pack').classList.toggle('hero', tab === 'items');
  let html = '';
  if (tab === 'items') {
    const rank = id => (ITEMS[id].slot ? 10 + (ITEMS[id].rarity ?? 0) : 0);
    const items = Object.entries(p.inv).sort(([a], [b]) => rank(b) - rank(a) || ITEMS[a].name.localeCompare(ITEMS[b].name));
    const w = R.weapon(p), cut = Math.round((1 - R.armorFactor(p)) * 100);
    html = `<p class="hint">Armor ${R.armor(p)} (${cut}% less damage taken) · Strike ${Math.round(w.damage)} · Spell power ×${R.spellPower(p).toFixed(2)}${R.warm(p) ? ' · Warm' : ''}</p>
      <div class="slots">${Object.entries(SLOTS).map(([slot, label]) => { const id = p.equip[slot], it = ITEMS[id]; return `<div class="slot${id ? '' : ' empty'}"${it?.rarity >= 0 ? ` style="border-color:${RARITIES[it.rarity].color}88"` : ''}><small>${label}</small><b${rarityStyle(it)}>${id ? it.name : '—'}</b>${id ? `<em>${gearText(it)}</em><button data-unequip="${slot}">REMOVE</button>` : ''}</div>`; }).join('')}</div>
      <h4>Pack</h4>${items.length ? `<ul>${items.map(([id, n]) => { const it = ITEMS[id], usable = it.food || it.heal || it.mana || it.effect; return `<li data-tip="${esc(itemTip(id))}"><span><span${rarityStyle(it)}>${it.name}</span>${compare(p, it)} <small>× ${n}${it.herb ? ` · herb of ${REGIONS[it.herb].name}` : ''}${it.slot ? ` · ${it.rarity >= 0 ? RARITIES[it.rarity].name + ' · ' : ''}${gearText(it)}` : ''}</small></span>${it.slot ? `<span class="acts"><button data-equip="${id}">EQUIP</button>${it.generated || (it.slot !== 'mount' && it.slot !== 'tool') ? `<button data-salvage="${id}" title="Break down for materials">SALVAGE</button>` : ''}</span>` : usable ? `<button data-use="${id}">${it.food ? 'EAT' : 'USE'}</button>` : ''}</li>`; }).join('')}</ul>` : '<p class="hint">Nothing yet. Strike trees, rocks, bushes and herbs to gather.</p>'}`;
  }
  if (tab === 'craft' || tab === 'alchemy') {
    const list = RECIPES.filter(r => tab === 'craft' ? !r.station : r.station);
    html = `<p class="hint">${tab === 'alchemy' ? `Brew beside a Cauldron or Ritual Altar in your village. Near you: ${[...st].join(', ') || 'none'}.` : 'Crafted by hand, anywhere.'}</p><ul>${list.map(r => `<li data-tip="${esc(itemTip(r.id))}"><span>${ITEMS[r.id].name}${r.makes ? ` ×${r.makes}` : ''}<br><small>${needsText(p, r.needs)}${r.station ? ` · at ${r.station}` : ''}</small></span><button data-craft="${r.id}" ${R.canCraft(p, r, st) ? '' : 'disabled'}>${r.station ? 'BREW' : 'CRAFT'}</button></li>`).join('')}</ul>`;
  }
  if (tab === 'build') {
    const h = heart();
    html = `<p class="hint">${h ? `Your village has ${state.buildings.filter(b => near(b, h, VILLAGE_RADIUS)).length} buildings. ${Math.round(dist(h, p))} m from its Heart.` : 'Start with a Village Heart. Everything but campfires must stand within 60 m of it.'} Buildings are placed 5 m ahead of you.</p><ul>${Object.entries(BUILDINGS).map(([id, b]) => { const blocker = R.buildBlocker(p, id, { hasHeart: !!h, nearHeart: !!h && dist(h, p) < VILLAGE_RADIUS - 5 }); return `<li><span>${b.name}<br><small>${needsText(p, b.needs)} · ${b.text}${blocker ? ` · <em>${blocker}</em>` : ''}</small></span><button data-build="${id}" ${blocker ? 'disabled' : ''}>BUILD</button></li>`; }).join('')}</ul>`;
  }
  if (tab === 'skills') {
    html = `<ul>${Object.entries(SKILLS).map(([id, s]) => { const lv = R.skillLevel(p, id), lo = 25 * (lv - 1) ** 2, hi = 25 * lv ** 2; return `<li><span>${s.name} <small>${s.text}</small><div class="meter"><div style="width:${lv >= R.SKILL_CAP ? 100 : (p.skills[id] - lo) / (hi - lo) * 100}%"></div></div></span><b class="lv">${lv}</b></li>`; }).join('')}</ul>`;
  }
  if (tab === 'trade') {
    const ok = canTrade(), silver = R.count(p, 'silver');
    html = ok
      ? `<p class="hint">The merchant sees only a traveller. You carry <b>${silver} silver</b>.</p><h4>Sell</h4><ul>${Object.keys(p.inv).filter(id => R.sellPrice(id)).map(id => `<li><span${rarityStyle(ITEMS[id])}>${ITEMS[id].name} <small>× ${R.count(p, id)} · ${R.sellPrice(id)} silver each</small></span><button data-sell="${id}">SELL</button></li>`).join('') || '<li><small>Nothing the merchant wants.</small></li>'}</ul><h4>Buy</h4><ul>${Object.entries(BUY).map(([id, price]) => `<li><span>${ITEMS[id].name} <small>${price} silver</small></span><button data-buy="${id}" ${silver >= price ? '' : 'disabled'}>BUY</button></li>`).join('')}</ul>`
      : '<p class="hint">Trade happens at a human village market stall, while you wear a Glamour [8] and the village is calm.</p>';
  }
  if (tab === 'coven') {
    const k = CLASSES[p.class];
    html = `<h4>${k.name} of ${REGIONS[k.region].name}</h4><p class="hint">${k.blurb}</p><h4>Familiar: ${k.familiar.name}</h4><p class="hint">${k.familiar.bonus}<br>${k.familiar.ability}</p><h4>Your coven (${1 + p.coven.length}/4)</h4><ul>${Object.entries(CLASSES).filter(([id]) => id !== p.class).map(([id, c]) => `<li><span>${c.elder}, ${c.name}<br><small>${p.coven.includes(id) ? 'Sworn to your coven.' : `At ${world.hearthOf(c.region).name} in ${REGIONS[c.region].name}. ${R.recruitBlocker(p, id)}.`}</small></span></li>`).join('')}</ul><h4>Coven rites</h4><ul>${COVEN_SPELLS.map(id => { const s = SPELLS[id]; return `<li data-tip="${esc(spellTip(id))}"><span>${s.name}<br><small>${s.text}</small><br><small>${s.coven} witches · Spellcraft ${s.skill} · ${needsText(p, s.reagent)}</small></span></li>`; }).join('')}</ul>`;
  }
  $('#tabBody').innerHTML = html;
}
$('#tabs').addEventListener('click', e => { if (e.target.dataset.tab) { tab = e.target.dataset.tab; renderPack(); } });
$('#tabBody').addEventListener('click', e => {
  const p = state.player, { use, craft, build, sell, buy, equip, unequip, salvage: scrap } = e.target.dataset;
  const wear = id => { const slot = R.autoEquip(p, id); if (slot) toast(`Equipped ${ITEMS[id].name}.`); };
  if ((sell || buy) && canTrade() && R.trade(p, sell || buy, !!sell)) { toast(sell ? `Sold ${ITEMS[sell].name} for ${R.sellPrice(sell)} silver.` : `Bought ${ITEMS[buy].name}.`); if (buy) wear(buy); quests(); }
  if (equip && R.equip(p, equip)) toast(`Equipped ${ITEMS[equip].name}.`);
  if (unequip) R.unequip(p, unequip);
  if (scrap) { const name = ITEMS[scrap].name, got = salvage(p, scrap); if (got) toast(`Salvaged ${name}: ${Object.entries(got).map(([id, n]) => `+${n} ${ITEMS[id].name}`).join(', ')}.`); }
  if (use) { const msg = R.useItem(p, use); if (msg) toast(msg); }
  if (craft) {
    const before = R.skillLevel(p, 'alchemy'), made = R.craft(p, craft, stations());
    if (made) { toast(`Made ${made} ${ITEMS[craft].name}.`); wear(craft); if (R.skillLevel(p, 'alchemy') > before) trained('alchemy', R.skillLevel(p, 'alchemy')); quests(); }
  }
  if (build && placeBuilding(build)) { play(); return; }
  renderPack();
});

function buildMapBase() {
  const size = 256, img = new ImageData(size, size);
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const x = (i + .5) / size * WORLD_SIZE - HALF, z = (j + .5) / size * WORLD_SIZE - HALF, h = world.height(x, z), c = world.color(x, z, h);
    const shade = Math.max(.6, Math.min(1.4, 1 + (h - world.height(x + 30, z + 30)) * .02)), k = (j * size + i) * 4;
    img.data.set([c[0] * shade * 255, c[1] * shade * 255, c[2] * shade * 255, 255], k);
  }
  const base = document.createElement('canvas'); base.width = base.height = size;
  base.getContext('2d').putImageData(img, 0, 0);
  // Zones: outline each one in the colour of its danger and label it with its level range.
  const key = new Array(size * size), sums = new Map(), ctx = base.getContext('2d');
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const x = (i + .5) / size * WORLD_SIZE - HALF, z = (j + .5) / size * WORLD_SIZE - HALF;
    if (world.height(x, z) < 0) continue;
    const zn = world.zone(x, z), k = zn.name;
    key[j * size + i] = k;
    const t = sums.get(k) ?? sums.set(k, { zn, r: 0, n: 0 }).get(k); t.r += Math.hypot(i + .5 - size / 2, j + .5 - size / 2); t.n++;
  }
  for (let j = 1; j < size - 1; j++) for (let i = 1; i < size - 1; i++) {
    const k = key[j * size + i];
    if (k && (key[j * size + i + 1] !== k || key[(j + 1) * size + i] !== k)) { ctx.fillStyle = ZONE_COLORS[sums.get(k).zn.tier]; ctx.fillRect(i, j, 1, 1); }
  }
  // Labels sit at each ring's middle distance, turned off the diagonal where the hearths, lairs and the Crown are.
  // The Crown's own range goes on its marker.
  mapZones = [...sums.values()].filter(t => t.n > 200 && t.zn.region).map(t => {
    const [qx, qz] = REGIONS[t.zn.region].quadrant, a = Math.atan2(qz, qx) + .42, r = t.r / t.n / size;
    return { ...t.zn, x: .5 + Math.cos(a) * r, y: .5 + Math.sin(a) * r };
  });
  return base;
}
const ZONE_COLORS = ['#7ee08acc', '#e8d36acc', '#f08a4acc', '#ff3c6ecc'];
let mapZones = [];
function renderMap() {
  mapBase ??= buildMapBase();
  const c = $('#mapCanvas'), ctx = c.getContext('2d'), W = c.width, scale = W / WORLD_SIZE, p = state.player, cell = W / EXPLORE, px = x => (x + HALF) * scale;
  ctx.drawImage(mapBase, 0, 0, W, W);
  ctx.fillStyle = '#0c0a10e0';
  for (let j = 0; j < EXPLORE; j++) for (let i = 0; i < EXPLORE; i++) if (!explored[j * EXPLORE + i]) ctx.fillRect(i * cell, j * cell, cell + .5, cell + .5);
  ctx.textAlign = 'center';
  for (const [id, r] of Object.entries(REGIONS)) { ctx.font = 'bold 13px Georgia'; ctx.fillStyle = '#ffffff70'; ctx.fillText(r.name.toUpperCase(), W / 2 + r.quadrant[0] * W * .3, W / 2 + r.quadrant[1] * W * .44); }
  ctx.font = '11px Georgia';
  for (const zn of mapZones) {
    ctx.fillStyle = '#000000a0'; ctx.fillText(`${zn.name} · Lv ${zn.min}–${zn.max}`, zn.x * W + 1, zn.y * W + 1);
    ctx.fillStyle = ZONE_COLORS[zn.tier]; ctx.fillText(`${zn.name} · Lv ${zn.min}–${zn.max}`, zn.x * W, zn.y * W);
  }
  ctx.font = '12px Georgia';
  for (const poi of world.pois) if (state.discovered.includes(poi.id) || poi.type === 'hearth' || poi.type === 'crown') {
    const x = px(poi.x), y = px(poi.z);
    ctx.fillStyle = { circle: state.attuned.includes(poi.id) ? '#d9b8ff' : '#9a6bff', ruin: '#d6b46a', shrine: '#5fe0b0', hearth: '#ffb347', lair: '#ff6a6a', crown: '#ff3c6e', village: '#e8e0c8' }[poi.type];
    ctx.beginPath(); ctx.arc(x, y, poi.type === 'crown' ? 8 : 5, 0, Math.PI * 2); ctx.fill();
    if (poi.type === 'crown') { const zn = world.zone(poi.x, poi.z); ctx.fillStyle = ZONE_COLORS[zn.tier]; ctx.fillText(`${poi.name} · Lv ${zn.min}–${zn.max}`, x, y - 12); continue; }
    ctx.fillStyle = '#f2ecf8'; ctx.fillText(poi.name, x, y - 10);
  }
  for (const b of state.buildings) { ctx.fillStyle = b.type === 'heart' ? '#b98cff' : '#ff9a4a'; ctx.fillRect(px(b.x) - 2, px(b.z) - 2, 4, 4); }
  ctx.save(); ctx.translate(px(p.x), px(p.z)); ctx.rotate(p.yaw + Math.PI / 2);
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(6, 7); ctx.lineTo(0, 3); ctx.lineTo(-6, 7); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
}

// ---------- multiplayer ----------
function loadOnline() {
  let o = {};
  try { o = JSON.parse(localStorage.getItem(ONLINE_KEY)) ?? {}; } catch { /* defaults */ }
  if (!o.key) o.key = Math.random().toString(36).slice(2) + Date.now().toString(36);
  // Host or join by code by default; a page served by a Coven server defaults to that server.
  const mode = ['host', 'join', 'server'].includes(o.mode) ? o.mode : defaultServer() ? 'server' : 'host';
  return { enabled: !!o.enabled, mode, code: o.code ?? '', name: o.name ?? '', coven: o.coven ?? '', world: o.world ?? 'isle', server: o.server || defaultServer(), key: o.key };
}
const online = loadOnline();
function saveOnline() { try { localStorage.setItem(ONLINE_KEY, JSON.stringify(online)); } catch { /* not remembered */ } }
for (const f of ['name', 'coven', 'world', 'server', 'code']) { const el = $(`#mp-${f}`); el.value = online[f]; el.oninput = () => { online[f] = f === 'code' ? (el.value = el.value.toUpperCase().replace(/[^A-Z]/g, '')) : el.value.trim(); saveOnline(); }; }
const showMode = () => { $('#mpFields').dataset.mode = online.mode; for (const r of document.querySelectorAll('[name="mp-mode"]')) r.checked = r.value === online.mode; };
for (const r of document.querySelectorAll('[name="mp-mode"]')) r.onchange = () => { online.mode = r.value; saveOnline(); showMode(); net.close(); };
showMode();
$('#mp-enabled').checked = online.enabled;
$('#mp-enabled').onchange = () => { online.enabled = $('#mp-enabled').checked; saveOnline(); $('#mpFields').classList.toggle('hidden', !online.enabled); if (!online.enabled) net.close(); };
$('#mpFields').classList.toggle('hidden', !online.enabled);

function sendVillage() { net.send({ type: 'village', list: state.buildings.map(({ id, type, x, y, z, rot }) => ({ id, type, x, y, z, rot })) }); }
function goOnline() {
  if (!online.enabled || net.wanted) return;
  const hello = () => {
    const p = state.player;
    return { type: 'hello', world: online.world, name: online.name, coven: online.coven, key: online.key, cls: p.class, level: p.level, buildings: state.buildings.map(({ id, type, x, y, z, rot }) => ({ id, type, x, y, z, rot })) };
  };
  remotes.clear(); villages.clear();
  if (online.mode === 'host') { net.host(hello); chatLine('', 'Opening your game to others…'); }
  else if (online.mode === 'join') { if (online.code.length !== 4) { toast('Enter the host\'s four-letter game code in the menu.'); return; } net.join(online.code, hello); chatLine('', `Joining game ${online.code}…`); }
  else if (!online.server) toast('No multiplayer server set. Enter one in the menu to play online.');
  else net.connect(online.server, hello);
}
const addRemote = r => remotes.set(r.id, { ...r, tx: r.x, ty: r.y, tz: r.z, walk: 0 });
const remoteVillage = v => { buildingsChanged(); villages.set(v.owner, { name: v.name, list: v.list.map(b => ({ ...b, id: `${v.owner}:${b.id}` })) }); };
function hideShared(node, seconds) { if (!state.harvested[node]) { state.harvested[node] = state.clock + seconds; view.hideNode(node); } }
function setBoss(b) {
  serverBoss = b;
  if (boss) { boss.hp = b.hp; boss.warded = b.warded; boss.wardTimer = b.wardLeft; }
}
function chatLine(name, text) {
  const line = document.createElement('div'), who = document.createElement('b');
  who.textContent = name ? `${name}: ` : ''; line.append(who, text);
  $('#chatLog').append(line);
  while ($('#chatLog').children.length > 8) $('#chatLog').firstChild.remove();
  setTimeout(() => line.classList.add('old'), 15000);
}
net.on('welcome', m => {
  net.world = m.world; net.id = m.id;
  remotes.clear(); villages.clear();
  // Wild creatures from before joining have offline ids; let them go and spawn afresh with shared ids.
  creatures = creatures.filter(c => c.village !== undefined); creatureSeq = 0; goneIds = [];
  m.players.forEach(addRemote); m.villages.forEach(remoteVillage);
  for (const [node, seconds] of m.harvested) hideShared(node, seconds);
  setBoss(m.boss);
  if (net.mode === 'host') { chatLine('', `You are hosting. Your game code is ${net.code}: friends choose “Join with a code” and enter it.`); toast(`Game code: ${net.code}`, true); }
  else if (net.mode === 'join') chatLine('', `Joined ${net.code}.`);
  else chatLine('', `Joined world “${m.world}”.`);
  chatLine('', `${m.players.length ? `${m.players.length} other witch${m.players.length > 1 ? 'es' : ''} here.` : 'You are alone here for now.'} Press Enter to chat.`);
});
net.on('join', m => { addRemote(m.player); chatLine('', `${m.player.name} has entered the isle.`); });
net.on('leave', m => { const r = remotes.get(m.id); if (r) chatLine('', `${r.name} has left.`); remotes.delete(m.id); });
net.on('snap', m => {
  for (const o of m.players) {
    if (o.id === net.id) continue;
    const r = remotes.get(o.id);
    if (!r) { addRemote(o); continue; }
    Object.assign(r, { ...o, x: r.x, y: r.y, z: r.z, tx: o.x, ty: o.y, tz: o.z });
    if (Math.hypot(r.tx - r.x, r.tz - r.z) > 50) Object.assign(r, { x: o.x, y: o.y, z: o.z });
  }
  // Creatures other players run: add, update targets for smoothing, and drop any no longer reported.
  const seen = new Set(), mine = new Map(creatures.filter(c => c.remote).map(c => [c.id, c]));
  for (const o of m.creatures ?? []) {
    if (!CREATURE[o.kind]) continue;
    seen.add(o.id);
    const c = mine.get(o.id);
    if (!c) { creatures.push({ ...o, remote: true, tx: o.x, ty: o.y, tz: o.z, poison: 0, slow: 0, root: 0 }); continue; }
    Object.assign(c, { hp: o.hp, maxHp: o.maxHp, state: o.state, walk: o.walk, yaw: o.yaw, hurt: Math.max(c.hurt ?? 0, o.hurt), tx: o.x, ty: o.y, tz: o.z });
    if (Math.hypot(c.tx - c.x, c.tz - c.z) > 40) Object.assign(c, { x: o.x, y: o.y, z: o.z });
  }
  creatures = creatures.filter(c => !c.remote || seen.has(c.id));
});
// The server hands us a creature whose owner left or walked away: we run it from now on.
net.on('adopt', ({ creature: o }) => {
  if (!CREATURE[o.kind]) return;
  creatures = creatures.filter(c => c.id !== o.id);
  creatures.push(Object.assign(makeCreature(o.kind, o.x, o.z, o.hx !== undefined ? { homeX: o.hx, homeZ: o.hz } : {}), { id: o.id, y: o.y, yaw: o.yaw, hp: o.hp, maxHp: o.maxHp, state: o.state, walk: o.walk }));
});
// Another player struck one of our creatures.
net.on('hit', m => {
  const c = creatures.find(o => o.id === m.id && !o.remote && o.hp > 0);
  if (!c) return;
  c.lastHitBy = m.from;
  if (hurtCreature(c, m.amount, { poison: m.poison, slow: m.slow, root: m.root, weaken: m.weaken })) died(c);
});
// A creature someone else ran has died; if our blow felled it, the spoils are ours.
net.on('died', m => {
  const c = creatures.find(o => o.id === m.id);
  creatures = creatures.filter(o => o.id !== m.id);
  const b = CREATURE[m.kind];
  if (!b) return;
  if (m.by === net.id) slain(c ?? { kind: m.kind }, b);
  else if (b.elite) state.elites[b.region] = state.clock + ELITE_RESPAWN;
});
net.on('bite', m => { R.damagePlayer(state.player, m.damage, { poison: m.poison }); hurtFlash = .3; });
net.on('harvest', m => hideShared(m.node, m.seconds));
net.on('village', remoteVillage);
net.on('boss', m => { const was = serverBoss?.warded; setBoss(m.boss); if (boss && was && !m.boss.warded) toast('A coven-sister\'s Grand Rite shatters the ward! Strike now!', true); });
net.on('bossDown', m => {
  setBoss(m.boss);
  const p = state.player;
  if (Math.hypot(p.x - CROWN.x, p.z - CROWN.z) < 250) {
    boss = null; state.bossDefeated = true; p.stats.boss = 1;
    toast(`The Unwitch is unmade${m.by ? ` — ${m.by} struck the last blow` : ''}. The coven is whole again.`, true); bossLoot(); reward(BOSS.xp); quests(); saveState();
  } else chatLine('', `${m.by} and their coven have unmade the Unwitch.`);
});
net.on('fx', m => view.ring(m.x, m.y, m.z, m.r, m.color));
net.on('chat', m => chatLine(m.name, m.text));
net.on('error', m => toast(m.text));
net.on('status', (status) => {
  if (status === 'reconnecting') chatLine('', 'Lost the server. Reconnecting…');
  if (status !== 'online') { remotes.clear(); villages.clear(); buildingsChanged(); creatures = creatures.filter(c => !c.remote); }
});

function openChat() {
  if (!net.online) { toast('Chat needs an online world. Turn on “Play online” in the menu.'); return; }
  mode = 'chat'; keys.clear(); jumpTap = false;
  $('#chatInput').classList.remove('hidden'); $('#chatInput').value = ''; $('#chatInput').focus();
}
$('#chatInput').addEventListener('keydown', e => {
  e.stopPropagation();
  if (e.key === 'Enter') { const text = e.target.value.trim(); if (text) net.send({ type: 'chat', text }); }
  if (e.key === 'Enter' || e.key === 'Escape') { e.target.blur(); $('#chatInput').classList.add('hidden'); mode = 'playing'; captureMouse(); }
});

// ---------- modes & input ----------
function captureMouse() { try { canvas.requestPointerLock?.()?.catch?.(() => {}); } catch { /* arrow keys still turn */ } }
// Letting the mouse go for a panel or the pause menu. The browser reports it a moment later, perhaps after the
// panel has already closed again, so that report must not be taken for the player leaving the game.
let releasing = false;
function releaseMouse() { if (document.pointerLockElement === canvas) { releasing = true; document.exitPointerLock?.(); } }
function play() { music.start(); goOnline(); mode = 'playing'; accumulator = 0; keys.clear(); jumpTap = false; for (const id of ['#overlay', '#pack', '#map', '#classes', '#help']) $(id).classList.add('hidden'); captureMouse(); }
function openPanel(name, withTab) {
  mode = name; keys.clear(); jumpTap = false; releaseMouse();
  $(`#${name}`).classList.remove('hidden');
  if (withTab) tab = withTab;
  if (name === 'pack') renderPack(); else if (name === 'help') renderHelp(); else renderMap();
}
function pause() {
  mode = 'paused'; keys.clear(); jumpTap = false; releaseMouse(); saveState();
  $('#overlay').classList.remove('hidden'); $('#play').innerHTML = 'RESUME <span>→</span>'; $('#quit').classList.remove('hidden');
  $('#description').textContent = `${CLASSES[state.player.class].name}, level ${state.player.level}, day ${state.day}. Your progress is saved.`;
}
function chooseClass() {
  $('#overlay').classList.add('hidden'); $('#classes').classList.remove('hidden'); mode = 'classes';
  $('#classCards').innerHTML = Object.entries(CLASSES).map(([id, k]) => `<button class="card" data-class="${id}" style="--robe:${k.robe}"><span class="eyebrow">${REGIONS[k.region].name}</span><h3>${k.name}</h3><p>${k.blurb}</p><p><b>Spells:</b> ${k.spells.map(s => SPELLS[s].name).join(', ')}</p><p><b>${k.familiar.name}:</b> ${k.familiar.bonus} ${k.familiar.ability}</p><small>${k.hp} health · ${k.mana} mana</small></button>`).join('');
}
$('#classCards').addEventListener('click', e => { const card = e.target.closest('[data-class]'); if (card) { begin(freshState(card.dataset.class)); saveState(); play(); } });
$('#classBack').onclick = () => { $('#classes').classList.add('hidden'); $('#overlay').classList.remove('hidden'); mode = state ? 'paused' : 'menu'; };
$('#play').onclick = () => state ? play() : chooseClass();
$('#newGame').onclick = () => { if (confirm('Abandon this life and start again? Your saved progress will be lost.')) chooseClass(); };
// Quit: save, leave any online game, and go back to the title screen, where Continue picks up where you left off.
$('#quit').onclick = () => { saveState(); net.close(); music.setEnabled(false); location.reload(); };
document.querySelectorAll('[data-close]').forEach(b => b.onclick = play);
addEventListener('resize', () => view.resize());
addEventListener('blur', () => { if (mode === 'playing') pause(); });
addEventListener('beforeunload', saveState);
// A host closing the tab ends the game for everyone at once, rather than leaving guests waiting.
addEventListener('pagehide', () => { if (net.mode === 'host') net.close(); });
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === canvas) return;
  if (releasing) { releasing = false; return; } // our own release, for a panel or the menu
  if (mode === 'playing') pause();
});
addEventListener('keydown', e => {
  if (['Space', 'Tab', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
  if (e.repeat) { if (mode === 'playing') keys.add(e.code); return; }
  if (e.code === 'Escape') { if (bench) endBench(true); else if (!$('#bench').classList.contains('hidden')) closeBench(); else if (mode === 'playing') pause(); else if (mode === 'pack' || mode === 'map' || mode === 'help') play(); else if (mode === 'help-menu') closeMenuHelp(); return; }
  if (e.code === 'Tab' || e.code === 'KeyI' || e.code === 'KeyB' || e.code === 'KeyK' || e.code === 'KeyC') {
    const want = { Tab: 'items', KeyI: 'items', KeyB: 'build', KeyK: 'skills', KeyC: 'coven' }[e.code];
    if (mode === 'playing') openPanel('pack', want); else if (mode === 'pack') { if (tab === want || e.code === 'Tab') play(); else { tab = want; renderPack(); } }
    return;
  }
  if (e.code === 'Enter' && mode === 'playing') { e.preventDefault(); openChat(); return; }
  if (e.code === 'KeyM') { if (mode === 'playing') openPanel('map'); else if (mode === 'map') play(); return; }
  if (e.code === 'KeyH') { if (mode === 'playing') openPanel('help'); else if (mode === 'help') play(); return; }
  if (e.code === 'KeyN' && mode === 'playing') { setMusic(!music.enabled); toast(music.enabled ? 'Music on.' : 'Music off.'); return; }
  if (mode !== 'playing') return;
  keys.add(e.code);
  if (e.code === 'Space') jumpTap = true; // kept until the next step, so a quick tap on a slow frame still jumps
  const spell = SPELL_KEYS.indexOf(e.code);
  if (spell >= 0) cast(spell);
  if (e.code === 'KeyE') interaction()?.act();
  if (e.code === 'KeyF') toggleMount();
  if (e.code === 'Space' && state.player.mounted && !state.player.flying) { const why = R.flightBlocker(state.player); if (why) toast(why); }
  if (e.code === 'KeyQ') { const food = R.bestFood(state.player); toast(food ? R.useItem(state.player, food) : 'You have nothing to eat. Gather berries or hunt.'); }
});
addEventListener('keyup', e => keys.delete(e.code));
document.addEventListener('mousemove', e => {
  if (mode !== 'playing' || document.pointerLockElement !== canvas) return;
  yaw += e.movementX * .0025;
  pitch = Math.max(-.25, Math.min(1.2, pitch + e.movementY * .002));
});
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('mousedown', e => {
  if (mode !== 'playing') return;
  if (document.pointerLockElement !== canvas) captureMouse();
  if (e.button === 0) strike();
  if (e.button === 2) cast(0);
});

// ---------- music ----------
const MUSIC_KEY = 'coven-music';
const music = new Music();
try { const m = JSON.parse(localStorage.getItem(MUSIC_KEY) ?? 'null'); if (m === 0 || m === false) music.enabled = false; else if (m) { music.enabled = m.on; music.volume = m.volume; } } catch { /* defaults */ }
$('#music-on').checked = music.enabled; $('#music-vol').value = Math.round(music.volume * 100);
function setMusic(on, volume = music.volume) {
  music.setVolume(volume); music.setEnabled(on);
  $('#music-on').checked = on; $('#music-vol').value = Math.round(volume * 100);
  try { localStorage.setItem(MUSIC_KEY, JSON.stringify({ on, volume })); } catch { /* not remembered */ }
}
$('#music-on').onchange = () => setMusic($('#music-on').checked);
$('#music-vol').oninput = () => setMusic($('#music-on').checked, $('#music-vol').value / 100);
// The mood follows the moment: battle when something hunts you or the Unwitch is near, night after dark.
function musicMood() {
  if (!state || mode !== 'playing') return;
  const p = state.player, danger = (boss && near(boss, p, 160)) || creatures.some(c => c.hp > 0 && c.state === 'chase' && !CREATURE[c.kind].human && near(c, p, 30) && CREATURE[c.kind].temper !== 'timid');
  music.setMood(danger ? 'battle' : isNight() ? 'night' : 'day');
}

// ---------- tooltips ----------
// Anything with a data-tip shows it beside the pointer (while the pointer is free: menus, panels, the pause screen).
const tip = document.createElement('div'); tip.id = 'tip'; document.body.append(tip);
document.addEventListener('mouseover', e => {
  const el = e.target.closest?.('[data-tip]');
  if (!el || document.pointerLockElement) { tip.classList.remove('on'); return; }
  tip.innerHTML = el.dataset.tip; tip.classList.add('on');
});
document.addEventListener('mousemove', e => {
  if (!tip.classList.contains('on')) return;
  const w = tip.offsetWidth, h = tip.offsetHeight;
  tip.style.left = `${Math.min(innerWidth - w - 8, e.clientX + 14)}px`; tip.style.top = `${Math.max(8, Math.min(innerHeight - h - 8, e.clientY + 16))}px`;
});
document.addEventListener('mouseout', e => { if (!e.relatedTarget?.closest?.('[data-tip]')) tip.classList.remove('on'); });
function spellTip(id, blocker) {
  const s = SPELLS[id], parts = [`${s.mana} mana`, `${s.cooldown} s to recharge`];
  if (s.coven > 1) parts.push(`${s.coven} witches online (alone, any spell casts once its mana and reagents are met)`);
  if (s.reagent) parts.push(`uses ${Object.entries(s.reagent).map(([r, n]) => `${n} ${ITEMS[r].name}`).join(', ')}`);
  return `<b>${s.name}</b><br>${s.text}<br><small>${parts.join(' · ')}</small>${blocker ? `<br><small>${blocker}</small>` : ''}`;
}
// What an item is for, in a line.
function itemTip(id) {
  const it = ITEMS[id], bits = [];
  if (it.food) bits.push(`food +${it.food}`); if (it.water) bits.push(`water +${it.water}`); if (it.heal) bits.push(`heals ${it.heal}`); if (it.mana) bits.push(`mana +${it.mana}`);
  if (it.effect) bits.push({ swift: 'run 30% faster', ironbark: 'take 40% less damage', sight: 'see in the dark', venom: 'your blows poison' }[it.effect] ?? it.effect, `${it.duration} s`);
  if (it.hurt) bits.push('raw: cook it at a fire first');
  if (it.herb) bits.push(`an herb of ${REGIONS[it.herb].name}`);
  if (it.slot) bits.push(gearText(it));
  if (it.reagent) bits.push('a reagent for spells');
  const uses = RECIPES.filter(r => r.needs[id]).map(r => ITEMS[r.id].name);
  if (uses.length) bits.push(`used in ${uses.slice(0, 4).join(', ')}${uses.length > 4 ? '…' : ''}`);
  if (R.sellPrice(id)) bits.push(`sells for ${R.sellPrice(id)} silver`);
  return `<b>${esc(it.name)}</b><br><small>${esc(bits.join(' · ') || 'A material.')}</small>`;
}

// ---------- how to play ----------
function renderHelp() {
  const keys = [['WASD / mouse', 'move and look'], ['Shift / Space', 'sprint / jump'], ['Left mouse', 'strike, or gather what is in front of you'], ['1–0 / right mouse', 'spells'], ['E', 'talk, trade, drink, cook, rest'], ['Q', 'eat'], ['F', 'broom (Space / X to fly up and down)'], ['Tab / I, B, K, C', 'inventory, build, skills, coven'], ['M / H / N', 'map, this page, music'], ['Esc', 'pause']];
  $('#helpBody').innerHTML = `
  <section><h4>THE STORY</h4><p>Four witches once kept the isle: the Bog Witch of the Mirefen, the Hex Witch of the Gloamwood, the Bloom Witch of Springvale and the Wild Witch of the Greenwood. Then the Unwitch rose at the Crown, the isle's heart, and broke their coven. You are the first to come back.</p></section>
  <section><h4>YOUR GOAL</h4><p>Win back the other three paths' elders so your coven is whole again, then go to the Crown (follow the crimson beacon), summon the Wyrd Titan and cast the Grand Rite to break the Unwitch's ward and destroy her. The quest panel on the right always shows your next step.</p></section>
  <section><h4>GETTING STARTED</h4><ul><li>Speak with your elder at your hearth [E].</li><li>Strike trees, rocks, bushes and herbs to gather. Craft a Stone Hatchet [Tab].</li><li>Found your village with a Village Heart [B], then a Cauldron to brew potions.</li><li>Two trees, two bushes and a bird's nest make a Witch's Broom: ride it with [F].</li></ul></section>
  <section><h4>STAYING ALIVE</h4><ul><li>Watch food and water: eat [Q], cook meat at a fire, drink at ponds or a well.</li><li>The high mountains are cold at night: wear a cloak or keep near a fire.</li><li>If you fall, you wake at home (your hearth, village, hut or an attuned stone circle) with your things.</li><li>The isle is zoned by danger: green 1–3 near the coasts, then yellow, orange and the red Crown at 12–15. The map [M] shows the zones.</li><li>Over each creature near you: its level and name, coloured by how dangerous it is for you: <span class="con trivial">grey</span> trivial, <span class="con easy">green</span> easy, <span class="con even">yellow</span> an even fight, <span class="con hard">orange</span> hard, <span class="con deadly">red</span> deadly. ◆ marks an elite, which counts four levels harder. Aim at one to see the verdict in words.</li></ul></section>
  <section><h4>THE COVEN</h4><ul><li>At levels 3, 6 and 9 an elder of another path will join you, if you bring her a gift potion brewed from her own land's herbs.</li><li>Coven rites need two, three or four witches within 25 m. Playing alone, any spell can be cast once its mana and reagents are met; online, real players in the same coven count too.</li></ul></section>
  <section><h4>HUMAN VILLAGES</h4><ul><li>Humans hunt witches. Walk in as yourself and the alarm goes up.</li><li>Cast Glamour [8] to wear a human face, then trade with the merchant for silver, bread, ale and iron tools.</li><li>Any other spell, or striking anyone, breaks the glamour. A human who falls near an empty Soul Jar gives up their soul, the price of the Wyrd Titan.</li></ul></section>
  <section><h4>THE UNWITCH</h4><ul><li>Her ward lets only a tenth of any harm through, until a Grand Rite [7] shatters it for 30 seconds.</li><li>She calls thralls to her side, slams those who come close and hurls bolts at those who don't.</li><li>A Heartfire Sigil (made from an elite's Heartfire and the four lands' essences) makes three: enough for a Titan and two rites.</li></ul></section>
  <section><h4>CONTROLS</h4><ul>${keys.map(([k, t]) => `<li><kbd>${k}</kbd> ${t}</li>`).join('')}</ul></section>
  ${spellBook()}`;
}
// Every spell and what it does: each path's own two (keys 1 and 2 for whoever walks it), then the rites all
// witches share, on keys 3 to 0.
function spellBook() {
  const line = (id, key) => { const s = SPELLS[id], cost = [`${s.mana} mana`, `${s.cooldown} s`, s.coven > 1 ? `${s.coven} witches` : '', s.reagent ? Object.entries(s.reagent).map(([r, n]) => `${n} ${ITEMS[r].name}`).join(', ') : ''].filter(Boolean).join(' · ');
    return `<li>${key ? `<kbd>${key}</kbd> ` : ''}<b>${s.name}</b>: ${s.text} <small>${cost}</small></li>`; };
  const shared = R.knownSpells(state?.player ?? { class: 'wild' }).slice(2);
  return `<section class="spells"><h4>ALL SPELLS</h4>${Object.values(CLASSES).map(k => `<p><b>${k.name}</b></p><ul>${k.spells.map((id, i) => line(id, String(i + 1))).join('')}</ul>`).join('')}
    <p><b>Shared by every witch</b></p><ul>${shared.map((id, i) => line(id, String((i + 3) % 10))).join('')}</ul></section>`;
}
$('#helpBtn').onclick = () => { renderHelp(); $('#help').classList.remove('hidden'); mode = 'help-menu'; };
function closeMenuHelp() { $('#help').classList.add('hidden'); mode = state && $('#overlay').classList.contains('hidden') ? 'playing' : state ? 'paused' : 'menu'; }
document.querySelector('#help [data-close]').onclick = () => (mode === 'help-menu' ? closeMenuHelp() : play());

// ---------- speed test ----------
// Walks the same route at each graphics level and measures the frame rate, so a player (or a friend) can see what
// their computer manages and choose a level. Leaves any game as it was. ?benchmark in the address starts it
// (?benchmark=quick for a short run, used by the tests).
const BENCH_LEVELS = ['low', 'medium', 'high', 'ultra'];
const LEVEL_NAMES = { low: 'Low', medium: 'Medium', high: 'High', ultra: 'Ultra' };
let bench = null, benchReport = null;
function startBench(quick = false) {
  if (bench) return;
  const h = world.hearthOf('meadow'), cx = h.x + 40, cz = h.z + 40;
  bench = { quick, i: -1, prevMode: mode === 'paused' ? 'paused' : state ? 'paused' : 'menu', cx, cz, r: 45, a: 0, player: { x: cx, y: 0, z: cz, yaw: 0 }, results: [],
    elders: ELDERS.filter(e => Math.hypot(e.x - cx, e.z - cz) < 300) };
  mode = 'bench'; keys.clear(); jumpTap = false; releaseMouse();
  for (const id of ['#overlay', '#help', '#bench', '#pack', '#map', '#classes']) $(id).classList.add('hidden');
  $('#benchBar').classList.remove('hidden');
  put('body', 'className', 'is-bench');
  nextBenchLevel(performance.now());
}
function nextBenchLevel(now) {
  const b = bench;
  if (++b.i >= BENCH_LEVELS.length) { endBench(false); return; }
  view.setQuality(BENCH_LEVELS[b.i]);
  Object.assign(b, { phase: 'warm', t0: now, frames: [], recent: [] });
}
function benchFrame(now, raw, dt) {
  const b = bench, level = BENCH_LEVELS[b.i], p = b.player, t = (now - b.t0) / 1000;
  // A circle through the Springvale meadow at walking pace: blossom trees, grass, the hearth and its elder.
  b.a += dt * 5 / b.r;
  p.x = b.cx + Math.cos(b.a) * b.r; p.z = b.cz + Math.sin(b.a) * b.r; p.y = world.ground(p.x, p.z); p.yaw = b.a + Math.PI / 2;
  view.stream(p.x, p.z, 2);
  view.syncWorld({ creatures: [], allies: [], boss: null, buildings: [], projectiles: [], elders: b.elders, now: now / 1000 });
  view.render({ player: p, yaw: p.yaw, pitch: .18, dayTime: .42, now: now / 1000, dt, swing: 0, toolName: 'fists', lights: hearthFires(), moving: true, sight: false });
  const warm = b.quick ? .5 : 2.5, measure = b.quick ? 1 : 6;
  if (b.phase === 'warm') {
    // Settle first: new ground to build and shaders to compile make the first frames slow.
    b.recent.push(raw); if (b.recent.length > 10) b.recent.shift();
    if (t > warm && ((b.recent.length === 10 && Math.max(...b.recent) < .25) || t > warm + (b.quick ? 3 : 8))) Object.assign(b, { phase: 'measure', t0: now, frames: [] });
  } else {
    b.frames.push(raw);
    if (t >= measure) {
      const f = [...b.frames].sort((x, y) => x - y), avg = f.length / f.reduce((sum, x) => sum + x, 0), low = 1 / f[Math.min(f.length - 1, Math.floor(f.length * .99))];
      b.results.push({ level, avg, low, verdict: avg >= 55 && low >= 40 ? 'Smooth' : avg >= 30 && low >= 20 ? 'Playable' : 'Slow' });
      nextBenchLevel(now);
      return;
    }
  }
  put('#benchBar', 'textContent', `SPEED TEST · ${LEVEL_NAMES[level]} (${b.i + 1} of ${BENCH_LEVELS.length}) · ${b.phase === 'warm' ? 'getting ready' : `measuring, ${Math.max(0, Math.ceil(measure - t))} s`} · Esc stops`);
}
function endBench(stopped) {
  const b = bench;
  bench = null;
  view.setQuality(gfx); settleUntil = performance.now() + 3000;
  $('#benchBar').classList.add('hidden');
  mode = b.prevMode;
  $('#overlay').classList.remove('hidden');
  if (stopped) toast('Speed test stopped.');
  else showBenchResults(b.results);
}
const gpuName = () => {
  const gl = view.renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
  return String((ext && gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) || gl.getParameter(gl.RENDERER) || 'unknown graphics');
};
const browserName = () => {
  const ua = navigator.userAgent;
  for (const [re, name] of [[/Edg\/(\d+)/, 'Edge'], [/Firefox\/(\d+)/, 'Firefox'], [/Chrome\/(\d+)/, 'Chrome'], [/Version\/(\d+)[^ ]* (Mobile\/\S+ )?Safari/, 'Safari']]) { const m = re.exec(ua); if (m) return `${name} ${m[1]}`; }
  return 'unknown browser';
};
function showBenchResults(results) {
  const rev = [...results].reverse(), best = rev.find(r => r.verdict === 'Smooth') ?? rev.find(r => r.verdict === 'Playable') ?? results[0];
  const info = `${gpuName()} · window ${innerWidth}×${innerHeight} at ${devicePixelRatio}× · ${browserName()}`;
  const text = [`Coven speed test, ${new Date().toISOString().slice(0, 10)}`, info,
    ...results.map(r => `${LEVEL_NAMES[r.level].padEnd(7)}${r.avg.toFixed(0).padStart(5)} fps average · slowest 1%${r.low.toFixed(0).padStart(5)} fps · ${r.verdict}`),
    `Recommended: ${LEVEL_NAMES[best.level]}`].join('\n');
  benchReport = { text, best: best.level, results };
  $('#benchBody').innerHTML = `<p class="hint">Coven walked the same route through Springvale at each graphics level on this computer.</p>
    <table class="benchTable"><tr><th>Level</th><th>Average</th><th>Slowest 1%</th><th></th></tr>${results.map(r => `<tr class="${r.verdict.toLowerCase()}"><td>${LEVEL_NAMES[r.level]}</td><td>${r.avg.toFixed(0)} fps</td><td>${r.low.toFixed(0)} fps</td><td>${r.verdict}</td></tr>`).join('')}</table>
    <p>Recommended: <b>${LEVEL_NAMES[best.level]}</b>. <span class="hint">Smooth: 55 frames a second or more, rarely below 40. Playable: 30, rarely below 20.</span></p>
    <p class="hint">${esc(info)}</p>
    <div class="benchButtons"><button id="benchUse">USE ${LEVEL_NAMES[best.level].toUpperCase()}</button><button id="benchCopy" class="ghost">COPY RESULTS</button></div>
    <textarea id="benchText" class="hidden" readonly rows="7">${esc(text)}</textarea>`;
  $('#bench').classList.remove('hidden');
  $('#benchUse').onclick = () => { setGfx(best.level); closeBench(); toast(`Graphics set to ${LEVEL_NAMES[best.level]}.`); };
  $('#benchCopy').onclick = () => {
    const shown = () => { $('#benchText').classList.remove('hidden'); $('#benchText').select(); toast('Select the text and copy it.'); };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(() => toast('Results copied: paste them anywhere.'), shown); else shown();
  };
}
function closeBench() { $('#bench').classList.add('hidden'); }
$('#benchBtn').onclick = () => startBench();
document.querySelector('#bench [data-close]').onclick = closeBench;

// Without a save, play starts at class selection, and the menu shows a witch on a ridge at dusk,
// watching the beacon over the Crown.
const TITLE_VIEW = { x: -517, z: -188, dayTime: .73, turn: -.4, pitch: -.15 };
const preview = freshState('wild');
Object.assign(preview.player, { x: TITLE_VIEW.x, z: TITLE_VIEW.z, y: world.ground(TITLE_VIEW.x, TITLE_VIEW.z), yaw: Math.atan2(CROWN.z - TITLE_VIEW.z, CROWN.x - TITLE_VIEW.x) });
const saved = loadState();
if (saved) { begin(saved); $('#play').innerHTML = 'CONTINUE <span>→</span>'; $('#newGame').classList.remove('hidden'); }
else begin(preview);
window.__coven = { net, get remotes() { return remotes; }, get villages() { return villages; }, get state() { return state; }, world, view, get creatures() { return creatures; }, get allies() { return allies; }, get boss() { return boss; }, cast, placeBuilding, get mode() { return mode; }, spawn: (kind, x, z) => creatures.push(newCreature(kind, x, z)), loot: { generateGear, addGear }, equip: id => R.equip(state.player, id), get portrait() { return portrait; }, aim: (y, p) => { yaw = y; pitch = p; }, hit: (c, n) => damage(c, n), humanVillages, villageState, interact: () => interaction()?.act(),
  // For the playthrough bot (Scripts/playthrough.mjs): run the game for `seconds` without drawing it, and read what it said.
  step: seconds => { for (let i = 0; i < seconds * 60 && mode === 'playing'; i++) { update(1 / 60); if (i % 15 === 0) view.stream(state.player.x, state.player.z, 2); } },
  messages };
if (!saved) state = null;
// ?benchmark in the address runs the speed test once the game has loaded (?benchmark=quick: a short one).
{ const b = new URLSearchParams(location.search).get('benchmark'); if (b !== null) setTimeout(() => startBench(b === 'quick'), 1500); }

// Auto graphics: lower the render resolution when frames run slow, raise it again when there is headroom.
const GFX_KEY = 'coven-gfx';
let portrait = null, gfx = 'auto', frameAvg = 1 / 60, scaleTimer = 0, hudTimer = 0;
try { gfx = localStorage.getItem(GFX_KEY) || 'auto'; } catch { /* default */ }
$('#gfx').value = gfx; view.setQuality(gfx);
function setGfx(level) { gfx = level; $('#gfx').value = level; view.setQuality(gfx); settleUntil = performance.now() + 3000; try { localStorage.setItem(GFX_KEY, gfx); } catch { /* not remembered */ } }
$('#gfx').onchange = () => setGfx($('#gfx').value);
// Auto graphics: lower the render resolution when frames run slow, raise it again when there is headroom, and
// drop to a simpler level when even that is not enough. It works on the title screen too (the world is drawn
// behind it), so the level has usually settled by the time you begin.
let slowFrames = 0, settleUntil = performance.now() + 3000;
function autoScale(raw, dt) {
  if (gfx !== 'auto' || performance.now() < settleUntil) return;
  // A run of very slow frames is no stall (a tab switch or a chunk loading): this level is too much.
  if (raw > .25) { if (++slowFrames >= 5 && view.stepDown()) { slowFrames = 0; frameAvg = 1 / 30; scaleTimer = 3; } return; }
  slowFrames = 0;
  frameAvg += (raw - frameAvg) * .05;
  if ((mode !== 'playing' && mode !== 'menu' && mode !== 'paused') || (scaleTimer -= dt) > 0) return;
  // Far too slow for this level (a slideshow): a simpler level at once.
  if (frameAvg > 1 / 12 && view.stepDown()) { frameAvg = 1 / 30; scaleTimer = 3; return; }
  if (frameAvg > 1 / 38 && view.scale > .5) { view.setScale(Math.max(.5, view.scale - .1)); scaleTimer = 1; }
  // Still slow at the lowest resolution: drop to a simpler level (fewer shadows, no grass, no final pass).
  else if (frameAvg > 1 / 30 && view.scale <= .5 && view.stepDown()) { frameAvg = 1 / 45; scaleTimer = 4; }
  else if (frameAvg < 1 / 55 && view.scale < 1) { view.setScale(Math.min(1, view.scale + .1)); scaleTimer = 3; }
  else scaleTimer = .5;
}

// ---------- name plates ----------
// Over each creature within 40 m: its level and name, coloured by how dangerous it is for you (grey trivial, green
// easy, yellow an even fight, orange hard, red deadly; an elite, ◆, counts four levels harder), a health bar once
// it is hurt, and on the one your spells would strike, the verdict in words.
const PLATE_RANGE = 40, plateEls = new Map();
const CON = [[-Infinity, 'trivial', 'Trivial'], [-5, 'easy', 'Easy'], [-2, 'even', 'Even fight'], [3, 'hard', 'Hard'], [5, 'deadly', 'Deadly']];
function difficulty(kind, level) { const b = CREATURE[kind], d = b.level - level + (b.elite ? 4 : 0); let r = CON[0]; for (const k of CON) if (d >= k[0]) r = k; return r; }
function plates(p) {
  const box = $('#plates'), seen = new Set(), target = mode === 'playing' ? pickTarget(36) : null;
  for (const c of creatures) {
    const b = CREATURE[c.kind];
    if (!b || c.hp <= 0 || c.dead) continue;
    const d = Math.hypot(c.x - p.x, c.z - p.z);
    if (d > PLATE_RANGE) continue;
    const at = view.headOnScreen('creatures', c.id, c.kind);
    if (!at) continue;
    seen.add(c.id);
    let el = plateEls.get(c.id);
    if (!el) { el = document.createElement('div'); el.innerHTML = '<b></b><span></span><em></em><i><i></i></i>'; el.cache = {}; box.append(el); plateEls.set(c.id, el); }
    const [, cls, word] = difficulty(c.kind, state.player.level), aimed = c === target, hurt = c.hp < c.maxHp;
    const key = `${cls}${aimed}${hurt}`;
    if (el.cache.key !== key) { el.className = `plate ${cls}${aimed ? ' target' : ''}${hurt ? ' hurt' : ''}`; el.cache.key = key; el.children[2].textContent = word; }
    if (el.cache.kind !== c.kind) { el.children[0].textContent = b.level; el.children[1].textContent = b.elite ? `◆ ${b.name}` : b.name; el.cache.kind = c.kind; }
    if (hurt) el.children[3].firstChild.style.width = `${Math.max(0, c.hp / c.maxHp * 100).toFixed(1)}%`;
    el.style.transform = `translate(${at.x.toFixed(1)}px,${at.y.toFixed(1)}px) translate(-50%,-100%)`;
    el.style.opacity = d > PLATE_RANGE - 10 ? ((PLATE_RANGE - d) / 10).toFixed(2) : '';
  }
  for (const [id, el] of plateEls) if (!seen.has(id)) { el.remove(); plateEls.delete(id); }
}

// The game moves in steps of 1/60 s, which rarely line up with the screen's frames: drawn as they are, moving
// things jump a step ahead or behind now and then, and the camera with them (worst sideways at speed). So each
// frame draws everything between the last two steps, as far along as the time since the last step.
const was = { x: 0, y: 0, z: 0, yaw: 0, turn: 0, swing: 0, at: new WeakMap() }, drawn = { x: 0, y: 0, z: 0, yaw: 0 }, moved = [];
const turnBy = (a, b) => ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
function remember() {
  const p = state.player;
  Object.assign(was, { x: p.x, y: p.y, z: p.z, yaw: p.yaw, turn: yaw, swing });
  for (const list of [creatures, allies, projectiles]) for (const c of list) if (!c.remote) { let w = was.at.get(c); if (!w) was.at.set(c, w = {}); w.x = c.x; w.y = c.y; w.z = c.z; w.yaw = c.yaw; w.step = steps; }
  if (boss) { let w = was.at.get(boss); if (!w) was.at.set(boss, w = {}); Object.assign(w, { x: boss.x, y: boss.y, z: boss.z, yaw: boss.yaw, step: steps }); }
}
// Put everything at its in-between place for drawing (and back afterwards with settle()).
function inBetween(a) {
  const p = state.player, near = (w, o) => Math.abs(o.x - w.x) + Math.abs(o.z - w.z) < 20; // not across a teleport
  const t = near(was, p) ? a : 1;
  drawn.x = was.x + (p.x - was.x) * t; drawn.y = was.y + (p.y - was.y) * t; drawn.z = was.z + (p.z - was.z) * t; drawn.yaw = was.yaw + turnBy(was.yaw, p.yaw) * t;
  const camYaw = yaw - turnBy(was.turn, yaw) * (1 - a), sw = swing > was.swing ? swing : was.swing + (swing - was.swing) * a;
  moved.length = 0;
  for (const list of [creatures, allies, projectiles, boss ? [boss] : []]) for (const c of list) {
    const w = was.at.get(c);
    if (!w || w.step !== steps || !near(w, c)) continue; // new since the last step, or far moved
    moved.push(c, c.x, c.y, c.z, c.yaw);
    c.x = w.x + (c.x - w.x) * a; c.y = w.y + (c.y - w.y) * a; c.z = w.z + (c.z - w.z) * a;
    if (c.yaw !== undefined && w.yaw !== undefined) c.yaw = w.yaw + turnBy(w.yaw, c.yaw) * a;
  }
  return { camYaw, swing: sw };
}
function settle() { for (let i = 0; i < moved.length; i += 5) { const c = moved[i]; c.x = moved[i + 1]; c.y = moved[i + 2]; c.z = moved[i + 3]; c.yaw = moved[i + 4]; } moved.length = 0; }
let steps = 0;

function frame(now) {
  const raw = (now - last) / 1000, dt = Math.min(raw, .1); last = now;
  if (bench) { benchFrame(now, raw, dt); requestAnimationFrame(frame); return; }
  autoScale(raw, dt);
  if (mode === 'playing') { accumulator += dt; while (accumulator >= 1 / 60) { steps++; remember(); update(1 / 60); accumulator -= 1 / 60; } }
  const s = state ?? preview, p = s.player;
  if (!state) yaw = p.yaw + TITLE_VIEW.turn + Math.sin(now / 9000) * .06; // a slow drift
  // Before there is a game the HUD has nothing to show; the controls bar gives way to the menu.
  put('body', 'className', [state ? '' : 'is-fresh', $('#overlay').classList.contains('hidden') ? '' : 'is-menu'].join(' ').trim());
  view.stream(p.x, p.z, mode === 'playing' ? 1 : 4);
  if (state) {
    const k = Math.min(1, dt * 10);
    for (const r of remotes.values()) { r.x += (r.tx - r.x) * k; r.z += (r.tz - r.z) * k; r.y += (r.ty - r.y) * k; if (r.moving) r.walk += dt * 6; }
    for (const c of creatures) if (c.remote) { c.x += (c.tx - c.x) * k; c.z += (c.tz - c.z) * k; c.y += (c.ty - c.y) * k; c.hurt = Math.max(0, c.hurt - dt); }
    const built = allBuildings(), lights = lightSources();
    const live = mode === 'playing' && steps > 0, tween = live ? inBetween(accumulator * 60) : null;
    view.syncRemotes([...remotes.values()], now / 1000);
    view.syncWorld({ creatures, allies, boss, buildings: built, projectiles, elders: elders().filter(e => near(e, p, 300)), now: now / 1000 });
    view.bossDefeated = net.online ? !!serverBoss?.down : state.bossDefeated;
    view.render({ player: live ? drawn : p, yaw: live ? tween.camYaw : yaw, pitch, dayTime: state.dayTime, now: now / 1000, dt, swing: live ? tween.swing : swing, swingKind, toolName: R.weapon(p).name, lights, moving: moving && mode === 'playing', sight: !!p.effects.sight, sprinting: !!p.sprinting, look: lookOf(p), glamour: !!p.effects.glamour, mounted: !!p.mounted, flying: !!p.flying });
    plates(live ? drawn : p);
    if (live) settle();
    put('#hurt', 'className', hurtFlash > 0 ? 'on' : '');
    if (mode === 'pack' && tab === 'items') { portrait ??= new HeroPreview($('#heroCanvas')); portrait.show(p.class, lookOf(p), now / 1000, dt); }
    if ((hudTimer -= dt) <= 0) { hudTimer = .1; hud(); musicMood(); }
  } else view.render({ player: p, yaw, pitch: TITLE_VIEW.pitch, dayTime: TITLE_VIEW.dayTime, now: now / 1000, dt, swing: 0, toolName: 'fists', lights: hearthFires(), moving: false, sight: false });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
