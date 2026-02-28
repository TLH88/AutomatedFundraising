/**
 * Funds Explorer page: search and review potential donor organizations.
 */

// Easy rollback for the Search Strategy mockup panel:
// set to false to hide the mockup without removing markup/styles.
const ENABLE_EXPLORER_STRATEGY_MOCKUP = false;

const explorerState = {
  organizations: [],
  activeOrganization: null,
  loading: false,
  importing: false,
  schemaReadyForImport: false,
  schemaCheckComplete: false,
  schemaStatus: null,
  activeJobId: null,
  lastRenderedJobFingerprint: '',
  selectedPreviewKeys: new Set(),
  seenResultKeys: new Set(),
};

document.addEventListener('DOMContentLoaded', () => {
  applyExplorerStrategyMockupToggle();
  initExplorerSearchPanel();
  initExplorerSearch();
  initExplorerActions();
  initExplorerImportControls();
  initExplorerProgressUI();
  ensureExplorerModal();
  hydrateExplorerJobFromGlobalState();
  initExplorerSchemaCheck();
});

function applyExplorerStrategyMockupToggle() {
  const mockCard = document.getElementById('explorerStrategyMockCard');
  if (!mockCard) return;
  mockCard.setAttribute('data-hidden', ENABLE_EXPLORER_STRATEGY_MOCKUP ? 'false' : 'true');
}

function initExplorerSearchPanel() {
  const card = document.getElementById('explorerSearchCard');
  const toggleBtn = document.getElementById('explorerSearchToggle');
  if (!card || !toggleBtn) return;
  toggleBtn.addEventListener('click', () => {
    const collapsed = card.classList.toggle('collapsed');
    toggleBtn.textContent = collapsed ? 'Run New Donor Search' : 'Hide Search Inputs';
  });
}

function initExplorerSearch() {
  const form = document.getElementById('explorerSearchForm');
  if (!form) return;
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const card = document.getElementById('explorerSearchCard');
    const toggleBtn = document.getElementById('explorerSearchToggle');
    if (card && toggleBtn) {
      card.classList.add('collapsed');
      toggleBtn.textContent = 'Run New Donor Search';
    }
    runExplorerSearch();
  });
}

function initExplorerActions() {
  const list = document.getElementById('explorerResultsList');
  if (!list) return;
  list.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-explorer-view-index]');
    if (!button) return;
    const indexRaw = button.getAttribute('data-explorer-view-index');
    const index = Number.parseInt(String(indexRaw ?? ''), 10);
    const org = Number.isInteger(index) ? explorerState.organizations[index] : null;
    if (!org) return;
    await openOrganizationProfile(org);
  });
  list.addEventListener('change', (event) => {
    const checkbox = event.target.closest('[data-explorer-select-key]');
    if (!checkbox) return;
    const key = String(checkbox.getAttribute('data-explorer-select-key') || '');
    if (!key) return;
    if (checkbox.checked) explorerState.selectedPreviewKeys.add(key);
    else explorerState.selectedPreviewKeys.delete(key);
    syncExplorerSelectionUI();
  });
  document.getElementById('explorerResultTypeFilter')?.addEventListener('change', () => renderExplorerResults(explorerState.organizations));
}

async function initExplorerSchemaCheck() {
  try {
    const response = await apiJson('/api/explorer/schema-status');
    const schema = response.schema || null;
    explorerState.schemaStatus = schema;
    explorerState.schemaReadyForImport = !!schema?.import_ready;
    explorerState.schemaCheckComplete = true;
    applyExplorerSchemaBanner(schema);
  } catch (error) {
    console.error('Explorer schema check failed', error);
    explorerState.schemaStatus = {
      import_ready: false,
      preview_ready: true,
      message: 'Unable to validate organizations schema right now.',
      migration: 'fundraising_app/db/migrations/2026-02-24_organizations_contact_fields.sql',
    };
    explorerState.schemaReadyForImport = false;
    explorerState.schemaCheckComplete = true;
    applyExplorerSchemaBanner(explorerState.schemaStatus);
  } finally {
    syncExplorerSelectionUI();
  }
}

function applyExplorerSchemaBanner(schema) {
  const banner = document.getElementById('explorerSchemaBanner');
  const textEl = document.getElementById('explorerSchemaBannerText');
  const migrationEl = document.getElementById('explorerSchemaBannerMigration');
  if (!banner || !textEl || !migrationEl) return;
  if (!schema || schema.import_ready) {
    banner.style.display = 'none';
    return;
  }
  banner.style.display = '';
  const missing = Array.isArray(schema.missing_columns) ? schema.missing_columns.filter(Boolean) : [];
  const detail = String(schema.message || 'Organizations schema is missing required fields for import.');
  textEl.textContent = `${detail}${missing.length ? ` Missing: ${missing.join(', ')}.` : ''} Preview search remains available, but import is disabled until the migration is applied.`;
  migrationEl.textContent = String(schema.migration || 'fundraising_app/db/migrations/2026-02-24_organizations_contact_fields.sql');
}

function initExplorerImportControls() {
  const selectAll = document.getElementById('explorerSelectAllResults');
  const importSelectedBtn = document.getElementById('explorerImportSelectedBtn');
  const importAllBtn = document.getElementById('explorerImportAllBtn');

  selectAll?.addEventListener('change', () => {
    const checked = !!selectAll.checked;
    const visibleRows = getExplorerVisibleResults(explorerState.organizations);
    const visibleKeys = new Set(visibleRows.map((org) => getExplorerPreviewKey(org)).filter(Boolean));
    for (const key of Array.from(explorerState.selectedPreviewKeys)) {
      if (visibleKeys.has(key)) explorerState.selectedPreviewKeys.delete(key);
    }
    if (checked) {
      visibleRows.forEach((org) => {
        const key = getExplorerPreviewKey(org);
        if (key) explorerState.selectedPreviewKeys.add(key);
      });
    }
    renderExplorerResults(explorerState.organizations);
  });

  importSelectedBtn?.addEventListener('click', () => importExplorerResults('selected'));
  importAllBtn?.addEventListener('click', () => importExplorerResults('all'));
  document.getElementById('explorerIncludeLowQualityContacts')?.addEventListener('change', syncExplorerSelectionUI);
  syncExplorerSelectionUI();
}

