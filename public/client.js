import { NoteSize, VexTabDurations } from './constants.js';

const VexTabNoteDuration = VexTabDurations[NoteSize]

const form = document.getElementById('uploadForm');

form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const formData = new FormData(form);
    const file = formData.get('audioFile');

    const response = await fetch('/analyze', {
        method: 'POST',
        headers: { 'Content-Type': file.type },
        body: file,
    });

    const result = await response.json();
    loadTab(result)
});

function getVexTabNote(note) {
    return ` ${note.fret}/${note.string}:${VexTabNoteDuration}`
}

function loadTab(notes) {
    document.getElementById('tab').replaceChildren()

    if (VexTabNoteDuration === undefined) {
        throw new Error("Unsupported note duration")
    }

    let data = 'options tab-stems=true tab-stem-direction=down'

    let lastVexTabNote = null;
    notes.result.forEach((note, i) => {
        if (i % (8 * NoteSize) === 0) {
            data += `\ntabstave notation=true\nnotes`
        }

        const vexTabNote = note ? getVexTabNote(note) : null

        if (note && vexTabNote !== lastVexTabNote) {
            data += vexTabNote
            lastVexTabNote = vexTabNote
        }
        else {
            data += ' ## '
        }

        if ((i + 1) % (4 * NoteSize) === 0) {
            data += '|'
            lastVexTabNote = null
        }
    });

    const VF = Vex.Flow

    const renderer = new VF.Renderer($('#tab')[0],
        VF.Renderer.Backends.SVG);

    const artist = new Artist(10, 10, 750, { scale: 0.8 });
    const tab = new VexTab(artist);

    tab.parse(data);
    artist.render(renderer);
}