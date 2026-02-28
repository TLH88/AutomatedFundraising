/**
 * Funds 4 Furry Friends - Impact Reports JavaScript
 */

const reportState = { rows: [], filtered: [] };

document.addEventListener('DOMContentLoaded', () => {
  initReportFilters();
  initReportForm();
  initReportButtons();
  loadReports();
  hydrateImpactSummary();
});

async function apiJson(url, options = {}) {
  if (window.FundsApp?.apiJson) return window.FundsApp.apiJson(url, options);
  const res = await fetch(url, options);
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload?.error || `HTTP ${res.status}`);
  return payload;
}

function toast(message) {
  if (window.FundsApp?.showToast) return window.FundsApp.showToast(message);
  console.log(message);
}

function initReportFilters() {
  document.getElementById('reportTypeFilter')?.addEventListener('change', applyReportFilters);
}

function initReportForm() {
  const form = document.getElementById('generateReportForm');
  form?.addEventListener('submit', onGenerateReport);
  document.getElementById('reportType')?.addEventListener('change', autoPopulateTitle);
}

async function loadReports() {
  const grid = document.querySelector('.reports-grid');
  if (grid) grid.innerHTML = '<div class="report-card"><div class="report-card-body"><h3 class="report-title">Loading reports...</h3></div></div>';
  try {
    const res = await apiJson('/api/reports?limit=300', { useCache: false });
    reportState.rows = Array.isArray(res.reports) ? res.reports : [];
    applyReportFilters();
  } catch (err) {
    if (grid) grid.innerHTML = `<div class="report-card"><div class="report-card-body"><h3 class="report-title">Unable to load reports: ${escapeHtml(err.message || err)}</h3></div></div>`;
  }
}

async function hydrateImpactSummary() {
  try {
    const [totals, monthly] = await Promise.all([
      apiJson('/api/fundraising/total', { useCache: false }),
      apiJson('/api/impact/monthly', { useCache: false }),
    ]);
    const values = document.querySelectorAll('.impact-summary-grid .impact-card-value');
    if (values[0]) values[0].textContent = Number(totals.animals_helped || monthly.animals_helped || 0).toLocaleString();
    if (values[1]) values[1].textContent = Number(totals.animals_adopted || 0).toLocaleString();
    if (values[2]) values[2].textContent = Number(totals.treatments || 0).toLocaleString();
    if (values[3]) values[3].textContent = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(totals.yearly || totals.total || 0));
  } catch {}
}

function applyReportFilters() {
  const filterValue = document.getElementById('reportTypeFilter')?.value || 'all';
  reportState.filtered = reportState.rows.filter((r) => {
    const t = String(r.report_type || r.type || 'custom').toLowerCase();
    return filterValue === 'all' || t === filterValue;
  });
  renderReports();
}

function renderReports() {
  const grid = document.querySelector('.reports-grid');
  if (!grid) return;
  if (!reportState.filtered.length) {
    grid.innerHTML = '<div class="report-card"><div class="report-card-body"><h3 class="report-title">No reports found.</h3></div></div>';
    return;
  }
  grid.innerHTML = reportState.filtered.map((r) => {
    const type = String(r.report_type || r.type || 'custom').toLowerCase();
    const status = String(r.status || 'draft').toLowerCase();
    const created = r.created_at || r.updated_at || '';
    const period = `${r.period_start || 'N/A'} - ${r.period_end || 'N/A'}`;
    return `
      <div class="report-card" data-report-id="${escapeHtml(String(r.id || ''))}">
        <div class="report-card-header">
          <div class="report-type-badge ${escapeHtml(type)}">${escapeHtml(toTitle(type))} Report</div>
          <div class="report-status-badge ${escapeHtml(status)}">${escapeHtml(toTitle(status))}</div>
        </div>
        <div class="report-card-body">
          <h3 class="report-title">${escapeHtml(r.title || 'Untitled Report')}</h3>
          <p class="report-description">${escapeHtml(r.summary || 'No summary provided.')}</p>
          <div class="report-meta">
            <div class="report-meta-item"><span class="report-meta-label">Generated</span><span class="report-meta-value">${escapeHtml(created ? new Date(created).toLocaleDateString() : 'N/A')}</span></div>
            <div class="report-meta-item"><span class="report-meta-label">Period</span><span class="report-meta-value">${escapeHtml(period)}</span></div>
            <div class="report-meta-item"><span class="report-meta-label">Status</span><span class="report-meta-value">${escapeHtml(toTitle(status))}</span></div>
          </div>
        </div>
        <div class="report-card-footer">
          <button class="btn btn-sm btn-secondary" type="button" data-action="preview"><span>👁️</span><span>Preview</span></button>
          <button class="btn btn-sm btn-secondary" type="button" data-action="edit"><span>✏️</span><span>Edit</span></button>
          <button class="btn btn-sm btn-primary" type="button" data-action="publish"><span>✅</span><span>Publish</span></button>
        </div>
      </div>
    `;
  }).join('');
}

