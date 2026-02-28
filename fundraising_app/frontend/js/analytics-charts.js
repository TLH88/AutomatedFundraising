/**
 * Funds 4 Furry Friends - Analytics Charts JavaScript
 * API-driven charts and metrics.
 */

const analyticsChartRefs = {
  donationTrends: null,
  campaignPerformance: null,
  donorDemographics: null,
  donationSources: null,
};

const analyticsState = {
  range: '30',
  customStartDate: '',
  customEndDate: '',
  campaigns: [],
  donors: [],
  events: [],
  trends: { labels: [], amounts: [] },
};

document.addEventListener('DOMContentLoaded', async () => {
  initDateRangeFilter();
  await loadAnalyticsData();
});

async function apiJson(url, options = {}) {
  if (window.FundsApp?.apiJson) return window.FundsApp.apiJson(url, options);
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function loadAnalyticsData() {
  try {
    const trendsUrl = buildTrendsUrl();
    const [trendsRes, campaignsRes, donorsRes, eventsRes, totalsRes, statsRes] = await Promise.all([
      apiJson(trendsUrl, { useCache: false }),
      apiJson('/api/campaigns?limit=500', { useCache: false }),
      apiJson('/api/donors?limit=500', { useCache: false }),
      apiJson('/api/events?limit=500', { useCache: false }),
      apiJson('/api/fundraising/total', { useCache: false }),
      apiJson('/api/stats/overview', { useCache: false }),
    ]);

    analyticsState.campaigns = Array.isArray(campaignsRes.campaigns) ? campaignsRes.campaigns : [];
    analyticsState.donors = Array.isArray(donorsRes.donors) ? donorsRes.donors : [];
    analyticsState.events = Array.isArray(eventsRes.events) ? eventsRes.events : [];

    const trendRows = Array.isArray(trendsRes.trends) ? trendsRes.trends : [];
    analyticsState.trends = {
      labels: trendRows.map((r) => r.period || r.label || 'Period'),
      amounts: trendRows.map((r) => Number(r.amount || 0)),
    };

    hydrateMetrics(totalsRes, statsRes);
    initDonationTrendsChart();
    initCampaignPerformanceChart();
    initDonorDemographicsChart();
    initDonationSourcesChart();
    hydrateTopCampaignsTable();
  } catch (err) {
    if (window.FundsApp?.showToast) window.FundsApp.showToast(`Analytics load failed: ${err.message || err}`);
  }
}

function hydrateMetrics(totalsRes = {}, statsRes = {}) {
  const cards = document.querySelectorAll('.analytics-metrics-grid .metric-card');
  if (!cards.length) return;

  const totalDonations = Number(totalsRes.total || totalsRes.yearly || 0);
  const donorCount = Number((statsRes.active_campaigns != null ? statsRes.donor_count : null) || analyticsState.donors.length || 0);
  const avgDonation = donorCount ? (totalDonations / donorCount) : 0;
  const retention = Number(statsRes.donor_retention || 0);

  const currency0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  const currency2 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });

  setMetricCard(cards[0], currency0.format(totalDonations), 'Total Donations');
  setMetricCard(cards[1], Number(analyticsState.donors.length || donorCount).toLocaleString(), 'Total Donors');
  setMetricCard(cards[2], currency2.format(avgDonation), 'Avg. Donation');
  setMetricCard(cards[3], `${retention}%`, 'Donor Retention');
}

function setMetricCard(card, value, label) {
  if (!card) return;
  const valueEl = card.querySelector('.metric-value');
  const labelEl = card.querySelector('.metric-label');
  if (valueEl) valueEl.textContent = value;
  if (labelEl) labelEl.textContent = label;
}

