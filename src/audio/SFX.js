/**
 * SFX.js — Motor de Áudio Musical Procedural para GEO SUMO.
 *
 * Filosofia: Todo som do jogo é MUSICAL. Nenhum ruído aleatório puro —
 * tudo é construído sobre escalas harmônicas, acordes e intervalos que
 * soam bem juntos e criam uma experiência sonora coesa e satisfatória.
 *
 * Escala base: Pentatônica Menor em D (D F G A C) — impossível soar mal.
 * Extensão: Acordes de 7ª, suspensões, e resolução tonal para drama.
 *
 * ┌─────────────────────────────────────────────────────┐
 * │  NOTA MAP (midi → Hz)                                │
 * │  D3=146.83  F3=174.61  G3=196.00  A3=220.00         │
 * │  C4=261.63  D4=293.66  F4=349.23  G4=392.00         │
 * │  A4=440.00  C5=523.25  D5=587.33  F5=698.46         │
 * │  G5=783.99  A5=880.00  C6=1046.50                    │
 * └─────────────────────────────────────────────────────┘
 *
 * API mantém compatibilidade total com todos os callers existentes.
 */

// ═════════════════════════════════════════════════════════════
// MUSICAL FOUNDATION
// ═════════════════════════════════════════════════════════════

/** Convert MIDI note number → frequency Hz */
function mtof(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }

/**
 * Pentatonic Minor Scale in D — MIDI note numbers
 *   D  F  G  A  C  (intervals: 0 3 5 7 10  from root)
 * Extended across 4 octaves for full range.
 */
const SCALE_ROOT = 50;  // D3
const PENTA_INTERVALS = [0, 3, 5, 7, 10]; // minor pentatonic
const SCALE = [];
for (let oct = 0; oct < 5; oct++) {
    for (const interval of PENTA_INTERVALS) {
        SCALE.push(SCALE_ROOT + oct * 12 + interval);
    }
}

/** Get a scale note by index (wraps around). Returns frequency. */
function scaleNote(idx) {
    idx = Math.max(0, Math.min(idx, SCALE.length - 1));
    return mtof(SCALE[idx]);
}

/** Get frequency from scale degree offset from a base index */
function scaleOffset(baseIdx, offset) {
    return scaleNote(baseIdx + offset);
}

// Named note shortcuts (scale indices into D minor pentatonic)
// Octave 3: D3=0, F3=1, G3=2, A3=3, C4=4
// Octave 4: D4=5, F4=6, G4=7, A4=8, C5=9
// Octave 5: D5=10, F5=11, G5=12, A5=13, C6=14
const N = {
    D3: 0, F3: 1, G3: 2, A3: 3, C4: 4,
    D4: 5, F4: 6, G4: 7, A4: 8, C5: 9,
    D5: 10, F5: 11, G5: 12, A5: 13, C6: 14,
    D6: 15, F6: 16, G6: 17, A6: 18, C7: 19,
};

// ═════════════════════════════════════════════════════════════
// AUDIO CONTEXT & MASTER BUS
// ═════════════════════════════════════════════════════════════

let ctx = null;
let master = null;

// Soft limiter / compressor on master bus for clean output
let compressor = null;

// Movement drone
let droneOsc1 = null, droneOsc2 = null, droneGain = null, droneFilter = null;

// Charge synth
let chargeOsc = null, chargeGain = null, chargeFilter = null;

// Ambient pad (subtle background)
let padOsc1 = null, padOsc2 = null, padGain = null;

// ── Cooldowns (prevent sound spam) ───────────────────────────
let _lastMoveNoteTime = 0;
let _lastMoveDir = '';
let _lastImpactTime = 0;
let _lastEdgeTime = 0;

export function init() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();

    // Master compressor → prevents clipping, makes everything sit well
    compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 12;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.15;
    compressor.connect(ctx.destination);

    master = ctx.createGain();
    master.gain.value = 0.7;
    master.connect(compressor);

    _initDrone();
    _initChargeSynth();
    _initAmbientPad();
    _initDynamicLayers();
}

export function resume() {
    if (!ctx) return;
    if (ctx.state === 'suspended') return ctx.resume();
    return Promise.resolve();
}

export function setMasterVolume(v) {
    if (master) master.gain.value = v;
}

function now() { return ctx ? ctx.currentTime : 0; }

// ═════════════════════════════════════════════════════════════
// SYNTH PRIMITIVES — Musical building blocks
// ═════════════════════════════════════════════════════════════

/**
 * Play a single musical tone with envelope.
 * This is the fundamental building block — everything is built from this.
 */
function _tone({
    freq = 440, type = 'sine', dur = 0.2, vol = 0.15,
    attack = 0.005, decay = 0.05, sustain = 0.7, release = 0.1,
    detune = 0, pan = 0, filterFreq = 0, filterQ = 1,
    delay = 0, vibrato = 0, vibratoRate = 5
}) {
    if (!ctx) return;
    const t = now() + delay;

    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    osc.detune.value = detune;

    // Vibrato
    if (vibrato > 0) {
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        lfo.frequency.value = vibratoRate;
        lfoGain.gain.value = vibrato;
        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);
        lfo.start(t);
        lfo.stop(t + dur + release + 0.05);
    }

    // ADSR envelope
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(vol, t + attack);
    env.gain.linearRampToValueAtTime(vol * sustain, t + attack + decay);
    env.gain.setValueAtTime(vol * sustain, t + dur - release);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur + release);

    // Stereo pan
    let panNode = null;
    if (ctx.createStereoPanner && pan !== 0) {
        panNode = ctx.createStereoPanner();
        panNode.pan.value = pan;
    }

    // Filter (optional)
    let filterNode = null;
    if (filterFreq > 0) {
        filterNode = ctx.createBiquadFilter();
        filterNode.type = 'lowpass';
        filterNode.frequency.value = filterFreq;
        filterNode.Q.value = filterQ;
    }

    // Connect chain
    let chain = osc;
    if (filterNode) { chain.connect(filterNode); chain = filterNode; }
    chain.connect(env);
    if (panNode) { env.connect(panNode); panNode.connect(master); }
    else { env.connect(master); }

    osc.start(t);
    osc.stop(t + dur + release + 0.05);
}

