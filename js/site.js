/**
 * ZATHU SOFTWARE - site scripts.
 * Open tools with the features we couldn't find anywhere else.
 *
 * The synth lives in js/synth/ and is shared with the standalone /synth app.
 */
import { playClickBlip } from './synth/audio.js';
import { mountSynth } from './synth/index.js';

/* ==========================================================================
   LAN PARTY TABS & CODE COPY
   ========================================================================== */
export function initLanTabs() {
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

const synthMount = document.getElementById('synth-mount');
if (synthMount) mountSynth(synthMount);
initLanTabs();
