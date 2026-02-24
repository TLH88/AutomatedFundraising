/**
 * Funds Explorer page: search and review potential donor organizations.
 */

const explorerState = {
  organizations: [],
  activeOrganization: null,
  loading: false,
};

document.addEventListener('DOMContentLoaded', () => {
  initExplorerSearch();
  initExplorerActions();
  ensureExplorerModal();
  runExplorerSearch();
});

function initExplorerSearch() {
  const form = document.getElementById('explorerSearchForm');
  if (!form) return;
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    runExplorerSearch();
  });
}

function initExplorerActions() {
  const list = document.getElementById('explorerResultsList');
  if (!list) return;
  list.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-explorer-view-id]');
    if (!button) return;
    const orgId = button.getAttribute('data-explorer-view-id');
    if (!orgId) return;
    await openOrganizationProfile(orgId);
  });
}

async function runExplorerSearch() {
  if (explorerState.loading) return;
  explorerState.loading = true;
  const list = document.getElementById('explorerResultsList');
  const countEl = document.getElementById('explorerResultsCount');
  const metaEl = document.getElementById('explorerSearchMeta');
  if (list) {
    list.innerHTML = '<div class="explorer-empty">Searching potential donor organizations...</div>';
  }
  if (countEl) countEl.textContent = 'Loading...';

  const params = buildExplorerQueryParams();
  try {
    const data = await apiJson(`/api/explorer/organizations?${params.toString()}`);
    explorerState.organizations = Array.isArray(data.organizations) ? data.organizations : [];
    renderExplorerResults(explorerState.organizations);
    if (countEl) {
      const total = Number(data.total || explorerState.organizations.length || 0);
      countEl.textContent = `${total} result${total === 1 ? '' : 's'}`;
    }
    if (metaEl && data.filters_applied) {
      const f = data.filters_applied;
      const bits = [];
      if (f.location) bits.push(`Location: ${f.location}`);
      if (f.radius_miles) bits.push(`Radius: ${f.radius_miles} miles`);
      bits.push(`Limit: ${f.limit}`);
      bits.push(f.min_score > 0 ? `Score: >= ${f.min_score}` : 'Score: All');
      bits.push('Radius filtering is best-effort unless organization coordinates are available.');
      metaEl.textContent = bits.join(' • ');
    }
  } catch (error) {
    console.error('Explorer search failed', error);
    renderExplorerResults([]);
    if (countEl) countEl.textContent = '0 results';
    notifyUser('Unable to load explorer results right now.');
  } finally {
    explorerState.loading = false;
  }
}

function buildExplorerQueryParams() {
  const params = new URLSearchParams();
  const location = document.getElementById('explorerLocation')?.value?.trim() || '';
  const radius = clampInt(document.getElementById('explorerRadius')?.value, 1, 10000, 25);
  const limit = clampInt(document.getElementById('explorerLimit')?.value, 1, 1000, 50);
  const scoreRaw = document.getElementById('explorerScoreFilter')?.value || 'all';
  const minScore = scoreRaw === 'all' ? 0 : clampInt(scoreRaw, 0, 100, 0);

  if (location) params.set('location', location);
  params.set('radius_miles', String(radius));
  params.set('limit', String(limit));
  params.set('min_score', String(minScore));
  return params;
}

function renderExplorerResults(organizations) {
  const list = document.getElementById('explorerResultsList');
  if (!list) return;

  if (!Array.isArray(organizations) || organizations.length === 0) {
    list.innerHTML = '<div class="explorer-empty">No organizations matched your search. Try a broader location or lower score threshold.</div>';
    return;
  }

  list.innerHTML = organizations.map((org) => {
    const score = Number(org.donation_potential_score || 0);
    const locationText = [org.city, org.state].filter(Boolean).join(', ') || org.address || 'Location not available';
    return `
      <div class="explorer-result-item" data-org-id="${escapeHtml(String(org.id || ''))}">
        <div>
          <p class="explorer-result-name">${escapeHtml(org.name || 'Unknown Organization')}</p>
          <p class="explorer-result-sub">${escapeHtml(locationText)}</p>
        </div>
        <div>${escapeHtml(formatCategory(org.category))}</div>
        <div><span class="explorer-score-pill">${escapeHtml(String(score))}</span></div>
        <div>
          <button type="button" class="btn btn-secondary btn-pill" data-explorer-view-id="${escapeHtml(String(org.id || ''))}">View</button>
        </div>
      </div>
    `;
  }).join('');
}