async function runExplorerSearch() {
  if (explorerState.loading) return;
  explorerState.loading = true;
  const list = document.getElementById('explorerResultsList');
  const countEl = document.getElementById('explorerResultsCount');
  const metaEl = document.getElementById('explorerSearchMeta');
  if (list) {
    list.innerHTML = '<div class="explorer-empty">Starting discovery pipeline...</div>';
  }
  if (countEl) countEl.textContent = 'Starting...';

  const payload = buildExplorerSearchPayload();
  try {
    const response = await apiJson('/api/explorer/discover/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const job = response.job || {};
    explorerState.activeJobId = job.job_id || null;

    const trackerState = {
      job_id: job.job_id,
      status: job.status || 'queued',
      progress: Number(job.progress || 0),
      step: job.step || 'queued',
      message: job.message || 'Discovery job queued.',
      result: null,
      error: null,
      created_at: job.created_at || new Date().toISOString(),
      started_at: job.started_at || null,
      finished_at: null,
      notifications: { started: true },
    };

    if (window.FundsApp?.setExplorerDiscoveryJobState) {
      window.FundsApp.setExplorerDiscoveryJobState(trackerState);
    } else {
      localStorage.setItem('funds_explorer_discovery_job', JSON.stringify(trackerState));
    }

    if (window.FundsApp?.notify) {
      window.FundsApp.notify('Funds Explorer Started', 'A new donor discovery search is running in the background.', ['all']);
    }

    renderExplorerProgress(trackerState);
    if (metaEl) {
      const bits = [];
      if (payload.max_runtime_seconds) bits.push(`Runtime budget: ${payload.max_runtime_seconds}s`);
      if (Array.isArray(payload.exclude_record_keys) && payload.exclude_record_keys.length) bits.push(`Skipping ${payload.exclude_record_keys.length} previously seen result(s)`);
      bits.push('You can navigate to other pages and return while the search continues.');
      metaEl.textContent = bits.join(' | ');
    }
    if (countEl) {
      countEl.textContent = 'Search running...';
    }
  } catch (error) {
    console.error('Explorer search start failed', error);
    renderExplorerResults([]);
    if (countEl) countEl.textContent = '0 results';
    notifyUser('Unable to start the discovery pipeline right now.');
  } finally {
    explorerState.loading = false;
  }
}

function buildExplorerSearchPayload() {
  const location = document.getElementById('explorerLocation')?.value?.trim() || '';
  const radius = clampInt(document.getElementById('explorerRadius')?.value, 1, 10000, 25);
  const limit = clampInt(document.getElementById('explorerLimit')?.value, 1, 1000, 50);
  const scoreRaw = document.getElementById('explorerScoreFilter')?.value || 'all';
  const discoveryMode = document.getElementById('explorerDiscoveryMode')?.value || 'all';
  const minScore = scoreRaw === 'all' ? 0 : clampInt(scoreRaw, 0, 100, 0);
  const maxRuntimeSeconds = getExplorerRuntimeBudgetForRadius(radius);
  const excludeRecordKeys = getExplorerSeenResultKeysForQuery({ location, discoveryMode, minScore });
  return {
    location,
    radius_miles: radius,
    limit,
    min_score: minScore,
    discovery_mode: discoveryMode,
    max_runtime_seconds: maxRuntimeSeconds,
    exclude_record_keys: excludeRecordKeys,
    extract_contacts: false,
    dry_run: true,
  };
}

function initExplorerProgressUI() {
  const dismissBtn = document.getElementById('explorerProgressDismissBtn');
  dismissBtn?.addEventListener('click', () => {
    const state = getExplorerJobState();
    if (state && ['running', 'queued', 'warning'].includes(String(state.status || '').toLowerCase())) {
      document.getElementById('explorerProgressCard')?.classList.remove('is-visible');
      return;
    }
    if (window.FundsApp?.clearExplorerDiscoveryJobState) {
      window.FundsApp.clearExplorerDiscoveryJobState();
    }
    renderExplorerProgress(null);
  });

  window.addEventListener('funds:explorer-job-update', (event) => {
    const jobState = event?.detail || getExplorerJobState();
    applyExplorerJobState(jobState);
  });
}

function hydrateExplorerJobFromGlobalState() {
  applyExplorerJobState(getExplorerJobState());
}

function getExplorerJobState() {
  if (window.FundsApp?.getExplorerDiscoveryJobState) {
    return window.FundsApp.getExplorerDiscoveryJobState();
  }
  try {
    return JSON.parse(localStorage.getItem('funds_explorer_discovery_job') || 'null');
  } catch {
    return null;
  }
}

function applyExplorerJobState(jobState) {
  renderExplorerProgress(jobState);
  if (!jobState) return;

  const result = jobState.result || null;
  const status = String(jobState.status || '').toLowerCase();
  const fingerprint = JSON.stringify({
    id: jobState.job_id,
    status,
    progress: jobState.progress,
    msg: jobState.message,
    saved: result?.saved_count,
    matched: result?.matched_count,
    source_breakdown: result?.source_breakdown || jobState?.event?.source_counts || null,
  });
  if (fingerprint === explorerState.lastRenderedJobFingerprint) return;
  explorerState.lastRenderedJobFingerprint = fingerprint;

  const countEl = document.getElementById('explorerResultsCount');
  const metaEl = document.getElementById('explorerSearchMeta');

  if (status === 'completed' && result) {
    const f = result.filters_applied || {};
    const previewResults = Array.isArray(result.results)
      ? result.results
      : (Array.isArray(result.organizations) ? result.organizations : []);
    rememberExplorerSeenResultKeys(previewResults, {
      location: f.location || '',
      discoveryMode: f.discovery_mode || 'all',
      minScore: Number(f.min_score || 0),
    });
    explorerState.organizations = normalizeExplorerResults(previewResults);
    explorerState.selectedPreviewKeys.clear();
    renderExplorerResults(explorerState.organizations);
    if (countEl) {
      const matched = Number(result.matched_count ?? explorerState.organizations.length ?? 0);
      const totalPreview = explorerState.organizations.length;
      countEl.textContent = `${totalPreview} results (preview) | ${matched} org matches`;
    }
    if (metaEl && result.filters_applied) {
      const bits = [];
      if (f.location) bits.push(`Location: ${f.location}`);
      if (f.radius_miles) bits.push(`Radius: ${f.radius_miles} miles`);
      bits.push(`Limit: ${f.limit}`);
      bits.push(Number(f.min_score || 0) > 0 ? `Score: >= ${f.min_score}` : 'Score: All');
      if (f.discovery_mode) bits.push(`Mode: ${formatDiscoveryMode(f.discovery_mode)}`);
      if (f.max_runtime_seconds) bits.push(`Runtime budget: ${f.max_runtime_seconds}s`);
      if (Number(f.excluded_record_keys_count || 0) > 0) bits.push(`Skipped seen: ${f.excluded_record_keys_count}`);
      const sourceText = formatSourceBreakdown(result.source_breakdown);
      if (sourceText) bits.push(`Sources: ${sourceText}`);
      const contactCount = Array.isArray(result.contacts) ? result.contacts.length : 0;
      bits.push(contactCount > 0 ? `Contact previews: ${contactCount}` : 'No contact previews found.');
      metaEl.textContent = bits.join(' | ');
    }
  } else if (['running', 'queued', 'warning'].includes(status)) {
    if (countEl) countEl.textContent = 'Search running...';
    if (metaEl) {
      const bits = [];
      if (jobState.message) bits.push(String(jobState.message));
      const liveSourceText = formatSourceBreakdown(jobState?.event?.source_counts);
      if (liveSourceText) bits.push(`Sources: ${liveSourceText}`);
      metaEl.textContent = bits.join(' | ') || 'Discovery job running...';
    }
  } else if (status === 'failed') {
    if (countEl) countEl.textContent = 'Search failed';
    if (metaEl) metaEl.textContent = jobState.message || 'Discovery job failed.';
  }
}

function renderExplorerProgress(jobState) {
  const card = document.getElementById('explorerProgressCard');
  const fill = document.getElementById('explorerProgressFill');
  const track = document.getElementById('explorerProgressTrack');
  const title = document.getElementById('explorerProgressTitle');
  const line = document.getElementById('explorerProgressLine');
  const meta = document.getElementById('explorerProgressMeta');
  if (!card || !fill || !track || !title || !line || !meta) return;

  if (!jobState) {
    card.dataset.status = 'idle';
    card.classList.remove('is-visible');
    fill.style.width = '0%';
    track.setAttribute('aria-valuenow', '0');
    title.textContent = 'Funds Explorer Search Status';
    line.textContent = 'No active search.';
    meta.textContent = 'Start a search to discover and preview matching organizations for review.';
    return;
  }

  const status = String(jobState.status || 'queued').toLowerCase();
  const progress = Math.max(0, Math.min(100, Number(jobState.progress || 0)));
  const showIndeterminate = ['queued', 'running', 'warning'].includes(status) && progress <= 5;
  const step = formatExplorerStep(jobState.step || status);
  const message = String(jobState.message || '').trim();
  const result = jobState.result || null;
  const liveSourceBreakdown = result?.source_breakdown || jobState?.event?.source_counts || null;

  card.classList.add('is-visible');
  card.dataset.status = status;
  fill.style.width = `${progress}%`;
  track.setAttribute('aria-valuenow', String(progress));
  track.dataset.indeterminate = showIndeterminate ? 'true' : 'false';

  title.textContent = status === 'completed'
    ? 'Funds Explorer Search Complete'
    : status === 'failed'
      ? 'Funds Explorer Search Failed'
      : 'Funds Explorer Search In Progress';

  if (status === 'completed' && result) {
    const saved = Number(result.saved_count || 0);
    const matched = Number(result.matched_count || saved);
    line.textContent = result.dry_run
      ? `Completed: Found ${matched} matching organization${matched === 1 ? '' : 's'} for review.`
      : `Completed: Imported ${saved} organization${saved === 1 ? '' : 's'} (${matched} matched).`;
    const sourceText = formatSourceBreakdown(liveSourceBreakdown);
    meta.textContent = [message || `Last step: ${step}`, sourceText ? `Sources: ${sourceText}` : '']
      .filter(Boolean)
      .join(' | ');
  } else if (status === 'failed') {
    line.textContent = message || 'The discovery search encountered an error.';
    meta.textContent = `Step: ${step}`;
  } else {
    line.textContent = `${step}: ${message || (showIndeterminate ? 'Initializing discovery sources and planning search strategy...' : 'Processing...')}`;
    const sourceText = formatSourceBreakdown(liveSourceBreakdown);
    meta.textContent = [
      showIndeterminate ? 'Progress warming up...' : `Progress ${progress}%`,
      sourceText ? `Sources: ${sourceText}` : '',
      'Search continues even if you navigate to another page.',
    ].filter(Boolean).join(' | ');
  }
}

function formatExplorerStep(step) {
  const text = String(step || '').replace(/[_-]+/g, ' ').trim();
  if (!text) return 'Working';
  return text.replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDiscoveryMode(mode) {
  const key = String(mode || 'all').toLowerCase();
  const labels = {
    all: 'All Sources',
    businesses: 'Businesses',
    foundations: 'Foundations',
    nonprofits: 'Nonprofits',
    wealth_related: 'Wealth-related Firms',
  };
  return labels[key] || key.replace(/[_-]+/g, ' ');
}

function formatSourceBreakdown(sourceCounts) {
  if (!sourceCounts || typeof sourceCounts !== 'object') return '';
  const labels = {
    google_places: 'Google Places',
    serpapi: 'SerpAPI',
    seed: 'Seeds',
    seeds: 'Seeds',
    petfinder: 'Petfinder',
    unknown: 'Other',
  };
  const formatFlat = (flatCounts) => {
    const entries = Object.entries(flatCounts || {})
      .map(([key, value]) => [String(key), Number(value || 0)])
      .filter(([, value]) => Number.isFinite(value) && value > 0)
      .sort((a, b) => b[1] - a[1]);
    if (!entries.length) return '';
    return entries.map(([key, value]) => `${labels[key] || key}: ${value}`).join(', ');
  };

  const hasNested = typeof sourceCounts.matched === 'object' || typeof sourceCounts.saved === 'object';
  if (!hasNested) return formatFlat(sourceCounts);

  const matchedText = formatFlat(sourceCounts.matched);
  const savedText = formatFlat(sourceCounts.saved);
  if (matchedText && savedText) return `Matched (${matchedText}); Saved (${savedText})`;
  return matchedText || savedText || '';
}

function renderExplorerResults(organizations) {
  const list = document.getElementById('explorerResultsList');
  if (!list) return;
  syncExplorerSelectionUI();
  const visibleResults = getExplorerVisibleResults(organizations);
  renderExplorerReviewSummary(organizations, visibleResults);

  if (!Array.isArray(visibleResults) || visibleResults.length === 0) {
    list.innerHTML = '<div class="explorer-empty">No results matched your search. Try a broader location or lower score threshold.</div>';
    syncExplorerSelectionUI();
    return;
  }

  list.innerHTML = visibleResults.map((record, index) => {
    const score = Number(record.donation_potential_score || 0);
    const scoreClass = getScoreThemeClass(score);
    const isContact = String(record.record_type || '').toLowerCase() === 'contact';
    const validation = getExplorerContactValidation(record);
    const locationText = isContact
      ? ([record.organization_city, record.organization_state].filter(Boolean).join(', ') || record.organization_address || record.organization_name || 'Linked organization')
      : ([record.city, record.state].filter(Boolean).join(', ') || record.address || 'Location not available');
    const key = getExplorerPreviewKey(record) || `idx-${index}`;
    const checked = explorerState.selectedPreviewKeys.has(key) ? 'checked' : '';
    const name = isContact ? (record.full_name || record.name || 'Unnamed Contact') : (record.name || 'Unknown Organization');
    const sub = isContact
      ? [record.title || null, record.email || null, record.organization_name ? `Org: ${record.organization_name}` : null, (validation.ok ? null : validation.label)].filter(Boolean).join(' | ')
      : locationText;
    const typeLabel = isContact ? 'Contact' : 'Organization';
    return `
      <div class="explorer-result-item" data-org-id="${escapeHtml(String(record.id || ''))}" data-contact-quality="${escapeHtml(isContact ? (validation.ok ? 'valid' : 'review') : 'n/a')}">
        <div>
          <p class="explorer-result-name">${escapeHtml(name)}</p>
          <p class="explorer-result-sub">${escapeHtml(sub)}</p>
        </div>
        <div><span class="badge badge-info">${escapeHtml(typeLabel)}</span></div>
        <div>${escapeHtml(formatCategory(record.category))}</div>
        <div><span class="explorer-score-pill ${escapeHtml(scoreClass)}">${escapeHtml(String(score))}</span></div>
        <div>
          <button type="button" class="btn btn-secondary btn-pill" data-explorer-view-index="${escapeHtml(String(explorerState.organizations.indexOf(record)))}">View</button>
        </div>
        <div style="display:flex; justify-content:flex-end;">
          <input type="checkbox" data-explorer-select-key="${escapeHtml(key)}" ${checked} aria-label="Select ${escapeHtml(name)}">
        </div>
      </div>
    `;
  }).join('');
  syncExplorerSelectionUI();
}

function getExplorerVisibleResults(organizations) {
  const rows = Array.isArray(organizations) ? organizations : [];
  const mode = String(document.getElementById('explorerResultTypeFilter')?.value || 'all').toLowerCase();
  if (mode === 'all') return rows;
  if (mode === 'organization') return rows.filter((r) => String(r.record_type || '').toLowerCase() !== 'contact');
  if (mode === 'contact') return rows.filter((r) => String(r.record_type || '').toLowerCase() === 'contact');
  if (mode === 'contact_valid') return rows.filter((r) => String(r.record_type || '').toLowerCase() === 'contact' && getExplorerContactValidation(r).ok);
  if (mode === 'contact_review') return rows.filter((r) => String(r.record_type || '').toLowerCase() === 'contact' && !getExplorerContactValidation(r).ok);
  return rows;
}

function getExplorerContactValidation(record) {
  if (String(record?.record_type || '').toLowerCase() !== 'contact') return { ok: true, label: '' };
  const email = String(record.email || '').trim();
  const title = String(record.title || '').trim().toLowerCase();
  const name = String(record.full_name || record.name || '').trim();
  const hasValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const hasName = name.length >= 2;
  const suspectTitle = /^(n\/a|na|unknown|contact|team)$/i.test(title);
  const confidence = String(record.confidence || '').toLowerCase();
  if (!hasName) return { ok: false, label: 'Needs name review' };
  if (!hasValidEmail) return { ok: false, label: 'Needs email review' };
  if (suspectTitle) return { ok: false, label: 'Needs title review' };
  if (record.do_not_contact) return { ok: false, label: 'Do Not Contact' };
  if (confidence && confidence === 'low') return { ok: false, label: 'Low confidence' };
  return { ok: true, label: 'Valid contact' };
}

function renderExplorerReviewSummary(allRows, visibleRows) {
  const el = document.getElementById('explorerReviewSummary');
  if (!el) return;
  const rows = Array.isArray(allRows) ? allRows : [];
  const contacts = rows.filter((r) => String(r.record_type || '').toLowerCase() === 'contact');
  const validContacts = contacts.filter((r) => getExplorerContactValidation(r).ok).length;
  const reviewContacts = contacts.length - validContacts;
  const organizations = rows.length - contacts.length;
  const visible = Array.isArray(visibleRows) ? visibleRows.length : rows.length;
  el.textContent = `Review Summary: ${rows.length} total preview results (${organizations} org, ${contacts.length} contact). Contact validation: ${validContacts} valid, ${reviewContacts} needs review. Showing ${visible} result(s) with current filter.`;
}

async function openOrganizationProfile(orgInput) {
  const modal = ensureExplorerModal();
  const body = modal.querySelector('#explorerProfileModalBody');
  if (!body) return;
  body.innerHTML = '<div class="explorer-empty">Loading organization profile...</div>';
  modal.classList.add('active');

  const orgId = typeof orgInput === 'string' ? orgInput : String(orgInput?.id || '');
  if (String(orgInput?.record_type || '').toLowerCase() === 'contact') {
    explorerState.activeOrganization = orgInput;
    body.innerHTML = renderExplorerContactProfile(orgInput);
    wireExplorerProfileActions(modal, orgInput);
    return;
  }
  if (!orgId) {
    const previewOrg = orgInput && typeof orgInput === 'object' ? orgInput : null;
    if (previewOrg) {
      explorerState.activeOrganization = previewOrg;
      body.innerHTML = renderOrganizationProfile(previewOrg);
      wireExplorerProfileActions(modal, previewOrg);
      return;
    }
  }

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
  const scoreClass = getScoreThemeClass(score);
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
              <span class="explorer-profile-pill ${escapeHtml(scoreClass)}">Potential Score ${escapeHtml(String(score))}</span>
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
            ${renderDetailItem('Potential Score', String(score || 0), false, scoreClass)}
            ${renderDetailItem('Website', org.website ? `<a href="${escapeHtml(org.website)}" target="_blank" rel="noopener noreferrer">${escapeHtml(websiteHost || org.website)}</a>` : 'Not provided', true)}
            ${renderDetailItem('Email', org.email ? `<a href="mailto:${escapeHtml(org.email)}">${escapeHtml(org.email)}</a>` : 'Not provided', true)}
            ${renderDetailItem('Phone', org.phone ? `<a href="tel:${escapeHtml(org.phone)}">${escapeHtml(org.phone)}</a>` : 'Not provided', true)}
            ${renderDetailItem('Address', org.address || 'Not provided')}
            ${renderDetailItem('City / State', [org.city, org.state].filter(Boolean).join(', ') || 'Not provided')}
            ${renderDetailItem('Postal Code', org.postal_code || 'Not provided')}
          </div>
          ${org.justification ? `<div class="explorer-detail-item" style="margin-top:12px;"><p class="explorer-detail-label">Evaluation Justification</p><p class="explorer-detail-value" style="font-weight:500;">${escapeHtml(org.justification)}</p></div>` : ''}
          ${org.additional_info ? `<div class="explorer-detail-item" style="margin-top:12px;"><p class="explorer-detail-label">Additional Information</p><p class="explorer-detail-value" style="font-weight:500;">${escapeHtml(org.additional_info)}</p></div>` : ''}
          ${org.source_notes ? `<div class="explorer-detail-item" style="margin-top:12px;"><p class="explorer-detail-label">Source Details</p><p class="explorer-detail-value" style="font-weight:500;">${escapeHtml(org.source_notes)}</p></div>` : (org.notes ? `<div class="explorer-detail-item" style="margin-top:12px;"><p class="explorer-detail-label">Source Details</p><p class="explorer-detail-value" style="font-weight:500;">${escapeHtml(org.notes)}</p></div>` : '')}
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

function renderDetailItem(label, value, allowHtml = false, extraClass = '') {
  return `
    <div class="explorer-detail-item ${escapeHtml(extraClass)}">
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

function renderExplorerContactProfile(contact) {
  const score = Number(contact.donation_potential_score || 0);
  const scoreClass = getScoreThemeClass(score);
  const initials = getInitials(contact.full_name || contact.name || 'Contact');
  return `
    <div class="explorer-modal-shell">
      <section class="explorer-profile-hero" aria-labelledby="explorerContactProfileName">
        <div class="explorer-profile-hero-top"></div>
        <div class="explorer-profile-hero-body">
          <div class="explorer-profile-avatar" aria-hidden="true">${escapeHtml(initials)}</div>
          <div>
            <h2 class="explorer-profile-name" id="explorerContactProfileName">${escapeHtml(contact.full_name || contact.name || 'Unnamed Contact')}</h2>
            <div class="explorer-profile-meta">
              <span class="explorer-profile-pill">Contact</span>
              <span class="explorer-profile-pill">${escapeHtml(contact.category || 'Prospective Contact')}</span>
              <span class="explorer-profile-pill ${escapeHtml(scoreClass)}">Potential Score ${escapeHtml(String(score))}</span>
              <span>${escapeHtml(contact.organization_name || 'Organization unavailable')}</span>
            </div>
          </div>
        </div>
      </section>
      <div class="card">
        <div class="card-header"><h3 class="card-title">Contact Details</h3></div>
        <div class="card-body">
          <div class="explorer-detail-grid">
            ${renderDetailItem('Role / Title', contact.title || 'Not provided')}
            ${renderDetailItem('Category', contact.category || 'Prospective Contact')}
            ${renderDetailItem('Email', contact.email ? `<a href="mailto:${escapeHtml(contact.email)}">${escapeHtml(contact.email)}</a>` : 'Not provided', true)}
            ${renderDetailItem('Phone', contact.phone ? `<a href="tel:${escapeHtml(contact.phone)}">${escapeHtml(contact.phone)}</a>` : 'Not provided', true)}
            ${renderDetailItem('Confidence', capitalize(contact.confidence || 'low'))}
            ${renderDetailItem('Linked Organization', contact.organization_name || 'Not provided')}
            ${renderDetailItem('Organization Website', contact.organization_website ? `<a href="${escapeHtml(contact.organization_website)}" target="_blank" rel="noopener noreferrer">${escapeHtml(safeHostname(contact.organization_website) || contact.organization_website)}</a>` : 'Not provided', true)}
            ${renderDetailItem('Organization Address', contact.organization_address || [contact.organization_city, contact.organization_state, contact.organization_postal_code].filter(Boolean).join(', ') || 'Not provided')}
          </div>
          ${contact.notes ? `<div class="explorer-detail-item" style="margin-top:12px;"><p class="explorer-detail-label">Evaluation Justification</p><p class="explorer-detail-value" style="font-weight:500;">${escapeHtml(contact.notes)}</p></div>` : ''}
        </div>
      </div>
    </div>
  `;
}

function normalizeExplorerResults(organizations) {
  return (organizations || []).map((org, index) => ({
    ...(org || {}),
    _preview_key: getExplorerPreviewKey(org) || `preview-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
  }));
}

