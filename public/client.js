const form = document.getElementById('uploadForm');
const responseDiv = document.getElementById('response');

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
    responseDiv.innerText = JSON.stringify(result, null, 2);
});