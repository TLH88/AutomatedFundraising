/**
 * Lead Generation page
 * Combines organizations + contacts into a filterable lead workspace.
 */

const leadGenState = {
  organizations: [],
  contacts: [],
  results: [],
  filtered: [],
  selected: new Map(),
  savedLists: [],
};

const LEAD_GEN_KEYS = {
  savedLists: 'funds_lead_generation_saved_lists_v1',
};

document.addEventListener('DOMContentLoaded', () => {
  if (!document.getElementById('leadResultsList')) return;

  const guard = window.FundsApp?.createDataLoadGuard?.({
    target: '.main-content .container',
    message: 'Loading organizations and contacts...',
  });
  guard?.start();

  initLeadGenUi();
  loadLeadGenData()
    .then(() => guard?.success())
    .catch((error) => {
      console.error('Lead generation load failed:', error);
      window.FundsApp?.showToast?.('Unable to load lead generation data');
      guard?.fail({ restoreFallback: false });
    });
});

async function apiJson(url, options) {
  if (window.FundsApp?.apiJson) return window.FundsApp.apiJson(url, options);
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function initLeadGenUi() {
  hydrateSavedLists();

  document.getElementById('leadSearchInput')?.addEventListener('input', debounce(applyFilters, 120));
  document.getElementById('leadRecordTypeFilter')?.addEventListener('change', applyFilters);
  document.getElementById('leadMinScoreFilter')?.addEventListener('change', applyFilters);
  document.getElementById('leadOrgCategoryFilter')?.addEventListener('change', applyFilters);
  document.getElementById('leadContactCategoryFilter')?.addEventListener('change', applyFilters);
  document.getElementById('leadStateFilter')?.addEventListener('change', applyFilters);
  document.getElementById('leadHasEmailOnly')?.addEventListener('change', applyFilters);
  document.getElementById('leadIncludeDoNotContact')?.addEventListener('change', applyFilters);
  document.getElementById('leadRefreshBtn')?.addEventListener('click', () => refreshLeadGenData());
  document.getElementById('leadResetFiltersBtn')?.addEventListener('click', resetLeadFilters);

  document.getElementById('leadSelectAllVisible')?.addEventListener('change', onSelectAllVisibleChange);
  document.getElementById('leadCopyEmailsBtn')?.addEventListener('click', copySelectedEmails);
  document.getElementById('leadExportCsvBtn')?.addEventListener('click', exportSelectedCsv);
  document.getElementById('leadSaveDraftBtn')?.addEventListener('click', saveDraftLeadList);
  document.getElementById('leadCreateOutreachBtn')?.addEventListener('click', createOutreachCampaignFromSelected);

  const list = document.getElementById('leadResultsList');
  list?.addEventListener('click', onLeadResultsClick);
  list?.addEventListener('change', onLeadResultsChange);

  document.querySelectorAll('[data-lead-modal-close]').forEach((el) => {
    el.addEventListener('click', () => closeLeadModal());
  });
}

async function loadLeadGenData() {
  const [orgRes, contactRes] = await Promise.all([
    apiJson('/api/explorer/organizations?limit=300&min_score=0'),
    apiJson('/api/contacts?limit=300'),
  ]);
  leadGenState.organizations = Array.isArray(orgRes.organizations) ? orgRes.organizations : [];
  leadGenState.contacts = Array.isArray(contactRes.contacts) ? contactRes.contacts : [];
  buildCombinedLeadResults();
  hydrateFilterOptions();
  applyFilters();
  renderSavedLists();
}

async function refreshLeadGenData() {
  const btn = document.getElementById('leadRefreshBtn');
  if (btn) btn.disabled = true;
  try {
    await loadLeadGenData();
    window.FundsApp?.showToast?.('Lead data refreshed');
  } finally {
    if (btn) btn.disabled = false;
  }
}

function buildCombinedLeadResults() {
  const orgLeads = leadGenState.organizations.map((org) => ({
    record_key: `org:${org.id || org.name}`,
    record_type: 'organization',
    id: org.id || null,
    name: org.name || 'Unknown Organization',
    category: formatLabel(org.category || 'other'),
    score: Number(org.donation_potential_score || 0),
    city: org.city || '',
    state: org.state || '',
    email: org.email || '',
    phone: org.phone || '',
    website: org.website || '',
    notes: org.notes || '',
    org: org,
  }));

  const contactLeads = leadGenState.contacts.map((contact) => ({
    record_key: String(contact.record_key || `contact:${contact.id || contact.email || contact.full_name}`),
    record_type: 'contact',
    id: contact.id || null,
    name: contact.full_name || 'Unnamed Contact',
    category: contact.category || 'General Contact',
    score: Number(contact.donation_potential_score || 0),
    city: contact.organization_city || '',
    state: contact.organization_state || '',
    email: contact.email || '',
    phone: contact.phone || '',
    title: contact.title || '',
    confidence: contact.confidence || '',
    do_not_contact: !!contact.do_not_contact,
    justification: contact.justification || '',
    organization_name: contact.organization_name || '',
    organization_category: contact.organization_category || '',
    org_id: contact.org_id || null,
    raw: contact,
  }));

  leadGenState.results = [...contactLeads, ...orgLeads].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return String(a.name || '').localeCompare(String(b.name || ''));
  });
}

