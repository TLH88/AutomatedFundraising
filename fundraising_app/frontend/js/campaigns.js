/**
 * Funds 4 Furry Friends - Campaigns JavaScript
 */

const campaignApiState = {
  limit: 6,
  total: 0,
  lastCampaigns: [],
  activeModalCampaignId: null,
  activeModalMode: 'view',
};

let campaignPageLoadGuard = null;

document.addEventListener('DOMContentLoaded', () => {
  console.log('Campaigns Page Initialized');
  campaignPageLoadGuard = window.FundsApp?.createDataLoadGuard?.({
    target: '.main-content .container',
    message: 'Loading campaigns...',
  });
  campaignPageLoadGuard?.start();

  initCampaignFilters();
  applyCampaignFiltersFromUrl();
  initCampaignForm();
  ensureCampaignActionModal();
  loadCampaigns();
});

async function apiJson(url, options) {
  if (window.FundsApp?.apiJson) return window.FundsApp.apiJson(url, options);
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

/**
 * Initialize Campaign Filters
 */
function initCampaignFilters() {
  const searchInput = document.getElementById('campaignSearch');
  const statusFilter = document.getElementById('statusFilter');
  const categoryFilter = document.getElementById('categoryFilter');
  const sortBy = document.getElementById('sortBy');

  if (searchInput) {
    searchInput.addEventListener('input', filterCampaigns);
  }

  if (statusFilter) {
    statusFilter.addEventListener('change', filterCampaigns);
  }

  if (categoryFilter) {
    categoryFilter.addEventListener('change', filterCampaigns);
  }

  if (sortBy) {
    sortBy.addEventListener('change', sortCampaigns);
  }
}

function applyCampaignFiltersFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const status = (params.get('status') || '').toLowerCase();
  const statusFilter = document.getElementById('statusFilter');
  if (statusFilter && ['all', 'active', 'draft', 'paused', 'completed'].includes(status)) {
    statusFilter.value = status;
  }
}

/**
 * Filter Campaigns
 */
function filterCampaigns() {
  const searchValue = document.getElementById('campaignSearch')?.value.toLowerCase() || '';
  const statusValue = document.getElementById('statusFilter')?.value || 'all';
  const categoryValue = document.getElementById('categoryFilter')?.value || 'all';

  const campaignCards = document.querySelectorAll('.campaign-card');

  campaignCards.forEach((card) => {
    const title = card.querySelector('.campaign-title')?.textContent.toLowerCase() || '';
    const description = card.querySelector('.campaign-description')?.textContent.toLowerCase() || '';
    const status = card.querySelector('.campaign-status-badge')?.textContent.toLowerCase() || '';
    const category = card.querySelector('.campaign-category-badge')?.textContent.toLowerCase() || '';

    const matchesSearch = title.includes(searchValue) || description.includes(searchValue);
    const matchesStatus = statusValue === 'all' || status.includes(statusValue.toLowerCase());
    const matchesCategory = categoryValue === 'all' || category.includes(categoryValue.toLowerCase());

    card.style.display = (matchesSearch && matchesStatus && matchesCategory) ? 'flex' : 'none';
  });

  updateResultsCount();
}

/**
 * Sort Campaigns
 */
function sortCampaigns() {
  const sortValue = document.getElementById('sortBy')?.value || 'recent';
  const grid = document.getElementById('campaignsGrid');
  if (!grid) return;
  const cards = Array.from(grid.querySelectorAll('.campaign-card'));

  cards.sort((a, b) => {
    switch (sortValue) {
      case 'progress': {
        const progressA = parseFloat(a.querySelector('.progress-fill')?.style.width) || 0;
        const progressB = parseFloat(b.querySelector('.progress-fill')?.style.width) || 0;
        return progressB - progressA;
      }

      case 'raised': {
        const raisedA = parseFloat((a.querySelector('.campaign-raised')?.textContent || '0').replace(/[$,]/g, '')) || 0;
        const raisedB = parseFloat((b.querySelector('.campaign-raised')?.textContent || '0').replace(/[$,]/g, '')) || 0;
        return raisedB - raisedA;
      }

      case 'ending': {
        const daysA = parseInt(a.querySelector('.campaign-days')?.textContent, 10) || 999;
        const daysB = parseInt(b.querySelector('.campaign-days')?.textContent, 10) || 999;
        return daysA - daysB;
      }

      default:
        return 0;
    }
  });

  cards.forEach((card) => grid.appendChild(card));
}

