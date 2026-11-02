import { state } from './state.js';

// Shared audio context and the master chain (voices -> masterGain -> analyser -> speakers).
export const audio = { ctx: null, master: null, analyser: null };

// iOS routes Web Audio through the "ambient" category, which the ringer/silent
// switch mutes. Declaring a "playback" session (Audio Session API, Safari 16.4+) or,
// as a fallback, playing a silent looping <audio> element moves it to the media
// channel so sound is heard in silent mode. Must run inside a user gesture.
let silentAudioEl = null;
export function unlockSilentModeAudio() {
  try {
    if (navigator.audioSession) navigator.audioSession.type = 'playback';
  } catch (e) { /* unsupported */ }
  if (silentAudioEl) return;
  try {
    // 0.25s of 8-bit mono silence as a WAV data URI.
    const n = 2000, bytes = new Uint8Array(44 + n);
    const dv = new DataView(bytes.buffer);
    const str = (o, t) => { for (let i = 0; i < t.length; i++) bytes[o + i] = t.charCodeAt(i); };
    str(0, 'RIFF'); dv.setUint32(4, 36 + n, true); str(8, 'WAVEfmt ');
    dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
    dv.setUint32(24, 8000, true); dv.setUint32(28, 8000, true);
    dv.setUint16(32, 1, true); dv.setUint16(34, 8, true);
    str(36, 'data'); dv.setUint32(40, n, true);
    bytes.fill(128, 44);
    let bin = '';
    bytes.forEach(b => { bin += String.fromCharCode(b); });
    silentAudioEl = new Audio('data:audio/wav;base64,' + btoa(bin));
    silentAudioEl.loop = true;
    silentAudioEl.setAttribute('playsinline', '');
    silentAudioEl.play().catch(() => {});
  } catch (e) { /* ignore */ }
}

export function initAudioContext() {
  unlockSilentModeAudio();
  if (!audio.ctx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audio.ctx = new AudioContextClass();

      // Master Analyser Node (real-time time-domain waveform analysis)
      audio.analyser = audio.ctx.createAnalyser();
      audio.analyser.fftSize = 2048;
      audio.analyser.smoothingTimeConstant = 0.82;

      // Master Gain Node
      audio.master = audio.ctx.createGain();
      audio.master.gain.setValueAtTime(0.4, audio.ctx.currentTime);

      audio.master.connect(audio.analyser);
      audio.analyser.connect(audio.ctx.destination);
    }
  }
  if (audio.ctx && audio.ctx.state === 'suspended') {
    audio.ctx.resume();
  }
}

export function enableSound() {
  state.audioEnabled = true;
  initAudioContext();
}

// Per-voice scope traces: each note routes through its own analyser (a pass-through
// into audio.master) so the scope can draw it faintly behind the summed waveform.
export const voiceTraces = [];
export const VOICE_TRACE_COLORS = ['#ff5a1f', '#ffc766', '#7dff9a', '#6ef8fb', '#ff8fb8', '#b9a6ff', '#e8f77a', '#ffa066'];
let voiceColorCounter = 0;

export function routeVoice(outNode, ttlSeconds = null, waveType = null) {
  const an = audio.ctx.createAnalyser();
  an.fftSize = 2048;
  an.smoothingTimeConstant = 0;
  outNode.connect(an);
  an.connect(audio.master);
  const trace = {
    an,
    buf: new Uint8Array(an.fftSize),
    releaseAt: ttlSeconds == null ? null : audio.ctx.currentTime + ttlSeconds,
    color: VOICE_TRACE_COLORS[voiceColorCounter++ % VOICE_TRACE_COLORS.length],
    waveType: waveType || state.currentWaveform || 'sine', // fixed at creation, so it survives later wave changes
  };
  voiceTraces.push(trace);
  return trace;
}

export function releaseVoiceTrace(trace, afterSeconds = 0.15) {
  if (trace && audio.ctx) trace.releaseAt = audio.ctx.currentTime + afterSeconds;
}

export function pruneVoiceTraces() {
  if (!audio.ctx) return;
  const now = audio.ctx.currentTime;
  for (let i = voiceTraces.length - 1; i >= 0; i--) {
    const t = voiceTraces[i];
    if (t.releaseAt !== null && now > t.releaseAt) {
      try { t.an.disconnect(); } catch (e) {}
      voiceTraces.splice(i, 1);
    }
  }
}

// Oscilloscope-style trigger: first rising zero-crossing, so the picture holds still
export function findTriggerIndex(buf, limit) {
  for (let i = 1; i < limit; i++) {
    if (buf[i - 1] < 128 && buf[i] >= 128) return i;
  }
  return 0;
}

export function waveColorFor(type) {
  if (type === 'square') return '#7dff9a';
  if (type === 'sawtooth') return '#ffc766';
  if (type === 'triangle') return '#6ef8fb';
  return '#ff5a1f';
}

// Color of the summed trace: follows the waveform of the notes actually sounding,
// so changing the waveform button doesn't recolor notes that are already held.
export function getSumWaveType() {
  if (!voiceTraces.length) return state.currentWaveform;
  const first = voiceTraces[0].waveType;
  return voiceTraces.every((t) => t.waveType === first) ? first : 'mixed';
}

// Play a synthesized note using the currently selected waveform
export function playSynthNote(freq, duration = 0.8, waveType = null) {
  if (!state.audioEnabled) return;
  initAudioContext();
  if (!audio.ctx || !audio.master) return;

  try {
    const type = waveType || state.currentWaveform || 'sawtooth';
    const now = audio.ctx.currentTime;
    const osc = audio.ctx.createOscillator();
    const noteGain = audio.ctx.createGain();
    const filter = audio.ctx.createBiquadFilter();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);

    // Low-pass filter tailored per waveform for distinct character
    filter.type = 'lowpass';
    if (type === 'square') {
      filter.frequency.setValueAtTime(freq * 3.5, now);
      filter.frequency.exponentialRampToValueAtTime(Math.max(freq, 400), now + duration);
    } else if (type === 'sawtooth') {
      filter.frequency.setValueAtTime(freq * 5.5, now);
      filter.frequency.exponentialRampToValueAtTime(Math.max(freq, 300), now + duration);
    } else if (type === 'triangle') {
      filter.frequency.setValueAtTime(freq * 4, now);
    } else {
      // sine
      filter.frequency.setValueAtTime(freq * 8, now);
    }

    // Pluck Envelope
    noteGain.gain.setValueAtTime(0.0001, now);
    noteGain.gain.linearRampToValueAtTime(0.35, now + 0.02);
    noteGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(filter);
    filter.connect(noteGain);
    routeVoice(noteGain, duration + 0.1, type);

    osc.start(now);
    osc.stop(now + duration + 0.05);
  } catch (e) {
    console.warn('Audio playback error:', e);
  }
}

// UI Micro-click sound
export function playClickBlip(type = 'blip') {
  if (!state.audioEnabled) return;
  initAudioContext();
  if (!audio.ctx || !audio.master) return;

  try {
    const now = audio.ctx.currentTime;
    const osc = audio.ctx.createOscillator();
    const gain = audio.ctx.createGain();

    if (type === 'blip') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(440, now + 0.05);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
    } else if (type === 'high') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1200, now);
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);
    }
    osc.connect(gain);
    gain.connect(audio.master);
    osc.start(now);
    osc.stop(now + 0.05);
  } catch (e) {}
}