/**
 * Play a chord (multiple tones at once).
 */
function _chord(noteIndices, opts = {}) {
    const baseVol = (opts.vol || 0.12) / Math.sqrt(noteIndices.length);
    noteIndices.forEach((idx, i) => {
        _tone({
            ...opts,
            freq: scaleNote(idx),
            vol: baseVol * (i === 0 ? 1.0 : 0.8), // root slightly louder
            detune: (opts.detune || 0) + (i * 2), // slight detune for richness
        });
    });
}

/**
 * Play a melodic sequence (notes in time).
 */
function _melody(pattern, opts = {}) {
    const spacing = opts.spacing || 0.1;
    pattern.forEach((noteIdx, i) => {
        if (noteIdx === null) return; // rest
        _tone({
            ...opts,
            freq: scaleNote(noteIdx),
            delay: (opts.delay || 0) + i * spacing,
        });
    });
}

/**
 * Soft filtered noise burst (for texture, not as primary sound).
 * Used sparingly as accent, not as effect core.
 */
function _softNoise({ dur = 0.1, vol = 0.08, freq = 1200, q = 2, delay = 0 }) {
    if (!ctx) return;
    const t = now() + delay;
    const len = Math.ceil(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    // Shaped noise (fade out naturally)
    for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / len) * (1 - i / len);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;

    const filt = ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = freq;
    filt.Q.value = q;

    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    src.connect(filt);
    filt.connect(g);
    g.connect(master);
    src.start(t);
    src.stop(t + dur + 0.05);
}

// ═════════════════════════════════════════════════════════════
// PERSISTENT SYNTHS — Drones & Pads
// ═════════════════════════════════════════════════════════════

function _initDrone() {
    // Musical movement drone — two detuned oscillators in D
    // Replaces the old ugly 70Hz sawtooth
    droneOsc1 = ctx.createOscillator();
    droneOsc1.type = 'triangle';
    droneOsc1.frequency.value = scaleNote(N.D3); // D3 ~147Hz

    droneOsc2 = ctx.createOscillator();
    droneOsc2.type = 'sine';
    droneOsc2.frequency.value = scaleNote(N.A3); // A3 — perfect fifth above

    droneFilter = ctx.createBiquadFilter();
    droneFilter.type = 'lowpass';
    droneFilter.frequency.value = 400;
    droneFilter.Q.value = 2;

    droneGain = ctx.createGain();
    droneGain.gain.value = 0;

    droneOsc1.connect(droneFilter);
    droneOsc2.connect(droneFilter);
    droneFilter.connect(droneGain);
    droneGain.connect(master);

    droneOsc1.start();
    droneOsc2.start();
}

function _initChargeSynth() {
    // Charge: rising tone rooted in the scale
    chargeOsc = ctx.createOscillator();
    chargeOsc.type = 'sine';
    chargeOsc.frequency.value = scaleNote(N.D3);

    const chargeOsc2 = ctx.createOscillator();
    chargeOsc2.type = 'triangle';
    chargeOsc2.frequency.value = scaleNote(N.D3);
    chargeOsc2.detune.value = 7; // subtle chorus

    chargeFilter = ctx.createBiquadFilter();
    chargeFilter.type = 'lowpass';
    chargeFilter.frequency.value = 600;
    chargeFilter.Q.value = 4;

    chargeGain = ctx.createGain();
    chargeGain.gain.value = 0;

    chargeOsc.connect(chargeFilter);
    chargeOsc2.connect(chargeFilter);
    chargeFilter.connect(chargeGain);
    chargeGain.connect(master);

    chargeOsc.start();
    chargeOsc2.start();
}

function _initAmbientPad() {
    // Extremely subtle background pad — D minor pentatonic chord
    // Creates atmosphere without being noticeable
    padOsc1 = ctx.createOscillator();
    padOsc1.type = 'sine';
    padOsc1.frequency.value = scaleNote(N.D3);

    padOsc2 = ctx.createOscillator();
    padOsc2.type = 'sine';
    padOsc2.frequency.value = scaleNote(N.A3);
    padOsc2.detune.value = 3;

    padGain = ctx.createGain();
    padGain.gain.value = 0;  // starts silent, fades in during fight

    const padFilter = ctx.createBiquadFilter();
    padFilter.type = 'lowpass';
    padFilter.frequency.value = 300;

    padOsc1.connect(padFilter);
    padOsc2.connect(padFilter);
    padFilter.connect(padGain);
    padGain.connect(master);

    padOsc1.start();
    padOsc2.start();
}

// ═════════════════════════════════════════════════════════════
// DYNAMIC MUSIC LAYERS — Adaptive Procedural Soundtrack
// ═════════════════════════════════════════════════════════════

/**
 * Beat Clock System
 * Runs at 120 BPM (2 beats/second, 0.5s per beat)
 * All rhythmic elements sync to this clock.
 */
