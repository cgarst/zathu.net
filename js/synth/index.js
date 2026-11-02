import { SYNTH_HTML } from './template.js';
import { initOscilloscope } from './scope.js';
import { initEModeSynth } from './keys.js';
import { initHardwareToggles } from './controls.js';

// iOS Safari ignores user-scalable=no, so block pinch via gesture events
// (double-tap zoom is handled by touch-action in the CSS).
function blockPinchZoom() {
  ['gesturestart', 'gesturechange', 'gestureend'].forEach((t) => {
    document.addEventListener(t, (e) => e.preventDefault());
  });
}

/**
 * Build the synth rack inside `target` and wire it up.
 * Only one synth per page (the markup uses fixed element ids).
 *
 * @param {HTMLElement} target
 * @param {{ standalone?: boolean }} [opts] standalone: the /synth app, where the rack fills the viewport
 */
export function mountSynth(target, { standalone = false } = {}) {
  blockPinchZoom();
  target.innerHTML = SYNTH_HTML;
  initOscilloscope({ standalone });
  initEModeSynth();
  initHardwareToggles();
}