function getExplorerPreviewKey(org) {
  if (!org || typeof org !== 'object') return '';
  return String(
    org._preview_key
    || org.id
    || [org.name, org.website, org.address, org.city, org.state].filter(Boolean).join('|')
  ).trim();
}

function getExplorerCompositeKey(org) {
  if (!org || typeof org !== 'object') return '';
  if (String(org.record_type || '').toLowerCase() === 'contact') {
    return [
      'contact',
      org.email || '',
      org.full_name || org.name || '',
      org.organization_name || '',
      org.organization_website || '',
    ].map((value) => String(value || '').trim().toLowerCase()).join('|');
  }
  return [org.name, org.website, org.address, org.city, org.state]
    .map((value) => String(value || '').trim().toLowerCase())
    .join('|');
}

function getSelectedExplorerOrganizations(mode = 'selected') {
  const visibleRows = getExplorerVisibleResults(explorerState.organizations);
  if (mode === 'all') return visibleRows.slice();
  const selected = [];
  for (const org of visibleRows) {
    const key = getExplorerPreviewKey(org);
    if (key && explorerState.selectedPreviewKeys.has(key)) selected.push(org);
  }
  return selected;
}

function syncExplorerSelectionUI() {
  const selectAll = document.getElementById('explorerSelectAllResults');
  const importSelectedBtn = document.getElementById('explorerImportSelectedBtn');
  const importAllBtn = document.getElementById('explorerImportAllBtn');
  const countEl = document.getElementById('explorerResultsCount');
  const visibleRows = getExplorerVisibleResults(explorerState.organizations);
  const total = explorerState.organizations.length;
  const visibleTotal = visibleRows.length;
  const selected = getSelectedExplorerOrganizations('selected').length;

  if (selectAll) {
    const enabled = visibleTotal > 0;
    selectAll.disabled = !enabled;
    selectAll.checked = enabled && selected > 0 && selected === visibleTotal;
    selectAll.indeterminate = enabled && selected > 0 && selected < visibleTotal;
  }
  if (importSelectedBtn) {
    importSelectedBtn.disabled = explorerState.importing || selected === 0 || !explorerState.schemaReadyForImport;
    importSelectedBtn.textContent = explorerState.importing ? 'Importing...' : `Import Selected${selected ? ` (${selected})` : ''}`;
  }
  if (importAllBtn) {
    importAllBtn.disabled = explorerState.importing || visibleTotal === 0 || !explorerState.schemaReadyForImport;
    importAllBtn.textContent = explorerState.importing ? 'Importing...' : `Import All${visibleTotal ? ` (${visibleTotal})` : ''}`;
  }
  if (countEl && total > 0 && !String(countEl.textContent || '').includes('Search')) {
    const orgCount = explorerState.organizations.filter((r) => String(r.record_type || 'organization') !== 'contact').length;
    const contactCount = total - orgCount;
    const base = `${total} preview results (${orgCount} org / ${contactCount} contact)`;
    const visiblePart = visibleTotal !== total ? ` | ${visibleTotal} visible` : '';
    countEl.textContent = selected > 0 ? `${base}${visiblePart} | ${selected} selected` : `${base}${visiblePart}`;
  }
}

