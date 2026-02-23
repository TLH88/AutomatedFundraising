/**
 * Funds 4 Furry Friends - Main JavaScript
 * Interactivity and dynamic behaviors
 */

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  console.log('🐾 Funds 4 Furry Friends Dashboard Initialized');

  // Initialize all features
  initSidebarToggle();
  initSearchFunctionality();
  initAnimations();
  initTooltips();
  initProgressBars();
  initNotifications();
});

/**
 * Sidebar Toggle for Mobile
 */
function initSidebarToggle() {
  const sidebar = document.querySelector('.sidebar');
  const menuToggle = document.getElementById('menuToggle') || document.getElementById('menu-toggle');

  if (menuToggle && sidebar) {
    menuToggle.addEventListener('click', () => {
      sidebar.classList.toggle('open');
    });

    // Close sidebar when clicking outside on mobile
    document.addEventListener('click', (e) => {
      if (window.innerWidth < 768) {
        if (!sidebar.contains(e.target) && !menuToggle.contains(e.target)) {
          sidebar.classList.remove('open');
        }
      }
    });
  }
}

/**
 * Search Functionality
 */
function initSearchFunctionality() {
  const searchInput = document.querySelector('.search-input');

  if (searchInput) {
    searchInput.addEventListener('input', debounce((e) => {
      const query = e.target.value.toLowerCase();
      console.log('Searching for:', query);
      // TODO: Implement search functionality
      // This could filter donors, campaigns, or navigate to search results
    }, 300));
  }
}

/**
 * Initialize Scroll Animations
 */
function initAnimations() {
  // Add stagger animation to cards on scroll
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry, index) => {
        if (entry.isIntersecting) {
          setTimeout(() => {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
          }, index * 100);
          observer.unobserve(entry.target);
        }
      });
    },
    {
      threshold: 0.1,
      rootMargin: '0px 0px -50px 0px',
    }
  );

  // Observe all cards
  document.querySelectorAll('.card').forEach((card) => {
    card.style.opacity = '0';
    card.style.transform = 'translateY(20px)';
    card.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
    observer.observe(card);
  });
}

/**
 * Initialize Tooltips
 */
function initTooltips() {
  // Tooltips are CSS-based, but we can add dynamic positioning if needed
  const tooltips = document.querySelectorAll('.tooltip');

  tooltips.forEach((tooltip) => {
    const tooltipText = tooltip.querySelector('.tooltip-text');
    if (tooltipText) {
      tooltip.addEventListener('mouseenter', () => {
        // Optional: Adjust tooltip position to prevent overflow
        const rect = tooltipText.getBoundingClientRect();
        if (rect.left < 0) {
          tooltipText.style.left = '0';
          tooltipText.style.transform = 'translateX(0)';
        } else if (rect.right > window.innerWidth) {
          tooltipText.style.left = 'auto';
          tooltipText.style.right = '0';
          tooltipText.style.transform = 'translateX(0)';
        }
      });
    }
  });
}

/**
 * Animate Progress Bars
 */
function initProgressBars() {
  const progressBars = document.querySelectorAll('.progress-bar');

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const bar = entry.target;
          const targetWidth = bar.getAttribute('data-width') || bar.style.width;
          setTimeout(() => {
            bar.style.width = targetWidth;
          }, 300);
          observer.unobserve(bar);
        }
      });
    },
    {
      threshold: 0.5,
    }
  );

  progressBars.forEach((bar) => {
    const width = bar.style.width;
    bar.setAttribute('data-width', width);
    bar.style.width = '0%';
    observer.observe(bar);
  });
}

/**
 * Notification System
 */
function initNotifications() {
  const notificationBtn = document.querySelector('.btn-icon .icon');

  if (notificationBtn && notificationBtn.textContent.includes('🔔')) {
    notificationBtn.parentElement.addEventListener('click', () => {
      showNotificationPanel();
    });
  }
}

function showNotificationPanel() {
  // TODO: Implement notification panel
  console.log('Opening notifications panel');
  alert('Notifications:\n\n• New donation from Sarah Miller: $1,200\n• Campaign goal reached: Medical Fund\n• Upcoming event reminder: Adoption Day');
}

/**
 * Button Click Handlers
 */
document.addEventListener('click', (e) => {
  // Record Donation button
  if (e.target.closest('.btn') && e.target.textContent.includes('Record Donation')) {
    handleRecordDonation();
  }

  // Start Campaign / New Campaign button
  if (e.target.closest('.btn') && (e.target.textContent.includes('Start Campaign') || e.target.textContent.includes('New Campaign'))) {
    handleStartCampaign();
  }

  // Share Impact button
  if (e.target.closest('.btn') && e.target.textContent.includes('Share Impact')) {
    handleShareImpact();
  }

  // Send Thanks button
  if (e.target.closest('.btn') && e.target.textContent.includes('Send Thanks')) {
    const row = e.target.closest('tr');
    if (row) {
      const donorName = row.querySelector('.font-semibold').textContent;
      handleSendThanks(donorName);
    }
  }
});

function handleRecordDonation() {
  console.log('Record donation clicked');
  window.location.href = 'donors.html';
}

function handleStartCampaign() {
  console.log('Start campaign clicked');
  window.location.href = 'campaigns.html';
}

function handleShareImpact() {
  console.log('Share impact clicked');
  const shareText = 'Check out the amazing impact we\'re making at Funds 4 Furry Friends! We\'ve helped 342 animals this month. 🐾';

  if (navigator.share) {
    navigator.share({
      title: 'Funds 4 Furry Friends Impact',
      text: shareText,
      url: window.location.href,
    }).catch(err => console.log('Error sharing:', err));
  } else {
    // Fallback for browsers that don't support Web Share API
    copyToClipboard(shareText);
    showToast('Impact message copied to clipboard!');
  }
}

function handleSendThanks(donorName) {
  console.log('Sending thanks to:', donorName);
  showToast(`Thank you message sent to ${donorName}! 💚`);
  // TODO: Implement actual email/notification sending
}

/**
 * Utility Functions
 */

// Debounce helper
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

// Copy to clipboard
function copyToClipboard(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
}

// Show toast notification
function showToast(message, duration = 3000) {
  // Create toast element
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

  // Remove after duration
  setTimeout(() => {
    toast.style.animation = 'fadeOut 0.3s ease';
    setTimeout(() => {
      document.body.removeChild(toast);
    }, 300);
  }, duration);
}

// Format currency
function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

// Format date
function formatDate(date) {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(date));
}

// Format relative time
function formatRelativeTime(date) {
  const now = new Date();
  const diffMs = now - new Date(date);
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) {
    return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
  } else if (diffHours < 24) {
    return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  } else if (diffDays < 7) {
    return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
  } else {
    return formatDate(date);
  }
}

/**
 * Theme Toggle (Optional)
 */
function initThemeToggle() {
  const themeToggle = document.getElementById('theme-toggle');

  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const html = document.documentElement;
      const currentTheme = html.getAttribute('data-theme');
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      html.setAttribute('data-theme', newTheme);
      localStorage.setItem('theme', newTheme);
    });

    // Load saved theme
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
  }
}

// Export for use in other modules
window.FundsApp = {
  formatCurrency,
  formatDate,
  formatRelativeTime,
  showToast,
  copyToClipboard,
};