const BPM = 120;
const BEAT_DURATION = 60 / BPM; // 0.5 seconds per beat
let beatClock = 0;              // current beat (float)
let beatPhase = 0;              // 0..1 within current beat
let lastBeatTime = 0;           // for delta calculation

// Instruments (persistent oscillators + gain controls)
let bassOsc = null, bassGain = null, bassFilter = null;
let kickGain = null, kickEnv = null;
let hihatOsc = null, hihatGain = null, hihatFilter = null;
let snareGain = null;
let leadOsc = null, leadGain = null, leadFilter = null;
let arpOsc = null, arpGain = null, arpFilter = null;

// Layer state
let combatIntensity = 0; // 0=idle, 1=light, 2=medium, 3=intense, 4=chaos, 5=climax
let targetLayerGains = { bass: 0, kick: 0, hihat: 0, snare: 0, lead: 0, arp: 0 };
let currentLayerGains = { bass: 0, kick: 0, hihat: 0, snare: 0, lead: 0, arp: 0 };

// Beat triggers (set by update loop)
let _onBeat = false;       // kick & snare triggers
let _onEighth = false;     // hihat trigger
let _lastBeatNum = -1;
let _lastEighthNum = -1;

function _initDynamicLayers() {
    if (!ctx) return;

    // ── BASS LINE (always running, volume varies) ────────────
    bassOsc = ctx.createOscillator();
    bassOsc.type = 'triangle';
    bassOsc.frequency.value = scaleNote(N.D3); // root note
    
    bassFilter = ctx.createBiquadFilter();
    bassFilter.type = 'lowpass';
    bassFilter.frequency.value = 350;
    bassFilter.Q.value = 3;
    
    bassGain = ctx.createGain();
    bassGain.gain.value = 0;
    
    bassOsc.connect(bassFilter);
    bassFilter.connect(bassGain);
    bassGain.connect(master);
    bassOsc.start();

    // ── KICK DRUM (triggered on beat 1 & 3) ─────────────────
    // We'll use a rapidly descending sine for kick
    kickEnv = ctx.createGain();
    kickEnv.gain.value = 0;
    kickGain = ctx.createGain();
    kickGain.gain.value = 0;
    kickEnv.connect(kickGain);
    kickGain.connect(master);

    // ── HI-HAT (8th notes) ───────────────────────────────────
    hihatOsc = ctx.createOscillator();
    hihatOsc.type = 'square';
    hihatOsc.frequency.value = 8000; // very high pitch
    
    hihatFilter = ctx.createBiquadFilter();
    hihatFilter.type = 'highpass';
    hihatFilter.frequency.value = 5000;
    
    hihatGain = ctx.createGain();
    hihatGain.gain.value = 0;
    
    hihatOsc.connect(hihatFilter);
    hihatFilter.connect(hihatGain);
    hihatGain.connect(master);
    hihatOsc.start();

    // ── SNARE (beat 2 & 4) ───────────────────────────────────
    snareGain = ctx.createGain();
    snareGain.gain.value = 0;
    snareGain.connect(master);

    // ── LEAD MELODY (active during intense combat) ───────────
    leadOsc = ctx.createOscillator();
    leadOsc.type = 'sawtooth';
    leadOsc.frequency.value = scaleNote(N.D4);
    
    leadFilter = ctx.createBiquadFilter();
    leadFilter.type = 'lowpass';
    leadFilter.frequency.value = 1200;
    leadFilter.Q.value = 4;
    
    leadGain = ctx.createGain();
    leadGain.gain.value = 0;
    
    leadOsc.connect(leadFilter);
    leadFilter.connect(leadGain);
    leadGain.connect(master);
    leadOsc.start();

    // ── ARPEGGIO (chaos mode) ────────────────────────────────
    arpOsc = ctx.createOscillator();
    arpOsc.type = 'square';
    arpOsc.frequency.value = scaleNote(N.D5);
    
    arpFilter = ctx.createBiquadFilter();
    arpFilter.type = 'bandpass';
    arpFilter.frequency.value = 1800;
    arpFilter.Q.value = 6;
    
    arpGain = ctx.createGain();
    arpGain.gain.value = 0;
    
    arpOsc.connect(arpFilter);
    arpFilter.connect(arpGain);
    arpGain.connect(master);
    arpOsc.start();
}

/**
 * Set combat intensity (0-5) — controls which layers are active.
 * 0 = idle       → only ambient pad
 * 1 = light      → + bass + hihat (quiet)
 * 2 = medium     → + kick drum
 * 3 = intense    → + snare + lead melody
 * 4 = chaos      → + arpeggios, everything louder
 * 5 = climax     → FULL BLAST (special moments)
 */
export function setCombatIntensity(level) {
    init();
    if (!bassGain) return;
    
    combatIntensity = Math.max(0, Math.min(5, level));
    
    // Define target gains for each layer based on intensity
    switch(combatIntensity) {
        case 0: // idle
            targetLayerGains = { bass: 0, kick: 0, hihat: 0, snare: 0, lead: 0, arp: 0 };
            break;
        case 1: // light combat
            targetLayerGains = { bass: 0.08, kick: 0, hihat: 0.03, snare: 0, lead: 0, arp: 0 };
            break;
        case 2: // medium
            targetLayerGains = { bass: 0.12, kick: 0.18, hihat: 0.05, snare: 0, lead: 0, arp: 0 };
            break;
        case 3: // intense
            targetLayerGains = { bass: 0.15, kick: 0.22, hihat: 0.06, snare: 0.15, lead: 0.08, arp: 0 };
            break;
        case 4: // chaos
            targetLayerGains = { bass: 0.18, kick: 0.25, hihat: 0.08, snare: 0.18, lead: 0.12, arp: 0.10 };
            break;
        case 5: // climax
            targetLayerGains = { bass: 0.22, kick: 0.30, hihat: 0.10, snare: 0.22, lead: 0.15, arp: 0.15 };
            break;
    }
}

