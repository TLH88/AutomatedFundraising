/**
 * Animals page controller (API-driven).
 */

const animalsState = {
  rows: [],
  editId: null,
  editOriginalPhotoUrl: '',
  photoChanged: false,
  saving: false,
};

document.addEventListener('DOMContentLoaded', () => {
  rebuildAnimalModalMarkup();
  bindAnimalUi();
  loadAnimals();
});

async function apiJson(url, options = {}) {
  const controller = new AbortController();
  const timeoutMs = Math.max(5000, Number(options.timeoutMs || 20000));
  const timer = setTimeout(() => controller.abort(new Error('Request timeout exceeded')), timeoutMs);
  const init = { ...(options || {}), signal: controller.signal };
  delete init.timeoutMs;
  try {
    const res = await fetch(url, init);
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload?.error || `HTTP ${res.status}`);
    return payload;
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function bindAnimalUi() {
  ['animalSearch', 'statusFilter', 'speciesFilter', 'ageFilter', 'sortBy'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener(id === 'animalSearch' ? 'input' : 'change', renderAnimals);
  });

  document.querySelector('.page-actions .btn-primary')?.addEventListener('click', (event) => {
    event.preventDefault();
    openAnimalModalForCreate();
  });
  document.querySelector('.page-actions .btn-secondary')?.addEventListener('click', exportAnimalsCsv);

  document.getElementById('animalsGrid')?.addEventListener('click', onAnimalsGridClick);
  document.querySelector('.load-more-container .btn')?.addEventListener('click', () => {
    showToast('Showing all currently loaded animals.');
  });

  const form = document.getElementById('addAnimalForm');
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    await handleAnimalFormSave();
  });
  document.getElementById('animalImageFileInput')?.addEventListener('change', onAnimalImageChange);
}

async function loadAnimals() {
  const guard = window.FundsApp?.createDataLoadGuard?.({
    target: '.main-content .container',
    message: 'Loading animals...',
  });
  guard?.start();
  try {
    const data = await apiJson('/api/animals?limit=200');
    const rows = Array.isArray(data.animals) ? data.animals : [];
    animalsState.rows = rows.map(normalizeAnimalRow);
    renderAnimals();
    hydrateAnimalStats(data.total ?? rows.length);
    guard?.success();
  } catch (err) {
    console.error(err);
    showToast(`Unable to load animals: ${String(err.message || 'Unknown error')}`);
    guard?.fail({ restoreFallback: false });
  }
}

