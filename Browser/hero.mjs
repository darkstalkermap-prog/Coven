// The witch heroes: detailed, smooth-shaded models, each path with its own look:
//   Bloom: pink hair streaked green, a flower-laden hat hung with crystals, a petal gown, a green spell orb, a lotus staff.
//   Bog:   a hunched moss hag, glowing yellow eyes, stringy hair with glowing mushrooms, a cauldron, a mushroom staff.
//   Hex:   black and crimson with gold filigree, violet eyes and crystals, a rune swirl, a thorned crystal staff.
//   Wild:  an antler and skull headdress, feathers, face paint, fringed hides, a skull belt, a lantern staff.
// Quest givers wear their path's style in a revealing cut (`revealing`): bare shoulders, arms and midriff, wrapped in
// the path's material with opaque coverings over chest and hips under a sheer skirt.
// Every piece of equipped gear shows on the body and grows richer with rarity. Faces +z, feet at y = 0.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const PALETTES = {
  bloom: { robe: '#e47fb4', robe2: '#6fbf5e', robe3: '#f7c4da', trim: '#e0b450', hat: '#e690bc', band: '#6fbf5e', hair: '#f582b8', streak: '#86d270', skin: '#f3c9b2', eyes: '#3fe07a', lips: '#d0587a', glow: '#b8ff6a', crystal: '#ffc8e8', wood: '#7a5634' },
  bog: { robe: '#2c3222', robe2: '#1c2016', robe3: '#4a5a28', trim: '#8aa83a', hat: '#2a2a1c', band: '#5a6a2a', hair: '#26261c', streak: '#5f7a2a', skin: '#6e7a5a', eyes: '#ffd23a', lips: '#2a1a14', glow: '#b8ff3a', crystal: '#c8ff6a', wood: '#2e261a' },
  hex: { robe: '#141018', robe2: '#4a0c1e', robe3: '#2a0e1a', trim: '#d8aa48', hat: '#18121e', band: '#5a2a8a', hair: '#141018', streak: '#2a1a34', skin: '#e6cfd6', eyes: '#c070ff', lips: '#3a1030', glow: '#b45cff', crystal: '#b070ff', wood: '#2a1e1a' },
  wild: { robe: '#6a4a2a', robe2: '#4a3218', robe3: '#8a6a44', trim: '#d8c49a', hat: '#5a3a1e', band: '#7a2a1a', hair: '#5c3216', streak: '#8a5a2a', skin: '#b87a58', eyes: '#e8b030', lips: '#8a4a3a', glow: '#ffb040', crystal: '#ffcf80', wood: '#5a3e22' },
};
const STYLES = {
  bloom: { hunch: 0, eyeGlow: .7, hair: 'wavy', hairLen: .95, freckles: true, blush: true },
  bog: { hunch: .3, eyeGlow: 2.4, hair: 'stringy', hairLen: .85, hag: true },
  hex: { hunch: 0, eyeGlow: 1.8, hair: 'wavy', hairLen: 1, shadow: true },
  wild: { hunch: 0, eyeGlow: .6, hair: 'wavy', hairLen: .8, paint: true },
};
// Rarity accents: trim colour, metal colour, metalness/roughness, and glow strength.
const TIERS = [
  { trim: '#8a8a86', metal: '#6c6a66', metalness: .5, roughness: .7, glow: 0 },
  { trim: '#3fc75a', metal: '#9a7a4a', metalness: .7, roughness: .45, glow: 0 },
  { trim: '#4d94ff', metal: '#c8d2e0', metalness: .9, roughness: .3, glow: .4 },
  { trim: '#b45cff', metal: '#9c8cc0', metalness: .95, roughness: .25, glow: .9 },
  { trim: '#ffb43a', metal: '#e8b84a', metalness: 1, roughness: .22, glow: 1.4 },
];

const V2 = (r, y) => new THREE.Vector2(r, y), V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const lathe = (pts, segs = 28) => new THREE.LatheGeometry(pts.map(([r, y]) => V2(r, y)), segs);
const curve = pts => new THREE.CatmullRomCurve3(pts.map(p => V3(...p)));
// A sphere with fewer facets the smaller it is: a bead or berry needs a fraction of a head's.
function ball(r, w = 32, h = 16, ...rest) {
  const k = Math.min(1, Math.max(.4, r / .1));
  return new THREE.SphereGeometry(r, Math.max(5, Math.round(w * k)), Math.max(3, Math.round(h * k)), ...rest);
}
// A flower one unit across facing +z: five plump petals (a closed, smoothly shaded disc with a petalled rim) and a
// lighter inner ring of five more.
const flowers = new Map();
function flowerGeo(color) {
  const key = color.getHexString(), cached = flowers.get(key);
  if (cached) return cached;
  const pos = [], col = [], index = [], light = color.clone().lerp(new THREE.Color(1, 1, 1), .4);
  const vertex = (x, y, z, c) => { pos.push(x, y, z); col.push(c.r, c.g, c.b); return pos.length / 3 - 1; };
  const layer = (R, z0, top, bottom, turn, c) => {
    const d = Math.PI / 5, ring = [];
    for (let p = 0; p < 5; p++) {
      const t = (p + turn) / 5 * Math.PI * 2;
      for (const [a, r] of [[t - d, .3], [t - d * .55, .85], [t, 1], [t + d * .55, .85]]) ring.push(vertex(Math.cos(a) * r * R, Math.sin(a) * r * R, z0 + r * r * .3 * R, c));
    }
    const up = vertex(0, 0, z0 + top * R, c), down = bottom ? vertex(0, 0, z0 - bottom * R, c) : -1;
    for (let i = 0; i < ring.length; i++) {
      const j = (i + 1) % ring.length;
      index.push(up, ring[i], ring[j]);
      if (bottom) index.push(down, ring[j], ring[i]);
    }
  };
  layer(1, 0, .22, .12, 0, color);
  layer(.6, .1, .3, 0, .5, light);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  flowers.set(key, geo);
  return geo;
}
const DOUBLE = THREE.DoubleSide;
// The head's size against the body: natural proportions, about seven heads tall.
const HEAD_SCALE = .97;
// A tube that narrows along its length: `taper(t)` scales the radius at t in 0..1.
function taperedTube(points, radius, taper, segs = 24, radial = 8) {
  const c = curve(points), geo = new THREE.TubeGeometry(c, segs, radius, radial, false), pos = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const center = c.getPointAt(i / segs), k = taper(i / segs);
    for (let j = 0; j <= radial; j++) {
      const idx = i * (radial + 1) + j;
      v.fromBufferAttribute(pos, idx).sub(center).multiplyScalar(k).add(center);
      pos.setXYZ(idx, v.x, v.y, v.z);
    }
  }
  geo.computeVertexNormals();
  return geo;
}
// Paint a geometry one colour (as vertex colours). A geometry already painted another colour is copied first.
const linear = new Map();
function paint(geo, color, alpha = 1) {
  if (geo.userData.paint === color && geo.userData.alpha === alpha) return geo;
  if (geo.userData.paint) geo = geo.clone();
  const c = color.isColor ? color : linear.get(color) ?? linear.set(color, new THREE.Color(color)).get(color), n = geo.attributes.position.count;
  const size = alpha < 1 ? 4 : 3, a = new Float32Array(n * size);
  for (let i = 0; i < n; i++) { a[i * size] = c.r; a[i * size + 1] = c.g; a[i * size + 2] = c.b; if (size === 4) a[i * 4 + 3] = alpha; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, size));
  geo.userData.paint = color; geo.userData.alpha = alpha;
  return geo;
}
// A deterministic random stream, so every witch of a path looks the same.
function stream(seed) { let a = seed; return () => (a = (a * 16807) % 2147483647) / 2147483647; }
// A skirt or robe layer: a flared lathe whose hem is cut into petals (`lobes`) or rags (`ragged`).
function skirtGeo({ top = .17, hem = .5, length = .8, lobes = 0, depth = 0, ragged = 0, seed = 3, segs = 48 }) {
  const pts = [[top, 0], [top + .03, -.12 * length], [top + (hem - top) * .45, -.45 * length], [hem * .93, -.8 * length], [hem, -length]];
  const geo = lathe(pts, segs), pos = geo.attributes.position, n = pts.length, rand = stream(seed);
  for (let i = 0; i <= segs; i++) {
    const th = (i % segs) / segs * Math.PI * 2, petal = lobes ? Math.abs(Math.sin(th * lobes / 2)) : 0, rag = ragged ? rand() : 0;
    for (const [j, k] of [[n - 1, 1], [n - 2, .35]]) {
      const idx = i * n + j, s = 1 + depth * petal * k * .4;
      pos.setXYZ(idx, pos.getX(idx) * s, pos.getY(idx) - (depth * (1 - petal) * .9 + rag * ragged) * k, pos.getZ(idx) * s);
    }
  }
  geo.computeVertexNormals();
  return geo;
}

// Every vertex of a baked hero follows exactly one bone (see bakeSkinned): skin it with one bone lookup, not four.
// The emissive colour is used as a soft fill light, scaled by each part's own colour: cheaper than the
// environment map's diffuse light, and it keeps undersides (hat brims, skirts) from going black.
function heroShader(shader) {
  shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance *= diffuseColor.rgb;');
  shader.vertexShader = shader.vertexShader
    .replace('#include <skinbase_vertex>', '#ifdef USE_SKINNING\n\tmat4 skinMatrix = bindMatrixInverse * getBoneMatrix( skinIndex.x ) * bindMatrix;\n#endif')
    .replace('#include <skinnormal_vertex>', '#ifdef USE_SKINNING\n\tobjectNormal = ( skinMatrix * vec4( objectNormal, 0.0 ) ).xyz;\n#endif')
    .replace('#include <skinning_vertex>', '#ifdef USE_SKINNING\n\ttransformed = ( skinMatrix * vec4( transformed, 1.0 ) ).xyz;\n#endif');
}

// Skin: light wraps past the shadow line and bleeds red there, as it does through real skin (a cheap stand-in for
// subsurface scattering), on top of the standard physically based lighting.
const SKIN_CHUNK = THREE.ShaderChunk.lights_physical_pars_fragment.replace(
  'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );',
  `float wrapNL = saturate( ( dot( geometryNormal, directLight.direction ) + 0.5 ) / 1.5 );
	reflectedLight.directDiffuse += directLight.color * BRDF_Lambert( material.diffuseColor ) * ( dotNL + vec3( 0.95, 0.42, 0.3 ) * max( wrapNL - dotNL, 0.0 ) * 1.1 );`);
function skinShader(shader) {
  heroShader(shader);
  shader.fragmentShader = shader.fragmentShader.replace('#include <lights_physical_pars_fragment>', SKIN_CHUNK);
}

// Fine surface detail made in code (there are no texture assets): skin pores, the weave of cloth and the scratches
// on worn metal, as tiling normal and roughness maps.
function detailTextures() {
  const N = 256, rand = stream(91);
  const field = fill => { const h = new Float32Array(N * N); for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) h[y * N + x] = fill(x, y); return h; };
  const noise = (() => { const g = new Float32Array(32 * 32).map(() => rand()); return (x, y, f) => { const u = x / N * f, v = y / N * f, i = Math.floor(u), j = Math.floor(v), a = u - i, b = v - j, w = k => ((k % f) + f) % f;
    const at = (p, q) => g[(w(q) % 32) * 32 + (w(p) % 32)]; const s = t => t * t * (3 - 2 * t); return (at(i, j) * (1 - s(a)) + at(i + 1, j) * s(a)) * (1 - s(b)) + (at(i, j + 1) * (1 - s(a)) + at(i + 1, j + 1) * s(a)) * s(b); }; })();
  const normalMap = (h, k) => {
    const data = new Uint8Array(N * N * 4);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const dx = (h[y * N + (x + N - 1) % N] - h[y * N + (x + 1) % N]) * k, dy = (h[((y + N - 1) % N) * N + x] - h[((y + 1) % N) * N + x]) * k, l = Math.hypot(dx, dy, 1), i = (y * N + x) * 4;
      data.set([(dx / l * .5 + .5) * 255, (dy / l * .5 + .5) * 255, (1 / l * .5 + .5) * 255, 255], i);
    }
    return tex(data);
  };
  const greyMap = h => { const data = new Uint8Array(N * N * 4); for (let i = 0; i < N * N; i++) { const v = Math.max(0, Math.min(255, h[i] * 255)); data.set([v, v, v, 255], i * 4); } return tex(data); };
  const tex = data => { const t = new THREE.DataTexture(data, N, N); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = 4; t.needsUpdate = true; return t; };
  // Pores: many small pits over a soft unevenness.
  const pores = field((x, y) => noise(x, y, 8) * .35 + noise(x, y, 32) * .25 - (rand() < .045 ? .5 : 0));
  // Weave: threads over and under, with a little fuzz.
  const weave = field((x, y) => { const u = x / N * 64 * Math.PI, v = y / N * 64 * Math.PI, warp = Math.sin(u) * (Math.sin(v * .5) > 0 ? 1 : -1), weft = Math.sin(v) * (Math.sin(u * .5) > 0 ? -1 : 1); return .5 + .2 * Math.max(warp, weft) + noise(x, y, 32) * .15; });
  // Scratches: thin straight lines at random angles over a brushed grain.
  const scratch = field((x, y) => .45 + noise(x, y, 4) * .15 + noise(x, y, 32) * .05);
  for (let k = 0; k < 90; k++) {
    const a = rand() * Math.PI, x0 = rand() * N, y0 = rand() * N, len = 10 + rand() * 60, depth = .15 + rand() * .3;
    for (let t = 0; t < len; t++) { const x = Math.floor(x0 + Math.cos(a) * t) & (N - 1), y = Math.floor(y0 + Math.sin(a) * t) & (N - 1); scratch[y * N + x] -= depth; }
  }
  const skinRough = field((x, y) => .55 + noise(x, y, 4) * .25);
  return { skinNormal: normalMap(pores, 3), skinRough: greyMap(skinRough), clothNormal: normalMap(weave, 2.2), metalRough: greyMap(scratch), metalNormal: normalMap(scratch, 1.2) };
}

