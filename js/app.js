/**
 * ZATHU SOFTWARE - INTERACTIVE CYBER-AUDIO ENGINE & TERMINAL
 * Handcrafted for musicians, hackers, and gamers.
 */

(function () {
  'use strict';

  // State Management
  const state = {
    audioEnabled: false,
    crtEnabled: false,
    currentWaveform: 'sine',
    commandHistory: [],
    historyIndex: -1,
  };

  // Audio Context (initialized on first user interaction)
  let audioCtx = null;

  function initAudioContext() {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  // Play a synthesized note (analog / guitar string style)
  function playSynthNote(freq, duration = 0.8, waveType = 'sawtooth') {
    if (!state.audioEnabled) return;
    initAudioContext();
    if (!audioCtx) return;

    try {
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      const filter = audioCtx.createBiquadFilter();

      // Configure oscillator
      osc.type = waveType;
      osc.frequency.setValueAtTime(freq, now);

      // Warm analog low-pass filter
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(freq * 4, now);
      filter.frequency.exponentialRampToValueAtTime(Math.max(freq, 200), now + duration);

      // Pluck / Synth Envelope
      gainNode.gain.setValueAtTime(0.001, now);
      gainNode.gain.linearRampToValueAtTime(0.28, now + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);

      // Connect graph
      osc.connect(filter);
      filter.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      osc.start(now);
      osc.stop(now + duration);

      // Trigger oscilloscope pulse
      if (window.triggerScopePulse) {
        window.triggerScopePulse(freq);
      }
    } catch (e) {
      console.warn('Audio playback error:', e);
    }
  }

  // UI Micro-click sound
  function playClickBlip(type = 'blip') {
    if (!state.audioEnabled) return;
    initAudioContext();
    if (!audioCtx) return;

    try {
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      if (type === 'blip') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(440, now + 0.06);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.06);
      } else if (type === 'high') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(1200, now);
        gain.gain.setValueAtTime(0.06, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.04);
      }
    } catch (e) {}
  }

  // Play an 8-bit chiptune arpeggio
  function playArpeggio() {
    initAudioContext();
    const notes = [261.63, 329.63, 392.0, 523.25, 659.25, 783.99]; // C major triad arpeggio
    notes.forEach((freq, idx) => {
      setTimeout(() => {
        playSynthNote(freq, 0.35, 'square');
      }, idx * 75);
    });
  }

  // Guitar Tuning Frequencies for the 6-String Jam Fretboard
  const GUITAR_STRINGS = [
    { note: 'E2', freq: 82.41, label: 'E (6th)' },
    { note: 'A2', freq: 110.0, label: 'A (5th)' },
    { note: 'D3', freq: 146.83, label: 'D (4th)' },
    { note: 'G3', freq: 196.0, label: 'G (3rd)' },
    { note: 'B3', freq: 246.94, label: 'B (2nd)' },
    { note: 'E4', freq: 329.63, label: 'e (1st)' }
  ];

  /* ==========================================================================
     OSCILLOSCOPE CANVAS VISUALIZER
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
    let frequencyMod = 0.025;
    let amplitudeMod = 45;
    let pulseFactor = 0;

    // Pulse trigger
    window.triggerScopePulse = function (freq) {
      pulseFactor = Math.min(60, freq * 0.15);
    };

    // Canvas Mouse Interaction
    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      frequencyMod = 0.01 + (x / width) * 0.06;
      amplitudeMod = 20 + ((height - y) / height) * 55;
    });

    canvas.addEventListener('mouseleave', () => {
      frequencyMod = 0.025;
      amplitudeMod = 45;
    });

    function drawGrid() {
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.06)';
      ctx.lineWidth = 1;

      // Vertical lines
      for (let x = 0; x < width; x += 30) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }

      // Horizontal lines
      for (let y = 0; y < height; y += 30) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Center crosshairs
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.16)';
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();
    }

    function render() {
      ctx.fillStyle = '#04070c';
      ctx.fillRect(0, 0, width, height);

      drawGrid();

      // Render glowing wave
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#00f0ff';
      ctx.shadowBlur = 12;
      ctx.shadowColor = '#00f0ff';

      ctx.beginPath();

      const centerY = height / 2;
      const totalPoints = width;
      const currentAmp = amplitudeMod + pulseFactor;

      for (let x = 0; x < totalPoints; x += 2) {
        let y = centerY;
        const angle = x * frequencyMod + phase;

        if (state.currentWaveform === 'sine') {
          y = centerY + Math.sin(angle) * currentAmp * Math.sin(x * 0.005 + phase * 0.4);
        } else if (state.currentWaveform === 'sawtooth') {
          y = centerY + ((angle % (Math.PI * 2)) / Math.PI - 1) * currentAmp;
        } else if (state.currentWaveform === 'square') {
          y = centerY + (Math.sin(angle) >= 0 ? currentAmp * 0.75 : -currentAmp * 0.75);
        } else if (state.currentWaveform === 'pulse') {
          y = centerY + (Math.sin(angle) > 0.6 ? currentAmp : -currentAmp * 0.3);
        }

        if (x === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }

      ctx.stroke();
      ctx.shadowBlur = 0; // reset

      // Dampen pulse factor
      if (pulseFactor > 0.1) {
        pulseFactor *= 0.92;
      } else {
        pulseFactor = 0;
      }

      phase += 0.07;
      requestAnimationFrame(render);
    }

    render();
  }

  /* ==========================================================================
     JAM FRETBOARD / KEYBOARD INTERACTION
     ========================================================================== */
  function initJamFretboard() {
    const keys = document.querySelectorAll('.synth-key');
    keys.forEach((key) => {
      const freq = parseFloat(key.getAttribute('data-freq'));

      key.addEventListener('mousedown', () => {
        key.classList.add('key-pressed');
        playSynthNote(freq, 0.8, 'sawtooth');
      });

      window.addEventListener('mouseup', () => {
        key.classList.remove('key-pressed');
      });

      // Touch for mobile
      key.addEventListener('touchstart', (e) => {
        e.preventDefault();
        key.classList.add('key-pressed');
        playSynthNote(freq, 0.8, 'sawtooth');
      });
      key.addEventListener('touchend', () => {
        key.classList.remove('key-pressed');
      });
    });

    // Keyboard Hotkeys 1-6
    window.addEventListener('keydown', (e) => {
      // Ignore if typing inside terminal or an input
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= 6) {
        const keyEl = document.querySelector(`.synth-key[data-key="${num}"]`);
        if (keyEl) {
          keyEl.classList.add('key-pressed');
          const freq = parseFloat(keyEl.getAttribute('data-freq'));
          playSynthNote(freq, 0.8, 'sawtooth');
          setTimeout(() => keyEl.classList.remove('key-pressed'), 200);
        }
      }
    });
  }

  /* ==========================================================================
     HARDWARE TOGGLES (Sound FX & CRT Mode)
     ========================================================================== */
  function initHardwareToggles() {
    const soundToggle = document.getElementById('sound-toggle-btn');
    const crtToggle = document.getElementById('crt-toggle-btn');

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

    // Restore CRT setting
    const savedCrt = localStorage.getItem('zathu_crt');
    if (savedCrt === 'enabled') {
      state.crtEnabled = true;
      document.body.classList.add('crt-active');
      if (crtToggle) crtToggle.classList.add('active');
    }

    // CRT Toggle Click
    if (crtToggle) {
      crtToggle.addEventListener('click', () => {
        state.crtEnabled = !state.crtEnabled;
        playClickBlip('blip');
        if (state.crtEnabled) {
          document.body.classList.add('crt-active');
          crtToggle.classList.add('active');
          localStorage.setItem('zathu_crt', 'enabled');
        } else {
          document.body.classList.remove('crt-active');
          crtToggle.classList.remove('active');
          localStorage.setItem('zathu_crt', 'disabled');
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
        playClickBlip('high');
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
     INTERACTIVE HACKER TERMINAL (zathu-sh)
     ========================================================================== */
  function initTerminal() {
    const termInput = document.getElementById('term-input');
    const termBody = document.getElementById('term-body');
    const termOutput = document.getElementById('term-output');

    if (!termInput || !termBody || !termOutput) return;

    function appendLine(html) {
      const line = document.createElement('div');
      line.className = 'terminal-line';
      line.innerHTML = html;
      termOutput.appendChild(line);
      termBody.scrollTop = termBody.scrollHeight;
    }

    const COMMANDS = {
      help: () => {
        return `
<span class="term-cyan">ZATHU TERMINAL V2.4 - AVAILABLE COMMANDS:</span>
  <span class="term-green">projects</span>     - List all open source projects and live web apps
  <span class="term-green">majestictab</span>  - Guitar tab reader & practice app details + launch link
  <span class="term-green">setlore</span>      - Live concert & tour setlist telemetry system
  <span class="term-green">lan</span>          - List LAN party script repos (CoD4, CoD5, Quake 3, Halo)
  <span class="term-green">music</span>        - Musician toolset overview
  <span class="term-green">synth</span>        - Trigger 8-bit chiptune synthesizer riff
  <span class="term-green">theme</span>        - Toggle retro CRT scanlines mode
  <span class="term-green">whoami</span>       - Creator bio & open-source mission
  <span class="term-green">clear</span>        - Clear the terminal screen
  <span class="term-green">github</span>       - Open the official GitHub profile (cgarst)`;
      },

      projects: () => {
        return `
<span class="term-cyan">=== ZATHU SOFTWARE FLAGSHIP REPOSITORIES ===</span>
&bull; <a href="https://majestictab.zathu.net/" target="_blank" class="term-green">MajesticTab</a>: Focused guitar tab reader & practice studio (<a href="https://github.com/cgarst/MajesticTab" target="_blank" class="term-muted">GitHub</a>)
&bull; <a href="https://setlore.zathu.net/" target="_blank" class="term-magenta">Setlore</a>: Self-hosted live concert & setlist analytics
&bull; <a href="https://github.com/cgarst/random-album-for-youtube-music" target="_blank" class="term-amber">Random Album for YT Music</a>: Album-oriented shuffle tool
&bull; <a href="https://github.com/cgarst/gamestream_launchpad" target="_blank" class="term-cyan">gamestream_launchpad</a>: Optimized PC game launcher (390+ stars)
&bull; <a href="#lan-vault" class="term-green">LAN Party Scripts</a>: Call of Duty 4, COD: WaW, Quake 3, Halo Reclaimer
Type <span class="term-cyan">lan</span> or <span class="term-cyan">music</span> for deep dives.`;
      },

      majestictab: () => {
        return `
<span class="term-cyan">[MAJESTICTAB]</span>
Focused guitar tab viewer supporting Guitar Pro, PDF, & text tabs.
Features: Multi-track audio engine, virtual fretboard, Jam Mode over local network.
Live App: <a href="https://majestictab.zathu.net/" target="_blank" class="term-green">https://majestictab.zathu.net/</a>
Source: <a href="https://github.com/cgarst/MajesticTab" target="_blank" class="term-muted">https://github.com/cgarst/MajesticTab</a>`;
      },

      setlore: () => {
        return `
<span class="term-magenta">[SETLORE]</span>
Self-hosted live concert & tour setlist analytics.
Track tour debuts, venue maps, and historical setlist trends.
Live App: <a href="https://setlore.zathu.net/" target="_blank" class="term-cyan">https://setlore.zathu.net/</a>`;
      },

      lan: () => {
        return `
<span class="term-amber">=== LAN PARTY REPOSITORIES ===</span>
1. <span class="term-green">lanscript-cod4</span>   : Call of Duty 4 LAN party orchestration
   git clone https://github.com/cgarst/lanscript-cod4.git
2. <span class="term-green">lanscript-cod5</span>   : COD5: World at War LAN coop & multiplayer
   git clone https://github.com/cgarst/lanscript-cod5.git
3. <span class="term-green">lanscript-quake3</span> : Quake III Arena instant zero-config dedicated host
   git clone https://github.com/cgarst/lanscript-quake3.git
4. <span class="term-green">reclaimer-lan</span>    : Project Reclaimer Halo LAN scripts
   git clone https://github.com/cgarst/reclaimer-lan.git
Browse all: <a href="https://github.com/cgarst?tab=repositories" target="_blank" class="term-cyan">https://github.com/cgarst?tab=repositories</a>`;
      },

      music: () => {
        return `
<span class="term-cyan">=== MUSICIAN WORKBENCH TOOLS ===</span>
1. <a href="https://majestictab.zathu.net/" target="_blank" class="term-green">MajesticTab</a>: Guitar Pro tab practice workstation.
2. <a href="https://setlore.zathu.net/" target="_blank" class="term-magenta">Setlore</a>: Tour and live performance analytics.
3. <a href="https://github.com/cgarst/random-album-for-youtube-music" target="_blank" class="term-amber">Random Album for YT Music</a>: Album listener shuffle.
Tip: Press keys 1 through 6 on your keyboard right now to play guitar notes!`;
      },

      synth: () => {
        playArpeggio();
        return `<span class="term-cyan">&gt; Arpeggiator fired! [C-E-G-C-E-G] Synthesizer output active.</span>`;
      },

      theme: () => {
        const crtToggle = document.getElementById('crt-toggle-btn');
        if (crtToggle) crtToggle.click();
        return `<span class="term-green">&gt; CRT Phosphor display state toggled.</span>`;
      },

      whoami: () => {
        return `
<span class="term-cyan">ZATHU SOFTWARE &bull; cgarst</span>
Hobbyist indie developer, open-source hacker, musician, and retro gamer.
Building unbloated, local-first utilities that solve actual problems for real people.
GitHub: <a href="https://github.com/cgarst" target="_blank" class="term-green">https://github.com/cgarst</a>`;
      },

      github: () => {
        window.open('https://github.com/cgarst/', '_blank');
        return `<span class="term-green">&gt; Opening GitHub profile: https://github.com/cgarst/</span>`;
      },

      clear: () => {
        termOutput.innerHTML = '';
        return '';
      }
    };

    termInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const raw = termInput.value.trim();
        const cmd = raw.toLowerCase();

        appendLine(`<span class="terminal-prompt-symbol">&gt;</span> <span class="term-cyan">${raw}</span>`);

        if (cmd) {
          state.commandHistory.push(raw);
          state.historyIndex = state.commandHistory.length;

          if (COMMANDS[cmd]) {
            const result = COMMANDS[cmd]();
            if (result) appendLine(result);
          } else {
            appendLine(`<span class="term-amber">Command not found: "${raw}". Type <span class="term-cyan">help</span> for command list.</span>`);
          }
        }

        termInput.value = '';
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

    // Make command pills clickable
    document.querySelectorAll('.term-cmd-pill').forEach((pill) => {
      pill.addEventListener('click', () => {
        const cmd = pill.getAttribute('data-cmd');
        termInput.value = cmd;
        termInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      });
    });
  }

  /* ==========================================================================
     INIT ON DOM READY
     ========================================================================== */
  document.addEventListener('DOMContentLoaded', () => {
    initOscilloscope();
    initJamFretboard();
    initHardwareToggles();
    initLanTabs();
    initTerminal();
  });
})();
