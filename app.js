import express from 'express'
import fs from 'fs'
import path from 'path'
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

// Standard tuning frequencies for a guitar (EADGBE)
const standardTuning = [82.41, 110.00, 146.83, 196.00, 246.94, 329.63];

// Map chroma index to note names
const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Function to convert frequency to tablature
function frequencyToTab(frequency) {
  for (let string = 0; string < standardTuning.length; string++) {
    const baseFreq = standardTuning[string];
    const fret = Math.round(12 * Math.log2(frequency / baseFreq));
    if (fret >= 0 && fret <= 12) {
      return { string: string + 1, fret };
    }
  }
  return null; // Out of range
}

app.post('/analyze', async (req, res) => {
  try {
    const audioBuffer = await audioDecode(req.body)

    // Analyze pitch using Meyda
    const signal = audioBuffer.getChannelData(0); // Use the first channel
    const frameSize = 2 ** 13;
    const musicTempo = new MusicTempo(signal)

    const duration = audioBuffer.duration

    const tablature = generateTablatureFromSignal(signal, frameSize);
    const result = extractNotes(musicTempo, duration, tablature);

    res.json({ result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error processing audio file' });
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

    const mostFrequentNote = Object.keys(noteOccurrences).reduce((a, b) => noteOccurrences[a] > noteOccurrences[b] ? a : b);
    const resultTab = notes[notes.findIndex((tab => tab?.note === mostFrequentNote))];

    result.push(resultTab);
  }
  return result;
}

function generateTablatureFromSignal(signal, frameSize) {
  const tablature = [];

  for (let i = 0; i < signal.length; i += frameSize) {
    const frame = signal.slice(i, i + frameSize);

    if (frame.length % 2 !== 0) {
      break;
    }

    const features = Meyda.extract(['chroma'], frame);

    if (features?.chroma) {
      // Find the most prominent chroma index (note)
      const maxChromaIndex = features.chroma.indexOf(Math.max(...features.chroma));
      const chromaValue = features.chroma[maxChromaIndex];
      if (chromaValue > 0.5) {
        const noteName = noteNames[maxChromaIndex];

        // Convert note name to frequency
        const frequency = 440 * Math.pow(2, (maxChromaIndex - 9) / 12); // A4 = 440 Hz

        // Map frequency to tablature
        const tab = frequencyToTab(frequency);
        tab && tablature.push({ ...tab, note: noteName, chroma: chromaValue });
      }
      else {
        tablature.push({note: '-'});
      }
    }
  }
  return tablature;
}