// Each path's eyes: an eyeball whose front pole carries the iris (fibres, a darker rim, a lighter ring round the
// pupil) and whose sclera is faintly veined towards the back.
function eyeTexture(color) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const g = c.getContext('2d'), base = new THREE.Color(color), rand = stream(base.getHex() % 2147483646 + 1);
  // Rows run from the front pole (top: the canvas is flipped onto the sphere) to the back of the eye.
  for (let y = 0; y < 128; y++) {
    const v = y / 127; // distance from the front pole, 0..1
    for (let x = 0; x < 128; x++) {
      let r, gr, b;
      if (v < .06) { r = gr = b = 8; }
      else if (v < .165) {
        const t = (v - .06) / .105, fibre = .75 + .5 * Math.abs(Math.sin(x * .9 + rand() * .6)) * (.6 + .4 * rand());
        const k = (t < .2 ? 1.35 : 1) * fibre * (1 - .55 * Math.max(0, (t - .75) / .25));
        r = base.r * 255 * k; gr = base.g * 255 * k; b = base.b * 255 * k;
      } else if (v < .19) { const t = (v - .165) / .025; r = 30 + 200 * t; gr = 26 + 196 * t; b = 30 + 190 * t; }
      else { const vein = rand() < .006 * v ? 40 : 0; r = 236 - v * 30 + vein * .3; gr = 230 - v * 50 - vein; b = 222 - v * 45 - vein; }
      g.fillStyle = `rgb(${r | 0},${gr | 0},${b | 0})`; g.fillRect(x, y, 1, 1);
    }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  // The glow of glowing eyes comes from the iris alone.
  const m = document.createElement('canvas'); m.width = m.height = 128;
  const mg = m.getContext('2d'); mg.fillStyle = '#000'; mg.fillRect(0, 0, 128, 128); mg.fillStyle = '#fff'; mg.fillRect(0, Math.round(127 * .055), 128, Math.round(127 * (.17 - .055)));
  t.userData.irisMask = new THREE.CanvasTexture(m);
  return t;
}

// Materials are shared by role and finish; colour is painted into each part's vertices, so parts of every colour
// with one finish are drawn together. Roles: skin, hair, cloth (matte), satin, metal, see-through, glowing, and
// the eyes. Each takes its detail maps, sheen and reflections from the quality level (see setQuality): on High and
// up the sky's own light (setEnvironment) lights everything, on lower levels a cheap fill does. Only open shells
// (skirts, brims, sleeves) are two-sided: the back faces of closed shapes would double the shading.
export class HeroKit {
  constructor(envMap, fill = .22) {
    this.envMap = envMap; this.fill = fill; this.cache = new Map(); this.all = []; this.solos = new Map();
    this.q = { ibl: false, detail: true, sheen: false }; this.sky = null; this.day = 1; this.envScale = 1;
    this.textures = detailTextures(); this.eyes = new Map();
  }
  mat(color, { metal = 0, rough = .8, glow = 0, glowColor, opacity = 1, side = THREE.FrontSide, kind } = {}) {
    const c = new THREE.Color(color), alpha = opacity, clear = opacity < 1;
    // See-through parts share one material, their opacity painted in with the colour.
    const transparent = { transparent: true, depthWrite: false, forceSinglePass: true };
    if (glow >= .4) {
      if (glowColor) c.lerp(new THREE.Color(glowColor), .65);
      c.multiplyScalar(Math.min(1.8, .8 + glow * .3));
      return { material: this.get(`glow${clear},${side}`, () => new THREE.MeshBasicMaterial({ vertexColors: true, side, ...(clear ? transparent : {}) }), 'glow'), tint: c, alpha };
    }
    if (glow) c.lerp(new THREE.Color(glowColor ?? color), .5).multiplyScalar(1 + glow);
    // Cloth and hair take the heavier physical shading (for sheen) only where the level shows it.
    const Cloth = this.q.sheen ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
    if (clear) return { material: this.get('sheer', () => new Cloth({ vertexColors: true, roughness: .6, side: DOUBLE, emissive: new THREE.Color(), ...transparent }), 'cloth'), tint: c, alpha };
    if (kind === 'skin') return { material: this.get(`skin${side}`, () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: rough, side, emissive: new THREE.Color() }), 'skin'), tint: c, alpha };
    if (kind === 'hair') return { material: this.get('hair', () => new Cloth({ vertexColors: true, roughness: .42, emissive: new THREE.Color() }), 'hair'), tint: c, alpha };
    metal = metal > .5 ? 1 : 0; rough = metal ? .3 : rough < .5 ? .4 : .78;
    const role = metal ? 'metal' : rough < .5 ? 'satin' : 'cloth';
    return { material: this.get(`lit${metal},${rough},${side}`, () => new (role === 'cloth' ? Cloth : THREE.MeshStandardMaterial)({ vertexColors: true, metalness: metal, roughness: rough, emissive: new THREE.Color(), side }), role), tint: c, alpha };
  }
  // The eyes of one path, glowing for those whose eyes glow.
  eye(color, glow = 0) {
    const key = `eye${color}${glow}`;
    if (!this.cache.has(key)) {
      const map = this.eyes.get(color) ?? this.eyes.set(color, eyeTexture(color)).get(color);
      this.get(key, () => new THREE.MeshStandardMaterial({ map, roughness: .35, emissive: glow ? new THREE.Color(color) : new THREE.Color(), emissiveMap: glow ? map.userData.irisMask : null, emissiveIntensity: glow * .7 }), glow ? 'eyeGlow' : 'eye');
    }
    return this.cache.get(key);
  }
  // The clear, wet cornea over each eye: it catches the light.
  cornea() { return this.get('cornea', () => new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .03, metalness: 0, transparent: true, opacity: .22, depthWrite: false }), 'cornea'); }
  get(key, make, role = 'cloth') {
    if (!this.cache.has(key)) {
      const m = make(); m.userData.role = role; m.onBeforeCompile = role === 'skin' ? skinShader : heroShader;
      this.cache.set(key, m); this.all.push(m); this.dress(m);
    }
    return this.cache.get(key);
  }
  // A copy of a shared material for a part drawn on its own (the cape, whose cloth moves vertex by vertex): one
  // material can't serve skinned and plain meshes without switching shader programs at every draw.
  solo(material) {
    if (!this.solos.has(material)) { const m = material.clone(); m.userData.role = material.userData.role; m.onBeforeCompile = heroShader; this.solos.set(material, m); this.dress(m); }
    return this.solos.get(material);
  }
  // Fit one material to the quality level: detail maps, sheen, reflections and fill.
  dress(m) {
    const role = m.userData.role, q = this.q, T = this.textures, before = `${!!m.envMap}${!!m.normalMap}${!!m.roughnessMap}${m.sheen > 0}`;
    if (role === 'glow') return;
    const shiny = role === 'metal' || role === 'cornea' || role === 'eye' || role === 'eyeGlow';
    m.envMap = q.ibl ? (this.sky ?? this.envMap) : shiny ? this.envMap : null;
    m.envMapIntensity = (q.ibl ? { metal: 1, satin: .7, cornea: 1.2, skin: .38, hair: .45, cloth: .45 }[role] ?? .6 : .32) * (role === 'metal' || role === 'cornea' ? 1 : this.envScale);
    const detail = q.detail && { skin: [T.skinNormal, .35, 7], cloth: [T.clothNormal, .45, 14], metal: [T.metalNormal, .25, 5] }[role];
    m.normalMap = detail ? detail[0] : null;
    if (detail) { m.normalScale = new THREE.Vector2(detail[1], detail[1]); m.normalMap.repeat.set(detail[2], detail[2]); }
    m.roughnessMap = q.detail ? role === 'skin' ? T.skinRough : role === 'metal' ? T.metalRough : null : null;
    if (m.isMeshPhysicalMaterial) {
      // A soft velvet rim on cloth and a gloss on hair; kept faint so dark cloth stays dark.
      m.sheen = q.sheen ? role === 'hair' ? .5 : role === 'cloth' ? .22 : 0 : 0;
      if (m.sheen) m.sheenColor = new THREE.Color(role === 'hair' ? '#d8d0c8' : '#6e6878'), m.sheenRoughness = role === 'hair' ? .35 : .8;
    }
    m.userData.fill = q.ibl ? .05 : this.fill;
    m.emissive?.setScalar(role === 'eyeGlow' ? 0 : m.userData.fill * (.4 + .6 * this.day));
    if (before !== `${!!m.envMap}${!!m.normalMap}${!!m.roughnessMap}${m.sheen > 0}`) m.needsUpdate = true;
  }
  // `q`: a quality level (graphics.mjs). Re-dresses every material made so far.
  setQuality(q) { this.q = { ibl: !!q.ibl, detail: !!q.detail, sheen: !!q.post }; for (const m of [...this.all, ...this.solos.values()]) this.dress(m); }
  // The sky's own light (a prefiltered environment map), used on High and up.
  setEnvironment(texture) {
    if (texture === this.sky) return;
    const first = !this.sky; this.sky = texture;
    if (this.q.ibl) for (const m of [...this.all, ...this.solos.values()]) if (m.userData.role !== 'glow') { m.envMap = texture; if (first) m.needsUpdate = true; }
  }
  // Night dims the reflections and the fill light, so heroes don't glow in the dark.
  setDaylight(day) {
    this.day = day;
    for (const m of [...this.all, ...this.solos.values()]) {
      if (m.userData.role === 'glow' || m.userData.role === 'eyeGlow') continue;
      if (m.envMap && !this.q.ibl) m.envMapIntensity = .14 + .3 * day;
      m.emissive?.setScalar((m.userData.fill ?? this.fill) * (.4 + .6 * day));
    }
  }
}

// Groups built with `fixed` set (flowers, skulls, crystal clusters) never move on their own: fold them into their
// parent, so their parts are skinned to it.
export function foldFixed(node) {
  for (const child of [...node.children]) if (child.isGroup) foldFixed(child);
  for (const child of [...node.children]) if (child.isGroup && child.userData.fixed) {
    child.updateMatrix();
    for (const part of [...child.children]) { part.applyMatrix4(child.matrix); node.add(part); }
    node.remove(child);
  }
}

// Draw a whole hero in a few calls: every part with one material is merged into one skinned mesh whose bones
// are the hero's own moving groups (hips, knees, arms, head, staff, spinning orbs...), so the model animates as
// before. The parts the meshes were built from stay in the tree, unrendered, as the source for the next bake.
// A hidden part (a broom put away, gear under a disguise) is drawn at zero scale.
const _zero = new Array(16).fill(0), _inv = new THREE.Matrix4(), _m = new THREE.Matrix4();
function bakeSkinned(hero) {
  const root = hero.root;
  for (const m of hero.baked ?? []) { root.remove(m); m.geometry.dispose(); }
  hero.skeleton?.dispose();
  const saved = root.matrix.clone(), parent = root.parent;
  // Bind in the hero's own space.
  root.matrix.identity(); root.matrixWorld.identity();
  for (const c of root.children) c.updateMatrixWorld(true);
  const bones = [], index = new Map(), byMaterial = new Map();
  const boneOf = o => { if (!index.has(o)) { index.set(o, bones.length); bones.push(o); } return index.get(o); };
  root.traverse(o => {
    if (!o.isMesh || o.userData.baked) return;
    if (o === hero.shadowMesh) return;
    if (o.userData.solo) { if (!o.userData.own) { o.material = hero.kit.solo(o.material); o.userData.own = true; } return; }
    const bone = boneOf(o.userData.keep ? o : o.parent), material = o.material;
    // Into the hero's space; every vertex follows its one bone.
    let g = o.geometry.index ? o.geometry.clone() : o.geometry.clone().setIndex([...Array(o.geometry.attributes.position.count).keys()]);
    g.applyMatrix4(_m.copy(o.matrixWorld));
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color' && k !== 'uv') g.deleteAttribute(k);
    if (!g.attributes.color) g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    const n = g.attributes.position.count;
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(n * 4).map((_, i) => i % 4 ? 0 : bone), 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Float32Array(n * 4).map((_, i) => i % 4 ? 0 : 1), 4));
    (byMaterial.get(material) ?? byMaterial.set(material, []).get(material)).push(g);
    o.layers.disableAll(); // the source part is no longer drawn itself
  });
  const skeleton = hero.skeleton = new THREE.Skeleton(bones), update = skeleton.update.bind(skeleton);
  // Bones hidden by their own or an ancestor's `visible` flag collapse to a point.
  skeleton.update = () => {
    update();
    for (let i = 0; i < bones.length; i++) {
      for (let o = bones[i]; o && o !== root; o = o.parent) if (!o.visible) { skeleton.boneMatrices.set(_zero, i * 16); break; }
    }
  };
  hero.baked = [];
  for (const [material, parts] of byMaterial) {
    const mesh = new THREE.SkinnedMesh(mergeGeometries(parts), material);
    for (const g of parts) g.dispose();
    mesh.userData.baked = true; mesh.castShadow = true; mesh.receiveShadow = !material.transparent;
    // Sized once for every pose: no per-frame bounds from the bones.
    mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.1, 0), 2.4);
    root.add(mesh); mesh.updateMatrixWorld(true);
    mesh.bind(skeleton, _inv.identity());
    hero.baked.push(mesh);
  }
  root.matrix.copy(saved);
  if (parent) root.updateMatrixWorld(true);
}

// A strike with the weapon hand, keyed through the swing (0 → 1): wind-up with the staff cocked back over the
// shoulder, the blow brought over the top and down onto what is in front of her, follow-through across the body,
// recovery. Hips turn a little ahead of the chest, she leans in on bent knees, and the head stays on the target.
// A cast instead lifts the weapon hand and points the staff's head at the target while the off hand pushes forward.
// Per joint, its angle (radians) at each key time; between keys a smooth curve.
const STRIKE = { t: [.12, .26, .4, .55, .75],
  armX: [-1.3, -2.55, -.55, -.15, -.45], armZ: [-.25, -.45, -.12, .22, -.12], elbow: [-1, -.8, -.08, -.15, -.85], wrist: [-.1, -.3, .45, .5, .1],
  hips: [-.03, -.09, .07, .11, .04], chest: [-.08, -.3, .12, .24, .08], lean: [-.02, -.08, .18, .14, .04], crouch: [0, .05, .22, .18, .05], off: [-.1, -.25, .25, .3, .1] };
const CAST = { t: [.12, .3, .5, .75],
  armX: [-.9, -1.45, -1.35, -.7], armZ: [-.2, -.15, -.1, -.15], elbow: [-.6, -.3, -.25, -.7], wrist: [0, .55, .45, .1],
  hips: [0, .03, .03, 0], chest: [-.05, .1, .08, 0], lean: [0, .08, .06, 0], crouch: [0, .06, .04, 0], off: [-.2, -.45, -.35, -.1] };
// Catmull-Rom through the keys of one joint, flat before the first and after the last.
function keyed(k, joint, u) {
  const t = k.t, v = k[joint], n = t.length;
  if (u <= t[0]) return v[0];
  if (u >= t[n - 1]) return v[n - 1];
  let i = 0;
  while (u > t[i + 1]) i++;
  const s = (u - t[i]) / (t[i + 1] - t[i]), p0 = v[Math.max(0, i - 1)], p1 = v[i], p2 = v[i + 1], p3 = v[Math.min(n - 1, i + 2)];
  return .5 * (2 * p1 + (p2 - p0) * s + (2 * p0 - 5 * p1 + 4 * p2 - p3) * s * s + (3 * p1 - p0 - 3 * p2 + p3) * s * s * s);
}
const ease = x => x * x * (3 - 2 * x);
// Long weapons stand upright through the fist, the forearm forward: how a tall staff is really held.
const POLES = new Set(['staff', 'spear']);

