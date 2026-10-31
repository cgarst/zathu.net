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
                    },
                    'chiaki-steamdeck.md': {
                      type: 'file',
                      perm: 'rw-r--r--',
                      owner: 'cgarst',
                      group: 'zathu',
                      date: 'Oct 30 20:20',
                      size: 512,
                      content: `=== CHIAKI STEAM DECK ===
PlayStation Remote Play automation and integration tailored specifically for Valve Steam Deck.
Repository: https://github.com/cgarst/chiaki-steamdeck`
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
                  size: 340,
                  content: `Developer: cgarst
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
          appendLine(`<span class="term-cyan">&gt; Arpeggiator fired! [C-E-G-C-E-G] Synthesizer output active.</span>`);
          break;
        }

        case 'theme': {
          const crtToggle = document.getElementById('crt-toggle-btn');
          if (crtToggle) crtToggle.click();
          appendLine(`<span class="term-green">&gt; CRT Phosphor display state toggled.</span>`);
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
  <span class="term-green">theme</span>           - Toggle CRT scanlines mode
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
    initJamFretboard();
    initHardwareToggles();
    initLanTabs();
    initTerminal();
  });
})();
