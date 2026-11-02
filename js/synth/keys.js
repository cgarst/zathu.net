import { enableSound, playSynthNote, playClickBlip } from './audio.js';
import { MODES, OCTAVE_MAX, OCTAVE_MIN, ROOT_KEYS, getNoteNameFromMidi, rootMidiFor } from './music.js';
import { ribbon, startRibbonTone, stopRibbonTone, updateRibbonTone } from './ribbon.js';
import { TUNES } from './chorus.js';
import { state } from './state.js';
import { ARP_MIN_NOTES, activeKeyVoices, startNoteVoice, applyWaveformToPlaying, captureHeldVoices, getArpMaxNotes, refreshHeldKeyStates, refreshPlayingArps, releaseHeldVoices, releaseKey, stopAllNoteVoices, stopNoteVoice, triggerKey } from './voices.js';

/* ==========================================================================
   CHROMATIC ROOT KEY & MODES / SCALES SYNTHESIZER
   ========================================================================== */
export function initEModeSynth() {
  const container = document.getElementById('synth-keys-container');
  const modeBtns = document.querySelectorAll('#mode-buttons-group .mode-btn');
  const keyBtns = document.querySelectorAll('#key-buttons-group .key-btn');
  let updateArpControlsRef = null;

  function syncKeyButtons(keyName) {
    keyBtns.forEach((b) => {
      const on = b.getAttribute('data-root') === keyName;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function renderNumberButtons() {
    if (!container) return;
    // Single notes belong to the old scale and stop; arpeggios being played carry on and re-scale below
    Object.keys(activeKeyVoices).forEach((id) => {
      if (!activeKeyVoices[id].isArp) stopNoteVoice(id);
    });
    container.innerHTML = '';

    const modeKey = state.currentMode || 'minor';
    const mode = MODES[modeKey] || MODES['minor'];
    const baseMidi = state.rootMidi || 52; // Default E3 (164.81 Hz)

    mode.intervals.forEach((interval, index) => {
      const midi = baseMidi + interval;
      const freq = 440 * Math.pow(2, (midi - 69) / 12);
      const noteName = getNoteNameFromMidi(midi);
      const degree = mode.degrees[index] || '';
      const shortcut = (index + 1).toString();

      const btn = document.createElement('button');
      btn.className = 'synth-key' + (index === 0 ? ' is-root' : '');
      btn.setAttribute('data-freq', freq.toFixed(2));
      btn.setAttribute('data-key', shortcut);
      btn.setAttribute('data-index', index);
      btn.setAttribute('data-midi', midi);
      btn.setAttribute('title', `${noteName} (${freq.toFixed(1)} Hz) - ${degree}`);

      btn.innerHTML = `
        <span class="synth-note-name">${noteName}</span>
        <span class="synth-key-degree">${degree}</span>
        <span class="synth-key-shortcut">${shortcut}</span>
      `;

      // Mouse click & hold: sustains note while held, fades out on release
      btn.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        triggerKey(shortcut, btn, 'pointer');
      });

      btn.addEventListener('mouseup', () => {
        releaseKey(shortcut, 'pointer');
      });

      btn.addEventListener('mouseleave', () => {
        releaseKey(shortcut, 'pointer');
      });

      // Touch for mobile / tablet
      btn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        triggerKey(shortcut, btn, 'pointer');
      }, { passive: false });

      btn.addEventListener('touchend', (e) => {
        e.preventDefault();
        releaseKey(shortcut, 'pointer');
      });

      btn.addEventListener('touchcancel', () => {
        releaseKey(shortcut, 'pointer');
      });

      container.appendChild(btn);
    });
    refreshHeldKeyStates();
    if (updateArpControlsRef) updateArpControlsRef();

    // Arpeggios still being played: follow the new key/mode and attach to the rebuilt buttons
    Object.keys(activeKeyVoices).forEach((id) => {
      const voice = activeKeyVoices[id];
      const newEl = container.querySelector(`.synth-key[data-key="${id}"]`);
      voice.el = newEl;
      if (newEl) newEl.classList.add('key-pressed');
    });
    refreshPlayingArps(true);
  }

  // Notes / Arpeggiator slider
  const arpToggle = document.getElementById('arp-toggle');
  const arpLabelNotes = document.getElementById('arp-label-notes');
  const arpLabelArp = document.getElementById('arp-label-arp');
  if (arpToggle) {
    const syncArpUi = () => {
      if (arpLabelNotes) arpLabelNotes.classList.toggle('active', !state.arpMode);
      if (arpLabelArp) arpLabelArp.classList.toggle('active', state.arpMode);
    };
    arpToggle.checked = state.arpMode;
    syncArpUi();
    arpToggle.addEventListener('change', () => {
      playClickBlip('high');
      stopAllNoteVoices(); // held sounds are separate and keep going
      state.arpMode = arpToggle.checked;
      syncArpUi();
      if (updateArpControlsRef) updateArpControlsRef();
      arpToggle.blur();
    });
  }

  // Arpeggio options: note count and end note (only active while ARPEGGIATOR is on)
  const arpOptions = document.getElementById('arp-options');
  const arpDec = document.getElementById('arp-notes-dec');
  const arpInc = document.getElementById('arp-notes-inc');
  const arpVal = document.getElementById('arp-notes-val');
  const arpEndBtns = document.querySelectorAll('#arp-options .arp-end-btn');

  function updateArpControls() {
    const mode = MODES[state.currentMode] || MODES['minor'];
    const max = getArpMaxNotes(mode, state.arpEnd);
    state.arpNotes = Math.max(ARP_MIN_NOTES, Math.min(state.arpNotes, max));
    if (arpVal) arpVal.textContent = state.arpNotes;
    if (arpOptions) arpOptions.classList.toggle('is-off', !state.arpMode);
    const off = !state.arpMode;
    if (arpDec) arpDec.disabled = off || state.arpNotes <= ARP_MIN_NOTES;
    if (arpInc) arpInc.disabled = off || state.arpNotes >= max;
    arpEndBtns.forEach((b) => {
      const on = b.getAttribute('data-end') === state.arpEnd;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.disabled = off;
    });
  }
  updateArpControlsRef = updateArpControls;

  if (arpDec) arpDec.addEventListener('click', () => {
    state.arpNotes -= 1;
    playClickBlip('high');
    updateArpControls();
    refreshPlayingArps();
    arpDec.blur();
  });
  if (arpInc) arpInc.addEventListener('click', () => {
    state.arpNotes += 1;
    playClickBlip('high');
    updateArpControls();
    refreshPlayingArps();
    arpInc.blur();
  });
  arpEndBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      state.arpEnd = btn.getAttribute('data-end');
      playClickBlip('high');
      updateArpControls();
      refreshPlayingArps();
      btn.blur();
    });
  });
  updateArpControls();

  // HOLD (button or H): freezes what is sounding right now until HOLD is switched off.
  // Notes and arpeggios played while HOLD is on behave normally and are not added to it.
  const holdBtn = document.getElementById('hold-btn');
  function setHold(on) {
    if (on === state.hold) return;
    state.hold = on;
    if (on) captureHeldVoices();
    else releaseHeldVoices();
    if (holdBtn) {
      holdBtn.classList.toggle('active', on);
      holdBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }
  if (holdBtn) {
    // iOS Safari does not synthesize a click while another finger is already down (e.g. a
    // held note), so touch toggles on pointerdown and the click that may follow is ignored.
    let lastTouchToggle = 0;
    const toggleHold = () => {
      playClickBlip('high');
      setHold(!state.hold);
      holdBtn.blur();
    };
    holdBtn.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      e.preventDefault();
      lastTouchToggle = Date.now();
      toggleHold();
    });
    holdBtn.addEventListener('click', () => {
      if (Date.now() - lastTouchToggle < 700) return;
      toggleHold();
    });
  }

  // Root Key buttons
  syncKeyButtons(state.rootNote || 'E');
  keyBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      playClickBlip('high');
      const selectedKey = btn.getAttribute('data-root');
      state.rootNote = selectedKey;
      state.rootMidi = rootMidiFor(selectedKey);
      syncKeyButtons(selectedKey);
      btn.blur();
      renderNumberButtons();
    });
  });

  // Octave - / +: shifts the whole keyboard and the wave pad up or down
  const octDec = document.getElementById('octave-dec');
  const octInc = document.getElementById('octave-inc');
  const octVal = document.getElementById('octave-val');
  function updateOctaveControls() {
    if (octVal) octVal.textContent = Math.floor(state.rootMidi / 12) - 1;
    if (octDec) octDec.disabled = state.octave <= OCTAVE_MIN;
    if (octInc) octInc.disabled = state.octave >= OCTAVE_MAX;
  }
  function shiftOctave(delta) {
    const next = Math.max(OCTAVE_MIN, Math.min(OCTAVE_MAX, state.octave + delta));
    if (next === state.octave) return;
    state.octave = next;
    state.rootMidi = rootMidiFor(state.rootNote || 'E');
    playClickBlip('high');
    updateOctaveControls();
    renderNumberButtons();
  }
  function setOctave(n) {
    if (n === state.octave) return;
    state.octave = n;
    state.rootMidi = rootMidiFor(state.rootNote || 'E');
    updateOctaveControls();
    renderNumberButtons();
  }
  if (octDec) octDec.addEventListener('click', () => { shiftOctave(-1); octDec.blur(); });
  if (octInc) octInc.addEventListener('click', () => { shiftOctave(1); octInc.blur(); });
  updateOctaveControls();

  // Mode buttons: switch active mode
  modeBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      playClickBlip('high');
      modeBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');

      const modeKey = btn.getAttribute('data-mode');
      if (modeKey && MODES[modeKey]) {
        state.currentMode = modeKey;
      }

      renderNumberButtons();
    });
  });

  // Randomize: waveform, key, scale, octave and the arpeggiator settings. HOLD is left alone,
  // since it freezes what is sounding right now rather than shaping the sound.
  const randomBtn = document.getElementById('randomize-btn');
  const waveBtns = document.querySelectorAll('.scope-btn[data-wave]');
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  function randomizeAll(audible = true) {
    const waves = [...waveBtns].map((b) => b.getAttribute('data-wave'));
    const roots = [...keyBtns].map((b) => b.getAttribute('data-root'));

    state.currentWaveform = pick(waves);
    waveBtns.forEach((b) => b.classList.toggle('active', b.getAttribute('data-wave') === state.currentWaveform));
    applyWaveformToPlaying(state.currentWaveform);

    state.currentMode = pick(Object.keys(MODES));
    modeBtns.forEach((b) => b.classList.toggle('active', b.getAttribute('data-mode') === state.currentMode));

    state.rootNote = pick(roots);
    state.octave = OCTAVE_MIN + Math.floor(Math.random() * (OCTAVE_MAX - OCTAVE_MIN + 1));
    state.rootMidi = rootMidiFor(state.rootNote);
    syncKeyButtons(state.rootNote);
    updateOctaveControls();

    stopAllNoteVoices(); // held sounds are separate and keep going
    state.arpMode = Math.random() < 0.5;
    state.arpEnd = pick(['linear', 'octave']);
    state.arpNotes = ARP_MIN_NOTES + Math.floor(Math.random() * (getArpMaxNotes(MODES[state.currentMode], state.arpEnd) - ARP_MIN_NOTES + 1));
    if (arpToggle) arpToggle.checked = state.arpMode;
    if (arpLabelNotes) arpLabelNotes.classList.toggle('active', !state.arpMode);
    if (arpLabelArp) arpLabelArp.classList.toggle('active', state.arpMode);

    renderNumberButtons();
    updateArpControls();
    refreshPlayingArps();

    // Play the new root so the change is heard (not on the silent start-up randomize)
    if (audible) {
      enableSound();
      playSynthNote(440 * Math.pow(2, (state.rootMidi - 69) / 12), 0.5, state.currentWaveform);
    }
  }
  // A manual randomize (button or R) takes over from a Z song that is playing
  const randomizeByHand = () => { endSong(); randomizeAll(); };
  if (randomBtn) randomBtn.addEventListener('click', () => { randomizeByHand(); randomBtn.blur(); });
  randomizeAll(false); // always start from a random setup, silently

  // Surprise: the Surprise button plays a random "song" of about 12 seconds, then stops.
  // Each press starts a fresh one (and tapping the Z seven times quickly opens a list of famous tunes). A song randomizes everything once, picks a chord progression and a
  // style (how the chords and bass are played), then plays six bars of 16 steps with layers:
  //  - chords: a triad (sometimes with a 7th) on the bar's scale degree, as a held pad, syncopated
  //    stabs, off-beats or a pulse
  //  - bass: that chord's root an octave down
  //  - lead: a melody, on the keys an octave (sometimes two) up or on the touchable wave, that lands
  //    on chord tones on the strong steps, walks by step in between, and resolves to the chord root
  // With the arpeggiator on, a held arpeggio replaces the chords and the lead thins out.
  // The last bar settles on the home chord and lets it ring out.
  const rackZ = document.querySelector('.rack-z');
  const JAM_BAR_MS = 2000;
  const JAM_BARS = 6;
  const JAM_STEPS = 16;
  let jamBarTimers = [];
  let jamPlaying = false;
  let jamStyle = null;
  let jamTimeouts = [];
  let jamVoiceIds = [];
  let jamArpIds = [];
  let jamSeq = 0;
  let jamRibbonOn = false;
  const scopeCanvas = document.getElementById('oscilloscope-canvas');
  const rand = (min, max) => min + Math.random() * (max - min);
  const chance = (p) => Math.random() < p;

  function jamClearNotes() {
    jamTimeouts.forEach(clearTimeout);
    jamTimeouts = [];
    jamVoiceIds.forEach(stopNoteVoice);
    jamVoiceIds = [];
    jamArpIds.forEach((id) => releaseKey(id, 'jam'));
    jamArpIds = [];
    if (jamRibbonOn) { stopRibbonTone(); jamRibbonOn = false; }
  }

  function jamPhrase(bar) {
    const keys = [...container.querySelectorAll('.synth-key')];
    if (!keys.length) return;
    const mode = MODES[state.currentMode] || MODES.minor;
    const S = mode.intervals.length - 1; // scale steps per octave
    const stepMs = JAM_BAR_MS / JAM_STEPS;
    const final = bar === JAM_BARS - 1;
    jamArpIds.forEach((id) => releaseKey(id, 'jam')); // last bar's arpeggio ends as the new bar starts
    jamArpIds = [];
    const arp = state.arpMode;

    // Scale degree (any integer, negative = below the root) -> frequency, with an octave shift
    const degFreq = (d, oct = 0) => {
      const midi = state.rootMidi + mode.intervals[((d % S) + S) % S] + 12 * (Math.floor(d / S) + oct);
      return 440 * Math.pow(2, (midi - 69) / 12);
    };
    const at = (step, fn) => jamTimeouts.push(setTimeout(fn, step * stepMs + rand(-8, 8) * (step ? 1 : 0)));
    const play = (step, steps, d, oct = 0) => {
      const id = 'jam-' + jamSeq++;
      const el = oct === 0 && d >= 0 && d < keys.length ? keys[d] : null; // light the key when it is on the pad
      at(step, () => {
        startNoteVoice(id, degFreq(d, oct), el);
        jamVoiceIds.push(id);
        jamTimeouts.push(setTimeout(() => stopNoteVoice(id), Math.max(60, steps * stepMs)));
      });
    };

    // Chord for this bar: a root degree, a triad on it, sometimes a 7th
    // The bar before the last is always the dominant (the 5th degree), so the song ends with a proper
    // cadence: V (with its 7th) leading home to the tonic
    const dominant = mode.intervals.includes(7) ? mode.intervals.indexOf(7) : Math.max(1, mode.intervals.indexOf(6));
    const penultimate = bar === JAM_BARS - 2;
    const root = penultimate ? dominant % S : jamStyle.progression[bar] % S;
    const chord = [root, root + 2, root + 4];
    if (S >= 7 && (penultimate || chance(0.35))) chord.push(root + 6);
    const chordTones = new Set(chord.map((d) => ((d % S) + S) % S));

    // Chords (or a held arpeggio)
    if (arp) {
      const id = String(root + 1);
      at(0, () => { triggerKey(id, keys[Math.min(root, keys.length - 1)], 'jam'); jamArpIds.push(id); });
    } else {
      const comp = final ? 'pad' : jamStyle.comp;
      const hits = {
        pad: [[0, final ? 11 : 15]],
        stabs: [[0, 4], [6, 3], [10, 5]],
        offbeat: [[0, 3], [4, 3], [8, 3], [12, 3]].map(([st, n], i) => [st + (i % 2 ? 2 : 0), n]),
        pulse: Array.from({ length: 8 }, (_, i) => [i * 2, 1.6]),
      }[comp];
      hits.forEach(([st, n]) => chord.forEach((d, i) => {
        // spread the voicing: sometimes lift the top note an octave
        play(st, n, d, i === chord.length - 1 && chance(0.4) ? 1 : 0);
      }));
    }

    // Bass: the chord root an octave down (and sometimes its fifth)
    const bassHits = final ? [[0, 12]] : jamStyle.bass;
    bassHits.forEach(([st, n], i) => play(st, n, i && chance(0.3) ? root + 4 : root, -1));

    // Lead: rhythm picked from a few shapes, the melody walks and lands on chord tones on strong steps.
    // It is played either on the keys (an octave or two up) or on the touchable wave, where it glides
    // between notes, wobbles with vibrato and sweeps the filter like a finger dragging across the pad.
    if (final || chance(0.85)) {
      const rhythm = final ? [0, 4, 8] : pick(arp
        ? [[0, 8], [2, 10], [0, 6, 12]]
        : [[0, 3, 6, 8, 10, 12, 14], [0, 2, 4, 6, 8, 10, 12, 14], [0, 4, 7, 8, 12, 14], [2, 6, 10, 13], [0, 6, 8, 12]]);
      const onWave = scopeCanvas && (chance(0.25) ? !jamStyle.wave : jamStyle.wave);
      const octave = chance(0.25) ? 2 : 1;
      const base = onWave ? 0 : S; // the wave spans one octave from the root; the keys lead sits an octave up
      const lo = onWave ? 0 : S - 2;
      let d = base + (chordTones.has(0) ? 0 : root + 2);
      let jamTouch = { x: (S / 2 + 0.5) * (scopeCanvas ? scopeCanvas.clientWidth / (S + 1) : 0), y: rand(0.2, 0.8), down: false }; // the virtual finger
      rhythm.forEach((st, i) => {
        const nextSt = i + 1 < rhythm.length ? rhythm[i + 1] : JAM_STEPS;
        const last = i === rhythm.length - 1;
        const dur = last && final ? 9 : Math.min(4, nextSt - st) * 0.9;
        if (final) {
          d = base + [2, 1, 0][Math.min(i, 2)]; // the last bar's lead steps down 3 - 2 - 1 and rings on the tonic
        } else if (last) {
          d = base + root; // resolve to the chord root
        } else if (st % 4 === 0 && chance(0.7)) {
          // land on the chord tone nearest the current note
          let best = d;
          for (let c = d - 3; c <= d + 3; c++) {
            if (chordTones.has(((c % S) + S) % S) && (best === d && !chordTones.has(((d % S) + S) % S) || Math.abs(c - d) < Math.abs(best - d))) best = c;
          }
          d = best;
        } else {
          d += (chance(0.5) ? -1 : 1) * (chance(0.75) ? 1 : 2);
        }
        d = Math.max(lo, Math.min(base + S, d));

        if (!onWave) {
          play(st, dur, d, octave - 1);
          return;
        }
        // Touchable wave, played as a dragging finger rather than separate notes: x picks the note
        // (sliding across the pad glides through the scale, offset from a note's centre = vibrato
        // depth) and y sweeps the filter. Notes that follow on slide in from the previous one, and
        // some are long swoops across several notes.
        const w = scopeCanvas.clientWidth;
        const h = scopeCanvas.clientHeight;
        const zone = w / (S + 1);
        const fromX = jamTouch.x;
        const fromY = jamTouch.y;
        const swoop = !last && dur >= 2 && chance(0.3);
        if (swoop) d = Math.max(lo, Math.min(base + S, d + (chance(0.5) ? -1 : 1) * Math.floor(rand(3, 6))));
        const toX = (d + 0.5) * zone;
        const toY = Math.max(0.05, Math.min(0.95, fromY + rand(-0.35, 0.35)));
        const legato = jamTouch.down;
        const slide = swoop ? 0.9 : legato ? 0.45 : 0; // share of the note spent travelling
        const vib = chance(0.6) ? rand(0.15, 0.45) * (chance(0.5) ? -1 : 1) * zone : 0;
        const wobble = rand(0.04, 0.12);
        const lift = last || nextSt - st > 2;
        const ease = (t) => t * t * (3 - 2 * t);
        const frames = Math.max(2, Math.round((dur * stepMs) / 30));
        for (let k = 0; k <= frames; k++) {
          const f = k / frames;
          const sf = slide ? ease(Math.min(1, f / slide)) : 1;
          const startX = slide ? fromX : toX;
          const x = startX + (toX - startX) * sf + vib * f;
          const y = (fromY + (toY - fromY) * f + Math.sin(f * Math.PI * 2) * wobble) * h;
          jamTimeouts.push(setTimeout(() => {
            if (k === 0 && !(ribbon.playing && jamRibbonOn)) { startRibbonTone(x, y, w, h); jamRibbonOn = true; }
            else if (jamRibbonOn) updateRibbonTone(x, y, w, h);
          }, (st + dur * f) * stepMs));
        }
        jamTouch = { x: toX + vib, y: toY, down: !lift };
        if (lift) {
          jamTimeouts.push(setTimeout(() => { if (jamRibbonOn) { stopRibbonTone(); jamRibbonOn = false; } }, (st + dur) * stepMs + 5));
        }
      });
    }
  }

  function endSong() {
    jamBarTimers.forEach(clearTimeout);
    jamBarTimers = [];
    jamClearNotes();
    jamPlaying = false;
    if (rackZ) rackZ.classList.remove('jamming');
    surpriseProgress(0);
  }

  // The Surprise button fills like a progress bar over the length of the song (0 clears it)
  function surpriseProgress(ms) {
    const btn = document.getElementById('surprise-btn');
    if (!btn) return;
    btn.classList.remove('playing');
    if (!ms) return;
    btn.style.setProperty('--dur', ms + 'ms');
    void btn.offsetWidth; // restart the animation when a new song replaces one that was playing
    btn.classList.add('playing');
  }

  // One time in ten, the song is a famous tune instead, taken in turn from TUNES (starting at a random
  // one): key, scale and octave are set to suit it and the melody, chords and bass are played from
  // a transcription (10 to 17 seconds)
  let tuneIdx = Math.floor(Math.random() * TUNES.length);
  function startChorus(chosen) {
    const tune = chosen || TUNES[tuneIdx];
    if (!chosen) tuneIdx = (tuneIdx + 1) % TUNES.length;
    endSong();
    enableSound();
    randomizeAll(false); // random sound, then pin down what the tune needs
    state.currentMode = tune.mode;
    modeBtns.forEach((b) => b.classList.toggle('active', b.getAttribute('data-mode') === state.currentMode));
    state.rootNote = tune.root;
    state.octave = tune.octave;
    state.rootMidi = rootMidiFor(state.rootNote);
    syncKeyButtons(state.rootNote);
    updateOctaveControls();
    stopAllNoteVoices();
    state.arpMode = false;
    if (arpToggle) arpToggle.checked = false;
    if (arpLabelNotes) arpLabelNotes.classList.add('active');
    if (arpLabelArp) arpLabelArp.classList.remove('active');
    renderNumberButtons();
    updateArpControls();
    refreshPlayingArps();

    jamPlaying = true;
    if (rackZ) rackZ.classList.add('jamming');
    const beatMs = 60000 / tune.bpm;
    const keys = [...container.querySelectorAll('.synth-key')];
    const layer = (notes, lift) => notes.forEach(([beat, len, midi]) => {
      const note = midi + lift;
      const id = 'jam-' + jamSeq++;
      const el = keys.find((k) => parseInt(k.getAttribute('data-midi'), 10) === note) || null;
      jamTimeouts.push(setTimeout(() => {
        startNoteVoice(id, 440 * Math.pow(2, (note - 69) / 12), el);
        jamVoiceIds.push(id);
        jamTimeouts.push(setTimeout(() => stopNoteVoice(id), Math.max(60, len * beatMs * 0.92)));
      }, beat * beatMs));
    });
    layer(tune.melody, 0);
    layer(tune.chords, 0);
    layer(tune.bass, 0);
    const end = Math.max(...tune.melody.map(([b, l]) => b + l));

    // Whatever the transcription ends on, close with a ringing tonic chord and a low root
    const mode = MODES[tune.mode];
    const rootMidi = state.rootMidi;
    const closeMs = end * beatMs + 60;
    [[mode.intervals[0], 0], [mode.intervals[2], 0], [mode.intervals[4], 0], [mode.intervals[0], -12], [mode.intervals[0], 12]].forEach(([iv, shift]) => {
      const id = 'jam-' + jamSeq++;
      const midi = rootMidi + iv + shift;
      jamTimeouts.push(setTimeout(() => {
        startNoteVoice(id, 440 * Math.pow(2, (midi - 69) / 12), null);
        jamVoiceIds.push(id);
        jamTimeouts.push(setTimeout(() => stopNoteVoice(id), 1700));
      }, closeMs));
    });
    jamBarTimers.push(setTimeout(endSong, closeMs + 1700 + 300));
    surpriseProgress(closeMs + 1700 + 300);
  }

  function startSong() {
    if (chance(0.1)) { startChorus(); return; }
    endSong();
    enableSound();
    randomizeAll(false);
    // Progressions in scale degrees (0 = home); the last bar always returns home
    const progressions = [[0, 3, 4, 0, 5, 0], [0, 5, 3, 4, 3, 0], [0, 4, 5, 3, 4, 0], [0, 3, 0, 4, 3, 0], [0, 2, 3, 4, 3, 0]];
    jamStyle = {
      progression: pick(progressions),
      comp: pick(['pad', 'stabs', 'offbeat', 'pulse']),
      bass: pick([[[0, 15]], [[0, 7], [8, 7]], [[0, 5], [6, 3], [8, 5], [14, 2]], [[0, 3], [4, 3], [8, 3], [12, 3]]]),
      wave: chance(0.55),
    };
    // The whole song can move up or down an octave partway through (keys, wave and display follow),
    // and always comes back to where it started for the last bar
    const home = state.octave;
    const nearby = (delta) => Math.max(OCTAVE_MIN, Math.min(OCTAVE_MAX, home + delta));
    jamStyle.octaves = Array.from({ length: JAM_BARS }, (_, i) => (i === 0 || i === JAM_BARS - 1 ? home : nearby(pick([0, 0, 1, -1]))));
    jamPlaying = true;
    if (rackZ) rackZ.classList.add('jamming');
    for (let bar = 0; bar < JAM_BARS; bar++) {
      jamBarTimers.push(setTimeout(() => {
        if (bar > 0) setOctave(jamStyle.octaves[bar]);
        jamPhrase(bar);
      }, bar * JAM_BAR_MS));
    }
    // Let the last chord ring, then stop
    jamBarTimers.push(setTimeout(endSong, JAM_BARS * JAM_BAR_MS + 300));
    surpriseProgress(JAM_BARS * JAM_BAR_MS + 300);
  }
  const rackZHit = document.querySelector('.rack-z-hit') || rackZ;
  // Tap the Z seven times in quick succession to open a list of the tunes and pick one
  const tuneMenu = document.createElement('div');
  tuneMenu.className = 'tune-menu';
  tuneMenu.setAttribute('role', 'menu');
  tuneMenu.setAttribute('aria-label', 'Pick a tune');
  tuneMenu.hidden = true;
  const tuneMenuHead = document.createElement('div');
  tuneMenuHead.className = 'tune-menu-head';
  tuneMenuHead.textContent = 'Pick a tune';
  tuneMenu.appendChild(tuneMenuHead);
  [...TUNES].sort((x, y) => x.title.localeCompare(y.title)).forEach((tune) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'tune-menu-item';
    item.setAttribute('role', 'menuitem');
    item.textContent = tune.title;
    item.addEventListener('click', () => { closeTuneMenu(); startChorus(tune); });
    tuneMenu.appendChild(item);
  });
  const menuHost = document.querySelector('.hardware-chassis-card');
  if (menuHost) menuHost.appendChild(tuneMenu);
  function closeTuneMenu() { tuneMenu.hidden = true; }
  function openTuneMenu() {
    endSong();
    tuneMenu.hidden = false;
    const first = tuneMenu.querySelector('.tune-menu-item');
    if (first) first.focus();
  }
  let zTaps = 0;
  let zTapTimer = null;
  if (rackZHit) {
    rackZHit.addEventListener('click', () => {
      if (!tuneMenu.hidden) return; // the list stays up until a tune is picked
      clearTimeout(zTapTimer);
      zTaps++;
      if (zTaps >= 7) {
        zTaps = 0;
        openTuneMenu();
        return;
      }
      zTapTimer = setTimeout(() => { zTaps = 0; }, 700); // each tap must follow the last within 0.7 s
    });
  }

  // The Surprise button plays a random song (now and then a famous tune)
  const surpriseBtn = document.getElementById('surprise-btn');
  if (surpriseBtn) {
    surpriseBtn.addEventListener('click', () => {
      surpriseBtn.blur();
      if (!tuneMenu.hidden) return; // the tune list stays up until a tune is picked
      startSong();
    });
  }

  // Ignore hotkeys only while typing in a text field (a focused checkbox/slider is fine)
  function isTypingTarget(el) {
    if (!el) return false;
    if (el.tagName === 'TEXTAREA' || el.isContentEditable) return true;
    if (el.tagName !== 'INPUT') return false;
    return !['checkbox', 'radio', 'button', 'range'].includes(el.type);
  }

  // Keyboard Hotkeys 1-8: Hold note while key is pressed down, quick fade out when released
  window.addEventListener('keydown', (e) => {
    if (isTypingTarget(document.activeElement)) return;
    if (e.repeat) return; // Ignore auto-repeat key events to hold steady sustain

    if ((e.key === 'r' || e.key === 'R') && !e.ctrlKey && !e.metaKey && !e.altKey) {
      randomizeByHand();
      return;
    }

    if ((e.key === '-' || e.key === '_') && !e.ctrlKey && !e.metaKey && !e.altKey) {
      shiftOctave(-1);
      return;
    }
    if ((e.key === '+' || e.key === '=') && !e.ctrlKey && !e.metaKey && !e.altKey) {
      shiftOctave(1);
      return;
    }

    if (e.key === 'h' || e.key === 'H') {
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        playClickBlip('high');
        setHold(!state.hold);
      }
      return;
    }

    const num = e.key;
    if (num >= '1' && num <= '8') {
      const keyEl = container.querySelector(`.synth-key[data-key="${num}"]`);
      if (keyEl) triggerKey(num, keyEl, 'keyboard');
    }
  });

  window.addEventListener('keyup', (e) => {
    if (isTypingTarget(document.activeElement)) return;

    const num = e.key;
    if (num >= '1' && num <= '8') {
      releaseKey(num, 'keyboard');
    }
  });

  window.addEventListener('blur', () => {
    stopAllNoteVoices();
  });

  // Global hooks for terminal commands
  window.setKey = function (keyArg) {
    if (!keyArg) return;
    const formatted = keyArg.toUpperCase();
    if (ROOT_KEYS[formatted]) {
      state.rootNote = formatted;
      state.rootMidi = rootMidiFor(formatted);
      syncKeyButtons(formatted);
      renderNumberButtons();
    }
  };

  window.setEMode = function (modeArg) {
    if (modeArg && MODES[modeArg.toLowerCase()]) {
      state.currentMode = modeArg.toLowerCase();
    }

    modeBtns.forEach((b) => {
      if (b.getAttribute('data-mode') === state.currentMode) {
        b.classList.add('active');
      } else {
        b.classList.remove('active');
      }
    });

    renderNumberButtons();
  };

  window.setKeyAndMode = function (keyArg, modeArg) {
    if (keyArg) {
      const formatted = keyArg.toUpperCase();
      if (ROOT_KEYS[formatted]) {
        state.rootNote = formatted;
        state.rootMidi = rootMidiFor(formatted);
        syncKeyButtons(formatted);
      }
    }
    if (modeArg && MODES[modeArg.toLowerCase()]) {
      state.currentMode = modeArg.toLowerCase();
      modeBtns.forEach((b) => {
        if (b.getAttribute('data-mode') === state.currentMode) {
          b.classList.add('active');
        } else {
          b.classList.remove('active');
        }
      });
    }
    renderNumberButtons();
  };

  renderNumberButtons();
}
