const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const { v2: cloudinary } = require('cloudinary');
const { v4: uuidv4 } = require('uuid');

const ROOT_DIR = path.join(__dirname, '..');
const LOCAL_UPLOADS_DIR = path.join(ROOT_DIR, 'uploads');
const LOCAL_DATA_FILE = path.join(ROOT_DIR, 'photos.json');
const DEFAULT_PAGE_SIZE = 24;
const PHOTO_PAGE_SIZE = clampPageSize(process.env.PHOTO_PAGE_SIZE, DEFAULT_PAGE_SIZE);

const CLOUDINARY_FOLDER = process.env.CLOUDINARY_FOLDER || 'you-are-loved';
const CLOUDINARY_GALLERY_TAG = process.env.CLOUDINARY_GALLERY_TAG || 'you-are-loved-gallery';

const providerName = resolveProviderName();

if (providerName === 'cloudinary') {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true
  });
}

function clampPageSize(value, fallback) {
  const parsed = Number.parseInt(value || '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, 100);
}

function hasCloudinaryCredentials() {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  );
}

function resolveProviderName() {
  const configuredProvider = (process.env.PHOTO_STORAGE_PROVIDER || '').trim().toLowerCase();

  if (!configuredProvider) {
    return hasCloudinaryCredentials() ? 'cloudinary' : 'local';
  }

  if (!['local', 'cloudinary'].includes(configuredProvider)) {
    throw new Error(`Unsupported PHOTO_STORAGE_PROVIDER "${configuredProvider}". Use "local" or "cloudinary".`);
  }

  if (configuredProvider === 'cloudinary' && !hasCloudinaryCredentials()) {
    throw new Error(
      'PHOTO_STORAGE_PROVIDER is set to "cloudinary" but Cloudinary credentials are missing.'
    );
  }

  return configuredProvider;
}

function ensureLocalStorage() {
  if (!fs.existsSync(LOCAL_UPLOADS_DIR)) {
    fs.mkdirSync(LOCAL_UPLOADS_DIR, { recursive: true });
  }

  if (!fs.existsSync(LOCAL_DATA_FILE)) {
    fs.writeFileSync(LOCAL_DATA_FILE, JSON.stringify([], null, 2));
  }
}

function readLocalPhotos() {
  ensureLocalStorage();
  return JSON.parse(fs.readFileSync(LOCAL_DATA_FILE, 'utf8'));
}

function writeLocalPhotos(photos) {
  fs.writeFileSync(LOCAL_DATA_FILE, JSON.stringify(photos, null, 2));
}

function inferExtension(file) {
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (ext) return ext;

  switch (file.mimetype) {
    case 'image/jpeg':
      return '.jpg';
    case 'image/png':
      return '.png';
    case 'image/gif':
      return '.gif';
    case 'image/webp':
      return '.webp';
    default:
      return '';
  }
}

function paginate(items, cursor) {
  const offset = Number.parseInt(cursor || '0', 10);
  const start = Number.isFinite(offset) && offset >= 0 ? offset : 0;
  const end = start + PHOTO_PAGE_SIZE;

  return {
    photos: items.slice(start, end),
    nextCursor: end < items.length ? String(end) : null
  };
}

function buildCloudinaryUrls(publicId) {
  return {
    url: cloudinary.url(publicId, {
      secure: true,
      fetch_format: 'auto',
      quality: 'auto'
    }),
    thumbnailUrl: cloudinary.url(publicId, {
      secure: true,
      width: 1200,
      crop: 'limit',
      fetch_format: 'auto',
      quality: 'auto'
    })
  };
}

function mapCloudinaryPhoto(resource) {
  const urls = buildCloudinaryUrls(resource.public_id);

  return {
    id: resource.asset_id,
    publicId: resource.public_id,
    filename: resource.public_id,
    url: urls.url,
    thumbnailUrl: urls.thumbnailUrl,
    uploadedAt: resource.created_at || resource.uploaded_at,
    width: resource.width,
    height: resource.height,
    bytes: resource.bytes,
    format: resource.format
  };
}

function escapeSearchValue(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

async function listCloudinaryPhotos(cursor) {
  const search = cloudinary.search
    .expression(`resource_type:image AND tags="${escapeSearchValue(CLOUDINARY_GALLERY_TAG)}"`)
    .sort_by('created_at', 'desc')
    .max_results(PHOTO_PAGE_SIZE);

  if (cursor) {
    search.next_cursor(cursor);
  }

  const result = await search.execute();

  return {
    photos: (result.resources || []).map(mapCloudinaryPhoto),
    nextCursor: result.next_cursor || null
  };
}

function uploadToCloudinary(file) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: CLOUDINARY_FOLDER,
        resource_type: 'image',
        tags: [CLOUDINARY_GALLERY_TAG],
        use_filename: false,
        unique_filename: true,
        overwrite: false
      },
      (error, result) => {
        if (error) return reject(error);
        if (!result) return reject(new Error('Cloudinary upload did not return a result.'));
        resolve(mapCloudinaryPhoto(result));
      }
    );

    Readable.from(file.buffer).pipe(uploadStream).on('error', reject);
  });
}

async function deleteCloudinaryPhoto(id) {
  const result = await cloudinary.api.delete_resources_by_asset_ids([id]);
  const status = result.deleted ? result.deleted[id] : null;
  return status === 'deleted';
}

async function listLocalPhotos(cursor) {
  const photos = readLocalPhotos()
    .slice()
    .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));

  return paginate(photos, cursor);
}

async function uploadLocalPhotos(files) {
  ensureLocalStorage();

  const currentPhotos = readLocalPhotos();
  const newPhotos = files.map((file) => {
    const filename = `${uuidv4()}${inferExtension(file)}`;
    fs.writeFileSync(path.join(LOCAL_UPLOADS_DIR, filename), file.buffer);

    return {
      id: uuidv4(),
      filename,
      url: `/uploads/${filename}`,
      thumbnailUrl: `/uploads/${filename}`,
      uploadedAt: new Date().toISOString()
    };
  });

  currentPhotos.unshift(...newPhotos);
  writeLocalPhotos(currentPhotos);

  return newPhotos;
}

async function deleteLocalPhoto(id) {
  const photos = readLocalPhotos();
  const photo = photos.find((entry) => entry.id === id);

  if (!photo) return false;

  const filePath = path.join(LOCAL_UPLOADS_DIR, photo.filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  writeLocalPhotos(photos.filter((entry) => entry.id !== id));
  return true;
}

const localPhotoStore = {
  async listPhotos({ cursor } = {}) {
    return listLocalPhotos(cursor);
  },
  async uploadPhotos(files) {
    return uploadLocalPhotos(files);
  },
  async deletePhoto(id) {
    return deleteLocalPhoto(id);
  }
};

const cloudinaryPhotoStore = {
  async listPhotos({ cursor } = {}) {
    return listCloudinaryPhotos(cursor);
  },
  async uploadPhotos(files) {
    const uploads = await Promise.all(files.map(uploadToCloudinary));
    uploads.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
    return uploads;
  },
  async deletePhoto(id) {
    return deleteCloudinaryPhoto(id);
  }
};

module.exports = {
  pageSize: PHOTO_PAGE_SIZE,
  photoStore: providerName === 'cloudinary' ? cloudinaryPhotoStore : localPhotoStore,
  providerName
};