async function importExplorerResults(mode = 'selected') {
  if (explorerState.importing) return;
  if (!explorerState.schemaReadyForImport) {
    notifyUser('Import is disabled until the organizations schema migration is applied.');
    return;
  }
  const records = getSelectedExplorerOrganizations(mode);
  if (!records.length) {
    notifyUser('Select at least one result to import.');
    return;
  }
  const includeLowQualityContacts = !!document.getElementById('explorerIncludeLowQualityContacts')?.checked;
  const importableRecords = records.filter((record) => {
    if (String(record.record_type || '').toLowerCase() !== 'contact') return true;
    return includeLowQualityContacts || getExplorerContactValidation(record).ok;
  });
  const excludedLowQualityContacts = records.length - importableRecords.length;
  if (!importableRecords.length) {
    notifyUser('No importable results match the current review settings.');
    return;
  }
  const extractContacts = !!document.getElementById('explorerImportContactsToggle')?.checked;
  const scoreRaw = document.getElementById('explorerScoreFilter')?.value || 'all';
  const minScore = scoreRaw === 'all' ? 0 : clampInt(scoreRaw, 0, 100, 0);
  const orgSelected = importableRecords.filter((r) => String(r.record_type || 'organization') !== 'contact').length;
  const contactSelected = importableRecords.length - orgSelected;
  const confirmMsg = `Import ${importableRecords.length} preview result${importableRecords.length === 1 ? '' : 's'}?`;
  const confirmDetail = `${orgSelected} organization${orgSelected === 1 ? '' : 's'}, ${contactSelected} contact${contactSelected === 1 ? '' : 's'}${excludedLowQualityContacts ? ` | ${excludedLowQualityContacts} low-quality contact${excludedLowQualityContacts === 1 ? '' : 's'} skipped by review filter.` : ''}${extractContacts ? ' | Additional contact extraction will run for imported organizations.' : ''}`;
  const confirmed = await showExplorerConfirmModal({
    title: 'Confirm Import',
    message: confirmMsg,
    detail: confirmDetail,
    confirmLabel: 'Import Records',
    cancelLabel: 'Cancel',
  });
  if (!confirmed) return;

  explorerState.importing = true;
  syncExplorerSelectionUI();
  try {
    const response = await apiJson('/api/explorer/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        records: importableRecords.map(stripPreviewOnlyFields),
        extract_contacts: extractContacts,
        min_score: minScore,
      }),
    });
    const saved = Number(response.saved_count || 0);
    const savedContacts = Number(response.saved_contact_count || 0);
    const requested = Number(response.requested_count || importableRecords.length);
    const savedRows = normalizeExplorerResults([
      ...(Array.isArray(response.organizations) ? response.organizations : []),
      ...(Array.isArray(response.contacts) ? response.contacts : []),
    ]);

    if (savedRows.length) {
      const savedById = new Map(savedRows.filter((row) => row && row.id).map((row) => [String(row.id), row]));
      const savedByComposite = new Map(savedRows.map((row) => [getExplorerCompositeKey(row), row]));
      explorerState.organizations = explorerState.organizations.map((org) => {
        const byId = org.id ? savedById.get(String(org.id)) : null;
        const byComposite = savedByComposite.get(getExplorerCompositeKey(org));
        return byId || byComposite || org;
      });
      renderExplorerResults(explorerState.organizations);
    }

    if (window.FundsApp?.notify) {
      window.FundsApp.notify(
        'Funds Explorer Import Complete',
        `Imported ${saved} organization${saved === 1 ? '' : 's'} and ${savedContacts} contact${savedContacts === 1 ? '' : 's'} from ${requested} selected result${requested === 1 ? '' : 's'}${excludedLowQualityContacts ? ` (${excludedLowQualityContacts} review-flagged contact${excludedLowQualityContacts === 1 ? '' : 's'} skipped).` : ''}${extractContacts ? ' (plus contact extraction on imported orgs).' : '.'}`,
        ['all'],
      );
    }
    notifyUser(`Imported ${saved} organizations and ${savedContacts} contacts.${excludedLowQualityContacts ? ` Skipped ${excludedLowQualityContacts} contact(s) pending review.` : ''}`);
    const metaEl = document.getElementById('explorerSearchMeta');
    if (metaEl) {
      const issues = Array.isArray(response.issues) ? response.issues.filter(Boolean) : [];
      metaEl.textContent = `Import complete: ${saved} organizations and ${savedContacts} contacts saved from ${requested} selected result(s).${excludedLowQualityContacts ? ` Skipped ${excludedLowQualityContacts} contact(s) pending review.` : ''}${extractContacts ? ` Additional contact extraction ${response.contacts_extracted ? 'completed' : 'skipped/failed'}.` : ''}${issues.length ? ` Issues: ${issues.length}.` : ''}`;
    }
    explorerState.selectedPreviewKeys.clear();
    syncExplorerSelectionUI();
  } catch (error) {
    console.error('Explorer import failed', error);
    if (window.FundsApp?.notify) {
      window.FundsApp.notify('Funds Explorer Import Failed', 'Unable to import the selected preview results.', ['all']);
    }
    notifyUser('Unable to import selected results right now.');
  } finally {
    explorerState.importing = false;
    syncExplorerSelectionUI();
  }
}

