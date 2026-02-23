/**
 * Funds 4 Furry Friends - Animals JavaScript
 */

document.addEventListener('DOMContentLoaded', () => {
  console.log('🐾 Animals Page Initialized');

  initAnimalFilters();
  initAnimalForm();
  initAnimalButtons();
});

/**
 * Initialize Animal Filters
 */
function initAnimalFilters() {
  const searchInput = document.getElementById('animalSearch');
  const statusFilter = document.getElementById('statusFilter');
  const speciesFilter = document.getElementById('speciesFilter');
  const ageFilter = document.getElementById('ageFilter');
  const sortBy = document.getElementById('sortBy');

  if (searchInput) {
    searchInput.addEventListener('input', filterAnimals);
  }

  if (statusFilter) {
    statusFilter.addEventListener('change', filterAnimals);
  }

  if (speciesFilter) {
    speciesFilter.addEventListener('change', filterAnimals);
  }

  if (ageFilter) {
    ageFilter.addEventListener('change', filterAnimals);
  }

  if (sortBy) {
    sortBy.addEventListener('change', sortAnimals);
  }
}

/**
 * Filter Animals
 */
function filterAnimals() {
  const searchValue = document.getElementById('animalSearch')?.value.toLowerCase() || '';
  const statusValue = document.getElementById('statusFilter')?.value || 'all';
  const speciesValue = document.getElementById('speciesFilter')?.value || 'all';
  const ageValue = document.getElementById('ageFilter')?.value || 'all';

  const animalCards = document.querySelectorAll('.animal-card');

  animalCards.forEach(card => {
    const name = card.querySelector('.animal-name')?.textContent.toLowerCase() || '';
    const description = card.querySelector('.animal-description')?.textContent.toLowerCase() || '';
    const status = card.querySelector('.animal-status-badge')?.textContent.toLowerCase() || '';
    const species = card.querySelector('.animal-species')?.textContent.toLowerCase() || '';
    const breed = card.querySelector('.detail-value')?.textContent.toLowerCase() || '';

    const matchesSearch = name.includes(searchValue) || description.includes(searchValue) || breed.includes(searchValue);
    const matchesStatus = statusValue === 'all' || status.includes(statusValue.toLowerCase().replace('-', ' '));
    const matchesSpecies = speciesValue === 'all' || species.includes(speciesValue);

    // Age matching logic (simplified)
    let matchesAge = ageValue === 'all';
    if (!matchesAge) {
      const ageText = Array.from(card.querySelectorAll('.detail-value'))[1]?.textContent.toLowerCase() || '';
      if (ageValue === 'puppy' && (ageText.includes('month') || parseInt(ageText) <= 1)) {
        matchesAge = true;
      } else if (ageValue === 'young' && (parseInt(ageText) > 1 && parseInt(ageText) <= 3)) {
        matchesAge = true;
      } else if (ageValue === 'adult' && (parseInt(ageText) > 3 && parseInt(ageText) <= 7)) {
        matchesAge = true;
      } else if (ageValue === 'senior' && parseInt(ageText) > 7) {
        matchesAge = true;
      }
    }

    if (matchesSearch && matchesStatus && matchesSpecies && matchesAge) {
      card.style.display = 'flex';
    } else {
      card.style.display = 'none';
    }
  });

  updateResultsCount();
}

/**
 * Sort Animals
 */
function sortAnimals() {
  const sortValue = document.getElementById('sortBy')?.value || 'recent';
  const grid = document.getElementById('animalsGrid');
  const cards = Array.from(grid.querySelectorAll('.animal-card'));

  cards.sort((a, b) => {
    switch (sortValue) {
      case 'name': {
        const nameA = a.querySelector('.animal-name')?.textContent || '';
        const nameB = b.querySelector('.animal-name')?.textContent || '';
        return nameA.localeCompare(nameB);
      }

      case 'age': {
        const ageA = parseInt(a.querySelectorAll('.detail-value')[1]?.textContent) || 0;
        const ageB = parseInt(b.querySelectorAll('.detail-value')[1]?.textContent) || 0;
        return ageA - ageB;
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
  const visibleCards = document.querySelectorAll('.animal-card[style="display: flex;"], .animal-card:not([style*="display"])').length;
  const totalCards = document.querySelectorAll('.animal-card').length;

  const loadMoreContainer = document.querySelector('.load-more-container p');
  if (loadMoreContainer) {
    loadMoreContainer.textContent = `Showing ${visibleCards} of ${totalCards} animals`;
  }
}

/**
 * Initialize Animal Form
 */
function initAnimalForm() {
  const form = document.getElementById('addAnimalForm');

  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      handleAnimalSubmit(e);
    });
  }
}

/**
 * Handle Animal Form Submit
 */
function handleAnimalSubmit(event) {
  const formData = new FormData(event.target);
  const animalData = Object.fromEntries(formData);

  console.log('Adding new animal:', animalData);

  // TODO: Send to API
  // fetch('/api/animals', {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify(animalData)
  // })

  // Show success message
  showToast('Animal profile created successfully!', 'success');
  closeModal('addAnimalModal');
  event.target.reset();
}

/**
 * View Animal Profile
 */
function viewAnimalProfile(animalId) {
  console.log('Viewing animal profile:', animalId);
  // TODO: Navigate to animal profile page
  // window.location.href = `animal-profile.html?id=${animalId}`;
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
 * Initialize Animal Button Handlers
 */
function initAnimalButtons() {
  // View Profile buttons
  document.querySelectorAll('.animal-card-footer .btn-secondary').forEach(btn => {
    btn.addEventListener('click', () => {
      showToast('Opening animal profile...');
    });
  });

  // Edit buttons
  document.querySelectorAll('.animal-card-footer .btn-primary').forEach(btn => {
    btn.addEventListener('click', () => {
      showToast('Edit animal feature coming soon');
    });
  });

  // Export List button
  document.querySelector('.page-actions .btn-secondary')?.addEventListener('click', () => {
    showToast('Exporting animal list...');
  });

  // Load More Animals button
  document.querySelector('.load-more-container .btn')?.addEventListener('click', () => {
    showToast('Loading more animals...');
  });
}