/**
 * Get current beat phase (0..1) for timing windows.
 * 0.0 = start of beat (perfect timing)
 * 0.5 = middle of beat
 * Values near 0 or 1 are "on beat"
 */
export function getBeatPhase() {
    return beatPhase;
}

/**
 * Check if we're currently "on the beat" (within timing window).
 * Returns multiplier: 1.0 = off-beat, 1.25 = perfect
 */
export function getTimingMultiplier() {
    // Window: 0.1 beats before/after the exact beat
    const distFromBeat = Math.abs(beatPhase - Math.round(beatPhase));
    if (distFromBeat < 0.1) {
        // Perfect window: 0.85 to 0.95 precision
        const precision = 1.0 - (distFromBeat / 0.1);
        return 1.0 + precision * 0.25; // up to +25% damage
    }
    return 1.0;
}

/**
 * Update the beat clock and trigger rhythmic events.
 * Call this every frame from main game loop.
 */
function _updateBeatClock(dt) {
    if (!ctx) return;
    
    const t = now();
    
    // Advance beat clock
    beatClock += dt / BEAT_DURATION;
    beatPhase = beatClock % 1.0;
    
    // Detect beat boundaries (quarter notes)
    const beatNum = Math.floor(beatClock);
    if (beatNum !== _lastBeatNum) {
        _lastBeatNum = beatNum;
        _onBeat = true;
        _triggerBeatEvent(beatNum);
    } else {
        _onBeat = false;
    }
    
    // Detect eighth note boundaries
    const eighthNum = Math.floor(beatClock * 2);
    if (eighthNum !== _lastEighthNum) {
        _lastEighthNum = eighthNum;
        _onEighth = true;
        _triggerEighthEvent();
    } else {
        _onEighth = false;
    }
    
    // Smooth layer gain transitions
    const smoothing = 0.05; // slow fade in/out
    for (const layer in currentLayerGains) {
        const target = targetLayerGains[layer];
        const current = currentLayerGains[layer];
        currentLayerGains[layer] += (target - current) * smoothing;
    }
    
    // Apply gains to actual nodes
    if (bassGain) bassGain.gain.setValueAtTime(currentLayerGains.bass, t);
    if (kickGain) kickGain.gain.setValueAtTime(currentLayerGains.kick, t);
    if (hihatGain) hihatGain.gain.setValueAtTime(currentLayerGains.hihat * 0.02, t); // hihat is very quiet
    if (snareGain) snareGain.gain.setValueAtTime(currentLayerGains.snare, t);
    if (leadGain) leadGain.gain.setValueAtTime(currentLayerGains.lead, t);
    if (arpGain) arpGain.gain.setValueAtTime(currentLayerGains.arp, t);
    
    // Update melodic elements (bass line walks, lead melody changes)
    _updateMelodicProgression();
}

/**
 * Trigger drum hits and accents on the beat.
 */
function _triggerBeatEvent(beatNum) {
    const t = now();
    const beatInBar = beatNum % 4; // 4/4 time signature
    
    // Kick drum on beats 1 and 3 (if kick layer is active)
    if ((beatInBar === 0 || beatInBar === 2) && currentLayerGains.kick > 0.01) {
        _playKick(t);
    }
    
    // Snare on beats 2 and 4 (if snare layer is active)
    if ((beatInBar === 1 || beatInBar === 3) && currentLayerGains.snare > 0.01) {
        _playSnare(t);
    }
}

function _triggerEighthEvent() {
    // Hi-hat plays on eighth notes (if active)
    if (currentLayerGains.hihat > 0.01) {
        // Already handled by continuous oscillator, just modulate
        const t = now();
        if (hihatGain) {
            hihatGain.gain.cancelScheduledValues(t);
            hihatGain.gain.setValueAtTime(currentLayerGains.hihat * 0.03, t);
            hihatGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
        }
    }
}

/**
 * Play kick drum (sub-bass punch).
 */
function _playKick(t) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(scaleNote(N.D3) * 0.5, t); // sub octave
    osc.frequency.exponentialRampToValueAtTime(scaleNote(N.D3) * 0.25, t + 0.08);
    
    const env = ctx.createGain();
    env.gain.setValueAtTime(currentLayerGains.kick * 0.3, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    
    osc.connect(env);
    env.connect(kickGain);
    osc.start(t);
    osc.stop(t + 0.2);
}

/**
 * Play snare (filtered noise burst + tonal component).
 */
function _playSnare(t) {
    // Tonal part (high pitch)
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = scaleNote(N.D5);
    
    const oscEnv = ctx.createGain();
    oscEnv.gain.setValueAtTime(currentLayerGains.snare * 0.08, t);
    oscEnv.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    
    osc.connect(oscEnv);
    oscEnv.connect(snareGain);
    osc.start(t);
    osc.stop(t + 0.08);
    
    // Noise part
    const bufLen = Math.ceil(ctx.sampleRate * 0.08);
    const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / bufLen) * 0.6;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    
    const filt = ctx.createBiquadFilter();
    filt.type = 'highpass';
    filt.frequency.value = 2000;
    
    const noiseEnv = ctx.createGain();
    noiseEnv.gain.setValueAtTime(currentLayerGains.snare * 0.12, t);
    noiseEnv.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    
    src.connect(filt);
    filt.connect(noiseEnv);
    noiseEnv.connect(snareGain);
    src.start(t);
}

