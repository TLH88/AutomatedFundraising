/**
 * Funds 4 Furry Friends - Chart Initialization
 * Fundraising trends visualization using Chart.js
 */

document.addEventListener('DOMContentLoaded', () => {
  initFundraisingChart();
});

/**
 * Initialize Fundraising Trends Chart
 */
async function initFundraisingChart() {
  const ctx = document.getElementById('fundraisingChart');

  if (!ctx) {
    console.error('Chart canvas not found');
    return;
  }

  const chartData = await fetchFundraisingTrendData();

  const chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: chartData.labels,
      datasets: [
        {
          label: 'Fundraising Amount',
          data: chartData.values,
          borderColor: '#10B981',
          backgroundColor: (context) => {
            const ctx = context.chart.ctx;
            const gradient = ctx.createLinearGradient(0, 0, 0, 300);
            gradient.addColorStop(0, 'rgba(16, 185, 129, 0.3)');
            gradient.addColorStop(1, 'rgba(16, 185, 129, 0)');
            return gradient;
          },
          borderWidth: 3,
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: 6,
          pointHoverBackgroundColor: '#10B981',
          pointHoverBorderColor: '#FFFFFF',
          pointHoverBorderWidth: 2,
        },
        {
          label: 'Goal',
          data: chartData.goal,
          borderColor: 'rgba(52, 211, 153, 0.6)',
          backgroundColor: 'transparent',
          borderWidth: 2,
          borderDash: [8, 4],
          fill: false,
          tension: 0,
          pointRadius: 0,
          pointHoverRadius: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      interaction: {
        intersect: false,
        mode: 'index',
      },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          align: 'end',
          labels: {
            color: '#D1D5DB',
            font: {
              family: "'Nunito', sans-serif",
              size: 12,
              weight: '500',
            },
            padding: 16,
            usePointStyle: true,
            pointStyle: 'circle',
          },
        },
        tooltip: {
          enabled: true,
          backgroundColor: 'rgba(20, 23, 28, 0.95)',
          backdropFilter: 'blur(40px)',
          titleColor: '#FFFFFF',
          titleFont: {
            family: "'Nunito', sans-serif",
            size: 14,
            weight: '600',
          },
          bodyColor: '#D1D5DB',
          bodyFont: {
            family: "'SF Mono', monospace",
            size: 13,
            weight: '500',
          },
          padding: 16,
          borderColor: 'rgba(16, 185, 129, 0.3)',
          borderWidth: 1,
          cornerRadius: 12,
          displayColors: true,
          callbacks: {
            label: function(context) {
              let label = context.dataset.label || '';
              if (label) {
                label += ': ';
              }
              if (context.parsed.y !== null) {
                label += new Intl.NumberFormat('en-US', {
                  style: 'currency',
                  currency: 'USD',
                }).format(context.parsed.y);
              }
              return label;
            },
            afterLabel: function(context) {
              if (context.datasetIndex === 0) {
                // Add donation count or other metadata
                const donationCount = chartData.donations[context.dataIndex];
                return `${donationCount} donations`;
              }
              return '';
            },
          },
        },
      },
      scales: {
        x: {
          grid: {
            color: 'rgba(255, 255, 255, 0.05)',
            drawBorder: false,
          },
          ticks: {
            color: '#6B7280',
            font: {
              family: "'Nunito', sans-serif",
              size: 11,
              weight: '500',
            },
            padding: 8,
          },
        },
        y: {
          beginAtZero: true,
          grid: {
            color: 'rgba(255, 255, 255, 0.05)',
            drawBorder: false,
          },
          ticks: {
            color: '#6B7280',
            font: {
              family: "'SF Mono', monospace",
              size: 11,
              weight: '500',
            },
            padding: 12,
            callback: function(value) {
              return new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD',
                notation: 'compact',
                maximumFractionDigits: 1,
              }).format(value);
            },
          },
        },
      },
      animation: {
        duration: 1500,
        easing: 'easeInOutQuart',
      },
    },
  });

  // Add celebration animation for milestones
  addMilestoneMarkers(chart, chartData);

  // Update chart when time range changes
  initChartControls(chart);
}

