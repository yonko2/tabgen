import express from 'express'
import Meyda from 'meyda'
import audioDecode from 'audio-decode';
import MusicTempo from 'music-tempo'
import http from 'http'
import { Server } from 'socket.io';
import {
  A4, NoteNamesKeyC, NoteOffsetC, NotesInOctave,
  OctaveOffset, Port, StandardTuningFreq, NoteSize, FrameSize
} from './public/constants.js';

const app = express();
app.use(express.static('public'));

app.use(
  express.raw({
    type: 'audio/mpeg',
    limit: '10mb',
  })
);

const server = http.createServer(app);
const io = new Server(server);

app.post('/analyze', async (req, res) => {
  try {
    const audioBuffer = await audioDecode(req.body)
    const signal = audioBuffer.getChannelData(0); // Use the first channel

    const musicTempo = new MusicTempo(signal)

    const tablature = await generateTablatureFromSignal(signal, audioBuffer.sampleRate, musicTempo, audioBuffer.duration);
    const result = extractNotes(musicTempo, audioBuffer.duration, tablature)

    res.json({ result })
  } catch (err) {
    console.error(err);
    res.status(500).json({ err });
  }
});

server.listen(Port, () => {
  console.log(`Server is running at http://localhost:${Port}`);
});

function emitTabEvent(musicTempo, duration, inferedTab, progressPercentage) {
  io.emit('tab', extractNotes(musicTempo, duration, inferedTab, progressPercentage));
}

function extrapolateSubbeats(beats, factor) {
  if (beats.length < 2) return beats;

  const result = [];
  let lastStep = 0;

  for (let i = 0; i < beats.length - 1; i++) {
    const start = beats[i];
    const end = beats[i + 1];
    const step = (end - start) / factor;
    lastStep = step;

    pushSubbeats(start, lastStep);
  }

  pushSubbeats(beats.at(-1), lastStep)

  return result;

  function pushSubbeats(start, step) {
    result.push(start);
    for (let j = 1; j < factor; j++) {
      result.push(start + step * j);
    }
  }
}

function extractNotes(musicTempo, duration, tablature, progressPercentage) {
  const result = [];

  if (!tablature || tablature.length === 0) {
    return []
  }

  const subbeats = extrapolateSubbeats(musicTempo.beats, NoteSize)
  const filteredSubbeats = subbeats.slice(0, subbeats.length * progressPercentage)

  let prevBeat = 0;
  let currentWindowIndex = 0;
  for (const currBeat of filteredSubbeats) {
    const beatFraction = (currBeat - prevBeat) / (duration * progressPercentage);
    const windowSize = Math.round(tablature.length * beatFraction);

    const notes = tablature.slice(currentWindowIndex, currentWindowIndex + windowSize);
    currentWindowIndex += windowSize;
    prevBeat = currBeat;

    const noteOccurrences = notes.reduce((acc, note) => {
      acc[note.fullNote] = (acc[note.fullNote] || 0) + 1;

      return acc;
    }, {});

    const mostFrequentNote = Object.keys(noteOccurrences).reduce(
      (a, b) => noteOccurrences[a] > noteOccurrences[b] ? a : b,
      '');

    const resultTab = notes[notes.findIndex((tab => tab?.fullNote === mostFrequentNote))];

    result.push(resultTab);
  }

  return result;
}

function frequencyToTab(frequency) {
  const roots = Object.keys(StandardTuningFreq)

  for (let i = roots.length - 1; i >= 0; i--) {
    const baseFreq = StandardTuningFreq[roots[i]];
    const fret = Math.round(12 * Math.log2(frequency / baseFreq));

    if (fret >= 0 && fret <= 24) {
      return {
        string: roots.length - i,
        fret: Math.abs(fret)
      };
    }
  }
  return null;
}

function frequencyToOctave(frequency) {
  let noteIndex = Math.round(NotesInOctave * Math.log2(frequency / A4)) + NoteOffsetC;
  const octave = Math.floor(noteIndex / NotesInOctave) + OctaveOffset;

  return octave
}

function noteToFrequency(note, octave) {
  const noteIndex = NoteNamesKeyC.indexOf(note);
  if (noteIndex === -1) {
    throw new Error(`Invalid note: ${note}`);
  }

  const semitoneDifference = noteIndex - NoteOffsetC + (octave - OctaveOffset) * NotesInOctave;

  return A4 * Math.pow(2, semitoneDifference / NotesInOctave);
}

async function generateTablatureFromSignal(signal, sampleRate, musicTempo, duration) {
  const tablature = [];
  let progressPercentage = 0;

  const intervalId = setInterval(() => {
    emitTabEvent(musicTempo, duration, tablature, progressPercentage)
  }, 1000);

  for (let i = 0; i < signal.length; i += FrameSize) {
    const frame = signal.slice(i, i + FrameSize);

    if (!Number.isInteger(Math.log2(frame.length))) {
      break;
    }

    const features = Meyda.extract(['amplitudeSpectrum', 'chroma'], frame);

    if (features?.amplitudeSpectrum && features?.chroma) {
      const spectrum = features.amplitudeSpectrum;
      const binWidth = sampleRate / FrameSize;

      // Root of Second moment is a useful heuristic threshold to find the first peak (which is the fundamental frequency)
      const threshold = Math.sqrt(spectrum.reduce((acc, num) => acc + num ** 2, 0) / spectrum.length)

      let fundamentalFreqBinIndex = 0;

      for (let i = 0; i < spectrum.length - 1; i++) {
        if (spectrum[i] > threshold && spectrum[i] > spectrum[i + 1]) {
          fundamentalFreqBinIndex = i
          break;
        }
      }

      const dominantFrequency = fundamentalFreqBinIndex * binWidth;

      // Chroma is more precise than spectrum feature
      const maxChromaIndex = features.chroma.indexOf(Math.max(...features.chroma));
      const chromaValue = features.chroma[maxChromaIndex];

      if (chromaValue > 0.5) {
        const noteName = NoteNamesKeyC[maxChromaIndex];
        const octave = frequencyToOctave(dominantFrequency)

        const exactFrequency = noteToFrequency(noteName, octave)

        const tab = frequencyToTab(exactFrequency);

        if (tab) {
          tablature.push({
            ...tab,
            note: noteName,
            octave,
            fullNote: `${noteName}${octave}`
          });
        }
      }
      else {
        tablature.push({ note: '-' });
      }

      progressPercentage = i / signal.length

      // Let the thread breathe (in the air)
      await new Promise(resolve => setTimeout(resolve, 0))
    }
  }

  emitTabEvent(musicTempo, duration, tablature, 1)

  clearInterval(intervalId)

  return tablature;
}
