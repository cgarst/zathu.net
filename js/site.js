/**
 * ZATHU SOFTWARE - site scripts.
 * The synth lives in js/synth/ and is shared with the standalone /synth app.
 */
import { playClickBlip } from './synth/audio.js';
import { mountSynth } from './synth/index.js';

/* LAN server browser: one row open at a time */
function initServers() {
  const rows = [...document.querySelectorAll('.srv')];
  rows.forEach((row) => {
    const btn = row.querySelector('.srv-head');
    btn.addEventListener('click', () => {
      playClickBlip('blip');
      const open = !row.classList.contains('open');
      rows.forEach((r) => {
        const o = r === row && open;
        r.classList.toggle('open', o);
        r.querySelector('.srv-head').setAttribute('aria-expanded', o);
      });
    });
  });
}

/* Copy buttons */
let toastTimer;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
}
function initCopy() {
  document.querySelectorAll('[data-copy]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.copy);
        toast('Copied: ' + btn.dataset.copy);
      } catch {
        toast('Copy failed. Select the command in the code box instead.');
      }
    });
  });
}

/* Entrances: staggered, once */
function initReveal() {
  const show = (el, i) => { el.style.setProperty('--i', i); el.classList.add('is-in'); };
  document.querySelectorAll('.hero-content > *, .hero-stage').forEach((el, i) => show(el, i));
  const targets = document.querySelectorAll('[data-reveal]');
  if (!('IntersectionObserver' in window)) { targets.forEach((el) => show(el, 0)); return; }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) { show(e.target, 0); io.unobserve(e.target); } });
  }, { threshold: 0.1 });
  targets.forEach((el) => io.observe(el));
}

const synthMount = document.getElementById('synth-mount');
if (synthMount) mountSynth(synthMount);
initServers();
initCopy();
initReveal();
