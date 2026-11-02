import { audio, enableSound, releaseVoiceTrace, routeVoice } from './audio.js';
import { getActiveScaleNotes } from './music.js';
import { state } from './state.js';
import { clearHighlightedKeys, highlightKeyByIndex, resetScopeStatus, updateScopeStatus } from './ui.js';

// The note being dragged on the scope ("ribbon"), kept as one shared state object.
export const ribbon = {
  osc: null,
  gain: null,
  rel: null, // release stage after the note envelope, so letting go never cancels a mid-ramp
  filter: null,
  playing: false,
  activeIndex: -1,
  anchorX: 0,
  currentX: 0,
  baseFreq: 0,
  cutoff: 2400,
  targetCents: 0,
  currentCents: 0,
  vibratoStart: 0,
  trace: null,
};

// Interactive wave click & drag: binds directly to scale notes with automatic vibrato
export function startRibbonTone(x, y, width, height) {
  enableSound();
  if (!audio.ctx || !audio.master) return;

  stopRibbonTone();

  const notes = getActiveScaleNotes();
  if (!notes.length) return;

  const N = notes.length;
  const zoneWidth = width / N;
  const clampedX = Math.max(0, Math.min(width - 1, x));
  const index = Math.max(0, Math.min(N - 1, Math.floor(clampedX / zoneWidth)));
  const note = notes[index];

  const clampedY = Math.max(0, Math.min(height, y));
  const cutoff = 300 + (1 - clampedY / height) * 5700;

  // 0 cents is strictly in the middle of the bar displayed
  const noteCenterX = (index + 0.5) * zoneWidth;

  ribbon.activeIndex = index;
  ribbon.anchorX = noteCenterX;
  ribbon.currentX = clampedX;
  ribbon.baseFreq = note.freq;
  ribbon.cutoff = cutoff;

  // Vibrato depth is measured relative to the middle of the bar (0 cents)
  const deltaX = clampedX - noteCenterX;
  const halfZone = Math.max(16, zoneWidth * 0.48);
  const vibratoRatio = Math.max(-1, Math.min(1, deltaX / halfZone));
  ribbon.targetCents = Math.round(vibratoRatio * 100);
  ribbon.currentCents = 0;
  ribbon.vibratoStart = audio.ctx.currentTime;

  try {
    const now = audio.ctx.currentTime;
    ribbon.osc = audio.ctx.createOscillator();
    ribbon.gain = audio.ctx.createGain();
    ribbon.filter = audio.ctx.createBiquadFilter();

    ribbon.osc.type = state.currentWaveform || 'sine';

    // Note "clicks" immediately into pure scale pitch (0 cents)
    ribbon.osc.frequency.setValueAtTime(ribbon.baseFreq, now);
    ribbon.osc.detune.setValueAtTime(0, now);
    ribbon.filter.type = 'lowpass';
    ribbon.filter.frequency.setValueAtTime(cutoff, now);

    ribbon.gain.gain.setValueAtTime(0.0001, now);
    ribbon.gain.gain.linearRampToValueAtTime(0.32, now + 0.03);

    ribbon.osc.connect(ribbon.filter);
    ribbon.filter.connect(ribbon.gain);
    ribbon.rel = audio.ctx.createGain();
    ribbon.gain.connect(ribbon.rel);
    ribbon.trace = routeVoice(ribbon.rel, null, ribbon.osc.type);

    ribbon.osc.start(now);
    ribbon.playing = true;

    highlightKeyByIndex(index);
    updateScopeStatus(ribbon.baseFreq, cutoff, note.noteName, note.degree, 0, ribbon.targetCents);
  } catch (e) {
    console.warn('Ribbon tone error:', e);
  }
}

export function updateRibbonTone(x, y, width, height) {
  if (!ribbon.playing || !ribbon.osc || !audio.ctx) return;

  const notes = getActiveScaleNotes();
  if (!notes.length) return;

  const N = notes.length;
  const zoneWidth = width / N;
  const clampedX = Math.max(0, Math.min(width - 1, x));
  ribbon.currentX = clampedX;

  const currentZone = Math.max(0, Math.min(N - 1, Math.floor(clampedX / zoneWidth)));

  // Transitioning / sliding into a new note zone in the scale
  if (currentZone !== ribbon.activeIndex) {
    ribbon.activeIndex = currentZone;
    const noteCenterX = (currentZone + 0.5) * zoneWidth;
    ribbon.anchorX = noteCenterX; // Middle of the bar displayed is 0 cents
    ribbon.baseFreq = notes[currentZone].freq;
    ribbon.vibratoStart = audio.ctx.currentTime;
    highlightKeyByIndex(currentZone);

    ribbon.osc.frequency.setTargetAtTime(ribbon.baseFreq, audio.ctx.currentTime, 0.015);
  }

  const noteCenterX = (ribbon.activeIndex + 0.5) * zoneWidth;
  ribbon.anchorX = noteCenterX;

  // Measure vibrato offset relative to the middle of the bar (0 cents)
  const deltaX = clampedX - noteCenterX;
  const halfZone = Math.max(16, zoneWidth * 0.48);
  const vibratoRatio = Math.max(-1, Math.min(1, deltaX / halfZone));
  const maxVibratoCents = 100; // ±100 cents (±1 semitone)
  ribbon.targetCents = Math.round(vibratoRatio * maxVibratoCents);

  const clampedY = Math.max(0, Math.min(height, y));
  ribbon.cutoff = 300 + (1 - clampedY / height) * 5700;
  ribbon.filter.frequency.setTargetAtTime(ribbon.cutoff, audio.ctx.currentTime, 0.02);
}

export function stopRibbonTone() {
  if (!ribbon.playing || !ribbon.gain || !audio.ctx) {
    ribbon.playing = false;
    ribbon.activeIndex = -1;
    ribbon.targetCents = 0;
    ribbon.currentCents = 0;
    clearHighlightedKeys();
    return;
  }
  try {
    const now = audio.ctx.currentTime;
    releaseVoiceTrace(ribbon.trace, 0.12);
    ribbon.trace = null;
    const relGain = (ribbon.rel || ribbon.gain).gain;
    relGain.setValueAtTime(ribbon.rel ? 1 : relGain.value, now);
    relGain.linearRampToValueAtTime(0.0001, now + 0.08);
    if (ribbon.osc) {
      ribbon.osc.stop(now + 0.1);
    }
  } catch (e) {}
  ribbon.playing = false;
  ribbon.activeIndex = -1;
  ribbon.targetCents = 0;
  ribbon.currentCents = 0;
  clearHighlightedKeys();
  resetScopeStatus();
}
