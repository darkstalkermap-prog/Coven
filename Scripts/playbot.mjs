// A witch who plays Coven by herself, loaded into the game page by Scripts/playthrough.mjs.
// She plays only through the game's own inputs (keys, mouse, the pack's buttons) and runs the game fast with
// __coven.step, following the quest line from the elder's first word to the Unwitch. Whatever stops her or
// costs her dearly is written down as a problem.
import { ITEMS, RECIPES, BUILDINGS, SPELLS, CLASSES, BUY, SELL } from '../Browser/data.mjs';
import { NODES, REGIONS, HALF, CHUNK, CROWN, HUMAN_VILLAGE } from '../Browser/world.mjs';
import { BESTIARY, CREATURE, BOSS } from '../Browser/bestiary.mjs';
import { QUESTS, knownSpells, skillLevel, weapon, gainXp, xpToNext, checkQuest } from '../Browser/rules.mjs';

const C = window.__coven, W = C.world, canvas = document.querySelector('#world');
const S = () => C.state, P = () => C.state.player;
const count = id => P().inv[id] ?? 0;
const have = id => count(id) + Object.values(P().equip).filter(e => e === id).length; // carried or worn
const dist = (x, z, o = P()) => Math.hypot(x - o.x, z - o.z);
const REGION_CLASS = { swamp: 'bog', darkforest: 'hex', meadow: 'bloom', forest: 'wild' };
const CLASS_REGION = Object.fromEntries(Object.entries(REGION_CLASS).map(([r, c]) => [c, r]));
const home = () => CLASS_REGION[P().class];

// ---------- the record ----------
const log = [], problems = [], stats = { deaths: 0, stuck: 0, kills: 0, walked: 0, drinks: 0, meals: 0 }, recent = [];
const clock = () => { const t = S().dayTime * 24; return `${String(Math.floor(t)).padStart(2, '0')}:${String(Math.floor(t % 1 * 60)).padStart(2, '0')}`; };
const note = m => log.push(`day ${S().day} ${clock()} · L${P().level} · q${P().quest} · ${m}`);
function problem(text, extra = {}) {
  const p = P();
  problems.push({ quest: p.quest, questTitle: QUESTS[p.quest]?.title ?? 'done', level: p.level, at: [Math.round(p.x), Math.round(p.z)], day: S().day, text, ...extra });
  note(`PROBLEM: ${text}`);
}
let lastThreat = 'nothing';

// ---------- input: the same events a player makes ----------
const held = new Set();
const down = code => { if (!held.has(code)) { held.add(code); dispatchEvent(new KeyboardEvent('keydown', { code })); } };
const up = code => { if (held.delete(code)) dispatchEvent(new KeyboardEvent('keyup', { code })); };
const releaseAll = () => [...held].forEach(up);
const press = code => { up(code); dispatchEvent(new KeyboardEvent('keydown', { code })); dispatchEvent(new KeyboardEvent('keyup', { code })); };
const strike = () => canvas.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
const aimAt = (x, z, pitch = .3) => C.aim(Math.atan2(z - P().z, x - P().x), pitch);
function ensurePlaying() {
  if (C.mode === 'playing') return;
  const close = document.querySelector('.panel:not(.hidden) [data-close]');
  if (close) close.click(); else document.querySelector('#play').click();
  if (C.mode !== 'playing') problem(`could not get back into play from "${C.mode}"`);
}
// Open the pack on a tab, press one of its buttons, close it. Returns whether the button could be pressed.
function ui(tab, selector) {
  ensurePlaying();
  press('Tab');
  document.querySelector(`#tabs [data-tab="${tab}"]`).click();
  const b = document.querySelector(`#tabBody ${selector}`), ok = !!b && !b.disabled;
  if (ok) b.click();
  if (C.mode !== 'playing') ensurePlaying();
  return ok;
}
const spellKey = id => `Digit${(knownSpells(P()).indexOf(id) + 1) % 10}`;
const ready = id => !P().cooldowns[id] && P().mana >= SPELLS[id].mana;

// ---------- time ----------
// The game must keep running, and no quest may take all day: either stops the quest with a note of why.
let stalls = 0, deadline = Infinity;
class Stop extends Error {}
function sim(seconds) {
  ensurePlaying();
  if (performance.now() > deadline) throw new Stop('out of real time for this quest');
  const p0 = P(), before = { hp: p0.hp, food: p0.food, water: p0.water, poison: p0.poison, cold: p0.cold }, clock0 = S().clock;
  C.step(seconds);
  if (S().clock === clock0 && seconds > 0) { if (++stalls > 50) { stalls = 0; throw new Stop(`the game stopped running (mode "${C.mode}", panel ${document.querySelector('.panel:not(.hidden)')?.id ?? 'none'}, overlay ${!document.querySelector('#overlay').classList.contains('hidden')})`); } }
  else stalls = 0;
  for (const m of C.messages.splice(0)) {
    recent.push(m); if (recent.length > 40) recent.shift();
    if (/You have fallen/.test(m)) { stats.deaths++; note(`DIED (hp ${Math.round(before.hp)}, food ${Math.round(before.food)}, water ${Math.round(before.water)}${before.poison > 0 ? ', poisoned' : ''}${before.cold ? ', freezing' : ''}; last threat: ${lastThreat}; ${recent.slice(-6, -1).join(' | ')})`); }
    else if (/^Quest complete|^Level \d|joins your coven|^Discovered|rises to|^Made|^Built|Equipped|summon|Titan|ward|Unwitch|unmade|Sold|Bought|soul/i.test(m)) note(m);
  }
}
const isNight = () => S().dayTime < .23 || S().dayTime > .77;
function waitUntil(fn, max) { let t = 0; while (!fn() && t < max) { upkeep(); sim(1); t++; } return fn(); }