async function fetchFundraisingTrendData() {
  try {
    const response = await fetch('/api/fundraising/trends');
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const payload = await response.json();
    if (payload && Array.isArray(payload.labels) && Array.isArray(payload.values)) {
      return payload;
    }
  } catch (error) {
    console.warn('Falling back to sample chart data:', error);
  }
  return generateSampleData();
}

/**
 * Generate Sample Data
 * In production, this would fetch from your API
 */
function generateSampleData() {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
  const values = [12000, 18500, 22000, 19500, 25000, 24350];
  const goal = new Array(6).fill(23000);
  const donations = [45, 67, 82, 71, 95, 89];

  return {
    labels: months,
    values: values,
    goal: goal,
    donations: donations,
  };
}

/**
 * Add Milestone Markers to Chart
 */
function addMilestoneMarkers(chart, data) {
  // Find points where the fundraising exceeded the goal
  data.values.forEach((value, index) => {
    if (value > data.goal[index]) {
      // Add visual celebration marker
      // This could trigger confetti or a special animation
      console.log(`🎉 Milestone reached in ${data.labels[index]}!`);
    }
  });
}

/**
 * Initialize Chart Time Range Controls
 */
function initChartControls(chart) {
  const buttons = document.querySelectorAll('.chart-controls .btn');

  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      // Remove active class from all buttons
      buttons.forEach((btn) => {
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-secondary');
      });

      // Add active class to clicked button
      button.classList.remove('btn-secondary');
      button.classList.add('btn-primary');

      // Get time range from button text
      const range = button.textContent.trim();
      console.log('Changing chart range to:', range);

      // Update chart data based on range
      updateChartData(chart, range);
    });
  });
}

/**
 * Update Chart Data Based on Time Range
 */
function updateChartData(chart, range) {
  let newData;

  switch (range) {
    case '1M':
      newData = generate1MonthData();
      break;
    case '3M':
      newData = generate3MonthData();
      break;
    case '6M':
      newData = generateSampleData(); // Current default
      break;
    case '1Y':
      newData = generate1YearData();
      break;
    case 'All':
      newData = generateAllTimeData();
      break;
    default:
      newData = generateSampleData();
  }

  // Update chart
  chart.data.labels = newData.labels;
  chart.data.datasets[0].data = newData.values;
  chart.data.datasets[1].data = newData.goal;
  chart.update('active');
}

function generate1MonthData() {
  return {
    labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
    values: [5200, 6800, 5900, 6450],
    goal: [6000, 6000, 6000, 6000],
    donations: [18, 24, 21, 26],
  };
}

function generate3MonthData() {
  return {
    labels: ['Month 1', 'Month 2', 'Month 3'],
    values: [22000, 25000, 24350],
    goal: [23000, 23000, 23000],
    donations: [82, 95, 89],
  };
}

function generate1YearData() {
  return {
    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    values: [12000, 18500, 22000, 19500, 25000, 24350, 26800, 28200, 27500, 29800, 31200, 30500],
    goal: new Array(12).fill(25000),
    donations: [45, 67, 82, 71, 95, 89, 102, 108, 98, 112, 118, 115],
  };
}

function generateAllTimeData() {
  return {
    labels: ['2023 Q1', '2023 Q2', '2023 Q3', '2023 Q4', '2024 Q1', '2024 Q2', '2024 Q3', '2024 Q4', '2025 Q1', '2025 Q2'],
    values: [35000, 42000, 48000, 55000, 62000, 71000, 78000, 85000, 95000, 102000],
    goal: [40000, 50000, 60000, 70000, 80000, 85000, 90000, 95000, 100000, 105000],
    donations: [124, 156, 178, 195, 218, 242, 265, 287, 312, 335],
  };
}

// Export for use in other modules
window.ChartManager = {
  updateChartData,
  generateSampleData,
};
