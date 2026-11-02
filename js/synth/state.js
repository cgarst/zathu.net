export const state = {
  audioEnabled: true,
  currentWaveform: 'sine',
  rootNote: 'E',
  rootMidi: 52, // E3 (164.81 Hz)
  currentMode: 'minor',
  arpMode: false,
  hold: false,
  arpNotes: 4,      // notes in the arpeggio (before it turns around)
  arpEnd: 'octave', // 'octave' (ends on the octave, spread through it) or 'linear' (keeps climbing in thirds)
  commandHistory: [],
  historyIndex: -1,
};
