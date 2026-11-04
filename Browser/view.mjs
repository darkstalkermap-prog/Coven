// Low-cost rendering: flat-shaded blocks, no shadows, short view distance, except for the witch heroes
// (hero.mjs), who are fully detailed.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CHUNK, HALF, NODES } from './world.mjs';
import { CREATURE, BOSS } from './bestiary.mjs';
import { CLASSES } from './data.mjs';
import { ALLIES } from './creatures.mjs';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Hero, HeroKit } from './hero.mjs';
import { decodeLook } from './loot.mjs';
import { Sky } from './sky.mjs';
import { QUALITY, STEP_DOWN, WORLD, flatLambert, shareWorld, waterMaterial, Grass, Beacon, SkyLight, Post } from './graphics.mjs';
export { QUALITY };

// What coven sisters and elders wear (slot → [kind, rarity]).
const SISTER_LOOK = { head: ['hat', 2], chest: ['robe', 2], cloak: ['cloak', 2], feet: ['boots', 1], weapon: ['staff', 2] };
// Quest givers wear their path's revealing style: little but a crown, an amulet and a great staff.
const ELDER_LOOK = { head: ['hat', 3], amulet: ['amulet', 3], weapon: ['staff', 3] };

const MAX_CHUNK = HALF / CHUNK;
const DAY = new THREE.Color('#9cc1d6');

function painted(geometry, color, x = 0, y = 0, z = 0) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  g.translate(x, y, z);
  const c = new THREE.Color(color), n = g.attributes.position.count, colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) colors.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.deleteAttribute('uv');
  g.computeVertexNormals(); // face normals: the geometry is unindexed
  return g;
}

// Resource node models, kept to as few triangles as they can be: thousands are drawn at once.
// Trunks and cones are open-ended because their caps are always buried or hidden inside the leaves.
// `style` 'full' (Medium and up) gives trees tiers, clustered crowns and branches, weathered rocks and faces
// that vary a little in shade, still low-poly; 'simple' (Low) keeps the plainest shapes.
function nodeGeometries(style = 'simple') {
  if (style === 'full') return fullNodeGeometries();
  const trunk = (h, r0, r1, color) => painted(new THREE.CylinderGeometry(r0, r1, h, 4, 1, true), color, 0, h / 2, 0);
  const tree = (bark, crown, crownGeo, h = 3) => mergeGeometries([trunk(h, .25, .35, bark), painted(crownGeo, crown, 0, h + 1.6, 0)]);
  const g = {
    pine: tree('#5a3f2a', '#24452c', new THREE.ConeGeometry(2, 5.5, 6, 1, true)),
    oak: tree('#5c4430', '#3f6b2f', new THREE.IcosahedronGeometry(2.5, 0)),
    gloomtree: tree('#2a2026', '#2c2238', new THREE.ConeGeometry(2.2, 6.5, 5, 1, true), 3.5),
    blossom: tree('#6a4a3a', '#e7a3c4', new THREE.IcosahedronGeometry(2.2, 0)),
    deadtree: mergeGeometries([trunk(4.5, .12, .3, '#4a4238'), painted(new THREE.BoxGeometry(1.8, .16, .16), '#4a4238', .7, 3.2, 0)]),
    rock: painted(new THREE.DodecahedronGeometry(1.5, 0).scale(1, .65, 1.1), '#7a7a74', 0, .4, 0),
    moonstone: mergeGeometries([painted(new THREE.DodecahedronGeometry(1.1, 0).scale(1, .6, 1), '#6a6a72', 0, .3, 0), painted(new THREE.OctahedronGeometry(.5, 0).scale(1, 2, 1), '#9fe8ff', .2, 1.1, 0), painted(new THREE.OctahedronGeometry(.35, 0).scale(1, 2, 1), '#9fe8ff', -.4, .9, .3)]),
    // A twig nest on a stump with two eggs: feathers for a broom.
    nest: mergeGeometries([painted(new THREE.CylinderGeometry(.35, .45, .6, 5, 1, true), '#5c4430', 0, .3, 0), painted(new THREE.TorusGeometry(.42, .14, 3, 6).rotateX(Math.PI / 2), '#8a6a3a', 0, .65, 0), painted(new THREE.OctahedronGeometry(.12, 0).scale(1, 1.3, 1), '#e8e4d8', .08, .7, 0), painted(new THREE.OctahedronGeometry(.11, 0).scale(1, 1.3, 1), '#cfe0e8', -.1, .7, .06)]),
    bush: mergeGeometries([painted(new THREE.IcosahedronGeometry(.85, 0), '#3d5e2e', 0, .55, 0), painted(new THREE.OctahedronGeometry(.18, 0), '#8a2f4a', .55, .8, .3)]),
  };
  // Herbs: a three-sided stem and a flower head, 11 triangles.
  for (const [id, n] of Object.entries(NODES)) if (n.herb) g[id] = mergeGeometries([painted(new THREE.ConeGeometry(.12, .7, 3, 1, true), '#3f6a2e', 0, .35, 0), painted(new THREE.OctahedronGeometry(.24, 0), n.color, 0, .72, 0)]);
  return g;
}
// A shape whose corners are nudged by a hash of where they are (so faces stay joined) and whose faces each vary
// a little in shade: bark, foliage and stone that don't look cast from one mould.
function natural(geometry, color, { x = 0, y = 0, z = 0, jitter = 0, shade = .14, seed = 1 } = {}) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry, pos = g.attributes.position;
  const h = (a, b, c, k) => { const v = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719 + k * 4.1 + seed * 1.7) * 43758.5453; return v - Math.floor(v) - .5; };
  if (jitter) for (let i = 0; i < pos.count; i++) {
    const px = +pos.getX(i).toFixed(3), py = +pos.getY(i).toFixed(3), pz = +pos.getZ(i).toFixed(3);
    pos.setXYZ(i, px + h(px, py, pz, 1) * jitter, py + h(px, py, pz, 2) * jitter, pz + h(px, py, pz, 3) * jitter);
  }
  g.translate(x, y, z);
  const c = new THREE.Color(color), colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i += 3) { const k = 1 + h(i, seed, 0, 5) * shade * 2; for (let v = 0; v < 3; v++) colors.set([c.r * k, c.g * k, c.b * k], (i + v) * 3); }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  return g;
}
function fullNodeGeometries() {
  const g = nodeGeometries('simple'), N = natural, cyl = (r0, r1, h, s = 6) => new THREE.CylinderGeometry(r0, r1, h, s, 1, true);
  const trunk = (h, r0, r1, bark, seed) => [N(cyl(r0, r1, h, 5), bark, { y: h / 2, jitter: .06, seed }), N(cyl(r1 * .9, r1 * 1.7, .5, 5), bark, { y: .2, jitter: .08, seed: seed + 1 })];
  const branch = (len, r, bark, ax, az, x, y, z, seed) => { const b = cyl(r * .5, r, len, 4); b.translate(0, len / 2, 0); b.rotateZ(az); b.rotateX(ax); return N(b, bark, { x, y, z, jitter: .03, seed }); };
  const ico = (r, color, x, y, z, seed, sy = 1) => N(new THREE.IcosahedronGeometry(r, 0).scale(1, sy, 1), color, { x, y, z, jitter: r * .18, shade: .16, seed });
  const cone = (r, h, color, y, seed, s = 6) => N(new THREE.ConeGeometry(r, h, s, 1, true), color, { y, jitter: r * .08, shade: .1, seed });
  g.pine = mergeGeometries([...trunk(3.2, .2, .32, '#5a3f2a', 1), cone(2.2, 3.4, '#1f3d27', 3.2, 2), cone(1.6, 3, '#24452c', 5, 3), cone(1, 2.4, '#2a4f32', 6.8, 4, 5)]);
  g.oak = mergeGeometries([...trunk(3, .26, .38, '#5c4430', 6), branch(1.6, .14, '#5c4430', .2, .9, 0, 2.4, 0, 7), branch(1.4, .12, '#5c4430', -.3, -.8, 0, 2.7, 0, 8),
    ico(1.7, '#3f6b2f', 0, 4.9, 0, 9), ico(1.3, '#4a7a34', 1.25, 4.3, .3, 10), ico(1.25, '#355f29', -1.2, 4.4, -.4, 11), ico(1.1, '#467535', .2, 5.9, -.5, 12), ico(1.05, '#3b6a2e', -.3, 4.1, 1.2, 13)]);
  g.blossom = mergeGeometries([...trunk(2.8, .22, .34, '#6a4a3a', 14), branch(1.3, .12, '#6a4a3a', .25, .9, 0, 2.2, 0, 15),
    ico(1.5, '#e7a3c4', 0, 4.3, 0, 16), ico(1.15, '#f2bfd6', 1.1, 3.8, .2, 17), ico(1.1, '#d98bb2', -1.05, 3.9, -.3, 18), ico(.95, '#f7d2e2', .1, 5.2, -.4, 19)]);
  g.gloomtree = mergeGeometries([...trunk(3.6, .2, .34, '#2a2026', 20), branch(1.8, .1, '#2a2026', .5, 1.1, 0, 2.6, 0, 21), branch(1.5, .09, '#2a2026', -.4, -1.2, 0, 3, 0, 22),
    cone(2.3, 3.8, '#261d31', 3.6, 23, 6), cone(1.7, 3.2, '#2c2238', 5.5, 24, 6), cone(1, 2.4, '#33283f', 7.1, 25, 5)]);
  g.deadtree = mergeGeometries([...trunk(4.5, .1, .3, '#4a4238', 26), branch(1.9, .1, '#4a4238', .1, 1.0, 0, 2.6, 0, 27), branch(1.5, .08, '#4a4238', -.4, -1.1, 0, 3.4, 0, 28), branch(1.1, .07, '#4a4238', .9, .2, 0, 3.9, 0, 29)]);
  g.rock = mergeGeometries([N(new THREE.DodecahedronGeometry(1.5, 0).scale(1, .62, 1.1), '#7a7a74', { y: .4, jitter: .3, shade: .12, seed: 30 }), N(new THREE.DodecahedronGeometry(.6, 0).scale(1, .7, 1), '#6e6e68', { x: 1.3, y: .15, z: .6, jitter: .14, seed: 31 })]);
  g.bush = mergeGeometries([ico(.7, '#3d5e2e', 0, .6, 0, 32, .85), ico(.55, '#46693a', .55, .45, .25, 33, .85), ico(.5, '#355428', -.45, .45, -.3, 34, .85), N(new THREE.OctahedronGeometry(.13, 0), '#8a2f4a', { x: .55, y: .85, z: .35, seed: 35 }), N(new THREE.OctahedronGeometry(.12, 0), '#8a2f4a', { x: -.3, y: .9, z: .4, seed: 36 })]);
  return g;
}