function normalizeAnimalRow(row) {
  const species = String(row?.species || 'other').toLowerCase();
  const statusRaw = String(row?.status || 'in_care').toLowerCase();
  const statusUi = statusRaw.replace(/_/g, '-');
  return {
    id: String(row?.id || `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
    name: String(row?.name || 'Unnamed'),
    species,
    breed: String(row?.breed || 'Unknown'),
    age: String(row?.age || row?.age_group || 'Unknown'),
    gender: String(row?.gender || row?.sex || 'unknown').toLowerCase(),
    status: statusUi,
    rescue_date: row?.rescue_date || '',
    description: String(row?.notes || row?.description || ''),
    photo_url: String(row?.photo_url || row?.image_url || ''),
  };
}

function renderAnimals() {
  const grid = document.getElementById('animalsGrid');
  if (!grid) return;
  const rows = getFilteredAnimals();
  grid.innerHTML = rows.map(renderAnimalCard).join('');
  updateResultsCount(rows.length, animalsState.rows.length);
}

function getFilteredAnimals() {
  const search = (document.getElementById('animalSearch')?.value || '').trim().toLowerCase();
  const status = String(document.getElementById('statusFilter')?.value || 'all').toLowerCase();
  const species = String(document.getElementById('speciesFilter')?.value || 'all').toLowerCase();
  const age = String(document.getElementById('ageFilter')?.value || 'all').toLowerCase();
  const sortBy = String(document.getElementById('sortBy')?.value || 'recent').toLowerCase();

  let rows = animalsState.rows.filter((row) => {
    const hay = `${row.name} ${row.breed} ${row.description}`.toLowerCase();
    if (search && !hay.includes(search)) return false;
    if (status !== 'all' && row.status !== status) return false;
    if (species !== 'all' && row.species !== species) return false;
    if (age !== 'all' && !matchesAgeGroup(row.age, age)) return false;
    return true;
  });

  rows = rows.slice();
  rows.sort((a, b) => {
    if (sortBy === 'name') return a.name.localeCompare(b.name);
    if (sortBy === 'age') return estimateAgeNumber(a.age) - estimateAgeNumber(b.age);
    // recent
    return String(b.rescue_date || '').localeCompare(String(a.rescue_date || ''));
  });
  return rows;
}

function matchesAgeGroup(ageText, filter) {
  const n = estimateAgeNumber(ageText);
  if (filter === 'puppy') return n <= 1;
  if (filter === 'young') return n > 1 && n <= 3;
  if (filter === 'adult') return n > 3 && n <= 7;
  if (filter === 'senior') return n > 7;
  return true;
}

function estimateAgeNumber(text) {
  const t = String(text || '').toLowerCase();
  const num = Number.parseInt(t, 10);
  if (Number.isFinite(num)) return num;
  if (t.includes('baby')) return 0;
  if (t.includes('young')) return 2;
  if (t.includes('adult')) return 5;
  if (t.includes('senior')) return 10;
  return 0;
}

function renderAnimalCard(row) {
  const speciesEmoji = row.species === 'cat' ? '🐱' : row.species === 'dog' ? '🐶' : '🐾';
  const imageStyle = row.photo_url
    ? `background-image:url('${escapeHtml(row.photo_url)}'); background-size:cover; background-position:center;`
    : 'background:linear-gradient(135deg, rgba(16,185,129,.22), rgba(59,130,246,.18));';

  return `
    <div class="animal-card" data-animal-id="${escapeHtml(row.id)}">
      <div class="animal-card-image" style="${imageStyle}">
        <div class="animal-status-badge ${escapeHtml(row.status)}">${escapeHtml(toTitle(row.status.replace(/-/g, ' ')))}</div>
      </div>
      <div class="animal-card-body">
        <div class="animal-card-header">
          <h3 class="animal-name">${escapeHtml(row.name)}</h3>
          <span class="animal-species">${speciesEmoji} ${escapeHtml(toTitle(row.species))}</span>
        </div>
        <div class="animal-details">
          <div class="animal-detail-item"><span class="detail-label">Breed</span><span class="detail-value">${escapeHtml(row.breed)}</span></div>
          <div class="animal-detail-item"><span class="detail-label">Age</span><span class="detail-value">${escapeHtml(row.age)}</span></div>
          <div class="animal-detail-item"><span class="detail-label">Gender</span><span class="detail-value">${escapeHtml(toTitle(row.gender))}</span></div>
          <div class="animal-detail-item"><span class="detail-label">Rescued</span><span class="detail-value">${escapeHtml(formatDateShort(row.rescue_date))}</span></div>
        </div>
        <p class="animal-description">${escapeHtml(row.description || 'No description available.')}</p>
      </div>
      <div class="animal-card-footer">
        <button class="btn btn-sm btn-secondary" type="button" data-animal-action="view">View Profile</button>
        <button class="btn btn-sm btn-primary" type="button" data-animal-action="edit">Edit</button>
      </div>
    </div>
  `;
}

function updateResultsCount(visible, total) {
  const counter = document.querySelector('.load-more-container p');
  if (counter) counter.textContent = `Showing ${visible} of ${total} animals`;
}

function hydrateAnimalStats(totalCount) {
  const cards = document.querySelectorAll('.animals-stats-grid .stat-card');
  if (!cards.length) return;
  const adopted = animalsState.rows.filter((r) => r.status === 'adopted').length;
  const inCare = animalsState.rows.filter((r) => ['in-care', 'foster'].includes(r.status)).length;
  const available = animalsState.rows.filter((r) => r.status === 'available').length;
  const values = [totalCount, adopted, inCare, available];
  cards.forEach((card, idx) => {
    const valueEl = card.querySelector('.stat-card-value');
    if (valueEl) valueEl.textContent = Number(values[idx] || 0).toLocaleString();
  });
}

function onAnimalsGridClick(event) {
  const btn = event.target.closest('[data-animal-action]');
  if (!btn) return;
  const card = btn.closest('.animal-card');
  if (!card) return;
  const id = String(card.dataset.animalId || '');
  const row = animalsState.rows.find((r) => r.id === id);
  if (!row) return;
  const action = btn.getAttribute('data-animal-action');
  if (action === 'edit') openAnimalModalForEdit(row);
  if (action === 'view') openAnimalDetailModal(row);
}

function openAnimalModalForCreate() {
  animalsState.editId = null;
  animalsState.editOriginalPhotoUrl = '';
  animalsState.photoChanged = false;
  const form = document.getElementById('addAnimalForm');
  form?.reset();
  clearAnimalImagePreview();
  setAnimalModalTitle('Add New Animal');
  setAnimalSubmitLabel('Save');
  setAnimalFormStatus('', 'info');
  openModal('addAnimalModal');
}

function openAnimalModalForEdit(row) {
  animalsState.editId = row.id;
  animalsState.editOriginalPhotoUrl = String(row.photo_url || '');
  animalsState.photoChanged = false;
  const form = document.getElementById('addAnimalForm');
  if (!form) return;
  setField(form, 'name', row.name);
  setField(form, 'species', row.species);
  setField(form, 'breed', row.breed);
  setField(form, 'age', row.age);
  setField(form, 'gender', row.gender.toLowerCase());
  setField(form, 'status', row.status);
  setField(form, 'description', row.description);
  setField(form, 'rescue_date', row.rescue_date ? String(row.rescue_date).slice(0, 10) : '');
  setAnimalImagePreview(row.photo_url || '');
  setAnimalModalTitle('Edit Animal');
  setAnimalSubmitLabel('Save');
  setAnimalFormStatus('', 'info');
  openModal('addAnimalModal');
}

async function handleAnimalFormSave() {
  if (animalsState.saving) return;
  const form = document.getElementById('addAnimalForm');
  const submitBtn = document.getElementById('animalSubmitBtn');
  if (!form || !form.reportValidity()) return;

  animalsState.saving = true;
  const originalLabel = submitBtn?.textContent || 'Save';
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving...';
  }
  setAnimalFormStatus('Saving animal record...', 'info');

  try {
    const payload = buildAnimalPayloadFromForm(form);
    const method = animalsState.editId ? 'PUT' : 'POST';
    const url = animalsState.editId ? `/api/animals/${encodeURIComponent(animalsState.editId)}` : '/api/animals';
    const photoSize = String(payload.photo_url || '').length;
    const timeoutMs = photoSize > 400000 ? 90000 : 30000;
    const result = await apiJson(url, {
      method,
      timeoutMs,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const saved = normalizeAnimalRow(result?.animal || payload);

    if (animalsState.editId) {
      const i = animalsState.rows.findIndex((r) => r.id === animalsState.editId);
      if (i >= 0) animalsState.rows[i] = { ...animalsState.rows[i], ...saved };
    } else {
      animalsState.rows.unshift(saved);
    }

    renderAnimals();
    hydrateAnimalStats(animalsState.rows.length);
    setAnimalFormStatus('Animal saved successfully.', 'success');
    showToast('Animal profile saved.');
    window.FundsApp?.clearApiResponseCache?.();
    closeModal('addAnimalModal');
    form.reset();
    clearAnimalImagePreview();
    animalsState.editId = null;
    animalsState.editOriginalPhotoUrl = '';
    animalsState.photoChanged = false;
  } catch (err) {
    const message = String(err?.message || 'Unknown error');
    if (message.includes('401') || /auth/i.test(message)) {
      setAnimalFormStatus('Sign in required: Member or Administrator access needed.', 'error');
      showToast('Sign in as a Member or Administrator to save animals.');
      window.FundsApp?.openSignInModal?.();
    } else {
      setAnimalFormStatus(`Save failed: ${message}`, 'error');
      showToast(`Unable to save animal: ${message}`);
    }
  } finally {
    animalsState.saving = false;
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = originalLabel;
    }
  }
}

function buildAnimalPayloadFromForm(form) {
  const data = Object.fromEntries(new FormData(form));
  const payload = {
    name: String(data.name || '').trim(),
    species: String(data.species || 'other').toLowerCase(),
    breed: String(data.breed || '').trim(),
    age: String(data.age || '').trim(),
    gender: String(data.gender || '').toLowerCase(),
    status: String(data.status || 'in-care').replace(/-/g, '_').toLowerCase(),
    rescue_date: data.rescue_date || null,
    notes: String(data.description || '').trim(),
  };
  const currentPhoto = getPersistablePhotoUrl(getAnimalLocalPreviewUrl() || '');
  if (!animalsState.editId || animalsState.photoChanged || currentPhoto !== animalsState.editOriginalPhotoUrl) {
    payload.photo_url = currentPhoto;
  }
  return payload;
}

function setField(form, name, value) {
  const el = form.querySelector(`[name="${name}"]`);
  if (el) el.value = value || '';
}

function openAnimalDetailModal(row) {
  ensureAnimalProfileModalStyles();
  let modal = document.getElementById('animalDetailModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'animalDetailModal';
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-backdrop"></div>
      <div class="modal-content modal-large animal-profile-modal-content">
        <div class="modal-header">
          <h2 class="modal-title">Animal Profile</h2>
          <button type="button" class="modal-close" data-close-detail>&times;</button>
        </div>
        <div class="modal-body animal-profile-modal-body" id="animalDetailModalBody"></div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('.modal-backdrop')?.addEventListener('click', () => closeModal('animalDetailModal'));
    modal.querySelector('[data-close-detail]')?.addEventListener('click', () => closeModal('animalDetailModal'));
  }
  const body = document.getElementById('animalDetailModalBody');
  if (!body) return;
  const speciesEmoji = row.species === 'cat' ? '🐱' : row.species === 'dog' ? '🐶' : '🐾';
  body.innerHTML = `
    <section class="animal-profile-shell" aria-labelledby="animalProfileHeaderName">
      <div class="animal-profile-hero-card">
        <div class="animal-profile-hero-banner"></div>
        <div class="animal-profile-hero-body">
          <div class="animal-profile-hero-avatar-wrap">
            <div class="animal-profile-avatar-display">
              ${row.photo_url
                ? `<img src="${escapeHtml(row.photo_url)}" alt="${escapeHtml(row.name)}">`
                : `<div class="avatar-placeholder">${speciesEmoji}</div>`}
            </div>
          </div>
          <div class="animal-profile-hero-copy">
            <p class="animal-profile-hero-meta-label">Animal Profile For:</p>
            <h2 class="animal-profile-hero-name" id="animalProfileHeaderName">${escapeHtml(row.name)}</h2>
            <div class="animal-profile-hero-subline">
              <span class="animal-profile-hero-pill">${escapeHtml(toTitle(row.species))}</span>
              <span class="animal-profile-hero-pill">${escapeHtml(toTitle(row.status.replace(/-/g, ' ')))}</span>
            </div>
          </div>
        </div>
      </div>
      <div class="animal-profile-content-grid">
        <div class="card">
          <div class="card-header"><h3 class="card-title">Animal Details</h3></div>
          <div class="card-body">
            <div class="animal-profile-info-grid">
              <div class="animal-profile-info-item"><span class="animal-profile-label">Breed</span><span class="animal-profile-value">${escapeHtml(row.breed)}</span></div>
              <div class="animal-profile-info-item"><span class="animal-profile-label">Age</span><span class="animal-profile-value">${escapeHtml(row.age)}</span></div>
              <div class="animal-profile-info-item"><span class="animal-profile-label">Gender</span><span class="animal-profile-value">${escapeHtml(toTitle(row.gender))}</span></div>
              <div class="animal-profile-info-item"><span class="animal-profile-label">Rescue Date</span><span class="animal-profile-value">${escapeHtml(formatDateShort(row.rescue_date))}</span></div>
            </div>
          </div>
        </div>
        <div class="card">
          <div class="card-header"><h3 class="card-title">Notes</h3></div>
          <div class="card-body">
            <p class="text-muted">${escapeHtml(row.description || 'No description available.')}</p>
          </div>
        </div>
      </div>
    </section>
  `;
  openModal('animalDetailModal');
}

function ensureAnimalProfileModalStyles() {
  if (document.getElementById('animalProfileModalStyles')) return;
  const style = document.createElement('style');
  style.id = 'animalProfileModalStyles';
  style.textContent = `
    .animal-profile-modal-content { width: min(1040px, calc(100vw - 24px)); max-height: min(92vh, 920px); }
    .animal-profile-modal-body { padding: 0; }
    .animal-profile-shell { display: grid; gap: var(--spacing-xl); }
    .animal-profile-hero-card { border-bottom: 1px solid var(--border-color); background:
      radial-gradient(circle at 12% 8%, rgba(var(--primary-rgb), .24), transparent 56%),
      linear-gradient(155deg, var(--surface-card), var(--surface-elevated)); }
    .animal-profile-hero-banner { height: 112px; background:
      linear-gradient(120deg, rgba(var(--primary-rgb), .34), rgba(59,130,246,.14)); border-bottom: 1px solid var(--border-color); }
    .animal-profile-hero-body { position: relative; padding: 0 var(--spacing-xl) var(--spacing-xl) calc(var(--spacing-xl) + 160px); min-height: 138px; display: grid; align-content: end; }
    .animal-profile-hero-avatar-wrap { position: absolute; left: var(--spacing-xl); top: -56px; width: 140px; }
    .animal-profile-avatar-display { width: 140px; height: 140px; border-radius: 50%; border: 4px solid var(--surface-card); overflow: hidden; background: var(--surface-card); display: flex; align-items: center; justify-content: center; }
    .animal-profile-avatar-display img { width: 100%; height: 100%; object-fit: cover; }
    .animal-profile-avatar-display .avatar-placeholder { font-size: 2rem; }
    .animal-profile-hero-meta-label { margin: 0 0 6px; font-size: .82rem; letter-spacing: .06em; text-transform: uppercase; color: var(--text-muted); font-weight: 700; }
    .animal-profile-hero-name { margin: 0; font-size: clamp(1.4rem, 2vw, 2rem); line-height: 1.1; }
    .animal-profile-hero-subline { margin-top: 10px; display: flex; gap: 10px; flex-wrap: wrap; }
    .animal-profile-hero-pill { display: inline-flex; align-items: center; padding: 6px 10px; border-radius: 999px; border: 1px solid rgba(var(--primary-rgb), .55); background: rgba(var(--primary-rgb), .18); font-size: .8rem; font-weight: 600; }
    .animal-profile-content-grid { padding: 0 var(--spacing-xl) var(--spacing-xl); display: grid; grid-template-columns: 1.3fr 1fr; gap: var(--spacing-lg); }
    .animal-profile-info-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .animal-profile-info-item { display: grid; gap: 4px; padding: 12px; border: 1px solid var(--border-primary); border-radius: 10px; background: var(--surface-muted); }
    .animal-profile-label { color: var(--text-muted); font-size: .78rem; text-transform: uppercase; letter-spacing: .04em; }
    .animal-profile-value { color: var(--text-primary); font-weight: 600; }
    @media (max-width: 920px) {
      .animal-profile-hero-body { padding: var(--spacing-lg); min-height: 0; }
      .animal-profile-hero-avatar-wrap { position: static; width: auto; margin-top: -66px; margin-bottom: 12px; }
      .animal-profile-content-grid { grid-template-columns: 1fr; padding: 0 var(--spacing-lg) var(--spacing-lg); }
    }
  `;
  document.head.appendChild(style);
}

function exportAnimalsCsv() {
  const rows = [['Name', 'Species', 'Status', 'Breed', 'Age', 'Rescue Date']];
  getFilteredAnimals().forEach((r) => {
    rows.push([r.name, r.species, r.status, r.breed, r.age, r.rescue_date || '']);
  });
  const csv = rows.map((r) => r.map(csvEscape).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `animals-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast('Animal list exported.');
}

function rebuildAnimalModalMarkup() {
  const modal = document.getElementById('addAnimalModal');
  if (!modal) return;
  modal.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-content modal-large">
      <div class="modal-header">
        <h2 class="modal-title">Add New Animal</h2>
        <button class="modal-close" type="button" data-animal-modal-close>&times;</button>
      </div>
      <div class="modal-body">
        <form id="addAnimalForm" class="form">
          <div class="form-section">
            <h3 class="form-section-title">Basic Information</h3>
            <div class="form-row">
              <div class="input-group">
                <label class="label">Name *</label>
                <input type="text" class="input" name="name" placeholder="Animal name" required>
              </div>
              <div class="input-group">
                <label class="label">Species *</label>
                <select class="input" name="species" required>
                  <option value="">Select species</option>
                  <option value="dog">Dog</option>
                  <option value="cat">Cat</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
            <div class="form-row">
              <div class="input-group">
                <label class="label">Breed</label>
                <input type="text" class="input" name="breed" placeholder="Breed">
              </div>
              <div class="input-group">
                <label class="label">Age</label>
                <input type="text" class="input" name="age" placeholder="e.g., 3 years">
              </div>
            </div>
            <div class="form-row">
              <div class="input-group">
                <label class="label">Gender *</label>
                <select class="input" name="gender" required>
                  <option value="">Select gender</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              </div>
              <div class="input-group">
                <label class="label">Status *</label>
                <select class="input" name="status" required>
                  <option value="">Select status</option>
                  <option value="available">Available for Adoption</option>
                  <option value="in-care">In Care</option>
                  <option value="foster">In Foster</option>
                  <option value="adopted">Adopted</option>
                </select>
              </div>
            </div>
            <div class="input-group">
              <label class="label">Description</label>
              <textarea class="input" rows="4" name="description" placeholder="Tell us about this animal..."></textarea>
            </div>
            <div class="input-group">
              <label class="label">Photo Upload</label>
              <input type="file" class="input" id="animalImageFileInput" accept="image/*">
              <p class="text-muted text-caption" style="margin-top:6px;">Upload a photo (JPG, PNG, WEBP).</p>
              <div id="animalImagePreviewWrap" style="display:none; margin-top:10px;">
                <img id="animalImagePreview" alt="Animal image preview" style="width:100%; max-height:180px; object-fit:cover; border-radius:10px; border:1px solid var(--border-primary);">
              </div>
            </div>
            <div class="input-group">
              <label class="label">Rescue Date *</label>
              <input type="date" class="input" name="rescue_date" required>
            </div>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" data-animal-modal-close>Cancel</button>
            <button type="submit" class="btn btn-primary" id="animalSubmitBtn">Save</button>
          </div>
          <p id="animalFormStatus" class="text-caption" style="margin-top:10px; color:var(--text-secondary);"></p>
        </form>
      </div>
    </div>
  `;
  modal.querySelectorAll('[data-animal-modal-close]').forEach((el) => {
    el.addEventListener('click', () => closeModal('addAnimalModal'));
  });
  modal.querySelector('.modal-backdrop')?.addEventListener('click', () => closeModal('addAnimalModal'));
}

async function onAnimalImageChange(event) {
  const file = event?.target?.files?.[0];
  if (!file) return clearAnimalImagePreview();
  try {
    const dataUrl = await imageFileToOptimizedDataUrl(file);
    setAnimalImagePreview(dataUrl);
    animalsState.photoChanged = true;
  } catch {
    clearAnimalImagePreview();
    setAnimalFormStatus('Unable to read selected image file.', 'error');
    showToast('Unable to read selected image file.');
  }
}

function setAnimalImagePreview(url) {
  const wrap = document.getElementById('animalImagePreviewWrap');
  const img = document.getElementById('animalImagePreview');
  if (!wrap || !img) return;
  const prev = img.dataset.objectUrl || '';
  if (prev && prev.startsWith('blob:')) {
    try { URL.revokeObjectURL(prev); } catch {}
    img.dataset.objectUrl = '';
  }
  if (!url) {
    wrap.style.display = 'none';
    img.removeAttribute('src');
    return;
  }
  img.src = url;
  if (String(url).startsWith('blob:')) img.dataset.objectUrl = String(url);
  wrap.style.display = '';
}

function clearAnimalImagePreview() {
  const input = document.getElementById('animalImageFileInput');
  if (input) input.value = '';
  setAnimalImagePreview('');
  animalsState.photoChanged = false;
}

function getAnimalLocalPreviewUrl() {
  const src = document.getElementById('animalImagePreview')?.getAttribute('src') || '';
  return String(src || '');
}

function getPersistablePhotoUrl(url) {
  const value = String(url || '').trim();
  if (value.startsWith('http://') || value.startsWith('https://')) return value;
  if (value.startsWith('data:image/')) return value;
  return '';
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('File read failed'));
    reader.readAsDataURL(file);
  });
}

async function imageFileToOptimizedDataUrl(file) {
  const raw = await fileToDataUrl(file);
  if (!raw.startsWith('data:image/')) return raw;
  return optimizeImageDataUrl(raw, {
    maxWidth: 1280,
    maxHeight: 1280,
    quality: 0.82,
  });
}

function optimizeImageDataUrl(dataUrl, options = {}) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const maxWidth = Math.max(320, Number(options.maxWidth || 1280));
      const maxHeight = Math.max(320, Number(options.maxHeight || 1280));
      const quality = Math.min(0.92, Math.max(0.5, Number(options.quality || 0.82)));
      const scale = Math.min(1, maxWidth / img.width, maxHeight / img.height);
      const width = Math.max(1, Math.round(img.width * scale));
      const height = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(dataUrl);
      ctx.drawImage(img, 0, 0, width, height);
      try {
        resolve(canvas.toDataURL('image/jpeg', quality));
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

function setAnimalSubmitLabel(label) {
  const btn = document.getElementById('animalSubmitBtn');
  if (btn) btn.textContent = label || 'Save';
}

function setAnimalModalTitle(title) {
  const el = document.querySelector('#addAnimalModal .modal-title');
  if (el) el.textContent = title;
}

function setAnimalFormStatus(message, tone = 'info') {
  const el = document.getElementById('animalFormStatus');
  if (!el) return;
  el.textContent = String(message || '');
  const palette = { info: 'var(--text-secondary)', success: '#10B981', error: '#EF4444' };
  el.style.color = palette[tone] || palette.info;
}

function openModal(id) {
  document.getElementById(id)?.classList.add('active');
}

function closeModal(id) {
  document.getElementById(id)?.classList.remove('active');
}

function showToast(message) {
  if (window.FundsApp?.showToast) {
    window.FundsApp.showToast(message);
  } else {
    console.log(message);
  }
}

function csvEscape(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toTitle(value) {
  return String(value || '').replace(/\b\w/g, (m) => m.toUpperCase());
}

function formatDateShort(value) {
  if (!value) return 'Unknown';
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString();
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