function hydrateFilterOptions() {
  fillSelectOptions(
    document.getElementById('leadOrgCategoryFilter'),
    ['all', ...uniqueSorted(leadGenState.organizations.map((o) => String(o.category || '').toLowerCase()).filter(Boolean))],
    { formatter: (v) => (v === 'all' ? 'All Categories' : formatLabel(v)) }
  );
  fillSelectOptions(
    document.getElementById('leadContactCategoryFilter'),
    ['all', ...uniqueSorted(leadGenState.contacts.map((c) => String(c.category || '').trim()).filter(Boolean))],
    { formatter: (v) => (v === 'all' ? 'All Contact Types' : v) }
  );
  fillSelectOptions(
    document.getElementById('leadStateFilter'),
    ['all', ...uniqueSorted(leadGenState.results.map((r) => String(r.state || '').toUpperCase()).filter(Boolean))],
    { formatter: (v) => (v === 'all' ? 'All States' : v) }
  );
}

function fillSelectOptions(select, values, options = {}) {
  if (!select) return;
  const current = select.value || 'all';
  const formatter = options.formatter || ((v) => v);
  select.innerHTML = values.map((value) => (
    `<option value="${escapeHtml(String(value))}">${escapeHtml(String(formatter(value)))}</option>`
  )).join('');
  select.value = values.includes(current) ? current : values[0];
}

