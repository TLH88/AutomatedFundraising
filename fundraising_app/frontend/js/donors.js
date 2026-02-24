/**
 * Funds 4 Furry Friends - Donors Page JavaScript
 * Donor filtering, search, and interaction management
 */

const donorApiState = {
  limit: 6,
  total: null,
  lastLoadedCount: 0,
};

const donorProfileState = {
  donor: null,
};

document.addEventListener('DOMContentLoaded', () => {
  console.log('Donors Page Initialized');

  initDonorSearch();
  initDonorFilters();
  initDonorCards();
  initLoadMore();
  initDonorModals();

  loadDonorStats();
  loadDonorsFromApi();
});

async function apiJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

async function loadDonorStats() {
  try {
    const data = await apiJson('/api/donors/stats');
    const stats = {
      'Total Donors': data.total_donors,
      'Recurring Donors': data.recurring_donors,
      'Major Donors ($1k+)': data.major_donors,
      'Avg. Donation': data.average_donation,
    };

    document.querySelectorAll('.stat-card').forEach((card) => {
      const label = card.querySelector('.stat-card-label')?.textContent?.trim();
      const valueEl = card.querySelector('.stat-card-value');
      if (!label || !valueEl || !(label in stats)) return;

      const value = stats[label];
      valueEl.textContent = label === 'Avg. Donation'
        ? formatCurrency(value || 0, { decimals: 0 })
        : formatNumber(value || 0);
    });
  } catch (error) {
    console.warn('Failed to load donor stats:', error);
  }
}

async function loadDonorsFromApi() {
  const grid = document.getElementById('donorsGrid');
  if (!grid) return;

  try {
    const data = await apiJson(`/api/donors?limit=${donorApiState.limit}`);
    const donors = Array.isArray(data.donors) ? data.donors : [];
    donorApiState.total = typeof data.total === 'number' ? data.total : donors.length;
    donorApiState.lastLoadedCount = donors.length;

    grid.innerHTML = donors.map(renderDonorCard).join('');
    initDonorCards();
    filterDonors({});
    syncLoadMoreButton();
  } catch (error) {
    console.error('Error loading donors:', error);
    showToast('Unable to load donors from API');
  }
}

function syncLoadMoreButton() {
  const btn = document.getElementById('loadMore');
  if (!btn) return;
  const total = donorApiState.total ?? donorApiState.lastLoadedCount;
  const allLoaded = donorApiState.lastLoadedCount >= total;
  btn.disabled = allLoaded;
  btn.textContent = allLoaded ? 'All Donors Loaded' : 'Load More Donors';
}

function renderDonorCard(donor) {
  const name = donor.name || 'Unknown Donor';
  const email = donor.email || 'No email';
  const tier = String(donor.tier || 'friend').toLowerCase();
  const totalDonated = Number(donor.total_donated || 0);
  const lastDonation = donor.last_donation_date || donor.lastDonationDate || '';
  const tags = Array.isArray(donor.tags) ? donor.tags.slice(0, 3) : [];
  const donationType = donor.donation_type ? String(donor.donation_type) : '';
  if (donationType && !tags.some((t) => String(t).toLowerCase() === donationType.toLowerCase())) {
    tags.unshift(donationType);
  }

  return `
    <div class="donor-card"
      data-tier="${escapeHtml(tier)}"
      data-donor-id="${escapeHtml(donor.id || '')}"
      data-donor-name="${escapeHtml(name)}"
      data-donor-email="${escapeHtml(email)}"
      data-donor-total="${escapeHtml(String(totalDonated))}"
      data-donor-last-donation="${escapeHtml(String(lastDonation || ''))}"
      data-donor-donation-type="${escapeHtml(String(donor.donation_type || ''))}"
      data-donor-phone="${escapeHtml(String(donor.phone || ''))}">
      <div class="donor-card-header">
        <div class="donor-avatar" style="background: ${avatarGradientForTier(tier)};">
          ${renderInitialsAvatar(name)}
        </div>
        <div class="donor-tier-badge ${escapeHtml(tier)}">
          <span>${tierIcon(tier)}</span>
          ${escapeHtml(capitalize(tier))}
        </div>
      </div>
      <div class="donor-card-body">
        <h3 class="donor-name">${escapeHtml(name)}</h3>
        <p class="donor-email">${escapeHtml(email)}</p>
        <div class="donor-stats">
          <div class="donor-stat">
            <span class="donor-stat-label">Total Given</span>
            <span class="donor-stat-value numeric">${formatCurrency(totalDonated, { decimals: 0 })}</span>
          </div>
          <div class="donor-stat">
            <span class="donor-stat-label">Last Donation</span>
            <span class="donor-stat-value">${escapeHtml(formatRelativeDate(lastDonation))}</span>
          </div>
        </div>
        <div class="donor-tags">
          ${tags.slice(0, 2).map((tag) => `<span class="badge badge-info">${escapeHtml(String(tag))}</span>`).join('')}
        </div>
      </div>
      <div class="donor-card-footer">
        <button class="btn btn-secondary btn-pill">Contact Donor</button>
        <button class="btn btn-primary btn-pill">View Profile</button>
      </div>
    </div>
  `;
}

