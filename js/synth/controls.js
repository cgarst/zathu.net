import { enableSound, playSynthNote } from './audio.js';
import { state } from './state.js';
import { resetScopeStatus } from './ui.js';
import { applyWaveformToPlaying } from './voices.js';

/* ==========================================================================
   HARDWARE TOGGLES & WAVEFORM SWITCHER
   ========================================================================== */
export function initHardwareToggles() {
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
