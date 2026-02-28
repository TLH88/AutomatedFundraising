/**
 * Success Stories JavaScript
 */

const storiesState = { rows: [], filtered: [], editId: '' };

document.addEventListener('DOMContentLoaded', () => {
  initStoryForm();
  initStoryActions();
  initStorySearch();
  loadStories();
});

async function apiJson(url, options = {}) {
  if (window.FundsApp?.apiJson) return window.FundsApp.apiJson(url, options);
  const res = await fetch(url, options);
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload?.error || `HTTP ${res.status}`);
  return payload;
}

function toast(message) {
  if (window.FundsApp?.showToast) return window.FundsApp.showToast(message);
  console.log(message);
}

function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function initStorySearch() {
  document.getElementById('storiesSearchInput')?.addEventListener('input', applyStoryFilters);
}

async function loadStories() {
  const grid = document.getElementById('storiesGrid');
  if (grid) grid.innerHTML = '<div class="story-card"><div class="story-card-body"><h3 class="story-title">Loading stories...</h3></div></div>';
  try {
    const data = await apiJson('/api/stories?limit=500', { useCache: false });
    storiesState.rows = Array.isArray(data.stories) ? data.stories : [];
    applyStoryFilters();
    renderStoryStats();
  } catch (err) {
    if (grid) grid.innerHTML = `<div class="story-card"><div class="story-card-body"><h3 class="story-title">Unable to load stories: ${esc(err.message || err)}</h3></div></div>`;
  }
}

function applyStoryFilters() {
  const q = String(document.getElementById('storiesSearchInput')?.value || '').trim().toLowerCase();
  storiesState.filtered = storiesState.rows.filter((s) => {
    if (!q) return true;
    const hay = `${s.title || ''} ${s.excerpt || s.summary || ''} ${s.body || s.content || ''} ${s.status || ''}`.toLowerCase();
    return hay.includes(q);
  });
  renderStoryCards();
}

function defaultStoryImage() {
  return 'https://images.unsplash.com/photo-1450778869180-41d0601e046e?auto=format&fit=crop&w=1200&q=80';
}

function renderStoryCards() {
  const grid = document.getElementById('storiesGrid');
  if (!grid) return;
  const rows = storiesState.filtered;
  if (!rows.length) {
    grid.innerHTML = '<div class="story-card"><div class="story-card-body"><h3 class="story-title">No stories found.</h3></div></div>';
    return;
  }

  grid.innerHTML = rows.map((s) => {
    const status = String(s.status || 'draft').toLowerCase();
    const image = String(s.cover_image_url || '').trim() || defaultStoryImage();
    const created = s.created_at || s.updated_at || s.published_at || '';
    const views = Number(s.views || 0);
    const likes = Number(s.likes || 0);
    return `
      <div class="story-card" data-story-id="${esc(String(s.id || ''))}">
        <div class="story-card-image" style="background-image:url('${esc(image)}');"></div>
        <div class="story-card-body">
          <div class="story-card-header">
            <h3 class="story-title">${esc(s.title || 'Untitled Story')}</h3>
            <div class="story-status-badge ${esc(status)}">${esc(status)}</div>
          </div>
          <p class="story-excerpt">${esc(s.excerpt || s.summary || s.body || s.content || 'No story summary provided.')}</p>
          <div class="story-meta">
            <span class="story-meta-item">📅 ${esc(created ? new Date(created).toLocaleDateString() : 'N/A')}</span>
            <span class="story-meta-item">👁️ ${esc(String(views))} views</span>
            <span class="story-meta-item">❤️ ${esc(String(likes))} likes</span>
          </div>
          <div class="story-actions">
            <button class="btn btn-sm btn-secondary" type="button" data-action="view">View</button>
            <button class="btn btn-sm btn-secondary" type="button" data-action="edit">Edit</button>
            <button class="btn btn-sm btn-primary" type="button" data-action="publish">Publish</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function renderStoryStats() {
  const rows = storiesState.rows;
  const published = rows.filter((r) => String(r.status || '').toLowerCase() === 'published').length;
  const drafts = rows.filter((r) => String(r.status || '').toLowerCase() !== 'published').length;
  const views = rows.reduce((sum, r) => sum + Number(r.views || 0), 0);
  setText('storiesStatPublished', String(published));
  setText('storiesStatViews', views.toLocaleString());
  setText('storiesStatDrafts', String(drafts));
  setText('storiesStatImpact', new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(views * 2));
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function initStoryForm() {
  const form = document.getElementById('newStoryForm');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    const payload = {
      title: String(data.title || '').trim(),
      excerpt: String(data.excerpt || '').trim(),
      body: String(data.body || '').trim(),
      cover_image_url: String(data.cover_image_url || '').trim(),
      status: String(data.status || 'draft').trim(),
    };
    if (!payload.title || !payload.body) {
      toast('Story title and content are required.');
      return;
    }
    const btn = document.getElementById('createStorySubmitBtn');
    const old = btn?.textContent || 'Create Story';
    if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }
    try {
      if (storiesState.editId) {
        await apiJson(`/api/stories/${encodeURIComponent(String(storiesState.editId))}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        toast('Story updated successfully');
      } else {
        await apiJson('/api/stories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        toast('Story created successfully');
      }
      closeModal('newStoryModal');
      form.reset();
      storiesState.editId = '';
      if (btn) btn.textContent = 'Create Story';
      await loadStories();
    } catch (err) {
      toast(`Failed to create story: ${err.message || err}`);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = old; }
    }
  });
}

function initStoryActions() {
  document.querySelector('.page-actions .btn-primary')?.addEventListener('click', () => {
    storiesState.editId = '';
    const form = document.getElementById('newStoryForm');
    form?.reset?.();
    const btn = document.getElementById('createStorySubmitBtn');
    if (btn) btn.textContent = 'Create Story';
  });

  document.getElementById('storiesPublishedBtn')?.addEventListener('click', () => {
    document.getElementById('storiesSearchInput') && (document.getElementById('storiesSearchInput').value = '');
    storiesState.filtered = storiesState.rows.filter((s) => String(s.status || '').toLowerCase() === 'published');
    renderStoryCards();
  });

  document.getElementById('storiesGrid')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const card = btn.closest('[data-story-id]');
    const id = card?.getAttribute('data-story-id');
    const row = storiesState.rows.find((s) => String(s.id) === String(id));
    if (!row) return;

    const action = btn.getAttribute('data-action');
    if (action === 'view') {
      toast(`${row.title}: ${(row.excerpt || row.summary || '').slice(0, 120)}`);
      return;
    }
    if (action === 'edit') {
      prefillStoryForm(row);
      openModal('newStoryModal');
      return;
    }
    if (action === 'publish') {
      await apiJson(`/api/stories/${encodeURIComponent(String(id))}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'published' }),
      });
      toast('Story published');
      await loadStories();
    }
  });
}

function prefillStoryForm(story) {
  const form = document.getElementById('newStoryForm');
  if (!form) return;
  form.elements.title.value = story.title || '';
  form.elements.excerpt.value = story.excerpt || story.summary || '';
  form.elements.body.value = story.body || story.content || '';
  form.elements.cover_image_url.value = story.cover_image_url || '';
  form.elements.status.value = story.status || 'draft';
  storiesState.editId = String(story.id || '');
  const btn = document.getElementById('createStorySubmitBtn');
  if (btn) btn.textContent = 'Save Story';
}

function openModal(id) {
  document.getElementById(id)?.classList.add('active');
}

function closeModal(id) {
  if (window.FundsApp?.closeModal) return window.FundsApp.closeModal(id);
  document.getElementById(id)?.classList.remove('active');
}
