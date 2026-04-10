const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = 3000;

const UPLOADS_DIR = path.join(__dirname, 'uploads');
const DATA_FILE = path.join(__dirname, 'photos.json');

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify([]));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, uuidv4() + ext);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    if (allowed.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  }
});

function readPhotos() {
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function writePhotos(photos) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(photos, null, 2));
}

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOADS_DIR));

app.get('/api/photos', (req, res) => {
  res.json(readPhotos());
});

app.post('/api/photos', upload.array('photos', 50), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }
  const photos = readPhotos();
  const newPhotos = req.files.map(file => ({
    id: uuidv4(),
    filename: file.filename,
    url: `/uploads/${file.filename}`,
    uploadedAt: new Date().toISOString()
  }));
  photos.unshift(...newPhotos);
  writePhotos(photos);
  res.json(newPhotos);
});

app.delete('/api/photos/:id', (req, res) => {
  const photos = readPhotos();
  const photo = photos.find(p => p.id === req.params.id);
  if (!photo) return res.status(404).json({ error: 'Photo not found' });

  const filePath = path.join(UPLOADS_DIR, photo.filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  const updated = photos.filter(p => p.id !== req.params.id);
  writePhotos(updated);
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`You Are Loved is running at http://localhost:${PORT}`);
});
