import { audio, enableSound, releaseVoiceTrace, routeVoice } from './audio.js';
import { MODES, freqToMidi } from './music.js';
import { ribbon } from './ribbon.js';
import { state } from './state.js';
import { clearHighlightedKeys, resetScopeStatus } from './ui.js';

export const latchedRibbons = []; // ribbon voices kept sounding by HOLD

// Active sustained voices for held number keys / buttons (polyphonic)
export const activeKeyVoices = {};

export function startNoteVoice(keyId, freq, el = null) {
  enableSound();
  if (!audio.ctx || !audio.master) return;

  // Avoid duplicating voice if already held
  if (activeKeyVoices[keyId]) return;

  try {
    const type = state.currentWaveform || 'sine';
    const now = audio.ctx.currentTime;
    const osc = audio.ctx.createOscillator();
    const gain = audio.ctx.createGain();
    const filter = audio.ctx.createBiquadFilter();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);

    filter.type = 'lowpass';
    if (type === 'square') {
      filter.frequency.setValueAtTime(freq * 3.5, now);
    } else if (type === 'sawtooth') {
      filter.frequency.setValueAtTime(freq * 5.5, now);
    } else if (type === 'triangle') {
      filter.frequency.setValueAtTime(freq * 4, now);
    } else {
      filter.frequency.setValueAtTime(freq * 8, now);
    }

    // Attack & Sustain: holds continuous tone while key is pressed
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.35, now + 0.018);
    gain.gain.linearRampToValueAtTime(0.28, now + 0.07);

    // `rel` is a voice-level release stage kept apart from the note envelope, so letting go
    // never has to cancel an envelope that is mid-ramp (that jump is what clicked)
    const rel = audio.ctx.createGain();
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(rel);
    const trace = routeVoice(rel, null, type);

    osc.start(now);

    if (el) el.classList.add('key-pressed');

    activeKeyVoices[keyId] = { osc, gain, rel, filter, el, trace, freq, pitches: [freqToMidi(freq)] };
  } catch (e) {
    console.warn('Start note voice error:', e);
  }
}

// Arpeggiator: the pressed key picks the starting scale degree. The pattern climbs through
// `state.arpNotes` notes and falls back, looping while the key is held.
//  - OCTAVE: the last note is the octave; the others are spread through it, favouring chord
//    tones (3 notes = root, 5th, octave; 4 = root, 3rd, 5th, octave).
//  - LINEAR: keeps climbing in thirds (root, 3rd, 5th, 7th, ...) so the end note is wherever it lands.
// The ascending run of notes always takes the same time, however many notes it has, so a
// 3-note arpeggio steps twice as slowly as a 6-note one. (Default 4 notes = 0.13 s per step.)
export const ARP_RUN_SECONDS = 0.52;
export const ARP_MIN_NOTES = 2;
export const ARP_MAX_NOTES = 8;

export function getScaleSteps(mode) {
  // Intervals include the octave (12) as their last entry, so one octave is length - 1 steps
  return Math.max(1, mode.intervals.length - 1);
}

export function getArpMaxNotes(mode, end) {
  return end === 'octave' ? Math.min(ARP_MAX_NOTES, getScaleSteps(mode) + 1) : ARP_MAX_NOTES;
}

// Scale-degree offsets (from the pressed key) for the ascending half of the arpeggio
export function getArpOffsets(mode, count, end) {
  const S = getScaleSteps(mode);
  const N = Math.max(ARP_MIN_NOTES, Math.min(count, getArpMaxNotes(mode, end)));

  if (end === 'linear') {
    return Array.from({ length: N }, (_, i) => i * 2);
  }

  // Degrees that sound like chord tones in this mode: root, a 3rd, the 5th (or ♭5), a 7th
  const fifth = mode.intervals.includes(7) ? 7 : 6;
  const chordSemis = new Set([0, 3, 4, fifth, 10, 11]);
  const isChordTone = (d) => d < S && chordSemis.has(mode.intervals[d]);

  const offsets = [0];
  for (let i = 1; i <= N - 2; i++) {
    const target = (i * S) / (N - 1);
    const lo = offsets[offsets.length - 1] + 1;
    const hi = S - (N - 1 - i); // leave room for the remaining notes
    let pick = null;
    for (let d = lo; d <= hi; d++) {
      if (isChordTone(d) && Math.abs(d - target) <= 1 && (pick === null || Math.abs(d - target) < Math.abs(pick - target))) {
        pick = d;
      }
    }
    if (pick === null) pick = Math.max(lo, Math.min(hi, Math.round(target)));
    offsets.push(pick);
  }
  offsets.push(S);
  return offsets;
}

