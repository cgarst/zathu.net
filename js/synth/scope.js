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
    if (ribbon.playing && ribbon.activeIndex >= 0 && ribbon.activeIndex < N) {
      const xLeft = ribbon.activeIndex * zoneWidth;
      const noteCenterX = (ribbon.activeIndex + 0.5) * zoneWidth;

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
      if (Math.abs(ribbon.targetCents) > 2) {
        // Where user is selecting (target depth marker)
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.45)';
        ctx.beginPath();
        ctx.moveTo(ribbon.currentX, 0);
        ctx.lineTo(ribbon.currentX, height);
        ctx.stroke();

        // Animated oscillating orb moving back and forth between 0 cents (middle of the bar: noteCenterX) and selection (ribbon.currentX)
        const lfoFactor = ribbon.targetCents !== 0 ? (ribbon.currentCents / ribbon.targetCents) : 0;
        const oscX = noteCenterX + (ribbon.currentX - noteCenterX) * lfoFactor;

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
      const isActive = ribbon.playing && ribbon.activeIndex === i;

      // Note name on top
      ctx.fillStyle = isActive ? '#00f0ff' : 'rgba(148, 163, 184, 0.45)';
      ctx.fillText(notes[i].noteName, centerX, 13);

      // Key shortcut on bottom
      ctx.fillStyle = isActive ? '#38bdf8' : 'rgba(100, 116, 139, 0.35)';
      ctx.fillText(`[${notes[i].shortcut}]`, centerX, height - 5);
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
