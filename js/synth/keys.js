import { enableSound, playSynthNote, playClickBlip } from './audio.js';
import { MODES, OCTAVE_MAX, OCTAVE_MIN, ROOT_KEYS, getNoteNameFromMidi, rootMidiFor } from './music.js';
import { state } from './state.js';
import { ARP_MIN_NOTES, activeKeyVoices, applyWaveformToPlaying, captureHeldVoices, getArpMaxNotes, refreshHeldKeyStates, refreshPlayingArps, releaseHeldVoices, releaseKey, stopAllNoteVoices, stopNoteVoice, triggerKey } from './voices.js';

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
  if (randomBtn) randomBtn.addEventListener('click', () => { randomizeAll(); randomBtn.blur(); });
  randomizeAll(false); // always start from a random setup, silently

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
      randomizeAll();
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