function renderInitialsAvatar(name) {
  const initials = String(name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('') || 'NA';

  return `<span aria-hidden="true">${escapeHtml(initials)}</span>`;
}

function tierIcon(tier) {
  switch (tier) {
    case 'hero': return 'Star';
    case 'champion': return 'Cup';
    case 'supporter': return 'Gem';
    default: return 'Heart';
  }
}

function avatarGradientForTier(tier) {
  switch (tier) {
    case 'hero': return 'linear-gradient(135deg, #10B981, #059669)';
    case 'champion': return 'linear-gradient(135deg, #3B82F6, #2563EB)';
    case 'supporter': return 'linear-gradient(135deg, #EC4899, #DB2777)';
    default: return 'linear-gradient(135deg, #8B5CF6, #7C3AED)';
  }
}

/**
 * Initialize Donor Search
 */
function initDonorSearch() {
  const searchInput = document.getElementById('donorSearch');

  if (searchInput) {
    searchInput.addEventListener('input', debounce((e) => {
      const query = e.target.value.toLowerCase();
      filterDonors({ search: query });
    }, 300));
  }
}

/**
 * Initialize Donor Filters
 */
function initDonorFilters() {
  const tierFilter = document.getElementById('tierFilter');
  const typeFilter = document.getElementById('typeFilter');
  const sortFilter = document.getElementById('sortFilter');
  const resetButton = document.getElementById('resetFilters');

  if (tierFilter) {
    tierFilter.addEventListener('change', () => {
      filterDonors({ tier: tierFilter.value });
    });
  }

  if (typeFilter) {
    typeFilter.addEventListener('change', () => {
      filterDonors({ type: typeFilter.value });
    });
  }

  if (sortFilter) {
    sortFilter.addEventListener('change', () => {
      sortDonors(sortFilter.value);
    });
  }

  if (resetButton) {
    resetButton.addEventListener('click', () => {
      resetFilters();
    });
  }
}

/**
 * Filter Donors
 */
function filterDonors(filters) {
  const donorCards = document.querySelectorAll('.donor-card');
  const donorSearchInput = document.getElementById('donorSearch');
  const tierFilterEl = document.getElementById('tierFilter');
  const typeFilterEl = document.getElementById('typeFilter');
  const searchQuery = filters.search ?? (donorSearchInput ? donorSearchInput.value.toLowerCase() : '');
  const tierFilter = filters.tier ?? (tierFilterEl ? tierFilterEl.value : 'all');
  const typeFilter = filters.type ?? (typeFilterEl ? typeFilterEl.value : 'all');

  let visibleCount = 0;

  donorCards.forEach((card) => {
    let shouldShow = true;

    if (searchQuery) {
      const name = card.querySelector('.donor-name')?.textContent?.toLowerCase() || '';
      const email = card.querySelector('.donor-email')?.textContent?.toLowerCase() || '';
      if (!name.includes(searchQuery) && !email.includes(searchQuery)) {
        shouldShow = false;
      }
    }

    if (tierFilter !== 'all') {
      const cardTier = card.getAttribute('data-tier');
      if (cardTier !== tierFilter) {
        shouldShow = false;
      }
    }

    if (typeFilter !== 'all') {
      const badges = Array.from(card.querySelectorAll('.badge')).map((b) => b.textContent.toLowerCase());
      let hasType = false;

      if (typeFilter === 'recurring' && badges.some((b) => b.includes('monthly') || b.includes('quarterly') || b.includes('annual'))) {
        hasType = true;
      } else if (typeFilter === 'one-time' && badges.some((b) => b.includes('one-time'))) {
        hasType = true;
      } else if (typeFilter === 'major') {
        const tierBadge = card.querySelector('.donor-tier-badge');
        if (tierBadge && (tierBadge.classList.contains('hero') || tierBadge.classList.contains('champion'))) {
          hasType = true;
        }
      }

      if (!hasType) {
        shouldShow = false;
      }
    }

    if (shouldShow) {
      card.style.display = '';
      visibleCount++;
    } else {
      card.style.display = 'none';
    }
  });

  updateDonorCount(visibleCount, donorApiState.total ?? donorCards.length);
}

/**
 * Sort Donors
 */
function sortDonors(sortBy) {
  const grid = document.getElementById('donorsGrid');
  if (!grid) return;
  const cards = Array.from(grid.querySelectorAll('.donor-card'));

  cards.sort((a, b) => {
    switch (sortBy) {
      case 'name-asc': {
        const nameA = a.querySelector('.donor-name')?.textContent || '';
        const nameB = b.querySelector('.donor-name')?.textContent || '';
        return nameA.localeCompare(nameB);
      }

      case 'amount-desc': {
        const amountA = parseFloat((a.querySelector('.donor-stat-value.numeric')?.textContent || '0').replace(/[$,]/g, ''));
        const amountB = parseFloat((b.querySelector('.donor-stat-value.numeric')?.textContent || '0').replace(/[$,]/g, ''));
        return amountB - amountA;
      }

      case 'amount-asc': {
        const amountA2 = parseFloat((a.querySelector('.donor-stat-value.numeric')?.textContent || '0').replace(/[$,]/g, ''));
        const amountB2 = parseFloat((b.querySelector('.donor-stat-value.numeric')?.textContent || '0').replace(/[$,]/g, ''));
        return amountA2 - amountB2;
      }

      case 'recent':
      default:
        return 0;
    }
  });

  cards.forEach((card) => grid.appendChild(card));
}

/**
 * Reset All Filters
 */
function resetFilters() {
  const donorSearch = document.getElementById('donorSearch');
  const tierFilter = document.getElementById('tierFilter');
  const typeFilter = document.getElementById('typeFilter');
  const sortFilter = document.getElementById('sortFilter');
  if (donorSearch) donorSearch.value = '';
  if (tierFilter) tierFilter.value = 'all';
  if (typeFilter) typeFilter.value = 'all';
  if (sortFilter) sortFilter.value = 'recent';

  filterDonors({});
}

/**
 * Update Donor Count
 */
function updateDonorCount(visible, total) {
  const countElement = document.querySelector('.load-more-container .text-caption');
  if (countElement) {
    countElement.textContent = `Showing ${visible} of ${total} donors`;
  }
}

/**
 * Initialize Donor Card Interactions
 */
function initDonorCards() {
  document.querySelectorAll('.donor-card-footer .btn-secondary').forEach((btn) => {
    if (btn.dataset.bound === 'true') return;
    btn.dataset.bound = 'true';
    btn.addEventListener('click', (e) => {
      const card = e.target.closest('.donor-card');
      const donorName = card?.querySelector('.donor-name')?.textContent || 'Donor';
      const donorEmail = card?.querySelector('.donor-email')?.textContent || '';
      handleContactDonor(donorName, donorEmail);
    });
  });

  document.querySelectorAll('.donor-card-footer .btn-primary').forEach((btn) => {
    if (btn.dataset.bound === 'true') return;
    btn.dataset.bound = 'true';
    btn.addEventListener('click', (e) => {
      const card = e.target.closest('.donor-card');
      handleViewProfile(card);
    });
  });
}

/**
 * Handle Contact Donor - Opens the Contact modal
 */
function handleContactDonor(name, email) {
  console.log(`Contacting donor: ${name} (${email})`);

  const contactModal = document.getElementById('contactDonorModal');
  if (contactModal) {
    const modalTitle = contactModal.querySelector('.modal-title');
    const emailValue = document.getElementById('contactEmailValue');
    const emailLink = document.getElementById('contactEmail');
    const phoneValue = document.getElementById('contactPhone');
    const phoneLink = document.getElementById('contactCall');

    if (modalTitle) modalTitle.textContent = `Contact ${name}`;
    if (emailValue) emailValue.textContent = email || 'No email on file';
    if (emailLink) emailLink.href = email ? `mailto:${email}` : '#';
    if (phoneValue) phoneValue.textContent = '(555) 123-4567';
    if (phoneLink) phoneLink.href = 'tel:+15551234567';

    contactModal.classList.add('active');
  }
}

/**
 * Handle View Profile
 */
async function handleViewProfile(cardOrName) {
  const card = cardOrName && typeof cardOrName === 'object' && cardOrName.classList ? cardOrName : null;
  const donorName = card?.dataset?.donorName || (typeof cardOrName === 'string' ? cardOrName : 'Donor');
  try {
    ensureDonorProfileModal();
    openModal('donorProfileModal');
    renderDonorProfileModal({
      name: donorName,
      loading: true,
      tier: card?.dataset?.tier || 'friend',
      email: card?.dataset?.donorEmail || '',
    });

    const donor = await loadDonorProfile(card);
    donorProfileState.donor = donor;
    renderDonorProfileModal(donor);
  } catch (err) {
    console.error('Failed to open donor profile:', err);
    showToast('Unable to load donor profile');
    closeModal('donorProfileModal');
  }
}

/**
 * Initialize Load More
 */
function initLoadMore() {
  const loadMoreBtn = document.getElementById('loadMore');

  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', async () => {
      await loadMoreDonors();
    });
  }
}

