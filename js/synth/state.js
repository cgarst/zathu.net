export const state = {
  audioEnabled: true,
  currentWaveform: 'sine',
  rootNote: 'E',
  octave: 0,    // shift from the default octave, in octaves (OCTAVE_MIN to OCTAVE_MAX)
  rootMidi: 52, // root note plus the octave shift (E3 is 164.81 Hz)
  currentMode: 'minor',
  arpMode: false,
  hold: false,
  arpNotes: 4,      // notes in the arpeggio (before it turns around)
  arpEnd: 'octave', // 'octave' (ends on the octave, spread through it) or 'linear' (keeps climbing in thirds)
  commandHistory: [],
  historyIndex: -1,
};
