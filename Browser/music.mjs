// Witchy music, made as it plays with the Web Audio API (there are no recordings): a low drone, slow minor
// chords, a harp picking out each chord, and a wooden flute singing a tune in D dorian. By night the flute
// gives way to a music box and the reverb deepens; in a fight a heartbeat of drums and a low ostinato join in.
// Browsers only allow sound after a click, so it starts with the first one (see start). Music.render plays the
// same music into a recording, faster than real time and without speakers (for tests and listening samples).
const D = 146.83; // D3
const SCALE = [0, 2, 3, 5, 7, 9, 10]; // D dorian, semitones over D
const freq = (degree, octave = 0) => D * 2 ** ((SCALE[((degree % 7) + 7) % 7] + 12 * (octave + Math.floor(degree / 7))) / 12);
// How hard the mix is driven into the compressor: at the default volume (half) the music then sits near
// -20 dBFS, gentle but plainly audible (Scripts/music_check.mjs measures it).
const DRIVE = .7;
// The volume slider (0–1) times this is the output gain: full volume is 6 dB over the default and still clear of clipping.
const VOLUME = 1.6;
// Chords as scale degrees (root position triads), four bars each round.
const MOODS = {
  day: { bpm: 66, chords: [[0, 2, 4], [5, 7, 9], [2, 4, 6], [6, 8, 10]], lead: 'flute', drums: false, wet: .35 },
  night: { bpm: 54, chords: [[0, 2, 4], [3, 5, 7], [0, 2, 4], [4, 6, 8]], lead: 'box', drums: false, wet: .55 },
  battle: { bpm: 96, chords: [[0, 2, 4], [6, 8, 10], [5, 7, 9], [4, 6, 8]], lead: 'flute', drums: true, wet: .3 },
};

export class Music {
  constructor() { this.volume = .5; this.enabled = true; this.mood = 'day'; this.ctx = null; }

  // Call from a click. Safe to call again.
  start() {
    if (this.ctx || !this.enabled) { this.ctx?.resume?.()?.catch?.(() => {}); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.build(new AC());
    this.timer = setInterval(() => this.schedule(), 100);
  }
  // `seconds` of one mood at `volume` (0–1), rendered offline: an AudioBuffer of stereo samples.
  static render(mood, seconds, volume = .5, rate = 44100) {
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const music = new Music();
    music.mood = mood; music.volume = volume;
    music.build(new OAC(2, Math.ceil(seconds * rate), rate));
    music.wet.gain.value = MOODS[mood].wet;
    music.scheduleUntil(seconds);
    return music.ctx.startRendering();
  }
  // The instruments, the reverb and the mix, on `ctx` (a live or an offline context).
  build(ctx) {
    this.ctx = ctx;
    // The mix is driven into gentle compression that also catches the drum hits; the volume comes after it, so
    // the slider works evenly and even full volume never clips.
    this.mix = ctx.createGain(); this.mix.gain.value = DRIVE;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.knee.value = 6; comp.ratio.value = 8; comp.attack.value = .002; comp.release.value = .2;
    this.master = ctx.createGain(); this.master.gain.value = this.volume * VOLUME;
    this.mix.connect(comp).connect(this.master).connect(ctx.destination);
    // A cathedral-ish reverb from a decaying noise impulse.
    this.reverb = ctx.createConvolver();
    const len = ctx.sampleRate * 3.2, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2.6; }
    this.reverb.buffer = ir;
    this.wet = ctx.createGain(); this.wet.gain.value = MOODS.day.wet;
    this.dry = ctx.createGain(); this.dry.gain.value = .8;
    this.dry.connect(this.mix); this.reverb.connect(this.wet).connect(this.mix);
    this.bus = ctx.createGain(); this.bus.connect(this.dry); this.bus.connect(this.reverb);
    this.drone();
    this.bar = 0; this.beat = 0; this.next = ctx.currentTime + .2; this.phrase = [];
  }
  setVolume(v) { this.volume = v; if (this.master) this.master.gain.setTargetAtTime(v * VOLUME, this.ctx.currentTime, .2); }
  setEnabled(on) {
    this.enabled = on;
    if (!this.ctx) { if (on) this.start(); return; }
    // (Either can be refused while the page is leaving, as it is after Quit: nothing to do then.)
    (on ? this.ctx.resume() : this.ctx.suspend())?.catch?.(() => {});
  }
  // Silence for good (leaving the page): no more notes scheduled, the sound device let go.
  stop() {
    clearInterval(this.timer); this.timer = null;
    this.ctx?.close?.()?.catch?.(() => {}); this.ctx = null;
  }
  // 'day', 'night' or 'battle'. Takes effect at the next bar.
  setMood(mood) { if (MOODS[mood]) this.mood = mood; }

  // The drone: D and A an octave and a fifth below, slightly detuned, breathing through a slow filter.
  drone() {
    const ctx = this.ctx, filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 260; filter.Q.value = 3;
    const lfo = ctx.createOscillator(), lfoGain = ctx.createGain(); lfo.frequency.value = .07; lfoGain.gain.value = 120; lfo.connect(lfoGain).connect(filter.frequency); lfo.start();
    this.droneGain = ctx.createGain(); this.droneGain.gain.value = .07;
    for (const [f, detune] of [[D / 2, -6], [D / 2, 7], [D * .75, 3]]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = detune; o.connect(filter); o.start(); }
    filter.connect(this.droneGain).connect(this.bus);
  }

