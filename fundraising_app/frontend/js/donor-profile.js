/**
 * Funds 4 Furry Friends - Donor Profile JavaScript
 */

document.addEventListener('DOMContentLoaded', () => {
  console.log('🐾 Donor Profile Page Initialized');

  initContactModal();
  loadDonorData();
});

/**
 * Initialize Contact Modal
 */
function initContactModal() {
  const contactBtn = document.getElementById('contactDonorBtn');
  const modal = document.getElementById('contactModal');
  const closeBtn = document.getElementById('closeContactModal');
  const backdrop = modal?.querySelector('.modal-backdrop');

  if (contactBtn && modal) {
    contactBtn.addEventListener('click', () => {
      modal.classList.add('active');
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      modal.classList.remove('active');
    });
  }

  if (backdrop) {
    backdrop.addEventListener('click', () => {
      modal.classList.remove('active');
    });
  }
}

/**
 * Load Donor Data from API
 */
function loadDonorData() {
  // Get donor ID from URL params
  const urlParams = new URLSearchParams(window.location.search);
  const donorId = urlParams.get('id') || 1;

  // TODO: Fetch from API
  console.log('Loading donor data for ID:', donorId);
}
