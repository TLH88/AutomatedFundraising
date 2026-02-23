/** Communications Center JavaScript */
document.addEventListener('DOMContentLoaded', () => {
  console.log('📧 Communications Page Initialized');
  initCampaignForm();
  initCommsButtons();
});

function initCampaignForm() {
  const form = document.getElementById('newCampaignForm');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      console.log('Creating email campaign');
      showToast('Email campaign created successfully!', 'success');
      closeModal('newCampaignModal');
      e.target.reset();
    });
  }
}

function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add('active');
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('active');
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.textContent = message;
  toast.style.cssText = `position:fixed;bottom:24px;right:24px;background:var(--accent-green);color:white;padding:16px 24px;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.3);z-index:9999;font-weight:500;transition:opacity 0.3s ease;`;
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
}

/**
 * Initialize Communications Button Handlers
 */
function initCommsButtons() {
  // Use event delegation on the campaigns list
  const campaignsList = document.querySelector('.campaigns-list');
  if (campaignsList) {
    campaignsList.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;

      const text = btn.textContent.trim();

      if (text.includes('View Report')) {
        showToast('Opening campaign report...');
      } else if (text.includes('Duplicate')) {
        showToast('Campaign duplicated!');
      } else if (text.includes('Edit')) {
        showToast('Opening campaign editor...');
      } else if (text.includes('Send Now')) {
        if (confirm('Send this campaign now?')) {
          showToast('Campaign sent successfully!');
        }
      } else if (text.includes('Review & Send')) {
        showToast('Opening review...');
      }
    });
  }

  // Templates button in page header
  document.querySelector('.page-actions .btn-secondary')?.addEventListener('click', () => {
    showToast('Opening templates...');
  });
}