export function getArpPattern(startIndex, modeKey = state.currentMode, rootMidi = state.rootMidi) {
  const mode = MODES[modeKey || 'minor'] || MODES['minor'];
  const S = getScaleSteps(mode);
  const baseMidi = rootMidi || 52;
  const midiAt = (i) => baseMidi + mode.intervals[i % S] + 12 * Math.floor(i / S);

  const up = getArpOffsets(mode, state.arpNotes, state.arpEnd);
  const down = up.slice(1, -1).reverse();
  const freqs = up.concat(down).map((step) => {
    const midi = midiAt(startIndex + step);
    return 440 * Math.pow(2, (midi - 69) / 12);
  });
  return { freqs, stepSeconds: ARP_RUN_SECONDS / up.length };
}

// One shared clock drives every arpeggio. Each arpeggio's steps sit on a grid anchored to the
// moment the first one started, so arpeggios started at different times stay in step (their
// grids all realign every ARP_RUN_SECONDS). A new arpeggio waits for its next grid point.
export const arpVoices = new Set();
let arpClockTimer = null;
let arpOrigin = 0;
export const ARP_LOOKAHEAD = 0.12;

export function arpGridNext(t, stepSeconds) {
  return arpOrigin + Math.ceil((t - arpOrigin) / stepSeconds - 1e-9) * stepSeconds;
}

export function scheduleArpStep(voice, t) {
  const freqs = voice.arp.freqs;
  const f = freqs[voice.arp.step % freqs.length];
  const d = voice.arp.stepSeconds;
  voice.osc.frequency.setValueAtTime(f, t);
  voice.filter.frequency.setValueAtTime(f * 6, t);
  voice.gain.gain.cancelScheduledValues(t);
  voice.gain.gain.setValueAtTime(0.0001, t);
  voice.gain.gain.linearRampToValueAtTime(0.32, t + Math.min(0.012, d * 0.2));
  voice.gain.gain.exponentialRampToValueAtTime(0.14, t + d * 0.75);
  // Short release into silence before the next step, so pitch changes happen at ~zero level
  voice.gain.gain.linearRampToValueAtTime(0.0001, t + d - 0.002);
  voice.arp.step++;
}

export function arpClockTick() {
  if (!audio.ctx) return;
  const now = audio.ctx.currentTime;
  arpVoices.forEach((voice) => {
    const arp = voice.arp;
    // Fell behind (e.g. background tab throttling): jump back onto the grid instead of bursting
    if (arp.nextTime < now - 0.05) arp.nextTime = arpGridNext(now, arp.stepSeconds);
    while (arp.nextTime < now + ARP_LOOKAHEAD) {
      scheduleArpStep(voice, arp.nextTime);
      arp.lastStepTime = arp.nextTime;
      arp.nextTime += arp.stepSeconds;
    }
  });
}

export function registerArpVoice(voice) {
  const now = audio.ctx.currentTime;
  if (arpClockTimer === null) {
    arpOrigin = now + 0.02; // nothing else is playing: this arpeggio defines the grid
    arpClockTimer = setInterval(arpClockTick, 25);
  }
  voice.arp.nextTime = Math.max(arpGridNext(now + 0.005, voice.arp.stepSeconds), arpOrigin);
  arpVoices.add(voice);
  arpClockTick();
}

// Change an arpeggio's note count live: keep it on the shared grid at its new step length
export function retimeArpVoice(voice) {
  const arp = voice.arp;
  const from = Math.max(audio.ctx.currentTime + 0.005, (arp.lastStepTime || 0) + 1e-6);
  arp.nextTime = arpGridNext(from, arp.stepSeconds);
}

