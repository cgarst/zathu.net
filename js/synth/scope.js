import { audio, findTriggerIndex, getSumWaveType, playClickBlip, pruneVoiceTraces, voiceTraces, waveColorFor } from './audio.js';
import { getActiveScaleNotes } from './music.js';
import { ribbon, startRibbonTone, stopRibbonTone, updateRibbonTone } from './ribbon.js';
import { state } from './state.js';
import { updateScopeStatus } from './ui.js';

/* ==========================================================================
   REAL-TIME OSCILLOSCOPE CANVAS (AUDIO-REACTIVE)
   ========================================================================== */
// `standalone`: the /synth app, where the rack is always maximized (no toggle, Esc does nothing).
export function initOscilloscope({ standalone = false } = {}) {
  const canvas = document.getElementById('oscilloscope-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const scopeFrame = canvas.parentElement;
  // The canvas backing store matches the screen's real pixels (drawing code keeps working in CSS
  // pixels through the transform), so lines and the pixel font stay sharp instead of being upscaled
  let dpr = 1;
  let width = 0;
  let height = 0;

  function resizeScopeCanvas() {
    if (!scopeFrame) return;
    dpr = window.devicePixelRatio || 1;
    width = scopeFrame.clientWidth;
    height = scopeFrame.clientHeight || 180;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resizeScopeCanvas();

  // 8-bit labels: a 5x7 bitmap font drawn as whole device pixels, so nothing is anti-aliased
  const GLYPHS = {
    '0': '01110 10001 10011 10101 11001 10001 01110', '1': '00100 01100 00100 00100 00100 00100 01110',
    '2': '01110 10001 00001 00010 00100 01000 11111', '3': '11110 00001 00001 01110 00001 00001 11110',
    '4': '00010 00110 01010 10010 11111 00010 00010', '5': '11111 10000 11110 00001 00001 10001 01110',
    '6': '00110 01000 10000 11110 10001 10001 01110', '7': '11111 00001 00010 00100 01000 01000 01000',
    '8': '01110 10001 10001 01110 10001 10001 01110', '9': '01110 10001 10001 01111 00001 00010 01100',
    'A': '01110 10001 10001 11111 10001 10001 10001', 'B': '11110 10001 10001 11110 10001 10001 11110',
    'C': '01110 10001 10000 10000 10000 10001 01110', 'D': '11110 10001 10001 10001 10001 10001 11110',
    'E': '11111 10000 10000 11110 10000 10000 11111', 'F': '11111 10000 10000 11110 10000 10000 10000',
    'G': '01110 10001 10000 10111 10001 10001 01111', '#': '01010 01010 11111 01010 11111 01010 01010',
    '¢': '00100 01110 10100 10100 10100 01110 00100',
  };
  const GLYPH_ROWS = {};
  Object.keys(GLYPHS).forEach((ch) => { GLYPH_ROWS[ch] = GLYPHS[ch].split(' '); });

  function drawPixelText(text, cx, top, color) {
    const cell = Math.max(1, Math.round(dpr * 1.5)); // device pixels per font pixel
    const advance = 6 * cell; // 5 columns + 1 gap
    const textW = text.length * advance - cell;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0); // work in device pixels
    ctx.fillStyle = color;
    let x = Math.round(cx * dpr - textW / 2);
    const y = Math.round(top * dpr);
    for (const ch of text) {
      const rows = GLYPH_ROWS[ch];
      if (rows) {
        for (let r = 0; r < 7; r++) {
          for (let c = 0; c < 5; c++) {
            if (rows[r][c] === '1') ctx.fillRect(x + c * cell, y + r * cell, cell, cell);
          }
        }
      }
      x += advance;
    }
    ctx.restore();
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
      maxBtn.textContent = on ? 'Close' : 'Full screen';
    }
    resizeScopeCanvas();
  }
  if (maxBtn && !standalone) {
    maxBtn.addEventListener('click', () => {
      playClickBlip('high');
      setScopeMaximized(!rackCard.classList.contains('scope-maximized'));
    });
  }
  window.addEventListener('keydown', (e) => {
    if (!standalone && e.key === 'Escape' && rackCard && rackCard.classList.contains('scope-maximized')) {
      setScopeMaximized(false);
    }
  });
  if (standalone) setScopeMaximized(true);

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

  const endTouch = () => {
    isMouseDownOnCanvas = false;
    stopRibbonTone();
  };
  canvas.addEventListener('touchend', endTouch);
  canvas.addEventListener('touchcancel', endTouch);

  function drawGrid() {
    const notes = getActiveScaleNotes();
    const N = notes.length || 8;
    const zoneWidth = width / N;

    // Alternate note columns in a slightly lighter flat tone (no lines)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.035)';
    for (let i = 0; i < N; i += 2) ctx.fillRect(i * zoneWidth, 0, zoneWidth, height);

    // Center line (0 cents)
    ctx.strokeStyle = 'rgba(236, 233, 227, 0.14)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    // Dashed guide down the middle of each column: straight on it is 0 cents, drag sideways for vibrato
    ctx.strokeStyle = 'rgba(236, 233, 227, 0.22)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 6]);
    for (let i = 0; i < N; i++) {
      const cX = (i + 0.5) * zoneWidth;
      ctx.beginPath();
      ctx.moveTo(cX, 26);
      ctx.lineTo(cX, height - 24);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // The note being played: its column lights up, with the vibrato marker
    if (ribbon.playing && ribbon.activeIndex >= 0 && ribbon.activeIndex < N) {
      const xLeft = ribbon.activeIndex * zoneWidth;
      const noteCenterX = (ribbon.activeIndex + 0.5) * zoneWidth;

      ctx.fillStyle = 'rgba(255, 90, 31, 0.16)';
      ctx.fillRect(xLeft, 0, zoneWidth, height);

      ctx.strokeStyle = 'rgba(255, 90, 31, 0.6)';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(noteCenterX, 0);
      ctx.lineTo(noteCenterX, height);
      ctx.stroke();
      ctx.setLineDash([]);

      drawPixelText('0\u00a2', noteCenterX, height / 2 - 22, '#ff5a1f');

      if (Math.abs(ribbon.targetCents) > 2) {
        ctx.strokeStyle = 'rgba(255, 199, 102, 0.6)';
        ctx.beginPath();
        ctx.moveTo(ribbon.currentX, 0);
        ctx.lineTo(ribbon.currentX, height);
        ctx.stroke();
      }

      // Amber dot: its height follows the pointer (the filter). Across, it wiggles with the vibrato,
      // swinging between the note's centre and the pointer, so it sits on the pointer at full depth.
      const pointerY = height * (1 - (ribbon.cutoff - 300) / 5700);
      const lfoFactor = ribbon.targetCents !== 0 ? (ribbon.currentCents / ribbon.targetCents) : 0;
      const dotX = noteCenterX + (ribbon.currentX - noteCenterX) * lfoFactor;
      ctx.fillStyle = '#ffc766';
      ctx.beginPath();
      ctx.arc(dotX, Math.max(7, Math.min(height - 7, pointerY)), 7, 0, Math.PI * 2);
      ctx.fill();
    }

    // Note names on top, number keys at the bottom
    for (let i = 0; i < N; i++) {
      const centerX = (i + 0.5) * zoneWidth;
      const isActive = ribbon.playing && ribbon.activeIndex === i;
      drawPixelText(notes[i].noteName, centerX, 6, isActive ? '#ff5a1f' : 'rgba(236, 233, 227, 0.62)');
      drawPixelText(`${notes[i].shortcut}`, centerX, height - 16, isActive ? '#ece9e3' : 'rgba(236, 233, 227, 0.42)');
    }
  }

  function render() {
    // Automatic vibrato modulation: continuously cycles between 0 cents and ribbon.targetCents
    if (ribbon.playing && ribbon.osc && audio.ctx) {
      const now = audio.ctx.currentTime;
      const t = Math.max(0, now - ribbon.vibratoStart);
      const rate = 5.2; // 5.2 Hz natural guitar vibrato speed
      // Oscillates between 0 and 1: 0 at t=0, goes up to 1, then back to 0
      const lfoCycle = 0.5 - 0.5 * Math.cos(2 * Math.PI * rate * t);
      ribbon.currentCents = ribbon.targetCents * lfoCycle;

      ribbon.osc.detune.setTargetAtTime(ribbon.currentCents, now, 0.015);

      const notes = getActiveScaleNotes();
      if (notes[ribbon.activeIndex]) {
        const note = notes[ribbon.activeIndex];
        updateScopeStatus(ribbon.baseFreq, ribbon.cutoff, note.noteName, note.degree, ribbon.currentCents, ribbon.targetCents);
      }
    }

    ctx.fillStyle = '#0e0f11';
    ctx.fillRect(0, 0, width, height);

    drawGrid();

    // Determine glow color based on waveform
    pruneVoiceTraces();
    const sumWave = getSumWaveType();
    const waveColor = sumWave === 'mixed' ? '#ece9e3' : waveColorFor(sumWave);

    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = waveColor;
    ctx.shadowBlur = 0;

    ctx.beginPath();

    // Check if real audio is flowing through audio.analyser
    let hasAudioSignal = false;
    if (audio.analyser) {
      audio.analyser.getByteTimeDomainData(analyserBuffer);
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
      // Voices tap in before audio.master, so scale them to their share of the mix.
      const mixScale = audio.master ? audio.master.gain.value : 1;
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