async function openOrganizationProfile(orgId) {
  const modal = ensureExplorerModal();
  const body = modal.querySelector('#explorerProfileModalBody');
  if (!body) return;
  body.innerHTML = '<div class="explorer-empty">Loading organization profile...</div>';
  modal.classList.add('active');

  try {
    const data = await apiJson(`/api/explorer/organizations/${encodeURIComponent(orgId)}?include_contacts=true`);
    const org = data.organization || null;
    if (!org) throw new Error('No organization in response');
    explorerState.activeOrganization = org;
    body.innerHTML = renderOrganizationProfile(org);
    wireExplorerProfileActions(modal, org);
  } catch (error) {
    console.error('Failed to load organization profile', error);
    body.innerHTML = '<div class="explorer-empty">Unable to load organization details.</div>';
    notifyUser('Unable to load organization details.');
  }
}

function renderOrganizationProfile(org) {
  const score = Number(org.donation_potential_score || 0);
  const initials = getInitials(org.name || 'Organization');
  const locationLine = [org.city, org.state, org.postal_code].filter(Boolean).join(', ');
  const contacts = Array.isArray(org.contacts) ? org.contacts : [];
  const websiteHost = safeHostname(org.website);

  return `
    <div class="explorer-modal-shell">
      <section class="explorer-profile-hero" aria-labelledby="explorerOrgProfileName">
        <div class="explorer-profile-hero-top"></div>
        <div class="explorer-profile-hero-body">
          <div class="explorer-profile-avatar" aria-hidden="true">${escapeHtml(initials)}</div>
          <div>
            <h2 class="explorer-profile-name" id="explorerOrgProfileName">${escapeHtml(org.name || 'Unknown Organization')}</h2>
            <div class="explorer-profile-meta">
              <span class="explorer-profile-pill">${escapeHtml(formatCategory(org.category))}</span>
              <span class="explorer-profile-pill">Potential Score ${escapeHtml(String(score))}</span>
              <span>${escapeHtml(locationLine || org.address || 'Location unavailable')}</span>
            </div>
          </div>
          <div class="page-actions" style="justify-content:flex-end;">
            ${org.website ? `<a class="btn btn-secondary btn-pill" href="${escapeHtml(org.website)}" target="_blank" rel="noopener noreferrer">Open Website</a>` : ''}
          </div>
        </div>
      </section>

      <div class="card">
        <div class="card-header"><h3 class="card-title">Organization Details</h3></div>
        <div class="card-body">
          <div class="explorer-detail-grid">
            ${renderDetailItem('Category', formatCategory(org.category))}
            ${renderDetailItem('Potential Score', String(score || 0))}
            ${renderDetailItem('Website', org.website ? `<a href="${escapeHtml(org.website)}" target="_blank" rel="noopener noreferrer">${escapeHtml(websiteHost || org.website)}</a>` : 'Not provided', true)}
            ${renderDetailItem('Email', org.email ? `<a href="mailto:${escapeHtml(org.email)}">${escapeHtml(org.email)}</a>` : 'Not provided', true)}
            ${renderDetailItem('Phone', org.phone ? `<a href="tel:${escapeHtml(org.phone)}">${escapeHtml(org.phone)}</a>` : 'Not provided', true)}
            ${renderDetailItem('Address', org.address || 'Not provided')}
            ${renderDetailItem('City / State', [org.city, org.state].filter(Boolean).join(', ') || 'Not provided')}
            ${renderDetailItem('Postal Code', org.postal_code || 'Not provided')}
          </div>
          ${org.notes ? `<div class="explorer-detail-item" style="margin-top:12px;"><p class="explorer-detail-label">Notes</p><p class="explorer-detail-value" style="font-weight:500;">${escapeHtml(org.notes)}</p></div>` : ''}
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Associated Contacts</h3>
          <span class="badge badge-info">${contacts.length} contact${contacts.length === 1 ? '' : 's'}</span>
        </div>
        <div class="card-body">
          ${contacts.length ? `
            <div class="explorer-contact-list">
              ${contacts.map(renderContactCard).join('')}
            </div>
          ` : '<div class="explorer-empty">No contacts are associated with this organization yet.</div>'}
        </div>
      </div>
    </div>
  `;
}