/**
 * Load More Donors
 */
async function loadMoreDonors() {
  const total = donorApiState.total ?? Number.POSITIVE_INFINITY;
  if (donorApiState.lastLoadedCount >= total) {
    showToast('All donors loaded');
    return;
  }

  donorApiState.limit += 6;
  showToast('Loading more donors...');
  await loadDonorsFromApi();
}

/**
 * Add Donor Button Handler
 */
document.addEventListener('click', (e) => {
  if (e.target.closest('.btn-primary') && e.target.textContent.includes('Add Donor')) {
    handleAddDonor();
  }

  if (e.target.closest('.btn-secondary') && e.target.textContent.includes('Export List')) {
    handleExportDonors();
  }
});

/**
 * Handle Add Donor - Opens the Add Donor modal
 */
function handleAddDonor() {
  const modal = document.getElementById('addDonorModal');
  if (modal) {
    modal.classList.add('active');
  }
}

/**
 * Handle Export Donors
 */
function handleExportDonors() {
  console.log('Export donors clicked');
  showToast('Exporting donor list...');

  setTimeout(() => {
    showToast('Export complete! Check your downloads.');
  }, 1500);
}

/**
 * Utility: Debounce
 */
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Utility: Show Toast
 */
function showToast(message, duration = 3000) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    background: var(--accent-green);
    color: white;
    padding: 16px 24px;
    border-radius: 12px;
    box-shadow: var(--shadow-card);
    z-index: 9999;
    animation: slideIn 0.3s ease;
    font-weight: 500;
  `;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'fadeOut 0.3s ease';
    setTimeout(() => {
      if (toast.parentNode) {
        document.body.removeChild(toast);
      }
    }, 300);
  }, duration);
}

/**
 * Initialize Donor Modals
 */
function initDonorModals() {
  ensureDonorProfileModal();

  const addDonorForm = document.getElementById('addDonorForm');
  if (addDonorForm) {
    addDonorForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const raw = Object.fromEntries(formData);
      const payload = {
        full_name: String(raw.fullName || '').trim(),
        email: String(raw.email || '').trim(),
        phone: String(raw.phone || '').trim() || null,
        tier: raw.tier || 'friend',
        initial_donation: Number(raw.initialDonation || 0),
        notes: String(raw.notes || '').trim() || null,
        tags: String(raw.tags || '')
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      };

      try {
        await apiJson('/api/donors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        showToast('Donor added successfully!');
        closeModal('addDonorModal');
        e.target.reset();
        await loadDonorsFromApi();
      } catch (error) {
        console.error('Failed to create donor:', error);
        showToast('Unable to create donor');
      }
    });
  }

  document.querySelectorAll('.modal-backdrop').forEach((backdrop) => {
    backdrop.addEventListener('click', () => {
      const modal = backdrop.closest('.modal');
      if (modal) modal.classList.remove('active');
    });
  });
}

async function loadDonorProfile(card) {
  if (card?.dataset?.donorId) {
    const data = await apiJson(`/api/donors/${encodeURIComponent(card.dataset.donorId)}`);
    if (data && (data.name || data.id)) return data;
    if (data?.donor) return data.donor;
  }
  return donorFromCard(card);
}

function donorFromCard(card) {
  const name = card?.dataset?.donorName || card?.querySelector('.donor-name')?.textContent || 'Donor';
  const email = card?.dataset?.donorEmail || card?.querySelector('.donor-email')?.textContent || '';
  const total = Number(card?.dataset?.donorTotal || 0);
  const tier = String(card?.dataset?.tier || 'friend').toLowerCase();
  const donationType = card?.dataset?.donorDonationType || detectDonationTypeFromCard(card);
  const tags = Array.from(card?.querySelectorAll('.donor-tags .badge') || []).map((el) => el.textContent.trim()).filter(Boolean);
  return {
    id: card?.dataset?.donorId || null,
    name,
    email,
    phone: card?.dataset?.donorPhone || '',
    tier,
    status: 'active',
    total_donated: total,
    last_donation_date: card?.dataset?.donorLastDonation || null,
    donation_type: donationType || null,
    engagement_score: null,
    notes: '',
    tags,
    donation_history: [],
    donation_count: 0,
  };
}

function detectDonationTypeFromCard(card) {
  const tags = Array.from(card?.querySelectorAll('.donor-tags .badge') || []).map((b) => (b.textContent || '').toLowerCase());
  if (tags.some((t) => t.includes('monthly') || t.includes('quarterly') || t.includes('annual'))) return 'monthly';
  if (tags.some((t) => t.includes('one-time'))) return 'one-time';
  return '';
}

function ensureDonorProfileModal() {
  ensureDonorProfileModalStyles();
  if (document.getElementById('donorProfileModal')) return;
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.id = 'donorProfileModal';
  modal.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-content modal-large donor-profile-modal-content">
      <div class="modal-header donor-profile-modal-header">
        <h2 class="modal-title">Donor Profile</h2>
        <button class="modal-close" type="button" aria-label="Close donor profile">×</button>
      </div>
      <div class="modal-body donor-profile-modal-body">
        <section class="donor-profile-shell-modal profile-theme-donor" aria-labelledby="donorProfileHeaderName">
          <div class="donor-profile-hero-card">
            <div class="donor-profile-hero-banner"></div>
            <div class="donor-profile-hero-body">
              <div class="donor-profile-hero-avatar-wrap">
                <div id="donorProfileAvatarPreview" class="donor-profile-avatar-display">
                  <div class="avatar avatar-md avatar-placeholder">DN</div>
                </div>
              </div>
              <div class="donor-profile-hero-copy">
                <p class="donor-profile-hero-meta-label">Donor Profile For:</p>
                <h1 class="donor-profile-hero-name" id="donorProfileHeaderName">Loading donor...</h1>
                <p class="text-muted text-caption" id="donorProfileDonorSinceNote" style="margin:8px 0 0;">Loading donor tenure...</p>
                <div class="donor-profile-hero-subline">
                  <span class="donor-profile-hero-pill" id="donorProfileTierPill">Tier</span>
                  <span class="donor-profile-hero-pill" id="donorProfileTypePill">Donation Type</span>
                  <span id="donorProfileSubtitle">Loading donor details...</span>
                </div>
              </div>
              <div class="donor-profile-hero-actions">
                <button class="btn btn-secondary btn-pill" type="button" id="donorProfileContactBtn">Contact Donor</button>
                <button class="btn btn-secondary btn-pill" type="button" id="donorProfileCloseBtn">Close</button>
              </div>
            </div>
          </div>

          <div class="donor-profile-content-grid">
            <div class="donor-profile-main-col">
              <div class="card">
                <div class="card-header">
                  <h3 class="card-title">Donor Details</h3>
                  <p class="profile-section-subtitle">Primary contact and relationship information</p>
                </div>
                <div class="card-body">
                  <div class="donor-profile-info-grid">
                    <div class="donor-profile-info-item"><span class="donor-profile-label">Email</span><span class="donor-profile-value" id="donorProfileEmail">-</span></div>
                    <div class="donor-profile-info-item"><span class="donor-profile-label">Phone</span><span class="donor-profile-value" id="donorProfilePhone">-</span></div>
                    <div class="donor-profile-info-item"><span class="donor-profile-label">Tier</span><span class="donor-profile-value" id="donorProfileTier">-</span></div>
                    <div class="donor-profile-info-item"><span class="donor-profile-label">Status</span><span class="donor-profile-value" id="donorProfileStatus">-</span></div>
                    <div class="donor-profile-info-item"><span class="donor-profile-label">First Donation</span><span class="donor-profile-value" id="donorProfileFirstDonation">-</span></div>
                    <div class="donor-profile-info-item"><span class="donor-profile-label">Last Donation</span><span class="donor-profile-value" id="donorProfileLastDonation">-</span></div>
                  </div>
                  <div class="donor-profile-tag-wrap">
                    <p class="donor-profile-label">Tags</p>
                    <div id="donorProfileTags" class="donor-profile-tag-list"></div>
                  </div>
                  <div class="donor-profile-note-block">
                    <p class="donor-profile-label">Notes</p>
                    <p class="text-muted text-caption" id="donorProfileNotes">No notes available.</p>
                  </div>
                </div>
              </div>

              <div class="card" id="donorProfileHistoryCard">
                <div class="card-header">
                  <h3 class="card-title">Donation History</h3>
                  <p class="profile-section-subtitle">Recent donations and campaign support</p>
                </div>
                <div class="card-body">
                  <div class="table-container donor-profile-history-table">
                    <table class="table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Campaign</th>
                          <th>Amount</th>
                        </tr>
                      </thead>
                      <tbody id="donorProfileHistoryRows">
                        <tr><td colspan="3" class="text-muted">Loading...</td></tr>
                      </tbody>
                    </table>
                  </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelector('.modal-backdrop')?.addEventListener('click', () => closeModal('donorProfileModal'));
  modal.querySelector('.modal-close')?.addEventListener('click', () => closeModal('donorProfileModal'));
  modal.querySelector('#donorProfileCloseBtn')?.addEventListener('click', () => closeModal('donorProfileModal'));
  modal.querySelector('#donorProfileContactBtn')?.addEventListener('click', () => {
    const donor = donorProfileState.donor;
    if (!donor) return;
    closeModal('donorProfileModal');
    handleContactDonor(donor.name || 'Donor', donor.email || '');
  });
}

function ensureDonorProfileModalStyles() {
  if (document.getElementById('donorProfileModalStyles')) return;
  const style = document.createElement('style');
  style.id = 'donorProfileModalStyles';
  style.textContent = `
    .donor-profile-modal-content { width: min(1120px, calc(100vw - 24px)); max-height: min(92vh, 980px); }
    .donor-profile-modal-header { border-bottom: 1px solid var(--border-color); }
    .donor-profile-modal-body { padding: 0; }
    .donor-profile-shell-modal { --profile-accent-rgb: 5, 150, 105; --profile-accent: #059669; display: grid; gap: var(--spacing-xl); }
    .donor-profile-shell-modal.profile-theme-donor { --profile-accent-rgb: 5, 150, 105; --profile-accent: #059669; }
    .donor-profile-hero-card { position: relative; overflow: visible; border-bottom: 1px solid var(--border-color); background:
      radial-gradient(circle at 18% 0%, rgba(var(--profile-accent-rgb),.24), transparent 56%),
      radial-gradient(circle at 82% 18%, rgba(59,130,246,.14), transparent 48%),
      var(--surface-card); }
    .donor-profile-hero-banner { height: 118px; background:
      linear-gradient(135deg, rgba(var(--profile-accent-rgb),.30), rgba(59,130,246,.14)),
      linear-gradient(90deg, rgba(255,255,255,.03), rgba(255,255,255,0)); border-bottom: 1px solid var(--border-color); }
    .donor-profile-hero-body { position: relative; padding: 0 var(--spacing-xl) var(--spacing-xl) calc(var(--spacing-xl) + 158px); min-height: 142px;
      display:flex; align-items:center; justify-content:space-between; gap: var(--spacing-lg); }
    .donor-profile-hero-avatar-wrap { position:absolute; left: var(--spacing-xl); top: -52px; width: 138px; }
    .donor-profile-avatar-display { width: 138px; height: 138px; border-radius: 50%; border: 4px solid var(--surface-card); background: var(--surface-card);
      box-shadow: var(--shadow-card); display:flex; align-items:center; justify-content:center; overflow:hidden; }
    .donor-profile-avatar-display img { width:100%; height:100%; object-fit:cover; display:block; }
    .donor-profile-avatar-display .avatar-placeholder { width:100%; height:100%; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size: 2rem; }
    .donor-profile-hero-meta-label { margin:0 0 6px; font-size:.85rem; letter-spacing:.06em; text-transform:uppercase; color: var(--text-muted); font-weight:700; }
    .donor-profile-hero-name { margin:0; font-size: clamp(1.45rem, 2vw, 2rem); line-height:1.1; }
    .donor-profile-hero-subline { margin: 10px 0 0; display:flex; gap:10px; align-items:center; flex-wrap:wrap; color: var(--text-secondary); }
    .donor-profile-hero-pill { display:inline-flex; align-items:center; padding:6px 10px; border-radius:999px; border:1px solid var(--border-color);
      border-color: rgba(var(--profile-accent-rgb), .55); background: rgba(var(--profile-accent-rgb), .18); font-size:.8rem; font-weight:600; color: var(--text-primary); }
    .donor-profile-hero-actions { display:flex; gap:10px; align-items:center; flex-wrap:wrap; justify-content:flex-end; }
    .donor-profile-content-grid { display:grid; grid-template-columns: 1fr; gap: var(--spacing-xl); padding: 0 var(--spacing-xl) var(--spacing-xl); }
    .donor-profile-main-col { display:grid; gap: var(--spacing-xl); align-content:start; }
    .profile-section-subtitle { margin:0; color: var(--text-muted); font-size:.85rem; }
    .donor-profile-info-grid { display:grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 12px 16px; }
    .donor-profile-info-item { display:grid; gap:4px; padding: 10px 12px; border:1px solid var(--border-color); border-radius: 12px; background: var(--surface-elevated, rgba(255,255,255,.02)); }
    .donor-profile-label { margin:0; color: var(--text-muted); font-size:.75rem; text-transform:uppercase; letter-spacing:.05em; font-weight:700; }
    .donor-profile-value { color: var(--text-primary); font-weight:600; word-break: break-word; }
    .donor-profile-tag-wrap { margin-top: 14px; display:grid; gap: 8px; }
    .donor-profile-tag-list { display:flex; flex-wrap:wrap; gap:8px; }
    .donor-profile-note-block { margin-top: 14px; display:grid; gap: 8px; }
    .donor-profile-history-table .table td.text-muted { text-align:center; }
    @media (max-width: 980px) {
      .donor-profile-modal-content { width: calc(100vw - 16px); }
      .donor-profile-hero-body { padding: 80px var(--spacing-lg) var(--spacing-lg); flex-direction:column; align-items:flex-start; }
      .donor-profile-hero-avatar-wrap { left: var(--spacing-lg); width: 116px; top: -44px; }
      .donor-profile-avatar-display { width:116px; height:116px; }
      .donor-profile-hero-actions { justify-content:flex-start; }
    }
    @media (max-width: 640px) {
      .donor-profile-info-grid { grid-template-columns: 1fr; }
    }
  `;
  document.head.appendChild(style);
}

function renderDonorProfileModal(donor) {
  const d = donor || {};
  const tier = String(d.tier || 'friend').toLowerCase();
  const donationType = normalizeDonationType(d.donation_type);
  const name = d.name || 'Donor';
  const email = d.email || 'No email on file';
  const phone = d.phone || 'No phone on file';
  const tags = Array.isArray(d.tags) ? d.tags.filter(Boolean) : [];
  const history = Array.isArray(d.donation_history) ? d.donation_history : [];
  const canViewDonationHistory = canCurrentUserViewDonorHistory();
  const total = Number(d.total_donated || 0);
  const donorSinceNote = formatDonorTenureNote(d.first_donation_date);
  const firstDonation = d.first_donation_date ? formatRelativeDate(d.first_donation_date) : '-';
  const lastDonation = d.last_donation_date ? formatRelativeDate(d.last_donation_date) : 'No donations yet';

  setText('donorProfileHeaderName', name);
  setText('donorProfileTierPill', capitalize(tier));
  setText('donorProfileTypePill', donationType || 'Unspecified');
  setText('donorProfileSubtitle', email);
  setText('donorProfileDonorSinceNote', donorSinceNote);
  setText('donorProfileEmail', email);
  setText('donorProfilePhone', phone);
  setText('donorProfileTier', capitalize(tier));
  setText('donorProfileStatus', capitalize(d.status || 'active'));
  setText('donorProfileFirstDonation', firstDonation);
  setText('donorProfileLastDonation', lastDonation);
  setText('donorProfileNotes', d.loading ? 'Loading donor details...' : (d.notes || 'No notes available.'));
  const avatar = document.getElementById('donorProfileAvatarPreview');
  if (avatar) {
    avatar.style.background = avatarGradientForTier(tier);
    avatar.innerHTML = d.avatar_url
      ? `<img src="${escapeHtml(d.avatar_url)}" alt="${escapeHtml(name)}">`
      : `<div class="avatar avatar-md avatar-placeholder">${escapeHtml(initials(name))}</div>`;
  }

  const tagsEl = document.getElementById('donorProfileTags');
  if (tagsEl) {
    const mergedTags = [...tags];
    if (donationType && !mergedTags.some((t) => String(t).toLowerCase() === donationType.toLowerCase())) {
      mergedTags.unshift(donationType);
    }
    tagsEl.innerHTML = mergedTags.length
      ? mergedTags.slice(0, 8).map((tag) => `<span class="badge badge-info">${escapeHtml(String(tag))}</span>`).join('')
      : '<span class="text-muted text-caption">No tags assigned.</span>';
  }

  const rowsEl = document.getElementById('donorProfileHistoryRows');
  const historyCard = document.getElementById('donorProfileHistoryCard');
  if (historyCard) historyCard.style.display = canViewDonationHistory ? '' : 'none';
  if (rowsEl) {
    if (!canViewDonationHistory) {
      rowsEl.innerHTML = '<tr><td colspan="3" class="text-muted">Donation history is restricted for visitor accounts.</td></tr>';
    } else if (d.loading) {
      rowsEl.innerHTML = '<tr><td colspan="3" class="text-muted">Loading...</td></tr>';
    } else if (!history.length) {
      rowsEl.innerHTML = '<tr><td colspan="3" class="text-muted">No donation history available.</td></tr>';
    } else {
      rowsEl.innerHTML = history.slice(0, 12).map((item) => `
        <tr>
          <td>${escapeHtml(formatRelativeDate(item.date || item.donation_date || ''))}</td>
          <td>${escapeHtml(item.campaign || item.campaign_name || 'General Fund')}</td>
          <td class="numeric">${escapeHtml(formatCurrency(item.amount || 0))}</td>
        </tr>
      `).join('');
    }
  }

  const contactBtn = document.getElementById('donorProfileContactBtn');
  if (contactBtn) contactBtn.disabled = !d.email;
}

function canCurrentUserViewDonorHistory() {
  const session = window.FundsApp?.getSession?.() || { role: 'visitor', loggedIn: false };
  const role = window.FundsApp?.normalizeRole?.(session.role) || 'visitor';
  return !!session.loggedIn && role !== 'visitor';
}

function normalizeDonationType(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.toLowerCase() === 'one-time') return 'One-time';
  return capitalize(text);
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = String(value ?? '');
}

function initials(name) {
  return String(name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('') || 'DN';
}

function formatDonorTenureNote(firstDonationDate) {
  if (!firstDonationDate) return 'Donor tenure will appear after the first recorded donation.';
  const start = new Date(firstDonationDate);
  if (Number.isNaN(start.getTime())) return 'Donor since recorded date on file.';

  const now = new Date();
  let years = now.getFullYear() - start.getFullYear();
  let months = now.getMonth() - start.getMonth();
  if (now.getDate() < start.getDate()) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  if (years < 0) years = 0;

  const parts = [];
  if (years > 0) parts.push(`${years} year${years === 1 ? '' : 's'}`);
  if (months > 0) parts.push(`${months} month${months === 1 ? '' : 's'}`);
  const duration = parts.length ? parts.join(', ') : 'less than a month';
  return `Donor for ${duration} (since ${formatDateLabel(firstDonationDate)}).`;
}

function formatDateLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || '');
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Modal Controls
 */
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add('active');
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('active');
}

function formatCurrency(value, { decimals = 2 } = {}) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  }).format(Number(value || 0));
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(Number(value || 0));
}

function formatRelativeDate(value) {
  if (!value) return 'No donations yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) === 1 ? '' : 's'} ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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

// Export for use in other modules
window.DonorsPage = {
  filterDonors,
  sortDonors,
  resetFilters,
  handleContactDonor,
  handleViewProfile,
};
