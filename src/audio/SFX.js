// src/audio/SFX.js — Procedural SFX simples usando WebAudio
// API mínima: init(), resume(), setMasterVolume(v), playClick(), playNavigate(), playRandom(),
// playCountdownTick(stage), playStart(), playImpact(strength), playBodySlam(strength), playDash(power),
// setMovementLevel(0..1), update(dt)

let ctx = null;
let master = null;
let movementOsc = null;
let movementGain = null;
let chargeGain = null;
let chargeOsc = null;

export function init() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.8;
    master.connect(ctx.destination);

    // Movement synth (sustained hum) + gain
    movementOsc = ctx.createOscillator();
    movementOsc.type = 'sawtooth';
    movementOsc.frequency.value = 70;
    movementGain = ctx.createGain();
    movementGain.gain.value = 0.0; // start silent

    const movementFilter = ctx.createBiquadFilter();
    movementFilter.type = 'lowpass';
    movementFilter.frequency.value = 800;

    movementOsc.connect(movementFilter);
    movementFilter.connect(movementGain);
    movementGain.connect(master);
    movementOsc.start();

    // Charge synth (sustained tone that rises with charge)
    chargeOsc = ctx.createOscillator();
    chargeOsc.type = 'sine';
    chargeOsc.frequency.value = 120;
    chargeGain = ctx.createGain();
    chargeGain.gain.value = 0.0;
    chargeOsc.connect(chargeGain);
    chargeGain.connect(master);
    chargeOsc.start();
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

function _playOsc({type='sine', freq=440, dur=0.1, gain=0.2, detune=0, attack=0.001, release=0.05, filter}) {
    if (!ctx) return;
    const t = now();
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;

    const g = ctx.createGain();
    g.gain.value = 0.0001;

    if (filter) {
        const f = ctx.createBiquadFilter();
        f.type = filter.type || 'lowpass';
        f.frequency.value = filter.freq || 1200;
        o.connect(f);
        f.connect(g);
    } else {
        o.connect(g);
    }

    g.connect(master);

    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + release);

    o.start(t);
    o.stop(t + dur + release + 0.02);
}

function _playNoise({dur=0.2, gain=0.4, filterFreq=800}){
    if (!ctx) return;
    const t = now();
    const bufferSize = ctx.sampleRate * dur;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i=0;i<bufferSize;i++) data[i] = (Math.random() * 2 -1) * (1 - i/bufferSize);

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = filterFreq;

    src.connect(f);
    f.connect(g);
    g.connect(master);

    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    src.start(t);
    src.stop(t + dur + 0.02);
}

// UI SFX
export function playClick() {
    init();
    _playOsc({type:'triangle', freq:1200, dur:0.08, gain:0.08, attack:0.001, release:0.03});
}
export function playNavigate() {
    init();
    _playOsc({type:'sine', freq:700, dur:0.12, gain:0.10, attack:0.001, release:0.04});
}
export function playRandomize() {
    init();
    // small arpeggio
    _playOsc({type:'sine', freq:900, dur:0.06, gain:0.08});
    setTimeout(()=>_playOsc({type:'sine', freq:600, dur:0.08, gain:0.06}), 60);
    setTimeout(()=>_playOsc({type:'triangle', freq:1200, dur:0.10, gain:0.05}), 140);
}

// Countdown ticks and start
let _lastCountdownStage = null;
export function playCountdownTick(stage) {
    init();
    if (stage === 'FIGHT') {
        // big whoop + rumble
        _playOsc({type:'sawtooth', freq:160, dur:0.6, gain:0.6, attack:0.02, release:0.2, filter:{type:'lowpass', freq:400}});
        setTimeout(()=>_playNoise({dur:0.18, gain:0.35, filterFreq:800}), 80);
        _playOsc({type:'sine', freq:1200, dur:0.14, gain:0.12, attack:0.001, release:0.06});
    } else {
        // stage = 3,2,1 -> beep with different pitch
        const p = { '3': 540, '2': 720, '1': 840 }[stage] || 600;
        _playOsc({type:'sine', freq:p, dur:0.09, gain:0.12, attack:0.001, release:0.04});
    }
}

export function playStart() { playClick(); }

// Gameplay SFX
export function playImpact(force) {
    init();
    const vol = Math.min(0.9, 0.06 + force * 0.18);
    const freq = 300 + Math.min(1200, force * 1000);
    _playOsc({type:'triangle', freq:freq, dur:0.14, gain:vol, attack:0.001, release:0.1, filter:{type:'lowpass', freq:1200}});
    _playNoise({dur:0.18, gain:vol * 0.6, filterFreq:600});
}

export function playBodySlam(force) {
    init();
    const vol = Math.min(1.0, 0.08 + force * 0.6);
    _playOsc({type:'sawtooth', freq:120, dur:0.5, gain:vol, attack:0.02, release:0.4, filter:{type:'lowpass', freq:400}});
    setTimeout(()=>_playNoise({dur:0.3, gain:vol*0.6, filterFreq:400}), 30);
}

export function playDash(power) {
    init();
    const vol = 0.06 + power * 0.4;
    const startF = 300 + power * 400;
    const endF = 900 + power * 700;
    // Sweep: oscillator through bandpass
    const t = now();
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = startF;
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = startF;
    o.connect(f);
    f.connect(g);
    g.connect(master);

    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);

    f.frequency.setValueAtTime(startF, t);
    f.frequency.linearRampToValueAtTime(endF, t + 0.22);

    o.start(t);
    o.stop(t + 0.28);
}

export function playEdgeWarning(intensity) {
    init();
    // brief high tone whose pitch increases with intensity
    const freq = 600 + intensity * 900;
    _playOsc({type:'sine', freq:freq, dur:0.12, gain:0.08 + intensity * 0.25});
}

export function playWin() {
    init();
    _playOsc({type:'sine', freq:900, dur:0.28, gain:0.18});
    setTimeout(()=>_playOsc({type:'sine', freq:1200, dur:0.16, gain:0.12}), 160);
}
export function playLose() {
    init();
    _playOsc({type:'triangle', freq:220, dur:0.36, gain:0.2});
}

export function playRingOut() {
    init();
    // Som de queda no void: descrescente
    _playOsc({type:'sine', freq:500, dur:0.15, gain:0.15});
    setTimeout(()=>_playOsc({type:'sine', freq:300, dur:0.15, gain:0.12}), 100);
    setTimeout(()=>_playOsc({type:'sine', freq:150, dur:0.2, gain:0.08}), 200);
}

// Movement: set level 0..1 — affects movementOsc frequency and gain
export function setMovementLevel(level) {
    init();
    level = Math.max(0, Math.min(1, level));
    if (!movementOsc) return;
    movementOsc.frequency.setTargetAtTime(70 + level * 120, now(), 0.05);
    movementGain.gain.setTargetAtTime(level * 0.12, now(), 0.08);
}

// Charge level 0..1
export function setChargeLevel(level) {
    init();
    level = Math.max(0, Math.min(1, level));
    if (!chargeOsc) return;
    chargeOsc.frequency.setTargetAtTime(120 + level * 700, now(), 0.04);
    chargeGain.gain.setTargetAtTime(level * 0.12, now(), 0.04);
}

// Simple update hook; not required but available if desired
export function update(dt) {
    // nothing for now
}