function renderDetailItem(label, value, allowHtml = false) {
  return `
    <div class="explorer-detail-item">
      <p class="explorer-detail-label">${escapeHtml(label)}</p>
      <p class="explorer-detail-value">${allowHtml ? value : escapeHtml(value || 'Not provided')}</p>
    </div>
  `;
}

function renderContactCard(contact) {
  const lines = [
    contact.title || 'No title',
    contact.email || null,
    contact.phone || null,
  ].filter(Boolean);
  const flags = [];
  if (contact.confidence) flags.push(`Confidence: ${capitalize(String(contact.confidence))}`);
  if (contact.do_not_contact) flags.push('Do Not Contact');

  return `
    <div class="explorer-contact-item">
      <p class="explorer-contact-name">${escapeHtml(contact.full_name || 'Unnamed Contact')}</p>
      <p class="explorer-contact-meta">${escapeHtml(lines.join(' • ') || 'No contact details')}</p>
      ${flags.length ? `<p class="explorer-contact-meta">${escapeHtml(flags.join(' • '))}</p>` : ''}
      ${contact.justification ? `<p class="explorer-contact-meta">${escapeHtml(contact.justification)}</p>` : ''}
    </div>
  `;
}

function wireExplorerProfileActions(modal, org) {
  const closeBtn = modal.querySelector('[data-explorer-modal-close]');
  if (closeBtn && !closeBtn.dataset.bound) {
    closeBtn.dataset.bound = 'true';
    closeBtn.addEventListener('click', () => modal.classList.remove('active'));
  }
  const backdrop = modal.querySelector('.modal-backdrop');
  if (backdrop && !backdrop.dataset.bound) {
    backdrop.dataset.bound = 'true';
    backdrop.addEventListener('click', () => modal.classList.remove('active'));
  }
  const copyBtn = modal.querySelector('[data-explorer-copy]');
  if (copyBtn && !copyBtn.dataset.bound) {
    copyBtn.dataset.bound = 'true';
    copyBtn.addEventListener('click', () => {
      const current = explorerState.activeOrganization || org;
      const text = [
        current.name,
        current.website,
        current.email,
        current.phone,
        current.address,
        [current.city, current.state, current.postal_code].filter(Boolean).join(', '),
      ].filter(Boolean).join('\n');
      if (window.FundsApp?.copyToClipboard) {
        window.FundsApp.copyToClipboard(text);
        notifyUser('Organization info copied to clipboard.');
      }
    });
  }
}

function ensureExplorerModal() {
  let modal = document.getElementById('explorerProfileModal');
  if (modal) return modal;

  modal = document.createElement('div');
  modal.className = 'modal';
  modal.id = 'explorerProfileModal';
  modal.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-content modal-large" style="width:min(1120px, calc(100vw - 20px)); max-height:min(92vh, 980px);">
      <div class="modal-header">
        <h2 class="modal-title">Organization Profile</h2>
        <div style="display:flex; gap:8px; align-items:center;">
          <button type="button" class="btn btn-secondary btn-pill" data-explorer-copy>Copy Info</button>
          <button type="button" class="modal-close" aria-label="Close explorer profile" data-explorer-modal-close>×</button>
        </div>
      </div>
      <div class="modal-body" id="explorerProfileModalBody"></div>
    </div>
  `;
  document.body.appendChild(modal);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modal.classList.contains('active')) {
      modal.classList.remove('active');
    }
  });
  return modal;
}

async function apiJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function notifyUser(message) {
  if (window.FundsApp?.showToast) {
    window.FundsApp.showToast(message);
    return;
  }
  console.log(message);
}

function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(String(value ?? ''), 10);
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function formatCategory(value) {
  const text = String(value || 'other').replace(/[_-]+/g, ' ');
  return text.replace(/\b\w/g, (c) => c.toUpperCase());
}

function getInitials(name) {
  return String(name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('') || 'OR';
}

function safeHostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function capitalize(value) {
  const text = String(value || '');
  return text ? text[0].toUpperCase() + text.slice(1) : '';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
