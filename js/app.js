/**
 * ZATHU SOFTWARE - INTERACTIVE CYBER-AUDIO ENGINE & TERMINAL
 * Handcrafted for musicians, hackers, and gamers.
 */

(function () {
  'use strict';

  // State Management
  const state = {
    audioEnabled: true,
    currentWaveform: 'sine',
    rootNote: 'E',
    rootMidi: 52, // E3 (164.81 Hz)
    currentMode: 'minor',
    arpMode: false,
    commandHistory: [],
    historyIndex: -1,
  };

  // Chromatic Root Keys & Standard MIDI Base Octave (Register ~130Hz to ~250Hz)
  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  const ROOT_KEYS = {
    'C': 48,  // C3 (130.81 Hz)
    'C#': 49,
    'Db': 49,
    'D': 50,  // D3 (146.83 Hz)
    'D#': 51,
    'Eb': 51,
    'E': 52,  // E3 (164.81 Hz)
    'F': 53,  // F3 (174.61 Hz)
    'F#': 54,
    'Gb': 54,
    'G': 55,  // G3 (196.00 Hz)
    'G#': 56,
    'Ab': 56,
    'A': 57,  // A3 (220.00 Hz)
    'A#': 58,
    'Bb': 58,
    'B': 59   // B3 (246.94 Hz)
  };

  // Musical Modes & Scales (Ordered: Natural Minor, Harmonic Minor, Minor Pent, Modes, Major)
  const MODES = {
    'minor': {
      name: 'Natural Minor (Aeolian)',
      intervals: [0, 2, 3, 5, 7, 8, 10, 12],
      degrees: ['1 (Root)', '2nd', 'b3', '4th', '5th', 'b6', 'b7', '8 (Oct)']
    },
    'harmonic_minor': {
      name: 'Harmonic Minor',
      intervals: [0, 2, 3, 5, 7, 8, 11, 12],
      degrees: ['1 (Root)', '2nd', 'b3', '4th', '5th', 'b6', '7th', '8 (Oct)']
    },
    'minor_pentatonic': {
      name: 'Minor Pentatonic',
      intervals: [0, 3, 5, 7, 10, 12],
      degrees: ['1 (Root)', 'b3', '4th', '5th', 'b7', '8 (Oct)']
    },
    'dorian': {
      name: 'Dorian',
      intervals: [0, 2, 3, 5, 7, 9, 10, 12],
      degrees: ['1 (Root)', '2nd', 'b3', '4th', '5th', '6th', 'b7', '8 (Oct)']
    },
    'phrygian': {
      name: 'Phrygian',
      intervals: [0, 1, 3, 5, 7, 8, 10, 12],
      degrees: ['1 (Root)', 'b2', 'b3', '4th', '5th', 'b6', 'b7', '8 (Oct)']
    },
    'lydian': {
      name: 'Lydian (#4)',
      intervals: [0, 2, 4, 6, 7, 9, 11, 12],
      degrees: ['1 (Root)', '2nd', '3rd', '#4', '5th', '6th', '7th', '8 (Oct)']
    },
    'mixolydian': {
      name: 'Mixolydian',
      intervals: [0, 2, 4, 5, 7, 9, 10, 12],
      degrees: ['1 (Root)', '2nd', '3rd', '4th', '5th', '6th', 'b7', '8 (Oct)']
    },
    'major': {
      name: 'Major (Ionian)',
      intervals: [0, 2, 4, 5, 7, 9, 11, 12],
      degrees: ['1 (Root)', '2nd', '3rd', '4th', '5th', '6th', '7th', '8 (Oct)']
    }
  };

  function getNoteNameFromMidi(midi) {
    const note = NOTE_NAMES[midi % 12];
    const octave = Math.floor(midi / 12) - 1;
    return `${note}${octave}`;
  }

  // Active scale notes helper for the current mode & root
  function getActiveScaleNotes() {
    const modeKey = state.currentMode || 'minor';
    const mode = MODES[modeKey] || MODES['minor'];
    const baseMidi = state.rootMidi || 52; // E3 (164.81 Hz)

    return mode.intervals.map((interval, index) => {
      const midi = baseMidi + interval;
      const freq = 440 * Math.pow(2, (midi - 69) / 12);
      const noteName = getNoteNameFromMidi(midi);
      const degree = mode.degrees[index] || '';
      const shortcut = (index + 1).toString();
      return { index, midi, freq, noteName, degree, shortcut };
    });
  }

  // Audio Engine State & Nodes
  let audioCtx = null;
  let masterGain = null;
  let masterAnalyser = null;
  let ribbonOsc = null;
  let ribbonGain = null;
  let ribbonFilter = null;
  let isRibbonPlaying = false;
  let ribbonActiveIndex = -1;
  let ribbonAnchorX = 0;
  let ribbonCurrentX = 0;
  let ribbonBaseFreq = 0;
  let ribbonCutoff = 2400;
  let ribbonTargetCents = 0;
  let ribbonCurrentCents = 0;
  let vibratoStartTime = 0;
  let ribbonTrace = null;

  function initAudioContext() {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();

        // Master Analyser Node (real-time time-domain waveform analysis)
        masterAnalyser = audioCtx.createAnalyser();
        masterAnalyser.fftSize = 2048;
        masterAnalyser.smoothingTimeConstant = 0.82;

        // Master Gain Node
        masterGain = audioCtx.createGain();
        masterGain.gain.setValueAtTime(0.4, audioCtx.currentTime);

        masterGain.connect(masterAnalyser);
        masterAnalyser.connect(audioCtx.destination);
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  function enableSound() {
    state.audioEnabled = true;
    initAudioContext();
  }

  // Per-voice scope traces: each note routes through its own analyser (a pass-through
  // into masterGain) so the scope can draw it faintly behind the summed waveform.
  const voiceTraces = [];
  const VOICE_TRACE_COLORS = ['#ec4899', '#fbbf24', '#10b981', '#c084fc', '#38bdf8', '#fb7185', '#a3e635', '#f97316'];
  let voiceColorCounter = 0;

  function routeVoice(outNode, ttlSeconds = null) {
    const an = audioCtx.createAnalyser();
    an.fftSize = 2048;
    an.smoothingTimeConstant = 0;
    outNode.connect(an);
    an.connect(masterGain);
    const trace = {
      an,
      buf: new Uint8Array(an.fftSize),
      releaseAt: ttlSeconds == null ? null : audioCtx.currentTime + ttlSeconds,
      color: VOICE_TRACE_COLORS[voiceColorCounter++ % VOICE_TRACE_COLORS.length],
    };
    voiceTraces.push(trace);
    return trace;
  }

  function releaseVoiceTrace(trace, afterSeconds = 0.15) {
    if (trace && audioCtx) trace.releaseAt = audioCtx.currentTime + afterSeconds;
  }

  function pruneVoiceTraces() {
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    for (let i = voiceTraces.length - 1; i >= 0; i--) {
      const t = voiceTraces[i];
      if (t.releaseAt !== null && now > t.releaseAt) {
        try { t.an.disconnect(); } catch (e) {}
        voiceTraces.splice(i, 1);
      }
    }
  }

  // Oscilloscope-style trigger: first rising zero-crossing, so the picture holds still
  function findTriggerIndex(buf, limit) {
    for (let i = 1; i < limit; i++) {
      if (buf[i - 1] < 128 && buf[i] >= 128) return i;
    }
    return 0;
  }

  // Play a synthesized note using the currently selected waveform
  function playSynthNote(freq, duration = 0.8, waveType = null) {
    if (!state.audioEnabled) return;
    initAudioContext();
    if (!audioCtx || !masterGain) return;

    try {
      const type = waveType || state.currentWaveform || 'sawtooth';
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const noteGain = audioCtx.createGain();
      const filter = audioCtx.createBiquadFilter();

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
      routeVoice(noteGain, duration + 0.1);

      osc.start(now);
      osc.stop(now + duration + 0.05);
    } catch (e) {
      console.warn('Audio playback error:', e);
    }
  }

  // Active sustained voices for held number keys / buttons (polyphonic)
  const activeKeyVoices = {};

  function startNoteVoice(keyId, freq, el = null) {
    enableSound();
    if (!audioCtx || !masterGain) return;

    // Avoid duplicating voice if already held
    if (activeKeyVoices[keyId]) return;

    try {
      const type = state.currentWaveform || 'sine';
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const filter = audioCtx.createBiquadFilter();

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

      osc.connect(filter);
      filter.connect(gain);
      const trace = routeVoice(gain);

      osc.start(now);

      if (el) el.classList.add('key-pressed');

      activeKeyVoices[keyId] = { osc, gain, filter, el, trace };
    } catch (e) {
      console.warn('Start note voice error:', e);
    }
  }

  // Arpeggiator: the pressed key picks the starting scale degree; a 6-note pattern
  // (degrees +0, +2, +4, octave, +4, +2) climbs and falls through the selected scale while held.
  const ARP_STEP_SECONDS = 0.13;

  function getArpFrequencies(startIndex) {
    const modeKey = state.currentMode || 'minor';
    const mode = MODES[modeKey] || MODES['minor'];
    const n = mode.intervals.length;
    const baseMidi = state.rootMidi || 52;
    const midiAt = (i) => baseMidi + mode.intervals[i % n] + 12 * Math.floor(i / n);
    return [0, 2, 4, n, 4, 2].map((step) => {
      const midi = midiAt(startIndex + step);
      return 440 * Math.pow(2, (midi - 69) / 12);
    });
  }

  function startArpVoice(keyId, startIndex, el = null) {
    enableSound();
    if (!audioCtx || !masterGain) return;
    if (activeKeyVoices[keyId]) return;

    try {
      const freqs = getArpFrequencies(startIndex);
      const type = state.currentWaveform || 'sine';
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const filter = audioCtx.createBiquadFilter();

      osc.type = type;
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(freqs[0] * 6, now);
      gain.gain.setValueAtTime(0.0001, now);

      osc.connect(filter);
      filter.connect(gain);
      const trace = routeVoice(gain);
      osc.start(now);

      let step = 0;
      const playStep = () => {
        const t = audioCtx.currentTime;
        const f = freqs[step % freqs.length];
        osc.frequency.setValueAtTime(f, t);
        filter.frequency.setValueAtTime(f * 6, t);
        gain.gain.cancelScheduledValues(t);
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.linearRampToValueAtTime(0.32, t + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.14, t + ARP_STEP_SECONDS * 0.9);
        step++;
      };
      playStep();
      const timer = setInterval(playStep, ARP_STEP_SECONDS * 1000);

      if (el) el.classList.add('key-pressed');
      activeKeyVoices[keyId] = { osc, gain, filter, el, timer, trace };
    } catch (e) {
      console.warn('Start arp voice error:', e);
    }
  }

  // Start a held key in the current mode (plain note or arpeggio)
  function triggerKey(keyId, el) {
    if (!el) return;
    if (state.arpMode) {
      startArpVoice(keyId, parseInt(el.getAttribute('data-index'), 10) || 0, el);
    } else {
      startNoteVoice(keyId, parseFloat(el.getAttribute('data-freq')), el);
    }
  }

  function stopNoteVoice(keyId) {
    const voice = activeKeyVoices[keyId];
    if (!voice || !audioCtx) return;

    if (voice.timer) clearInterval(voice.timer);
    releaseVoiceTrace(voice.trace);

    try {
      const now = audioCtx.currentTime;
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
      // Quick musical release fade out (0.09s)
      voice.gain.gain.linearRampToValueAtTime(0.0001, now + 0.09);
      voice.osc.stop(now + 0.11);
    } catch (e) {}

    if (voice.el) voice.el.classList.remove('key-pressed');
    delete activeKeyVoices[keyId];
  }

  function stopAllNoteVoices() {
    Object.keys(activeKeyVoices).forEach((id) => stopNoteVoice(id));
  }

  // UI Micro-click sound
  function playClickBlip(type = 'blip') {
    if (!state.audioEnabled) return;
    initAudioContext();
    if (!audioCtx || !masterGain) return;

    try {
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

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
      gain.connect(masterGain);
      osc.start(now);
      osc.stop(now + 0.05);
    } catch (e) {}
  }

  // Play an 8-bit chiptune arpeggio
  function playArpeggio() {
    enableSound();
    const notes = [261.63, 329.63, 392.0, 523.25, 659.25, 783.99]; // C major arpeggio
    notes.forEach((freq, idx) => {
      setTimeout(() => {
        playSynthNote(freq, 0.35, state.currentWaveform || 'square');
      }, idx * 75);
    });
  }

  function highlightKeyByIndex(index) {
    const keys = document.querySelectorAll('#synth-keys-container .synth-key');
    keys.forEach((keyEl, i) => {
      if (i === index) {
        keyEl.classList.add('key-pressed');
      } else {
        keyEl.classList.remove('key-pressed');
      }
    });
  }

  function clearHighlightedKeys() {
    const keys = document.querySelectorAll('#synth-keys-container .synth-key');
    keys.forEach((keyEl) => keyEl.classList.remove('key-pressed'));
  }

  // Interactive wave click & drag: binds directly to scale notes with automatic vibrato
  function startRibbonTone(x, y, width, height) {
    enableSound();
    if (!audioCtx || !masterGain) return;

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

    ribbonActiveIndex = index;
    ribbonAnchorX = noteCenterX;
    ribbonCurrentX = clampedX;
    ribbonBaseFreq = note.freq;
    ribbonCutoff = cutoff;

    // Vibrato depth is measured relative to the middle of the bar (0 cents)
    const deltaX = clampedX - noteCenterX;
    const halfZone = Math.max(16, zoneWidth * 0.48);
    const vibratoRatio = Math.max(-1, Math.min(1, deltaX / halfZone));
    ribbonTargetCents = Math.round(vibratoRatio * 100);
    ribbonCurrentCents = 0;
    vibratoStartTime = audioCtx.currentTime;

    try {
      const now = audioCtx.currentTime;
      ribbonOsc = audioCtx.createOscillator();
      ribbonGain = audioCtx.createGain();
      ribbonFilter = audioCtx.createBiquadFilter();

      ribbonOsc.type = state.currentWaveform || 'sine';

      // Note "clicks" immediately into pure scale pitch (0 cents)
      ribbonOsc.frequency.setValueAtTime(ribbonBaseFreq, now);
      ribbonOsc.detune.setValueAtTime(0, now);
      ribbonFilter.type = 'lowpass';
      ribbonFilter.frequency.setValueAtTime(cutoff, now);

      ribbonGain.gain.setValueAtTime(0.0001, now);
      ribbonGain.gain.linearRampToValueAtTime(0.32, now + 0.03);

      ribbonOsc.connect(ribbonFilter);
      ribbonFilter.connect(ribbonGain);
      ribbonTrace = routeVoice(ribbonGain);

      ribbonOsc.start(now);
      isRibbonPlaying = true;

      highlightKeyByIndex(index);
      updateScopeStatus(ribbonBaseFreq, cutoff, note.noteName, note.degree, 0, ribbonTargetCents);
    } catch (e) {
      console.warn('Ribbon tone error:', e);
    }
  }

  function updateRibbonTone(x, y, width, height) {
    if (!isRibbonPlaying || !ribbonOsc || !audioCtx) return;

    const notes = getActiveScaleNotes();
    if (!notes.length) return;

    const N = notes.length;
    const zoneWidth = width / N;
    const clampedX = Math.max(0, Math.min(width - 1, x));
    ribbonCurrentX = clampedX;

    const currentZone = Math.max(0, Math.min(N - 1, Math.floor(clampedX / zoneWidth)));

    // Transitioning / sliding into a new note zone in the scale
    if (currentZone !== ribbonActiveIndex) {
      ribbonActiveIndex = currentZone;
      const noteCenterX = (currentZone + 0.5) * zoneWidth;
      ribbonAnchorX = noteCenterX; // Middle of the bar displayed is 0 cents
      ribbonBaseFreq = notes[currentZone].freq;
      vibratoStartTime = audioCtx.currentTime;
      highlightKeyByIndex(currentZone);

      ribbonOsc.frequency.setTargetAtTime(ribbonBaseFreq, audioCtx.currentTime, 0.015);
    }

    const noteCenterX = (ribbonActiveIndex + 0.5) * zoneWidth;
    ribbonAnchorX = noteCenterX;

    // Measure vibrato offset relative to the middle of the bar (0 cents)
    const deltaX = clampedX - noteCenterX;
    const halfZone = Math.max(16, zoneWidth * 0.48);
    const vibratoRatio = Math.max(-1, Math.min(1, deltaX / halfZone));
    const maxVibratoCents = 100; // ±100 cents (±1 semitone)
    ribbonTargetCents = Math.round(vibratoRatio * maxVibratoCents);

    const clampedY = Math.max(0, Math.min(height, y));
    ribbonCutoff = 300 + (1 - clampedY / height) * 5700;
    ribbonFilter.frequency.setTargetAtTime(ribbonCutoff, audioCtx.currentTime, 0.02);
  }

  function stopRibbonTone() {
    if (!isRibbonPlaying || !ribbonGain || !audioCtx) {
      isRibbonPlaying = false;
      ribbonActiveIndex = -1;
      ribbonTargetCents = 0;
      ribbonCurrentCents = 0;
      clearHighlightedKeys();
      return;
    }
    try {
      const now = audioCtx.currentTime;
      releaseVoiceTrace(ribbonTrace, 0.12);
      ribbonTrace = null;
      ribbonGain.gain.linearRampToValueAtTime(0.0001, now + 0.06);
      if (ribbonOsc) {
        ribbonOsc.stop(now + 0.08);
      }
    } catch (e) {}
    isRibbonPlaying = false;
    ribbonActiveIndex = -1;
    ribbonTargetCents = 0;
    ribbonCurrentCents = 0;
    clearHighlightedKeys();
    resetScopeStatus();
  }

  function updateScopeStatus(freq, cutoff, noteName = null, degree = null, cents = 0, targetCents = 0) {
    const statusEl = document.getElementById('scope-status-text');
    if (!statusEl) return;

    if (noteName) {
      const roundedTarget = Math.round(targetCents);
      const vibActive = Math.abs(roundedTarget) > 2;
      const vibText = vibActive ? `VIB ${roundedTarget > 0 ? '+' : ''}${roundedTarget}¢` : 'VIB 0';
      const vibColor = vibActive ? 'var(--neon-amber)' : 'var(--text-dim)';
      const instantFreq = freq * Math.pow(2, cents / 1200);

      statusEl.innerHTML = `<span style="color: var(--neon-cyan); font-weight: 700;">${noteName}</span> <span style="color: var(--text-dim);">${degree}</span> &bull; ${instantFreq.toFixed(0)} Hz<br><span style="color: ${vibColor};">${vibText}</span>`;
    } else {
      statusEl.innerHTML = `<span style="color: var(--neon-cyan); font-weight: 700;">FREQ: ${Math.round(freq)} Hz</span><br><span style="color: var(--neon-amber);">CUTOFF: ${Math.round(cutoff)} Hz</span>`;
    }
  }

  function resetScopeStatus() {
    const statusEl = document.getElementById('scope-status-text');
    if (statusEl) {
      statusEl.innerHTML = `<i class="fa-solid fa-hand-pointer"></i> DRAG WAVE TO PLAY`;
    }
  }

  /* ==========================================================================
     REAL-TIME OSCILLOSCOPE CANVAS (AUDIO-REACTIVE)
     ========================================================================== */
  function initOscilloscope() {
    const canvas = document.getElementById('oscilloscope-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const scopeFrame = canvas.parentElement;
    let width = (canvas.width = scopeFrame.clientWidth);
    let height = (canvas.height = scopeFrame.clientHeight || 180);

    function resizeScopeCanvas() {
      if (!scopeFrame) return;
      width = canvas.width = scopeFrame.clientWidth;
      height = canvas.height = scopeFrame.clientHeight || 180;
    }

    window.addEventListener('resize', resizeScopeCanvas);
    if (window.ResizeObserver) new ResizeObserver(resizeScopeCanvas).observe(scopeFrame);

    // Maximize button: the whole rack fills the viewport (Esc or the button restores it)
    const rackCard = document.querySelector('.hardware-chassis-card');
    const maxBtn = document.getElementById('scope-maximize-btn');
    function setScopeMaximized(on) {
      if (!rackCard) return;
      rackCard.classList.toggle('scope-maximized', on);
      document.body.classList.toggle('scope-max-open', on);
      if (maxBtn) {
        maxBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
        maxBtn.setAttribute('aria-label', on ? 'Restore synth rack size' : 'Maximize synth rack to full viewport');
        maxBtn.setAttribute('title', on ? 'Restore (Esc)' : 'Maximize to full viewport');
        maxBtn.textContent = on ? '✕' : '⛶';
      }
      resizeScopeCanvas();
    }
    if (maxBtn) {
      maxBtn.addEventListener('click', () => {
        playClickBlip('high');
        setScopeMaximized(!rackCard.classList.contains('scope-maximized'));
      });
    }
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && rackCard && rackCard.classList.contains('scope-maximized')) {
        setScopeMaximized(false);
      }
    });

    let phase = 0;
    let isMouseDownOnCanvas = false;
    const analyserBuffer = new Uint8Array(2048);
    const TRACE_SAMPLES = 1024; // samples drawn per sweep (~21 ms), starting at the trigger point

    // Canvas Mouse & Touch Interaction (Acts as an interactive synth pad)
    canvas.addEventListener('mousedown', (e) => {
      isMouseDownOnCanvas = true;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      startRibbonTone(x, y, width, height);
    });

    window.addEventListener('mousemove', (e) => {
      if (!isMouseDownOnCanvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      updateRibbonTone(x, y, width, height);
    });

    window.addEventListener('mouseup', () => {
      if (isMouseDownOnCanvas) {
        isMouseDownOnCanvas = false;
        stopRibbonTone();
      }
    });

    // Touch support for mobile / tablets
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      isMouseDownOnCanvas = true;
      const rect = canvas.getBoundingClientRect();
      const touch = e.touches[0];
      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;
      startRibbonTone(x, y, width, height);
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
      if (!isMouseDownOnCanvas) return;
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const touch = e.touches[0];
      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;
      updateRibbonTone(x, y, width, height);
    }, { passive: false });

    canvas.addEventListener('touchend', () => {
      isMouseDownOnCanvas = false;
      stopRibbonTone();
    });

    function drawGrid() {
      const notes = getActiveScaleNotes();
      const N = notes.length || 8;
      const zoneWidth = width / N;

      // Draw subtle scale note column dividers
      for (let i = 0; i <= N; i++) {
        const x = i * zoneWidth;
        ctx.strokeStyle = i === 0 || i === N ? 'rgba(0, 240, 255, 0.12)' : 'rgba(0, 240, 255, 0.06)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }

      // Horizontal grid lines
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.04)';
      for (let y = 0; y < height; y += 30) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Center crosshairs
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.12)';
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();

      // Subtle center guide ticks in the middle of each bar (marking 0 cents)
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.08)';
      ctx.setLineDash([2, 5]);
      for (let i = 0; i < N; i++) {
        const cX = (i + 0.5) * zoneWidth;
        ctx.beginPath();
        ctx.moveTo(cX, 18);
        ctx.lineTo(cX, height - 16);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // If ribbon note is active, draw illuminated column, middle anchor, and animated vibrato indicator
      if (isRibbonPlaying && ribbonActiveIndex >= 0 && ribbonActiveIndex < N) {
        const xLeft = ribbonActiveIndex * zoneWidth;
        const noteCenterX = (ribbonActiveIndex + 0.5) * zoneWidth;

        // Illuminated bar
        ctx.fillStyle = 'rgba(0, 240, 255, 0.08)';
        ctx.fillRect(xLeft, 0, zoneWidth, height);

        // 0-cents center line: strictly in the middle of the bar displayed
        ctx.strokeStyle = 'rgba(0, 240, 255, 0.55)';
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(noteCenterX, 0);
        ctx.lineTo(noteCenterX, height);
        ctx.stroke();
        ctx.setLineDash([]);

        // "0¢" label directly on the middle line
        ctx.font = '9px "JetBrains Mono", monospace';
        ctx.fillStyle = 'rgba(0, 240, 255, 0.85)';
        ctx.textAlign = 'center';
        ctx.fillText('0¢', noteCenterX, height / 2 - 14);

        // If user has dragged away from the middle of the bar to select vibrato depth
        if (Math.abs(ribbonTargetCents) > 2) {
          // Where user is selecting (target depth marker)
          ctx.strokeStyle = 'rgba(251, 191, 36, 0.45)';
          ctx.beginPath();
          ctx.moveTo(ribbonCurrentX, 0);
          ctx.lineTo(ribbonCurrentX, height);
          ctx.stroke();

          // Animated oscillating orb moving back and forth between 0 cents (middle of the bar: noteCenterX) and selection (ribbonCurrentX)
          const lfoFactor = ribbonTargetCents !== 0 ? (ribbonCurrentCents / ribbonTargetCents) : 0;
          const oscX = noteCenterX + (ribbonCurrentX - noteCenterX) * lfoFactor;

          ctx.fillStyle = '#00f0ff';
          ctx.shadowBlur = 10;
          ctx.shadowColor = '#00f0ff';
          ctx.beginPath();
          ctx.arc(oscX, height / 2, 4.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }

      // Draw Note Names on top and Key Shortcuts on bottom of canvas
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      for (let i = 0; i < N; i++) {
        const centerX = (i + 0.5) * zoneWidth;
        const isActive = isRibbonPlaying && ribbonActiveIndex === i;

        // Note name on top
        ctx.fillStyle = isActive ? '#00f0ff' : 'rgba(148, 163, 184, 0.45)';
        ctx.fillText(notes[i].noteName, centerX, 13);

        // Key shortcut on bottom
        ctx.fillStyle = isActive ? '#38bdf8' : 'rgba(100, 116, 139, 0.35)';
        ctx.fillText(`[${notes[i].shortcut}]`, centerX, height - 5);
      }
    }

    function render() {
      // Automatic vibrato modulation: continuously cycles between 0 cents and ribbonTargetCents
      if (isRibbonPlaying && ribbonOsc && audioCtx) {
        const now = audioCtx.currentTime;
        const t = Math.max(0, now - vibratoStartTime);
        const rate = 5.2; // 5.2 Hz natural guitar vibrato speed
        // Oscillates between 0 and 1: 0 at t=0, goes up to 1, then back to 0
        const lfoCycle = 0.5 - 0.5 * Math.cos(2 * Math.PI * rate * t);
        ribbonCurrentCents = ribbonTargetCents * lfoCycle;

        ribbonOsc.detune.setTargetAtTime(ribbonCurrentCents, now, 0.015);

        const notes = getActiveScaleNotes();
        if (notes[ribbonActiveIndex]) {
          const note = notes[ribbonActiveIndex];
          updateScopeStatus(ribbonBaseFreq, ribbonCutoff, note.noteName, note.degree, ribbonCurrentCents, ribbonTargetCents);
        }
      }

      ctx.fillStyle = '#04070c';
      ctx.fillRect(0, 0, width, height);

      drawGrid();

      // Determine glow color based on waveform
      let waveColor = '#00f0ff';
      if (state.currentWaveform === 'square') waveColor = '#10b981';
      else if (state.currentWaveform === 'sawtooth') waveColor = '#fbbf24';
      else if (state.currentWaveform === 'triangle') waveColor = '#c084fc';

      ctx.lineWidth = 2.5;
      ctx.strokeStyle = waveColor;
      ctx.shadowBlur = 12;
      ctx.shadowColor = waveColor;

      ctx.beginPath();

      // Check if real audio is flowing through masterAnalyser
      let hasAudioSignal = false;
      if (masterAnalyser) {
        masterAnalyser.getByteTimeDomainData(analyserBuffer);
        for (let i = 0; i < analyserBuffer.length; i += 8) {
          if (Math.abs(analyserBuffer[i] - 128) > 2) {
            hasAudioSignal = true;
            break;
          }
        }
      }

      if (hasAudioSignal) {
        pruneVoiceTraces();

        // Faint per-note traces behind the sum, each triggered on its own so they hold still.
        // Voices tap in before masterGain, so scale them to their share of the mix.
        const mixScale = masterGain ? masterGain.gain.value : 1;
        if (voiceTraces.length > 1) {
          ctx.save();
          ctx.globalAlpha = 0.5;
          ctx.lineWidth = 1.5;
          ctx.shadowBlur = 0;
          voiceTraces.forEach((t) => {
            ctx.beginPath();
            ctx.strokeStyle = t.color;
            t.an.getByteTimeDomainData(t.buf);
            const start = findTriggerIndex(t.buf, t.buf.length - TRACE_SAMPLES);
            const step = width / TRACE_SAMPLES;
            for (let i = 0; i < TRACE_SAMPLES; i++) {
              const v = (t.buf[start + i] - 128) / 128.0;
              const y = height / 2 + v * mixScale * (height / 2);
              if (i === 0) ctx.moveTo(0, y);
              else ctx.lineTo(i * step, y);
            }
            ctx.stroke();
          });
          ctx.restore();
        }

        // Summed waveform (what you actually hear), triggered for a steady picture
        const start = findTriggerIndex(analyserBuffer, analyserBuffer.length - TRACE_SAMPLES);
        const sliceWidth = width / TRACE_SAMPLES;
        ctx.beginPath(); // start fresh: the per-note traces above used their own paths
        for (let i = 0; i < TRACE_SAMPLES; i++) {
          const v = analyserBuffer[start + i] / 128.0;
          const y = (v * height) / 2;

          if (i === 0) ctx.moveTo(0, y);
          else ctx.lineTo(i * sliceWidth, y);
        }
      } else {
        // Standby guide wave reflecting selected waveform shape
        const centerY = height / 2;
        const amp = 22;
        const freq = 0.035;

        for (let x = 0; x < width; x += 2) {
          let y = centerY;
          const angle = x * freq + phase;

          if (state.currentWaveform === 'sine') {
            y = centerY + Math.sin(angle) * amp;
          } else if (state.currentWaveform === 'sawtooth') {
            y = centerY + ((angle % (Math.PI * 2)) / Math.PI - 1) * amp;
          } else if (state.currentWaveform === 'square') {
            y = centerY + (Math.sin(angle) >= 0 ? amp * 0.75 : -amp * 0.75);
          } else if (state.currentWaveform === 'triangle') {
            y = centerY + (Math.asin(Math.sin(angle)) / (Math.PI / 2)) * amp;
          }

          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
      }

      ctx.stroke();
      ctx.shadowBlur = 0;

      phase += 0.05;
      requestAnimationFrame(render);
    }

    render();
  }

  /* ==========================================================================
     CHROMATIC ROOT KEY & MODES / SCALES SYNTHESIZER
     ========================================================================== */
  function initEModeSynth() {
    const container = document.getElementById('synth-keys-container');
    const modeBtns = document.querySelectorAll('#mode-buttons-group .mode-btn');
    const rootSelect = document.getElementById('synth-root-select');

    function renderNumberButtons() {
      if (!container) return;
      stopAllNoteVoices();
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
        btn.setAttribute('title', `${noteName} (${freq.toFixed(1)} Hz) - ${degree}`);

        btn.innerHTML = `
          <span class="synth-note-name">${noteName}</span>
          <span class="synth-key-degree">${degree}</span>
          <span class="synth-key-shortcut">[${shortcut}]</span>
        `;

        // Mouse click & hold: sustains note while held, fades out on release
        btn.addEventListener('mousedown', (e) => {
          if (e.button !== 0) return;
          triggerKey(shortcut, btn);
        });

        btn.addEventListener('mouseup', () => {
          stopNoteVoice(shortcut);
        });

        btn.addEventListener('mouseleave', () => {
          stopNoteVoice(shortcut);
        });

        // Touch for mobile / tablet
        btn.addEventListener('touchstart', (e) => {
          e.preventDefault();
          triggerKey(shortcut, btn);
        }, { passive: false });

        btn.addEventListener('touchend', (e) => {
          e.preventDefault();
          stopNoteVoice(shortcut);
        });

        btn.addEventListener('touchcancel', () => {
          stopNoteVoice(shortcut);
        });

        container.appendChild(btn);
      });
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
        stopAllNoteVoices();
        state.arpMode = arpToggle.checked;
        syncArpUi();
        arpToggle.blur();
      });
    }

    // Root Key dropdown listener
    if (rootSelect) {
      rootSelect.value = state.rootNote || 'E';
      rootSelect.addEventListener('change', () => {
        playClickBlip('high');
        const selectedKey = rootSelect.value;
        state.rootNote = selectedKey;
        state.rootMidi = ROOT_KEYS[selectedKey] || 52;
        renderNumberButtons();
      });
    }

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

      const num = e.key;
      if (num >= '1' && num <= '8') {
        const keyEl = container.querySelector(`.synth-key[data-key="${num}"]`);
        if (keyEl) triggerKey(num, keyEl);
      }
    });

    window.addEventListener('keyup', (e) => {
      if (isTypingTarget(document.activeElement)) return;

      const num = e.key;
      if (num >= '1' && num <= '8') {
        stopNoteVoice(num);
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
        state.rootMidi = ROOT_KEYS[formatted];
        if (rootSelect) rootSelect.value = formatted;
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
          state.rootMidi = ROOT_KEYS[formatted];
          if (rootSelect) rootSelect.value = formatted;
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

  /* ==========================================================================
     HARDWARE TOGGLES & WAVEFORM SWITCHER
     ========================================================================== */
  function initHardwareToggles() {
    // Waveform switcher buttons
    const waveBtns = document.querySelectorAll('.scope-btn');
    waveBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        waveBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        state.currentWaveform = btn.getAttribute('data-wave');
        enableSound();
        playSynthNote(329.63, 0.5, state.currentWaveform);
        resetScopeStatus();
      });
    });
  }

  /* ==========================================================================
     LAN PARTY TABS & CODE COPY
     ========================================================================== */
  function initLanTabs() {
    const tabBtns = document.querySelectorAll('.lan-tab-btn');
    const tabPanels = document.querySelectorAll('.lan-tab-panel');

    tabBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        playClickBlip('blip');
        const targetId = btn.getAttribute('data-tab');

        tabBtns.forEach((b) => b.classList.remove('active'));
        tabPanels.forEach((p) => p.classList.remove('active'));

        btn.classList.add('active');
        const targetPanel = document.getElementById(targetId);
        if (targetPanel) {
          targetPanel.classList.add('active');
        }
      });
    });
  }

  /* ==========================================================================
     INIT ON DOM READY
     ========================================================================== */
  document.addEventListener('DOMContentLoaded', () => {
    initOscilloscope();
    initEModeSynth();
    initHardwareToggles();
    initLanTabs();
  });
})();