/**
 * Update melodic progression — bass walks, lead changes notes.
 */
function _updateMelodicProgression() {
    const t = now();
    const barNum = Math.floor(beatClock / 4); // which 4-bar phrase
    
    // Bass line: walks through chord tones every bar
    if (bassOsc) {
        const bassPattern = [N.D3, N.A3, N.D3, N.G3]; // I - V - I - IV
        const noteIdx = bassPattern[barNum % 4];
        bassOsc.frequency.setTargetAtTime(scaleNote(noteIdx), t, 0.1);
    }
    
    // Lead melody: pentatonic runs when active
    if (leadOsc && currentLayerGains.lead > 0.05) {
        const leadPattern = [N.D4, N.F4, N.G4, N.A4, N.D5, N.C5, N.A4, N.G4];
        const noteIdx = leadPattern[(Math.floor(beatClock * 2)) % 8]; // changes on eighth
        leadOsc.frequency.setTargetAtTime(scaleNote(noteIdx), t, 0.04);
        leadFilter.frequency.setTargetAtTime(1200 + Math.sin(beatClock) * 600, t, 0.08);
    }
    
    // Arpeggio: fast cycling through triad when active
    if (arpOsc && currentLayerGains.arp > 0.05) {
        const arpPattern = [N.D5, N.F5, N.A5]; // D minor triad
        const noteIdx = arpPattern[Math.floor(beatClock * 4) % 3]; // 16th notes
        arpOsc.frequency.setTargetAtTime(scaleNote(noteIdx), t, 0.01);
    }
}

// ═════════════════════════════════════════════════════════════
// UI SFX — Menu navigation (musical clicks)
// ═════════════════════════════════════════════════════════════

export function playClick() {
    init();
    // D5 + light octave harmonic — crisp, musical click
    _tone({ freq: scaleNote(N.D5), type: 'triangle', dur: 0.06, vol: 0.10,
            attack: 0.001, release: 0.03, sustain: 0.3 });
    _tone({ freq: scaleNote(N.D6), type: 'sine', dur: 0.04, vol: 0.04,
            attack: 0.001, release: 0.02, sustain: 0.2, delay: 0.005 });
}

export function playNavigate() {
    init();
    // G4 → soft, warm navigation blip
    _tone({ freq: scaleNote(N.G4), type: 'sine', dur: 0.09, vol: 0.09,
            attack: 0.002, release: 0.04, sustain: 0.5 });
}

export function playRandomize() {
    init();
    // Playful descending arpeggio: D5 → A4 → F4 (scale degrees)
    _melody([N.D5, N.A4, N.F4], {
        type: 'triangle', dur: 0.07, vol: 0.08, spacing: 0.07,
        attack: 0.001, release: 0.04, sustain: 0.4,
    });
}

export function playStart() {
    init();
    // Ascending power chord: D4 + A4 (fifth)
    _chord([N.D4, N.A4], {
        type: 'triangle', dur: 0.12, vol: 0.12,
        attack: 0.002, release: 0.06, sustain: 0.5,
    });
}

// ═════════════════════════════════════════════════════════════
// COUNTDOWN — Building tension with ascending scale
// ═════════════════════════════════════════════════════════════

export function playCountdownTick(stage) {
    init();
    if (stage === 'FIGHT') {
        // RESOLUÇÃO TONAL: D minor power chord voicing
        // D3 + A3 + D4 + F4 → full resolve, dramatic
        _chord([N.D3, N.A3, N.D4, N.F4], {
            type: 'sawtooth', dur: 0.5, vol: 0.25,
            attack: 0.01, release: 0.3, sustain: 0.6,
            filterFreq: 1500, filterQ: 2,
        });
        // Bright octave ping on top
        _tone({ freq: scaleNote(N.D5), type: 'triangle', dur: 0.15, vol: 0.10,
                attack: 0.001, release: 0.08, sustain: 0.3, delay: 0.06 });
        // Percussive accent
        _softNoise({ dur: 0.12, vol: 0.15, freq: 2000, q: 1, delay: 0.01 });
    } else {
        // 3 → 2 → 1:  ascending notes in the scale (builds tension)
        // 3 = G3, 2 = A3, 1 = C4 → ascending toward resolution at FIGHT
        const noteMap = { '3': N.G3, '2': N.A3, '1': N.C4 };
        const note = noteMap[stage] || N.G3;
        _tone({ freq: scaleNote(note), type: 'sine', dur: 0.12, vol: 0.12,
                attack: 0.002, release: 0.06, sustain: 0.5 });
        // Subtle harmonic (octave above)
        _tone({ freq: scaleNote(note + 5), type: 'sine', dur: 0.08, vol: 0.04,
                attack: 0.002, release: 0.04, sustain: 0.3, delay: 0.01 });
    }
}

// ═════════════════════════════════════════════════════════════
// MOVEMENT — Musical footsteps via direction-mapped notes
// ═════════════════════════════════════════════════════════════

/**
 * Play a directional movement note.
 * Each direction maps to a note in the pentatonic scale:
 *   W (forward)  = D4 (root — home, stable)
 *   S (back)     = A3 (fifth below — retreating gravity)
 *   A (left)     = F4 (minor third — lateral movement)
 *   D (right)    = G4 (fourth — complementary lateral)
 *   Diagonals blend/alternate.
 *
 * Notes are very short, quiet, and velocity-sensitive.
 * Cooldown prevents spam (max ~8 notes/sec).
 */