function applyFilters() {
  const search = String(document.getElementById('leadSearchInput')?.value || '').trim().toLowerCase();
  const recordType = document.getElementById('leadRecordTypeFilter')?.value || 'all';
  const minScore = Number(document.getElementById('leadMinScoreFilter')?.value || 0);
  const orgCategory = document.getElementById('leadOrgCategoryFilter')?.value || 'all';
  const contactCategory = document.getElementById('leadContactCategoryFilter')?.value || 'all';
  const state = document.getElementById('leadStateFilter')?.value || 'all';
  const hasEmailOnly = !!document.getElementById('leadHasEmailOnly')?.checked;
  const includeDnc = !!document.getElementById('leadIncludeDoNotContact')?.checked;

  leadGenState.filtered = leadGenState.results.filter((row) => {
    if (recordType !== 'all' && row.record_type !== recordType) return false;
    if (minScore > 0 && Number(row.score || 0) < minScore) return false;
    if (state !== 'all' && String(row.state || '').toUpperCase() !== String(state).toUpperCase()) return false;
    if (row.record_type === 'organization' && orgCategory !== 'all') {
      if (String((row.org?.category || '')).toLowerCase() !== String(orgCategory).toLowerCase()) return false;
    }
    if (row.record_type === 'contact' && contactCategory !== 'all') {
      if (String(row.category || '') !== String(contactCategory)) return false;
    }
    if (hasEmailOnly && !String(row.email || '').trim()) return false;
    if (!includeDnc && row.record_type === 'contact' && row.do_not_contact) return false;
    if (search) {
      const hay = [
        row.name, row.email, row.phone, row.city, row.state, row.category,
        row.organization_name, row.website, row.title,
      ].join(' ').toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });

  renderLeadResults();
  updateLeadBuilderSummary();
}

function renderLeadResults() {
  const list = document.getElementById('leadResultsList');
  const summary = document.getElementById('leadResultsSummary');
  if (!list) return;

  summary.textContent = `${leadGenState.filtered.length} matching lead${leadGenState.filtered.length === 1 ? '' : 's'} from ${leadGenState.results.length} total records`;

  if (!leadGenState.filtered.length) {
    list.innerHTML = '<div class="leadgen-empty">No leads match the current filters. Try broadening your search criteria.</div>';
    syncSelectAllCheckbox();
    return;
  }

  list.innerHTML = leadGenState.filtered.map(renderLeadRow).join('');
  syncSelectAllCheckbox();
}

function renderLeadRow(row) {
  const score = Number(row.score || 0);
  const scoreClass = score >= 85 ? 'score-high' : score >= 75 ? 'score-mid' : 'score-low';
  const checked = leadGenState.selected.has(row.record_key) ? 'checked' : '';
  const sub = row.record_type === 'contact'
    ? `${row.title || row.category}${row.organization_name ? ` • ${row.organization_name}` : ''}`
    : `${row.website || row.email || row.phone || 'Organization lead'}`;
  const location = [row.city, row.state].filter(Boolean).join(', ') || '—';

  return `
    <div class="leadgen-row" data-record-key="${escapeHtml(row.record_key)}">
      <div class="leadgen-row-main">
        <p class="leadgen-row-title">${escapeHtml(row.name)}</p>
        <p class="leadgen-row-sub">${escapeHtml(sub)}</p>
      </div>
      <div><span class="leadgen-type-pill ${escapeHtml(row.record_type)}">${row.record_type === 'contact' ? 'Contact' : 'Org'}</span></div>
      <div><span class="leadgen-cat-pill">${escapeHtml(row.category || '—')}</span></div>
      <div class="leadgen-cell">${escapeHtml(location)}</div>
      <div><span class="leadgen-score-pill ${scoreClass}">${escapeHtml(String(Math.round(score)))}${score ? '' : ''}</span></div>
      <div class="leadgen-row-actions"><button type="button" class="btn btn-secondary btn-pill" data-action="view">View</button></div>
      <div class="leadgen-select-cell"><input type="checkbox" data-action="select" ${checked} aria-label="Select ${escapeHtml(row.name)}"></div>
    </div>
  `;
}

function onLeadResultsClick(event) {
  const rowEl = event.target.closest('.leadgen-row');
  if (!rowEl) return;
  const row = getLeadByKey(rowEl.dataset.recordKey);
  if (!row) return;
  const actionBtn = event.target.closest('[data-action="view"]');
  if (actionBtn) openLeadModal(row);
}

function onLeadResultsChange(event) {
  const checkbox = event.target.closest('input[type="checkbox"][data-action="select"]');
  if (!checkbox) return;
  const rowEl = checkbox.closest('.leadgen-row');
  const row = getLeadByKey(rowEl?.dataset.recordKey);
  if (!row) return;
  if (checkbox.checked) {
    leadGenState.selected.set(row.record_key, row);
  } else {
    leadGenState.selected.delete(row.record_key);
  }
  updateLeadBuilderSummary();
  renderSelectedLeadList();
  syncSelectAllCheckbox();
}

function onSelectAllVisibleChange(event) {
  const checked = !!event.target.checked;
  leadGenState.filtered.forEach((row) => {
    if (checked) leadGenState.selected.set(row.record_key, row);
    else leadGenState.selected.delete(row.record_key);
  });
  renderLeadResults();
  updateLeadBuilderSummary();
  renderSelectedLeadList();
}

function syncSelectAllCheckbox() {
  const box = document.getElementById('leadSelectAllVisible');
  if (!box) return;
  if (!leadGenState.filtered.length) {
    box.checked = false;
    box.indeterminate = false;
    return;
  }
  const selectedCount = leadGenState.filtered.filter((row) => leadGenState.selected.has(row.record_key)).length;
  box.checked = selectedCount > 0 && selectedCount === leadGenState.filtered.length;
  box.indeterminate = selectedCount > 0 && selectedCount < leadGenState.filtered.length;
}

function updateLeadBuilderSummary() {
  const selected = Array.from(leadGenState.selected.values());
  const contacts = selected.filter((r) => r.record_type === 'contact');
  const emails = uniqueSorted(selected.map((r) => String(r.email || '').trim().toLowerCase()).filter(Boolean));
  setText('leadSelectedCount', String(selected.length));
  setText('leadSelectedContactsCount', String(contacts.length));
  setText('leadSelectedEmailsCount', String(emails.length));
}

function renderSelectedLeadList() {
  const host = document.getElementById('leadSelectedList');
  if (!host) return;
  const rows = Array.from(leadGenState.selected.values());
  if (!rows.length) {
    host.innerHTML = '<div class="leadgen-empty">Select organizations or contacts to build a mailing list or outreach segment.</div>';
    return;
  }
  host.innerHTML = rows.slice(0, 12).map((row) => `
    <div class="leadgen-selected-item" data-selected-key="${escapeHtml(row.record_key)}">
      <h4>${escapeHtml(row.name)}</h4>
      <p class="meta">${escapeHtml(row.record_type === 'contact' ? `${row.title || row.category} • ${row.organization_name || 'No org linked'}` : `${row.category} • ${row.city || ''}${row.state ? `, ${row.state}` : ''}`)}</p>
      <p>${escapeHtml(row.email || row.phone || row.website || 'No direct contact info')}</p>
      <div class="actions">
        <button type="button" class="btn btn-secondary btn-pill" data-selected-action="view">View</button>
        <button type="button" class="btn btn-secondary btn-pill" data-selected-action="remove">Remove</button>
      </div>
    </div>
  `).join('');
  if (rows.length > 12) {
    host.insertAdjacentHTML('beforeend', `<div class="leadgen-empty">+${rows.length - 12} more selected lead(s) not shown.</div>`);
  }
  host.querySelectorAll('[data-selected-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const card = btn.closest('[data-selected-key]');
      const key = card?.dataset.selectedKey;
      const row = key ? leadGenState.selected.get(key) : null;
      if (!row) return;
      if (btn.dataset.selectedAction === 'remove') {
        leadGenState.selected.delete(key);
        renderLeadResults();
        renderSelectedLeadList();
        updateLeadBuilderSummary();
        return;
      }
      openLeadModal(row);
    });
  });
}