function stripPreviewOnlyFields(org) {
  const copy = { ...(org || {}) };
  delete copy._preview_key;
  return copy;
}

function getExplorerRuntimeBudgetForRadius(radiusMiles) {
  const r = Number(radiusMiles || 0);
  if (!Number.isFinite(r) || r <= 0) return 460;
  if (r <= 15) return 460;
  if (r <= 25) return 600;
  if (r <= 50) return 1000;
  return Math.min(1800, 1000 + Math.ceil((r - 50) / 10) * 120);
}

function getExplorerSeenStoreKey() {
  return 'funds_explorer_seen_results_v1';
}

function getExplorerSeenGlobalKey() {
  return '__global__';
}

function getExplorerSeenCacheTtlMs() {
  return 60 * 24 * 60 * 60 * 1000; // 60 days
}

function getExplorerSeenQueryFingerprint({ location = '', discoveryMode = 'all', minScore = 0 } = {}) {
  return [
    String(location || '').trim().toLowerCase(),
    String(discoveryMode || 'all').trim().toLowerCase(),
    Number(minScore || 0),
  ].join('|');
}

function loadExplorerSeenStore() {
  try {
    const parsed = JSON.parse(localStorage.getItem(getExplorerSeenStoreKey()) || '{}');
    const store = parsed && typeof parsed === 'object' ? parsed : {};
    return pruneExplorerSeenStore(store);
  } catch {
    return {};
  }
}

