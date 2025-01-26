import express from 'express'
import Meyda from 'meyda'
import audioDecode from 'audio-decode';
import MusicTempo from 'music-tempo'

const app = express();
const port = 3000;

app.use(express.static('public'));

app.use(
  express.raw({
    type: 'audio/mpeg',
    limit: '10mb',
  })
);

const A4 = 440;

const standardTuning = { E2: 82.41, A2: 110.00, D3: 146.83, G3: 196.00, B3: 246.94, E4: 329.63 };

const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

app.post('/analyze', async (req, res) => {
  try {
    const audioBuffer = await audioDecode(req.body)

    const signal = audioBuffer.getChannelData(0); // Use the first channel
    const frameSize = 2 ** 13; // Increase power if more precision is needed
    const musicTempo = new MusicTempo(signal)

    const tablature = generateTablatureFromSignal(signal, frameSize, audioBuffer.sampleRate);
    const result = extractNotes(musicTempo, audioBuffer.duration, tablature);

    res.json({ result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ err });
  }
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});

function extractNotes(musicTempo, duration, tablature) {
  const result = [];

  let prevBeat = 0;
  let chromaIndex = 0;
  for (const currBeat of musicTempo.beats) {
    const beatFraction = (currBeat - prevBeat) / duration;
    const chromaCount = Math.round(tablature.length * beatFraction);

    const notes = tablature.slice(chromaIndex, chromaIndex + chromaCount);
    chromaIndex += chromaCount;
    prevBeat = currBeat;

    const noteOccurrences = notes.reduce((acc, note) => {
      acc[note.note] = (acc[note.note] || 0) + 1;

      return acc;
    }, {});

    const mostFrequentNote = Object.keys(noteOccurrences).reduce(
      (a, b) => noteOccurrences[a] > noteOccurrences[b] ? a : b
    );
    const resultTab = notes[notes.findIndex((tab => tab?.note === mostFrequentNote))];

    result.push(resultTab);
  }
  return result;
}

function frequencyToTab(frequency) {
  const roots = Object.keys(standardTuning)

  for (let i = 0; i < roots.length; i++) {
    const baseFreq = standardTuning[roots[i]];
    const fret = Math.round(12 * Math.log2(frequency / baseFreq));
    if (fret >= 0 && fret <= 12) {
      return { string: i + 1, fret };
    }
  }
  return null;
}

function frequencyToOctave(frequency) {
  let noteIndex = Math.round(12 * Math.log2(frequency / A4)) + 9; // Offset to start with C
  const octave = Math.floor(noteIndex / 12) + 4; // Octave calculation

  return octave
}

function noteToFrequency(note, octave) {
  const noteIndex = noteNames.indexOf(note);
  if (noteIndex === -1) {
    throw new Error(`Invalid note: ${note}`);
  }

  const semitoneDifference = noteIndex - 9 + (octave - 4) * 12;

  return A4 * Math.pow(2, semitoneDifference / 12);
}

function generateTablatureFromSignal(signal, frameSize, sampleRate) {
  const tablature = [];

  for (let i = 0; i < signal.length; i += frameSize) {
    const frame = signal.slice(i, i + frameSize);

    if (frame.length % 2 !== 0) {
      break;
    }

    const features = Meyda.extract(['amplitudeSpectrum', 'chroma'], frame);

    if (features?.amplitudeSpectrum && features?.chroma) {
      const spectrum = features.amplitudeSpectrum;
      const binWidth = sampleRate / frameSize;

      // Second moment is a useful heuristic threshold to find the first peak (which is the fundamental frequency)
      const threshold = Math.sqrt(spectrum.reduce((acc, num) => acc + num ** 2, 0) / spectrum.length)

      let fundamentalFreqBinIndex = 0;

      for (let i = 0; i < spectrum.length - 1; i++) {
        if (spectrum[i] > threshold && spectrum[i] > spectrum[i + 1]) {
          fundamentalFreqBinIndex = i
          break;
        }
      }

      const dominantFrequency = fundamentalFreqBinIndex * binWidth;

      // Chroma is more precise
      const maxChromaIndex = features.chroma.indexOf(Math.max(...features.chroma));
      const chromaValue = features.chroma[maxChromaIndex];

      if (chromaValue > 0.5) {
        const noteName = noteNames[maxChromaIndex];
        const octave = frequencyToOctave(dominantFrequency)

        const exactFrequency = noteToFrequency(noteName, octave)

        const tab = frequencyToTab(exactFrequency);
        tab && tablature.push({ ...tab, note: noteName, octave });
      }
      else {
        tablature.push({ note: '-' });
      }
    }
  }

  return tablature;
}
