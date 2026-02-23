/**
 * Funds 4 Furry Friends - Donors Page JavaScript
 * Donor filtering, search, and interaction management
 */

document.addEventListener('DOMContentLoaded', () => {
  console.log('🐾 Donors Page Initialized');

  initDonorSearch();
  initDonorFilters();
  initDonorCards();
  initLoadMore();
  initDonorModals();
});

/**
 * Initialize Donor Search
 */
function initDonorSearch() {
  const searchInput = document.getElementById('donorSearch');

  if (searchInput) {
    searchInput.addEventListener('input', debounce((e) => {
      const query = e.target.value.toLowerCase();
      filterDonors({search: query});
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
      filterDonors({tier: tierFilter.value});
    });
  }

  if (typeFilter) {
    typeFilter.addEventListener('change', () => {
      filterDonors({type: typeFilter.value});
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
  const searchQuery = filters.search || document.getElementById('donorSearch').value.toLowerCase();
  const tierFilter = filters.tier || document.getElementById('tierFilter').value;
  const typeFilter = filters.type || document.getElementById('typeFilter').value;

  let visibleCount = 0;

  donorCards.forEach((card) => {
    let shouldShow = true;

    // Search filter
    if (searchQuery) {
      const name = card.querySelector('.donor-name').textContent.toLowerCase();
      const email = card.querySelector('.donor-email').textContent.toLowerCase();
      if (!name.includes(searchQuery) && !email.includes(searchQuery)) {
        shouldShow = false;
      }
    }

    // Tier filter
    if (tierFilter !== 'all') {
      const cardTier = card.getAttribute('data-tier');
      if (cardTier !== tierFilter) {
        shouldShow = false;
      }
    }

    // Type filter (based on badges)
    if (typeFilter !== 'all') {
      const badges = Array.from(card.querySelectorAll('.badge')).map(b => b.textContent.toLowerCase());
      let hasType = false;

      if (typeFilter === 'recurring' && badges.some(b => b.includes('monthly') || b.includes('quarterly'))) {
        hasType = true;
      } else if (typeFilter === 'one-time' && badges.some(b => b.includes('one-time'))) {
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

    // Show/hide card
    if (shouldShow) {
      card.style.display = '';
      visibleCount++;
    } else {
      card.style.display = 'none';
    }
  });

  // Update count
  updateDonorCount(visibleCount, donorCards.length);
}

/**
 * Sort Donors
 */
function sortDonors(sortBy) {
  const grid = document.getElementById('donorsGrid');
  const cards = Array.from(grid.querySelectorAll('.donor-card'));

  cards.sort((a, b) => {
    switch (sortBy) {
      case 'name-asc':
        const nameA = a.querySelector('.donor-name').textContent;
        const nameB = b.querySelector('.donor-name').textContent;
        return nameA.localeCompare(nameB);

      case 'amount-desc':
        const amountA = parseFloat(a.querySelector('.donor-stat-value.numeric').textContent.replace(/[$,]/g, ''));
        const amountB = parseFloat(b.querySelector('.donor-stat-value.numeric').textContent.replace(/[$,]/g, ''));
        return amountB - amountA;

      case 'amount-asc':
        const amountA2 = parseFloat(a.querySelector('.donor-stat-value.numeric').textContent.replace(/[$,]/g, ''));
        const amountB2 = parseFloat(b.querySelector('.donor-stat-value.numeric').textContent.replace(/[$,]/g, ''));
        return amountA2 - amountB2;

      case 'recent':
      default:
        // Keep original order (most recent first)
        return 0;
    }
  });

  // Re-append sorted cards
  cards.forEach(card => grid.appendChild(card));
}

/**
 * Reset All Filters
 */
function resetFilters() {
  document.getElementById('donorSearch').value = '';
  document.getElementById('tierFilter').value = 'all';
  document.getElementById('typeFilter').value = 'all';
  document.getElementById('sortFilter').value = 'recent';

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
  // Contact buttons
  document.querySelectorAll('.donor-card-footer .btn-secondary').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const card = e.target.closest('.donor-card');
      const donorName = card.querySelector('.donor-name').textContent;
      const donorEmail = card.querySelector('.donor-email').textContent;
      handleContactDonor(donorName, donorEmail);
    });
  });

  // View Profile buttons
  document.querySelectorAll('.donor-card-footer .btn-primary').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const card = e.target.closest('.donor-card');
      const donorName = card.querySelector('.donor-name').textContent;
      handleViewProfile(donorName);
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
    if (emailValue) emailValue.textContent = email;
    if (emailLink) emailLink.href = `mailto:${email}`;
    if (phoneValue) phoneValue.textContent = '(555) 123-4567';
    if (phoneLink) phoneLink.href = 'tel:+15551234567';

    contactModal.classList.add('active');
  }
}

/**
 * Handle View Profile
 */
function handleViewProfile(name) {
  console.log(`Viewing profile for: ${name}`);
  showToast(`Opening profile for ${name}...`);

  // TODO: Implement donor profile modal or navigate to profile page
  // For now, just show a toast notification
  setTimeout(() => {
    alert(`Donor Profile: ${name}\n\nThis would open a detailed profile view with:\n• Full donation history\n• Engagement timeline\n• Communication log\n• Notes and tags\n• Thank you message history`);
  }, 500);
}

/**
 * Initialize Load More
 */
function initLoadMore() {
  const loadMoreBtn = document.getElementById('loadMore');

  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', () => {
      loadMoreDonors();
    });
  }
}

/**
 * Load More Donors
 */
function loadMoreDonors() {
  console.log('Loading more donors...');
  showToast('Loading more donors...');

  // TODO: Fetch more donors from API
  // For now, just show a message
  setTimeout(() => {
    showToast('All donors loaded!');
  }, 1000);
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

  // TODO: Generate and download CSV/Excel export
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
      document.body.removeChild(toast);
    }, 300);
  }, duration);
}

/**
 * Initialize Donor Modals
 */
function initDonorModals() {
  // Add Donor form submission
  const addDonorForm = document.getElementById('addDonorForm');
  if (addDonorForm) {
    addDonorForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const donor = Object.fromEntries(formData);
      console.log('Adding donor:', donor);
      showToast('Donor added successfully!');
      closeModal('addDonorModal');
      e.target.reset();
    });
  }

  // Close modals on backdrop click
  document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
    backdrop.addEventListener('click', () => {
      backdrop.closest('.modal').classList.remove('active');
    });
  });
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

// Export for use in other modules
window.DonorsPage = {
  filterDonors,
  sortDonors,
  resetFilters,
  handleContactDonor,
  handleViewProfile,
};