function saveExplorerSeenStore(store) {
  try {
    localStorage.setItem(getExplorerSeenStoreKey(), JSON.stringify(store || {}));
  } catch {}
}

function getExplorerSeenResultKeysForQuery(queryMeta) {
  const store = loadExplorerSeenStore();
  const fp = getExplorerSeenQueryFingerprint(queryMeta);
  const queryKeys = getExplorerSeenBucketKeys(store[fp]);
  const globalKeys = getExplorerSeenBucketKeys(store[getExplorerSeenGlobalKey()]);
  return Array.from(new Set([...globalKeys, ...queryKeys])).slice(-5000);
}

function rememberExplorerSeenResultKeys(results, queryMeta) {
  const fp = getExplorerSeenQueryFingerprint(queryMeta);
  const store = loadExplorerSeenStore();
  const currentMap = getExplorerSeenBucketMap(store[fp]);
  const globalMap = getExplorerSeenBucketMap(store[getExplorerSeenGlobalKey()]);
  const now = Date.now();
  for (const row of results || []) {
    const stable = getExplorerStableRecordKey(row);
    if (stable) {
      currentMap.set(stable, now);
      globalMap.set(stable, now);
    }
  }
  store[fp] = serializeExplorerSeenBucket(currentMap, 5000);
  store[getExplorerSeenGlobalKey()] = serializeExplorerSeenBucket(globalMap, 10000);
  saveExplorerSeenStore(pruneExplorerSeenStore(store));
}

