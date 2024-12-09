const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const port = 3000;

app.use(express.static(path.join(__dirname, 'public')));

app.use(
  express.raw({
    type: 'audio/mpeg',
    limit: '10mb',
  })
);

app.post('/upload', (req, res) => {
  if (!req.headers['content-type'] || req.headers['content-type'] !== 'audio/mpeg') {
    return res.status(400).json({ error: 'Only MP3 files are allowed' });
  }

  const uploadDir = path.join(__dirname, 'uploads');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
  }

  const filePath = path.join(uploadDir, `uploaded-${Date.now()}.mp3`);
  fs.writeFile(filePath, req.body, (err) => {
    if (err) {
      console.error('File save error:', err);
      return res.status(500).json({ error: 'Failed to save file' });
    }
    console.log(`File uploaded: ${filePath}`);
    res.json({ message: 'File uploaded successfully', filePath });
  });
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
