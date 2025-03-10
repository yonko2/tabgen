import { NoteSize, VexTabDurations } from './constants.js';

const VexTabNoteDuration = VexTabDurations[NoteSize]

const socket = io();

const form = document.getElementById('uploadForm');

socket.on('tab', (tab) => { 
    loadTab(tab)

    document.getElementById('tab').scrollIntoView({ behavior: 'smooth', block: 'end' })
})

socket.on('tab-complete', () => {
    loadingText.classList.add('hidden')
})

function emptyTab() {
    document.getElementById('tab').replaceChildren()
}

form.addEventListener('submit', (event) => {
    event.preventDefault();

    emptyTab()

    const formData = new FormData(form);
    const file = formData.get('audioFile');

    const loadingText = document.getElementById('loadingText')

    loadingText.classList.remove('hidden')

    fetch('/analyze', {
        method: 'POST',
        headers: { 'Content-Type': file.type },
        body: file,
    });
});

function getVexTabNote(note) {
    return ` ${note.fret}/${note.string}:${VexTabNoteDuration}`
}

function loadTab(notes) {
    emptyTab()

    if (VexTabNoteDuration === undefined) {
        throw new Error("Unsupported note duration")
    }

    let data = 'options tab-stems=true tab-stem-direction=down'

    let lastVexTabNote = null;
    notes.forEach((note, i) => {
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