export class Hero {
  constructor(kit, classId, look = {}, { scale = 1, revealing = false } = {}) {
    this.kit = kit; this.cls = PALETTES[classId] ? classId : 'wild'; this.pal = PALETTES[this.cls]; this.style = STYLES[this.cls];
    this.revealing = revealing;
    // Quest givers are young and beautiful whatever their path: no hag's face or stoop for the Bog elder.
    if (revealing && this.style.hag) { this.style = { ...this.style, hag: false, hunch: 0, hair: 'wavy', eyeGlow: 1.4, hairLen: 1 }; this.pal = { ...this.pal, skin: '#a9b892', hair: '#2e3a1c', lips: '#5a2a3a' }; }
    this.root = new THREE.Group(); this.root.scale.setScalar(scale);
    this.phase = 0; this.sway = 0; this.lookKey = null; this.gear = []; this.spinners = [];
    this.buildBody();
    // Wide skirts hold the arms a little further out, so hands don't pass through them.
    this.hipWidth = revealing ? 0 : .05;
    foldFixed(this.root);
    this.setLook(look);
  }

  // A part that moves or hides on its own (a spinning orb, a wing, the bodice under a disguise): its own bone.
  keep(mesh) { mesh.userData.keep = true; return mesh; }
  add(parent, geo, material, x = 0, y = 0, z = 0) {
    if (material.tint) { geo = paint(geo, material.tint, material.alpha); material = material.material; }
    const m = new THREE.Mesh(geo, material); m.position.set(x, y, z); parent.add(m); return m;
  }
  m(color, opts) { return this.kit.mat(color, opts); }
  // A group that moves with its parent only (it is folded into it); `moving()` marks one that animates on its own.
  group(parent, x = 0, y = 0, z = 0) { const g = new THREE.Group(); g.position.set(x, y, z); g.userData.fixed = true; parent.add(g); return g; }
  moving(g) { g.userData.fixed = false; return g; }
  // Something that turns or bobs every frame (orbs, rune rings, butterflies).
  spin(obj, speed, axis = 'y', bob = 0) { obj.userData.fixed = false; this.spinners.push({ obj, speed, axis, bob, y: obj.position.y }); return obj; }

  // ---------- small parts ----------
  flower(parent, x, y, z, color, size = .05, center = '#ffd84a') {
    // Low-poly: dozens of flowers are worn at once.
    const f = this.group(parent, x, y, z), petals = this.m(color, { rough: .6 });
    this.add(f, flowerGeo(petals.tint), petals.material).scale.setScalar(size);
    this.add(f, new THREE.OctahedronGeometry(size * .18, 0), this.m(center, { rough: .5 }), 0, 0, size * .3);
    return f;
  }
  leaf(parent, x, y, z, color, size = .06, rx = 0, ry = 0, rz = 0) {
    const l = this.add(parent, ball(size, 6, 4), this.m(color, { rough: .65 }), x, y, z);
    l.scale.set(.45, 1, .12); l.rotation.set(rx, ry, rz); return l;
  }
  crystal(parent, x, y, z, size, mat, stretch = 2.2) { const c = this.add(parent, new THREE.OctahedronGeometry(size, 0), mat, x, y, z); c.scale.y = stretch; return c; }
  strand(parent, pts, r, mat, taper = .75, segs = 10, radial = 4) { return this.add(parent, taperedTube(pts, r, t => 1 - t * taper, segs, radial), mat); }
  // A crystal hanging from a fine chain.
  pendant(parent, x, y, z, len, size, chainMat, gemMat) {
    this.add(parent, new THREE.CylinderGeometry(.002, .002, len, 3), chainMat, x, y - len / 2, z);
    this.crystal(parent, x, y - len - size * 1.6, z, size, gemMat);
  }
  // A helix of thin tube winding round a shape whose radius at height t is r(t).
  helix(parent, r, y0, y1, turns, thick, mat, phase = 0, zs = 1) {
    const pts = [];
    for (let i = 0; i <= 24; i++) { const t = i / 24, a = phase + t * turns * Math.PI * 2; pts.push([Math.cos(a) * r(t), y0 + (y1 - y0) * t, Math.sin(a) * r(t) * zs]); }
    return this.add(parent, new THREE.TubeGeometry(curve(pts), Math.max(12, Math.round(Math.abs(turns) * 14)), thick, 3, false), mat);
  }

  buildBody() {
    const P = this.pal, S = this.style, root = this.root, rev = this.revealing, skin = this.m(P.skin, { rough: S.hag ? .8 : .5, kind: 'skin' });
    // A soft shadow keeps her on the ground.
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(.55, 24), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: .32, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = .03; root.add(this.shadowMesh = shadow);

    const body = this.body = this.moving(this.group(root));
    // Legs: hip → knee → boot. Bare under a quest giver's sheer skirt; Hex wears dark greaves.
    const legMat = rev ? skin : this.m(P.robe2), shinMat = this.cls === 'hex' && !rev ? this.m('#3a3640', { metal: .8, rough: .35 }) : legMat;
    // Shaped legs: a full thigh tapering to the knee, a curved calf narrowing to the ankle.
    const thigh = lathe([[.001, .02], [.07, 0], [.082, -.08], [.072, -.26], [.052, -.44], [.001, -.47]], 18);
    const calf = lathe([[.001, .02], [.05, 0], [.058, -.1], [.05, -.24], [.033, -.4], [.001, -.43]], 18);
    this.legs = [-1, 1].map(side => {
      const hip = this.moving(this.group(body, side * .088, .95, 0));
      this.add(hip, thigh, legMat);
      const knee = this.moving(this.group(hip, 0, -.46, 0));
      this.add(knee, calf, shinMat);
      if (this.cls === 'hex' && !rev) for (let k = 0; k < 3; k++) this.add(knee, new THREE.TorusGeometry(.06, .006, 4, 16), this.m(P.trim, { metal: 1, rough: .3 }), 0, -.08 - k * .1, 0).rotation.x = Math.PI / 2;
      if (this.cls === 'wild') this.helix(knee, () => .058, -.05, -.36, 1.5, .006, this.m('#2a1a12', { rough: .9 }), side);
      return { hip, knee, boot: this.moving(this.group(knee, 0, -.42, 0)) };
    });

    this.skirt = this.moving(this.group(body, 0, 1.06, 0));
    const torso = this.torso = this.moving(this.group(body, 0, 1.04, 0));
    // A fitted body: a skin torso under clothes or wraps; the cut is the path's.
    const bodyMat = rev || this.cls === 'wild' ? skin : this.m(P.robe, { rough: .7 });
    this.bodice = this.keep(this.add(torso, lathe([[.155, 0], [.15, .1], [.17, .22], [.18, .3], [.165, .4], [.09, .47], [.001, .48]], 32), bodyMat));
    this.bodice.scale.z = .8;
    if (rev) for (const s of [-1, 1]) this.add(torso, ball(.068, 16, 12), skin, s * .07, .32, .1).scale.set(1, .95, .85);
    this.outfit();

    // Arms: shoulder → elbow → hand. Right is -x (she faces +z).
    const sleeved = !rev && this.cls !== 'wild';
    this.arms = [1, -1].map(side => {
      const shoulder = this.moving(this.group(torso, side * .21, .42, 0));
      this.add(shoulder, ball(.06, 10, 8), sleeved ? this.m(P.robe) : skin);
      this.add(shoulder, new THREE.CapsuleGeometry(.045, .2, 4, 10), sleeved ? this.m(P.robe) : skin, 0, -.14, 0);
      const elbow = this.moving(this.group(shoulder, 0, -.28, 0));
      this.add(elbow, new THREE.CapsuleGeometry(.038, .18, 4, 10), skin, 0, -.12, 0);
      const sleeve = sleeved ? this.moving(this.group(elbow)) : null;
      if (sleeved) this.sleeve(sleeve);
      else this.armWraps(shoulder, elbow, side);
      const hand = this.moving(this.group(elbow, 0, -.27, 0));
      this.hand(hand, side, skin, side < 0 ? .95 : .4);
      return { shoulder, elbow, hand, side, sleeve };
    });

    this.buildHead(skin);
    this.signature();

    // Disguise for Glamour: a plain traveller's hood and cloak over everything.
    const plain = this.m('#6a5238', { rough: .9, side: DOUBLE });
    this.disguise = this.moving(this.group(body)); this.disguise.visible = false;
    this.add(this.disguise, lathe([[.07, 1.6], [.24, 1.48], [.28, 1.2], [.36, .7], [.46, .2], [.48, .14]], 28), plain);
    this.add(this.disguise, ball(.17, 20, 14, 0, Math.PI * 2, 0, Math.PI * .62), plain, 0, 1.67, -.015).scale.set(1, 1.15, 1.12);

    // The broom, shown when riding: a gnarled handle, bindings and a fan of straw.
    this.broom = this.moving(this.group(root, 0, .62, 0)); this.broom.visible = false;
    this.add(this.broom, taperedTube([[0, 0, 1.3], [.02, .03, .6], [-.02, -.01, -.1], [0, 0, -.75]], .032, t => .8 + t * .3, 24, 7), this.m('#5c3e24', { rough: .7 }));
    const straw = lathe([[.04, 0], [.09, -.12], [.17, -.45], [.2, -.62], [.0, -.6]], 20), sp = straw.attributes.position;
    for (let i = 0; i < sp.count; i++) { const y = sp.getY(i); if (y < -.5) { sp.setX(i, sp.getX(i) * (1 + Math.sin(i * 7.1) * .18)); sp.setZ(i, sp.getZ(i) * (1 + Math.cos(i * 5.3) * .18)); sp.setY(i, y - Math.abs(Math.sin(i * 3.7)) * .08); } }
    straw.computeVertexNormals();
    this.add(this.broom, straw, this.m('#c9a65a', { rough: .9, side: DOUBLE }), 0, 0, -.72).rotation.x = -Math.PI / 2;
    for (const z of [-.76, -.86]) this.add(this.broom, new THREE.TorusGeometry(.06, .012, 6, 18), this.m('#7a2a2a', { rough: .6 }), 0, 0, z);
  }