function initDonationTrendsChart() {
  const ctx = document.getElementById('donationTrendsChart');
  if (!ctx) return;
  analyticsChartRefs.donationTrends?.destroy?.();
  const theme = getAnalyticsChartTheme();
  const labels = analyticsState.trends.labels.length ? analyticsState.trends.labels : ['No data'];
  const values = analyticsState.trends.amounts.length ? analyticsState.trends.amounts : [0];
  const goal = values.map((v) => Math.round(v * 0.9));

  analyticsChartRefs.donationTrends = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Donations',
          data: values,
          borderColor: theme.primary,
          backgroundColor: `rgba(${theme.primaryRgb}, 0.1)`,
          borderWidth: 3,
          fill: true,
          tension: 0.4,
          pointRadius: 4,
          pointBackgroundColor: theme.primary,
          pointBorderColor: '#FFFFFF',
          pointBorderWidth: 1,
        },
        {
          label: 'Goal',
          data: goal,
          borderColor: '#6B7280',
          borderDash: [5, 5],
          fill: false,
          tension: 0.4,
          pointRadius: 2,
        },
      ],
    },
    options: buildCommonLineOptions(theme),
  });
}

function initCampaignPerformanceChart() {
  const ctx = document.getElementById('campaignPerformanceChart');
  if (!ctx) return;
  analyticsChartRefs.campaignPerformance?.destroy?.();
  const theme = getAnalyticsChartTheme();

  const statusCounts = countBy(analyticsState.campaigns, (c) => String(c.status || 'draft').toLowerCase());
  const labels = ['completed', 'active', 'at risk', 'draft'];
  const data = [
    statusCounts['completed'] || statusCounts['archived'] || 0,
    statusCounts['active'] || 0,
    statusCounts['at risk'] || statusCounts['at_risk'] || 0,
    statusCounts['draft'] || 0,
  ];

  analyticsChartRefs.campaignPerformance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Completed', 'Active', 'At Risk', 'Draft'],
      datasets: [{
        data,
        backgroundColor: [theme.primary, '#3B82F6', '#F59E0B', '#6B7280'],
        borderColor: '#0A0A0A',
        borderWidth: 3,
      }],
    },
    options: buildCommonDonutOptions(theme),
  });
}

function initDonorDemographicsChart() {
  const ctx = document.getElementById('donorDemographicsChart');
  if (!ctx) return;
  analyticsChartRefs.donorDemographics?.destroy?.();
  const theme = getAnalyticsChartTheme();

  const tierCounts = countBy(analyticsState.donors, (d) => String(d.tier || d.donor_tier || 'unknown').toLowerCase());
  const labels = ['friend', 'supporter', 'champion', 'hero', 'gem supporter', 'heart friend'];
  const data = labels.map((l) => tierCounts[l] || 0);

  analyticsChartRefs.donorDemographics = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels.map((l) => toTitle(l)),
      datasets: [{
        label: 'Donors',
        data,
        backgroundColor: [
          'rgba(139, 92, 246, 0.8)',
          'rgba(59, 130, 246, 0.8)',
          `rgba(${theme.primaryRgb}, 0.8)`,
          'rgba(245, 158, 11, 0.8)',
          'rgba(239, 68, 68, 0.8)',
          'rgba(107, 114, 128, 0.8)',
        ],
        borderWidth: 1,
        borderRadius: 6,
      }],
    },
    options: buildCommonBarOptions(theme),
  });
}

function initDonationSourcesChart() {
  const ctx = document.getElementById('donationSourcesChart');
  if (!ctx) return;
  analyticsChartRefs.donationSources?.destroy?.();
  const theme = getAnalyticsChartTheme();

  const sourceCounts = countBy(analyticsState.campaigns, (c) => String(c.category || 'general').toLowerCase());
  const entries = Object.entries(sourceCounts).slice(0, 5);
  const labels = entries.map(([k]) => toTitle(k));
  const data = entries.map(([, v]) => v);

  analyticsChartRefs.donationSources = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: labels.length ? labels : ['No data'],
      datasets: [{
        data: data.length ? data : [1],
        backgroundColor: [theme.primary, '#3B82F6', '#F59E0B', '#8B5CF6', '#6B7280'],
        borderColor: '#0A0A0A',
        borderWidth: 2,
      }],
    },
    options: buildCommonDonutOptions(theme),
  });
}