export function playMoveNote(dirKey, velocity = 0.5) {
    init();
    const t = now();
    if (t - _lastMoveNoteTime < 0.12) return; // cooldown: ~8/sec max
    if (dirKey === _lastMoveDir && t - _lastMoveNoteTime < 0.2) return; // same dir: slower

    _lastMoveNoteTime = t;
    _lastMoveDir = dirKey;

    const noteMap = {
        'w': N.D4,   // root
        's': N.A3,   // fifth below
        'a': N.F4,   // minor third
        'd': N.G4,   // fourth
        'wa': N.C4,  // diagonal: C4
        'wd': N.D4,  // diagonal: stays on root
        'sa': N.G3,  // diagonal: G3
        'sd': N.F3,  // diagonal: F3
    };

    const note = noteMap[dirKey] || N.D4;
    const vol = 0.03 + velocity * 0.04; // very subtle: 0.03–0.07

    _tone({
        freq: scaleNote(note),
        type: 'sine',
        dur: 0.06,
        vol: vol,
        attack: 0.002,
        decay: 0.01,
        sustain: 0.3,
        release: 0.03,
    });
}

/**
 * Movement drone level — musical version.
 * Drone is a D+A power chord that swells with speed.
 * Filter opens as speed increases (brighter = faster).
 */
export function setMovementLevel(level) {
    init();
    level = Math.max(0, Math.min(1, level));
    if (!droneOsc1) return;
    const t = now();
    // Volume: very subtle, just adds warmth
    droneGain.gain.setTargetAtTime(level * 0.05, t, 0.08);
    // Filter opens: 400Hz idle → 1200Hz full speed
    droneFilter.frequency.setTargetAtTime(400 + level * 800, t, 0.06);
}

// ═════════════════════════════════════════════════════════════
// COMBAT — Musical impacts, body slams, combos
// ═════════════════════════════════════════════════════════════

/**
 * Impact SFX — musical hit: base note + octave + percussive texture.
 * Force determines pitch (higher note index), volume, and brightness.
 */
export function playImpact(force) {
    init();
    const t = now();
    if (t - _lastImpactTime < 0.06) return; // debounce
    _lastImpactTime = t;

    force = Math.min(force, 5);
    const vol = Math.min(0.35, 0.08 + force * 0.08);

    // Force → note: stronger hits go UP the scale
    // Low force: D4, medium: G4, high: D5, extreme: A5
    const noteIdx = N.D4 + Math.floor(force * 1.8);

    // Main impact tone
    _tone({
        freq: scaleNote(noteIdx),
        type: 'triangle',
        dur: 0.12,
        vol: vol,
        attack: 0.001,
        decay: 0.03,
        sustain: 0.4,
        release: 0.08,
    });

    // Octave harmonic (brightness from force)
    _tone({
        freq: scaleNote(noteIdx + 5), // octave up in pentatonic
        type: 'sine',
        dur: 0.08,
        vol: vol * 0.3,
        attack: 0.001,
        release: 0.05,
        sustain: 0.2,
    });

    // Gentle percussive texture (not harsh noise — filtered high)
    _softNoise({
        dur: 0.08 + force * 0.04,
        vol: vol * 0.25,
        freq: 1800 + force * 400,
        q: 3,
    });
}

/**
 * Body slam — low, heavy, satisfying thud.
 * Musical: sub bass note + body + short decay.
 */
export function playBodySlam(force) {
    init();
    force = Math.min(force, 3);
    const vol = Math.min(0.35, 0.1 + force * 0.15);

    // Deep sub-bass hit: D3 or lower
    _tone({
        freq: scaleNote(N.D3),
        type: 'triangle',
        dur: 0.3,
        vol: vol,
        attack: 0.005,
        decay: 0.05,
        sustain: 0.4,
        release: 0.25,
        filterFreq: 400,
    });

    // Body tone: power fifth above
    _tone({
        freq: scaleNote(N.A3),
        type: 'sine',
        dur: 0.15,
        vol: vol * 0.4,
        attack: 0.01,
        delay: 0.02,
        release: 0.1,
        sustain: 0.3,
    });

    // Soft thud texture
    _softNoise({ dur: 0.1, vol: vol * 0.3, freq: 400, q: 1.5, delay: 0.01 });
}

/**
 * Dash/charge release — whoosh that's actually a musical sweep.
 * Ascending glissando through the scale + wind texture.
 */
export function playDash(power) {
    init();
    power = Math.min(power, 3);
    const vol = 0.06 + power * 0.12;

    // Musical sweep: rapid ascending scale fragment
    const startNote = N.D3;
    const numNotes = 3 + Math.floor(power * 2); // more notes = more power
    for (let i = 0; i < numNotes; i++) {
        _tone({
            freq: scaleNote(startNote + i),
            type: 'sawtooth',
            dur: 0.04,
            vol: vol * (0.5 + i / numNotes * 0.5),
            attack: 0.001,
            release: 0.03,
            sustain: 0.3,
            delay: i * 0.025,
            filterFreq: 800 + power * 400,
            filterQ: 2,
        });
    }

    // Wind texture (gentle)
    _softNoise({ dur: 0.15, vol: vol * 0.2, freq: 1500, q: 1.5 });
}

/**
 * Edge warning — tension note that rises with intensity.
 * Tritone interval (dissonant) creates urgency musically.
 */
