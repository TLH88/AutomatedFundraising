/**
 * Funds 4 Furry Friends - Campaigns JavaScript
 */

document.addEventListener('DOMContentLoaded', () => {
  console.log('🎯 Campaigns Page Initialized');

  initCampaignFilters();
  initCampaignForm();
  loadCampaigns();
});

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

/**
 * Filter Campaigns
 */
function filterCampaigns() {
  const searchValue = document.getElementById('campaignSearch')?.value.toLowerCase() || '';
  const statusValue = document.getElementById('statusFilter')?.value || 'all';
  const categoryValue = document.getElementById('categoryFilter')?.value || 'all';

  const campaignCards = document.querySelectorAll('.campaign-card');

  campaignCards.forEach(card => {
    const title = card.querySelector('.campaign-title')?.textContent.toLowerCase() || '';
    const description = card.querySelector('.campaign-description')?.textContent.toLowerCase() || '';
    const status = card.querySelector('.campaign-status-badge')?.textContent.toLowerCase() || '';
    const category = card.querySelector('.campaign-category-badge')?.textContent.toLowerCase() || '';

    const matchesSearch = title.includes(searchValue) || description.includes(searchValue);
    const matchesStatus = statusValue === 'all' || status.includes(statusValue.toLowerCase());
    const matchesCategory = categoryValue === 'all' || category.includes(categoryValue.toLowerCase());

    if (matchesSearch && matchesStatus && matchesCategory) {
      card.style.display = 'flex';
    } else {
      card.style.display = 'none';
    }
  });

  updateResultsCount();
}

/**
 * Sort Campaigns
 */
function sortCampaigns() {
  const sortValue = document.getElementById('sortBy')?.value || 'recent';
  const grid = document.getElementById('campaignsGrid');
  const cards = Array.from(grid.querySelectorAll('.campaign-card'));

  cards.sort((a, b) => {
    switch (sortValue) {
      case 'progress': {
        const progressA = parseFloat(a.querySelector('.progress-fill')?.style.width) || 0;
        const progressB = parseFloat(b.querySelector('.progress-fill')?.style.width) || 0;
        return progressB - progressA;
      }

      case 'raised': {
        const raisedA = parseFloat(a.querySelector('.campaign-raised')?.textContent.replace(/[$,]/g, '')) || 0;
        const raisedB = parseFloat(b.querySelector('.campaign-raised')?.textContent.replace(/[$,]/g, '')) || 0;
        return raisedB - raisedA;
      }

      case 'ending': {
        const daysA = parseInt(a.querySelector('.campaign-days')?.textContent) || 999;
        const daysB = parseInt(b.querySelector('.campaign-days')?.textContent) || 999;
        return daysA - daysB;
      }

      default:
        return 0;
    }
  });

  cards.forEach(card => grid.appendChild(card));
}

/**
 * Update Results Count
 */
function updateResultsCount() {
  const visibleCards = document.querySelectorAll('.campaign-card[style="display: flex;"], .campaign-card:not([style*="display"])').length;
  const totalCards = document.querySelectorAll('.campaign-card').length;

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
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      handleCampaignSubmit(e);
    });
  }
}

/**
 * Handle Campaign Form Submit
 */
function handleCampaignSubmit(event) {
  const formData = new FormData(event.target);
  const campaignData = Object.fromEntries(formData);

  console.log('Creating new campaign:', campaignData);

  // TODO: Send to API
  // fetch('/api/campaigns', {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify(campaignData)
  // })

  // Show success message
  showToast('Campaign created successfully!', 'success');
  closeModal('addCampaignModal');
  event.target.reset();
}

/**
 * Load Campaigns from API
 */
function loadCampaigns() {
  // TODO: Fetch from API
  console.log('Loading campaigns...');

  // fetch('/api/campaigns')
  //   .then(response => response.json())
  //   .then(data => renderCampaigns(data))
  //   .catch(error => console.error('Error loading campaigns:', error));
}

/**
 * View Campaign Details
 */
function viewCampaign(campaignId) {
  console.log('Viewing campaign:', campaignId);
  // TODO: Navigate to campaign detail page
  // window.location.href = `campaign-detail.html?id=${campaignId}`;
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
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.textContent = message;
  toast.style.cssText = `position:fixed;bottom:24px;right:24px;background:var(--accent-green);color:white;padding:16px 24px;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.3);z-index:9999;font-weight:500;transition:opacity 0.3s ease;`;
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
}

/**
 * Campaign Button Handlers (Event Delegation)
 */
document.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;

  // Edit buttons on campaign cards
  if (btn.closest('.campaign-card-footer') && btn.textContent.includes('Edit')) {
    showToast('Edit campaign feature coming soon');
  }

  // Analytics buttons on campaign cards
  if (btn.closest('.campaign-card-footer') && btn.textContent.includes('Analytics')) {
    showToast('Opening campaign analytics...');
  }

  // Campaign Reports button in page header
  if (btn.closest('.page-actions') && btn.textContent.includes('Campaign Reports')) {
    showToast('Generating campaign reports...');
  }

  // Load More Campaigns button
  if (btn.closest('.load-more-container') && btn.textContent.includes('Load More')) {
    showToast('Loading more campaigns...');
  }
});
