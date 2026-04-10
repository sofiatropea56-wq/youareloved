require('dotenv').config({ quiet: true });

const express = require('express');
const multer = require('multer');
const path = require('path');
const { photoStore, providerName } = require('./lib/photo-store');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const maxFileSizeMb = providerName === 'cloudinary' ? 10 : 20;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxFileSizeMb * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    if (allowed.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  }
});

app.use(express.static(path.join(__dirname, 'public')));
if (providerName === 'local') {
  app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
}

app.get('/api/photos', async (req, res, next) => {
  try {
    const photos = await photoStore.listPhotos({ cursor: req.query.cursor || null });
    res.json(photos);
  } catch (error) {
    next(error);
  }
});

app.post('/api/photos', upload.array('photos', 50), async (req, res, next) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }

  try {
    const photos = await photoStore.uploadPhotos(req.files);
    res.json({ photos });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/photos/:id', async (req, res, next) => {
  try {
    const deleted = await photoStore.deletePhoto(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Photo not found' });
    }

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    return res
      .status(413)
      .json({ error: `Each image must be ${maxFileSizeMb} MB or smaller.` });
  }

  const statusCode = err.http_code || err.statusCode || 500;
  const message = statusCode >= 500 ? 'Something went wrong while processing the photo.' : err.message;

  if (statusCode >= 500) {
    console.error(err);
  }

  res.status(statusCode).json({ error: message || 'Unexpected error' });
});

app.listen(PORT, () => {
  console.log(`You Are Loved is running at http://localhost:${PORT}`);
  console.log(`Photo storage provider: ${providerName}`);
});
