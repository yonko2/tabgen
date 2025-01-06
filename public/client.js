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
    const data = `
  tabstave notation=true key=A time=4/4

  notes :q =|: (5/2.5/3.7/4) :8 7-5h6/3 ^3^ 5h6-7/5 ^3^ :q 7V/4 |
  notes :8 t12p7/4 s5s3/4 :8 3s:16:5-7/5 :q p5/4
  text :w, |#segno, ,|, :hd, , #tr
`

    const VF = Vex.Flow

    const renderer = new VF.Renderer($('#tab')[0],
        VF.Renderer.Backends.SVG);

    const artist = new Artist(10, 10, 750, { scale: 0.8 });
    const tab = new VexTab(artist);

    tab.parse(data);
    artist.render(renderer);
}