  // The path's clothing: skirts, bodice details, belts and adornments.
  outfit() {
    const P = this.pal, torso = this.torso, skirt = this.skirt, rev = this.revealing, cls = this.cls, rand = stream(cls.length * 97 + 11);
    const gold = this.m(P.trim, { metal: 1, rough: .3 });
    const layer = (opts, color, extra = {}) => this.add(skirt, skirtGeo(opts), this.m(color, { side: DOUBLE, rough: .75, ...extra }));
    if (rev) {
      // Quest givers: a sheer skirt over an opaque wrap at the hips, chest coverings in the path's material.
      this.robeSkirt = this.keep(layer({ top: .17, hem: .52, length: .86, lobes: cls === 'bloom' ? 9 : 0, depth: cls === 'bloom' ? .1 : 0, ragged: cls === 'bloom' ? 0 : .12, seed: 5 }, P.robe, { opacity: .38 }));
      this.add(skirt, skirtGeo({ top: .165, hem: .2, length: .2, ragged: cls === 'bloom' ? 0 : .05, lobes: cls === 'bloom' ? 7 : 0, depth: .05 }), this.m(cls === 'bog' ? P.robe3 : P.robe2, { side: DOUBLE, rough: .7 }));
      this.add(torso, new THREE.TorusGeometry(.16, .022, 6, 32), cls === 'hex' ? gold : this.m(P.robe2, { rough: .7 }), 0, .02, 0).scale.z = .8;
      this.chestCover();
    } else if (cls === 'bloom') {
      this.robeSkirt = this.keep(layer({ hem: .56, length: .9, lobes: 11, depth: .14, seed: 1 }, P.robe3));
      layer({ top: .172, hem: .5, length: .76, lobes: 9, depth: .16, seed: 2 }, P.robe2);
      layer({ top: .174, hem: .44, length: .58, lobes: 7, depth: .14, seed: 3 }, P.robe);
      for (let i = 0; i < 4; i++) this.helix(skirt, t => .2 + t * .3, -.05, -.8, .6, .006, gold, i * 1.6);
      for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2 + (i % 2) * .2, y = i % 2 ? -.45 : -.62, rr = i % 2 ? .38 : .46; this.flower(skirt, Math.cos(a) * rr, y, Math.sin(a) * rr, ['#ff5f9e', '#ffe0ec', '#ff9cc4'][i % 3], .06, '#c0306a').lookAt(Math.cos(a) * 5, y, Math.sin(a) * 5); }
      for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2 + .3; this.leaf(skirt, Math.cos(a) * .42, -.52, Math.sin(a) * .42, '#5aa848', .07, .4, -a, .5); }
    } else if (cls === 'hex') {
      this.robeSkirt = this.keep(layer({ hem: .52, length: .9, ragged: .12, seed: 7 }, P.robe2));
      layer({ top: .172, hem: .56, length: .94, ragged: .34, seed: 8 }, P.robe);
      layer({ top: .174, hem: .4, length: .42, ragged: .16, seed: 6 }, P.robe);
      for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; this.add(skirt, taperedTube([[Math.cos(a) * .18, -.03, Math.sin(a) * .15], [Math.cos(a) * .3, -.4, Math.sin(a) * .28], [Math.cos(a) * .47, -.8, Math.sin(a) * .46]], .005, () => 1, 12, 3), gold); }
    } else if (cls === 'bog') {
      this.robeSkirt = this.keep(layer({ hem: .54, length: .92, ragged: .22, seed: 9 }, P.robe));
      layer({ top: .175, hem: .48, length: .8, ragged: .25, seed: 10 }, P.robe2);
    } else {
      this.robeSkirt = this.keep(layer({ hem: .5, length: .86, ragged: .18, seed: 12 }, P.robe2));
      layer({ top: .175, hem: .4, length: .5, ragged: .12, seed: 13 }, P.robe);
    }

    // Upper body by path.
    if (cls === 'bloom' && !rev) {
      for (const s of [1, -1]) this.helix(torso, t => .16 + t * .03, 0, .4, 1.2, .005, gold, s > 0 ? 0 : Math.PI, .8);
      for (let i = 0; i < 7; i++) { const a = -.5 + i * .17; this.flower(torso, Math.sin(a) * .2 + .03, .02 + Math.cos(i * 1.3) * .03, Math.cos(a) * .17, i % 3 ? '#f0a8c8' : '#fff0f4', .045 + (i % 2) * .015); }
      for (let i = 0; i < 6; i++) this.leaf(torso, -.12 + i * .05, -.02, .17, '#7ab84a', .05, .3, 0, i);
      this.flower(torso, .2, .42, .02, '#f0a8c8', .06);
    }
    if (cls === 'hex' && !rev) {
      for (const s of [1, -1]) for (let k = 0; k < 3; k++) this.helix(torso, t => .158 + t * .02, 0, .42, s * 1.1, .004, gold, k * 2.1, .8);
      this.crystal(torso, 0, .3, .155, .02, this.m(P.crystal, { glow: 1.2, rough: .1 }));
      for (let i = 0; i < 26; i++) { const a = i / 26 * Math.PI * 2, spike = this.add(torso, new THREE.ConeGeometry(.03, .14, 5), this.m('#0e0a12', { rough: 1 }), Math.cos(a) * .19, .46, Math.sin(a) * .15); spike.rotation.set(Math.sin(a) * .9, 0, -Math.cos(a) * .9); }
    }
    if (cls === 'bog') {
      // A mantle of hanging moss, stringy and long, over the shoulders and back.
      const moss = [this.m('#3a4a1e', { rough: 1 }), this.m('#55682a', { rough: 1 }), this.m('#2a3218', { rough: 1 })];
      for (let i = 0; i < 46; i++) {
        const a = rand() * Math.PI * 2, r = .2 + rand() * .05, x = Math.cos(a) * r, z = Math.sin(a) * r * .85, len = .35 + rand() * .55;
        this.strand(torso, [[x, .44, z], [x * 1.15, .3, z * 1.15], [x * 1.25, .44 - len * .6, z * 1.3], [x * 1.3 + (rand() - .5) * .05, .44 - len, z * 1.35]], .012 + rand() * .01, moss[i % 3], .7, 8, 3);
      }
      for (let i = 0; i < 5; i++) this.add(torso, ball(.04, 8, 6), this.m('#4a5a28', { rough: 1 }), (rand() - .5) * .3, .35 + rand() * .1, .12 + rand() * .05).scale.y = .6;
    }
    if (cls === 'wild') {
      if (!rev) {
        // A hide top across the chest, a fur mantle, a fringe of hide strips and a skull at the belt.
        const top = this.add(torso, lathe([[.165, .2], [.178, .24], [.2, .31], [.19, .4], [.12, .47]], 28), this.m(P.robe3, { rough: .8, side: DOUBLE })); top.scale.z = .85;
        for (let i = 0; i < 9; i++) this.add(torso, new THREE.PlaneGeometry(.03, .08), this.m(P.robe, { rough: .85, side: DOUBLE }), (i - 4) * .035, .17, .155).rotation.x = -.15;
        for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2, f = this.add(torso, new THREE.IcosahedronGeometry(.05, 1), this.m(i % 2 ? '#7a5a3a' : '#5a4228', { rough: 1 }), Math.cos(a) * .2, .45, Math.sin(a) * .16); f.scale.y = .7; }
      }
      const hide = [this.m(P.robe, { rough: .85, side: DOUBLE }), this.m(P.robe3, { rough: .85, side: DOUBLE }), this.m('#3e2a14', { rough: .85, side: DOUBLE })];
      for (let i = 0; i < 34; i++) {
        const a = i / 34 * Math.PI * 2 + rand() * .1, x = Math.cos(a) * .19, z = Math.sin(a) * .16, len = .3 + rand() * .45;
        const s = this.add(skirt, new THREE.PlaneGeometry(.045, len, 1, 3), hide[i % 3], x * 1.3, -len / 2 - .02, z * 1.3); s.rotation.y = -a + Math.PI / 2; s.rotation.x = -Math.sin(a) * .15; s.rotation.z = Math.cos(a) * .15;
      }
      this.add(torso, new THREE.TorusGeometry(.17, .02, 6, 30), this.m('#3a2614', { rough: .6 }), 0, .02, 0).scale.z = .82;
      const skull = this.group(torso, .06, -.02, .16);
      this.add(skull, ball(.05, 14, 10), this.m('#e8dcc0', { rough: .6 })).scale.set(.9, 1, .85);
      for (const s of [-1, 1]) this.add(skull, ball(.013, 8, 6), this.m('#1a1210'), s * .018, .005, .04);
      this.add(skull, new THREE.BoxGeometry(.05, .02, .03), this.m('#e8dcc0', { rough: .6 }), 0, -.04, .015);
      // Necklaces: a cord of teeth and a brass talisman.
      this.add(torso, new THREE.TorusGeometry(.11, .004, 4, 28), this.m('#3a2614'), 0, .45, .04).rotation.x = Math.PI / 2 - .5;
      for (let i = 0; i < 7; i++) { const a = Math.PI * (.25 + i / 6 * .5); this.add(torso, new THREE.ConeGeometry(.008, .03, 5), this.m('#f0e6d0'), Math.cos(a) * .1, .4 - Math.sin(a) * .03, Math.sin(a) * .09 + .05).rotation.x = Math.PI; }
      this.add(torso, new THREE.CylinderGeometry(.03, .03, .006, 16), this.m('#c8a050', { metal: 1, rough: .3 }), 0, .28, .155).rotation.x = Math.PI / 2;
      for (let i = 0; i < 3; i++) this.leaf(torso, -.14 + i * .02, -.05, .15, i ? '#e8dcc0' : '#8a5a2a', .06, .2, 0, .3 + i * .2);
    }
    if (cls !== 'wild' && cls !== 'bog' && !rev) {
      // A belt with a pouch and a glowing potion.
      this.add(torso, new THREE.TorusGeometry(.162, .018, 6, 32), this.m('#3a2618', { rough: .6 }), 0, .02, 0).scale.z = .8;
      this.add(torso, new THREE.TorusGeometry(.026, .007, 4, 4), gold, 0, .02, .13);
      const pouch = this.add(torso, new THREE.CapsuleGeometry(.04, .045, 4, 8), this.m('#5a3a22', { rough: .7 }), .15, -.06, .06); pouch.scale.z = .6;
      this.add(torso, new THREE.CylinderGeometry(.02, .024, .075, 10), this.m('#e8f4ff', { rough: .1, opacity: .45 }), -.15, -.07, .05);
      this.add(torso, new THREE.CylinderGeometry(.016, .02, .05, 10), this.m(P.glow, { glow: 1, rough: .3 }), -.15, -.08, .05);
    }
  }

  // Quest givers' coverings: flowers and vines, moss, black lace and gold, or hide and feathers.
  chestCover() {
    const P = this.pal, torso = this.torso, cls = this.cls, rand = stream(31);
    for (const s of [-1, 1]) {
      const cup = this.group(torso, s * .072, .32, .145);
      if (cls === 'bloom') {
        for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2; this.flower(cup, Math.cos(a) * .035, Math.sin(a) * .035, .0, k % 2 ? '#f6b6d2' : '#ffe4ee', .04); }
        this.flower(cup, 0, 0, .02, '#f08ab8', .055);
      } else if (cls === 'bog') {
        for (let k = 0; k < 9; k++) this.add(cup, new THREE.IcosahedronGeometry(.032, 1), this.m(k % 2 ? '#4a5a24' : '#6a7a30', { rough: 1 }), (rand() - .5) * .07, (rand() - .5) * .07, rand() * .02).scale.z = .6;
        this.add(cup, ball(.02, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), this.m(P.glow, { glow: 1.6 }), .02, .03, .03);
      } else if (cls === 'hex') {
        const lace = this.add(cup, ball(.078, 16, 12, 0, Math.PI * 2, 0, Math.PI * .7), this.m('#120c16', { rough: .5 })); lace.rotation.x = Math.PI / 2; lace.scale.set(1, .9, .9);
        this.add(cup, new THREE.TorusGeometry(.07, .004, 4, 24), this.m(P.trim, { metal: 1, rough: .3 }), 0, 0, .025);
        this.crystal(cup, 0, 0, .06, .012, this.m(P.crystal, { glow: 1.2 }));
      } else {
        const hide = this.add(cup, ball(.078, 14, 10, 0, Math.PI * 2, 0, Math.PI * .7), this.m(P.robe3, { rough: .85 })); hide.rotation.x = Math.PI / 2;
        for (let k = 0; k < 3; k++) this.leaf(cup, (k - 1) * .03, -.06, .03, k === 1 ? '#f2ead8' : '#8a5a2a', .045, .3, 0, (k - 1) * .4);
      }
    }
    // Vines, chains or cords crossing between and around the body.
    const binding = cls === 'hex' ? this.m(P.trim, { metal: 1, rough: .3 }) : cls === 'bog' ? this.m('#3a4a1e', { rough: 1 }) : cls === 'wild' ? this.m('#3a2614') : this.m('#7ab84a', { rough: .6 });
    for (const s of [1, -1]) this.helix(torso, t => .15 + Math.sin(t * Math.PI) * .03, -.02, .44, s * .9, cls === 'hex' ? .004 : .007, binding, s > 0 ? .5 : 2.6, .8);
    if (cls === 'bloom') for (let i = 0; i < 6; i++) this.flower(torso, Math.cos(i) * .16, .02 + (i % 2) * .02, Math.sin(i * 1.7) * .12 + .03, '#f6b6d2', .04);
  }

  // Bell sleeves in the path's colours.
  sleeve(elbow) {
    const P = this.pal, cls = this.cls, ragged = cls === 'hex' || cls === 'bog';
    const outer = cls === 'bloom' ? this.m(P.robe, { side: DOUBLE, opacity: .55, rough: .4 }) : this.m(P.robe, { side: DOUBLE });
    const geo = ragged ? skirtGeo({ top: .05, hem: .15, length: .32, ragged: .1, seed: 21, segs: 24 }) : lathe([[.05, .03], [.065, -.08], [.11, -.2], [.135, -.26]], 20);
    this.add(elbow, geo, outer, 0, ragged ? .02 : 0, 0);
    if (cls === 'hex') this.add(elbow, skirtGeo({ top: .045, hem: .13, length: .3, ragged: .08, seed: 22, segs: 24 }), this.m(P.robe2, { side: DOUBLE }), 0, .015, 0);
    if (cls === 'bloom') { this.add(elbow, new THREE.TorusGeometry(.045, .006, 6, 18), this.m(P.trim, { metal: 1, rough: .3 }), 0, -.2, 0).rotation.x = Math.PI / 2; this.helix(elbow, () => .045, -.02, -.22, 2, .004, this.m('#7ab84a'), 0); }
    else this.add(elbow, new THREE.TorusGeometry(.13, .01, 6, 24), this.m(P.trim, { rough: .5, metal: cls === 'hex' ? 1 : 0 }), 0, -.25, 0).rotation.x = Math.PI / 2;
  }

  // Bare arms: vines, gold bands, moss or tattoos.
  armWraps(shoulder, elbow, side) {
    const P = this.pal, cls = this.cls;
    if (cls === 'wild') { this.helix(shoulder, () => .047, -.04, -.26, 1.6, .005, this.m('#2a1a12', { rough: .9 }), side); this.helix(elbow, () => .04, -.02, -.22, 1.4, .005, this.m('#2a1a12', { rough: .9 }), side * 2); this.add(elbow, new THREE.CylinderGeometry(.045, .042, .06, 12), this.m(P.robe3, { rough: .8 }), 0, -.2, 0); }
    if (cls === 'bloom') { this.helix(shoulder, () => .05, 0, -.26, 1.2, .005, this.m('#7ab84a'), side); this.helix(elbow, () => .042, -.02, -.22, 1.6, .005, this.m(P.trim, { metal: 1, rough: .3 }), side); this.flower(shoulder, side * .03, .03, .04, '#f6b6d2', .04); }
    if (cls === 'hex') { for (let k = 0; k < 3; k++) this.add(elbow, new THREE.TorusGeometry(.042, .005, 4, 16), this.m(P.trim, { metal: 1, rough: .3 }), 0, -.08 - k * .05, 0).rotation.x = Math.PI / 2; this.add(shoulder, skirtGeo({ top: .06, hem: .1, length: .16, ragged: .06, seed: 40, segs: 16 }), this.m('#120c16', { side: DOUBLE, opacity: .7 }), 0, .03, 0); }
    if (cls === 'bog') for (let k = 0; k < 4; k++) this.strand(shoulder, [[side * .03, .02, .02 * k], [side * .05, -.1, .03], [side * .05, -.25, .02]], .008, this.m('#3a4a1e', { rough: 1 }), .6, 6, 3);
  }

  // Head: a face of the path's kind, and hair.
  // A hand: a shaped palm, four jointed fingers of natural lengths curling towards the palm, a thumb set apart, and
  // nails. `curl` 0 is open, 1 a closed grip (the staff hand).
  hand(hand, side, skin, curl) {
    const S = this.style, long = S.hag ? 1.25 : 1, nail = this.m(S.hag ? '#c8c098' : '#f0d0c8', { rough: .35 });
    const palm = this.add(hand, ball(.042, 12, 10), skin, 0, -.032, .004); palm.scale.set(.82, 1, .48);
    [.05, .057, .054, .044].forEach((len, f) => {
      const x = (f - 1.5) * .0175 * side, l = len * long, c = curl * (.9 + f * .08), y0 = -.068;
      // Three phalanges, each bending a little more than the last.
      const a1 = .25 * c, a2 = a1 + .55 * c, a3 = a2 + .5 * c, l1 = l * .45, l2 = l * .32, l3 = l * .23;
      const p1 = [x, y0 - Math.cos(a1) * l1, Math.sin(a1) * l1], p2 = [x * 1.02, p1[1] - Math.cos(a2) * l2, p1[2] + Math.sin(a2) * l2], p3 = [x * 1.03, p2[1] - Math.cos(a3) * l3, p2[2] + Math.sin(a3) * l3];
      this.add(hand, taperedTube([[x, y0 + .012, 0], [x, y0, 0], p1, p2, p3], .0088, t => 1 - t * .32, 6, 5), skin);
      this.add(hand, ball(.0055, 6, 4), nail, p3[0], p3[1] + Math.cos(a3) * .004, p3[2] + .0035 - Math.sin(a3) * .002).scale.set(1, 1.3, .45);
    });
    const tc = .3 + curl * .5;
    this.add(hand, taperedTube([[side * .022, -.02, .012], [side * .036, -.04, .022], [side * (.04 - tc * .012), -.058, .032 + tc * .008], [side * (.036 - tc * .02), -.072, .04 + tc * .006]], .0095, t => 1 - t * .3, 8, 6), skin);
  }

  // An eye: an eyeball whose iris follows her gaze (see update), a clear cornea that catches the light, a lower
  // lid, and an upper lid with lashes that blinks.
  eye(head, s, { x = .045, y = .012, z = .099, r = .021, color, glow = 0, lash = '#1a1210' }) {
    const gaze = this.moving(this.group(head, s * x, y, z));
    const ballGeo = new THREE.SphereGeometry(r, 18, 12); ballGeo.rotateX(Math.PI / 2); // the iris pole faces forward
    this.add(gaze, ballGeo, this.kit.eye(color, glow));
    const corneaGeo = new THREE.SphereGeometry(r * 1.035, 14, 4, 0, Math.PI * 2, 0, Math.PI * .3); corneaGeo.rotateX(Math.PI / 2);
    this.add(gaze, corneaGeo, this.kit.cornea(), 0, 0, r * .015);
    const skin = this.m(this.pal.skin, { rough: .5, kind: 'skin' });
    const upper = this.moving(this.group(head, s * x, y, z));
    this.add(upper, new THREE.SphereGeometry(r * 1.13, 14, 5, 0, Math.PI * 2, 0, Math.PI * .5), skin).scale.set(1.05, 1, 1.02);
    const lashes = new THREE.TorusGeometry(r * 1.14, .0011, 3, 14, Math.PI); lashes.rotateX(Math.PI / 2);
    this.add(upper, lashes, this.m(lash, { rough: .8 })).scale.set(1.08, 1, 1.03);
    const lower = this.group(head, s * x, y, z);
    const lowerGeo = new THREE.SphereGeometry(r * 1.1, 14, 4, 0, Math.PI * 2, Math.PI * .5, Math.PI * .5);
    this.add(lower, lowerGeo, skin).rotation.x = .62;
    upper.userData.open = -.62; upper.rotation.x = -.62;
    return { gaze, lid: upper };
  }

  // A sculpted head: a rounded skull, temples, cheekbones, a jaw narrowing to the chin, eye sockets and a brow.
  // The hag's is longer and gaunter.
  headGeometry(hag) {
    const R = .125, geo = new THREE.SphereGeometry(R, 34, 24), hp = geo.attributes.position;
    const bump = (x, y, z, cx, cy, cz, r) => Math.exp(-((x - cx) ** 2 + (y - cy) ** 2 + (z - cz) ** 2) / (r * r));
    for (let i = 0; i < hp.count; i++) {
      let x = hp.getX(i), y = hp.getY(i), z = hp.getZ(i);
      const low = Math.max(0, -y / R), front = Math.max(0, z / R), ax = Math.abs(x);
      x *= 1 - low * (hag ? .4 : .32) - (1 - front) * low * .05;
      y *= hag ? 1.2 : 1.13;
      z *= 1.04;
      if (z > 0) z += low * low * (hag ? .05 : .03); // the chin forward
      let push = 0;
      push += bump(ax, y, z, .068, -.01, .088, .03) * .009;           // cheekbones
      push -= bump(ax, y, z, .045, .014, .112, .022) * .011;          // eye sockets
      push += bump(ax, y, z, .042, .042, .112, .03) * .006;           // brow
      push -= bump(ax, y, z, .108, .02, .02, .04) * .006;             // temples
      push += bump(ax, y, z, .055, -.085, .07, .035) * (hag ? .002 : .005); // the jaw's corner
      const l = Math.hypot(x, y, z) || 1;
      hp.setXYZ(i, x + x / l * push, y + y / l * push, z + z / l * push);
    }
    geo.computeVertexNormals();
    return geo;
  }

  buildHead(skin) {
    const P = this.pal, S = this.style, torso = this.torso;
    // A head in natural proportion (about seven heads tall); worn hats keep their size (see wear).
    const head = this.head = this.moving(this.group(torso, 0, .615, 0));
    head.scale.setScalar(HEAD_SCALE);
    this.add(torso, new THREE.CylinderGeometry(.043, .052, .12, 12), skin, 0, .52, 0);
    if (this.cls === 'hex' || this.cls === 'bloom') this.add(torso, new THREE.TorusGeometry(.048, .008, 6, 20), this.m(this.cls === 'hex' ? '#120c16' : P.trim, { rough: .5, metal: this.cls === 'bloom' ? 1 : 0 }), 0, .53, 0).rotation.x = Math.PI / 2;
    // One smooth head: rounded above, narrowing into cheeks and chin; the hag's is longer and more pointed.
    this.add(head, this.headGeometry(S.hag), skin);
    this.eyeParts = [];
    for (const s of [-1, 1]) {
      // An ear with a rim and a lobe.
      const ear = this.add(head, ball(.026, 12, 10), skin, s * .121, .002, -.012); ear.scale.set(.32, 1, .62); ear.rotation.set(-.15, s * .35, 0);
      this.add(head, ball(.011, 8, 6), skin, s * .123, -.022, -.004).scale.set(.5, 1, .8);
      if (S.hag) {
        // Sunken, shadowed sockets round eyes that glow.
        this.add(head, ball(.03, 12, 10), this.m('#2a2a1a', { rough: 1 }), s * .046, .012, .096).scale.set(1.25, .95, .5);
        this.eyeParts.push(this.eye(head, s, { x: .046, z: .1, r: .02, color: P.eyes, glow: 3, lash: '#2a2a1a' }));
        this.add(head, ball(.028, 10, 8), this.m(P.eyes, { glow: 1.2, opacity: .18 }), s * .046, .012, .113);
      } else {
        if (S.shadow) this.add(head, ball(.03, 12, 10), this.m('#3a1a40', { rough: .6, opacity: .7 }), s * .046, .016, .1).scale.set(1.3, .9, .5);
        this.eyeParts.push(this.eye(head, s, { color: P.eyes, glow: S.eyeGlow > 1 ? S.eyeGlow * .5 : 0 }));
      }
      this.add(head, taperedTube([[s * .022, .045, .121], [s * .048, .053, .12], [s * .072, .046, .112]], .0055, t => 1 - t * .5, 8, 5), this.m(S.hag ? '#4a4a3a' : P.hair));
      if (S.blush) this.add(head, new THREE.SphereGeometry(.02, 10, 8), this.m('#ff9ab0', { rough: .7, opacity: .35 }), s * .066, -.03, .108).scale.set(1, .7, .4);
      if (S.paint) { this.add(head, new THREE.BoxGeometry(.006, .07, .01), this.m('#2a1a14', { rough: .9 }), s * .045, -.04, .11).rotation.z = s * .2; this.add(head, new THREE.BoxGeometry(.05, .006, .01), this.m('#2a1a14'), s * .07, -.015, .1); }
    }
    if (S.freckles) for (let i = 0; i < 14; i++) this.add(head, new THREE.SphereGeometry(.0028, 4, 3), this.m('#c07a5a'), (i % 7 - 3) * .012, -.018 - (i > 6 ? .008 : 0), .126);
    if (S.paint) this.add(head, new THREE.BoxGeometry(.008, .07, .01), this.m('#2a1a14'), 0, .07, .118);
    if (S.hag) {
      // A long hooked nose, a wide knowing grin, and a furrowed brow.
      this.add(head, taperedTube([[0, .01, .118], [0, -.02, .15], [0, -.05, .16], [0, -.065, .148]], .016, t => 1 - t * .6, 10, 8), skin);
      // A thin, crooked grin with a few yellowed teeth.
      const grin = this.add(head, new THREE.TorusGeometry(.038, .0035, 4, 24, Math.PI * .9), this.m('#140a06'), 0, -.07, .119); grin.rotation.z = Math.PI * 1.05; grin.scale.y = .55;
      for (let i = 0; i < 4; i++) this.add(head, new THREE.BoxGeometry(.005, .006, .004), this.m('#c8b880'), (i - 1.5) * .012 + .004, -.081, .124);
      for (const s of [-1, 1]) this.add(head, new THREE.BoxGeometry(.02, .002, .004), this.m('#4a5440'), s * .05, -.055, .113).rotation.z = s * .6;
      for (let i = 0; i < 4; i++) this.add(head, new THREE.BoxGeometry(.04, .002, .004), this.m('#5a6450'), 0, .07 + i * .01, .118 - i * .004);
    } else {
      // The nose: a bridge running down from the brow to a rounded tip, with nostrils either side.
      this.add(head, taperedTube([[0, .03, .121], [0, .005, .13], [0, -.02, .139], [0, -.034, .142]], .0085, t => .55 + t * .5, 10, 8), skin);
      this.add(head, ball(.0125, 12, 10), skin, 0, -.035, .139).scale.set(1, .85, .95);
      for (const s of [-1, 1]) this.add(head, ball(.008, 8, 6), skin, s * .0105, -.038, .133).scale.set(1, .8, 1);
      this.add(head, new THREE.SphereGeometry(.016, 12, 8), this.m(P.lips, { rough: .35 }), 0, -.062, .126).scale.set(1.3, .38, .5);
      this.add(head, new THREE.SphereGeometry(.015, 12, 8), this.m(P.lips, { rough: .35 }), 0, -.071, .123).scale.set(1.15, .42, .5);
    }
    if (this.cls === 'hex' || this.cls === 'bloom') for (const s of [-1, 1]) this.pendant(head, s * .125, -.03, .0, .035, .012, this.m(P.trim, { metal: 1, rough: .3 }), this.m(P.crystal, { glow: .9, rough: .1 }));

    // Hair: a crown, a fringe, and long strands down the back that sway.
    const hairMat = this.m(P.hair, { kind: 'hair' }), streak = this.m(P.streak, { kind: 'hair' }), rand = stream(this.cls.length * 13 + 5);
    this.hair = this.moving(this.group(head));
    const cap = this.add(this.hair, new THREE.SphereGeometry(.135, 28, 16, 0, Math.PI * 2, 0, Math.PI * .36), hairMat, 0, .012, -.006); cap.scale.set(1.04, 1.1, 1.08);
    const back = this.add(this.hair, new THREE.SphereGeometry(.142, 24, 14, Math.PI * .82, Math.PI * 1.36, Math.PI * .2, Math.PI * .62), hairMat, 0, .005, -.01); back.scale.set(1.04, 1.12, 1.1);
    if (!S.hag) for (const s of [-1, 1]) this.add(this.hair, taperedTube([[s * .01, .14, .1], [s * .07, .12, .125], [s * .115, .07, .11], [s * .13, .0, .08]], .026, t => 1 - t * .55, 14, 7), hairMat);
    this.strands = this.moving(this.group(this.hair, 0, .02, -.07));
    const count = S.hair === 'stringy' ? 30 : this.cls === 'bloom' ? 34 : 26, L = S.hairLen;
    for (let i = 0; i < count; i++) {
      const a = (i / (count - 1) - .5) * (S.hair === 'stringy' ? 3.6 : 2.7), x = Math.sin(a) * .13, z = -Math.cos(a) * .09 + .06, len = (.5 + rand() * .35) * L;
      const wave = S.hair === 'wavy' ? .035 : .012, w = k => Math.sin(k * 3 + i) * wave;
      const pts = [[x, 0, z], [x * 1.35 + w(1), -.15, z - .05], [x * 1.3 + w(2), -.3 - len * .25, z - .08], [x * 1.25 + w(3), -.3 - len * .6, z - .06], [x * 1.2 + w(4), -.3 - len, z - .03]];
      this.strand(this.strands, pts, S.hair === 'stringy' ? .016 : this.cls === 'bloom' ? .04 : .034, i % 4 === 2 ? streak : hairMat, .7, 9, S.hair === 'stringy' ? 3 : 4);
    }
    if (!S.hag) for (const s of [-1, 1]) this.strand(this.hair, [[s * .11, .03, .06], [s * .14, -.1, .08], [s * .15, -.3, .08], [s * .13, -.55 * L, .07]], .024, s > 0 ? streak : hairMat, .6, 14, 6);
    else for (let i = 0; i < 8; i++) { const s = i % 2 ? 1 : -1, x = s * (.08 + (i >> 1) * .015); this.strand(this.hair, [[x, .06, .09], [x * 1.3, -.05, .12], [x * 1.4, -.25, .11], [x * 1.35, -.5, .09]], .012, i % 3 ? hairMat : streak, .6, 10, 4); }
  }

  // What each path holds in the off hand: a spell orb, a cauldron, a rune swirl. The Wild Witch reaches out empty-handed.
  signature() {
    const P = this.pal, cls = this.cls;
    this.held = null;
    if (cls === 'bloom') for (let k = 0; k < 2; k++) {
      // Bloom keeps two butterflies about her.
      const fly = this.moving(this.group(this.root, 0, 1.8 + k * .3, 0)), wings = [];
      for (const s of [-1, 1]) { const w = this.add(fly, new THREE.CircleGeometry(.05, 10), this.m(k ? '#ffe08a' : '#f6b6d2', { glow: .6, side: DOUBLE, opacity: .9 }), s * .03, 0, 0); w.scale.set(1, .7, 1); w.rotation.y = s * .4; wings.push(this.keep(w)); }
      fly.userData.butterfly = { wings, k };
      (this.butterflies ??= []).push(fly);
    }
    if (cls === 'wild') return;
    const g = this.held = this.moving(this.group(this.torso, .32, cls === 'bog' ? .2 : cls === 'hex' ? .4 : .5, cls === 'bog' ? .48 : .52));
    if (cls === 'bloom') {
      this.spin(this.keep(this.add(g, new THREE.IcosahedronGeometry(.075, 3), this.m('#9cff5a', { glow: 2.4, rough: .1, opacity: .9 }))), .6, 'y', .02);
      this.keep(this.add(g, new THREE.IcosahedronGeometry(.13, 2), this.m('#b8ff6a', { glow: 1.2, opacity: .18 })));
      for (let k = 0; k < 2; k++) { const ring = this.add(g, new THREE.TorusGeometry(.11 + k * .03, .004, 4, 40), this.m('#d8ff9a', { glow: 1.2, opacity: .7 })); ring.rotation.set(1.1 + k, k, 0); this.spin(this.keep(ring), .9 - k * 1.6, 'z'); }
      for (let k = 0; k < 3; k++) this.spin(this.keep(this.leaf(g, Math.cos(k * 2.1) * .14, Math.sin(k) * .05, Math.sin(k * 2.1) * .14, '#f6b6d2', .03)), 1.2, 'y');
    } else if (cls === 'bog') {
      this.add(g, lathe([[.0, -.1], [.09, -.08], [.12, -.02], [.11, .04], [.085, .07], [.09, .08]], 24), this.m('#1c1c1e', { metal: .6, rough: .5, side: DOUBLE }));
      this.add(g, new THREE.CircleGeometry(.084, 20), this.m(P.glow, { glow: 1.5 }), 0, .065, 0).rotation.x = -Math.PI / 2;
      this.add(g, new THREE.TorusGeometry(.1, .006, 4, 20, Math.PI), this.m('#2a2a2c', { metal: .7, rough: .4 }), 0, .08, 0);
      for (let k = 0; k < 4; k++) this.spin(this.keep(this.add(g, ball(.014 + k * .004, 8, 6), this.m('#d8ff8a', { glow: 1, opacity: .6 }), (k - 1.5) * .03, .1 + k * .03, 0)), 0, 'y', .03);
    } else {
      // Rune rings of violet light turning about each other, a crystal mote at the heart.
      for (let k = 0; k < 4; k++) { const ring = this.add(g, new THREE.TorusGeometry(.09 + k * .045, .006, 4, 56), this.m(k % 2 ? '#a050ff' : '#d8a8ff', { glow: 2.2, opacity: .85 })); ring.rotation.set(1.2 + k * .5, k * .7, 0); this.spin(this.keep(ring), (k % 2 ? -1 : 1) * (.8 + k * .4), 'z'); }
      const runes = this.group(g); this.spin(runes, .5, 'y');
      for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; this.add(runes, new THREE.BoxGeometry(.016, .04, .004), this.m('#9a40ff', { glow: 2.4 }), Math.cos(a) * .2, Math.sin(k * 2.3) * .02, Math.sin(a) * .2).rotation.y = -a; }
      this.spin(this.keep(this.add(g, new THREE.OctahedronGeometry(.03, 0), this.m(P.crystal, { glow: 2, rough: .1 }))), 2, 'y');
    }
  }

  // Remove a gear group and its geometry.
  clearGear() {
    for (const g of this.gear) { g.parent?.remove(g); g.traverse(o => o.geometry?.dispose()); }
    this.gear = [];
  }
  wear(parent, group) { parent.add(group); this.gear.push(group); if (parent === this.head) group.scale.setScalar(1.12 / HEAD_SCALE); return group; }

  // `look`: slot → [kind, rarity]. Rebuilds only what's worn; the body stays.
  setLook(look = {}) {
    const key = JSON.stringify(look);
    if (key === this.lookKey) return;
    this.lookKey = key; this.clearGear(); this.orb = null; this.hatTip = null; this.lantern = null;
    const [headKind, headR] = look.head ?? ['hat', -1];
    this.hoodUp = headKind === 'hood';
    if (headKind === 'hood') this.hood(headR); else if (headKind === 'circlet') this.circlet(headR); else this.headwear(headR);
    const [chestKind, chestR] = look.chest ?? ['robe', -1];
    this.robeTrim(chestKind === 'robe' ? chestR : -1);
    if (chestKind === 'jerkin') this.jerkin(chestR);
    if (chestKind === 'mail') this.mail(chestR);
    if (look.hands) this.handwear(...look.hands);
    this.legs.forEach(l => this.boot(l.boot, look.feet?.[1] ?? -1));
    if (look.cloak) this.cape(look.cloak[1]);
    if (look.amulet) this.amulet(look.amulet[1]);
    this.weaponKind = look.weapon?.[0] ?? null;
    if (look.weapon) this.weapon(...look.weapon);
    for (const g of this.gear) foldFixed(g);
    this.capeMesh = this.gear.find(g => g.userData.cape)?.userData.cape ?? null;
    bakeSkinned(this);
  }

  // ---------- the path's headwear (the "hat" slot) ----------
  headwear(r) {
    if (this.cls === 'bog') return this.mossShroud(r);
    if (this.cls === 'wild') return this.antlerCrown(r);
    return this.hat(r);
  }

  // The witch's hat: Bloom's covered in flowers and hung with crystals, Hex's laced with gold and violet crystals.
  hat(r) {
    const P = this.pal, T = TIERS[Math.max(0, r)], bloom = this.cls === 'bloom', g = this.wear(this.head, new THREE.Group());
    g.position.set(0, .085, -.01); g.rotation.set(-.12, 0, .1);
    const R = bloom ? .52 : .48, hatMat = this.m(P.hat, { rough: bloom ? .6 : .7, side: DOUBLE });
    this.add(g, lathe([[.1, .01], [.2, 0], [R * .75, .005], [R * .95, .035], [R, .075]], 48), hatMat);
    const crown = lathe([[.16, 0], [.15, .1], [.12, .25], [.085, .42], [.05, .6], [.022, .76], [.002, .88]], 32), cp = crown.attributes.position;
    for (let i = 0; i < cp.count; i++) { const t = cp.getY(i) / .88; cp.setZ(i, cp.getZ(i) - .26 * t ** 2.2); cp.setX(i, cp.getX(i) + .06 * t ** 3); cp.setY(i, cp.getY(i) - .1 * t ** 3); }
    crown.computeVertexNormals();
    this.add(g, crown, this.m(P.hat, { rough: bloom ? .6 : .7 }));
    const metal = this.m(r >= 0 ? T.metal : P.trim, { metal: 1, rough: .3 }), gem = this.m(r >= 1 ? T.trim : P.crystal, { glow: 1 + (r >= 0 ? T.glow : 0), rough: .1 });
    this.add(g, new THREE.CylinderGeometry(.152, .158, .055, 32, 1, true), this.m(r >= 0 ? T.trim : P.band, { rough: .5, side: DOUBLE, glow: r >= 3 ? .25 : 0 }), 0, .035, 0);
    // Crystals hanging from the brim on fine chains.
    for (let k = 0; k < (bloom ? 7 : 6); k++) { const a = Math.PI * (.15 + k / 6 * .7) + Math.PI / 2; this.pendant(g, Math.cos(a) * R * .93, .06, Math.sin(a) * R * .93, .05 + (k % 3) * .03, .014, metal, this.m(P.crystal, { glow: .9, rough: .05, opacity: .85 })); }
    if (bloom) {
      // Vines winding up the cone, flowers round the band and climbing it.
      this.helix(g, t => .155 - t * .14, .02, .7, 2.2, .007, this.m('#6aa84a', { rough: .6 }), 0);
      this.helix(g, t => .155 - t * .14, .02, .6, 1.8, .004, metal, 2.5);
      for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; this.flower(g, Math.cos(a) * .18, .05 + (k % 2) * .025, Math.sin(a) * .18, ['#ff5f9e', '#ffe0ec', '#ff9cc4'][k % 3], .08 + (k % 3) * .015, '#c0306a').rotation.y = Math.PI / 2 - a; }
      for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2 + .2, rr = .28 + (k % 3) * .06; this.flower(g, Math.cos(a) * rr, .03 + rr * .05, Math.sin(a) * rr, ['#ff9cc4', '#fff4f8', '#ff5f9e'][k % 3], .055, '#e0a030').rotation.x = -Math.PI / 2; }
      for (let k = 0; k < 9; k++) { const t = .12 + k * .075, a = k * 1.9; this.flower(g, Math.cos(a) * (.16 - t * .15), t * .82, Math.sin(a) * (.16 - t * .15) - .22 * t * t, k % 2 ? '#ff9cc4' : '#fff0f6', .045); }
      for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2 + .3; this.leaf(g, Math.cos(a) * .19, .03, Math.sin(a) * .19, '#7ab84a', .045, .4, -a, 0); }
    } else {
      // Gold filigree: spirals, rings and a star on the front of the crown; a violet gem on the band.
      for (let k = 0; k < 2; k++) this.helix(g, t => .155 - t * .14, .03, .72, 2.5, .0035, metal, k * Math.PI);
      for (const y of [.25, .45]) this.add(g, new THREE.TorusGeometry(.12 - y * .12, .003, 4, 32), metal, 0, y, -.03 * y).rotation.x = Math.PI / 2;
      const star = this.group(g, 0, .2, .13);
      for (let k = 0; k < 5; k++) { const a = k * Math.PI * 4 / 5 - Math.PI / 2, b = (k + 1) * Math.PI * 4 / 5 - Math.PI / 2; this.add(star, new THREE.TubeGeometry(curve([[Math.cos(a) * .035, -Math.sin(a) * .035, 0], [Math.cos(b) * .035, -Math.sin(b) * .035, 0]]), 2, .0025, 3), metal); }
      this.crystal(g, 0, .035, .162, .02, gem);
      this.add(g, new THREE.TorusGeometry(R * .97, .004, 4, 64), metal, 0, .07, 0).rotation.x = Math.PI / 2;
    }
    const tip = this.moving(this.group(g, .06, .78, -.26)); this.hatTip = tip;
    this.crystal(tip, 0, -.05, 0, .016, this.m(P.crystal, { glow: 1.2, rough: .05 }));
    if (r >= 3) this.sparkles(g, T.trim, .25, .35);
  }

  // Bog: no hat but a shroud of stringy hair and hanging moss, with glowing mushrooms growing from it.
  mossShroud(r) {
    const P = this.pal, T = TIERS[Math.max(0, r)], g = this.wear(this.head, new THREE.Group()), rand = stream(77);
    const moss = [this.m('#2e3a18', { rough: 1 }), this.m('#4a5a24', { rough: 1 }), this.m('#22261a', { rough: 1 })];
    // The shroud sits above the brow and falls at the sides and back, leaving the face and its glowing eyes clear.
    this.add(g, ball(.16, 24, 14, 0, Math.PI * 2, 0, Math.PI * .38), moss[0], 0, .05, -.03).scale.set(1.08, 1.1, 1.15);
    this.add(g, ball(.165, 20, 12, Math.PI * .85, Math.PI * 1.3, Math.PI * .3, Math.PI * .45), moss[1], 0, .03, -.02).scale.set(1.08, 1.15, 1.15);
    for (let i = 0; i < 26; i++) {
      const a = rand() * Math.PI * 2, x = Math.cos(a) * .16, z = Math.sin(a) * .15 - .02, len = .15 + rand() * .45;
      if (z > .02 && Math.abs(x) < .12) continue; // leave the face clear
      this.strand(g, [[x * .8, .1, z * .8], [x * 1.1, -.02, z * 1.1], [x * 1.2, -len * .6, z * 1.2], [x * 1.25, -len, z * 1.25]], .01 + rand() * .008, moss[i % 3], .7, 8, 3);
    }
    const glow = this.m(r >= 2 ? T.trim : P.glow, { glow: 1.6 + (r >= 0 ? T.glow : 0), rough: .4, opacity: .9 });
    for (let i = 0; i < 9; i++) {
      const a = rand() * Math.PI * 1.6 - Math.PI * .3, x = Math.cos(a) * .15, z = -Math.abs(Math.sin(a)) * .1 + .02, y = .05 + rand() * .1, s = .018 + rand() * .02;
      this.add(g, new THREE.CylinderGeometry(s * .25, s * .35, s * 1.2, 6), this.m('#d8e8b0', { glow: .4 }), x, y, z);
      this.add(g, ball(s, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), glow, x, y + s * .6, z).scale.y = .7;
    }
    if (r >= 3) this.sparkles(g, T.trim, .2, .3);
  }

  // Wild: an antler crown with a deer skull at the brow, feathers fanned behind, leaves and moss.
  antlerCrown(r) {
    const T = TIERS[Math.max(0, r)], g = this.wear(this.head, new THREE.Group());
    g.position.y = .07;
    const bone = this.m(r >= 2 ? T.metal : '#d8c8a4', { rough: r >= 2 ? T.roughness : .6, metal: r >= 2 ? T.metalness * .6 : 0 });
    for (const s of [-1, 1]) {
      this.add(g, taperedTube([[s * .08, .04, -.02], [s * .2, .18, -.06], [s * .28, .38, -.04], [s * .3, .6, .02]], .022, t => 1 - t * .6, 18, 7), bone);
      for (const [t, dx, dy] of [[.3, .1, .14], [.55, .14, .12], [.75, -.02, .18], [.85, .12, .06]]) {
        const bx = s * (.08 + .22 * t), by = .04 + .5 * t;
        this.add(g, taperedTube([[bx, by, -.05], [bx + s * dx * .6, by + dy * .6, -.04], [bx + s * dx, by + dy, -.02]], .012, k => 1 - k * .75, 8, 5), bone);
      }
    }
    const skull = this.group(g, 0, .06, .1);
    this.add(skull, ball(.07, 16, 12), this.m('#ece2c8', { rough: .55 })).scale.set(.8, .75, 1.2);
    this.add(skull, new THREE.ConeGeometry(.035, .1, 10), this.m('#ece2c8', { rough: .55 }), 0, -.02, .09).rotation.x = Math.PI / 2;
    for (const s of [-1, 1]) this.add(skull, ball(.016, 10, 8), this.m('#140c08'), s * .03, .015, .06);
    const feathers = [this.m('#8a5a2a', { rough: .7 }), this.m('#f0e6d4', { rough: .7 }), this.m('#3a2a1a', { rough: .7 })];
    for (let k = 0; k < 9; k++) { const a = (k / 8 - .5) * 2.2, f = this.add(g, ball(.09, 10, 6), feathers[k % 3], Math.sin(a) * .14, .1 + Math.cos(a) * .05, -.1); f.scale.set(.22, 1, .05); f.rotation.set(-.4, 0, -a * .8); }
    for (let k = 0; k < 7; k++) this.leaf(g, Math.cos(k) * .14, .02, Math.sin(k * 1.9) * .1, k % 2 ? '#5a7a2a' : '#7a8a3a', .05, .6, k, 0);
    if (r >= 2) this.crystal(skull, 0, .06, .05, .015, this.m(T.trim, { glow: 1 + T.glow }));
    if (r >= 3) this.sparkles(g, T.trim, .3, .4, .3);
  }

  hood(r) {
    const T = TIERS[Math.max(0, r)], cloth = r >= 1 ? this.tint(this.pal.robe, T.trim) : '#6a5238', g = this.wear(this.head, new THREE.Group());
    this.add(g, ball(.17, 24, 16, 0, Math.PI * 2, 0, Math.PI * .62), this.m(cloth, { rough: .85, side: DOUBLE }), 0, .02, -.02).scale.set(1, 1.12, 1.12);
    this.add(g, new THREE.ConeGeometry(.07, .22, 16), this.m(cloth, { rough: .85 }), 0, .12, -.17).rotation.x = -1.1;
    this.add(g, new THREE.TorusGeometry(.15, .012, 6, 28, Math.PI * 1.2), this.m(T.trim, { rough: .5, glow: T.glow * .2 }), 0, .02, .02).rotation.set(0, 0, -Math.PI * .1 + Math.PI);
    this.add(g, lathe([[.16, -.1], [.25, -.2], [.27, -.25]], 24), this.m(cloth, { rough: .85, side: DOUBLE }), 0, -.08, 0);
  }

  circlet(r) {
    const T = TIERS[Math.max(0, r)], metal = this.m(T.metal, { metal: T.metalness, rough: T.roughness }), g = this.wear(this.head, new THREE.Group());
    g.position.y = .07; g.rotation.x = -.15;
    this.add(g, new THREE.TorusGeometry(.135, .012, 8, 36), metal).rotation.x = Math.PI / 2;
    for (let i = 0; i < 7; i++) { const a = (i / 6 - .5) * 1.6 + Math.PI / 2; this.add(g, new THREE.ConeGeometry(.012, .06 + (i === 3 ? .05 : 0), 6), metal, Math.cos(a) * .135, .03 + (i === 3 ? .025 : 0), Math.sin(a) * .135); }
    this.add(g, new THREE.OctahedronGeometry(.025, 0), this.m(T.trim, { glow: .6 + T.glow, rough: .1 }), 0, .03, .14);
    if (r >= 3) this.sparkles(g, T.trim, .12, .2);
  }

  robeTrim(r) {
    if (r < 0) return;
    const T = TIERS[r], g = this.wear(this.body, new THREE.Group()), trim = this.m(T.trim, { rough: .45, metal: r >= 2 ? .6 : 0, glow: T.glow * .25 });
    this.add(g, new THREE.TorusGeometry(.48, .014, 6, 48), trim, 0, .32, 0).rotation.x = Math.PI / 2;
    this.add(g, new THREE.TorusGeometry(.19, .012, 6, 32), trim, 0, 1.38, 0).scale.set(1, 1, .8);
    if (r >= 3) for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; this.add(g, new THREE.OctahedronGeometry(.016, 0), this.m(T.trim, { glow: 1.1 }), Math.cos(a) * .46, .4, Math.sin(a) * .46); }
  }

  jerkin(r) {
    const T = TIERS[Math.max(0, r)], g = this.wear(this.torso, new THREE.Group());
    this.add(g, lathe([[.175, -.02], [.18, .1], [.2, .26], [.205, .34], [.17, .4]], 28), this.m('#5a3a22', { rough: .65, side: DOUBLE })).scale.z = .84;
    for (let i = 0; i < 5; i++) this.add(g, ball(.012, 8, 6), this.m(T.metal, { metal: T.metalness, rough: T.roughness }), 0, .04 + i * .07, .17);
    for (const y of [.0, .38]) this.add(g, new THREE.TorusGeometry(.19, .01, 6, 32), this.m(T.trim, { rough: .5 }), 0, y, 0).scale.z = .84;
  }

  mail(r) {
    const T = TIERS[Math.max(0, r)], metal = this.m(T.metal, { metal: T.metalness, rough: T.roughness }), g = this.wear(this.torso, new THREE.Group());
    this.add(g, lathe([[.165, .02], [.17, .1], [.19, .25], [.198, .32], [.172, .4], [.115, .45]], 32), metal).scale.z = .84;
    this.add(g, new THREE.BoxGeometry(.012, .3, .02), metal, 0, .2, .162).rotation.x = -.12;
    for (const y of [.02, .4]) this.add(g, new THREE.TorusGeometry(y ? .178 : .168, .009, 6, 32), this.m(T.trim, { metal: .8, rough: .3, glow: T.glow * .3 }), 0, y, 0).scale.z = .84;
    for (const s of [-1, 1]) {
      const pauldron = this.add(g, ball(.085, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), metal, s * .215, .44, 0); pauldron.scale.set(1, .65, 1); pauldron.rotation.z = -s * .45;
      this.add(g, new THREE.TorusGeometry(.083, .008, 6, 24), this.m(T.trim, { metal: .8, rough: .3 }), s * .215, .44, 0).rotation.set(Math.PI / 2, s * .45, 0);
      if (r >= 3) for (let k = 0; k < 3; k++) this.add(g, new THREE.ConeGeometry(.014, .07, 6), metal, s * (.2 + k * .03), .5, -.02 + k * .02);
    }
    if (r >= 2) this.add(g, new THREE.OctahedronGeometry(.03, 0), this.m(T.trim, { glow: .8 + T.glow, rough: .1 }), 0, .3, .19);
    if (r >= 4) this.sparkles(g, T.trim, .3, .3, .25);
  }

  handwear(kind, r) {
    const T = TIERS[Math.max(0, r)];
    for (const arm of this.arms) {
      const g = this.wear(arm.hand, new THREE.Group());
      this.add(g, ball(.045, 12, 10), this.m(kind === 'bracers' ? this.pal.skin : '#4a3020', { rough: .6 })).scale.set(.85, 1.05, .6);
      const cuff = this.wear(arm.elbow, new THREE.Group());
      this.add(cuff, new THREE.CylinderGeometry(.048, .043, .1, 14), kind === 'bracers' ? this.m(T.metal, { metal: T.metalness, rough: T.roughness }) : this.m('#4a3020', { rough: .6 }), 0, -.2, 0);
      this.add(cuff, new THREE.TorusGeometry(.048, .007, 5, 18), this.m(T.trim, { rough: .4, glow: T.glow * .3 }), 0, -.16, 0).rotation.x = Math.PI / 2;
      if (r >= 3) this.add(cuff, new THREE.OctahedronGeometry(.014, 0), this.m(T.trim, { glow: 1.2 }), 0, -.2, .05);
    }
  }

  // Boots by path; quest givers and the Wild Witch go barefoot unless boots are worn.
  boot(parent, r) {
    const g = this.wear(parent, new THREE.Group()), bare = r < 0 && (this.revealing || this.cls === 'wild');
    if (bare) { const skin = this.m(this.pal.skin, { rough: .55 }); this.add(g, ball(.045, 14, 10), skin, 0, -.02, .045).scale.set(.75, .5, 1.75); this.add(g, ball(.032, 12, 8), skin, 0, .0, -.005); return; }
    const T = TIERS[Math.max(0, r)], leather = this.m(r >= 0 ? '#3e2616' : this.cls === 'hex' ? '#141018' : '#2a1c12', { rough: .55 });
    this.add(g, lathe([[.066, .14], [.064, .06], [.062, .0], [.058, -.03]], 16), leather);
    this.add(g, ball(.058, 14, 10), leather, 0, -.025, .05).scale.set(.85, .55, 1.6);
    this.add(g, new THREE.ConeGeometry(.024, .08, 10), leather, 0, -.01, .15).rotation.x = Math.PI / 2 - .6;
    this.add(g, new THREE.TorusGeometry(.065, .008, 5, 18), this.m(r >= 0 ? T.trim : this.pal.trim, { rough: .5, metal: this.cls === 'hex' ? 1 : 0 }), 0, .12, 0).rotation.x = Math.PI / 2;
    if (r >= 2) this.add(g, ball(.045, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), this.m(T.metal, { metal: T.metalness, rough: T.roughness }), 0, -.02, .1).scale.set(1, .5, 1.3);
  }

  // A cape from the shoulders, its cloth animated each frame.
  cape(r) {
    const T = TIERS[Math.max(0, r)], g = this.wear(this.torso, new THREE.Group());
    g.position.set(0, .44, -.13);
    const geo = new THREE.PlaneGeometry(.7, 1.25, 12, 18); geo.translate(0, -.625, 0);
    const cloth = r >= 2 ? this.tint(this.pal.robe2, T.trim) : this.pal.robe2;
    const mesh = this.add(g, geo, this.m(cloth, { rough: .8, side: DOUBLE, opacity: this.cls === 'bloom' ? .7 : 1 }));
    mesh.userData.base = Float32Array.from(geo.attributes.position.array); mesh.userData.solo = true;
    this.add(g, new THREE.TorusGeometry(.17, .016, 6, 24, Math.PI), this.m(T.trim, { rough: .45, glow: T.glow * .25 }), 0, .01, .1).rotation.set(Math.PI / 2, 0, Math.PI);
    for (const s of [-1, 1]) this.add(g, ball(.03, 12, 8), this.m(T.metal, { metal: T.metalness, rough: T.roughness }), s * .2, 0, .04);
    g.userData.cape = mesh;
  }

  amulet(r) {
    const T = TIERS[Math.max(0, r)], g = this.wear(this.torso, new THREE.Group());
    const chain = this.add(g, new THREE.TorusGeometry(.12, .005, 4, 32), this.m(T.metal, { metal: 1, rough: .3 }), 0, .44, .07); chain.rotation.x = Math.PI / 2 - .55; chain.scale.y = 1.1;
    this.add(g, new THREE.TorusGeometry(.032, .008, 6, 16), this.m(T.metal, { metal: 1, rough: .25 }), 0, .34, .17);
    this.add(g, new THREE.OctahedronGeometry(.026, 1), this.m(T.trim, { glow: .8 + T.glow, rough: .05, metal: .2 }), 0, .34, .175);
    if (r >= 3) this.sparkles(g, T.trim, .06, .1, .34);
  }

  // The weapon in her right hand. A staff takes the path's form; rarity colours its heart.
  weapon(kind, r) {
    const P = this.pal, T = TIERS[Math.max(0, r)], hand = this.arms[1].hand, g = this.wear(hand, new THREE.Group());
    g.position.set(0, -.04, .02);
    // A pole passes through the fist across the hand (at right angles to the forearm), as a real grip holds it.
    if (POLES.has(kind)) g.rotation.x = Math.PI / 2;
    const wood = this.m(P.wood, { rough: .75 }), metal = this.m(T.metal, { metal: T.metalness, rough: T.roughness });
    const gem = this.m(r >= 2 ? T.trim : P.crystal, { glow: 1.2 + T.glow, rough: .05, metal: .1, opacity: .9 });
    if (kind === 'staff') {
      // A tall twisted shaft (two strands braided round each other), crowned well above the hat brim.
      g.rotation.z = -.12;
      for (let k = 0; k < 2; k++) { const pts = []; for (let i = 0; i <= 16; i++) { const t = i / 16, a = t * 9 + k * Math.PI; pts.push([Math.cos(a) * .016, -.7 + t * 2.3, Math.sin(a) * .016]); } this.add(g, new THREE.TubeGeometry(curve(pts), 80, .018, 5, false), wood); }
      const top = this.group(g, 0, 1.62, 0); top.scale.setScalar(1.45);
      if (this.cls === 'bloom') {
        // A crystal lotus: rings of glassy petals opening round a glowing heart, crystals hanging below.
        // Each petal pivots at its base: inner petals stand upright, outer ones open wide.
        const petal = ball(.06, 12, 8).translate(0, .06, 0).scale(.42, 1, .14);
        for (let ring = 0; ring < 3; ring++) for (let k = 0; k < 8; k++) {
          const a = k / 8 * Math.PI * 2 + ring * .39, pivot = this.group(top, Math.cos(a) * .012 * ring, .02 * ring, Math.sin(a) * .012 * ring);
          pivot.rotation.set(0, Math.PI / 2 - a, 0); pivot.rotateX(.25 + ring * .42);
          this.add(pivot, petal, this.m(['#ffd8ee', '#ffb0dc', '#ff8cc8'][ring], { glow: .7 - ring * .15, glowColor: '#ff7ab8', rough: .05, opacity: .82, side: DOUBLE })).scale.setScalar(1 - ring * .08 + .25 * ring);
        }
        for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; this.add(top, new THREE.CylinderGeometry(.002, .002, .05, 3), this.m('#ffd870', { glow: 1.5 }), Math.cos(a) * .012, .05, Math.sin(a) * .012).rotation.set(Math.sin(a) * .4, 0, -Math.cos(a) * .4); }
        this.orb = this.keep(this.add(top, new THREE.IcosahedronGeometry(.03, 2), this.m('#ffe08a', { glow: 3 }), 0, .045, 0));
        this.keep(this.add(top, new THREE.IcosahedronGeometry(.075, 2), this.m('#ffc860', { glow: 1.5, opacity: .2 }), 0, .06, 0));
        for (let k = 0; k < 5; k++) this.pendant(top, Math.cos(k * 1.25) * .06, 0, Math.sin(k * 1.25) * .06, .05 + (k % 2) * .03, .01, metal, this.m(P.crystal, { glow: .8, opacity: .85 }));
        this.helix(g, () => .032, .3, 1.55, 4, .006, this.m('#6aa84a'), 0);
        for (let k = 0; k < 6; k++) this.leaf(g, Math.cos(k * 2) * .04, .45 + k * .18, Math.sin(k * 2) * .04, '#7ab84a', .04, .3, k * 2, .4);
      } else if (this.cls === 'bog') {
        // A glowing mushroom cap trailing luminous tendrils.
        this.add(top, ball(.15, 20, 12, 0, Math.PI * 2, 0, Math.PI * .45), this.m(r >= 2 ? T.trim : P.glow, { glow: 1.3 + T.glow, rough: .4, opacity: .85, side: DOUBLE }), 0, .02, 0).scale.y = .7;
        for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 2, rr = .1 + (k % 3) * .015; this.strand(top, [[Math.cos(a) * rr, .02, Math.sin(a) * rr], [Math.cos(a) * rr * .9, -.08, Math.sin(a) * rr * .9], [Math.cos(a) * rr * .85, -.2 - (k % 4) * .04, Math.sin(a) * rr * .85]], .004, this.m('#d8ff6a', { glow: 1.4, opacity: .8 }), .5, 6, 3); }
        this.orb = this.keep(this.add(top, ball(.04, 12, 8), this.m('#f8ffb0', { glow: 2 }), 0, .04, 0));
        for (let k = 0; k < 9; k++) this.strand(g, [[.02, 1.5 - k * .12, .01], [.05, 1.42 - k * .12, .03], [.04, 1.25 - k * .12, .02]], .007, this.m('#3a4a1e', { rough: 1 }), .5, 5, 3);
      } else if (this.cls === 'hex') {
        // Thorned prongs gripping a great violet crystal.
        for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; this.add(top, taperedTube([[0, -.05, 0], [Math.cos(a) * .07, .05, Math.sin(a) * .07], [Math.cos(a) * .05, .2, Math.sin(a) * .05], [Math.cos(a) * .015, .3, Math.sin(a) * .015]], .012, t => 1 - t * .8, 12, 5), wood); }
        this.orb = this.keep(this.crystal(top, 0, .14, 0, .06, gem, 2.1));
        for (let k = 0; k < 4; k++) this.pendant(top, Math.cos(k * 1.6) * .07, -.04, Math.sin(k * 1.6) * .07, .06, .01, metal, this.m(P.crystal, { glow: 1 }));
      } else {
        // An antler fork with a hanging lantern, feathers and charms.
        for (const s of [-1, 1]) this.add(top, taperedTube([[0, 0, 0], [s * .06, .1, 0], [s * .1, .22, .02], [s * .12, .3, .05]], .014, t => 1 - t * .7, 10, 5), this.m('#d8c8a4', { rough: .6 }));
        const lantern = this.lantern = this.moving(this.group(top, .1, .16, .04));
        this.add(lantern, new THREE.CylinderGeometry(.002, .002, .06, 3), metal, 0, -.03, 0);
        this.add(lantern, new THREE.CylinderGeometry(.03, .035, .07, 6, 1, true), this.m('#3a2a1a', { metal: .6, rough: .5, side: DOUBLE }), 0, -.1, 0);
        this.orb = this.keep(this.add(lantern, ball(.026, 10, 8), this.m(r >= 2 ? T.trim : '#ffb84a', { glow: 2.4 }), 0, -.1, 0));
        for (let k = 0; k < 5; k++) { const f = this.add(g, ball(.07, 8, 6), this.m(k % 2 ? '#f0e6d4' : '#8a5a2a'), .03, 1.5 - k * .09, .02); f.scale.set(.2, 1, .05); f.rotation.z = .3; }
      }
      if (r >= 3) this.sparkles(g, T.trim, .16, .25, 1.2);
    } else if (kind === 'wand') {
      this.add(g, taperedTube([[0, -.1, 0], [0, .15, .01], [0, .38, 0]], .014, t => 1 - t * .6, 12, 6), wood);
      this.add(g, new THREE.TorusGeometry(.016, .005, 5, 12), metal, 0, -.02, 0).rotation.x = Math.PI / 2;
      this.orb = this.keep(this.add(g, new THREE.OctahedronGeometry(.03, 0), gem, 0, .41, 0));
      if (r >= 3) this.sparkles(g, T.trim, .06, .12, .41);
    } else if (kind === 'sickle') {
      this.add(g, new THREE.CylinderGeometry(.018, .02, .32, 8), wood, 0, .08, 0);
      const blade = this.add(g, new THREE.TorusGeometry(.17, .016, 4, 24, Math.PI * 1.1), metal, -.12, .3, 0); blade.scale.z = .25; blade.rotation.z = -.3;
      if (r >= 2) this.add(g, new THREE.OctahedronGeometry(.02, 0), gem, 0, .25, .02);
    } else if (kind === 'spear') {
      this.add(g, new THREE.CylinderGeometry(.018, .02, 2, 8), wood, 0, .4, 0);
      const head = this.add(g, new THREE.OctahedronGeometry(.07, 0), metal, 0, 1.47, 0); head.scale.set(.6, 2.2, .25);
      this.add(g, new THREE.TorusGeometry(.024, .007, 5, 12), this.m(T.trim, { rough: .4 }), 0, 1.36, 0).rotation.x = Math.PI / 2;
    } else if (kind === 'hatchet' || kind === 'pick') {
      this.add(g, new THREE.CylinderGeometry(.016, .02, .55, 8), wood, 0, .15, 0);
      const head = this.add(g, kind === 'pick' ? new THREE.ConeGeometry(.03, .34, 6) : new THREE.BoxGeometry(.14, .1, .025), metal, kind === 'pick' ? 0 : .06, .4, 0);
      if (kind === 'pick') head.rotation.z = Math.PI / 2;
    }
  }

  // Motes of light circling rare gear.
  sparkles(parent, color, radius, spread, y = 0) {
    const n = 14, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; pos.set([Math.cos(a) * radius, (Math.sin(i * 2.7) * .5) * spread, Math.sin(a) * radius], i * 3); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color, size: .035, transparent: true, opacity: .9, depthWrite: false, blending: THREE.AdditiveBlending }));
    pts.position.y = y; pts.userData.spin = true; parent.add(pts);
  }

  tint(a, b) { return '#' + new THREE.Color(a).lerp(new THREE.Color(b), .35).getHexString(); }

  // Animate. `s`: { moving, sprinting, swing (1→0 during a strike or cast), mounted, flying, glamour }.
  // Animate. `s`: { moving, sprinting, swing (1→0 during a strike or cast), mounted, flying, glamour,
  // ground (x, z → height, for the feet on slopes), look (a world point to look at) }.
  update(dt, now, s = {}) {
    const S = this.style, root = this.root, sc = root.scale.x;
    // How fast she really moves (from where the game has put her): the stride follows it, so feet don't slide.
    const at = root.position, last = this.at ?? at.clone(), v = dt > 0 ? Math.hypot(at.x - last.x, at.z - last.z) / dt : 0;
    this.speed = (this.speed ?? 0) + ((v < 25 ? v : 0) * (s.moving ? 1 : .3) - (this.speed ?? 0)) * Math.min(1, dt * 8);
    this.at = at.clone();
    const yaw = root.rotation.y, turnRate = dt > 0 ? (((yaw - (this.lastYaw ?? yaw)) + Math.PI * 3) % (Math.PI * 2) - Math.PI) / dt : 0;
    this.lastYaw = yaw; this.turn = (this.turn ?? 0) + (turnRate - (this.turn ?? 0)) * Math.min(1, dt * 5);
    const speed = this.speed / sc, gait = s.mounted ? 0 : Math.min(1, speed / 2.2), run = Math.min(1, Math.max(0, (speed - 5.5) / 3));
    // Swing and cadence: a stance foot moves back exactly as fast as the body goes forward.
    const legLen = .88, swing = .3 + Math.min(.5, speed * .05);
    if (gait > .02) this.phase += dt * speed / (swing * legLen);
    this.sway += ((s.flying ? 1.4 : gait * (.6 + run * .4)) - this.sway) * Math.min(1, dt * 4);
    const ph = this.phase, walk = gait, breath = Math.sin(now * 2.1);
    this.broom.visible = !!s.mounted;
    this.disguise.visible = !!s.glamour;
    for (const g of this.gear) if (g.parent === this.head || g.parent === this.torso || g.parent === this.body) g.visible = !s.glamour;
    this.bodice.visible = this.robeSkirt.visible = !s.glamour;
    this.hair.visible = !s.glamour && !this.hoodUp;
    if (this.held) this.held.visible = !s.glamour && !s.mounted;

    this.body.position.y = s.mounted ? -.12 : Math.abs(Math.sin(ph)) * (.03 + run * .025) * walk;
    // Leaning into speed and into turns; standing, a slow shift of weight from foot to foot.
    this.body.rotation.x = s.flying ? .18 * Math.min(1, this.sway) : walk * (.05 + run * .1);
    this.body.rotation.z = s.mounted ? 0 : Math.max(-.14, Math.min(.14, -this.turn * .045 * walk)) + (1 - walk) * Math.sin(now * .55) * .018;
    this.body.position.x = s.mounted ? 0 : (1 - walk) * Math.sin(now * .55) * .012;
    this.torso.rotation.x = S.hunch;
    this.head.rotation.set(-S.hunch * .7 + Math.sin(now * .7) * .03 - walk * .05, Math.sin(now * .45) * .08, 0);
    this.torso.scale.set(1 + breath * .006, 1 + breath * .012, 1 + breath * .006);
    this.legs.forEach((l, i) => {
      if (s.mounted) { l.hip.rotation.set(-1.25, 0, (i ? 1 : -1) * .12); l.knee.rotation.x = 1.35; return; }
      const a = Math.sin(ph + i * Math.PI) * swing * walk, idleBend = (1 - walk) * Math.max(0, Math.sin(now * .55) * (i ? 1 : -1)) * .12;
      l.hip.rotation.set(a - S.hunch * .3 - idleBend * .5, 0, 0); l.knee.rotation.x = Math.max(0, -Math.sin(ph + i * Math.PI + .6)) * (.8 + run * .5) * walk + S.hunch * .3 + idleBend;
    });
    if (s.ground && !s.mounted && !s.flying) this.plantFeet(s.ground);
    this.skirt.rotation.x = -.05 * walk - .1 * (s.flying ? 1 : 0);
    this.skirt.rotation.z = Math.sin(ph) * .04 * walk + Math.sin(now * 1.3) * .01;
    this.arms.forEach((a, i) => {
      const counter = Math.sin(ph + (i ? 0 : Math.PI)) * (.4 + run * .25) * walk;
      a.shoulder.rotation.set(counter + (s.mounted ? -.6 : 0) - S.hunch * .5, 0, a.side * (.14 + this.hipWidth + breath * .01 + (s.flying ? .25 : 0)));
      a.elbow.rotation.x = -.25 - run * .7 - (s.mounted ? .7 : 0) - Math.max(0, counter) * .4;
    });
    // The off hand holds the path's magic up and forward; the Wild Witch reaches out.
    const off = this.arms[0];
    if (!s.mounted && !s.glamour) {
      if (this.held) { off.shoulder.rotation.set(-1.05 - S.hunch * .5 + breath * .02, .2, .35); off.elbow.rotation.x = -.85; }
      else if (this.cls === 'wild') { off.shoulder.rotation.set(-1.3 + Math.sin(now * .8) * .05, .1, .2); off.elbow.rotation.x = -.15; }
    }
    // A tall staff or spear: the forearm forward and the pole upright through the fist, barely swinging as she walks.
    const main = this.arms[1];
    if (POLES.has(this.weaponKind) && !s.mounted && !s.glamour) {
      main.shoulder.rotation.x = -.32 + Math.sin(ph) * .12 * walk - S.hunch * .5; main.shoulder.rotation.z = -.2; main.elbow.rotation.x = -1.22 - run * .12;
    }
    main.hand.rotation.x = 0;
    let twist = 0, crouch = 0;
    if (s.swing > 0 && !s.mounted) {
      // The strike (or cast) eases in from the pose she is in and back out to it.
      const k = s.swingKind === 'cast' ? CAST : STRIKE, u = 1 - s.swing, w = u < .12 ? ease(u / .12) : u > .75 ? ease((1 - u) / .25) : 1;
      const to = (cur, joint) => cur + (keyed(k, joint, u) - cur) * w;
      main.shoulder.rotation.x = to(main.shoulder.rotation.x, 'armX');
      main.shoulder.rotation.z = to(main.shoulder.rotation.z, 'armZ');
      main.elbow.rotation.x = to(main.elbow.rotation.x, 'elbow');
      main.hand.rotation.x = keyed(k, 'wrist', u) * w;
      this.arms[0].shoulder.rotation.x += keyed(k, 'off', u) * w;
      this.body.rotation.y = keyed(k, 'hips', u) * w;
      this.torso.rotation.y = keyed(k, 'chest', u) * w;
      this.torso.rotation.x += keyed(k, 'lean', u) * w;
      crouch = keyed(k, 'crouch', u) * w;
      twist = this.body.rotation.y + this.torso.rotation.y;
    } else { this.body.rotation.y = 0; this.torso.rotation.y = 0; }
    // Into the blow on bent knees, the hips dropping to keep the feet down.
    if (crouch) { for (const l of this.legs) { l.knee.rotation.x += crouch; l.hip.rotation.x -= crouch * .5; } this.body.position.y -= crouch * .1; }
    // Bell sleeves hang from the elbow under their own weight, whatever the arm is doing.
    for (const a of this.arms) if (a.sleeve) a.sleeve.rotation.x = -(a.shoulder.rotation.x + a.elbow.rotation.x + this.torso.rotation.x) * .8;
    this.strands.rotation.x = .1 + this.sway * .5 + Math.sin(now * 1.7) * .03;
    this.lookAround(dt, now, s.look);
    if (twist) this.head.rotation.y -= twist * .75; // eyes stay on the target while the body turns
    if (this.hatTip) this.hatTip.rotation.z = Math.sin(now * 2 + ph) * .3;
    if (this.orb) this.orb.rotation.y = now * 1.5;
    if (this.lantern) this.lantern.rotation.z = Math.sin(now * 2.2 + ph) * .25;
    for (const sp of this.spinners) { sp.obj.rotation[sp.axis] = now * sp.speed; if (sp.bob) sp.obj.position.y = sp.y + Math.sin(now * 2.5 + sp.speed) * sp.bob; }
    for (const b of this.butterflies ?? []) {
      const { wings, k } = b.userData.butterfly, a = now * (.7 + k * .2) + k * 3;
      b.position.set(Math.cos(a) * (.7 + k * .2), 1.6 + k * .4 + Math.sin(now * 1.7 + k) * .2, Math.sin(a) * (.6 + k * .2));
      b.rotation.y = -a; wings.forEach((w, j) => { w.rotation.y = (j ? 1 : -1) * (.3 + Math.abs(Math.sin(now * 14 + k)) * 1.1); });
      b.visible = !s.glamour;
    }
    for (const g of this.gear) g.traverse(o => { if (o.userData.spin) { o.rotation.y = now * .9; o.material.opacity = .6 + Math.sin(now * 3) * .3; } });

    // Cape cloth: gathered at the shoulders, flaring and wrapping round the back, trailing with speed.
    const cape = this.capeMesh;
    if (cape && !s.glamour) {
      const pos = cape.geometry.attributes.position, base = cape.userData.base, trail = .1 + this.sway * .55;
      for (let i = 0; i < pos.count; i++) {
        const x0 = base[i * 3], y = base[i * 3 + 1], v = -y / 1.25, x = x0 * (.55 + .45 * v);
        const wrap = x * x * 1.6, ripple = Math.sin(now * 3.2 + v * 5 + x0 * 7) * .03 * v * (1 + this.sway);
        pos.setXYZ(i, x, y * (1 - trail * .3 * v), wrap - (v ** 1.4) * trail - .02 * v - ripple);
      }
      pos.needsUpdate = true; cape.geometry.computeVertexNormals();
    }
  }

  // Feet on the ground over uneven terrain: the hips drop to the lower foot and the other leg bends to meet the
  // slope (a two-joint leg solved exactly).
  plantFeet(ground) {
    const root = this.root, sc = root.scale.x, yaw = root.rotation.y, c = Math.cos(yaw), sn = Math.sin(yaw), base = root.position.y;
    const L1 = .46, L2 = .42, rise = this.legs.map((l, i) => {
      const lx = (i ? 1 : -1) * .088, lz = Math.sin(l.hip.rotation.x * -1) * (L1 + L2) * .9;
      const wx = root.position.x + (c * lx + sn * lz) * sc, wz = root.position.z + (-sn * lx + c * lz) * sc;
      return (ground(wx, wz) - base) / sc;
    });
    const drop = Math.max(-.22, Math.min(0, ...rise));
    this.body.position.y += drop;
    this.legs.forEach((l, i) => {
      const lift = Math.max(0, Math.min(.3, rise[i] - drop));
      if (lift < .005) return;
      const len = L1 + L2 - lift, cosK = (len * len - L1 * L1 - L2 * L2) / (2 * L1 * L2), k = Math.acos(Math.max(-1, Math.min(1, cosK)));
      l.knee.rotation.x += k; l.hip.rotation.x -= Math.asin(Math.min(1, L2 * Math.sin(k) / len));
    });
  }

  // Where she looks: the head turns part of the way to what holds her attention and the eyes the rest, with the
  // small quick jumps real eyes make; she blinks every few seconds.
  lookAround(dt, now, target) {
    const root = this.root, look = this.look ??= { yaw: 0, pitch: 0, sy: 0, sp: 0, next: 0, blink: 2, closing: 0 };
    let ty = 0, tp = 0;
    if (target) {
      const dx = target.x - root.position.x, dz = target.z - root.position.z, yaw = root.rotation.y, c = Math.cos(yaw), sn = Math.sin(yaw);
      const lx = c * dx - sn * dz, lz = sn * dx + c * dz, eyeY = root.position.y + 1.7 * root.scale.x;
      ty = Math.atan2(lx, lz); tp = Math.atan2(target.y - eyeY, Math.hypot(dx, dz));
      if (Math.abs(ty) > 1.6) ty = tp = 0; // behind her: let it go
    }
    look.yaw += (Math.max(-1.1, Math.min(1.1, ty)) - look.yaw) * Math.min(1, dt * 3.5);
    look.pitch += (Math.max(-.4, Math.min(.35, tp)) - look.pitch) * Math.min(1, dt * 3.5);
    if ((look.next -= dt) <= 0) { look.next = .4 + Math.random() * 2.2; look.sy = (Math.random() - .5) * .16; look.sp = (Math.random() - .5) * .08; }
    this.head.rotation.y += look.yaw * .65; this.head.rotation.x -= look.pitch * .5;
    if ((look.blink -= dt) <= 0) { look.blink = 1.8 + Math.random() * 4.5; look.closing = .17; }
    const shut = look.closing > 0 ? Math.sin((1 - look.closing / .17) * Math.PI) : 0;
    look.closing = Math.max(0, look.closing - dt);
    for (const e of this.eyeParts ?? []) {
      e.gaze.rotation.y = Math.max(-.45, Math.min(.45, look.yaw * .35 + look.sy));
      e.gaze.rotation.x = Math.max(-.3, Math.min(.3, -look.pitch * .5 + look.sp));
      e.lid.rotation.x = e.lid.userData.open + shut * 1.02 + Math.max(0, look.pitch) * -.1;
    }
  }
}