export class WorldView {
  constructor(canvas, world) {
    this.world = world;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.quality = QUALITY.auto; this.level = 'auto'; this.scale = 1;
    // Filmic tone: highlights roll off instead of clipping, and the exposure follows the light (see render).
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.exposure = 1;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // A soft studio environment for the heroes' materials only: shine on metal, gems and silk.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.heroKit = new HeroKit(pmrem.fromScene(new RoomEnvironment(), .04).texture);
    pmrem.dispose();
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.scene.background = DAY.clone();
    this.scene.fog = new THREE.Fog(DAY.clone(), 160, 620);
    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, .3, 800);
    this.hemi = new THREE.HemisphereLight(0xcfe3f0, 0x4a4a32, 1.6);
    this.sun = new THREE.DirectionalLight(0xffe8c0, 2.2);
    // The sun's shadows fall in a box that follows you (see render); normal bias keeps flat faces clean.
    Object.assign(this.sun.shadow, { bias: -.0004, normalBias: .35 });
    this.scene.add(this.hemi, this.sun, this.sun.target);

    this.lambert = new Map();
    this.terrainMaterial = shareWorld(flatLambert({ terrain: true }));
    this.nodeMaterial = shareWorld(flatLambert());
    this.glowMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.nodeGeometry = nodeGeometries(); this.treeStyle = 'simple';
    this.box = new THREE.BoxGeometry(1, 1, 1);
    this.ball = new THREE.IcosahedronGeometry(.5, 0);
    this.chunks = new Map();
    this.nodeIndex = new Map();
    this.hidden = new Set();
    this.entities = new Map();
    this.heads = new Map(); this.plateAt = new THREE.Vector3(); // name plates: head height by kind, a scratch vector
    this.effects = [];