function hydrateTopCampaignsTable() {
  const tbody = document.querySelector('.table tbody');
  if (!tbody) return;
  const rows = analyticsState.campaigns
    .slice()
    .sort((a, b) => Number(b.raised_amount || b.raised || 0) - Number(a.raised_amount || a.raised || 0))
    .slice(0, 5);
  if (!rows.length) return;

  tbody.innerHTML = rows.map((c) => {
    const goal = Number(c.goal_amount || c.goal || 0);
    const raised = Number(c.raised_amount || c.raised || 0);
    const pct = goal > 0 ? Math.min(100, Math.round((raised / goal) * 1000) / 10) : 0;
    return `
      <tr>
        <td><div class="table-cell-with-badge"><strong>${escapeHtml(c.name || 'Campaign')}</strong><span class="badge badge-success">${escapeHtml(toTitle(c.status || 'active'))}</span></div></td>
        <td>${escapeHtml(toTitle(c.category || 'general'))}</td>
        <td>${formatMoney(goal)}</td>
        <td class="text-success">${formatMoney(raised)}</td>
        <td><div class="progress-bar-small"><div class="progress-fill" style="width:${pct}%"></div></div><span class="progress-text">${pct}%</span></td>
        <td>${escapeHtml(String(c.donor_count || c.donors || 0))}</td>
        <td>${escapeHtml(String(c.conversion_rate || 0))}%</td>
      </tr>
    `;
  }).join('');
}

function initDateRangeFilter() {
  const dateRangeSelect = document.getElementById('dateRangeSelect');
  if (!dateRangeSelect) return;
  ensureCustomRangeModal();
  dateRangeSelect.addEventListener('change', async (e) => {
    const value = String(e.target.value || '30');
    if (value === 'custom') {
      openCustomRangeModal();
      return;
    }
    analyticsState.range = value;
    analyticsState.customStartDate = '';
    analyticsState.customEndDate = '';
    await loadAnalyticsData();
  });
}

function buildTrendsUrl() {
  if (analyticsState.range === 'custom' && analyticsState.customStartDate && analyticsState.customEndDate) {
    const qs = new URLSearchParams({
      start_date: analyticsState.customStartDate,
      end_date: analyticsState.customEndDate,
    });
    return `/api/fundraising/trends?${qs.toString()}`;
  }
  const qs = new URLSearchParams({ range: analyticsState.range || '30' });
  return `/api/fundraising/trends?${qs.toString()}`;
}

