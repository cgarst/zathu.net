/**
 * ZATHU SOFTWARE - INTERACTIVE CYBER-AUDIO ENGINE & TERMINAL
 * Open tools with the features we couldn't find anywhere else.
 */

(function () {
  'use strict';

  // iOS Safari ignores user-scalable=no, so block pinch via gesture events
  // (double-tap zoom is handled by touch-action in the CSS).
  ['gesturestart', 'gesturechange', 'gestureend'].forEach((t) => {
    document.addEventListener(t, (e) => e.preventDefault());
  });

  // State Management
  const state = {
    audioEnabled: true,
    currentWaveform: 'sine',
    rootNote: 'E',
    rootMidi: 52, // E3 (164.81 Hz)
    currentMode: 'minor',
    arpMode: false,
    hold: false,
    arpNotes: 4,      // notes in the arpeggio (before it turns around)
    arpEnd: 'octave', // 'octave' (ends on the octave, spread through it) or 'linear' (keeps climbing in thirds)
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

  // Musical Modes & Scales (Ordered: Natural Minor, Harmonic Minor, Minor Pent, Major, Modes)
  const MODES = {
    'minor': {
      name: 'Natural Minor (Aeolian)',
      intervals: [0, 2, 3, 5, 7, 8, 10, 12],
      degrees: ['1st', '2nd', 'b3', '4th', '5th', 'b6', 'b7', '8 (Oct)']
    },
    'harmonic_minor': {
      name: 'Harmonic Minor',
      intervals: [0, 2, 3, 5, 7, 8, 11, 12],
      degrees: ['1st', '2nd', 'b3', '4th', '5th', 'b6', '7th', '8 (Oct)']
    },
    'minor_pentatonic': {
      name: 'Minor Pentatonic',
      intervals: [0, 3, 5, 7, 10, 12],
      degrees: ['1st', 'b3', '4th', '5th', 'b7', '8 (Oct)']
    },
    'dorian': {
      name: 'Dorian',
      intervals: [0, 2, 3, 5, 7, 9, 10, 12],
      degrees: ['1st', '2nd', 'b3', '4th', '5th', '6th', 'b7', '8 (Oct)']
    },
    'phrygian': {
      name: 'Phrygian',
      intervals: [0, 1, 3, 5, 7, 8, 10, 12],
      degrees: ['1st', 'b2', 'b3', '4th', '5th', 'b6', 'b7', '8 (Oct)']
    },
    'lydian': {
      name: 'Lydian (#4)',
      intervals: [0, 2, 4, 6, 7, 9, 11, 12],
      degrees: ['1st', '2nd', '3rd', '#4', '5th', '6th', '7th', '8 (Oct)']
    },
    'mixolydian': {
      name: 'Mixolydian',
      intervals: [0, 2, 4, 5, 7, 9, 10, 12],
      degrees: ['1st', '2nd', '3rd', '4th', '5th', '6th', 'b7', '8 (Oct)']
    },
    'major': {
      name: 'Major (Ionian)',
      intervals: [0, 2, 4, 5, 7, 9, 11, 12],
      degrees: ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8 (Oct)']
    },
    'locrian': {
      name: 'Locrian',
      intervals: [0, 1, 3, 5, 6, 8, 10, 12],
      degrees: ['1st', 'b2', 'b3', '4th', 'b5', 'b6', 'b7', '8 (Oct)']
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
  const latchedRibbons = []; // ribbon voices kept sounding by HOLD

  // iOS routes Web Audio through the "ambient" category, which the ringer/silent
  // switch mutes. Declaring a "playback" session (Audio Session API, Safari 16.4+) or,
  // as a fallback, playing a silent looping <audio> element moves it to the media
  // channel so sound is heard in silent mode. Must run inside a user gesture.
  let silentAudioEl = null;
  function unlockSilentModeAudio() {
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

  function initAudioContext() {
    unlockSilentModeAudio();
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

  function routeVoice(outNode, ttlSeconds = null, waveType = null) {
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
      waveType: waveType || state.currentWaveform || 'sine', // fixed at creation, so it survives later wave changes
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

  function waveColorFor(type) {
    if (type === 'square') return '#10b981';
    if (type === 'sawtooth') return '#fbbf24';
    if (type === 'triangle') return '#c084fc';
    return '#00f0ff';
  }

  // Color of the summed trace: follows the waveform of the notes actually sounding,
  // so changing the waveform button doesn't recolor notes that are already held.
  function getSumWaveType() {
    if (!voiceTraces.length) return state.currentWaveform;
    const first = voiceTraces[0].waveType;
    return voiceTraces.every((t) => t.waveType === first) ? first : 'mixed';
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
      routeVoice(noteGain, duration + 0.1, type);

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

      // `rel` is a voice-level release stage kept apart from the note envelope, so letting go
      // never has to cancel an envelope that is mid-ramp (that jump is what clicked)
      const rel = audioCtx.createGain();
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
  const ARP_RUN_SECONDS = 0.52;
  const ARP_MIN_NOTES = 2;
  const ARP_MAX_NOTES = 8;

  function getScaleSteps(mode) {
    // Intervals include the octave (12) as their last entry, so one octave is length - 1 steps
    return Math.max(1, mode.intervals.length - 1);
  }

  function getArpMaxNotes(mode, end) {
    return end === 'octave' ? Math.min(ARP_MAX_NOTES, getScaleSteps(mode) + 1) : ARP_MAX_NOTES;
  }

  // Scale-degree offsets (from the pressed key) for the ascending half of the arpeggio
  function getArpOffsets(mode, count, end) {
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

  function getArpPattern(startIndex, modeKey = state.currentMode, rootMidi = state.rootMidi) {
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
  const arpVoices = new Set();
  let arpClockTimer = null;
  let arpOrigin = 0;
  const ARP_LOOKAHEAD = 0.12;

  function arpGridNext(t, stepSeconds) {
    return arpOrigin + Math.ceil((t - arpOrigin) / stepSeconds - 1e-9) * stepSeconds;
  }

  function scheduleArpStep(voice, t) {
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

  function arpClockTick() {
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
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

  function registerArpVoice(voice) {
    const now = audioCtx.currentTime;
    if (arpClockTimer === null) {
      arpOrigin = now + 0.02; // nothing else is playing: this arpeggio defines the grid
      arpClockTimer = setInterval(arpClockTick, 25);
    }
    voice.arp.nextTime = Math.max(arpGridNext(now + 0.005, voice.arp.stepSeconds), arpOrigin);
    arpVoices.add(voice);
    arpClockTick();
  }

  // Change an arpeggio's note count live: keep it on the shared grid at its new step length
  function retimeArpVoice(voice) {
    const arp = voice.arp;
    const from = Math.max(audioCtx.currentTime + 0.005, (arp.lastStepTime || 0) + 1e-6);
    arp.nextTime = arpGridNext(from, arp.stepSeconds);
  }

  function unregisterArpVoice(voice) {
    arpVoices.delete(voice);
    if (arpVoices.size === 0 && arpClockTimer !== null) {
      clearInterval(arpClockTimer);
      arpClockTimer = null;
    }
  }

  function startArpVoice(keyId, startIndex, el = null) {
    enableSound();
    if (!audioCtx || !masterGain) return;
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
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const filter = audioCtx.createBiquadFilter();

      osc.type = type;
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(arp.freqs[0] * 6, now);
      gain.gain.setValueAtTime(0.0001, now);

      // `rel` is a voice-level release stage kept apart from the note envelope, so letting go
      // never has to cancel an envelope that is mid-ramp (that jump is what clicked)
      const rel = audioCtx.createGain();
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
  const keyOwners = {};

  function releaseKey(keyId, source) {
    if (keyOwners[keyId] === source && activeKeyVoices[keyId]) {
      stopNoteVoice(keyId);
    }
  }

  // Start a held key in the current mode (plain note or arpeggio)
  function triggerKey(keyId, el, source = 'pointer') {
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
  function endVoice(voice) {
    if (!voice || !audioCtx) return;
    if (voice.isArp) unregisterArpVoice(voice);
    releaseVoiceTrace(voice.trace);

    try {
      const now = audioCtx.currentTime;
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

  function stopNoteVoice(keyId) {
    const voice = activeKeyVoices[keyId];
    if (!voice) return;
    delete activeKeyVoices[keyId];
    endVoice(voice);
  }

  function stopAllNoteVoices() {
    Object.keys(activeKeyVoices).forEach((id) => stopNoteVoice(id));
  }

  function freqToMidi(freq) {
    return Math.round(69 + 12 * Math.log2(freq / 440));
  }

  // Switch the waveform of everything currently being played (keys down, arpeggios, a scope drag).
  // Sounds frozen by HOLD keep the waveform they had.
  function applyWaveformToPlaying(type) {
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    const noteCutoff = { square: 3.5, sawtooth: 5.5, triangle: 4, sine: 8 };
    Object.keys(activeKeyVoices).forEach((id) => {
      const voice = activeKeyVoices[id];
      voice.osc.type = type;
      if (voice.trace) voice.trace.waveType = type; // scope color follows what is sounding
      if (!voice.isArp && voice.freq) {
        voice.filter.frequency.setValueAtTime(voice.freq * (noteCutoff[type] || 8), now);
      }
    });
    if (isRibbonPlaying && ribbonOsc) {
      ribbonOsc.type = type;
      if (ribbonTrace) ribbonTrace.waveType = type;
    }
  }

  // Re-shape every arpeggio that is being played (not HOLD-frozen) after the note count / end note changes
  function refreshPlayingArps(rescale = false) {
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
  function refreshHeldKeyStates() {
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
  const heldVoices = [];

  function captureHeldVoices() {
    Object.keys(activeKeyVoices).forEach((id) => {
      const voice = activeKeyVoices[id];
      delete activeKeyVoices[id];
      heldVoices.push(voice);
      if (voice.el) voice.el.classList.remove('key-pressed');
    });

    // A note being dragged on the scope is frozen at its current pitch
    if (isRibbonPlaying && ribbonOsc && ribbonGain) {
      latchedRibbons.push({ osc: ribbonOsc, gain: ribbonGain, trace: ribbonTrace, pitches: [freqToMidi(ribbonBaseFreq)] });
      ribbonTrace = null;
      isRibbonPlaying = false;
      ribbonActiveIndex = -1;
      ribbonTargetCents = 0;
      ribbonCurrentCents = 0;
      clearHighlightedKeys();
      resetScopeStatus();
    }
    refreshHeldKeyStates();
  }

  function releaseLatchedRibbons() {
    while (latchedRibbons.length) {
      const r = latchedRibbons.pop();
      try {
        const now = audioCtx.currentTime;
        releaseVoiceTrace(r.trace, 0.12);
        r.gain.gain.cancelScheduledValues(now);
        r.gain.gain.setValueAtTime(r.gain.gain.value, now);
        r.gain.gain.linearRampToValueAtTime(0.0001, now + 0.09);
        r.osc.stop(now + 0.11);
      } catch (e) {}
    }
  }

  // Turn HOLD off: release everything it was holding
  function releaseHeldVoices() {
    while (heldVoices.length) endVoice(heldVoices.pop());
    releaseLatchedRibbons();
    refreshHeldKeyStates();
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
      ribbonTrace = routeVoice(ribbonGain, null, ribbonOsc.type);

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
      pruneVoiceTraces();
      const sumWave = getSumWaveType();
      const waveColor = sumWave === 'mixed' ? '#e2e8f0' : waveColorFor(sumWave);

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
          <span class="synth-key-shortcut">[${shortcut}]</span>
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
        state.rootMidi = ROOT_KEYS[selectedKey] || 52;
        syncKeyButtons(selectedKey);
        btn.blur();
        renderNumberButtons();
      });
    });

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
        state.rootMidi = ROOT_KEYS[formatted];
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
          state.rootMidi = ROOT_KEYS[formatted];
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

  /* ==========================================================================
     HARDWARE TOGGLES & WAVEFORM SWITCHER
     ========================================================================== */
  function initHardwareToggles() {
    // Waveform switcher buttons
    const waveBtns = document.querySelectorAll('.scope-btn[data-wave]');
    waveBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        waveBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        state.currentWaveform = btn.getAttribute('data-wave');
        enableSound();
        applyWaveformToPlaying(state.currentWaveform);
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