function pruneExplorerSeenStore(store) {
  const ttlMs = getExplorerSeenCacheTtlMs();
  const cutoff = Date.now() - ttlMs;
  const next = {};
  for (const [bucketKey, bucket] of Object.entries(store || {})) {
    const map = getExplorerSeenBucketMap(bucket);
    if (!map.size) continue;
    const filtered = new Map();
    for (const [key, ts] of map.entries()) {
      const n = Number(ts || 0);
      if (Number.isFinite(n) && n >= cutoff) filtered.set(key, n);
    }
    if (filtered.size) {
      next[bucketKey] = serializeExplorerSeenBucket(
        filtered,
        bucketKey === getExplorerSeenGlobalKey() ? 10000 : 5000,
      );
    }
  }
  return next;
}

function getExplorerSeenBucketKeys(bucket) {
  return Array.from(getExplorerSeenBucketMap(bucket).keys());
}

function getExplorerSeenBucketMap(bucket) {
  const map = new Map();
  const now = Date.now();
  const ttlMs = getExplorerSeenCacheTtlMs();
  const fallbackTs = now - Math.floor(ttlMs / 2); // migrate legacy cache entries without immediately expiring them
  if (Array.isArray(bucket)) {
    for (const item of bucket) {
      if (typeof item === 'string') {
        const key = item.trim().toLowerCase();
        if (key) map.set(key, fallbackTs);
        continue;
      }
      if (item && typeof item === 'object') {
        const key = String(item.k || item.key || '').trim().toLowerCase();
        const ts = Number(item.t || item.ts || item.seen_at || fallbackTs);
        if (key) map.set(key, Number.isFinite(ts) ? ts : fallbackTs);
      }
    }
    return map;
  }
  if (bucket && typeof bucket === 'object') {
    // Support object shape {items:[...]} for future flexibility.
    const items = Array.isArray(bucket.items) ? bucket.items : [];
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const key = String(item.k || item.key || '').trim().toLowerCase();
      const ts = Number(item.t || item.ts || item.seen_at || fallbackTs);
      if (key) map.set(key, Number.isFinite(ts) ? ts : fallbackTs);
    }
  }
  return map;
}