function autoPopulateTitle() {
  const reportType = document.getElementById('reportType')?.value;
  const titleInput = document.getElementById('reportTitleInput');
  if (!titleInput || titleInput.value) return;
  const now = new Date();
  const year = now.getFullYear();
  const month = now.toLocaleString('default', { month: 'long' });
  if (reportType === 'monthly') titleInput.value = `${month} ${year} Impact Report`;
  if (reportType === 'quarterly') titleInput.value = `Q${Math.floor(now.getMonth() / 3) + 1} ${year} Impact Report`;
  if (reportType === 'annual') titleInput.value = `${year} Annual Impact Report`;
}

async function onGenerateReport(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  const payload = {
    title: String(data.title || '').trim(),
    report_type: String(data.report_type || 'custom').trim(),
    period_start: data.period_start || null,
    period_end: data.period_end || null,
    status: 'draft',
    summary: `${toTitle(data.report_type || 'custom')} report generated from Impact Reports page.`,
    data_snapshot: { format: data.format || 'pdf' },
  };
  if (!payload.title || !payload.period_start || !payload.period_end) {
    toast('Title and date range are required');
    return;
  }
  const btn = form.querySelector('[type="submit"]');
  const old = btn?.textContent || 'Generate Report';
  if (btn) { btn.disabled = true; btn.textContent = 'Generating...'; }
  try {
    await apiJson('/api/reports/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    toast('Report generated');
    closeModal('generateReportModal');
    form.reset();
    await loadReports();
  } catch (err) {
    toast(`Failed to generate report: ${err.message || err}`);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = old; }
  }
}

function initReportButtons() {
  document.querySelector('.main-content')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) {
      const templateBtn = e.target.closest('.page-actions .btn-secondary');
      if (templateBtn) toast('Template browser is not enabled yet. Use Generate Report to create a report.');
      return;
    }

    const card = btn.closest('.report-card');
    const id = card?.getAttribute('data-report-id') || '';
    const row = reportState.rows.find((r) => String(r.id) === String(id));
    if (!row) return;

    const action = btn.getAttribute('data-action');
    if (action === 'preview') {
      toast(`${row.title}: ${row.summary || 'No summary.'}`);
      return;
    }
    if (action === 'edit') {
      prefillReportForm(row);
      openModal('generateReportModal');
      return;
    }
    if (action === 'publish') {
      await apiJson(`/api/reports/${encodeURIComponent(String(id))}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'published' }),
      });
      toast('Report published');
      await loadReports();
    }
  });
}

function prefillReportForm(row) {
  setValue('reportType', row.report_type || row.type || 'custom');
  setValue('reportTitleInput', row.title || '');
  setValue('reportStartDateInput', row.period_start || '');
  setValue('reportEndDateInput', row.period_end || '');
  setValue('reportFormatInput', 'pdf');
}

function setValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value;
}

function openModal(modalId) {
  document.getElementById(modalId)?.classList.add('active');
}

function closeModal(modalId) {
  if (window.FundsApp?.closeModal) return window.FundsApp.closeModal(modalId);
  document.getElementById(modalId)?.classList.remove('active');
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