/**
 * Update Results Count
 */
function updateResultsCount() {
  const visibleCards = Array.from(document.querySelectorAll('.campaign-card'))
    .filter((card) => card.style.display !== 'none').length;
  const totalCards = campaignApiState.total || document.querySelectorAll('.campaign-card').length;

  const loadMoreContainer = document.querySelector('.load-more-container p');
  if (loadMoreContainer) {
    loadMoreContainer.textContent = `Showing ${visibleCards} of ${totalCards} campaigns`;
  }
}

/**
 * Initialize Campaign Form
 */
function initCampaignForm() {
  const form = document.getElementById('addCampaignForm');
  const newCampaignBtn = document.getElementById('newCampaignBtn');

  if (newCampaignBtn) {
    newCampaignBtn.addEventListener('click', (e) => {
      // Defensive: avoid accidental form-submit/page navigation behavior.
      e.preventDefault();
      e.stopPropagation();
      openModal('addCampaignModal');
    });
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await handleCampaignSubmit(e);
    });
  }
}

/**
 * Handle Campaign Form Submit
 */
async function handleCampaignSubmit(event) {
  const payload = getCampaignFormPayload(event.target);
  if (!payload.name || !payload.description || !payload.category || !payload.goal) {
    showToast('Please complete all required fields');
    return;
  }

  try {
    await apiJson('/api/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    showToast('Campaign created successfully!', 'success');
    closeModal('addCampaignModal');
    event.target.reset();

    campaignApiState.limit += 1;
    await loadCampaigns();
  } catch (error) {
    console.error('Error creating campaign:', error);
    showToast('Unable to create campaign');
  }
}

function getCampaignFormPayload(form) {
  const fields = Array.from(form.querySelectorAll('.input'));
  const [titleEl, descEl, categoryEl, goalEl, startEl, endEl, imageEl] = fields;
  return {
    name: titleEl?.value?.trim(),
    description: descEl?.value?.trim(),
    category: categoryEl?.value?.trim() || 'general',
    goal: Number(goalEl?.value || 0),
    start_date: startEl?.value || null,
    end_date: endEl?.value || null,
    image_url: imageEl?.value?.trim() || null,
    status: 'draft',
  };
}

/**
 * Load Campaigns from API
 */
async function loadCampaigns() {
  const grid = document.getElementById('campaignsGrid');
  if (!grid) return;

  try {
    const data = await apiJson(`/api/campaigns?limit=${campaignApiState.limit}`);
    const campaigns = Array.isArray(data.campaigns) ? data.campaigns : [];
    campaignApiState.lastCampaigns = campaigns;
    campaignApiState.total = typeof data.total === 'number' ? data.total : campaigns.length;

    grid.innerHTML = campaigns.map(renderCampaignCard).join('');
    updateCampaignStats(campaigns);
    syncCampaignLoadMoreButton(campaigns.length);
    applyCampaignFiltersFromUrl();
    filterCampaigns();
    campaignPageLoadGuard?.success();
    campaignPageLoadGuard = null;
  } catch (error) {
    console.error('Error loading campaigns:', error);
    showToast('Unable to load campaigns from API');
    campaignPageLoadGuard?.fail({ restoreFallback: false });
    campaignPageLoadGuard = null;
  }
}

function syncCampaignLoadMoreButton(loadedCount) {
  const btn = document.querySelector('.load-more-container .btn');
  if (!btn) return;
  const allLoaded = loadedCount >= (campaignApiState.total || loadedCount);
  btn.disabled = allLoaded;
  btn.textContent = allLoaded ? 'All Campaigns Loaded' : 'Load More Campaigns';
}

function updateCampaignStats(campaigns) {
  const active = campaigns.filter((c) => String(c.status || '').toLowerCase() === 'active');
  const totalRaised = campaigns.reduce((sum, c) => sum + Number(c.raised || 0), 0);
  const avgProgress = campaigns.length
    ? Math.round(campaigns.reduce((sum, c) => sum + campaignProgressPercent(c), 0) / campaigns.length)
    : 0;
  const endingSoon = campaigns.filter((c) => {
    const d = daysLeft(c.end_date);
    return typeof d === 'number' && d >= 0 && d <= 7;
  }).length;

  const valuesByLabel = {
    'Active Campaigns': String(active.length),
    'Total Raised': formatCurrency(totalRaised, { decimals: 0 }),
    'Avg. Goal Progress': `${avgProgress}%`,
    'Ending Soon': String(endingSoon),
  };

  document.querySelectorAll('.campaigns-stats-grid .stat-card').forEach((card) => {
    const label = card.querySelector('.stat-card-label')?.textContent?.trim();
    const valueEl = card.querySelector('.stat-card-value');
    if (label && valueEl && valuesByLabel[label] != null) {
      valueEl.textContent = valuesByLabel[label];
    }
  });
}

function renderCampaignCard(campaign) {
  const name = campaign.name || 'Untitled Campaign';
  const status = String(campaign.status || 'draft');
  const category = formatCategory(campaign.category);
  const description = campaign.description || 'No description provided.';
  const raised = Number(campaign.raised || 0);
  const goal = Number(campaign.goal || 0);
  const progress = campaignProgressPercent(campaign);
  const days = daysLeft(campaign.end_date);
  const campaignId = campaign.id || '';

  return `
    <div class="campaign-card" data-campaign-id="${escapeHtml(String(campaignId))}">
      <div class="campaign-card-image" style="background-image: ${campaignImage(campaign)};">
        <div class="campaign-status-badge ${escapeHtml(status.toLowerCase())}">${escapeHtml(capitalize(status))}</div>
        <div class="campaign-category-badge">${escapeHtml(category)}</div>
      </div>

      <div class="campaign-card-body">
        <h3 class="campaign-title">${escapeHtml(name)}</h3>
        <p class="campaign-description">${escapeHtml(description)}</p>

        <div class="campaign-progress-section">
          <div class="campaign-progress-header">
            <span class="campaign-raised">${formatCurrency(raised, { decimals: 0 })}</span>
            <span class="campaign-goal">of ${formatCurrency(goal, { decimals: 0 })}</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${Math.max(0, Math.min(100, progress))}%"></div>
          </div>
          <div class="campaign-progress-footer">
            <span class="campaign-donors">${Number(campaign.donors || 0)} donors</span>
            <span class="campaign-days">${formatDaysLeft(days)}</span>
          </div>
        </div>
      </div>

      <div class="campaign-card-footer">
        <button class="btn btn-secondary btn-sm" data-action="view">
          <span>View</span>
        </button>
        <button class="btn btn-secondary btn-sm" data-action="edit">
          <span>Edit</span>
        </button>
        <button class="btn btn-primary btn-sm" data-action="analytics">
          <span>Analytics</span>
        </button>
      </div>
    </div>
  `;
}

function campaignImage(campaign) {
  const fallback = "url('https://images.unsplash.com/photo-1450778869180-41d0601e046e?w=600&h=300&fit=crop')";
  if (campaign.image_url) {
    return `url('${String(campaign.image_url).replace(/'/g, '%27')}')`;
  }
  return fallback;
}

function campaignProgressPercent(campaign) {
  const goal = Number(campaign.goal || 0);
  const raised = Number(campaign.raised || 0);
  if (!goal) return 0;
  return (raised / goal) * 100;
}

function daysLeft(value) {
  if (!value) return null;
  const end = new Date(value);
  if (Number.isNaN(end.getTime())) return null;
  const now = new Date();
  return Math.ceil((end - now) / 86400000);
}

function formatDaysLeft(days) {
  if (days == null) return 'No end date';
  if (days < 0) return 'Ended';
  if (days === 0) return 'Ends today';
  if (days === 1) return '1 day left';
  return `${days} days left`;
}

function formatCategory(value) {
  const text = String(value || 'general').replace(/[_-]+/g, ' ').trim();
  return text.split(/\s+/).map(capitalize).join(' ');
}

/**
 * View Campaign Details
 */
function viewCampaign(campaignId) {
  openCampaignActionModal(campaignId, 'view');
}

function findCampaignById(campaignId) {
  return campaignApiState.lastCampaigns.find((c) => String(c.id) === String(campaignId)) || null;
}

function ensureCampaignActionModal() {
  if (document.getElementById('campaignActionModal')) return;
  const host = document.createElement('div');
  host.innerHTML = `
    <div class="modal" id="campaignActionModal">
      <div class="modal-backdrop" data-campaign-modal-close></div>
      <div class="modal-content modal-large campaign-action-modal-content">
        <div class="modal-header">
          <div>
            <h2 class="modal-title" id="campaignActionTitle">Campaign Details</h2>
            <p class="modal-subtitle" id="campaignActionSubtitle" style="margin:6px 0 0;color:var(--text-secondary);font-size:var(--text-small);"></p>
          </div>
          <button type="button" class="modal-close" data-campaign-modal-close>×</button>
        </div>
        <div class="modal-body">
          <div class="campaign-action-tabs" role="tablist" aria-label="Campaign actions">
            <button type="button" class="btn btn-secondary btn-sm" data-campaign-mode="view">View</button>
            <button type="button" class="btn btn-secondary btn-sm" data-campaign-mode="edit">Edit</button>
            <button type="button" class="btn btn-secondary btn-sm" data-campaign-mode="analytics">Analytics</button>
          </div>
          <div id="campaignActionBody" class="campaign-action-body"></div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(host.firstElementChild);
}

function openCampaignActionModal(campaignId, mode = 'view') {
  const campaign = findCampaignById(campaignId);
  if (!campaign) {
    showToast('Campaign not found');
    return;
  }
  campaignApiState.activeModalCampaignId = String(campaignId);
  campaignApiState.activeModalMode = mode;
  renderCampaignActionModal(campaign, mode);
  const modal = document.getElementById('campaignActionModal');
  modal?.querySelectorAll('[data-campaign-modal-close]').forEach((el) => {
    if (!el.dataset.boundCampaignClose) {
      el.dataset.boundCampaignClose = '1';
      el.addEventListener('click', () => closeModal('campaignActionModal'));
    }
  });
  modal?.querySelectorAll('[data-campaign-mode]').forEach((el) => {
    if (!el.dataset.boundCampaignMode) {
      el.dataset.boundCampaignMode = '1';
      el.addEventListener('click', () => {
        const nextMode = el.dataset.campaignMode || 'view';
        const current = findCampaignById(campaignApiState.activeModalCampaignId);
        if (current) {
          campaignApiState.activeModalMode = nextMode;
          renderCampaignActionModal(current, nextMode);
        }
      });
    }
  });
  openModal('campaignActionModal');
}

function renderCampaignActionModal(campaign, mode) {
  const titleEl = document.getElementById('campaignActionTitle');
  const subtitleEl = document.getElementById('campaignActionSubtitle');
  const bodyEl = document.getElementById('campaignActionBody');
  if (!bodyEl) return;

  titleEl.textContent = campaign.name || 'Campaign';
  subtitleEl.textContent = `${formatCategory(campaign.category)} • ${capitalize(String(campaign.status || 'draft'))}`;

  document.querySelectorAll('#campaignActionModal [data-campaign-mode]').forEach((btn) => {
    const active = btn.dataset.campaignMode === mode;
    btn.classList.toggle('btn-primary', active);
    btn.classList.toggle('btn-secondary', !active);
  });

  if (mode === 'edit') {
    bodyEl.innerHTML = renderCampaignEditPanel(campaign);
    bindCampaignEditForm(campaign);
    return;
  }

  if (mode === 'analytics') {
    bodyEl.innerHTML = renderCampaignAnalyticsPanel(campaign);
    return;
  }

  bodyEl.innerHTML = renderCampaignViewPanel(campaign);
}

function renderCampaignViewPanel(campaign) {
  const goal = Number(campaign.goal || 0);
  const raised = Number(campaign.raised || 0);
  const progress = Math.max(0, Math.min(100, campaignProgressPercent(campaign)));
  return `
    <div class="campaign-modal-panel-grid">
      <section class="campaign-modal-panel-card">
        <h3 class="campaign-modal-section-title">Overview</h3>
        <p class="campaign-modal-description">${escapeHtml(campaign.description || 'No description provided.')}</p>
        <div class="campaign-modal-kpis">
          <div class="campaign-modal-kpi"><span>Raised</span><strong>${formatCurrency(raised, { decimals: 0 })}</strong></div>
          <div class="campaign-modal-kpi"><span>Goal</span><strong>${formatCurrency(goal, { decimals: 0 })}</strong></div>
          <div class="campaign-modal-kpi"><span>Progress</span><strong>${Math.round(progress)}%</strong></div>
          <div class="campaign-modal-kpi"><span>Days Left</span><strong>${escapeHtml(formatDaysLeft(daysLeft(campaign.end_date)))}</strong></div>
        </div>
        <div class="campaign-modal-progress-bar"><div class="campaign-modal-progress-fill" style="width:${progress}%"></div></div>
      </section>
      <section class="campaign-modal-panel-card">
        <h3 class="campaign-modal-section-title">Campaign Details</h3>
        <div class="campaign-modal-detail-list">
          <div><span>Category</span><strong>${escapeHtml(formatCategory(campaign.category))}</strong></div>
          <div><span>Status</span><strong>${escapeHtml(capitalize(String(campaign.status || 'draft')))}</strong></div>
          <div><span>Start Date</span><strong>${escapeHtml(formatDate(campaign.start_date))}</strong></div>
          <div><span>End Date</span><strong>${escapeHtml(formatDate(campaign.end_date))}</strong></div>
          <div><span>Donors</span><strong>${Number(campaign.donors || 0)}</strong></div>
          <div><span>Campaign ID</span><strong>${escapeHtml(String(campaign.id || 'N/A'))}</strong></div>
        </div>
      </section>
    </div>
  `;
}

function renderCampaignAnalyticsPanel(campaign) {
  const goal = Number(campaign.goal || 0);
  const raised = Number(campaign.raised || 0);
  const donors = Math.max(0, Number(campaign.donors || 0));
  const progress = Math.max(0, Math.min(100, campaignProgressPercent(campaign)));
  const daysRemaining = daysLeft(campaign.end_date);
  const avgGift = donors ? (raised / donors) : 0;
  const daysElapsed = elapsedDays(campaign.start_date, campaign.end_date);
  const projectedTotal = donors && daysElapsed > 0 ? Math.round((raised / Math.max(1, daysElapsed.elapsed)) * (daysElapsed.total || daysElapsed.elapsed)) : Math.round(raised);
  const projectedPct = goal ? Math.round((projectedTotal / goal) * 100) : 0;

  return `
    <div class="campaign-modal-panel-grid">
      <section class="campaign-modal-panel-card">
        <h3 class="campaign-modal-section-title">Performance Snapshot</h3>
        <div class="campaign-modal-kpis">
          <div class="campaign-modal-kpi"><span>Current Progress</span><strong>${Math.round(progress)}%</strong></div>
          <div class="campaign-modal-kpi"><span>Avg Gift</span><strong>${formatCurrency(avgGift, { decimals: 0 })}</strong></div>
          <div class="campaign-modal-kpi"><span>Donor Count</span><strong>${donors}</strong></div>
          <div class="campaign-modal-kpi"><span>Projected Total</span><strong>${formatCurrency(projectedTotal, { decimals: 0 })}</strong></div>
        </div>
        <div class="campaign-analytics-bars">
          <div class="campaign-analytics-bar-row">
            <span>Raised vs Goal</span>
            <div class="campaign-analytics-bar-track"><div class="campaign-analytics-bar-fill" style="width:${Math.min(100, progress)}%"></div></div>
            <strong>${Math.round(progress)}%</strong>
          </div>
          <div class="campaign-analytics-bar-row">
            <span>Projected Goal Attainment</span>
            <div class="campaign-analytics-bar-track"><div class="campaign-analytics-bar-fill alt" style="width:${Math.max(0, Math.min(100, projectedPct))}%"></div></div>
            <strong>${projectedPct}%</strong>
          </div>
        </div>
      </section>
      <section class="campaign-modal-panel-card">
        <h3 class="campaign-modal-section-title">Insights</h3>
        <ul class="campaign-analytics-insights">
          <li>${progress >= 75 ? 'Campaign is performing strongly and close to goal.' : 'Campaign has room to improve with targeted outreach.'}</li>
          <li>${daysRemaining == null ? 'No end date set; consider adding one to improve urgency messaging.' : `${formatDaysLeft(daysRemaining)} for donor conversion pushes.`}</li>
          <li>${avgGift >= 250 ? 'Average gift size is strong; prioritize major-donor messaging.' : 'Average gift size suggests broader volume campaigns and recurring asks may help.'}</li>
        </ul>
      </section>
    </div>
  `;
}

function renderCampaignEditPanel(campaign) {
  return `
    <form id="campaignEditForm" class="form">
      <div class="campaign-modal-panel-grid">
        <section class="campaign-modal-panel-card">
          <h3 class="campaign-modal-section-title">Edit Campaign</h3>
          <div class="input-group">
            <label class="label">Campaign Title *</label>
            <input type="text" class="input" name="name" value="${escapeAttr(campaign.name || '')}" required>
          </div>
          <div class="input-group">
            <label class="label">Description *</label>
            <textarea class="input" name="description" rows="4" required>${escapeHtml(campaign.description || '')}</textarea>
          </div>
          <div class="form-row">
            <div class="input-group">
              <label class="label">Category *</label>
              <select class="input" name="category" required>
                ${renderCampaignCategoryOptions(campaign.category)}
              </select>
            </div>
            <div class="input-group">
              <label class="label">Status *</label>
              <select class="input" name="status" required>
                ${renderCampaignStatusOptions(campaign.status)}
              </select>
            </div>
          </div>
        </section>
        <section class="campaign-modal-panel-card">
          <h3 class="campaign-modal-section-title">Goals & Schedule</h3>
          <div class="input-group">
            <label class="label">Goal Amount *</label>
            <input type="number" class="input" name="goal" min="1" step="1" value="${Number(campaign.goal || 0)}" required>
          </div>
          <div class="input-group">
            <label class="label">Amount Raised (Manual Override)</label>
            <input type="number" class="input" name="raised" min="0" step="0.01" value="${Number(campaign.raised || 0)}">
            <span class="input-hint">Use this to correct campaign totals when needed. Donations posted with a linked campaign can also update this automatically.</span>
          </div>
          <div class="form-row">
            <div class="input-group">
              <label class="label">Start Date</label>
              <input type="date" class="input" name="start_date" value="${formatDateInput(campaign.start_date)}">
            </div>
            <div class="input-group">
              <label class="label">End Date</label>
              <input type="date" class="input" name="end_date" value="${formatDateInput(campaign.end_date)}">
            </div>
          </div>
          <div class="input-group">
            <label class="label">Image URL</label>
            <input type="url" class="input" name="image_url" value="${escapeAttr(campaign.image_url || '')}" placeholder="https://...">
          </div>
          <div class="form-actions">
            <button type="button" class="btn btn-secondary" id="campaignDeleteBtn">Delete Campaign</button>
            <button type="button" class="btn btn-secondary" id="campaignEditCancelBtn">Cancel</button>
            <button type="submit" class="btn btn-primary">Save Changes</button>
          </div>
        </section>
      </div>
    </form>
  `;
}

function bindCampaignEditForm(campaign) {
  const form = document.getElementById('campaignEditForm');
  const cancelBtn = document.getElementById('campaignEditCancelBtn');
  const deleteBtn = document.getElementById('campaignDeleteBtn');
  cancelBtn?.addEventListener('click', () => renderCampaignActionModal(campaign, 'view'));
  deleteBtn?.addEventListener('click', async () => {
    const ok = window.FundsApp?.confirmDialog
      ? await window.FundsApp.confirmDialog({
        title: 'Delete Campaign?',
        subtitle: campaign.name || 'Untitled Campaign',
        message: 'This will permanently remove the campaign record. This action cannot be undone.',
        confirmLabel: 'Delete Campaign',
        cancelLabel: 'Keep Campaign',
        confirmVariant: 'danger',
      })
      : window.confirm(`Delete campaign "${campaign.name || 'Untitled Campaign'}"? This cannot be undone.`);
    if (!ok) return;
    try {
      await apiJson(`/api/campaigns/${encodeURIComponent(String(campaign.id))}`, { method: 'DELETE' });
      showToast('Campaign deleted');
      closeModal('campaignActionModal');
      campaignApiState.lastCampaigns = campaignApiState.lastCampaigns.filter((c) => String(c.id) !== String(campaign.id));
      campaignApiState.total = Math.max(0, Number(campaignApiState.total || 0) - 1);
      await loadCampaigns();
    } catch (error) {
      console.error('Error deleting campaign:', error);
      showToast('Unable to delete campaign');
    }
  });
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const payload = {
      name: String(fd.get('name') || '').trim(),
      description: String(fd.get('description') || '').trim(),
      category: String(fd.get('category') || '').trim(),
      status: String(fd.get('status') || '').trim(),
      goal: Number(fd.get('goal') || 0),
      raised: Number(fd.get('raised') || 0),
      start_date: String(fd.get('start_date') || '') || null,
      end_date: String(fd.get('end_date') || '') || null,
      image_url: String(fd.get('image_url') || '').trim() || null,
    };
    if (!payload.name || !payload.description || !payload.category || !payload.status || !payload.goal) {
      showToast('Please complete all required fields');
      return;
    }
    try {
      const response = await apiJson(`/api/campaigns/${encodeURIComponent(String(campaign.id))}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const updated = response.campaign || { ...campaign, ...payload };
      campaignApiState.lastCampaigns = campaignApiState.lastCampaigns.map((c) => (
        String(c.id) === String(campaign.id) ? { ...c, ...updated } : c
      ));
      showToast('Campaign updated successfully');
      await loadCampaigns();
      const fresh = findCampaignById(campaign.id) || { ...campaign, ...updated };
      campaignApiState.activeModalMode = 'view';
      renderCampaignActionModal(fresh, 'view');
    } catch (error) {
      console.error('Error updating campaign:', error);
      showToast('Unable to update campaign');
    }
  });
}