export function playEdgeWarning(intensity) {
    init();
    const t = now();
    if (t - _lastEdgeTime < 0.15) return;
    _lastEdgeTime = t;

    intensity = Math.min(intensity, 1);
    const vol = 0.04 + intensity * 0.10;

    // A4 (in scale) → getting tense
    // As intensity increases, add the tritone (Ab — outside the scale = dissonant)
    _tone({
        freq: scaleNote(N.A4),
        type: 'sine',
        dur: 0.1,
        vol: vol,
        attack: 0.002,
        release: 0.06,
        sustain: 0.4,
    });

    if (intensity > 0.5) {
        // Tritone above root (Ab4 = 415.3 Hz) — deliberately outside scale for tension
        _tone({
            freq: 415.3,
            type: 'sine',
            dur: 0.08,
            vol: vol * 0.4 * intensity,
            attack: 0.002,
            release: 0.05,
            sustain: 0.3,
        });
    }
}

/**
 * Combo system — each successive hit plays the NEXT note in an ascending melody.
 * Creates a satisfying escalation that musically rewards skill.
 *
 * Combo 1: D4
 * Combo 2: F4
 * Combo 3: G4
 * Combo 4: A4
 * Combo 5: C5
 * Combo 6: D5 (octave! — big payoff)
 * Combo 7+: D5 with increasing harmonics
 */
export function playCombo(comboCount) {
    init();
    comboCount = Math.max(1, comboCount);

    // Ascending through the scale
    const noteIdx = N.D4 + Math.min(comboCount - 1, 10);
    const vol = 0.10 + Math.min(comboCount * 0.02, 0.12);

    // Main note
    _tone({
        freq: scaleNote(noteIdx),
        type: 'triangle',
        dur: 0.12,
        vol: vol,
        attack: 0.001,
        decay: 0.02,
        sustain: 0.5,
        release: 0.06,
    });

    // Harmonic shimmer (increases with combo)
    if (comboCount >= 3) {
        _tone({
            freq: scaleNote(noteIdx + 5), // octave
            type: 'sine',
            dur: 0.08,
            vol: vol * 0.3,
            attack: 0.001,
            release: 0.04,
            sustain: 0.2,
            delay: 0.015,
        });
    }

    // At combo 5+: add a sparkle tone on top
    if (comboCount >= 5) {
        _tone({
            freq: scaleNote(noteIdx + 7), // high harmonic
            type: 'sine',
            dur: 0.06,
            vol: vol * 0.15,
            attack: 0.001,
            release: 0.03,
            sustain: 0.2,
            delay: 0.025,
        });
    }
}

/**
 * Perfect timing hit — triumphant chord!
 * Plays when player hits on-beat (within timing window).
 */
export function playPerfectHit() {
    init();
    
    // Power chord: D + A + D (root + fifth + octave)
    _chord([N.D5, N.A5, N.D6], {
        type: 'triangle',
        dur: 0.18,
        vol: 0.12,
        attack: 0.001,
        decay: 0.03,
        sustain: 0.6,
        release: 0.10,
    });
    
    // Bright accent on top
    _tone({
        freq: scaleNote(N.F6),
        type: 'sine',
        dur: 0.12,
        vol: 0.06,
        attack: 0.001,
        release: 0.08,
        sustain: 0.4,
        delay: 0.02,
    });
}

// ═════════════════════════════════════════════════════════════
// CHARGE LEVEL — Rising musical tone (stays in scale)
// ═════════════════════════════════════════════════════════════

export function setChargeLevel(level) {
    init();
    level = Math.max(0, Math.min(1, level));
    if (!chargeOsc) return;
    const t = now();

    // Charge sweeps from D3 → D5 through the scale
    // We quantize to scale notes for musical correctness
    const noteIdx = N.D3 + Math.floor(level * 10);
    const freq = scaleNote(noteIdx);

    chargeOsc.frequency.setTargetAtTime(freq, t, 0.03);
    chargeGain.gain.setTargetAtTime(level * 0.10, t, 0.03);
    // Filter opens with charge
    chargeFilter.frequency.setTargetAtTime(400 + level * 1800, t, 0.04);
}

// ═════════════════════════════════════════════════════════════
// GAME EVENTS — Win, Lose, Ring-Out
// ═════════════════════════════════════════════════════════════

export function playWin() {
    init();
    // Victory fanfare: ascending D minor pentatonic resolution
    // D4 → F4 → A4 → D5 (triumphant octave resolve)
    _melody([N.D4, N.F4, N.A4, N.D5], {
        type: 'triangle', dur: 0.15, vol: 0.14, spacing: 0.12,
        attack: 0.002, release: 0.08, sustain: 0.6,
    });
    // Final chord: D5 + A4 (power fifth resolve)
    _chord([N.D4, N.A4, N.D5], {
        type: 'sine', dur: 0.4, vol: 0.10,
        attack: 0.01, release: 0.3, sustain: 0.5,
        delay: 0.5,
    });
}

export function playLose() {
    init();
    // Descending, minor feel: D4 → C4 → A3 → resolve down to D3
    _melody([N.D4, N.C4, N.A3, N.D3], {
        type: 'triangle', dur: 0.2, vol: 0.12, spacing: 0.15,
        attack: 0.005, release: 0.12, sustain: 0.5,
    });
}

export function playRingOut() {
    init();
    // Falling tone: rapid descending scale (falling into void)
    _melody([N.A4, N.G4, N.F4, N.D4, N.C4, N.A3, N.D3], {
        type: 'sine', dur: 0.06, vol: 0.10, spacing: 0.05,
        attack: 0.001, release: 0.04, sustain: 0.3,
    });
}