export function unregisterArpVoice(voice) {
  arpVoices.delete(voice);
  if (arpVoices.size === 0 && arpClockTimer !== null) {
    clearInterval(arpClockTimer);
    arpClockTimer = null;
  }
}

export function startArpVoice(keyId, startIndex, el = null) {
  enableSound();
  if (!audio.ctx || !audio.master) return;
  if (activeKeyVoices[keyId]) return;

  try {
    // The arp remembers the scale it started in, so changing key/mode later can't re-pitch it
    const arp = {
      startIndex,
      modeKey: state.currentMode,
      rootMidi: state.rootMidi,
      ...getArpPattern(startIndex),
    };
    const type = state.currentWaveform || 'sine';
    const now = audio.ctx.currentTime;
    const osc = audio.ctx.createOscillator();
    const gain = audio.ctx.createGain();
    const filter = audio.ctx.createBiquadFilter();

    osc.type = type;
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(arp.freqs[0] * 6, now);
    gain.gain.setValueAtTime(0.0001, now);

    // `rel` is a voice-level release stage kept apart from the note envelope, so letting go
    // never has to cancel an envelope that is mid-ramp (that jump is what clicked)
    const rel = audio.ctx.createGain();
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(rel);
    const trace = routeVoice(rel, null, type);
    osc.start(now);

    if (el) el.classList.add('key-pressed');
    arp.step = 0;
    const voice = { osc, gain, rel, filter, el, trace, arp, isArp: true, pitches: arp.freqs.map(freqToMidi) };
    activeKeyVoices[keyId] = voice;
    registerArpVoice(voice);
  } catch (e) {
    console.warn('Start arp voice error:', e);
  }
}

// Who started each sounding key ('pointer' or 'keyboard'). Only the source that started a voice
// can end it, so moving the mouse over (or off) a key that is already sounding never cuts it.
export const keyOwners = {};

export function releaseKey(keyId, source) {
  if (keyOwners[keyId] === source && activeKeyVoices[keyId]) {
    stopNoteVoice(keyId);
  }
}

// Start a held key in the current mode (plain note or arpeggio)
export function triggerKey(keyId, el, source = 'pointer') {
  if (!el) return;
  if (activeKeyVoices[keyId]) return; // already sounding: leave it (and its owner) alone
  if (state.arpMode) {
    startArpVoice(keyId, parseInt(el.getAttribute('data-index'), 10) || 0, el);
  } else {
    startNoteVoice(keyId, parseFloat(el.getAttribute('data-freq')), el);
  }
  if (activeKeyVoices[keyId]) keyOwners[keyId] = source;
}

// Fade a voice out and tidy up its trace and key highlight
export function endVoice(voice) {
  if (!voice || !audio.ctx) return;
  if (voice.isArp) unregisterArpVoice(voice);
  releaseVoiceTrace(voice.trace);

  try {
    const now = audio.ctx.currentTime;
    if (voice.rel) {
      // Fade the release stage (always sitting at 1, nothing mid-ramp to cancel)
      // (Step envelopes are left alone; any already-scheduled steps are covered by this fade)
      voice.rel.gain.setValueAtTime(1, now);
      voice.rel.gain.linearRampToValueAtTime(0.0001, now + 0.1);
      voice.osc.stop(now + 0.13);
    } else {
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
      voice.gain.gain.linearRampToValueAtTime(0.0001, now + 0.09);
      voice.osc.stop(now + 0.11);
    }
  } catch (e) {}

  if (voice.el) voice.el.classList.remove('key-pressed'); // 'key-held' is managed by refreshHeldKeyStates
}

export function stopNoteVoice(keyId) {
  const voice = activeKeyVoices[keyId];
  if (!voice) return;
  delete activeKeyVoices[keyId];
  endVoice(voice);
}

export function stopAllNoteVoices() {
  Object.keys(activeKeyVoices).forEach((id) => stopNoteVoice(id));
}