  // Look ahead a little and queue every note that falls in the window.
  schedule() {
    const ctx = this.ctx;
    if (ctx.state !== 'running') return;
    this.wet.gain.setTargetAtTime(MOODS[this.mood].wet, ctx.currentTime, 1);
    this.scheduleUntil(ctx.currentTime + .4);
  }
  // Queue every beat that starts before `until` (seconds on the context's clock).
  scheduleUntil(until) {
    while (this.next < until) {
      const m = MOODS[this.mood], beatLen = 60 / m.bpm;
      const t = this.next, chord = m.chords[this.bar % 4];
      if (this.beat === 0) {
        this.pad(chord, t, beatLen * 4);
        if (this.bar % 4 === 0) this.phrase = this.compose(m);
      }
      // The harp: eighth notes up and down the chord, now and then resting.
      for (let half = 0; half < 2; half++) {
        if (Math.random() < (m.drums ? .1 : .3)) continue;
        const k = (this.beat * 2 + half) % 6, deg = chord[[0, 1, 2, 1, 2, 1][k]] + (k > 2 ? 7 : 0);
        this.pluck(freq(deg, 1), t + half * beatLen / 2, m.lead === 'box' ? .05 : .07);
      }
      const note = this.phrase[(this.bar % 4) * 4 + this.beat];
      if (note !== undefined && note !== null) (m.lead === 'box' ? this.musicBox(freq(note, 2), t) : this.flute(freq(note, 1), t, beatLen * (note === this.phrase[(this.bar % 4) * 4 + this.beat + 1] ? 2 : 1)));
      if (m.drums) { this.drum(t, this.beat % 2 === 0 ? 1 : .55); if (this.beat === 3) this.drum(t + beatLen / 2, .4); this.ostinato(freq(chord[0], -1), t, beatLen); }
      this.next += beatLen;
      if (++this.beat === 4) { this.beat = 0; this.bar++; }
    }
  }
  // A four-bar tune: mostly steps, now and then a leap, landing on chord tones on strong beats, with rests.
  compose(m) {
    const notes = [];
    let deg = 4 + Math.floor(Math.random() * 3);
    for (let i = 0; i < 16; i++) {
      const chord = m.chords[Math.floor(i / 4)];
      if (i % 4 === 0) deg = chord.reduce((best, c) => Math.abs(c - deg) < Math.abs(best - deg) ? c : best, chord[0]);
      else deg += Math.random() < .75 ? (Math.random() < .5 ? -1 : 1) : (Math.random() < .5 ? -2 : 3);
      deg = Math.max(0, Math.min(11, deg));
      notes.push(Math.random() < (i % 4 === 3 ? .45 : .2) ? null : deg);
    }
    if (Math.random() < .35) return notes.map(() => null); // a bar of breath now and then
    return notes;
  }
  env(gain, t, attack, hold, release, level) {
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(level, t + attack);
    gain.gain.setValueAtTime(level, t + attack + hold);
    gain.gain.exponentialRampToValueAtTime(.0001, t + attack + hold + release);
  }
  pad(chord, t, len) {
    for (const deg of chord) {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = 'triangle'; o.frequency.value = freq(deg); o.detune.value = (Math.random() - .5) * 8;
      this.env(g, t, 1.4, len - 1.4, 1.8, .028);
      o.connect(g).connect(this.bus); o.start(t); o.stop(t + len + 2);
    }
  }
  pluck(f, t, level) {
    const o = this.ctx.createOscillator(), o2 = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'sine'; o.frequency.value = f; o2.type = 'sine'; o2.frequency.value = f * 2.01;
    const g2 = this.ctx.createGain(); g2.gain.value = .25;
    g.gain.setValueAtTime(level, t); g.gain.exponentialRampToValueAtTime(.0001, t + 1.6);
    o.connect(g); o2.connect(g2).connect(g); g.connect(this.bus);
    o.start(t); o2.start(t); o.stop(t + 1.7); o2.stop(t + 1.7);
  }
  flute(f, t, len) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain(), vib = ctx.createOscillator(), vg = ctx.createGain();
    o.type = 'sine'; o.frequency.value = f; vib.frequency.value = 5.2; vg.gain.value = f * .006; vib.connect(vg).connect(o.frequency);
    this.env(g, t, .09, Math.max(.05, len - .3), .35, .055);
    // A breath of noise at the start of each note.
    const noise = ctx.createBufferSource(), nb = ctx.createBuffer(1, ctx.sampleRate * .2, ctx.sampleRate), nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = (Math.random() * 2 - 1) * (1 - i / nd.length);
    noise.buffer = nb; const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f * 2; bp.Q.value = 2; const ng = ctx.createGain(); ng.gain.value = .02;
    noise.connect(bp).connect(ng).connect(this.bus); noise.start(t);
    o.connect(g).connect(this.bus); vib.start(t); o.start(t); o.stop(t + len + .5); vib.stop(t + len + .5);
  }
  musicBox(f, t) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(.045, t); g.gain.exponentialRampToValueAtTime(.0001, t + 2.2);
    o.connect(g).connect(this.bus); o.start(t); o.stop(t + 2.3);
  }
  drum(t, level) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(42, t + .25);
    g.gain.setValueAtTime(.32 * level, t); g.gain.exponentialRampToValueAtTime(.0001, t + .45);
    o.connect(g).connect(this.dry); o.start(t); o.stop(t + .5);
  }
  ostinato(f, t, len) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain(), lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600;
    o.type = 'sawtooth'; o.frequency.value = f;
    this.env(g, t, .02, len * .4, .15, .035);
    o.connect(lp).connect(g).connect(this.bus); o.start(t); o.stop(t + len);
  }
}
