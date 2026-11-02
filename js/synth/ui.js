export function highlightKeyByIndex(index) {
  const keys = document.querySelectorAll('#synth-keys-container .synth-key');
  keys.forEach((keyEl, i) => {
    if (i === index) {
      keyEl.classList.add('key-pressed');
    } else {
      keyEl.classList.remove('key-pressed');
    }
  });
}

export function clearHighlightedKeys() {
  const keys = document.querySelectorAll('#synth-keys-container .synth-key');
  keys.forEach((keyEl) => keyEl.classList.remove('key-pressed'));
}

export function updateScopeStatus(freq, cutoff, noteName = null, degree = null, cents = 0, targetCents = 0) {
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

export function resetScopeStatus() {
  const statusEl = document.getElementById('scope-status-text');
  if (statusEl) {
    statusEl.innerHTML = `<i class="fa-solid fa-hand-pointer"></i> DRAG WAVE TO PLAY`;
  }
}
