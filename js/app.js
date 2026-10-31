/**
 * ZATHU SOFTWARE - INTERACTIVE CYBER-AUDIO ENGINE & TERMINAL
 * Handcrafted for musicians, hackers, and gamers.
 */

(function () {
  'use strict';

  // State Management
  const state = {
    audioEnabled: false,
    currentWaveform: 'sine',
    rootNote: 'E',
    rootMidi: 52, // E3 (164.81 Hz)
    currentMode: 'minor',
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

  function initAudioContext() {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();

        // Master Analyser Node (real-time time-domain waveform analysis)
        masterAnalyser = audioCtx.createAnalyser();
        masterAnalyser.fftSize = 1024;
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
    if (!state.audioEnabled) {
      state.audioEnabled = true;
      const soundToggle = document.getElementById('sound-toggle-btn');
      if (soundToggle) {
        soundToggle.classList.add('active');
        soundToggle.innerHTML = '<i class="fa-solid fa-volume-high"></i> SOUND: ON';
      }
      localStorage.setItem('zathu_sound', 'enabled');
    }
    initAudioContext();
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
      noteGain.connect(masterGain);

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
      gain.connect(masterGain);

      osc.start(now);

      if (el) el.classList.add('key-pressed');

      activeKeyVoices[keyId] = { osc, gain, filter, el };
    } catch (e) {
      console.warn('Start note voice error:', e);
    }
  }

  function stopNoteVoice(keyId) {
    const voice = activeKeyVoices[keyId];
    if (!voice || !audioCtx) return;

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
      ribbonGain.connect(masterGain);

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
      const roundedCents = Math.round(cents);
      const roundedTarget = Math.round(targetCents);
      let vibText = '0¢';
      let vibColor = 'var(--neon-emerald)';

      if (Math.abs(roundedTarget) > 2) {
        const currentStr = roundedCents >= 0 ? `+${roundedCents}¢` : `${roundedCents}¢`;
        const targetStr = roundedTarget >= 0 ? `+${roundedTarget}¢` : `${roundedTarget}¢`;
        vibText = `${currentStr} <span style="opacity: 0.7; font-size: 0.9em;">[0 &harr; ${targetStr}]</span>`;
        vibColor = 'var(--neon-amber)';
      }

      // Calculate instantaneous frequency with detune cents
      const instantFreq = freq * Math.pow(2, cents / 1200);

      statusEl.innerHTML = `NOTE: <span style="color: var(--neon-cyan); font-weight: 700;">${noteName}</span> <span style="color: var(--text-dim);">(${degree})</span> &bull; <span style="color: ${vibColor}; font-weight: 700;">AUTO-VIBRATO: ${vibText}</span> &bull; <span style="color: var(--neon-amber);">${instantFreq.toFixed(1)} Hz</span> &bull; WAVE: ${state.currentWaveform.toUpperCase()}`;
    } else {
      statusEl.innerHTML = `<span style="color: var(--neon-cyan); font-weight: 700;">FREQ: ${Math.round(freq)} Hz</span> &bull; <span style="color: var(--neon-amber);">CUTOFF: ${Math.round(cutoff)} Hz</span> &bull; WAVE: ${state.currentWaveform.toUpperCase()}`;
    }
  }

  function resetScopeStatus() {
    const statusEl = document.getElementById('scope-status-text');
    if (statusEl) {
      statusEl.innerHTML = `<i class="fa-solid fa-hand-pointer"></i> CLICK & DRAG WAVE FOR SCALE NOTES & AUTO-VIBRATO &bull; WAVE: ${state.currentWaveform.toUpperCase()}`;
    }
  }

  /* ==========================================================================
     REAL-TIME OSCILLOSCOPE CANVAS (AUDIO-REACTIVE)
     ========================================================================== */
  function initOscilloscope() {
    const canvas = document.getElementById('oscilloscope-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    let width = (canvas.width = canvas.parentElement.clientWidth);
    let height = (canvas.height = 180);

    window.addEventListener('resize', () => {
      if (canvas.parentElement) {
        width = canvas.width = canvas.parentElement.clientWidth;
        height = canvas.height = 180;
      }
    });

    let phase = 0;
    let isMouseDownOnCanvas = false;
    const analyserBuffer = new Uint8Array(1024);

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
        // Draw real physical waveform from Web Audio analyser
        const sliceWidth = width / analyserBuffer.length;
        let x = 0;
        for (let i = 0; i < analyserBuffer.length; i++) {
          const v = analyserBuffer[i] / 128.0;
          const y = (v * height) / 2;

          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);

          x += sliceWidth;
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
        btn.setAttribute('title', `${noteName} (${freq.toFixed(1)} Hz) - ${degree}`);

        btn.innerHTML = `
          <span class="synth-note-name">${noteName}</span>
          <span class="synth-key-degree">${degree}</span>
          <span class="synth-key-shortcut">[${shortcut}]</span>
        `;

        // Mouse click & hold: sustains note while held, fades out on release
        btn.addEventListener('mousedown', (e) => {
          if (e.button !== 0) return;
          startNoteVoice(shortcut, freq, btn);
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
          startNoteVoice(shortcut, freq, btn);
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

    // Keyboard Hotkeys 1-8: Hold note while key is pressed down, quick fade out when released
    window.addEventListener('keydown', (e) => {
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
      if (e.repeat) return; // Ignore auto-repeat key events to hold steady sustain

      const num = e.key;
      if (num >= '1' && num <= '8') {
        const keyEl = container.querySelector(`.synth-key[data-key="${num}"]`);
        if (keyEl) {
          const freq = parseFloat(keyEl.getAttribute('data-freq'));
          startNoteVoice(num, freq, keyEl);
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

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
     HARDWARE TOGGLES (Sound FX)
     ========================================================================== */
  function initHardwareToggles() {
    const soundToggle = document.getElementById('sound-toggle-btn');

    // Restore Sound setting
    const savedAudio = localStorage.getItem('zathu_sound');
    if (savedAudio === 'enabled') {
      state.audioEnabled = true;
      if (soundToggle) soundToggle.classList.add('active');
    }

    // Sound Toggle Click
    if (soundToggle) {
      soundToggle.addEventListener('click', () => {
        state.audioEnabled = !state.audioEnabled;
        if (state.audioEnabled) {
          soundToggle.classList.add('active');
          soundToggle.innerHTML = '<i class="fa-solid fa-volume-high"></i> SOUND: ON';
          localStorage.setItem('zathu_sound', 'enabled');
          initAudioContext();
          playArpeggio();
        } else {
          soundToggle.classList.remove('active');
          soundToggle.innerHTML = '<i class="fa-solid fa-volume-xmark"></i> SOUND: OFF';
          localStorage.setItem('zathu_sound', 'disabled');
        }
      });
    }

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

    // Copy to clipboard
    const copyBtns = document.querySelectorAll('.btn-copy-code');
    const toast = document.getElementById('toast-notice');

    copyBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const textToCopy = btn.getAttribute('data-copy');
        if (navigator.clipboard && textToCopy) {
          navigator.clipboard.writeText(textToCopy).then(() => {
            playClickBlip('high');
            showToast('COPIED TO CLIPBOARD // READY IN TERMINAL');
          });
        }
      });
    });

    function showToast(msg) {
      if (!toast) return;
      toast.querySelector('.toast-msg').textContent = msg;
      toast.classList.add('show');
      setTimeout(() => {
        toast.classList.remove('show');
      }, 2500);
    }
  }

  /* ==========================================================================
     INTERACTIVE LINUX TERMINAL ENGINE (zathu-sh / bash)
     ========================================================================== */
  function initTerminal() {
    const termInput = document.getElementById('term-input');
    const termBody = document.getElementById('term-body');
    const termOutput = document.getElementById('term-output');
    const termPromptPrefix = document.getElementById('term-prompt-prefix');

    if (!termInput || !termBody || !termOutput) return;

    // In-Memory Virtual Filesystem (VFS)
    const vfs = {
      type: 'dir',
      perm: 'rwxr-xr-x',
      owner: 'root',
      group: 'root',
      date: 'Oct 30 20:00',
      children: {
        home: {
          type: 'dir',
          perm: 'rwxr-xr-x',
          owner: 'root',
          group: 'root',
          date: 'Oct 30 20:00',
          children: {
            cgarst: {
              type: 'dir',
              perm: 'rwxr-xr-x',
              owner: 'cgarst',
              group: 'zathu',
              date: 'Oct 30 20:25',
              children: {
                projects: {
                  type: 'dir',
                  perm: 'rwxr-xr-x',
                  owner: 'cgarst',
                  group: 'zathu',
                  date: 'Oct 30 20:21',
                  children: {
                    'majestictab.md': {
                      type: 'file',
                      perm: 'rw-r--r--',
                      owner: 'cgarst',
                      group: 'zathu',
                      date: 'Oct 30 20:15',
                      size: 1420,
                      content: `=== MAJESTICTAB ===
Focused guitar tab reader and practice studio.
Open Guitar Pro (.gp3/.gp4/.gp5/.gpx), PDF, and text tabs with zero clutter.
Features: Multi-track audio synthesis, synchronized virtual fretboard, local network Jam Mode, Steam Deck support.
Live App: https://majestictab.zathu.net/
Repository: https://github.com/cgarst/MajesticTab
License: Open Source`
                    },
                    'setlore.md': {
                      type: 'file',
                      perm: 'rw-r--r--',
                      owner: 'cgarst',
                      group: 'zathu',
                      date: 'Oct 30 20:18',
                      size: 980,
                      content: `=== SETLORE ===
Self-hosted live concert & tour setlist analytics.
Track your personal gig history, tour debuts, song rarity frequency, and venue maps.
Live App: https://setlore.zathu.net/
Features: PWA support, zero third-party surveillance, self-hosted independence.`
                    },
                    'random-album-ytm.md': {
                      type: 'file',
                      perm: 'rw-r--r--',
                      owner: 'cgarst',
                      group: 'zathu',
                      date: 'Oct 30 20:19',
                      size: 760,
                      content: `=== RANDOM ALBUM FOR YOUTUBE MUSIC ===
Break free from repetitive playlist algorithms.
Spins up full, unadulterated albums at random straight from your personal library.
Repository: https://github.com/cgarst/random-album-for-youtube-music
License: GPL-3.0`
                    },
                    'gamestream_launchpad.py': {
                      type: 'file',
                      executable: true,
                      perm: 'rwxr-xr-x',
                      owner: 'cgarst',
                      group: 'zathu',
                      date: 'Oct 30 20:20',
                      size: 2150,
                      content: `#!/usr/bin/env python3
"""
Optimized GameStream & Moonlight environment for launching PC games.
390+ Stars on GitHub.
"""
import sys

def launch():
    print("[*] Initializing Moonlight GameStream host daemon...")
    print("[*] Detecting display resolution and refresh rate (60/120Hz)...")
    print("[+] Launchpad ready. Connect handheld / TV client to start gaming.")

if __name__ == "__main__":
    launch()`
                    }
                  }
                },
                lan: {
                  type: 'dir',
                  perm: 'rwxr-xr-x',
                  owner: 'cgarst',
                  group: 'zathu',
                  date: 'Oct 30 20:22',
                  children: {
                    'lanscript-cod4.bat': {
                      type: 'file',
                      executable: true,
                      perm: 'rwxr-xr-x',
                      owner: 'cgarst',
                      group: 'zathu',
                      date: 'Oct 30 20:10',
                      size: 1140,
                      content: `@echo off
echo [*] Deploying Call of Duty 4 Modern Warfare LAN Server...
echo [*] Listening on UDP port 28960
echo [OK] Dedicated lobby ready. Clients can connect without auth servers.`
                    },
                    'lanscript-cod5.bat': {
                      type: 'file',
                      executable: true,
                      perm: 'rwxr-xr-x',
                      owner: 'cgarst',
                      group: 'zathu',
                      date: 'Oct 30 20:11',
                      size: 1080,
                      content: `@echo off
echo [*] Deploying Call of Duty 5: World at War Coop Zombies...
echo [*] Bypassing online auth check...
echo [OK] Nacht der Untoten & Der Riese LAN ready.`
                    },
                    'lanscript-quake3.py': {
                      type: 'file',
                      executable: true,
                      perm: 'rwxr-xr-x',
                      owner: 'cgarst',
                      group: 'zathu',
                      date: 'Oct 30 20:12',
                      size: 1620,
                      content: `#!/usr/bin/env python3
# Quake III Arena instant zero-config dedicated launcher
import sys

print("[*] Launching ioquake3 / id Tech 3 dedicated arena...")
print("[*] Map: q3dm17 (The Longest Yard) // Tickrate: 125")
print("[OK] Server listening on UDP 27960.")`
                    },
                    'reclaimer-lan.ps1': {
                      type: 'file',
                      executable: true,
                      perm: 'rwxr-xr-x',
                      owner: 'cgarst',
                      group: 'zathu',
                      date: 'Oct 30 20:14',
                      size: 1350,
                      content: `# Project Reclaimer Halo LAN Script
Write-Host "[*] Configuring adapter firewall exceptions..."
Write-Host "[+] Blood Gulch Slayer session broadcast active."`
                    },
                    'README.txt': {
                      type: 'file',
                      perm: 'rw-r--r--',
                      owner: 'cgarst',
                      group: 'zathu',
                      date: 'Oct 30 20:15',
                      size: 430,
                      content: `Zero-friction LAN party deployers for CoD4, WaW, Quake III, and Halo.
All repos: https://github.com/cgarst?tab=repositories`
                    }
                  }
                },
                music: {
                  type: 'dir',
                  perm: 'rwxr-xr-x',
                  owner: 'cgarst',
                  group: 'zathu',
                  date: 'Oct 30 20:23',
                  children: {
                    'gear_rack.txt': {
                      type: 'file',
                      perm: 'rw-r--r--',
                      owner: 'cgarst',
                      group: 'zathu',
                      date: 'Oct 30 20:05',
                      size: 380,
                      content: `RACK CONFIGURATION:
- Guitars: Ibanez Prestige, Fender Strat, PRS Custom
- Tunings: E Standard (EADGBe), Drop D, DADGAD
- Software: MajesticTab, Web Audio Synth, Audacity, Reaper
- Amps: High-gain tube lead + stereo modulated delay`
                    },
                    'synth.sh': {
                      type: 'file',
                      executable: true,
                      perm: 'rwxr-xr-x',
                      owner: 'cgarst',
                      group: 'zathu',
                      date: 'Oct 30 20:08',
                      size: 290,
                      content: `#!/bin/bash
# 8-bit Synthesizer Arpeggiator Trigger
# Run with: ./synth.sh or 'synth'`
                    },
                    'setlists.log': {
                      type: 'file',
                      perm: 'rw-r--r--',
                      owner: 'cgarst',
                      group: 'zathu',
                      date: 'Oct 30 20:09',
                      size: 610,
                      content: `[2026-10-18] The Fillmore - 18 songs - Encore: Free Bird / War Pigs
[2026-09-04] Red Rocks - 21 songs - Tour debut: Stargazer
[2026-07-22] 9:30 Club - 16 songs - Debut: Neon Blade`
                    }
                  }
                },
                'manifesto.txt': {
                  type: 'file',
                  perm: 'rw-r--r--',
                  owner: 'cgarst',
                  group: 'zathu',
                  date: 'Oct 30 20:02',
                  size: 580,
                  content: `=== ZATHU SOFTWARE ===
1. Independent open-source tools made for personal use and shared freely.
2. Local-first architecture: tools should work offline without external dependencies.
3. Clean, lightweight code built using open web and unix standards.
4. Focused utilities for musicians, gamers, and self-hosters.`
                },
                'contact.txt': {
                  type: 'file',
                  perm: 'rw-r--r--',
                  owner: 'cgarst',
                  group: 'zathu',
                  date: 'Oct 30 20:04',
                  size: 380,
                  content: `Developer: Corey Garst (cgarst)
LinkedIn:       https://www.linkedin.com/in/coreygarst/
GitHub Profile: https://github.com/cgarst/
Repositories:   https://github.com/cgarst?tab=repositories
Web Apps:       https://majestictab.zathu.net/
                https://setlore.zathu.net/`
                },
                '.zshrc': {
                  type: 'file',
                  perm: 'rw-r--r--',
                  owner: 'cgarst',
                  group: 'zathu',
                  date: 'Oct 30 20:01',
                  size: 420,
                  content: `# ZathuOS ZSH Configuration
export USER="cgarst"
export HOSTNAME="zathu-box"
export SHELL="/bin/zsh"
alias ll='ls -la'
alias jam='synth'
alias tab='cat projects/majestictab.md'`
                },
                '.bash_history': {
                  type: 'file',
                  perm: 'rw-------',
                  owner: 'cgarst',
                  group: 'zathu',
                  date: 'Oct 30 20:25',
                  size: 180,
                  content: `ls -la\ncd projects\ncat majestictab.md\n./gamestream_launchpad.py\nneofetch\nclear`
                }
              }
            }
          }
        },
        etc: {
          type: 'dir',
          perm: 'rwxr-xr-x',
          owner: 'root',
          group: 'root',
          date: 'Oct 30 20:00',
          children: {
            'os-release': {
              type: 'file',
              perm: 'rw-r--r--',
              owner: 'root',
              group: 'root',
              date: 'Oct 30 20:00',
              size: 240,
              content: `NAME="ZathuOS GNU/Linux"
VERSION="2.4 LTS (Synthwave Edition)"
ID=zathuos
PRETTY_NAME="ZathuOS 2.4 (x86_64)"
HOME_URL="https://zathu.net/"
BUILD_ID="20261030-01"`
            },
            hostname: {
              type: 'file',
              perm: 'rw-r--r--',
              owner: 'root',
              group: 'root',
              date: 'Oct 30 20:00',
              size: 10,
              content: `zathu-box`
            },
            motd: {
              type: 'file',
              perm: 'rw-r--r--',
              owner: 'root',
              group: 'root',
              date: 'Oct 30 20:00',
              size: 320,
              content: ` * Documentation:  https://github.com/cgarst
 * Management:     Local-First & Autonomous
 * Support:        Open Source (Copyleft)

 Last login: Fri Oct 30 20:40:00 2026 from 192.168.1.100`
            }
          }
        },
        bin: {
          type: 'dir',
          perm: 'rwxr-xr-x',
          owner: 'root',
          group: 'root',
          date: 'Oct 30 20:00',
          children: {
            ls: { type: 'file', executable: true, perm: 'rwxr-xr-x', owner: 'root', group: 'root', date: 'Oct 30 20:00', size: 142000 },
            pwd: { type: 'file', executable: true, perm: 'rwxr-xr-x', owner: 'root', group: 'root', date: 'Oct 30 20:00', size: 45000 },
            cat: { type: 'file', executable: true, perm: 'rwxr-xr-x', owner: 'root', group: 'root', date: 'Oct 30 20:00', size: 68000 },
            cd: { type: 'file', executable: true, perm: 'rwxr-xr-x', owner: 'root', group: 'root', date: 'Oct 30 20:00', size: 12000 },
            mkdir: { type: 'file', executable: true, perm: 'rwxr-xr-x', owner: 'root', group: 'root', date: 'Oct 30 20:00', size: 78000 },
            touch: { type: 'file', executable: true, perm: 'rwxr-xr-x', owner: 'root', group: 'root', date: 'Oct 30 20:00', size: 62000 },
            rm: { type: 'file', executable: true, perm: 'rwxr-xr-x', owner: 'root', group: 'root', date: 'Oct 30 20:00', size: 91000 },
            echo: { type: 'file', executable: true, perm: 'rwxr-xr-x', owner: 'root', group: 'root', date: 'Oct 30 20:00', size: 34000 },
            uname: { type: 'file', executable: true, perm: 'rwxr-xr-x', owner: 'root', group: 'root', date: 'Oct 30 20:00', size: 42000 },
            whoami: { type: 'file', executable: true, perm: 'rwxr-xr-x', owner: 'root', group: 'root', date: 'Oct 30 20:00', size: 38000 },
            neofetch: { type: 'file', executable: true, perm: 'rwxr-xr-x', owner: 'root', group: 'root', date: 'Oct 30 20:00', size: 128000 },
            uptime: { type: 'file', executable: true, perm: 'rwxr-xr-x', owner: 'root', group: 'root', date: 'Oct 30 20:00', size: 41000 },
            top: { type: 'file', executable: true, perm: 'rwxr-xr-x', owner: 'root', group: 'root', date: 'Oct 30 20:00', size: 185000 },
            curl: { type: 'file', executable: true, perm: 'rwxr-xr-x', owner: 'root', group: 'root', date: 'Oct 30 20:00', size: 290000 },
            synth: { type: 'file', executable: true, perm: 'rwxr-xr-x', owner: 'root', group: 'root', date: 'Oct 30 20:00', size: 15000 },
            clear: { type: 'file', executable: true, perm: 'rwxr-xr-x', owner: 'root', group: 'root', date: 'Oct 30 20:00', size: 24000 }
          }
        },
        var: {
          type: 'dir',
          perm: 'rwxr-xr-x',
          owner: 'root',
          group: 'root',
          date: 'Oct 30 20:00',
          children: {
            log: {
              type: 'dir',
              perm: 'rwxr-xr-x',
              owner: 'root',
              group: 'root',
              date: 'Oct 30 20:00',
              children: {
                syslog: {
                  type: 'file',
                  perm: 'rw-r-----',
                  owner: 'root',
                  group: 'adm',
                  date: 'Oct 30 20:25',
                  size: 4210,
                  content: `Oct 30 20:21:00 zathu-box kernel: [    0.000000] Linux version 6.11.0-zathu-amd64
Oct 30 20:21:01 zathu-box systemd[1]: Started Audio Subsystem (44.1kHz 24-bit).
Oct 30 20:21:02 zathu-box zathu-daemon[289]: Oscilloscope engine ready.
Oct 30 20:21:05 zathu-box lan-beacon[420]: Subnet broadcast initialized.`
                }
              }
            }
          }
        }
      }
    };

    // State
    let cwd = ['home', 'cgarst'];
    let prevCwd = ['home', 'cgarst'];

    function getDisplayPath(pathArr = cwd) {
      if (pathArr.length === 2 && pathArr[0] === 'home' && pathArr[1] === 'cgarst') {
        return '~';
      }
      if (pathArr.length > 2 && pathArr[0] === 'home' && pathArr[1] === 'cgarst') {
        return '~/' + pathArr.slice(2).join('/');
      }
      if (pathArr.length === 0) {
        return '/';
      }
      return '/' + pathArr.join('/');
    }

    function updatePrompt() {
      if (termPromptPrefix) {
        termPromptPrefix.innerHTML = `<span class="term-green">cgarst@zathu-box</span>:<span class="term-amber">${getDisplayPath()}</span>$ `;
      }
    }

    function appendLine(html) {
      const line = document.createElement('div');
      line.className = 'terminal-line';
      line.innerHTML = html;
      termOutput.appendChild(line);
      termBody.scrollTop = termBody.scrollHeight;
    }

    // Path normalization: resolves relative paths, '~', '..', '.', and '/'
    function resolvePath(targetStr) {
      if (!targetStr || targetStr === '.') return [...cwd];
      if (targetStr === '~') return ['home', 'cgarst'];
      if (targetStr === '-') return [...prevCwd];

      let parts = [];
      if (targetStr.startsWith('~/')) {
        parts = ['home', 'cgarst', ...targetStr.slice(2).split('/')];
      } else if (targetStr.startsWith('/')) {
        parts = targetStr.split('/');
      } else {
        parts = [...cwd, ...targetStr.split('/')];
      }

      const result = [];
      for (const segment of parts) {
        if (!segment || segment === '.') continue;
        if (segment === '..') {
          if (result.length > 0) result.pop();
        } else {
          result.push(segment);
        }
      }
      return result;
    }

    function getNode(pathArr) {
      let current = vfs;
      let parent = null;
      let name = '';

      for (let i = 0; i < pathArr.length; i++) {
        const seg = pathArr[i];
        if (!current.children || !current.children[seg]) {
          return null;
        }
        parent = current;
        name = seg;
        current = current.children[seg];
      }
      return { node: current, parent, name };
    }

    function makeLink(url, text) {
      return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="term-cyan" style="text-decoration: underline;">${text || url}</a>`;
    }

    function linkifyText(text) {
      return text.replace(/(https?:\/\/[^\s]+)/g, (url) => makeLink(url, url));
    }

    function formatFileSize(bytes = 0) {
      if (bytes < 1024) return bytes + 'B';
      return (bytes / 1024).toFixed(1) + 'K';
    }

    // LINUX COMMAND PROCESSOR
    function processCommand(rawInput) {
      const trimmed = rawInput.trim();
      if (!trimmed) return;

      state.commandHistory.push(rawInput);
      state.historyIndex = state.commandHistory.length;

      // Echo command line
      const currentPrompt = `<span class="term-green">cgarst@zathu-box</span>:<span class="term-amber">${getDisplayPath()}</span>$ `;
      appendLine(`${currentPrompt}<span class="term-white">${escapeHtml(rawInput)}</span>`);

      // Parse tokens
      const tokens = trimmed.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
      const cleanTokens = tokens.map((t) => t.replace(/^["']|["']$/g, ''));
      const cmd = cleanTokens[0].toLowerCase();
      const args = cleanTokens.slice(1);

      playClickBlip('blip');

      // 1. Direct Executables (./synth.sh, ./gamestream_launchpad.py, etc.)
      if (cmd.startsWith('./') || cmd.endsWith('.sh') || cmd.endsWith('.py') || cmd.endsWith('.bat')) {
        const cleanCmd = cmd.replace(/^\.\//, '');
        if (cleanCmd === 'synth.sh' || cleanCmd === 'synth') {
          playArpeggio();
          appendLine(`<span class="term-cyan">[OK] synth.sh executed. 8-bit chiptune arpeggiator fired!</span>`);
          return;
        }
        if (cleanCmd.includes('gamestream_launchpad')) {
          appendLine(`<span class="term-cyan">[*] Launching gamestream_launchpad (Moonlight / PC Games)...</span>\n<span class="term-green">[+] 390+ Star launcher active. Handheld stream initialized.</span>`);
          return;
        }
        if (cleanCmd.includes('cod4')) {
          appendLine(`<span class="term-amber">[*] Starting Call of Duty 4 Dedicated Server on 0.0.0.0:28960...</span>\n<span class="term-green">[+] Subnet broadcast beacon active.</span>`);
          return;
        }
        if (cleanCmd.includes('quake3')) {
          appendLine(`<span class="term-magenta">[*] Launching Quake III Arena dedicated host...</span>\n<span class="term-green">[+] Map: q3dm17 (The Longest Yard) // UDP 27960 ready.</span>`);
          return;
        }
      }

      // 2. Standard Linux Commands
      switch (cmd) {
        case 'pwd': {
          appendLine(`<span class="term-file">${'/' + cwd.join('/')}</span>`);
          break;
        }

        case 'cd': {
          const target = args[0] || '~';
          const resolved = resolvePath(target);
          const targetObj = getNode(resolved);

          if (!targetObj) {
            appendLine(`<span class="term-amber">bash: cd: ${escapeHtml(target)}: No such file or directory</span>`);
          } else if (targetObj.node.type !== 'dir') {
            appendLine(`<span class="term-amber">bash: cd: ${escapeHtml(target)}: Not a directory</span>`);
          } else {
            prevCwd = [...cwd];
            cwd = resolved;
            updatePrompt();
          }
          break;
        }

        case 'ls': {
          let showAll = false;
          let longFormat = false;
          let targetPath = null;

          for (const arg of args) {
            if (arg.startsWith('-')) {
              if (arg.includes('a')) showAll = true;
              if (arg.includes('l')) longFormat = true;
            } else if (!targetPath) {
              targetPath = arg;
            }
          }

          const resolved = resolvePath(targetPath);
          const targetObj = getNode(resolved);

          if (!targetObj) {
            appendLine(`<span class="term-amber">ls: cannot access '${escapeHtml(targetPath)}': No such file or directory</span>`);
            break;
          }

          if (targetObj.node.type === 'file') {
            appendLine(`<span class="${targetObj.node.executable ? 'term-exe' : 'term-file'}">${targetObj.name}</span>`);
            break;
          }

          const children = targetObj.node.children || {};
          let entries = Object.keys(children);

          if (showAll) {
            entries = ['.', '..', ...entries];
          } else {
            entries = entries.filter((name) => !name.startsWith('.'));
          }

          entries.sort((a, b) => {
            if (a === '.' || a === '..') return -1;
            if (b === '.' || b === '..') return 1;
            return a.localeCompare(b);
          });

          if (longFormat) {
            let outputLines = [`<span class="term-dim">total ${entries.length * 4}</span>`];
            for (const name of entries) {
              let itemNode = null;
              if (name === '.') itemNode = targetObj.node;
              else if (name === '..') itemNode = targetObj.parent || targetObj.node;
              else itemNode = children[name];

              const isDir = itemNode.type === 'dir';
              const isExe = itemNode.executable;
              const perm = itemNode.perm || (isDir ? 'drwxr-xr-x' : isExe ? '-rwxr-xr-x' : '-rw-r--r--');
              const owner = itemNode.owner || 'cgarst';
              const group = itemNode.group || 'zathu';
              const size = (itemNode.size ? formatFileSize(itemNode.size) : isDir ? '4.0K' : '1.2K').padStart(6, ' ');
              const date = itemNode.date || 'Oct 30 20:25';

              let coloredName = `<span class="term-file">${name}</span>`;
              if (isDir) coloredName = `<span class="term-dir">${name}/</span>`;
              else if (isExe) coloredName = `<span class="term-exe">${name}*</span>`;

              outputLines.push(`<span class="term-perm">${perm}</span> <span class="term-dim">1</span> <span class="term-green">${owner}</span> <span class="term-cyan">${group}</span> <span class="term-amber">${size}</span> <span class="term-dim">${date}</span> ${coloredName}`);
            }
            appendLine(outputLines.join('<br>'));
          } else {
            // Short multi-column format
            const formattedEntries = entries.map((name) => {
              const item = name === '.' ? targetObj.node : name === '..' ? (targetObj.parent || targetObj.node) : children[name];
              if (item.type === 'dir') return `<span class="term-dir">${name}/</span>`;
              if (item.executable) return `<span class="term-exe">${name}*</span>`;
              return `<span class="term-file">${name}</span>`;
            });
            appendLine(formattedEntries.join('&nbsp;&nbsp;&nbsp;&nbsp;'));
          }
          break;
        }

        case 'cat': {
          if (args.length === 0) {
            appendLine(`<span class="term-amber">cat: missing file operand</span>`);
            break;
          }
          for (const target of args) {
            const resolved = resolvePath(target);
            const targetObj = getNode(resolved);

            if (!targetObj) {
              appendLine(`<span class="term-amber">cat: ${escapeHtml(target)}: No such file or directory</span>`);
            } else if (targetObj.node.type === 'dir') {
              appendLine(`<span class="term-amber">cat: ${escapeHtml(target)}: Is a directory</span>`);
            } else {
              const content = targetObj.node.content || '';
              appendLine(`<div style="white-space: pre-wrap; font-family: var(--font-mono);">${linkifyText(escapeHtml(content))}</div>`);
            }
          }
          break;
        }

        case 'mkdir': {
          if (args.length === 0) {
            appendLine(`<span class="term-amber">mkdir: missing operand</span>`);
            break;
          }
          const targetDir = args[args.length - 1];
          const resolved = resolvePath(targetDir);
          const dirName = resolved[resolved.length - 1];
          const parentPath = resolved.slice(0, -1);
          const parentObj = getNode(parentPath);

          if (!parentObj || parentObj.node.type !== 'dir') {
            appendLine(`<span class="term-amber">mkdir: cannot create directory '${escapeHtml(targetDir)}': No such file or directory</span>`);
          } else {
            parentObj.node.children = parentObj.node.children || {};
            parentObj.node.children[dirName] = {
              type: 'dir',
              perm: 'rwxr-xr-x',
              owner: 'cgarst',
              group: 'zathu',
              date: 'Oct 30 20:45',
              children: {}
            };
            appendLine(`<span class="term-green">[OK] Directory created: ${escapeHtml(dirName)}</span>`);
          }
          break;
        }

        case 'touch': {
          if (args.length === 0) {
            appendLine(`<span class="term-amber">touch: missing file operand</span>`);
            break;
          }
          const fileName = args[0];
          const resolved = resolvePath(fileName);
          const name = resolved[resolved.length - 1];
          const parentPath = resolved.slice(0, -1);
          const parentObj = getNode(parentPath);

          if (!parentObj || parentObj.node.type !== 'dir') {
            appendLine(`<span class="term-amber">touch: cannot touch '${escapeHtml(fileName)}': No such file or directory</span>`);
          } else {
            parentObj.node.children = parentObj.node.children || {};
            parentObj.node.children[name] = {
              type: 'file',
              perm: 'rw-r--r--',
              owner: 'cgarst',
              group: 'zathu',
              date: 'Oct 30 20:45',
              size: 0,
              content: ''
            };
          }
          break;
        }

        case 'rm': {
          if (args.length === 0) {
            appendLine(`<span class="term-amber">rm: missing operand</span>`);
            break;
          }
          const isRecursive = args.includes('-r') || args.includes('-rf') || args.includes('-fr');
          const target = args.find((a) => !a.startsWith('-'));
          if (!target) break;

          const resolved = resolvePath(target);
          const name = resolved[resolved.length - 1];
          const parentPath = resolved.slice(0, -1);
          const parentObj = getNode(parentPath);
          const targetObj = getNode(resolved);

          if (!targetObj) {
            appendLine(`<span class="term-amber">rm: cannot remove '${escapeHtml(target)}': No such file or directory</span>`);
          } else if (targetObj.node.type === 'dir' && !isRecursive) {
            appendLine(`<span class="term-amber">rm: cannot remove '${escapeHtml(target)}': Is a directory (use -r)</span>`);
          } else {
            delete parentObj.node.children[name];
            appendLine(`<span class="term-green">Removed '${escapeHtml(name)}'</span>`);
          }
          break;
        }

        case 'echo': {
          let text = args.join(' ');
          text = text
            .replace(/\$USER/g, 'cgarst')
            .replace(/\$HOME/g, '/home/cgarst')
            .replace(/\$SHELL/g, '/bin/zsh')
            .replace(/\$PWD/g, '/' + cwd.join('/'))
            .replace(/\$HOSTNAME/g, 'zathu-box');
          appendLine(`<span>${escapeHtml(text)}</span>`);
          break;
        }

        case 'uname': {
          if (args.includes('-a')) {
            appendLine(`<span class="term-cyan">Linux zathu-box 6.11.0-zathu-amd64 #1 SMP PREEMPT_DYNAMIC GNU/Linux x86_64</span>`);
          } else if (args.includes('-r')) {
            appendLine(`<span class="term-cyan">6.11.0-zathu-amd64</span>`);
          } else {
            appendLine(`<span class="term-cyan">Linux</span>`);
          }
          break;
        }

        case 'whoami': {
          appendLine(`<span class="term-green">cgarst</span>`);
          break;
        }

        case 'hostname': {
          appendLine(`<span class="term-green">zathu-box</span>`);
          break;
        }

        case 'date': {
          appendLine(`<span class="term-cyan">${new Date().toString()}</span>`);
          break;
        }

        case 'uptime': {
          appendLine(`<span class="term-cyan"> 20:45:00 up 42 days, 13:37,  1 user,  load average: 0.08, 0.04, 0.01</span>`);
          break;
        }

        case 'top':
        case 'htop':
        case 'ps': {
          appendLine(`
<span class="term-dim">PID   USER     %CPU %MEM   TIME+  COMMAND</span>
<span class="term-file">  1   root      0.0  0.1   0:02   /sbin/init</span>
<span class="term-file">142   cgarst    0.2  0.5   1:15   zsh</span>
<span class="term-cyan">289   cgarst    2.4  3.2   4:30   oscilloscope.daemon</span>
<span class="term-magenta">312   cgarst    1.1  2.1   2:12   webaudio-synth</span>
<span class="term-green">420   cgarst    0.0  0.4   0:45   lan-beacon-cod4</span>
<span class="term-amber">777   cgarst    0.1  0.2   0:10   majestictab-jam-sync</span>`);
          break;
        }

        case 'neofetch':
        case 'fastfetch': {
          appendLine(`
<div class="term-neofetch">
<div class="term-ascii">
        ___        
       /  /\\       
      /  /::\\      
     /  /:/\\:\\     
    /  /:/  \\:\\    
   /__/:/ \\__\\:|   
   \\  \\:\\ /  /:/   
    \\  \\:\\  /:/    
     \\  \\:\\/:/     
      \\  \\::/      
       \\__\\/       
</div>
<div class="term-sysinfo">
<span class="term-cyan" style="font-weight: 700;">cgarst</span><span class="term-dim">@</span><span class="term-green" style="font-weight: 700;">zathu-box</span>
<span class="term-dim">------------------------</span><br>
<span class="term-amber">OS:</span> ZathuOS 2.4 LTS x86_64<br>
<span class="term-amber">Host:</span> Indie Dev &bull; Cyber-Audio Rig<br>
<span class="term-amber">Kernel:</span> 6.11.0-zathu-amd64<br>
<span class="term-amber">Uptime:</span> 42 days, 13 hours<br>
<span class="term-amber">Shell:</span> zsh 5.9<br>
<span class="term-amber">Flagships:</span> MajesticTab, Setlore<br>
<span class="term-amber">Audio:</span> Web Audio API (44.1kHz 24-bit)<br>
<span class="term-amber">LAN Suite:</span> CoD4, WaW, Quake 3, Halo<br>
<span class="term-amber">GitHub:</span> <a href="https://github.com/cgarst" target="_blank" class="term-cyan">https://github.com/cgarst</a>
</div>
</div>`);
          break;
        }

        case 'curl': {
          const url = args[0] || '';
          if (!url) {
            appendLine(`<span class="term-amber">curl: try 'curl --help' or provide a URL</span>`);
          } else if (url.includes('majestictab')) {
            appendLine(`<span class="term-cyan">HTTP/2 200 OK\nServer: GitHub.com\nContent-Type: text/html\nTitle: MajesticTab - Free Guitar Tab Reader and Practice App</span>`);
          } else if (url.includes('setlore')) {
            appendLine(`<span class="term-cyan">HTTP/2 200 OK\nServer: Cloudflare\nContent-Type: text/html\nTitle: Setlore - Self-Hosted Live Concert & Setlist Analytics</span>`);
          } else if (url.includes('ifconfig')) {
            appendLine(`<span class="term-green">192.168.1.249</span>`);
          } else {
            appendLine(`<span class="term-cyan">HTTP/2 200 OK\nContent-Type: application/json\n{"status":"online","node":"zathu-box","carrier":"44.1kHz"}</span>`);
          }
          break;
        }

        case 'git': {
          const sub = args[0];
          if (sub === 'status') {
            appendLine(`<span class="term-green">On branch main\nYour branch is up to date with 'origin/main'.\nnothing to commit, working tree clean</span>`);
          } else if (sub === 'branch') {
            appendLine(`<span class="term-green">* main</span>`);
          } else if (sub === 'log') {
            appendLine(`<span class="term-amber">commit 9da3c9a8 (HEAD -> main)</span>\nAuthor: cgarst &lt;cgarst@zathu.net&gt;\nDate:   Fri Oct 30 20:26:00 2026 -0400\n\n    Initial commit: Flashy brand new website for Zathu Software`);
          } else if (sub === 'clone') {
            appendLine(`<span class="term-cyan">Cloning into '${escapeHtml(args[1] || 'repo')}'...\nremote: Enumerating objects: 100%, done.\nResolving deltas: 100%, done.</span>`);
          } else {
            appendLine(`<span class="term-muted">git commands supported: git status, git log, git branch, git clone</span>`);
          }
          break;
        }

        case 'sudo': {
          appendLine(`<span class="term-amber">[sudo] password for cgarst: </span>`);
          setTimeout(() => {
            appendLine(`<span class="term-amber">cgarst is not in the sudoers file. This incident will be reported.</span>`);
          }, 400);
          break;
        }

        case 'synth': {
          playArpeggio();
          appendLine(`<span class="term-cyan">&gt; Arpeggiator fired! Synthesizer output active.</span>`);
          break;
        }

        case 'key': {
          if (args.length >= 1) {
            const keyArg = args[0].toUpperCase();
            if (ROOT_KEYS[keyArg]) {
              window.setKey(keyArg);
              appendLine(`<span class="term-green">[OK] Synthesizer root key set to: ${keyArg}.</span>`);
            } else {
              appendLine(`<span class="term-red">Unknown key '${args[0]}'. Available keys: C, C#, D, D#, E, F, F#, G, G#, A, A#, B</span>`);
            }
          } else {
            appendLine(`<span class="term-cyan">Active Root Key:</span> <span class="term-green">${state.rootNote}</span> (Usage: <span class="term-amber">key [note]</span>)`);
          }
          break;
        }

        case 'scale':
        case 'mode': {
          if (args.length >= 2) {
            const keyArg = args[0].toUpperCase();
            const modeArg = args[1].toLowerCase();
            const targetMode = modeArg === 'pentatonic' ? 'minor_pentatonic' : (modeArg === 'aeolian' ? 'minor' : (modeArg === 'ionian' ? 'major' : modeArg));
            if (ROOT_KEYS[keyArg] && MODES[targetMode]) {
              window.setKeyAndMode(keyArg, targetMode);
              appendLine(`<span class="term-green">[OK] Synthesizer tuned to Key of ${state.rootNote} ${MODES[state.currentMode].name}.</span>`);
            } else {
              appendLine(`<span class="term-red">Invalid key or mode. Usage: scale [key] [mode] (e.g. scale A harmonic_minor)</span>`);
            }
          } else if (args.length === 1) {
            const arg = args[0];
            const upper = arg.toUpperCase();
            const lower = arg.toLowerCase();
            const targetMode = lower === 'pentatonic' ? 'minor_pentatonic' : (lower === 'aeolian' ? 'minor' : (lower === 'ionian' ? 'major' : lower));
            if (ROOT_KEYS[upper]) {
              window.setKey(upper);
              appendLine(`<span class="term-green">[OK] Synthesizer root key set to: ${upper}.</span>`);
            } else if (MODES[targetMode]) {
              window.setEMode(targetMode);
              appendLine(`<span class="term-green">[OK] Synthesizer tuned to: Key of ${state.rootNote} ${MODES[state.currentMode].name}.</span>`);
            } else {
              appendLine(`<span class="term-red">Unknown key or mode '${arg}'.</span>`);
            }
          } else {
            appendLine(`
<span class="term-cyan">=== CHROMATIC KEYS &amp; MODES SYSTEM ===</span>
Active Tuning: <span class="term-green">Key of ${state.rootNote} &bull; ${MODES[state.currentMode].name}</span>
Available Keys:
  &bull; <span class="term-green">C</span> &bull; <span class="term-green">C#</span> &bull; <span class="term-green">D</span> &bull; <span class="term-green">D#</span> &bull; <span class="term-green">E</span> &bull; <span class="term-green">F</span> &bull; <span class="term-green">F#</span> &bull; <span class="term-green">G</span> &bull; <span class="term-green">G#</span> &bull; <span class="term-green">A</span> &bull; <span class="term-green">A#</span> &bull; <span class="term-green">B</span>
Available Modes:
  &bull; <span class="term-green">minor</span> (Natural Minor / Aeolian)
  &bull; <span class="term-green">harmonic_minor</span> (Harmonic Minor)
  &bull; <span class="term-green">minor_pentatonic</span> (Minor Pentatonic)
  &bull; <span class="term-green">dorian</span> (Dorian)
  &bull; <span class="term-green">phrygian</span> (Phrygian)
  &bull; <span class="term-green">lydian</span> (Lydian - #4)
  &bull; <span class="term-green">mixolydian</span> (Mixolydian)
  &bull; <span class="term-green">major</span> (Major / Ionian)
Usage: <span class="term-amber">scale [key] [mode]</span> (e.g. <span class="term-cyan">scale A harmonic_minor</span> or <span class="term-cyan">mode lydian</span> or <span class="term-cyan">key D</span>)`);
          }
          break;
        }

        case 'theme': {
          appendLine(`<span class="term-cyan">&gt; CRT Phosphor display is permanently active on the oscilloscope tube.</span>`);
          break;
        }

        case 'projects': {
          appendLine(`
<span class="term-cyan">=== ZATHU SOFTWARE FLAGSHIP REPOSITORIES ===</span>
&bull; <a href="https://majestictab.zathu.net/" target="_blank" class="term-green">MajesticTab</a>: Focused guitar tab reader & practice studio (<a href="https://github.com/cgarst/MajesticTab" target="_blank" class="term-muted">GitHub</a>)
&bull; <a href="https://setlore.zathu.net/" target="_blank" class="term-magenta">Setlore</a>: Self-hosted live concert & setlist analytics
&bull; <a href="https://github.com/cgarst/random-album-for-youtube-music" target="_blank" class="term-amber">Random Album for YT Music</a>: Album-oriented shuffle tool
&bull; <a href="https://github.com/cgarst/gamestream_launchpad" target="_blank" class="term-cyan">gamestream_launchpad</a>: Optimized PC game launcher (390+ stars)
&bull; <a href="#lan-vault" class="term-green">LAN Party Scripts</a>: Call of Duty 4, COD: WaW, Quake 3, Halo Reclaimer
Tip: Use <span class="term-green">cd projects</span> and <span class="term-green">ls -la</span> to inspect in filesystem!`);
          break;
        }

        case 'lan': {
          appendLine(`
<span class="term-amber">=== LAN PARTY REPOSITORIES ===</span>
1. <span class="term-green">lanscript-cod4</span>   : Call of Duty 4 LAN party orchestration
   git clone https://github.com/cgarst/lanscript-cod4.git
2. <span class="term-green">lanscript-cod5</span>   : COD5: World at War LAN coop & multiplayer
   git clone https://github.com/cgarst/lanscript-cod5.git
3. <span class="term-green">lanscript-quake3</span> : Quake III Arena instant zero-config dedicated host
   git clone https://github.com/cgarst/lanscript-quake3.git
4. <span class="term-green">reclaimer-lan</span>    : Project Reclaimer Halo LAN scripts
   git clone https://github.com/cgarst/reclaimer-lan.git
Browse all: <a href="https://github.com/cgarst?tab=repositories" target="_blank" class="term-cyan">https://github.com/cgarst?tab=repositories</a>`);
          break;
        }

        case 'music': {
          appendLine(`
<span class="term-cyan">=== MUSICIAN WORKBENCH TOOLS ===</span>
1. <a href="https://majestictab.zathu.net/" target="_blank" class="term-green">MajesticTab</a>: Guitar Pro tab practice workstation.
2. <a href="https://setlore.zathu.net/" target="_blank" class="term-magenta">Setlore</a>: Tour and live performance analytics.
3. <a href="https://github.com/cgarst/random-album-for-youtube-music" target="_blank" class="term-amber">Random Album for YT Music</a>: Album listener shuffle.
Tip: Press keys 1 through 6 on your keyboard right now to play guitar notes!`);
          break;
        }

        case 'majestictab': {
          appendLine(`
<span class="term-cyan">[MAJESTICTAB]</span>
Focused guitar tab viewer supporting Guitar Pro, PDF, & text tabs.
Features: Multi-track audio engine, virtual fretboard, Jam Mode over local network.
Live App: <a href="https://majestictab.zathu.net/" target="_blank" class="term-green">https://majestictab.zathu.net/</a>
Source: <a href="https://github.com/cgarst/MajesticTab" target="_blank" class="term-muted">https://github.com/cgarst/MajesticTab</a>`);
          break;
        }

        case 'setlore': {
          appendLine(`
<span class="term-magenta">[SETLORE]</span>
Self-hosted live concert & tour setlist analytics.
Track tour debuts, venue maps, and historical setlist trends.
Live App: <a href="https://setlore.zathu.net/" target="_blank" class="term-cyan">https://setlore.zathu.net/</a>`);
          break;
        }

        case 'linkedin': {
          window.open('https://www.linkedin.com/in/coreygarst/', '_blank');
          appendLine(`<span class="term-green">&gt; Opening LinkedIn: <a href="https://www.linkedin.com/in/coreygarst/" target="_blank" class="term-cyan">https://www.linkedin.com/in/coreygarst/</a></span>`);
          break;
        }

        case 'contact': {
          appendLine(`
<span class="term-cyan">Corey Garst (cgarst)</span>
&bull; LinkedIn: <a href="https://www.linkedin.com/in/coreygarst/" target="_blank" class="term-green">https://www.linkedin.com/in/coreygarst/</a>
&bull; GitHub:   <a href="https://github.com/cgarst/" target="_blank" class="term-green">https://github.com/cgarst/</a>`);
          break;
        }

        case 'clear': {
          termOutput.innerHTML = '';
          return;
        }

        case 'history': {
          const lines = state.commandHistory.map((c, i) => `<span class="term-dim">${(i + 1).toString().padStart(3, ' ')}</span>  ${escapeHtml(c)}`);
          appendLine(lines.join('<br>'));
          break;
        }

        case 'help': {
          appendLine(`
<span class="term-cyan">ZATHU LINUX TERMINAL (zsh emulation) - SUPPORTED CORE COMMANDS:</span>
  <span class="term-green">ls [-la] [dir]</span>  - List directory contents (supports colored directories & permissions)
  <span class="term-green">cd [dir]</span>        - Change working directory (~, .., relative, and absolute paths)
  <span class="term-green">pwd</span>             - Print current working directory
  <span class="term-green">cat &lt;file&gt;</span>      - Display file contents
  <span class="term-green">mkdir &lt;dir&gt;</span>     - Create a directory in memory
  <span class="term-green">touch &lt;file&gt;</span>    - Create an empty file in memory
  <span class="term-green">rm [-r] &lt;path&gt;</span>  - Remove file or directory
  <span class="term-green">neofetch</span>        - System telemetry & ASCII logo
  <span class="term-green">top / ps</span>        - Display active system processes
  <span class="term-green">uname [-a]</span>      - Print kernel and architecture information
  <span class="term-green">whoami / host</span>   - Display user name and host info
  <span class="term-green">uptime / date</span>   - System uptime and current timestamp
  <span class="term-green">curl &lt;url&gt;</span>      - Query URL headers and telemetry
  <span class="term-green">git &lt;cmd&gt;</span>       - git status / log / branch / clone
  <span class="term-green">synth</span>           - Trigger Web Audio synthesizer arpeggio
  <span class="term-green">key [note]</span>      - Tune synth root key (e.g. key E, key A, key C)
  <span class="term-green">scale [k] [m]</span>   - Tune scale & mode (e.g. scale E harmonic_minor)
  <span class="term-green">clear</span>           - Clear terminal screen
  <span class="term-green">history</span>         - Display session command history
  <span class="term-amber">[TAB]</span>           - Autocomplete file paths and commands`);
          break;
        }

        default: {
          appendLine(`<span class="term-amber">bash: ${escapeHtml(cmd)}: command not found. Type '<span class="term-cyan">help</span>' or '<span class="term-green">ls</span>'.</span>`);
          break;
        }
      }
    }

    function escapeHtml(str) {
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // TAB AUTOCOMPLETION
    function handleTabCompletion() {
      const inputVal = termInput.value;
      const parts = inputVal.split(' ');
      const lastToken = parts[parts.length - 1];

      const builtinCommands = [
        'ls', 'pwd', 'cd', 'cat', 'mkdir', 'touch', 'rm', 'echo',
        'uname', 'whoami', 'hostname', 'date', 'uptime', 'top', 'ps',
        'neofetch', 'curl', 'git', 'synth', 'theme', 'clear', 'history',
        'help', 'projects', 'lan', 'music', 'majestictab', 'setlore'
      ];

      // If at command position
      if (parts.length === 1) {
        const matches = builtinCommands.filter((c) => c.startsWith(lastToken.toLowerCase()));
        if (matches.length === 1) {
          termInput.value = matches[0] + ' ';
          playClickBlip('high');
        } else if (matches.length > 1) {
          appendLine(`<span class="term-dim">${matches.join('  ')}</span>`);
        }
        return;
      }

      // If completing a file or directory
      const targetObj = getNode(cwd);
      if (!targetObj || !targetObj.node.children) return;

      const candidates = Object.keys(targetObj.node.children);
      const matches = candidates.filter((name) => name.toLowerCase().startsWith(lastToken.toLowerCase()));

      if (matches.length === 1) {
        const matchedName = matches[0];
        const isDir = targetObj.node.children[matchedName].type === 'dir';
        parts[parts.length - 1] = matchedName + (isDir ? '/' : ' ');
        termInput.value = parts.join(' ');
        playClickBlip('high');
      } else if (matches.length > 1) {
        const formatted = matches.map((m) => {
          const isDir = targetObj.node.children[m].type === 'dir';
          return isDir ? `<span class="term-dir">${m}/</span>` : `<span class="term-file">${m}</span>`;
        });
        appendLine(formatted.join('&nbsp;&nbsp;&nbsp;&nbsp;'));
      }
    }

    // Keydown listeners
    termInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const raw = termInput.value;
        processCommand(raw);
        termInput.value = '';
      } else if (e.key === 'Tab') {
        e.preventDefault();
        handleTabCompletion();
      } else if (e.key === 'ArrowUp') {
        if (state.historyIndex > 0) {
          state.historyIndex--;
          termInput.value = state.commandHistory[state.historyIndex] || '';
        }
      } else if (e.key === 'ArrowDown') {
        if (state.historyIndex < state.commandHistory.length - 1) {
          state.historyIndex++;
          termInput.value = state.commandHistory[state.historyIndex] || '';
        } else {
          state.historyIndex = state.commandHistory.length;
          termInput.value = '';
        }
      }
    });

    // Make suggestion pills clickable
    document.querySelectorAll('.term-cmd-pill').forEach((pill) => {
      pill.addEventListener('click', () => {
        const cmd = pill.getAttribute('data-cmd');
        termInput.value = cmd;
        processCommand(cmd);
        termInput.value = '';
        termInput.focus();
      });
    });

    // Initialize prompt display
    updatePrompt();
  }

  /* ==========================================================================
     INIT ON DOM READY
     ========================================================================== */
  document.addEventListener('DOMContentLoaded', () => {
    initOscilloscope();
    initEModeSynth();
    initHardwareToggles();
    initLanTabs();
    initTerminal();
  });
})();
