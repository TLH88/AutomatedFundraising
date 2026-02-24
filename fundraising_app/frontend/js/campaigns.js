/**
 * Funds 4 Furry Friends - Campaigns JavaScript
 */

const campaignApiState = {
  limit: 6,
  total: 0,
  lastCampaigns: [],
};

document.addEventListener('DOMContentLoaded', () => {
  console.log('Campaigns Page Initialized');

  initCampaignFilters();
  applyCampaignFiltersFromUrl();
  initCampaignForm();
  loadCampaigns();
});

async function apiJson(url, options) {
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

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
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
  } catch (error) {
    console.error('Error loading campaigns:', error);
    showToast('Unable to load campaigns from API');
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
  console.log('Viewing campaign:', campaignId);
  showToast(`Campaign ${campaignId} details coming soon`);
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
      viewCampaign(campaignId);
      return;
    }

    if (action === 'edit') {
      showToast('Edit campaign feature coming soon');
      return;
    }

    if (action === 'analytics') {
      showToast('Opening campaign analytics...');
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