function copySelectedEmails() {
  const emails = uniqueSorted(Array.from(leadGenState.selected.values()).map((r) => String(r.email || '').trim()).filter(Boolean));
  if (!emails.length) {
    window.FundsApp?.showToast?.('No email addresses in selected leads');
    return;
  }
  window.FundsApp?.copyToClipboard?.(emails.join('; '));
  window.FundsApp?.showToast?.(`Copied ${emails.length} email address${emails.length === 1 ? '' : 'es'}`);
}

function exportSelectedCsv() {
  const rows = Array.from(leadGenState.selected.values());
  if (!rows.length) {
    window.FundsApp?.showToast?.('Select at least one lead to export');
    return;
  }
  const headers = ['record_type', 'name', 'category', 'title', 'organization_name', 'email', 'phone', 'website', 'city', 'state', 'donor_score'];
  const csv = [
    headers.join(','),
    ...rows.map((r) => headers.map((h) => csvEscape(valueForCsv(r, h))).join(',')),
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `lead-generation-${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function saveDraftLeadList() {
  const rows = Array.from(leadGenState.selected.values());
  if (!rows.length) {
    window.FundsApp?.showToast?.('Select leads before saving a list');
    return;
  }
  const nameInput = document.getElementById('leadListName');
  const name = String(nameInput?.value || '').trim() || `Lead List ${new Date().toLocaleDateString()}`;
  const payload = {
    id: `leadlist-${Date.now()}`,
    name,
    created_at: new Date().toISOString(),
    items: rows.map((r) => ({
      record_key: r.record_key,
      record_type: r.record_type,
      name: r.name,
      category: r.category,
      email: r.email || '',
      organization_name: r.organization_name || '',
    })),
  };
  leadGenState.savedLists.unshift(payload);
  leadGenState.savedLists = leadGenState.savedLists.slice(0, 30);
  persistSavedLists();
  renderSavedLists();
  window.FundsApp?.showToast?.('Lead list draft saved');
}

function createOutreachCampaignFromSelected() {
  const rows = Array.from(leadGenState.selected.values());
  if (!rows.length) {
    window.FundsApp?.showToast?.('Select leads first to create an outreach campaign');
    return;
  }
  const payload = {
    source: 'lead-generation',
    created_at: new Date().toISOString(),
    name: `Lead Outreach ${new Date().toLocaleDateString()}`,
    lead_count: rows.length,
    contacts_count: rows.filter((r) => r.record_type === 'contact').length,
    organizations_count: rows.filter((r) => r.record_type === 'organization').length,
    recipients: rows.map((r) => ({
      record_key: r.record_key,
      record_type: r.record_type,
      id: r.id || null,
      name: r.name,
      email: r.email || '',
      category: r.category || '',
      organization_name: r.organization_name || (r.record_type === 'organization' ? r.name : ''),
      score: Number(r.score || 0),
      city: r.city || '',
      state: r.state || '',
    })),
  };
  try {
    localStorage.setItem('funds_communications_handoff_v1', JSON.stringify(payload));
    window.FundsApp?.notify?.('Lead handoff ready', `Prepared ${rows.length} selected lead(s) for Communications.`, ['administrator', 'member']);
    window.location.href = 'communications.html?handoff=leadgen';
  } catch (err) {
    console.error('Failed to store lead handoff payload', err);
    window.FundsApp?.showToast?.('Unable to prepare handoff to Communications');
  }
}

function hydrateSavedLists() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LEAD_GEN_KEYS.savedLists) || '[]');
    leadGenState.savedLists = Array.isArray(parsed) ? parsed : [];
  } catch {
    leadGenState.savedLists = [];
  }
  renderSelectedLeadList();
}

function persistSavedLists() {
  localStorage.setItem(LEAD_GEN_KEYS.savedLists, JSON.stringify(leadGenState.savedLists));
}

function renderSavedLists() {
  const host = document.getElementById('leadSavedLists');
  if (!host) return;
  if (!leadGenState.savedLists.length) {
    host.innerHTML = '<div class="leadgen-empty">No saved draft lists yet.</div>';
    return;
  }
  host.innerHTML = leadGenState.savedLists.slice(0, 6).map((list) => `
    <div class="leadgen-saved-item" data-list-id="${escapeHtml(list.id)}">
      <h4>${escapeHtml(list.name)}</h4>
      <p>${escapeHtml(String(list.items?.length || 0))} lead(s) • ${escapeHtml(new Date(list.created_at).toLocaleString())}</p>
      <div class="actions">
        <button type="button" class="btn btn-secondary btn-pill" data-list-action="restore">Restore Selection</button>
        <button type="button" class="btn btn-secondary btn-pill" data-list-action="delete">Delete</button>
      </div>
    </div>
  `).join('');
  host.querySelectorAll('[data-list-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const card = btn.closest('[data-list-id]');
      const id = card?.dataset.listId;
      const entry = leadGenState.savedLists.find((l) => l.id === id);
      if (!entry) return;
      if (btn.dataset.listAction === 'delete') {
        leadGenState.savedLists = leadGenState.savedLists.filter((l) => l.id !== id);
        persistSavedLists();
        renderSavedLists();
        return;
      }
      restoreSavedList(entry);
    });
  });
}

function restoreSavedList(entry) {
  leadGenState.selected.clear();
  for (const item of entry.items || []) {
    const row = getLeadByKey(item.record_key);
    if (row) leadGenState.selected.set(row.record_key, row);
  }
  renderLeadResults();
  renderSelectedLeadList();
  updateLeadBuilderSummary();
  window.FundsApp?.showToast?.(`Restored "${entry.name}"`);
}

function openLeadModal(row) {
  const modal = document.getElementById('leadRecordModal');
  const title = document.getElementById('leadModalTitle');
  const subtitle = document.getElementById('leadModalSubtitle');
  const body = document.getElementById('leadModalBody');
  if (!modal || !body || !title || !subtitle) return;

  title.textContent = row.name;
  subtitle.textContent = row.record_type === 'contact'
    ? `${row.title || row.category} • ${row.organization_name || 'Contact'}`
    : `${row.category} • Organization Lead`;

  const scoreClass = Number(row.score || 0) >= 85 ? 'score-high' : Number(row.score || 0) >= 75 ? 'score-mid' : 'score-low';
  const leftPanel = row.record_type === 'contact'
    ? `
      <div class="leadgen-detail-list">
        <div><span>Title</span><strong>${escapeHtml(row.title || '—')}</strong></div>
        <div><span>Contact Type</span><strong>${escapeHtml(row.category || '—')}</strong></div>
        <div><span>Organization</span><strong>${escapeHtml(row.organization_name || '—')}</strong></div>
        <div><span>Email</span><strong>${escapeHtml(row.email || '—')}</strong></div>
        <div><span>Phone</span><strong>${escapeHtml(row.phone || '—')}</strong></div>
        <div><span>Confidence</span><strong>${escapeHtml(formatLabel(row.confidence || 'unknown'))}</strong></div>
        <div><span>Location</span><strong>${escapeHtml([row.city, row.state].filter(Boolean).join(', ') || '—')}</strong></div>
        <div><span>Donor Score</span><strong><span class="leadgen-score-pill ${scoreClass}">${escapeHtml(String(Math.round(Number(row.score || 0))))}</span></strong></div>
      </div>
    `
    : `
      <div class="leadgen-detail-list">
        <div><span>Organization Category</span><strong>${escapeHtml(row.category || '—')}</strong></div>
        <div><span>Email</span><strong>${escapeHtml(row.email || '—')}</strong></div>
        <div><span>Phone</span><strong>${escapeHtml(row.phone || '—')}</strong></div>
        <div><span>Website</span><strong>${row.website ? `<a href="${escapeHtml(row.website)}" target="_blank" rel="noopener noreferrer">${escapeHtml(row.website)}</a>` : '—'}</strong></div>
        <div><span>Location</span><strong>${escapeHtml([row.city, row.state].filter(Boolean).join(', ') || '—')}</strong></div>
        <div><span>Donor Score</span><strong><span class="leadgen-score-pill ${scoreClass}">${escapeHtml(String(Math.round(Number(row.score || 0))))}</span></strong></div>
      </div>
    `;

  const notes = row.record_type === 'contact'
    ? (row.justification || 'No contact justification is available.')
    : ((row.notes || row.org?.notes || 'No organization notes available.'));

  body.innerHTML = `
    <div class="leadgen-modal-grid">
      <section class="leadgen-modal-panel">
        <h3>${row.record_type === 'contact' ? 'Contact Details' : 'Organization Details'}</h3>
        ${leftPanel}
      </section>
      <section class="leadgen-modal-panel">
        <h3>${row.record_type === 'contact' ? 'Qualification Notes' : 'Lead Notes'}</h3>
        <p class="leadgen-modal-notes">${escapeHtml(notes)}</p>
      </section>
    </div>
  `;
  modal.classList.add('active');
}

function closeLeadModal() {
  document.getElementById('leadRecordModal')?.classList.remove('active');
}

function getLeadByKey(key) {
  return leadGenState.results.find((r) => r.record_key === String(key)) || null;
}

function resetLeadFilters() {
  setValue('leadSearchInput', '');
  setValue('leadRecordTypeFilter', 'all');
  setValue('leadMinScoreFilter', '0');
  setValue('leadOrgCategoryFilter', 'all');
  setValue('leadContactCategoryFilter', 'all');
  setValue('leadStateFilter', 'all');
  const hasEmail = document.getElementById('leadHasEmailOnly');
  const includeDnc = document.getElementById('leadIncludeDoNotContact');
  if (hasEmail) hasEmail.checked = true;
  if (includeDnc) includeDnc.checked = false;
  applyFilters();
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = String(value ?? '');
}

function setValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value;
}

function formatLabel(value) {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0].toUpperCase() + p.slice(1))
    .join(' ') || '—';
}

function uniqueSorted(values) {
  return Array.from(new Set(values)).sort((a, b) => String(a).localeCompare(String(b)));
}

function valueForCsv(row, key) {
  switch (key) {
    case 'title': return row.title || '';
    case 'organization_name': return row.organization_name || (row.record_type === 'organization' ? row.name : '');
    case 'website': return row.website || '';
    case 'donor_score': return Math.round(Number(row.score || 0));
    default: return row[key] ?? '';
  }
}

function csvEscape(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function debounce(fn, wait = 150) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}
