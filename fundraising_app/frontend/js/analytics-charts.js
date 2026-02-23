/**
 * Funds 4 Furry Friends - Analytics Charts JavaScript
 */

document.addEventListener('DOMContentLoaded', () => {
  console.log('📊 Analytics Page Initialized');

  initDonationTrendsChart();
  initCampaignPerformanceChart();
  initDonorDemographicsChart();
  initDonationSourcesChart();
  initDateRangeFilter();
});

/**
 * Initialize Donation Trends Chart
 */
function initDonationTrendsChart() {
  const ctx = document.getElementById('donationTrendsChart');
  if (!ctx) return;

  new Chart(ctx, {
    type: 'line',
    data: {
      labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
      datasets: [
        {
          label: 'Donations',
          data: [28500, 35200, 42800, 48950],
          borderColor: '#10B981',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          borderWidth: 3,
          fill: true,
          tension: 0.4,
          pointRadius: 6,
          pointHoverRadius: 8,
          pointBackgroundColor: '#10B981',
          pointBorderColor: '#FFFFFF',
          pointBorderWidth: 2
        },
        {
          label: 'Goal',
          data: [30000, 35000, 40000, 45000],
          borderColor: '#6B7280',
          backgroundColor: 'transparent',
          borderWidth: 2,
          borderDash: [5, 5],
          fill: false,
          tension: 0.4,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: '#6B7280',
          pointBorderColor: '#FFFFFF',
          pointBorderWidth: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: {
            color: '#9CA3AF',
            font: {
              family: 'Inter, sans-serif',
              size: 12
            },
            usePointStyle: true,
            padding: 20
          }
        },
        tooltip: {
          backgroundColor: 'rgba(17, 24, 39, 0.95)',
          titleColor: '#F3F4F6',
          bodyColor: '#D1D5DB',
          borderColor: '#374151',
          borderWidth: 1,
          padding: 12,
          displayColors: true,
          callbacks: {
            label: function(context) {
              return context.dataset.label + ': $' + context.parsed.y.toLocaleString();
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: {
            color: 'rgba(107, 114, 128, 0.1)',
            borderColor: 'rgba(107, 114, 128, 0.2)'
          },
          ticks: {
            color: '#9CA3AF',
            font: {
              family: 'Inter, sans-serif',
              size: 11
            },
            callback: function(value) {
              return '$' + (value / 1000) + 'k';
            }
          }
        },
        x: {
          grid: {
            display: false,
            borderColor: 'rgba(107, 114, 128, 0.2)'
          },
          ticks: {
            color: '#9CA3AF',
            font: {
              family: 'Inter, sans-serif',
              size: 11
            }
          }
        }
      }
    }
  });
}

/**
 * Initialize Campaign Performance Chart
 */
function initCampaignPerformanceChart() {
  const ctx = document.getElementById('campaignPerformanceChart');
  if (!ctx) return;

  new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Completed', 'In Progress', 'At Risk', 'Draft'],
      datasets: [{
        data: [45, 35, 15, 5],
        backgroundColor: [
          '#10B981',
          '#3B82F6',
          '#F59E0B',
          '#6B7280'
        ],
        borderColor: '#0A0A0A',
        borderWidth: 3,
        hoverOffset: 8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: {
            color: '#9CA3AF',
            font: {
              family: 'Inter, sans-serif',
              size: 12
            },
            padding: 15,
            usePointStyle: true
          }
        },
        tooltip: {
          backgroundColor: 'rgba(17, 24, 39, 0.95)',
          titleColor: '#F3F4F6',
          bodyColor: '#D1D5DB',
          borderColor: '#374151',
          borderWidth: 1,
          padding: 12,
          callbacks: {
            label: function(context) {
              return context.label + ': ' + context.parsed + '%';
            }
          }
        }
      }
    }
  });
}

/**
 * Initialize Donor Demographics Chart
 */
function initDonorDemographicsChart() {
  const ctx = document.getElementById('donorDemographicsChart');
  if (!ctx) return;

  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['18-24', '25-34', '35-44', '45-54', '55-64', '65+'],
      datasets: [{
        label: 'Donors',
        data: [120, 340, 480, 520, 280, 107],
        backgroundColor: [
          'rgba(139, 92, 246, 0.8)',
          'rgba(59, 130, 246, 0.8)',
          'rgba(16, 185, 129, 0.8)',
          'rgba(245, 158, 11, 0.8)',
          'rgba(239, 68, 68, 0.8)',
          'rgba(107, 114, 128, 0.8)'
        ],
        borderColor: [
          '#8B5CF6',
          '#3B82F6',
          '#10B981',
          '#F59E0B',
          '#EF4444',
          '#6B7280'
        ],
        borderWidth: 2,
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: 'rgba(17, 24, 39, 0.95)',
          titleColor: '#F3F4F6',
          bodyColor: '#D1D5DB',
          borderColor: '#374151',
          borderWidth: 1,
          padding: 12
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: {
            color: 'rgba(107, 114, 128, 0.1)',
            borderColor: 'rgba(107, 114, 128, 0.2)'
          },
          ticks: {
            color: '#9CA3AF',
            font: {
              family: 'Inter, sans-serif',
              size: 11
            }
          }
        },
        x: {
          grid: {
            display: false,
            borderColor: 'rgba(107, 114, 128, 0.2)'
          },
          ticks: {
            color: '#9CA3AF',
            font: {
              family: 'Inter, sans-serif',
              size: 11
            }
          }
        }
      }
    }
  });
}

/**
 * Initialize Donation Sources Chart
 */
function initDonationSourcesChart() {
  const ctx = document.getElementById('donationSourcesChart');
  if (!ctx) return;

  new Chart(ctx, {
    type: 'pie',
    data: {
      labels: ['Website', 'Social Media', 'Events', 'Email Campaigns', 'Direct Mail'],
      datasets: [{
        data: [42, 25, 18, 10, 5],
        backgroundColor: [
          '#10B981',
          '#3B82F6',
          '#F59E0B',
          '#8B5CF6',
          '#6B7280'
        ],
        borderColor: '#0A0A0A',
        borderWidth: 3,
        hoverOffset: 8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: {
            color: '#9CA3AF',
            font: {
              family: 'Inter, sans-serif',
              size: 12
            },
            padding: 15,
            usePointStyle: true
          }
        },
        tooltip: {
          backgroundColor: 'rgba(17, 24, 39, 0.95)',
          titleColor: '#F3F4F6',
          bodyColor: '#D1D5DB',
          borderColor: '#374151',
          borderWidth: 1,
          padding: 12,
          callbacks: {
            label: function(context) {
              return context.label + ': ' + context.parsed + '%';
            }
          }
        }
      }
    }
  });
}

/**
 * Initialize Date Range Filter
 */
function initDateRangeFilter() {
  const dateRangeSelect = document.getElementById('dateRangeSelect');

  if (dateRangeSelect) {
    dateRangeSelect.addEventListener('change', (e) => {
      const value = e.target.value;
      console.log('Date range changed to:', value);

      if (value === 'custom') {
        // TODO: Show custom date picker modal
        console.log('Opening custom date range picker...');
      } else {
        // TODO: Reload analytics data for selected range
        console.log('Loading data for last', value, 'days');
      }
    });
  }
}