function renderCampaignStatusOptions(selected) {
  const options = ['draft', 'active', 'paused', 'completed'];
  return options.map((value) => (
    `<option value="${value}" ${String(selected || '').toLowerCase() === value ? 'selected' : ''}>${capitalize(value)}</option>`
  )).join('');
}

function renderCampaignCategoryOptions(selected) {
  const options = [
    ['medical', 'Medical Care'],
    ['rescue', 'Rescue Operations'],
    ['shelter', 'Shelter & Housing'],
    ['emergency', 'Emergency Fund'],
    ['general', 'General'],
  ];
  const selectedValue = String(selected || '').toLowerCase();
  return options.map(([value, label]) => (
    `<option value="${value}" ${selectedValue === value ? 'selected' : ''}>${label}</option>`
  )).join('');
}

/**
 * Modal Controls
 */
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('active');
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('active');
  }
}

/**
 * Toast Notification
 */
function showToast(message) {
  const toast = document.createElement('div');
  toast.textContent = message;
  toast.style.cssText = 'position:fixed;bottom:24px;right:24px;background:var(--accent-green);color:white;padding:16px 24px;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.3);z-index:9999;font-weight:500;transition:opacity 0.3s ease;';
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function formatCurrency(value, { decimals = 2 } = {}) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  }).format(Number(value || 0));
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function capitalize(value) {
  const text = String(value || '');
  return text ? text[0].toUpperCase() + text.slice(1) : '';
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

function formatDate(value) {
  if (!value) return 'Not set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString();
}

function formatDateInput(value) {
  if (!value) return '';
  const text = String(value);
  return text.length >= 10 ? text.slice(0, 10) : text;
}

function elapsedDays(startValue, endValue) {
  const now = new Date();
  const start = startValue ? new Date(startValue) : null;
  const end = endValue ? new Date(endValue) : null;
  if (!start || Number.isNaN(start.getTime())) return { elapsed: 0, total: 0 };
  const elapsed = Math.max(1, Math.ceil((now - start) / 86400000));
  if (!end || Number.isNaN(end.getTime()) || end <= start) return { elapsed, total: elapsed };
  const total = Math.max(1, Math.ceil((end - start) / 86400000));
  return { elapsed, total };
}

/**
 * Campaign Button Handlers (Event Delegation)
 */
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;

  if (btn.closest('.campaign-card-footer')) {
    const card = btn.closest('.campaign-card');
    const campaignId = card?.dataset.campaignId || '';
    const action = btn.dataset.action || '';

    if (action === 'view') {
      openCampaignActionModal(campaignId, 'view');
      return;
    }

    if (action === 'edit') {
      openCampaignActionModal(campaignId, 'edit');
      return;
    }

    if (action === 'analytics') {
      openCampaignActionModal(campaignId, 'analytics');
      return;
    }
  }

  if (btn.closest('.page-actions') && btn.textContent.includes('Campaign Reports')) {
    showToast('Generating campaign reports...');
    return;
  }

  if (btn.closest('.load-more-container') && btn.textContent.includes('Load More')) {
    if (campaignApiState.lastCampaigns.length >= (campaignApiState.total || campaignApiState.lastCampaigns.length)) {
      showToast('All campaigns loaded');
      return;
    }
    campaignApiState.limit += 6;
    showToast('Loading more campaigns...');
    await loadCampaigns();
  }
});