function serializeExplorerSeenBucket(map, maxItems) {
  return Array.from(map.entries())
    .sort((a, b) => Number(a[1] || 0) - Number(b[1] || 0))
    .slice(-Math.max(1, Number(maxItems || 5000)))
    .map(([k, t]) => ({ k, t: Number(t || Date.now()) }));
}

function getExplorerStableRecordKey(record) {
  if (!record || typeof record !== 'object') return '';
  const explicitKey = String(record.record_key || '').trim().toLowerCase();
  if (explicitKey) return explicitKey;
  const type = String(record.record_type || 'organization').toLowerCase();
  if (type === 'contact') {
    return [
      'contact',
      record.email || '',
      record.full_name || record.name || '',
      record.organization_name || '',
      record.organization_website || '',
    ].map((v) => String(v || '').trim().toLowerCase()).join('|');
  }
  return [
    'organization',
    record.name || '',
    record.website || '',
    record.address || '',
    record.city || '',
    record.state || '',
  ].map((v) => String(v || '').trim().toLowerCase()).join('|');
}

async function showExplorerConfirmModal({
  title = 'Confirm Action',
  message = 'Are you sure?',
  detail = '',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
} = {}) {
  const modal = ensureExplorerConfirmModal();
  const titleEl = modal.querySelector('[data-explorer-confirm-title]');
  const msgEl = modal.querySelector('[data-explorer-confirm-message]');
  const detailEl = modal.querySelector('[data-explorer-confirm-detail]');
  const confirmBtn = modal.querySelector('[data-explorer-confirm-accept]');
  const cancelBtn = modal.querySelector('[data-explorer-confirm-cancel]');
  const closeBtn = modal.querySelector('[data-explorer-confirm-close]');
  const backdrop = modal.querySelector('.modal-backdrop');

  if (titleEl) titleEl.textContent = title;
  if (msgEl) msgEl.textContent = message;
  if (detailEl) {
    detailEl.textContent = detail || '';
    detailEl.style.display = detail ? '' : 'none';
  }
  if (confirmBtn) confirmBtn.textContent = confirmLabel;
  if (cancelBtn) cancelBtn.textContent = cancelLabel;

  modal.classList.add('active');

  return new Promise((resolve) => {
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      modal.classList.remove('active');
      cleanup();
      resolve(!!value);
    };
    const onConfirm = () => finish(true);
    const onCancel = () => finish(false);
    const onKey = (event) => {
      if (event.key === 'Escape') finish(false);
      if (event.key === 'Enter') finish(true);
    };
    const cleanup = () => {
      confirmBtn?.removeEventListener('click', onConfirm);
      cancelBtn?.removeEventListener('click', onCancel);
      closeBtn?.removeEventListener('click', onCancel);
      backdrop?.removeEventListener('click', onCancel);
      document.removeEventListener('keydown', onKey);
    };

    confirmBtn?.addEventListener('click', onConfirm);
    cancelBtn?.addEventListener('click', onCancel);
    closeBtn?.addEventListener('click', onCancel);
    backdrop?.addEventListener('click', onCancel);
    document.addEventListener('keydown', onKey);
  });
}

function ensureExplorerConfirmModal() {
  let modal = document.getElementById('explorerConfirmModal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.className = 'modal';
  modal.id = 'explorerConfirmModal';
  modal.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-content" style="width:min(560px, calc(100vw - 20px));">
      <div class="modal-header">
        <h2 class="modal-title" data-explorer-confirm-title>Confirm Action</h2>
        <button type="button" class="modal-close" aria-label="Close confirmation dialog" data-explorer-confirm-close>&times;</button>
      </div>
      <div class="modal-body">
        <p style="margin:0; color:var(--text-primary); font-weight:600;" data-explorer-confirm-message>Are you sure?</p>
        <p class="text-muted text-caption" style="margin:10px 0 0 0;" data-explorer-confirm-detail></p>
      </div>
      <div class="modal-footer" style="display:flex; justify-content:flex-end; gap:10px;">
        <button type="button" class="btn btn-secondary btn-pill" data-explorer-confirm-cancel>Cancel</button>
        <button type="button" class="btn btn-primary btn-pill" data-explorer-confirm-accept>Confirm</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  return modal;
}

async function apiJson(url, options) {
  if (window.FundsApp?.apiJson) return window.FundsApp.apiJson(url, options);
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

function getScoreThemeClass(score) {
  const n = Number(score || 0);
  if (n >= 85) return 'score-high';
  if (n >= 75) return 'score-mid';
  return 'score-low';
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
