import { mountSynth } from './synth/index.js';

mountSynth(document.getElementById('synth-mount'), { standalone: true });

// Make the app installable and usable offline
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/synth/sw.js', { scope: '/synth/' }).catch(() => {});
  });
}
