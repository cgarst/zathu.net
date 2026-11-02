// Markup for the synth rack (FIDGET BOX 3000). Shared by the site's hero and the /synth app.
export const SYNTH_HTML = `
<div class="hardware-chassis-card">
  
  <div class="hardware-rack-header">
    <div class="rack-header-left">
      <div class="rack-screw"></div>
      <span class="rack-title">FIDGET BOX 3000</span>
    </div>
    <div class="rack-header-right">
      <button type="button" class="rack-max-btn" id="scope-maximize-btn" aria-pressed="false" aria-label="Maximize synth rack to full viewport" title="Maximize to full viewport">⛶</button>
    </div>
  </div>

  <!-- Canvas Visualizer Screen with Permanent CRT Phosphor Tube -->
  <div class="oscilloscope-screen-wrapper">
    <div class="oscilloscope-crt-frame">
      <canvas id="oscilloscope-canvas" class="oscilloscope-canvas" width="460" height="180" style="cursor: crosshair;"></canvas>
      <div class="oscilloscope-crt-scanlines" aria-hidden="true"></div>
    </div>
    
    <div class="oscilloscope-meta">
      <span id="scope-status-text"><i class="fa-solid fa-hand-pointer"></i> DRAG WAVE TO PLAY</span>
      <div class="scope-wave-selector">
        <button class="scope-btn active" data-wave="sine" title="Pure smooth sine wave">SINE</button>
        <button class="scope-btn" data-wave="sawtooth" title="Bright rich sawtooth wave">SAW</button>
        <button class="scope-btn" data-wave="square" title="Crunchy 8-bit square wave">SQUARE</button>
        <button class="scope-btn" data-wave="triangle" title="Warm mellow triangle wave">TRIANGLE</button>
      </div>
    </div>
  </div>

  <!-- Interactive Scale & Mode Synthesizer Controls -->
  <div class="synth-bar-controls">
    <div class="mode-switcher-bar">
      <div class="key-btn-group" id="key-buttons-group" role="group" aria-label="Musical Key">
        <button type="button" class="mode-btn key-btn" data-root="A" title="Key of A" aria-pressed="false">A</button>
        <button type="button" class="mode-btn key-btn key-btn-sharp" data-root="A#" title="Key of A# / Bb" aria-pressed="false">A#</button>
        <button type="button" class="mode-btn key-btn" data-root="B" title="Key of B" aria-pressed="false">B</button>
        <button type="button" class="mode-btn key-btn" data-root="C" title="Key of C" aria-pressed="false">C</button>
        <button type="button" class="mode-btn key-btn key-btn-sharp" data-root="C#" title="Key of C# / Db" aria-pressed="false">C#</button>
        <button type="button" class="mode-btn key-btn" data-root="D" title="Key of D" aria-pressed="false">D</button>
        <button type="button" class="mode-btn key-btn key-btn-sharp" data-root="D#" title="Key of D# / Eb" aria-pressed="false">D#</button>
        <button type="button" class="mode-btn key-btn active" data-root="E" title="Key of E" aria-pressed="true">E</button>
        <button type="button" class="mode-btn key-btn" data-root="F" title="Key of F" aria-pressed="false">F</button>
        <button type="button" class="mode-btn key-btn key-btn-sharp" data-root="F#" title="Key of F# / Gb" aria-pressed="false">F#</button>
        <button type="button" class="mode-btn key-btn" data-root="G" title="Key of G" aria-pressed="false">G</button>
        <button type="button" class="mode-btn key-btn key-btn-sharp" data-root="G#" title="Key of G# / Ab" aria-pressed="false">G#</button>
      </div>
      <div class="mode-btn-group" id="mode-buttons-group">
        <button class="mode-btn" data-mode="major" title="Major (Ionian)">Major</button>
        <button class="mode-btn active" data-mode="minor" title="Natural Minor (Aeolian)">Natural Minor</button>
        <button class="mode-btn" data-mode="harmonic_minor" title="Harmonic Minor">Harmonic Minor</button>
        <button class="mode-btn" data-mode="minor_pentatonic" title="Minor Pentatonic">Minor Pent</button>
        <button class="mode-btn" data-mode="dorian" title="Dorian">Dorian</button>
        <button class="mode-btn" data-mode="phrygian" title="Phrygian">Phrygian</button>
        <button class="mode-btn" data-mode="lydian" title="Lydian (#4)">Lydian</button>
        <button class="mode-btn" data-mode="mixolydian" title="Mixolydian">Mixolydian</button>
        <button class="mode-btn" data-mode="locrian" title="Locrian">Locrian</button>
      </div>
    </div>

    <!-- Keys behavior slider: single notes vs. 6-note arpeggio -->
    <div class="arp-switcher" role="group" aria-label="Key behavior">
      <span id="arp-label-notes" class="arp-label active">NOTES</span>
      <label class="arp-switch" title="Slide to switch keys between single notes and a 6-note arpeggio">
        <input type="checkbox" id="arp-toggle" aria-label="Arpeggiator mode">
        <span class="arp-slider"></span>
      </label>
      <span id="arp-label-arp" class="arp-label">ARPEGGIATOR</span>
      <button type="button" class="hold-btn" id="hold-btn" aria-pressed="false" aria-keyshortcuts="H" title="Freeze the sounds playing right now until HOLD is switched off (H)">HOLD <span class="hold-key-hint">[H]</span></button>
    </div>

    <!-- Arpeggio options (active only in ARPEGGIATOR mode) -->
    <div class="arp-options is-off" id="arp-options" role="group" aria-label="Arpeggio options">
      <span class="arp-opt-label">NOTES</span>
      <button type="button" class="arp-opt-btn arp-step-btn" id="arp-notes-dec" aria-label="Fewer notes">&minus;</button>
      <span class="arp-notes-val" id="arp-notes-val" aria-live="polite">4</span>
      <button type="button" class="arp-opt-btn arp-step-btn" id="arp-notes-inc" aria-label="More notes">+</button>
      <span class="arp-opt-label arp-opt-gap">END</span>
      <div class="arp-end-group">
        <button type="button" class="arp-opt-btn arp-end-btn" data-end="linear" aria-pressed="false" title="Keep climbing in thirds">LINEAR</button>
        <button type="button" class="arp-opt-btn arp-end-btn active" data-end="octave" aria-pressed="true" title="Finish on the octave, spreading the notes through it">OCTAVE</button>
      </div>
    </div>

    <!-- Interactive Number Buttons [1] through [8] (Click or Keys 1-8) -->
    <div class="synth-keys-grid" id="synth-keys-container"></div>
  </div>

</div>
`;
