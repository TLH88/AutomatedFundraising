/**
 * Events Calendar JavaScript
 */

document.addEventListener('DOMContentLoaded', () => {
  console.log('📅 Events Page Initialized');
  initEventFilters();
  initEventForm();
  initEventButtons();
});

function initEventFilters() {
  const typeFilter = document.getElementById('eventTypeFilter');
  const statusFilter = document.getElementById('statusFilter');

  if (typeFilter) typeFilter.addEventListener('change', filterEvents);
  if (statusFilter) statusFilter.addEventListener('change', filterEvents);
}

function filterEvents() {
  const typeValue = document.getElementById('eventTypeFilter')?.value || 'all';
  const statusValue = document.getElementById('statusFilter')?.value || 'all';
  const eventCards = document.querySelectorAll('.event-card');

  eventCards.forEach(card => {
    const typeBadge = card.querySelector('.event-type-badge')?.textContent.toLowerCase() || '';
    const matchesType = typeValue === 'all' || typeBadge.includes(typeValue.toLowerCase());
    card.style.display = matchesType ? 'flex' : 'none';
  });
}

function initEventForm() {
  const form = document.getElementById('addEventForm');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      console.log('Creating new event');
      showToast('Event created successfully!', 'success');
      closeModal('addEventModal');
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
 * Initialize Event Button Handlers
 */
function initEventButtons() {
  // View Details buttons
  document.querySelectorAll('.event-card-actions .btn-secondary').forEach(btn => {
    btn.addEventListener('click', () => {
      const eventCard = btn.closest('.event-card');
      const title = eventCard?.querySelector('.event-title')?.textContent || 'Event';
      showToast(`Viewing: ${title}`);
    });
  });

  // Manage RSVPs buttons
  document.querySelectorAll('.event-card-actions .btn-primary').forEach(btn => {
    btn.addEventListener('click', () => {
      showToast('Opening RSVP management...');
    });
  });

  // Export Calendar button
  document.querySelector('.page-actions .btn-secondary')?.addEventListener('click', () => {
    showToast('Exporting calendar...');
  });
}