    // Opaque water: a see-through plane over most of the screen costs a lot of fill on weak GPUs. Plain on Low,
    // reflecting the sky with a sun glint above it.
    this.plainWater = new THREE.MeshLambertMaterial({ color: '#2f6a7c' });
    this.waterMaterial = waterMaterial();
    const water = this.water = new THREE.Mesh(new THREE.PlaneGeometry(16000, 16000), this.plainWater);
    water.rotation.x = -Math.PI / 2; water.position.y = .05; water.receiveShadow = true;
    water.updateMatrix(); water.matrixAutoUpdate = false;
    this.scene.add(water);
    this.sky = new Sky(this.scene);
    this.groundFn = (x, z) => world.ground(x, z);
    this.grass = new Grass(this.scene, world);
    const crown = world.pois.find(p => p.type === 'crown');
    this.beacon = new Beacon(this.scene, crown.x, crown.y, crown.z);
    this.skyLight = new SkyLight(this.renderer);
    // Firelight, faked: a warm pool on the ground and a soft glow above each nearby fire. Real point lights cost
    // every lit pixel on screen and streaked across the flat-shaded ground.
    const warm = new THREE.CanvasTexture((() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, 'rgba(255,170,80,.9)'); r.addColorStop(.4, 'rgba(255,120,40,.35)'); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128); return c; })());
    this.fireGlows = Array.from({ length: 6 }, () => {
      const pool = new THREE.Mesh(new THREE.CircleGeometry(9, 24), new THREE.MeshBasicMaterial({ map: warm, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4 }));
      pool.rotation.x = -Math.PI / 2;
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: warm, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      halo.scale.set(6, 6, 1);
      this.scene.add(pool, halo);
      return { pool, halo };
    });
    this.buildPois();
    this.resize();
    this.setQuality('auto');
  }

  resize() {
    this.renderer.setPixelRatio(this.scale); this.renderer.setSize(innerWidth, innerHeight, false);
    this.post?.setSize(innerWidth, innerHeight, this.scale);
    this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix();
  }

  // `level` is the player's choice; Auto plays at High and steps down (see stepDown) if the computer struggles.
  setQuality(level) {
    this.level = QUALITY[level] ? level : 'auto';
    this.applyTier(this.level === 'auto' ? 'high' : this.level);
  }
  applyTier(tier) {
    const q = this.quality = QUALITY[tier], before = this.tier;
    this.tier = tier;
    this.scene.fog.near = q.fogNear; this.scene.fog.far = q.fogFar;
    this.camera.far = q.fogFar + 40; // nothing past the fog is visible: don't draw it
    this.lastCell = null;
    // Shadows, water, surface detail and the final image pass by level. Turning shadows on or off rebuilds shaders.
    const shadows = q.shadows > 0;
    if (shadows !== this.renderer.shadowMap.enabled || before !== tier) {
      this.renderer.shadowMap.enabled = shadows; this.sun.castShadow = shadows;
      if (shadows) { this.sun.shadow.mapSize.set(q.shadows, q.shadows); this.sun.shadow.map?.dispose(); this.sun.shadow.map = null; }
      this.scene.traverse(o => { if (o.material) for (const m of [o.material].flat()) m.needsUpdate = true; });
    }
    if (shadows) { const c = this.sun.shadow.camera, r = q.shadowRange; Object.assign(c, { left: -r, right: r, top: r, bottom: -r, near: 1, far: 500 }); c.updateProjectionMatrix(); }
    this.water.material = q.water ? this.waterMaterial : this.plainWater;
    WORLD.uDetail.value = q.detail ? 1 : 0;
    if (q.post && this.post?.samples !== q.msaa) { this.post?.composer.dispose(); this.post = new Post(this.renderer, this.scene, this.camera, q.msaa); this.post.samples = q.msaa; }
    // Low keeps the plain fog: no sunlit haze or valley mist.
    for (const m of [this.terrainMaterial, this.nodeMaterial, this.waterMaterial, this.grass.material]) {
      const simple = tier === 'low';
      if (!!m.defines.SIMPLE !== simple) { if (simple) m.defines.SIMPLE = 1; else delete m.defines.SIMPLE; m.needsUpdate = true; }
    }
    this.heroKit.setQuality(q);
    // Trees and rocks change shape with the level: rebuild the ones about you.
    if (this.treeStyle !== q.trees) { this.treeStyle = q.trees; this.nodeGeometry = nodeGeometries(q.trees); for (const chunk of this.chunks.values()) if (chunk.hasObjects) this.dropObjects(chunk); }
    this.setScale(tier === 'ultra' ? Math.min(devicePixelRatio, q.scale) : q.scale);
    this.resize();
  }
  // Auto graphics found even the lowest resolution too slow: a simpler level. Returns false at the bottom.
  stepDown() { const next = STEP_DOWN[this.tier]; if (!next || this.level !== 'auto') return false; this.applyTier(next); return true; }
  // Render resolution as a fraction of the screen's (capped at 1:1 CSS pixels).
  setScale(scale) {
    if (Math.abs(scale - this.scale) < .01) return;
    this.scale = scale; this.resize();
  }

  // Merge a static group's meshes into one lit and one glowing mesh, and stop updating its matrices.
  // Hundreds of little blocks become two draw calls.
  bake(group) {
    group.updateMatrixWorld(true);
    const inv = group.matrixWorld.clone().invert(), lit = [], glow = [], local = new THREE.Matrix4();
    group.traverse(o => {
      if (!o.isMesh) return;
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      g.applyMatrix4(local.multiplyMatrices(inv, o.matrixWorld));
      if (!g.attributes.color) {
        const c = o.material.color, n = g.attributes.position.count, colors = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) colors.set([c.r, c.g, c.b], i * 3);
        g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      }
      for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(name)) g.deleteAttribute(name);
      g.computeVertexNormals(); // face normals: lit flat (see flatLambert)
      (o.material.isMeshBasicMaterial ? glow : lit).push(g);
    });
    group.clear();
    if (lit.length) { const m = new THREE.Mesh(mergeGeometries(lit), this.nodeMaterial); m.castShadow = m.receiveShadow = true; group.add(m); }
    if (glow.length) group.add(new THREE.Mesh(mergeGeometries(glow), this.glowMaterial));
    group.updateMatrix(); group.updateMatrixWorld(true);
    group.traverse(o => { o.matrixAutoUpdate = false; });
    return group;
  }

  mat(color, glow = false) {
    const key = color + glow;
    if (!this.lambert.has(key)) this.lambert.set(key, glow ? new THREE.MeshBasicMaterial({ color }) : new THREE.MeshLambertMaterial({ color, flatShading: true }));
    return this.lambert.get(key);
  }
  // A box (or other geometry) of size sx*sy*sz at (x, y, z) inside `parent`.
  block(parent, color, x, y, z, sx, sy, sz, geometry = this.box, glow = false) {
    const m = new THREE.Mesh(geometry, this.mat(color, glow));
    m.position.set(x, y, z); m.scale.set(sx, sy, sz); parent.add(m); return m;
  }

  // ---------- characters ----------
  // A detailed witch hero. The group's userData.hero animates it (see Hero.update).
  witch(classId, scale = 1, look = SISTER_LOOK, options = {}) {
    const hero = new Hero(this.heroKit, classId, look, { scale, ...options });
    Object.assign(hero.root.userData, { hero, faces: 'z' });
    return hero.root;
  }

  creature(plan, size, color, accent, b = {}) {
    const g = new THREE.Group(), legs = [], wings = [], segs = [];
    const add = (...a) => this.block(g, ...a);
    if (plan === 'quad') {
      const y = size * .95, L = size * 1.3, W = size * .5, H = size * .55;
      add(color, 0, y, 0, L, H, W);
      const head = add(color, L / 2 + size * .15, y + H * .4, 0, size * .45, size * .38, size * .34);
      if (b.antlers) for (const z of [-1, 1]) this.block(head, accent, -.1, 1.2, z * .25, .12, 1.6, .12).rotation.x = z * .5;
      if (b.horns) for (const z of [-1, 1]) this.block(head, accent, -.2, .6, z * .55, .3, .3, .5);
      if (b.tusks) for (const z of [-1, 1]) this.block(head, accent, .6, -.3, z * .3, .5, .1, .1);
      if (b.ears) for (const z of [-1, 1]) this.block(head, color, -.2, .65, z * .3, .2, .5, .2);
      if (b.tail) add(color, -L / 2 - size * .25, y + H * .2, 0, size * .55, size * .12, size * .12).rotation.z = .5;
      for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const pivot = new THREE.Group(); pivot.position.set(x * L * .38, y - H / 2, z * W * .4); g.add(pivot);
        this.block(pivot, color, 0, -(y - H / 2) / 2, 0, size * .14, y - H / 2, size * .14); legs.push(pivot);
      }
    } else if (plan === 'human') {
      add(color, 0, size * 1.15, 0, size * .32, size * .7, size * .5);
      add(accent, 0, size * 1.68, 0, size * .3, size * .3, size * .3);
      if (b.hat) { add('#151515', 0, size * 1.86, 0, size * .75, size * .04, size * .75); add('#151515', 0, size * 1.98, 0, size * .32, size * .24, size * .32); }
      for (const z of [-1, 1]) { const arm = new THREE.Group(); arm.position.set(0, size * 1.45, z * size * .32); g.add(arm); this.block(arm, color, 0, -size * .3, 0, size * .13, size * .6, size * .13); wings.push(arm); }
      for (const z of [-1, 1]) { const leg = new THREE.Group(); leg.position.set(0, size * .8, z * size * .12); g.add(leg); this.block(leg, '#3a3026', 0, -size * .4, 0, size * .15, size * .8, size * .15); legs.push(leg); }
      if (b.hat) this.block(wings[1], '#5a4a3a', size * .25, -size * .55, 0, size * .7, size * .08, size * .08);
    } else if (plan === 'biped') {
      add(color, 0, size * 1.2, 0, size * .7, size * .9, size * .45);
      add(accent, 0, size * 1.85, 0, size * .45, size * .42, size * .42);
      for (const z of [-1, 1]) { const arm = new THREE.Group(); arm.position.set(0, size * 1.55, z * size * .45); g.add(arm); this.block(arm, color, 0, -size * .4, 0, size * .18, size * .8, size * .18); wings.push(arm); }
      for (const z of [-1, 1]) { const leg = new THREE.Group(); leg.position.set(0, size * .75, z * size * .18); g.add(leg); this.block(leg, color, 0, -size * .375, 0, size * .2, size * .75, size * .2); legs.push(leg); }
    } else if (plan === 'bird' || plan === 'insect') {
      add(color, 0, size * .6, 0, size * .9, size * .45, size * .4);
      add(plan === 'insect' ? accent : color, size * .55, size * .75, 0, size * .32, size * .3, size * .3);
      if (plan === 'insect') add(accent, -size * .6, size * .55, 0, size * .5, size * .3, size * .32);
      else add(accent, size * .78, size * .72, 0, size * .25, size * .07, size * .07);
      for (const z of [-1, 1]) { const w = new THREE.Group(); w.position.set(0, size * .75, z * size * .2); g.add(w); this.block(w, plan === 'insect' ? '#e8f0ff' : color, 0, 0, z * size * .45, size * .5, size * .05, size * .9); wings.push(w); }
    } else if (plan === 'serpent') {
      for (let i = 0; i < 6; i++) segs.push(add(i ? color : accent, -i * size * .55, size * .3, 0, size * .6, size * .45 * (1 - i * .08), size * .45 * (1 - i * .08)));
    } else if (plan === 'spider') {
      add(color, 0, size * .55, 0, size * .55, size * .4, size * .5);
      add(color, -size * .55, size * .65, 0, size * .7, size * .55, size * .65);
      add(accent, size * .32, size * .6, 0, size * .1, size * .1, size * .3);
      for (let i = 0; i < 8; i++) { const z = i % 2 ? 1 : -1, x = (Math.floor(i / 2) - 1.5) * size * .2; const leg = new THREE.Group(); leg.position.set(x, size * .55, z * size * .2); g.add(leg); this.block(leg, color, 0, 0, z * size * .45, size * .08, size * .08, size * .9).rotation.x = z * .5; legs.push(leg); }
    } else if (plan === 'wisp') {
      const core = add(color, 0, size * .5, 0, size, size, size, this.ball, true);
      add(accent, 0, size * .5, 0, size * .45, size * .45, size * .45, this.ball, true);
      segs.push(core);
    } else { // blob
      segs.push(add(color, 0, size * .4, 0, size * 1.1, size * .8, size, this.ball));
      for (const z of [-1, 1]) add(accent, size * .45, size * .65, z * size * .22, size * .18, size * .18, size * .18, this.ball);
    }
    Object.assign(g.userData, { legs, wings, segs, plan, faces: 'x' });
    return g;
  }

  familiar(species) {
    return {
      toad: () => this.creature('blob', .35, '#5c7a3a', '#e8d84a'),
      raven: () => this.creature('bird', .4, '#1a1a22', '#c8c040'),
      hare: () => this.creature('quad', .35, '#c8b090', '#ffffff', { ears: true }),
      fox: () => this.creature('quad', .45, '#d0602a', '#ffffff', { ears: true, tail: true }),
    }[species]();
  }

  boss() {
    const g = this.creature('biped', BOSS.size, BOSS.color, BOSS.accent);
    this.block(g, BOSS.accent, 0, BOSS.size * 2.4, 0, BOSS.size * .4, BOSS.size * .9, BOSS.size * .4, new THREE.ConeGeometry(.5, 1, 4), true);
    const ward = new THREE.Mesh(new THREE.IcosahedronGeometry(BOSS.size * 1.6, 1), new THREE.MeshBasicMaterial({ color: '#ff3c6e', transparent: true, opacity: .18, wireframe: true }));
    ward.position.y = BOSS.size * 1.2; g.add(ward); g.userData.ward = ward;
    return g;
  }

  // ---------- places & buildings ----------
  building(type) {
    const g = new THREE.Group(), b = (...a) => this.block(g, ...a);
    if (type === 'heart') { b('#6f6c66', 0, .3, 0, 2.6, .6, 2.6, new THREE.CylinderGeometry(.5, .5, 1, 8)); b('#b98cff', 0, 1.4, 0, .8, 1.6, .8, new THREE.OctahedronGeometry(.5, 0), true); }
    if (type === 'campfire') { b('#4d3420', 0, .12, 0, 1, .15, .2); b('#4d3420', 0, .12, 0, .2, .15, 1); b('#ffb347', 0, .5, 0, .6, .8, .6, new THREE.ConeGeometry(.5, 1, 5), true); }
    if (type === 'cauldron') { b('#2a2a2e', 0, .55, 0, 1.6, 1.1, 1.6, new THREE.CylinderGeometry(.5, .35, 1, 8)); b('#6ad84a', 0, 1.08, 0, 1.3, .05, 1.3, new THREE.CylinderGeometry(.5, .5, 1, 8), true); }
    if (type === 'palisade') for (let i = -2; i <= 2; i++) b('#6b4a2e', i * .8, 1.3, 0, .35, 2.6 + (i % 2) * .3, .35);
    if (type === 'lantern') { b('#4d3420', 0, 1.2, 0, .15, 2.4, .15); b('#b8ff9a', 0, 2.5, 0, .35, .35, .35, this.box, true); }
    if (type === 'hut') { b('#7a5a3a', 0, 1.2, 0, 4, 2.4, 3.4); b('#a8904a', 0, 3.1, 0, 5.4, 1.8, 4.4, new THREE.ConeGeometry(.5, 1, 4)).rotation.y = Math.PI / 4; b('#2a1a10', 2.01, .9, 0, .05, 1.8, 1); }
    if (type === 'well') { b('#77736a', 0, .5, 0, 2, 1, 2, new THREE.CylinderGeometry(.5, .5, 1, 8)); b('#2d6578', 0, 1.01, 0, 1.6, .02, 1.6, new THREE.CylinderGeometry(.5, .5, 1, 8)); b('#6b4a2e', 0, 2, 0, 2.2, .15, .15); }
    if (type === 'garden') { b('#4a3420', 0, .15, 0, 3.6, .3, 2.4); for (let i = 0; i < 6; i++) b('#4f8a3a', -1.2 + (i % 3) * 1.2, .55, i < 3 ? -.6 : .6, .3, .5, .3); }
    if (type === 'totem') { b('#6b4a2e', 0, 1.6, 0, .6, 3.2, .6); b('#d8d0c0', 0, 3.4, 0, .7, .5, .5); b('#ff9a4a', .31, 2.6, 0, .05, .2, .3, this.box, true); }
    if (type === 'altar') { b('#5a5650', 0, .5, 0, 3, 1, 1.6); b('#8a8780', 0, 1.05, 0, 3.2, .1, 1.8); b('#9fe8ff', 0, 1.5, 0, .5, .8, .5, new THREE.OctahedronGeometry(.5, 0), true); }
    return g;
  }

  // A human village as two merged meshes: walls and buildings. Positions are relative to the village centre.
  village(v) {
    const parts = [], L = v.layout, at = (geo, color, x, y, z, rot = 0) => { const g = painted(geo, color); g.rotateY(rot); g.translate(x - v.x, y - v.y, z - v.z); parts.push(g); };
    for (const p of L.posts) at(new THREE.BoxGeometry(.5, 3.4, 3.6), '#6b4a2e', p.x, p.y + 1.4, p.z, p.rot);
    for (const g of L.gates) for (const side of [-1, 1]) {
      const a = g.angle + side * .16, x = v.x + Math.cos(a) * 40, z = v.z + Math.sin(a) * 40;
      at(new THREE.BoxGeometry(.8, 5.5, .8), '#4d3420', x, this.world.ground(x, z) + 2.5, z);
    }
    for (const h of L.houses) {
      const tall = h.chapel ? 5 : 3;
      at(new THREE.BoxGeometry(h.w, tall, h.d), h.chapel ? '#b8b0a0' : '#c9b48a', h.x, h.y + tall / 2, h.z, h.rot);
      at(new THREE.ConeGeometry(Math.max(h.w, h.d) * .78, 2.6, 4), h.chapel ? '#4a4a52' : '#8a4a32', h.x, h.y + tall + 1.3, h.z, h.rot + Math.PI / 4);
      if (h.chapel) { at(new THREE.BoxGeometry(1.8, 9, 1.8), '#b8b0a0', h.x, h.y + 4.5, h.z); at(new THREE.ConeGeometry(1.4, 4, 4), '#4a4a52', h.x, h.y + 11, h.z, Math.PI / 4); at(new THREE.BoxGeometry(.2, 1.6, .2), '#d6b46a', h.x, h.y + 13.6, h.z); at(new THREE.BoxGeometry(.9, .2, .2), '#d6b46a', h.x, h.y + 13.8, h.z); }
    }
    const st = L.stall;
    at(new THREE.BoxGeometry(2.6, 1, 1.4), '#6b4a2e', st.x, st.y + .5, st.z);
    at(new THREE.BoxGeometry(3.2, .12, 2), '#b83a3a', st.x, st.y + 2.6, st.z);
    for (const [dx, dz] of [[-1.4, -.8], [1.4, -.8], [-1.4, .8], [1.4, .8]]) at(new THREE.BoxGeometry(.12, 2.6, .12), '#4d3420', st.x + dx, st.y + 1.3, st.z + dz);
    return new THREE.Mesh(mergeGeometries(parts), this.nodeMaterial);
  }

  buildPois() {
    this.poiMeshes = [];
    for (const poi of this.world.pois) {
      const g = new THREE.Group(), b = (...a) => this.block(g, ...a);
      g.position.set(poi.x, poi.y, poi.z);
      if (poi.type === 'circle') { for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; b('#8a8780', Math.cos(a) * 9, 1.6, Math.sin(a) * 9, 1.1, 3.2 + (i % 3) * .5, .7).rotation.y = -a; } b('#9a6bff', 0, 1.4, 0, .8, .8, .8, this.ball, true); }
      if (poi.type === 'ruin') { for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; b('#77736a', Math.cos(a) * 3.4, 2 + (i % 3), Math.sin(a) * 3.4, 1.4, 4 + (i % 3) * 2, 1.4); } b('#6b4a2e', 0, .45, 0, 1.4, .9, 1); }
      if (poi.type === 'shrine') { b('#7d7a73', 0, 1.2, 0, 1.6, 2.4, 1.6, new THREE.CylinderGeometry(.4, .55, 1, 6)); b('#3cffb0', 0, 3, 0, .8, .8, .8, new THREE.OctahedronGeometry(.6, 0), true); }
      if (poi.type === 'hearth') {
        const hut = this.building('hut'); hut.position.set(-6, 0, -5); g.add(hut);
        const fire = this.building('campfire'); g.add(fire);
        for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; b('#6b4a2e', Math.cos(a) * 14, .6, Math.sin(a) * 14, .25, 1.2, .25); }
      }
      if (poi.type === 'lair') { for (let i = 0; i < 10; i++) { const a = i * 2.4; b(i % 2 ? '#d8d0c0' : '#3a3036', Math.cos(a) * (4 + i), .4, Math.sin(a) * (4 + i), 1.2, .6 + (i % 3) * .4, .8); } }
      if (poi.type === 'village') g.add(this.village(poi));
      if (poi.type === 'crown') { for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; b('#1a1420', Math.cos(a) * 55, 7, Math.sin(a) * 55, 3, 14 + (i % 3) * 5, 3, new THREE.ConeGeometry(.5, 1, 4)); } b('#ff3c6e', 0, .1, 0, 30, .1, 30, new THREE.CylinderGeometry(.5, .5, 1, 24), true).material = new THREE.MeshBasicMaterial({ color: '#3a1020' }); }
      this.scene.add(this.bake(g)); this.poiMeshes.push(g);
    }
  }

  // ---------- terrain & resource streaming ----------
  hideNode(id) {
    this.hidden.add(id);
    const ref = this.nodeIndex.get(id);
    if (ref) { ref.mesh.setMatrixAt(ref.index, new THREE.Matrix4().makeScale(0, 0, 0)); ref.mesh.instanceMatrix.needsUpdate = true; }
  }
  showNode(id) {
    this.hidden.delete(id);
    const ref = this.nodeIndex.get(id);
    if (ref) { ref.mesh.setMatrixAt(ref.index, ref.matrix); ref.mesh.instanceMatrix.needsUpdate = true; }
  }

  // Vertex spacing by chunk distance: full detail nearby, coarser in the fog.
  static stepFor(d) { return d <= 1 ? 1 : d === 2 ? 2 : 5; }

  terrainGeometry(cx, cz, step) {
    const data = this.world.chunkMesh(cx, cz, step), indexed = new THREE.BufferGeometry();
    indexed.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
    indexed.setAttribute('color', new THREE.BufferAttribute(data.colors, 3));
    indexed.setIndex(new THREE.BufferAttribute(data.indices, 1));
    // Unindexed, so each face gets its own flat normal (see flatLambert).
    const geometry = indexed.toNonIndexed();
    geometry.computeVertexNormals(); geometry.computeBoundingSphere();
    return geometry;
  }

  buildChunk(cx, cz, step = 1) {
    const key = `${cx},${cz}`, mesh = new THREE.Mesh(this.terrainGeometry(cx, cz, step), this.terrainMaterial);
    mesh.receiveShadow = mesh.castShadow = true;
    mesh.matrixAutoUpdate = false;
    this.scene.add(mesh);
    const chunk = { key, cx, cz, mesh, step, nodes: [], instanced: [], hasObjects: false };
    this.chunks.set(key, chunk);
    return chunk;
  }

  buildObjects(chunk) {
    chunk.nodes = this.world.scatter(chunk.cx, chunk.cz); chunk.hasObjects = true;
    const byType = {};
    for (const n of chunk.nodes) (byType[n.type] ??= []).push(n);
    const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const [type, nodes] of Object.entries(byType)) {
      const mesh = new THREE.InstancedMesh(this.nodeGeometry[type], this.nodeMaterial, nodes.length);
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false; mesh.userData.small = !!NODES[type].herb || type === 'bush' || type === 'rock' || type === 'nest';
      mesh.visible = !mesh.userData.small || chunk.d <= this.quality.small;
      nodes.forEach((n, i) => {
        const matrix = new THREE.Matrix4().compose(new THREE.Vector3(n.x, n.y - .1, n.z), q.setFromAxisAngle(up, n.rot), new THREE.Vector3(n.s, n.s, n.s));
        mesh.setMatrixAt(i, this.hidden.has(n.id) ? zero : matrix);
        this.nodeIndex.set(n.id, { mesh, index: i, matrix });
      });
      mesh.computeBoundingSphere();
      this.scene.add(mesh); chunk.instanced.push(mesh);
    }
  }

  dropObjects(chunk) {
    for (const mesh of chunk.instanced) { this.scene.remove(mesh); mesh.dispose(); }
    for (const n of chunk.nodes) this.nodeIndex.delete(n.id);
    chunk.instanced = []; chunk.nodes = []; chunk.hasObjects = false;
  }

  // Stream chunks around (x, z). `budget` caps how many are built this call.
  // Plans only when you enter a new chunk or work is still pending, so most frames this returns at once.
  stream(x, z, budget = 2) {
    const pcx = Math.floor(x / CHUNK), pcz = Math.floor(z / CHUNK), cell = `${pcx},${pcz}`;
    if (cell === this.lastCell && !this.pending) return;
    this.lastCell = cell; this.pending = false;
    const { terrain: TERRAIN_RADIUS, objects: OBJECT_RADIUS } = this.quality, wanted = [];
    for (let dz = -TERRAIN_RADIUS; dz <= TERRAIN_RADIUS; dz++) for (let dx = -TERRAIN_RADIUS; dx <= TERRAIN_RADIUS; dx++) {
      const cx = pcx + dx, cz = pcz + dz;
      if (cx < -MAX_CHUNK - 1 || cz < -MAX_CHUNK - 1 || cx > MAX_CHUNK || cz > MAX_CHUNK) continue;
      wanted.push({ cx, cz, d: Math.max(Math.abs(dx), Math.abs(dz)) });
    }
    wanted.sort((a, b) => a.d - b.d);
    for (const w of wanted) {
      let chunk = this.chunks.get(`${w.cx},${w.cz}`);
      const step = WorldView.stepFor(w.d);
      if (!chunk) { if (budget-- <= 0) { this.pending = true; break; } chunk = this.buildChunk(w.cx, w.cz, step); }
      else if (chunk.step !== step) {
        if (budget-- <= 0) { this.pending = true; break; }
        chunk.mesh.geometry.dispose(); chunk.mesh.geometry = this.terrainGeometry(w.cx, w.cz, step); chunk.step = step;
      }
      chunk.d = w.d;
      if (w.d <= OBJECT_RADIUS && !chunk.hasObjects) { if (budget-- <= 0) { this.pending = true; break; } this.buildObjects(chunk); }
    }
    for (const chunk of this.chunks.values()) {
      const d = Math.max(Math.abs(chunk.cx - pcx), Math.abs(chunk.cz - pcz));
      chunk.d = d;
      for (const mesh of chunk.instanced) if (mesh.userData.small) mesh.visible = d <= this.quality.small;
      if (d > TERRAIN_RADIUS + 1) { this.dropObjects(chunk); this.scene.remove(chunk.mesh); chunk.mesh.geometry.dispose(); this.chunks.delete(chunk.key); }
      else if (d > OBJECT_RADIUS + 1 && chunk.hasObjects) this.dropObjects(chunk);
    }
  }

  // Resource nodes near (x, z) in loaded chunks.
  nodesNear(x, z, r) {
    const out = [], pcx = Math.floor(x / CHUNK), pcz = Math.floor(z / CHUNK);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const chunk = this.chunks.get(`${pcx + dx},${pcz + dz}`);
      if (chunk) for (const n of chunk.nodes) if (!this.hidden.has(n.id) && Math.abs(n.x - x) < r && Math.abs(n.z - z) < r) out.push(n);
    }
    return out;
  }

  // ---------- entities ----------
  // Keep one mesh per item of `list` under the named group; `make(item)` builds a new one.
  // Where a creature's head shows on screen, for its name plate: null when behind the camera or off the edge.
  headOnScreen(group, id, kind) {
    const mesh = this.entities.get(group)?.get(id);
    if (!mesh?.visible) return null;
    let h = this.heads.get(kind);
    if (h === undefined) { mesh.updateMatrixWorld(true); const box = new THREE.Box3().setFromObject(mesh); h = box.isEmpty() ? 1.5 : (box.max.y - mesh.position.y) / mesh.scale.y; this.heads.set(kind, h); }
    const v = this.plateAt.set(mesh.position.x, mesh.position.y + h * mesh.scale.y + .3, mesh.position.z).project(this.camera);
    if (v.z > 1 || Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05) return null;
    return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight };
  }
  sync(group, list, make, place) {
    const map = this.entities.get(group) ?? new Map(), live = new Set();
    this.entities.set(group, map);
    for (const item of list) {
      live.add(item.id);
      let mesh = map.get(item.id);
      if (!mesh) { mesh = make(item); map.set(item.id, mesh); this.scene.add(mesh); }
      place(mesh, item);
    }
    for (const [id, mesh] of map) if (!live.has(id)) { this.scene.remove(mesh); map.delete(id); }
  }

  // Pose a body: position, facing, legs and wings.
  pose(mesh, e, walk, now) {
    const u = mesh.userData;
    mesh.position.set(e.x, e.y, e.z);
    mesh.rotation.y = u.faces === 'z' ? -e.yaw + Math.PI / 2 : -e.yaw;
    u.legs?.forEach((leg, i) => { const s = Math.sin(walk * 2.2 + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * .5; if (u.faces === 'z') leg.rotation.x = s; else leg.rotation.z = s; });
    u.wings?.forEach((w, i) => { if (u.plan === 'biped' || u.plan === 'human') w.rotation.z = Math.sin(walk * 2.2 + i * Math.PI) * .5; else w.rotation.x = Math.sin(now * 14 + i * Math.PI) * .7 * (i ? 1 : -1); });
    u.segs?.forEach((s, i) => { if (u.plan === 'serpent') s.position.z = Math.sin(walk * 1.5 - i * .9) * .25 * (i + 1) * .4; else s.scale.y = s.scale.x * (.85 + Math.sin(now * 5) * .1); });
  }

  syncWorld(state) {
    const { creatures, allies, boss, buildings, projectiles, elders, now } = state;
    this.sync('creatures', creatures, c => { const b = CREATURE[c.kind]; return this.creature(b.plan, b.size, b.color, b.accent, b); }, (m, c) => {
      this.pose(m, c, c.walk, now);
      m.visible = true;
      m.scale.setScalar(c.hurt > 2.8 ? 1.12 : 1);
    });
    const dt = Math.min(.1, now - (this.lastSync ?? now)); this.lastSync = now;
    // Heroes move when their walk counter or position changes since the last frame.
    const animate = (m, e, extra = {}) => {
      const hero = m.userData.hero;
      if (!hero) return;
      const moved = Math.hypot(e.x - (m.userData.lx ?? e.x), e.z - (m.userData.lz ?? e.z)) > .002;
      m.userData.lx = e.x; m.userData.lz = e.z;
      hero.update(dt, now, { moving: moved, ground: this.groundFn, ...extra });
    };
    // Quest givers watch you when you come near.
    const you = this.player.position, watch = e => Math.hypot(e.x - you.x, e.z - you.z) < 14 ? { x: you.x, y: you.y + 1.6, z: you.z } : null;
    this.sync('allies', allies, a => a.ally === 'witch' ? this.witch(a.cls) : a.ally === 'fox' ? this.familiar('fox') : (() => { const s = ALLIES[a.ally]; return this.creature(a.ally === 'beast' ? 'quad' : 'biped', s.size, s.color, a.ally === 'titan' ? '#7dffd8' : '#9a6bff', { horns: true }); })(), (m, a) => { this.pose(m, a, a.riding ? 0 : a.walk, now); animate(m, a, { mounted: !!a.riding, flying: a.riding && a.y > this.world.ground(a.x, a.z) + 3 }); });
    this.sync('elders', elders, e => this.witch(e.cls, 1.05, ELDER_LOOK, { revealing: true }), (m, e) => { this.pose(m, e, 0, now); animate(m, e, { look: watch(e) }); });
    this.sync('boss', boss ? [boss] : [], () => this.boss(), (m, b) => { this.pose(m, b, b.walk, now); m.userData.ward.visible = b.warded; m.userData.ward.rotation.y = now; });
    this.sync('buildings', buildings, b => { const g = this.building(b.type); g.position.set(b.x, b.y, b.z); g.rotation.y = b.rot ?? 0; return this.bake(g); }, () => {});
    this.sync('projectiles', projectiles, p => new THREE.Mesh(this.ball, this.mat(p.color, true)), (m, p) => m.position.set(p.x, p.y, p.z));
  }

  // A floating label. Drawn with canvas text, so names are never parsed as HTML.
  nameTag(text) {
    const c = document.createElement('canvas'), g = c.getContext('2d');
    c.width = 512; c.height = 96;
    g.font = 'bold 40px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 8; g.strokeStyle = '#000000b0'; g.strokeText(text, 256, 48);
    g.fillStyle = '#f2ecf8'; g.fillText(text, 256, 48);
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
    tag.scale.set(4, .75, 1); tag.position.y = 3.1;
    return tag;
  }

  // Other players: a witch of their class with their name (and coven) overhead.
  syncRemotes(list, now) {
    this.sync('remotes', list, r => {
      const g = this.witch(r.cls, 1, decodeLook(r.look));
      g.add(this.nameTag(r.coven ? `${r.name} ‹${r.coven}›` : r.name));
      g.userData.cls = r.cls;
      return g;
    }, (m, r) => {
      this.pose(m, r, 0, now);
      const hero = m.userData.hero, dt = Math.min(.1, now - (m.userData.t ?? now));
      m.userData.t = now;
      if (r.look !== m.userData.look) { m.userData.look = r.look; hero.setLook(decodeLook(r.look)); }
      hero.update(dt, now, { moving: r.moving, swing: r.swing, mounted: r.mounted, flying: r.mounted && r.y > this.world.ground(r.x, r.z) + 3, ground: this.groundFn });
      m.visible = r.hp > 0;
    });
  }

  // A ring that expands and fades: spell areas and impacts.
  ring(x, y, z, radius, color) {
    const m = new THREE.Mesh(new THREE.RingGeometry(.85, 1, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .8, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, y + .3, z); m.scale.setScalar(radius * .3);
    this.scene.add(m); this.effects.push({ m, t: 0, radius });
  }

  ensurePlayer(classId, familiar) {
    if (this.playerClass === classId) return;
    if (this.player) this.scene.remove(this.player, this.pet);
    this.playerClass = classId;
    this.player = this.witch(classId, 1, {}); this.scene.add(this.player);
    this.playerHero = this.player.userData.hero;
    this.pet = familiar === 'fox' ? null : this.familiar(familiar);
    if (this.pet) this.scene.add(this.pet);
  }

  render(state) {
    const { player, yaw, pitch, dayTime, now, swing, swingKind = 'strike', lights, moving, sprinting = false, sight, dt, glamour = false, mounted = false, flying = false, look = {} } = state;
    const w = this.player;
    w.position.set(player.x, player.y, player.z); w.rotation.y = -player.yaw + Math.PI / 2;
    this.playerHero.setLook(look);
    // Standing still, she glances at the camera when it is in front of her.
    const lookAt = moving || !this.camAt ? null : this.camAt;
    this.playerHero.update(dt, now, { moving, sprinting, swing, swingKind, mounted, flying, glamour, ground: this.groundFn, look: lookAt });
    if (this.pet) this.pet.visible = !glamour && (!flying || this.pet.userData.plan === 'bird');
    if (this.pet) {
      const t = this.pet, raven = t.userData.plan === 'bird', tx = player.x - Math.cos(player.yaw + .9) * 1.4, tz = player.z - Math.sin(player.yaw + .9) * 1.4;
      t.position.x += (tx - t.position.x) * Math.min(1, dt * 5); t.position.z += (tz - t.position.z) * Math.min(1, dt * 5);
      t.position.y = raven ? player.y + 2.6 + Math.sin(now * 2) * .2 : this.world.ground(t.position.x, t.position.z);
      t.rotation.y = -player.yaw;
      this.pose(t, { x: t.position.x, y: t.position.y, z: t.position.z, yaw: player.yaw }, moving ? now * 6 : 0, now);
    }

    // The camera rides a little over your right shoulder, fixed to you: easing after you would lag by an amount
    // that changes with every frame's length, and the view would judder whenever you move fast (sideways most).
    // Only the lift over a rising hill is eased, quickly up and gently back down, and it never sinks into the ground.
    const dist = 5.6, side = .45, sx = -Math.sin(yaw) * side, sz = Math.cos(yaw) * side;
    const cx = player.x - Math.cos(yaw) * Math.cos(pitch) * dist + sx, cz = player.z - Math.sin(yaw) * Math.cos(pitch) * dist + sz;
    // Height alone is eased (a jump shouldn't bob the whole view), in a way that stays exact at any frame rate:
    // it follows her vertical speed, so rising or falling steadily never judders.
    if (this.camY === undefined || !(dt > 0) || Math.abs(player.y - this.camPrevY) > 10) this.camY = player.y;
    else { const v = (player.y - this.camPrevY) / dt, k = 8; this.camY = player.y - v / k + (this.camY - this.camPrevY + v / k) * Math.exp(-k * dt); }
    this.camPrevY = player.y;
    const base = this.camY + 1.8 + Math.sin(pitch) * dist, floor = Math.max(this.world.ground(cx, cz) + .6, .8), need = Math.max(0, floor - base);
    this.lift = (this.lift ?? need) + (need - (this.lift ?? need)) * (1 - Math.exp(-dt * (need > (this.lift ?? 0) ? 14 : 5)));
    this.camAt = (this.camAt ?? new THREE.Vector3()).set(cx, Math.max(base + this.lift, floor - .35), cz);
    this.camera.position.copy(this.camAt);
    this.camera.lookAt(player.x + sx, this.camY + 1.6, player.z + sz);

    // Day/night: dayTime 0..1, 0.25 sunrise, 0.5 noon, 0.75 sunset.
    const { day, dusk, sunDir, horizon } = this.sky.update(this.camera, dayTime, now, dt, player), see = sight ? .5 : 0;
    this.heroKit.setDaylight(Math.max(day, see));
    const night = 1 - day;
    // The fog fades into the sky's horizon; Gloamsight lifts the darkness a little.
    const fog = horizon.clone().lerp(DAY, see * .3 * (1 - day));
    this.scene.background.copy(fog); this.scene.fog.color.copy(fog);
    // Light levels in physical proportion (sun far brighter than skylight, moonlight dim and cool); the exposure
    // then adapts slowly, as eyes do, so night is dark but readable and noon isn't blown out.
    this.sun.intensity = 2.7 * day + .5 * night; this.hemi.intensity = .25 + .8 * Math.max(day, see * .6);
    this.hemi.color.set(day > .3 ? '#cfe0f2' : '#5a68b0'); this.hemi.groundColor.set(day > .3 ? '#4a4632' : '#14121e');
    this.sun.color.set(dusk > .4 ? '#ffb07a' : day > .1 ? '#fff0d8' : '#a8b8ff');
    const targetExposure = THREE.MathUtils.lerp(1.5, .86, day) + dusk * .12;
    this.exposure += (targetExposure - this.exposure) * Math.min(1, dt * .7);
    this.renderer.toneMappingExposure = this.exposure;
    // The light comes from the sun by day and from the moon by night. Its shadow box follows you, snapped to
    // whole shadow-map texels in the light's own frame so shadow edges don't crawl as you walk.
    const light = (day > .05 ? sunDir : sunDir.clone().negate()).clone(); light.y = Math.abs(light.y) + .15; light.normalize();
    const centre = new THREE.Vector3(player.x, player.y, player.z);
    if (this.sun.castShadow) {
      const texel = 2 * this.quality.shadowRange / this.sun.shadow.mapSize.x, right = new THREE.Vector3(0, 1, 0).cross(light).normalize(), up = light.clone().cross(right);
      const snap = v => Math.round(v / texel) * texel, a = snap(centre.dot(right)), b = snap(centre.dot(up)), c = centre.dot(light);
      centre.copy(right.multiplyScalar(a)).addScaledVector(up, b).addScaledVector(light, c);
    }
    this.sun.target.position.copy(centre);
    this.sun.position.copy(centre).addScaledVector(light, 250);
    // Shared world shader values: time, sun, haze and wind (gusting now and then).
    WORLD.uTime.value = now; WORLD.uSunDir.value.copy(light);
    WORLD.uSunGlow.value.set(dusk > .3 ? '#ff9a60' : day > .2 ? '#fff0d0' : '#8090c0');
    WORLD.uMist.value = .04 + .22 * night + .2 * dusk;
    WORLD.uWind.value = .7 + .5 * Math.max(0, Math.sin(now * .13) * Math.sin(now * .31));
    if (this.water.material === this.waterMaterial) {
      const u = this.waterMaterial.uniforms;
      u.uZenith.value.copy(this.sky.uniforms.uZenith.value); u.uHorizon.value.copy(this.sky.uniforms.uHorizon.value);
      u.uSunColor.value.copy(this.sun.color).multiplyScalar(day > .05 ? this.sun.intensity * .5 : this.sun.intensity * .3);
    }
    this.grass.update(player.x, player.z, this.quality.grass);
    // Only chunks the shadow box reaches cast shadows: whole chunks of trees outside it would cost for nothing.
    if (this.sun.castShadow) {
      const reach = this.quality.shadowRange + CHUNK * .75;
      for (const chunk of this.chunks.values()) {
        const near = Math.abs((chunk.cx + .5) * CHUNK - player.x) < reach && Math.abs((chunk.cz + .5) * CHUNK - player.z) < reach;
        chunk.mesh.castShadow = near; for (const m of chunk.instanced) m.castShadow = near;
      }
      // Medium updates the shadows every other frame.
      this.renderer.shadowMap.autoUpdate = false;
      this.shadowTick = ((this.shadowTick ?? 0) + 1) % (this.quality.shadowEvery ?? 1);
      if (this.shadowTick === 0) this.renderer.shadowMap.needsUpdate = true;
    }
    this.beacon.update(this.camera, now, this.bossDefeated);
    // Heroes lit by the sky itself on High and up.
    if (this.quality.ibl) this.heroKit.setEnvironment(this.skyLight.update(dt, this.sky.uniforms, new THREE.Color(this.hemi.groundColor).multiplyScalar(this.hemi.intensity * .35), light, new THREE.Color(this.sun.color).multiplyScalar(this.sun.intensity * .4)));

    const near = [...lights].sort((f, g) => Math.hypot(f.x - player.x, f.z - player.z) - Math.hypot(g.x - player.x, g.z - player.z));
    const dark = 1 - day;
    this.fireGlows.forEach(({ pool, halo }, i) => {
      const f = near[i], on = !!f && dark > .05 && Math.hypot(f.x - player.x, f.z - player.z) < 200;
      pool.visible = halo.visible = on;
      if (!on) return;
      const flicker = 1 + Math.sin(now * 11 + i * 3) * .06 + Math.sin(now * 23 + i) * .04;
      pool.position.set(f.x, f.y + .25, f.z); pool.scale.setScalar(flicker);
      halo.position.set(f.x, f.y + 1.4, f.z); halo.scale.setScalar(6 * flicker);
      pool.material.opacity = halo.material.opacity = Math.min(1, dark * 1.3);
    });
    this.effects = this.effects.filter(e => {
      e.t += dt; e.m.scale.setScalar(e.radius * (.3 + e.t * 1.6)); e.m.material.opacity = Math.max(0, .8 - e.t * 1.4);
      if (e.t > .6) { this.scene.remove(e.m); e.m.geometry.dispose(); e.m.material.dispose(); return false; }
      return true;
    });
    if (this.quality.post && this.post) this.post.render(night); else this.renderer.render(this.scene, this.camera);
  }
}

// The inventory's portrait: your witch in studio light, turning slowly, wearing what you wear.
export class HeroPreview {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(1); this.renderer.setSize(canvas.width, canvas.height, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.1;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, canvas.width / canvas.height, .1, 50);
    this.camera.position.set(0, 1.42, 5.4); this.camera.lookAt(0, 1.33, 0);
    const key = new THREE.DirectionalLight('#fff1dc', 1.9); key.position.set(2.5, 4, 3.5);
    const fill = new THREE.DirectionalLight('#9ab8ff', .9); fill.position.set(-3, 2, 2);
    const rim = new THREE.DirectionalLight('#c89aff', 2.2); rim.position.set(-1, 3, -4);
    this.scene.add(new THREE.HemisphereLight('#d8d0ff', '#2a1e30', .8), key, fill, rim);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    // The studio light reflects in everything here, with every surface detail: it is one hero, close up.
    const studio = pmrem.fromScene(new RoomEnvironment(), .04).texture;
    this.kit = new HeroKit(studio); this.kit.envScale = .45; // the studio is far brighter than the sky
    this.kit.setQuality({ ibl: true, detail: true, post: true }); this.kit.setEnvironment(studio);
    pmrem.dispose();
    const floor = new THREE.Mesh(new THREE.CircleGeometry(1.1, 40), new THREE.MeshBasicMaterial({ color: '#9a6bff', transparent: true, opacity: .12 }));
    floor.rotation.x = -Math.PI / 2; this.scene.add(floor);
  }
  show(cls, look, now, dt) {
    if (!this.hero || this.hero.cls !== cls) {
      if (this.hero) this.scene.remove(this.hero.root);
      this.hero = new Hero(this.kit, cls, look); this.scene.add(this.hero.root);
    }
    this.hero.setLook(look);
    this.hero.update(dt, now, {});
    this.hero.root.rotation.y = Math.sin(now * .35) * .7;
    this.renderer.render(this.scene, this.camera);
  }
}