// ---------- needs ----------
let busy = false;
function upkeep() {
  if (busy) return;
  busy = true;
  try {
    const p = P();
    if (p.food < 45) eat();
    if (p.water < 30) drink();
    if (p.hp < p.maxHp * .4 && spareHealing() > 0) use('healing');
  } finally { busy = false; }
}
const FOODS = ['cookedMeat', 'bread', 'honeycomb', 'berries'];
// Eat; with nothing ready, cook meat at a fire (building one if none is near) or forage berries, as a player would.
function eat() {
  const p = P();
  if (FOODS.some(count)) { press('KeyQ'); stats.meals++; return; }
  if (count('rawMeat') && p.food < 35) {
    const fires = [...W.pois.filter(o => o.type === 'hearth'), ...S().buildings.filter(b => b.type === 'campfire')].sort((a, b) => dist(a.x, a.z) - dist(b.x, b.z));
    let fire = fires[0] && dist(fires[0].x, fires[0].z) < 200 ? fires[0] : null;
    if (!fire && count('wood') >= 6 && count('stone') >= 4) { const a = p.yaw; if (placeAt('campfire', p.x + Math.cos(a) * 6, p.z + Math.sin(a) * 6)) fire = S().buildings.at(-1); }
    if (fire) {
      walkTo(fire.x, fire.z, { arrive: 2.5, label: 'a fire' }); dismount();
      press('KeyE'); sim(.2);
      if (count('cookedMeat')) { press('KeyQ'); stats.meals++; return; }
    }
    if (p.food < 15) { press('KeyQ'); stats.meals++; return; } // raw, if it comes to that
  }
  if (p.food < 30) for (let i = 0; i < 8 && !count('berries'); i++) { const bush = nearestNode(['bush'], p.x, p.z, 1); if (!bush || !harvest(bush)) break; }
  if (count('berries')) { press('KeyQ'); stats.meals++; }
}
function use(id) { return ui('items', `[data-use="${id}"]`); }
function findWater(maxR = 900) {
  const p = P();
  const well = S().buildings.find(b => b.type === 'well' && dist(b.x, b.z) < maxR);
  if (well) return { x: well.x, z: well.z, well: true };
  for (let r = 8; r <= maxR; r += 8) {
    const n = Math.max(8, Math.round(r / 4));
    for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2, x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r; if (Math.abs(x) < HALF - 30 && Math.abs(z) < HALF - 30 && W.ground(x, z) < -.2) return { x, z }; }
  }
  return null;
}
let dryUntil = -1;
function drink() {
  const p = P();
  if (count('ale')) { use('ale'); return; }
  if (S().clock < dryUntil) return;
  const w = findWater();
  if (!w) { problem(`no water within 900 m to drink from (water ${Math.round(p.water)})`); dryUntil = S().clock + 120; return; }
  walkTo(w.x, w.z, { arrive: w.well ? 2.5 : 3.5, label: 'water', drinking: true });
  aimAt(w.x, w.z);
  for (let i = 0; i < 6 && P().water < 95; i++) { const before = P().water; press('KeyE'); sim(.3); if (P().water <= before) { if (!w.well) { down('KeyW'); sim(.4); up('KeyW'); } } }
  if (P().water < 60) problem(`could not drink at the water's edge (water ${Math.round(P().water)})`);
  else stats.drinks++;
}

