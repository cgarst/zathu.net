import { state } from './state.js';

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const ROOT_KEYS = {
  'C': 48,  // C3 (130.81 Hz)
  'C#': 49,
  'Db': 49,
  'D': 50,  // D3 (146.83 Hz)
  'D#': 51,
  'Eb': 51,
  'E': 52,  // E3 (164.81 Hz)
  'F': 53,  // F3 (174.61 Hz)
  'F#': 54,
  'Gb': 54,
  'G': 55,  // G3 (196.00 Hz)
  'G#': 56,
  'Ab': 56,
  'A': 57,  // A3 (220.00 Hz)
  'A#': 58,
  'Bb': 58,
  'B': 59   // B3 (246.94 Hz)
};

// Musical Modes & Scales (Ordered: Natural Minor, Harmonic Minor, Minor Pent, Major, Modes)
export const MODES = {
  'minor': {
    name: 'Natural Minor (Aeolian)',
    intervals: [0, 2, 3, 5, 7, 8, 10, 12],
    degrees: ['1st', '2nd', 'b3', '4th', '5th', 'b6', 'b7', '8 (Oct)']
  },
  'harmonic_minor': {
    name: 'Harmonic Minor',
    intervals: [0, 2, 3, 5, 7, 8, 11, 12],
    degrees: ['1st', '2nd', 'b3', '4th', '5th', 'b6', '7th', '8 (Oct)']
  },
  'minor_pentatonic': {
    name: 'Minor Pentatonic',
    intervals: [0, 3, 5, 7, 10, 12],
    degrees: ['1st', 'b3', '4th', '5th', 'b7', '8 (Oct)']
  },
  'dorian': {
    name: 'Dorian',
    intervals: [0, 2, 3, 5, 7, 9, 10, 12],
    degrees: ['1st', '2nd', 'b3', '4th', '5th', '6th', 'b7', '8 (Oct)']
  },
  'phrygian': {
    name: 'Phrygian',
    intervals: [0, 1, 3, 5, 7, 8, 10, 12],
    degrees: ['1st', 'b2', 'b3', '4th', '5th', 'b6', 'b7', '8 (Oct)']
  },
  'lydian': {
    name: 'Lydian (#4)',
    intervals: [0, 2, 4, 6, 7, 9, 11, 12],
    degrees: ['1st', '2nd', '3rd', '#4', '5th', '6th', '7th', '8 (Oct)']
  },
  'mixolydian': {
    name: 'Mixolydian',
    intervals: [0, 2, 4, 5, 7, 9, 10, 12],
    degrees: ['1st', '2nd', '3rd', '4th', '5th', '6th', 'b7', '8 (Oct)']
  },
  'major': {
    name: 'Major (Ionian)',
    intervals: [0, 2, 4, 5, 7, 9, 11, 12],
    degrees: ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8 (Oct)']
  },
  'locrian': {
    name: 'Locrian',
    intervals: [0, 1, 3, 5, 6, 8, 10, 12],
    degrees: ['1st', 'b2', 'b3', '4th', 'b5', 'b6', 'b7', '8 (Oct)']
  }
};

export function getNoteNameFromMidi(midi) {
  const note = NOTE_NAMES[midi % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${note}${octave}`;
}

// Active scale notes helper for the current mode & root
export function getActiveScaleNotes() {
  const modeKey = state.currentMode || 'minor';
  const mode = MODES[modeKey] || MODES['minor'];
  const baseMidi = state.rootMidi || 52; // E3 (164.81 Hz)

  return mode.intervals.map((interval, index) => {
    const midi = baseMidi + interval;
    const freq = 440 * Math.pow(2, (midi - 69) / 12);
    const noteName = getNoteNameFromMidi(midi);
    const degree = mode.degrees[index] || '';
    const shortcut = (index + 1).toString();
    return { index, midi, freq, noteName, degree, shortcut };
  });
}

export function freqToMidi(freq) {
  return Math.round(69 + 12 * Math.log2(freq / 440));
}