// ═════════════════════════════════════════════════════════════
// POWER-UP SFX — Each has a unique musical signature
// ═════════════════════════════════════════════════════════════

/**
 * TANQUE — Deep, heavy chord. Like an anvil landing.
 * D2 + A2 power chord, very low, with weight.
 */
export function playPowerUpTank() {
    init();
    // Sub-bass power chord
    _tone({ freq: mtof(38), type: 'triangle', dur: 0.4, vol: 0.20,
            attack: 0.005, release: 0.3, sustain: 0.5, filterFreq: 300 });
    _tone({ freq: mtof(45), type: 'sine', dur: 0.3, vol: 0.12,
            attack: 0.01, release: 0.2, sustain: 0.4, delay: 0.03 });
    // Metallic ring
    _tone({ freq: scaleNote(N.D5), type: 'sine', dur: 0.2, vol: 0.06,
            attack: 0.001, release: 0.15, sustain: 0.2, delay: 0.06 });
    _softNoise({ dur: 0.1, vol: 0.12, freq: 500, q: 1.5 });
}

/**
 * NITRO — Turbo-whistle ascending sweep. Bright and fast.
 * Rapid ascending pentatonic run.
 */
export function playPowerUpNitro() {
    init();
    // Fast ascending run: D4 → F4 → G4 → A4 → C5 → D5
    _melody([N.D4, N.F4, N.G4, N.A4, N.C5, N.D5], {
        type: 'sawtooth', dur: 0.05, vol: 0.10, spacing: 0.04,
        attack: 0.001, release: 0.03, sustain: 0.3,
        filterFreq: 2000, filterQ: 3,
    });
    // Bright resolve ping
    _tone({ freq: scaleNote(N.D5), type: 'sine', dur: 0.15, vol: 0.10,
            attack: 0.001, release: 0.1, sustain: 0.4, delay: 0.26 });
}

/**
 * TITÃ — Massive, deep, reverbant. "BWOOOM" as a chord.
 * D2 + D3 octave with slow attack (grows into you).
 */
export function playPowerUpTitan() {
    init();
    // Slow-building sub-bass
    _tone({ freq: mtof(38), type: 'sine', dur: 0.6, vol: 0.22,
            attack: 0.08, release: 0.4, sustain: 0.6 });
    _tone({ freq: scaleNote(N.D3), type: 'sine', dur: 0.5, vol: 0.14,
            attack: 0.06, release: 0.35, sustain: 0.5, delay: 0.03 });
    // Distant harmonic
    _tone({ freq: scaleNote(N.A3), type: 'triangle', dur: 0.3, vol: 0.06,
            attack: 0.05, release: 0.2, sustain: 0.4, delay: 0.08 });
}

/**
 * IMPACTO — Sharp, tense. Mechanical lock-and-load.
 * Staccato notes + rising tension.
 */
export function playPowerUpImpact() {
    init();
    // Two sharp staccato clicks: G4, A4
    _tone({ freq: scaleNote(N.G4), type: 'triangle', dur: 0.04, vol: 0.12,
            attack: 0.001, release: 0.02, sustain: 0.2 });
    _softNoise({ dur: 0.03, vol: 0.10, freq: 4000, q: 2 });

    _tone({ freq: scaleNote(N.A4), type: 'triangle', dur: 0.04, vol: 0.14,
            attack: 0.001, release: 0.02, sustain: 0.2, delay: 0.07 });
    _softNoise({ dur: 0.03, vol: 0.10, freq: 4500, q: 2, delay: 0.07 });

    // Tension resolve: D5
    _tone({ freq: scaleNote(N.D5), type: 'sine', dur: 0.12, vol: 0.10,
            attack: 0.001, release: 0.08, sustain: 0.4, delay: 0.13 });
}

/**
 * Power-Up spawn — magical materialization chime.
 * Ascending arpeggio with shimmer.
 */
export function playPowerUpSpawn() {
    init();
    // Crystalline ascending: F4 → A4 → D5
    _melody([N.F4, N.A4, N.D5], {
        type: 'sine', dur: 0.10, vol: 0.07, spacing: 0.09,
        attack: 0.001, release: 0.06, sustain: 0.4,
    });
    // Shimmer on top
    _tone({ freq: scaleNote(N.D5), type: 'triangle', dur: 0.2, vol: 0.04,
            attack: 0.005, release: 0.15, sustain: 0.3, delay: 0.28,
            vibrato: 4, vibratoRate: 6 });
}

// ═════════════════════════════════════════════════════════════
// AMBIENT PAD CONTROL
// ═════════════════════════════════════════════════════════════

/**
 * Set ambient pad level (0 = silent, 1 = full).
 * Call with ~0.3 during fight, 0 during menus.
 */
export function setAmbientLevel(level) {
    init();
    if (!padGain) return;
    const t = now();
    padGain.gain.setTargetAtTime(level * 0.03, t, 0.5); // very slow fade
}

// ═════════════════════════════════════════════════════════════
// UPDATE HOOK — Beat clock & rhythmic system
// ═════════════════════════════════════════════════════════════

/**
 * Main update function — call every frame from game loop.
 * Advances beat clock and updates dynamic music layers.
 */
export function update(dt) {
    init();
    _updateBeatClock(dt);
}

// ═════════════════════════════════════════════════════════════
// EXPORTS for external systems (DialogSystem, etc.)
// ═════════════════════════════════════════════════════════════

export function getAudioContext() { return ctx; }
export function getMasterGain() { return master; }