// ---------- moving ----------
function threat(range = 16) {
  const p = P();
  return C.creatures.filter(c => c.hp > 0 && !c.remote && (c.state === 'chase' || c.angry) && CREATURE[c.kind].temper !== 'timid' && dist(c.x, c.z) < range && !(p.flying && p.y > W.ground(p.x, p.z) + 6)).sort((a, b) => dist(a.x, a.z) - dist(b.x, b.z))[0];
}
// Deep water on the straight line to (x, z)? Then go round by a waypoint off to one side.
function wet(x0, z0, x1, z1) { const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 12); let run = 0; for (let i = 1; i < n; i++) { const t = i / n; if (W.ground(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t) < -1.3) { if (++run > 4) return true; } else run = 0; } return false; }
function detour(x, z) {
  const p = P(), d = dist(x, z), a = Math.atan2(z - p.z, x - p.x);
  for (const off of [.5, -.5, .9, -.9, 1.3, -1.3]) {
    const wx = p.x + Math.cos(a + off) * d * .55, wz = p.z + Math.sin(a + off) * d * .55;
    if (W.ground(wx, wz) > 0 && !wet(p.x, p.z, wx, wz) && !wet(wx, wz, x, z)) return { x: wx, z: wz };
  }
  return null;
}
// Long trips go round the Crown's mountains and keep clear of the elites' lairs, as a sensible player would.
const LAIRS = W.pois.filter(o => o.type === 'lair');
function passes(x0, z0, x1, z1, px, pz) { const dx = x1 - x0, dz = z1 - z0, t = Math.max(0, Math.min(1, ((px - x0) * dx + (pz - z0) * dz) / (dx * dx + dz * dz || 1))); return Math.hypot(x0 + dx * t - px, z0 + dz * t - pz); }
function waypoint(x, z) {
  const p = P();
  if (Math.hypot(x, z) > 700 && Math.hypot(p.x, p.z) > 700 && passes(p.x, p.z, x, z, 0, 0) < 800) {
    let a0 = Math.atan2(p.z, p.x), a1 = Math.atan2(z, x), da = ((a1 - a0 + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    const a = a0 + da / 2, r = 1150;
    return { x: Math.cos(a) * r, z: Math.sin(a) * r };
  }
  // Lairs (their elites) and human villages (their walls and hunters) are passed at a distance.
  for (const [list, r] of [[LAIRS, 260], [C.humanVillages, 110]]) {
    const o = list.find(l => Math.hypot(l.x - x, l.z - z) > r && Math.hypot(l.x - p.x, l.z - p.z) > r && passes(p.x, p.z, x, z, l.x, l.z) < r);
    if (o) { const a = Math.atan2(o.z, o.x); return { x: o.x + Math.cos(a) * (r + 120), z: o.z + Math.sin(a) * (r + 120) }; }
  }
  return null;
}
function walkTo(x, z, { arrive = 2.5, maxTime, fight = true, ride = true, label = '', drinking = false, direct = false } = {}) {
  const p = P(), canFly = () => p.equip.mount === 'skyBroom';
  if (!direct && dist(x, z) > 300) for (let k = 0, w; k < 3 && (w = waypoint(x, z)); k++) walkTo(w.x, w.z, { arrive: 25, fight, ride, label: `on the way to ${label}`, direct: true });
  if (!canFly() && !drinking && wet(p.x, p.z, x, z)) { const w = detour(x, z); if (w) walkTo(w.x, w.z, { arrive: 15, fight, ride, label: `round the water to ${label}`, direct: true }); }
  let d = dist(x, z), t = 0, check = { t: 0, d }, stuck = 0;
  maxTime ??= 90 + d / 2.5;
  while (d > arrive && t < maxTime) {
    if (!drinking) upkeep();
    const c = fight && threat();
    if (c && CREATURE[c.kind].level > P().level + 4 && !c.hurt) { releaseAll(); flee(c); continue; }
    if (c) { releaseAll(); fightCreature(c); continue; }
    const swimming = W.ground(p.x, p.z) < -1.3 && !p.mounted;
    if (ride && !p.mounted && p.equip.mount && d > 30 && !swimming) press('KeyF');
    if (p.mounted && d < Math.max(arrive, 6)) { up('Space'); if (!p.flying || p.y < W.ground(p.x, p.z) + 2) press('KeyF'); }
    if (p.mounted && canFly()) {
      const above = p.y - Math.max(W.ground(p.x, p.z), 0);
      if (d > 60 && above < 25) down('Space'); else up('Space');
      if (d < 50 && p.flying) down('KeyX'); else up('KeyX');
    }
    aimAt(x, z);
    down('KeyW');
    if (!p.mounted && p.stamina > 35 && d > 12) down('ShiftLeft'); else up('ShiftLeft');
    const x0 = p.x, z0 = p.z;
    sim(.25); t += .25;
    stats.walked += Math.hypot(p.x - x0, p.z - z0);
    d = dist(x, z);
    if (t - check.t >= 3) {
      if (check.d - d < 2.5) {
        stuck++; stats.stuck++;
        // Jump and sidestep round whatever is in the way.
        const side = stuck % 2 ? 'KeyA' : 'KeyD';
        down('Space'); down(side); sim(.2); up('Space'); sim(stuck > 3 ? 2 : 1); up(side);
        if (stuck > 5) { const a = Math.random() * 6.28; walkTo(p.x + Math.cos(a) * 15, p.z + Math.sin(a) * 15, { arrive: 3, maxTime: 12, fight, ride: false, label: 'unstick' }); }
      }
      check = { t, d };
      if (stuck > 14) { problem(`stuck walking to ${label || 'a spot'} (${Math.round(x)}, ${Math.round(z)}), ${Math.round(d)} m short`); break; }
    }
  }
  releaseAll();
  if (d > arrive && t >= maxTime && !['unstick', 'roaming', 'fleeing'].includes(label) && maxTime > 25) problem(`took too long to reach ${label || 'a spot'} (${Math.round(d)} m left after ${Math.round(t)} s)`);
  return d <= arrive;
}
function dismount() { if (P().mounted) { press('KeyF'); sim(.1); if (P().y > W.ground(P().x, P().z) + 3) sim(3); } }

// ---------- fighting ----------
function heal() {
  const p = P(), spells = CLASSES[p.class].spells;
  for (const id of spells) if (SPELLS[id].kind === 'self' && ready(id)) { press(spellKey(id)); return true; }
  if (spareHealing() > 0) { use('healing'); return true; }
  return false;
}
// A Healing Draught meant as the Bloom elder's gift is not for drinking.
const spareHealing = () => count('healing') - (P().coven.length < 3 && !P().coven.includes('bloom') && P().class !== 'bloom' && nextSister() === 'bloom' ? 1 : 0);
function fightCreature(c, maxTime = 75, cornered = false) {
  // Fallen at the very end of a step: let the game run on so she wakes at home, or every loop that
  // calls this would spin without the game moving.
  if (P().hp <= 0) { sim(.1); return false; }
  dismount();
  lastThreat = `${CREATURE[c.kind]?.name ?? 'the Unwitch'} (level ${CREATURE[c.kind]?.level ?? 15})`;
  const p = P(), [main, second] = CLASSES[p.class].spells, size = c === C.boss ? BOSS.size : CREATURE[c.kind].size;
  let t = 0;
  const alive = () => c.hp > 0 && (c === C.boss || C.creatures.includes(c));
  while (alive() && t < maxTime && p.hp > 0) {
    const d = dist(c.x, c.z), reach = weapon(p).reach + 1 + size * .6;
    if (p.hp < p.maxHp * .45) heal();
    if (p.hp < p.maxHp * .18 && spareHealing() <= 0 && !cornered) { flee(c); return false; }
    upkeep();
    aimAt(c.x, c.z, .15);
    if (SPELLS[second].kind !== 'self' && ready(second) && d < 30) press(spellKey(second));
    else if (ready(main) && d < 32) press(spellKey(main));
    else if (d < reach) strike();
    if (d > (P().mana >= SPELLS[main].mana ? 26 : reach * .8)) down('KeyW'); else up('KeyW');
    sim(.15); t += .15;
  }
  up('KeyW');
  if (c.hp <= 0) stats.kills++;
  return c.hp <= 0;
}
function flee(c) {
  note(`fleeing ${CREATURE[c.kind]?.name} at ${Math.round(P().hp)} hp`);
  for (let k = 0; k < 4 && c.hp > 0 && dist(c.x, c.z) < 45; k++) {
    const a = Math.atan2(P().z - c.z, P().x - c.x);
    walkTo(P().x + Math.cos(a) * 60, P().z + Math.sin(a) * 60, { arrive: 5, maxTime: 15, fight: false, direct: true, label: 'fleeing' });
  }
  if (c.hp > 0 && dist(c.x, c.z) < 12) { fightCreature(c, 40, true); return; } // cornered
  waitUntil(() => P().hp > P().maxHp * .7 || !!threat(14), 90);
}

// ---------- finding things ----------
const scatterCache = new Map();
function nodesIn(cx, cz) { const k = `${cx},${cz}`; if (!scatterCache.has(k)) scatterCache.set(k, W.scatter(cx, cz)); return scatterCache.get(k); }
const nodeTypesFor = item => Object.entries(NODES).filter(([t, n]) => n.herb ? t === item : n.yields === item).map(([t]) => t);
// The nearest unharvested node of `types` within `chunks` chunks of (x, z).
function nearestNode(types, x = P().x, z = P().z, chunks = 3, filter = () => true) {
  const cx0 = Math.floor(x / CHUNK), cz0 = Math.floor(z / CHUNK), max = HALF / CHUNK;
  let best = null, bd = Infinity;
  for (let dz = -chunks; dz <= chunks; dz++) for (let dx = -chunks; dx <= chunks; dx++) {
    const cx = cx0 + dx, cz = cz0 + dz;
    if (cx < -max || cz < -max || cx >= max || cz >= max) continue;
    for (const n of nodesIn(cx, cz)) {
      if (!types.includes(n.type) || S().harvested[n.id] || !filter(n)) continue;
      const d = Math.hypot(n.x - x, n.z - z);
      if (d < bd) { bd = d; best = n; }
    }
  }
  return best;
}
// Strike a node until it is used up. Returns what it gave.
function harvest(n) {
  if (!walkTo(n.x, n.z, { arrive: 1.6 + Math.max(.6, NODES[n.type].radius) * n.s, label: n.type })) return false;
  dismount();
  const before = { ...P().inv };
  for (let i = 0; i < 20 && !S().harvested[n.id]; i++) {
    aimAt(n.x, n.z, .4); strike(); sim(.6);
    if (threat(10)) { fightCreature(threat(10)); if (!walkTo(n.x, n.z, { arrive: 2, label: n.type })) return false; }
    if (/Equip a pick/.test(recent.at(-1) ?? '')) return false;
  }
  return Object.keys(P().inv).some(k => (P().inv[k] ?? 0) > (before[k] ?? 0));
}
// Gather `item` from the land until `n` are carried.
function gather(item, n, budget = 900) {
  const types = nodeTypesFor(item), herbRegion = ITEMS[item]?.herb, t0 = S().clock;
  let misses = 0;
  while (count(item) < n && S().clock - t0 < budget) {
    let node = nearestNode(types, P().x, P().z, 2);
    if (!node && herbRegion) { const h = W.hearthOf(herbRegion); node = nearestNode(types, h.x, h.z, 3); }
    if (!node && item === 'moonstone') node = nearestNode(types, 0, 0, 6, o => Math.hypot(o.x, o.z) > 150);
    if (!node) node = nearestNode(types, P().x, P().z, 6);
    if (!node) { problem(`found no ${item} anywhere near`); return false; }
    if (!harvest(node)) { if (++misses > 6) { problem(`could not harvest ${item} (${node.type})`); return false; } }
  }
  if (count(item) < n) problem(`gathering ${n} ${item} took longer than ${budget} s (have ${count(item)})`);
  return count(item) >= n;
}

// ---------- hunting ----------
// A place in `region` where creatures of about `level` roam: along the line from its hearth to the Crown.
function huntingGround(region, level) {
  const h = W.hearthOf(region);
  let best = h, bd = Infinity;
  for (let t = 0; t <= 1; t += .02) {
    const x = h.x * (1 - t * .95), z = h.z * (1 - t * .95), d = Math.abs(W.danger(x, z) - level);
    if (W.ground(x, z) > 1 && d < bd && !C.humanVillages.some(v => Math.hypot(v.x - x, v.z - z) < 120) && !LAIRS.some(l => Math.hypot(l.x - x, l.z - z) < 300)) { bd = d; best = { x, z }; }
  }
  return best;
}
// Hunt creatures of `kinds` until `done()`; wanders their grounds while none are about.
function hunt(kinds, done, { budget = 1500, label = kinds.join('/'), at } = {}) {
  const t0 = S().clock, b = BESTIARY.filter(o => kinds.includes(o.id));
  const region = b[0]?.region, level = Math.min(...b.map(o => o.level));
  const ground = at ?? huntingGround(region, level);
  let deathsAtStart = stats.deaths;
  while (!done() && S().clock - t0 < budget) {
    if (b.every(o => o.night) && !isNight()) { if (dist(ground.x, ground.z) > 60) walkTo(ground.x, ground.z, { arrive: 20, label: `${label} grounds` }); waitUntil(isNight, 900); continue; }
    const prey = C.creatures.filter(c => kinds.includes(c.kind) && c.hp > 0 && !c.remote && dist(c.x, c.z) < 260).sort((a, z) => dist(a.x, a.z) - dist(z.x, z.z))[0];
    if (prey) {
      const d = dist(prey.x, prey.z), strong = CREATURE[prey.kind].elite || CREATURE[prey.kind].level > P().level + 2;
      // A strong foe is met rested; one that has already beaten us waits until we have grown.
      if (strong && P().hp < P().maxHp * .9 && d > 40) { waitUntil(() => P().hp > P().maxHp * .95 && P().mana > P().maxMana * .9 || !!threat(20), 240); continue; }
      if (strong && stats.deaths > deathsAtStart) { note(`beaten by ${CREATURE[prey.kind].name}; growing stronger first`); grind(P().level + 1); deathsAtStart = stats.deaths; continue; }
      if (d > 28) { walkTo(prey.x, prey.z, { arrive: 24, maxTime: 30, label: CREATURE[prey.kind].name }); continue; }
      const shield = CLASSES[P().class].spells.find(id => SPELLS[id].kind === 'self');
      if (strong && shield && ready(shield)) press(spellKey(shield));
      fightCreature(prey);
      continue;
    }
    if (dist(ground.x, ground.z) > 90) { walkTo(ground.x, ground.z, { arrive: 20, label: `${label} grounds` }); continue; }
    const a = Math.random() * 6.28;
    walkTo(ground.x + Math.cos(a) * 70, ground.z + Math.sin(a) * 70, { arrive: 8, maxTime: 40, label: 'roaming' });
  }
  if (!done()) problem(`hunting ${label} took longer than ${budget} s`);
  return done();
}
// Any creature that is a fair fight, for experience.
function grind(level) {
  const t0 = S().clock;
  while (P().level < level && S().clock - t0 < 4000) {
    const lv = Math.max(1, Math.min(P().level, 9));
    const kinds = BESTIARY.filter(b => !b.elite && b.temper !== 'timid' && b.level <= lv + 1 && b.level >= lv - 3).map(b => b.id);
    const local = kinds.filter(k => CREATURE[k].region === home());
    hunt(local.length ? local : kinds, () => P().level >= level, { budget: 600, label: `level ${level}` });
  }
  if (P().level < level) problem(`reaching level ${level} took more than an hour of play`);
  return P().level >= level;
}

// ---------- making things ----------
const SOURCES = {}; // item → creatures that drop it
for (const b of BESTIARY) for (const id of Object.keys(b.loot)) (SOURCES[id] ??= []).push(b.id);
// Get `n` of `item` by gathering, crafting, hunting or buying, whatever it takes.
function obtain(item, n = 1, depth = 0) {
  if (have(item) >= n) return true;
  if (depth > 5) { problem(`no way found to get ${item}`); return false; }
  const recipe = RECIPES.find(r => r.id === item);
  if (recipe) {
    for (let guard = 0; have(item) < n && guard < 6; guard++) {
      const batches = Math.ceil((n - have(item)) / (recipe.makes ?? 1));
      for (const [id, k] of Object.entries(recipe.needs)) if (!obtain(id, k * batches, depth + 1)) return false;
      while (have(item) < n && Object.entries(recipe.needs).every(([id, k]) => count(id) >= k)) if (!craft(item)) return false;
    }
    return have(item) >= n;
  }
  if (nodeTypesFor(item).length && (gather(item, n, SOURCES[item] ? 600 : 900) || !SOURCES[item])) return count(item) >= n;
  if (SOURCES[item]) {
    const kinds = SOURCES[item].filter(k => !CREATURE[k].elite).sort((a, b) => CREATURE[a].level - CREATURE[b].level);
    const pick = kinds.filter(k => CREATURE[k].level <= P().level + 2);
    return hunt((pick.length ? pick : kinds).slice(0, 3), () => count(item) >= n, { label: `${item} from ${(pick.length ? pick : kinds).slice(0, 3).join('/')}` });
  }
  if (BUY[item]) return buy(item, n);
  problem(`no source for ${item}`);
  return false;
}
function craft(id) {
  const recipe = RECIPES.find(r => r.id === id);
  if (recipe.station) {
    const st = S().buildings.find(b => b.type === recipe.station);
    if (!st) { if (!build(recipe.station)) return false; return craft(id); }
    walkTo(st.x, st.z, { arrive: 4, label: recipe.station });
  }
  const before = have(id);
  if (!ui(recipe.station ? 'alchemy' : 'craft', `[data-craft="${id}"]`)) { problem(`the ${id} recipe button was disabled with materials in hand`); return false; }
  const after = have(id);
  if (after <= before) { problem(`crafting ${id} made nothing`); return false; }
  return true;
}

// ---------- the village ----------
let site = null;
function villageSite() {
  if (site) return site;
  const h = W.hearthOf(home());
  for (let r = 30; r <= 90 && !site; r += 10) for (let a = 0; a < 6.28 && !site; a += .4) {
    const x = h.x + Math.cos(a) * r, z = h.z + Math.sin(a) * r;
    let ok = true;
    for (let k = 0; k < 8 && ok; k++) { const b = k / 8 * 6.28; if (W.ground(x + Math.cos(b) * 25, z + Math.sin(b) * 25) < 1.2) ok = false; }
    if (ok) site = { x, z };
  }
  if (!site) { problem('no dry ground for a village near the hearth'); site = { x: h.x + 25, z: h.z }; }
  return site;
}
const SPOTS = { heart: [0, 0], cauldron: [9, 0], campfire: [-9, 0], well: [0, 10], altar: [0, -12], hut: [14, 14], garden: [-14, 14], totem: [-14, -14] };
let palisades = 0;
function build(type) {
  const b = BUILDINGS[type];
  for (const [id, k] of Object.entries(b.needs)) if (!obtain(id, k)) return false;
  while (skillLevel(P(), 'building') < b.skill) {
    // Practise on palisades round the village until the craft is good enough.
    if (!obtain('wood', 6)) return false;
    const a = palisades++ * .45, s = villageSite();
    if (!placeAt('palisade', s.x + Math.cos(a) * 26, s.z + Math.sin(a) * 26)) return false;
    for (const [id, k] of Object.entries(b.needs)) if (!obtain(id, k)) return false;
  }
  const s = villageSite(), [ox, oz] = SPOTS[type] ?? [Math.random() * 30 - 15, Math.random() * 30 - 15];
  return placeAt(type, s.x + ox, s.z + oz);
}
// Stand 5 m short of (x, z), facing it, and build there through the pack.
function placeAt(type, x, z) {
  const p = P(), a = Math.atan2(z - p.z, x - p.x);
  walkTo(x - Math.cos(a) * 5, z - Math.sin(a) * 5, { arrive: 1.5, label: `${type} site` });
  dismount();
  aimAt(x, z, .3); strike(); sim(.6);
  const before = S().buildings.length;
  if (!ui('build', `[data-build="${type}"]`)) { problem(`could not build a ${type}: ${document.querySelector(`#tabBody [data-build="${type}"]`)?.closest('li')?.textContent.trim().slice(0, 120)}`); return false; }
  if (S().buildings.length === before) { problem(`building a ${type} did nothing (${recent.at(-1)})`); return false; }
  return true;
}

// ---------- people ----------
function talk(x, z, label) { walkTo(x, z, { arrive: 3, label }); dismount(); aimAt(x, z); press('KeyE'); sim(.5); }
const elderOf = cls => { const h = W.hearthOf(CLASS_REGION[cls]); return { x: h.x + 3, z: h.z + 3 }; };
function nearestVillage() { return C.humanVillages.slice().sort((a, b) => dist(a.x, a.z) - dist(b.x, b.z))[0]; }
const nearestGate = v => v.layout.gates.slice().sort((a, b) => dist(v.x + Math.cos(a.angle) * 40, v.z + Math.sin(a.angle) * 40) - dist(v.x + Math.cos(b.angle) * 40, v.z + Math.sin(b.angle) * 40))[0];
// Back out through the nearest gate before the glamour fades.
function leaveVillage(v) {
  if (dist(v.x, v.z) > HUMAN_VILLAGE.radius + 5) return;
  const g = nearestGate(v);
  walkTo(v.x + Math.cos(g.angle) * 30, v.z + Math.sin(g.angle) * 30, { arrive: 4, fight: false, label: `${v.name} gate`, direct: true });
  walkTo(v.x + Math.cos(g.angle) * 70, v.z + Math.sin(g.angle) * 70, { arrive: 6, label: `out of ${v.name}`, direct: true });
}
// Into a human village in a borrowed face, through a gate, to the market stall.
function enterVillage(v) {
  const gate = v.layout.gates.slice().sort((a, b) => dist(v.x + Math.cos(a.angle) * 50, v.z + Math.sin(a.angle) * 50) - dist(v.x + Math.cos(b.angle) * 50, v.z + Math.sin(b.angle) * 50))[0];
  const out = { x: v.x + Math.cos(gate.angle) * 62, z: v.z + Math.sin(gate.angle) * 62 };
  walkTo(out.x, out.z, { arrive: 4, label: `${v.name} gate` });
  dismount();
  if (C.villageState.get(v.id).alarm > 0) { note(`${v.name} is on guard; waiting`); waitUntil(() => C.villageState.get(v.id).alarm <= 0, 400); }
  if (!obtain('glamourDust', 1)) return false;
  walkTo(out.x, out.z, { arrive: 4, label: `${v.name} gate` }); dismount();
  waitUntil(() => ready('glamour'), 30);
  press(spellKey('glamour')); sim(.3);
  if (!P().effects.glamour) { problem(`glamour failed: ${recent.at(-1)}`); return false; }
  walkTo(v.x + Math.cos(gate.angle) * 30, v.z + Math.sin(gate.angle) * 30, { arrive: 4, fight: false, label: `inside ${v.name}` });
  const st = v.layout.stall;
  walkTo(st.x, st.z, { arrive: 3.5, fight: false, label: `${v.name} market` });
  return !!P().effects.glamour;
}
function trade(v, sell = [], buyList = []) {
  if (!enterVillage(v)) return false;
  const merchant = C.creatures.find(c => c.kind === 'merchant' && c.village === v.id);
  if (!merchant) { problem(`no merchant at ${v.name}`); return false; }
  walkTo(merchant.x, merchant.z, { arrive: 3, fight: false, label: 'merchant' });
  aimAt(merchant.x, merchant.z); press('KeyE');
  if (C.mode !== 'pack') { problem(`the merchant would not trade: ${recent.at(-1)}`); return false; }
  let done = 0;
  for (const [id, k] of sell) for (let i = 0; i < k && count(id); i++) { const b = document.querySelector(`#tabBody [data-sell="${id}"]`); if (!b) break; b.click(); done++; }
  for (const [id, k] of buyList) for (let i = 0; i < k; i++) { const b = document.querySelector(`#tabBody [data-buy="${id}"]`); if (!b || b.disabled) break; b.click(); done++; }
  ensurePlaying();
  leaveVillage(v);
  return done > 0;
}
function buy(item, n) {
  const v = nearestVillage(), price = BUY[item] * (n - count(item));
  const goods = Object.keys(P().inv).filter(id => SELL[id] && !['healing', 'glamourDust', 'covenInk', 'moonDust'].includes(id));
  if (goods.reduce((s, id) => s + SELL[id] * count(id), 0) + count('silver') < price) obtain('hide', Math.ceil(price / 3));
  return trade(v, goods.concat('hide').map(id => [id, count(id)]), [[item, n - count(item)]]) && count(item) >= n;
}

// ---------- the quests ----------
const giftOf = cls => CLASSES[cls].gift;
// The sister whose gift is quickest to make, among those not yet sworn.
function nextSister() {
  const p = P(), left = Object.keys(CLASSES).filter(c => c !== p.class && !p.coven.includes(c));
  const cost = c => { const r = RECIPES.find(o => o.id === giftOf(c)); return Object.keys(r.needs).filter(id => !(ITEMS[id]?.herb === home())).length * 10 + dist(elderOf(c).x, elderOf(c).z) / 300; };
  return left.sort((a, b) => cost(a) - cost(b))[0];
}
function recruit() {
  const cls = nextSister();
  if (!obtain(giftOf(cls), 1)) return false;
  const e = elderOf(cls);
  talk(e.x, e.z, CLASSES[cls].elder);
  if (!P().coven.includes(cls)) { problem(`${CLASSES[cls].elder} would not join: ${recent.at(-1)}`); return false; }
  return true;
}
function potionForCauldronQuest() {
  const brews = RECIPES.filter(r => r.station === 'cauldron');
  const local = r => Object.keys(r.needs).every(id => ITEMS[id]?.herb === home());
  const choice = brews.find(local);
  if (!choice) problem(`no potion can be brewed from ${REGIONS[home()].name} herbs alone: the first potion needs a trip`);
  return choice ?? brews.slice().sort((a, b) => Object.keys(a.needs).filter(id => !SOURCES[id]).length - Object.keys(b.needs).filter(id => !SOURCES[id]).length)[0];
}
function fightBoss() {
  walkTo(CROWN.x + 40, CROWN.z + 40, { arrive: 10, label: 'the Crown' });
  waitUntil(() => !!C.boss, 30);
  const boss = C.boss;
  if (!boss) { problem('the Unwitch did not appear at the Crown'); return false; }
  note(`the Unwitch: ${boss.hp} hp; carrying ${count('heartSigil')} sigils, ${count('humanSoul')} souls, ${count('healing')} healing draughts`);
  let t = 0, titan = false, rites = 0, lowest = boss.hp;
  const deaths = stats.deaths;
  const t0 = S().clock;
  while (boss.hp > 0 && S().clock - t0 < 900 && !S().bossDefeated && stats.deaths === deaths) {
    const d = dist(boss.x, boss.z);
    if (P().hp < P().maxHp * .45) heal();
    const near = threat(8);
    if (near && near !== boss && near.hp > 0 && C.creatures.includes(near) && dist(near.x, near.z) < 6) { fightCreature(near, 12, true); continue; }
    aimAt(boss.x, boss.z, .1);
    // Break the ward first, then raise the Titan into the opening; save mana for both.
    if (boss.warded && d < 30 && ready('grandrite') && count('heartSigil') > (titan || count('humanSoul') < 3 ? 0 : 1)) { press(spellKey('grandrite')); rites++; sim(.3); continue; }
    if (!titan && !boss.warded && d < 30 && count('humanSoul') >= 3 && count('heartSigil') && ready('titan')) { press(spellKey('titan')); titan = true; sim(.3); note('the Wyrd Titan rises against the Unwitch'); continue; }
    const saving = !titan && count('humanSoul') >= 3 && P().mana < SPELLS.titan.mana + (boss.warded ? SPELLS.grandrite.mana : 0);
    if (boss.warded && !count('heartSigil')) { note(`out of Heartfire Sigils with the ward up; the Unwitch has ${Math.round(boss.hp)} hp`); break; }
    const main = CLASSES[P().class].spells[0];
    if (ready(main) && d < 32 && !saving) press(spellKey(main)); else if (d < 6) strike();
    if (d > 22) down('KeyW'); else up('KeyW');
    sim(.2); t += .2; lowest = Math.min(lowest, boss.hp);
  }
  up('KeyW');
  note(`boss fight over: Unwitch at ${Math.round(Math.max(0, boss.hp))} hp (lowest ${Math.round(lowest)}), ${rites} rites, titan ${titan}, witch at ${Math.round(P().hp)} hp`);
  return !!S().bossDefeated || boss.hp <= 0;
}

// Into a village in a borrowed face, then take souls from its people into empty jars.
function harvestSouls(n) {
  if (count('humanSoul') >= n) return true;
  obtain('soulJar', n - count('humanSoul'));
  const v = nearestVillage();
  if (!enterVillage(v)) return false;
  for (let k = 0; k < 40 && count('humanSoul') < n && count('soulJar'); k++) {
    const c = C.creatures.filter(o => o.village === v.id && o.hp > 0 && (o.kind === 'villager' || o.kind === 'hunter')).sort((a, b) => dist(a.x, a.z) - dist(b.x, b.z))[0];
    if (!c) { sim(5); continue; }
    walkTo(c.x, c.z, { arrive: 20, maxTime: 20, fight: false });
    fightCreature(c, 30);
  }
  leaveVillage(v);
  return count('humanSoul') >= n;
}

function crown() {
  // Ready for the Crown: three sigils (a Titan and two rites), three souls for the Titan, and draughts.
  obtain('heartSigil', 3); obtain('soulJar', 3);
  harvestSouls(3);
  obtain('healing', 5);
  // The Crown is cold at night: a cloak, and a full store of mana before the fight.
  if (!P().equip.cloak) { obtain('cloak', 1); if (count('cloak')) ui('items', '[data-equip="cloak"]'); }
  waitUntil(() => P().mana >= P().maxMana * .95, 120);
  return fightBoss();
}

const QUEST_STEPS = [
  () => { const e = elderOf(P().class); talk(e.x, e.z, 'your elder'); },
  () => { gather('wood', 10); gather('stone', 10); const herbs = Object.keys(ITEMS).filter(id => ITEMS[id].herb === home()); for (let i = 0; (P().stats.gathered.herbs ?? 0) < 6 && i < 12; i++) gather(herbs[i % 3], count(herbs[i % 3]) + 2); },
  () => obtain('hatchet', 1),
  () => build('heart'),
  () => { if (!S().buildings.some(b => b.type === 'cauldron')) build('cauldron'); const r = potionForCauldronQuest(); obtain(r.id, count(r.id) + 1); },
  () => { const spare = Object.keys(P().inv).filter(id => SELL[id] && !['healing', 'glamourDust'].includes(id)); if (!spare.length) obtain('feather', count('feather') + 1); trade(nearestVillage(), (spare.length ? spare : ['feather']).slice(0, 1).map(id => [id, 1])); },
  () => { grind(3); recruit(); },
  () => { obtain('covenInk', 1); waitUntil(() => ready('binding'), 30); press(spellKey('binding')); sim(.5); },
  () => { grind(6); recruit(); },
  () => { if (!Object.values(P().equip).includes('pick') && !count('pick')) obtain('pick', 1); if (count('pick')) ui('items', '[data-equip="pick"]'); if (!S().buildings.some(b => b.type === 'altar')) build('altar'); obtain('moonDust', count('moonDust') + 1); },
  () => { grind(9); recruit(); },
  () => { const lair = W.pois.find(o => o.type === 'lair' && o.region === home()), elite = BESTIARY.find(b => b.elite && b.region === home()); hunt([elite.id], () => P().stats.eliteKills > 0, { budget: 4000, label: elite.name, at: { x: lair.x + 30, z: lair.z + 30 } }); },
  () => harvestSouls(3),
  // The Titan is summoned at the Crown, against the Unwitch; the same fight finishes the Grand Rite.
  () => crown(),
  () => crown(),
];

// Play quest `i`, giving it up to `budget` seconds of game time per try.
export function playQuest(i, tries = 2) {
  const t0 = S().clock, q = QUESTS[i];
  if (P().quest > i) return { quest: i, title: q.title, done: true, minutes: 0, level: P().level, already: true };
  if (P().quest < i) { problem(`"${q.title}" came up while "${QUESTS[P().quest].title}" was still open`); return { quest: i, title: q.title, done: false, minutes: 0, level: P().level }; }
  note(`— begin "${q.title}"`);
  for (let k = 0; k < tries && P().quest === i; k++) {
    deadline = performance.now() + 8 * 60 * 1000;
    try { QUEST_STEPS[i](); } catch (e) { problem(e instanceof Stop ? e.message : `the bot crashed: ${e.message}`, e instanceof Stop ? {} : { stack: e.stack?.split('\n').slice(0, 3).join(' / ') }); }
    deadline = Infinity;
    sim(1);
  }
  releaseAll();
  const done = P().quest > i;
  const minutes = Math.round((S().clock - t0) / 6) / 10;
  note(`— ${done ? 'finished' : 'FAILED'} "${q.title}" after ${minutes} minutes of play`);
  return { quest: i, title: q.title, done, minutes, level: P().level };
}
// Help the witch past a quest she could not finish, so the rest can still be played. Written down as a problem.
export function assist(i) {
  const p = P(), q = QUESTS[i];
  const gifts = {
    1: () => Object.assign(p.stats.gathered, { wood: 10, stone: 10, herbs: 6 }), 2: () => { p.stats.crafted.hatchet = 1; },
    3: () => { p.stats.built.heart = 1; }, 4: () => { p.stats.built.cauldron = 1; p.stats.brewed = 1; }, 5: () => { p.stats.trades = 1; },
    11: () => { p.stats.eliteKills = 1; p.inv.heartfire = (p.inv.heartfire ?? 0) + 1; }, 12: () => { p.stats.souls = 3; p.inv.humanSoul = 3; },
  };
  (gifts[i] ?? (() => { if (q.title.includes('Sister') || q.title.includes('Hearth') || q.title.includes('Coven')) { const lv = [3, 6, 9][p.coven.length]; while (p.level < lv) gainXp(p, xpToNext(p.level)); p.coven.push(nextSister()); } else if (i === 7) p.stats.covenCasts = 1; else if (i === 9) p.stats.crafted.moonDust = 1; else if (i === 13) p.stats.titans = 1; else if (i === 14) p.stats.boss = 1; }))();
  // The game checks quests on its own events; check now so the next quest opens.
  while (checkQuest(p)) { /* advance */ }
  sim(.1);
  problems.push({ quest: i, questTitle: q.title, assisted: true, text: `the bot was helped past "${q.title}"` });
  note(`ASSISTED past "${q.title}"`);
}
export const report = () => ({ log: log.splice(0), problems, stats: { ...stats, level: P().level, quest: P().quest, day: S().day, clock: Math.round(S().clock), coven: P().coven.slice(), inv: { ...P().inv }, equip: { ...P().equip } } });
window.bot = { playQuest, assist, report, fightBoss, walkTo, QUESTS: QUESTS.map(q => q.title) };
