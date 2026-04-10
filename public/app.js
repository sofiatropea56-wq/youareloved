const gallery = document.getElementById('gallery');
const fileInput = document.getElementById('fileInput');
const uploadProgress = document.getElementById('uploadProgress');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightboxImg');
const lightboxClose = document.getElementById('lightboxClose');
const lightboxDelete = document.getElementById('lightboxDelete');
const toast = document.getElementById('toast');

let currentPhotoId = null;

// ── Load photos ─────────────────────────────────────────────
async function loadPhotos() {
  try {
    const res = await fetch('/api/photos');
    const photos = await res.json();
    renderGallery(photos);
  } catch {
    showToast('Could not load photos.');
  }
}

function renderGallery(photos) {
  gallery.innerHTML = '';
  if (photos.length === 0) {
    gallery.innerHTML = `
      <div class="empty-state" style="column-span:all">
        <div class="icon">🌸</div>
        <p>No memories yet — be the first to upload!</p>
      </div>`;
    return;
  }
  photos.forEach(photo => gallery.appendChild(createCard(photo)));
}

function createCard(photo) {
  const card = document.createElement('div');
  card.className = 'photo-card';
  card.dataset.id = photo.id;

  const img = document.createElement('img');
  img.src = photo.url;
  img.alt = 'Memory';
  img.loading = 'lazy';

  const del = document.createElement('button');
  del.className = 'delete-btn';
  del.title = 'Delete photo';
  del.innerHTML = '&#x2715;';
  del.addEventListener('click', e => {
    e.stopPropagation();
    deletePhoto(photo.id);
  });

  img.addEventListener('click', () => openLightbox(photo));

  card.appendChild(img);
  card.appendChild(del);
  return card;
}

// ── Upload ───────────────────────────────────────────────────
fileInput.addEventListener('change', async () => {
  if (!fileInput.files.length) return;

  const formData = new FormData();
  Array.from(fileInput.files).forEach(f => formData.append('photos', f));

  uploadProgress.classList.remove('hidden');
  progressFill.style.width = '0%';
  progressText.textContent = 'Uploading…';

  try {
    await uploadWithProgress(formData);
    progressFill.style.width = '100%';
    progressText.textContent = 'Done!';
    setTimeout(() => uploadProgress.classList.add('hidden'), 800);
    await loadPhotos();
    showToast('Photos uploaded!');
  } catch {
    uploadProgress.classList.add('hidden');
    showToast('Upload failed. Please try again.');
  }

  fileInput.value = '';
});

function uploadWithProgress(formData) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/photos');

    xhr.upload.addEventListener('progress', e => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 90);
        progressFill.style.width = pct + '%';
        progressText.textContent = `Uploading… ${pct}%`;
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(JSON.parse(xhr.responseText));
      else reject(new Error(xhr.statusText));
    });

    xhr.addEventListener('error', reject);
    xhr.send(formData);
  });
}

// ── Delete ───────────────────────────────────────────────────
async function deletePhoto(id) {
  try {
    const res = await fetch(`/api/photos/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error();
    const card = gallery.querySelector(`[data-id="${id}"]`);
    if (card) card.remove();
    closeLightbox();
    if (gallery.children.length === 0) renderGallery([]);
    showToast('Photo deleted.');
  } catch {
    showToast('Could not delete photo.');
  }
}

// ── Lightbox ─────────────────────────────────────────────────
function openLightbox(photo) {
  currentPhotoId = photo.id;
  lightboxImg.src = photo.url;
  lightbox.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  lightbox.classList.add('hidden');
  lightboxImg.src = '';
  currentPhotoId = null;
  document.body.style.overflow = '';
}

lightboxClose.addEventListener('click', closeLightbox);
lightbox.addEventListener('click', e => { if (e.target === lightbox) closeLightbox(); });
lightboxDelete.addEventListener('click', () => { if (currentPhotoId) deletePhoto(currentPhotoId); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLightbox(); });

// ── Toast ────────────────────────────────────────────────────
let toastTimer;
function showToast(msg) {
  clearTimeout(toastTimer);
  toast.textContent = msg;
  toast.classList.remove('hidden');
  toastTimer = setTimeout(() => toast.classList.add('hidden'), 3000);
}

// ── Poll for new photos every 10s ────────────────────────────
loadPhotos();
setInterval(loadPhotos, 10000);
