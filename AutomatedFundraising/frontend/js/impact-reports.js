/**
 * Funds 4 Furry Friends - Impact Reports JavaScript
 */

document.addEventListener('DOMContentLoaded', () => {
  console.log('📊 Impact Reports Page Initialized');

  initReportFilters();
  initReportForm();
  initReportButtons();
});

/**
 * Initialize Report Filters
 */
function initReportFilters() {
  const reportTypeFilter = document.getElementById('reportTypeFilter');

  if (reportTypeFilter) {
    reportTypeFilter.addEventListener('change', filterReports);
  }
}

/**
 * Filter Reports
 */
function filterReports() {
  const filterValue = document.getElementById('reportTypeFilter')?.value || 'all';
  const reportCards = document.querySelectorAll('.report-card');

  reportCards.forEach(card => {
    const reportType = card.querySelector('.report-type-badge')?.textContent.toLowerCase().trim();

    if (filterValue === 'all' || reportType.includes(filterValue)) {
      card.style.display = 'flex';
    } else {
      card.style.display = 'none';
    }
  });
}

/**
 * Initialize Report Form
 */
function initReportForm() {
  const form = document.getElementById('generateReportForm');

  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      handleReportSubmit(e);
    });
  }

  // Auto-populate title based on report type
  const reportTypeSelect = document.getElementById('reportType');
  if (reportTypeSelect) {
    reportTypeSelect.addEventListener('change', autoPopulateTitle);
  }
}

/**
 * Auto-populate Report Title
 */
function autoPopulateTitle() {
  const reportType = document.getElementById('reportType')?.value;
  const titleInput = document.querySelector('#generateReportForm input[type="text"]');

  if (!titleInput || titleInput.value) return;

  const now = new Date();
  const year = now.getFullYear();
  const month = now.toLocaleString('default', { month: 'long' });

  switch (reportType) {
    case 'monthly':
      titleInput.value = `${month} ${year} Impact Report`;
      break;
    case 'quarterly':
      const quarter = Math.floor((now.getMonth() / 3)) + 1;
      titleInput.value = `Q${quarter} ${year} Impact Report`;
      break;
    case 'annual':
      titleInput.value = `${year} Annual Impact Report`;
      break;
    default:
      titleInput.value = '';
  }
}

/**
 * Handle Report Form Submit
 */
function handleReportSubmit(event) {
  const formData = new FormData(event.target);
  const reportData = Object.fromEntries(formData);

  console.log('Generating impact report:', reportData);

  // TODO: Send to API
  // fetch('/api/reports/generate', {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify(reportData)
  // })

  // Show success message
  showToast('Report generation started. You will be notified when it\'s ready.', 'success');
  closeModal('generateReportModal');
  event.target.reset();
}

/**
 * Preview Report
 */
function previewReport(reportId) {
  console.log('Previewing report:', reportId);
  // TODO: Open preview modal or new window
}

/**
 * Download Report
 */
function downloadReport(reportId, format = 'pdf') {
  console.log('Downloading report:', reportId, 'as', format);
  // TODO: Trigger download
}

/**
 * Share Report
 */
function shareReport(reportId) {
  console.log('Sharing report:', reportId);
  // TODO: Open share modal with email/social options
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
 * Initialize Report Button Handlers
 */
function initReportButtons() {
  // Use event delegation on main content
  const mainContent = document.querySelector('.main-content');
  if (mainContent) {
    mainContent.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;

      // Only handle buttons inside report cards
      if (btn.closest('.report-card-footer')) {
        const text = btn.textContent.trim();

        if (text.includes('Preview')) {
          showToast('Opening report preview...');
        } else if (text.includes('Download')) {
          showToast('Downloading report...');
        } else if (text.includes('Share')) {
          showToast('Opening share options...');
        } else if (text.includes('Edit')) {
          showToast('Opening report editor...');
        } else if (text.includes('Publish')) {
          showToast('Report published!');
        }
      }

      // Templates button in page header
      if (btn.closest('.page-actions') && btn.textContent.includes('Templates')) {
        showToast('Opening report templates...');
      }
    });
  }
}