// Switch the waveform of everything currently being played (keys down, arpeggios, a scope drag).
// Sounds frozen by HOLD keep the waveform they had.
export function applyWaveformToPlaying(type) {
  if (!audio.ctx) return;
  const now = audio.ctx.currentTime;
  const noteCutoff = { square: 3.5, sawtooth: 5.5, triangle: 4, sine: 8 };
  Object.keys(activeKeyVoices).forEach((id) => {
    const voice = activeKeyVoices[id];
    voice.osc.type = type;
    if (voice.trace) voice.trace.waveType = type; // scope color follows what is sounding
    if (!voice.isArp && voice.freq) {
      voice.filter.frequency.setValueAtTime(voice.freq * (noteCutoff[type] || 8), now);
    }
  });
  if (ribbon.playing && ribbon.osc) {
    ribbon.osc.type = type;
    if (ribbon.trace) ribbon.trace.waveType = type;
  }
}

// Re-shape every arpeggio that is being played (not HOLD-frozen) after the note count / end note changes
export function refreshPlayingArps(rescale = false) {
  const apply = (voice) => {
    if (!voice || !voice.arp) return;
    if (rescale) {
      // Key or mode changed: the same scale degree now arpeggiates in the new scale
      voice.arp.modeKey = state.currentMode;
      voice.arp.rootMidi = state.rootMidi;
    }
    const pattern = getArpPattern(voice.arp.startIndex, voice.arp.modeKey, voice.arp.rootMidi);
    voice.arp.freqs = pattern.freqs;
    voice.arp.stepSeconds = pattern.stepSeconds;
    retimeArpVoice(voice);
    voice.pitches = voice.arp.freqs.map(freqToMidi);
  };
  Object.keys(activeKeyVoices).forEach((id) => apply(activeKeyVoices[id]));
  // Arpeggios frozen by HOLD are left exactly as they were
  refreshHeldKeyStates();
}

// Held sounds are remembered by pitch, so a key shows as held wherever that pitch
// appears after the key, mode or NOTES/ARPEGGIATOR changes.
export function refreshHeldKeyStates() {
  const heldMidis = new Set();
  heldVoices.forEach((v) => (v.pitches || []).forEach((m) => heldMidis.add(m)));
  latchedRibbons.forEach((r) => (r.pitches || []).forEach((m) => heldMidis.add(m)));
  document.querySelectorAll('#synth-keys-container .synth-key').forEach((btn) => {
    const midi = parseInt(btn.getAttribute('data-midi'), 10);
    btn.classList.toggle('key-held', heldMidis.has(midi));
  });
}

// HOLD: voices frozen by the HOLD button. They are detached from their keys, so the keys
// behave normally again and anything played afterwards is not part of the hold.
export const heldVoices = [];

export function captureHeldVoices() {
  Object.keys(activeKeyVoices).forEach((id) => {
    const voice = activeKeyVoices[id];
    delete activeKeyVoices[id];
    heldVoices.push(voice);
    if (voice.el) voice.el.classList.remove('key-pressed');
  });

  // A note being dragged on the scope is frozen at its current pitch
  if (ribbon.playing && ribbon.osc && ribbon.gain) {
    latchedRibbons.push({ osc: ribbon.osc, gain: ribbon.gain, rel: ribbon.rel, trace: ribbon.trace, pitches: [freqToMidi(ribbon.baseFreq)] });
    ribbon.trace = null;
    ribbon.playing = false;
    ribbon.activeIndex = -1;
    ribbon.targetCents = 0;
    ribbon.currentCents = 0;
    clearHighlightedKeys();
    resetScopeStatus();
  }
  refreshHeldKeyStates();
}

export function releaseLatchedRibbons() {
  while (latchedRibbons.length) {
    const r = latchedRibbons.pop();
    try {
      const now = audio.ctx.currentTime;
      releaseVoiceTrace(r.trace, 0.12);
      const g = (r.rel || r.gain).gain;
      if (!r.rel) g.cancelScheduledValues(now);
      g.setValueAtTime(r.rel ? 1 : g.value, now);
      g.linearRampToValueAtTime(0.0001, now + 0.09);
      r.osc.stop(now + 0.11);
    } catch (e) {}
  }
}

// Turn HOLD off: release everything it was holding
export function releaseHeldVoices() {
  while (heldVoices.length) endVoice(heldVoices.pop());
  releaseLatchedRibbons();
  refreshHeldKeyStates();
}