function ensureCustomRangeModal() {
  if (document.getElementById('analyticsCustomRangeModal')) return;
  const host = document.createElement('div');
  host.innerHTML = `
    <div class="modal" id="analyticsCustomRangeModal" aria-hidden="true">
      <div class="modal-backdrop" data-custom-range-close></div>
      <div class="modal-content" style="max-width:560px;">
        <div class="modal-header">
          <h2 class="modal-title">Custom Date Range</h2>
          <button type="button" class="modal-close" data-custom-range-close aria-label="Close">x</button>
        </div>
        <div class="modal-body">
          <form id="analyticsCustomRangeForm" class="form">
            <div class="form-row">
              <div class="input-group">
                <label class="label" for="analyticsCustomStartDate">Start Date</label>
                <input class="input" type="date" id="analyticsCustomStartDate" required>
              </div>
              <div class="input-group">
                <label class="label" for="analyticsCustomEndDate">End Date</label>
                <input class="input" type="date" id="analyticsCustomEndDate" required>
              </div>
            </div>
            <p class="text-muted text-caption" style="margin:6px 0 0;">Range must be between 1 and 365 days.</p>
            <div class="modal-actions" style="justify-content:flex-end;">
              <button type="button" class="btn btn-secondary" data-custom-range-close>Cancel</button>
              <button type="submit" class="btn btn-primary">Apply Range</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `.trim();
  document.body.appendChild(host.firstElementChild);
  const modal = document.getElementById('analyticsCustomRangeModal');
  modal?.querySelectorAll('[data-custom-range-close]').forEach((btn) => {
    btn.addEventListener('click', closeCustomRangeModal);
  });
  document.getElementById('analyticsCustomRangeForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const startInput = document.getElementById('analyticsCustomStartDate');
    const endInput = document.getElementById('analyticsCustomEndDate');
    const startDate = String(startInput?.value || '').trim();
    const endDate = String(endInput?.value || '').trim();
    if (!startDate || !endDate) {
      window.FundsApp?.showToast?.('Select both start and end dates.');
      return;
    }
    const start = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T23:59:59`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      window.FundsApp?.showToast?.('Invalid date range.');
      return;
    }
    if (end < start) {
      window.FundsApp?.showToast?.('End date must be on or after start date.');
      return;
    }
    const days = Math.floor((end - start) / 86400000) + 1;
    if (days < 1 || days > 365) {
      window.FundsApp?.showToast?.('Custom range must be between 1 and 365 days.');
      return;
    }
    analyticsState.range = 'custom';
    analyticsState.customStartDate = startDate;
    analyticsState.customEndDate = endDate;
    closeCustomRangeModal();
    await loadAnalyticsData();
    const dateRangeSelect = document.getElementById('dateRangeSelect');
    if (dateRangeSelect) dateRangeSelect.value = 'custom';
    window.FundsApp?.showToast?.(`Applied ${days}-day custom range.`);
  });
}

function openCustomRangeModal() {
  const modal = document.getElementById('analyticsCustomRangeModal');
  if (!modal) return;
  const startInput = document.getElementById('analyticsCustomStartDate');
  const endInput = document.getElementById('analyticsCustomEndDate');
  const today = new Date();
  const defaultEnd = today.toISOString().slice(0, 10);
  const defaultStart = new Date(today.getTime() - (29 * 86400000)).toISOString().slice(0, 10);
  if (startInput) startInput.value = analyticsState.customStartDate || defaultStart;
  if (endInput) endInput.value = analyticsState.customEndDate || defaultEnd;
  modal.classList.add('active');
  modal.setAttribute('aria-hidden', 'false');
}

function closeCustomRangeModal() {
  const modal = document.getElementById('analyticsCustomRangeModal');
  if (!modal) return;
  const dateRangeSelect = document.getElementById('dateRangeSelect');
  if (analyticsState.range !== 'custom' && dateRangeSelect) {
    dateRangeSelect.value = analyticsState.range || '30';
  }
  modal.classList.remove('active');
  modal.setAttribute('aria-hidden', 'true');
}

window.addEventListener('funds:primary-color-change', () => {
  if (!document.getElementById('donationTrendsChart')) return;
  initDonationTrendsChart();
  initCampaignPerformanceChart();
  initDonorDemographicsChart();
  initDonationSourcesChart();
});

function buildCommonLineOptions(theme) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: '#9CA3AF', usePointStyle: true } },
      tooltip: { backgroundColor: theme.tooltipBg, borderColor: theme.tooltipBorder, borderWidth: 1 },
    },
    scales: {
      y: { beginAtZero: true, ticks: { color: '#9CA3AF' }, grid: { color: 'rgba(107,114,128,0.1)' } },
      x: { ticks: { color: '#9CA3AF' }, grid: { display: false } },
    },
  };
}

function buildCommonBarOptions(theme) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { backgroundColor: theme.tooltipBg, borderColor: theme.tooltipBorder, borderWidth: 1 },
    },
    scales: {
      y: { beginAtZero: true, ticks: { color: '#9CA3AF' }, grid: { color: 'rgba(107,114,128,0.1)' } },
      x: { ticks: { color: '#9CA3AF' }, grid: { display: false } },
    },
  };
}

function buildCommonDonutOptions(theme) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom', labels: { color: '#9CA3AF', usePointStyle: true } },
      tooltip: { backgroundColor: theme.tooltipBg, borderColor: theme.tooltipBorder, borderWidth: 1 },
    },
  };
}

function countBy(rows, keyFn) {
  const out = {};
  for (const row of rows || []) {
    const key = String(keyFn(row) || 'unknown');
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

function formatMoney(value) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(value || 0));
}

function toTitle(value) {
  return String(value || '').replace(/[_-]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getAnalyticsChartTheme() {
  const styles = getComputedStyle(document.documentElement);
  const themeMode = document.documentElement.getAttribute('data-theme') || 'dark';
  const primary = (styles.getPropertyValue('--accent-green') || '').trim() || '#10B981';
  const primaryRgb = (styles.getPropertyValue('--accent-green-rgb') || '').trim() || '16, 185, 129';
  return {
    primary,
    primaryRgb,
    tooltipBg: themeMode === 'light' ? 'rgba(255, 255, 255, 0.96)' : 'rgba(17, 24, 39, 0.95)',
    tooltipBorder: themeMode === 'light' ? '#D1D5DB' : '#374151',
  };
}
