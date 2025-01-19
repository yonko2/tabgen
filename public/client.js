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

function loadTab(notes) {
    document.getElementById('tab').replaceChildren()
    
    let data = 'options tab-stems=true tab-stem-direction=down'

    for (let i = 0; i < notes.result.length; i++) {
        const element = notes.result[i];

        if(i%8===0){
            data+=`\ntabstave notation=true\nnotes`
        }

        if (element.fret) {
            data += ` ${element.fret}/${element.string}`
        }
        else {
            data += ' ## '
        }

        if ((i+1)%4===0){
            data+= '|'
        }
    }

    const VF = Vex.Flow

    const renderer = new VF.Renderer($('#tab')[0],
        VF.Renderer.Backends.SVG);

    const artist = new Artist(10, 10, 750, { scale: 0.8 });
    const tab = new VexTab(artist);

    tab.parse(data);
    artist.render(renderer);
}