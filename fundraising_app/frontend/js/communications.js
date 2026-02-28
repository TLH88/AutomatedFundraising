/** Communications Center JavaScript */

const COMM_HANDOFF_KEY = 'funds_communications_handoff_v1';
let communicationsHandoff = null;
const commState = { campaigns: [], filtered: [] };

document.addEventListener('DOMContentLoaded', () => {
  initCampaignForm();
  initCommsButtons();
  initLeadGenerationHandoff();
  initCommsSearch();
  loadCampaigns();
});

async function apiJson(url, options) {
  if (window.FundsApp?.apiJson) return window.FundsApp.apiJson(url, options);
  const res = await fetch(url, options);
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload?.error || `HTTP ${res.status}`);
  return payload;
}

function showToast(message) {
  if (window.FundsApp?.showToast) return window.FundsApp.showToast(message);
  console.log(message);
}

function openModal(modalId) {
  document.getElementById(modalId)?.classList.add('active');
}

function closeModal(modalId) {
  if (window.FundsApp?.closeModal) return window.FundsApp.closeModal(modalId);
  document.getElementById(modalId)?.classList.remove('active');
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function initCommsSearch() {
  const input = document.querySelector('.topbar .search-input');
  input?.addEventListener('input', applyCommsFilters);
}

async function loadCampaigns() {
  const list = document.querySelector('.campaigns-list');
  if (list) list.innerHTML = '<div class="campaign-card"><div class="campaign-card-header"><h3 class="campaign-title">Loading campaigns...</h3></div></div>';
  try {
    const data = await apiJson('/api/communications/campaigns?limit=500', { useCache: false });
    commState.campaigns = Array.isArray(data.campaigns) ? data.campaigns : [];
    applyCommsFilters();
    updateCommsStats();
  } catch (err) {
    if (list) list.innerHTML = `<div class="campaign-card"><div class="campaign-card-header"><h3 class="campaign-title">Unable to load campaigns: ${esc(err.message || err)}</h3></div></div>`;
  }
}

function applyCommsFilters() {
  const q = String(document.querySelector('.topbar .search-input')?.value || '').trim().toLowerCase();
  commState.filtered = commState.campaigns.filter((c) => {
    if (!q) return true;
    const hay = `${c.name || ''} ${c.status || ''} ${c.channel || ''} ${c.audience_segment || ''} ${c.notes || ''}`.toLowerCase();
    return hay.includes(q);
  });
  renderCampaignCards();
}

function renderCampaignCards() {
  const list = document.querySelector('.campaigns-list');
  if (!list) return;
  const rows = commState.filtered;
  if (!rows.length) {
    list.innerHTML = '<div class="campaign-card"><div class="campaign-card-header"><h3 class="campaign-title">No campaigns found.</h3></div></div>';
    return;
  }
  list.innerHTML = rows.map((c) => {
    const status = String(c.status || 'draft').toLowerCase();
    const recipientCount = Number(c.recipient_count || c.recipients_count || 0);
    const sentAt = c.sent_at || c.updated_at || c.created_at || '';
    const sentLabel = sentAt ? new Date(sentAt).toLocaleDateString() : 'Not sent';
    return `
      <div class="campaign-card" data-campaign-id="${esc(c.id || '')}">
        <div class="campaign-card-header">
          <h3 class="campaign-title">${esc(c.name || 'Untitled Campaign')}</h3>
          <div class="campaign-status-badge ${esc(status)}">${esc(status)}</div>
        </div>
        <p class="campaign-description">${esc((c.notes || 'No campaign notes.').split('\n')[0])}</p>
        <div class="campaign-stats">
          <div class="campaign-stat"><span class="stat-label">Recipients</span><span class="stat-value">${recipientCount || 'N/A'}</span></div>
          <div class="campaign-stat"><span class="stat-label">Channel</span><span class="stat-value">${esc(c.channel || 'email')}</span></div>
          <div class="campaign-stat"><span class="stat-label">Audience</span><span class="stat-value">${esc(c.audience_segment || 'custom')}</span></div>
          <div class="campaign-stat"><span class="stat-label">Updated</span><span class="stat-value">${esc(sentLabel)}</span></div>
        </div>
        <div class="campaign-actions">
          <button class="btn btn-sm btn-secondary" type="button" data-action="view">View Details</button>
          <button class="btn btn-sm btn-secondary" type="button" data-action="duplicate">Duplicate</button>
          <button class="btn btn-sm btn-primary" type="button" data-action="send">Mark Sent</button>
        </div>
      </div>
    `;
  }).join('');
}

function updateCommsStats() {
  const rows = commState.campaigns;
  const sent = rows.filter((r) => String(r.status || '').toLowerCase() === 'sent').length;
  const total = rows.length;
  const sentPercent = total ? Math.round((sent / total) * 100) : 0;
  const values = document.querySelectorAll('.comms-stats-grid .stat-card-value');
  if (values[0]) values[0].textContent = String(total);
  if (values[1]) values[1].textContent = `${sentPercent}%`;
  if (values[2]) values[2].textContent = String(rows.filter((r) => String(r.status || '').toLowerCase() === 'draft').length);
  if (values[3]) values[3].textContent = String(rows.filter((r) => String(r.status || '').toLowerCase() === 'scheduled').length);
}

function initCampaignForm() {
  const form = document.getElementById('newCampaignForm');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = form.querySelector('[type="submit"]');
    const original = submitBtn?.textContent || 'Create Campaign';
    const data = Object.fromEntries(new FormData(form));
    const handoffRecipients = Array.isArray(communicationsHandoff?.recipients) ? communicationsHandoff.recipients : [];
    const payload = {
      name: data.name,
      channel: 'email',
      status: 'draft',
      audience_segment: data.audience_segment || 'custom',
      notes: buildCampaignNotes({ subject: data.subject, template: data.template, message: data.message, handoff: communicationsHandoff }),
      metadata: {
        subject: data.subject || '',
        template: data.template || '',
        source: communicationsHandoff?.source || 'communications',
        recipient_preview_count: handoffRecipients.length,
        recipients: handoffRecipients.slice(0, 200),
      },
    };

    try {
      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Creating...'; }
      await apiJson('/api/communications/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      showToast('Email campaign created successfully');
      clearLeadGenerationHandoff();
      form.reset();
      hideLeadHandoffSummary();
      closeModal('newCampaignModal');
      await loadCampaigns();
    } catch (err) {
      showToast(`Failed to create campaign: ${err.message || 'Unknown error'}`);
    } finally {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = original; }
    }
  });
}

function buildCampaignNotes({ subject, template, message, handoff }) {
  const lines = [];
  if (subject) lines.push(`Subject: ${subject}`);
  if (template) lines.push(`Template: ${template}`);
  if (message) lines.push(`Message preview: ${String(message).slice(0, 280)}`);
  if (handoff) {
    lines.push(`Lead Generation handoff: ${handoff.lead_count || 0} leads (${handoff.contacts_count || 0} contacts, ${handoff.organizations_count || 0} organizations)`);
    const topEmails = (handoff.recipients || []).map((r) => r.email).filter(Boolean).slice(0, 10);
    if (topEmails.length) lines.push(`Recipient emails: ${topEmails.join('; ')}`);
  }
  return lines.join('\n');
}

function initLeadGenerationHandoff() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('handoff') !== 'leadgen') return;
  try {
    communicationsHandoff = JSON.parse(localStorage.getItem(COMM_HANDOFF_KEY) || 'null');
  } catch {
    communicationsHandoff = null;
  }
  if (!communicationsHandoff || !Array.isArray(communicationsHandoff.recipients) || !communicationsHandoff.recipients.length) {
    showToast('Lead Generation handoff was not found or has expired.');
    return;
  }
  populateCampaignFormFromHandoff(communicationsHandoff);
  openModal('newCampaignModal');
  showToast(`Loaded ${communicationsHandoff.lead_count || communicationsHandoff.recipients.length} lead(s) from Lead Generation`);
}

function populateCampaignFormFromHandoff(handoff) {
  document.getElementById('commCampaignName') && (document.getElementById('commCampaignName').value = handoff.name || `Lead Outreach ${new Date().toLocaleDateString()}`);
  document.getElementById('commCampaignSubject') && (document.getElementById('commCampaignSubject').value = 'Introduction and partnership opportunity');
  document.getElementById('commCampaignRecipients') && (document.getElementById('commCampaignRecipients').value = 'lead_generation_handoff');
  document.getElementById('commCampaignTemplate') && (document.getElementById('commCampaignTemplate').value = 'appeal');
  const msg = document.getElementById('commCampaignMessage');
  if (msg && !msg.value) {
    msg.value = `Hello,\n\nWe are reaching out from Funds 4 Furry Friends to explore a potential partnership or donation opportunity in support of our no-kill animal rescue mission.\n\nThank you for your time.\n`;
  }
  showLeadHandoffSummary(handoff);
}

function showLeadHandoffSummary(handoff) {
  const wrap = document.getElementById('commLeadHandoffSummary');
  const text = document.getElementById('commLeadHandoffSummaryText');
  if (!wrap || !text) return;
  const emails = (handoff.recipients || []).map((r) => r.email).filter(Boolean);
  const uniqueEmails = Array.from(new Set(emails.map((e) => String(e).toLowerCase())));
  const topCategories = summarizeCategories(handoff.recipients || []);
  text.innerHTML = `
    <strong>${esc(String(handoff.lead_count || 0))} selected lead(s)</strong>
    <div class="text-muted text-caption" style="margin-top:6px;">
      Contacts: ${esc(String(handoff.contacts_count || 0))} | Organizations: ${esc(String(handoff.organizations_count || 0))} | Unique Emails: ${esc(String(uniqueEmails.length))}
    </div>
    <div class="text-muted text-caption" style="margin-top:6px;">Top categories: ${esc(topCategories || 'Mixed')}</div>
  `;
  wrap.style.display = '';
}

function hideLeadHandoffSummary() {
  const wrap = document.getElementById('commLeadHandoffSummary');
  if (wrap) wrap.style.display = 'none';
  communicationsHandoff = null;
}

function clearLeadGenerationHandoff() {
  try { localStorage.removeItem(COMM_HANDOFF_KEY); } catch {}
  communicationsHandoff = null;
}

function summarizeCategories(recipients) {
  const counts = new Map();
  for (const r of recipients || []) {
    const key = String(r.category || r.record_type || 'other');
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} (${v})`).join(', ');
}

function initCommsButtons() {
  const campaignsList = document.querySelector('.campaigns-list');
  campaignsList?.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const card = btn.closest('[data-campaign-id]');
    if (!card) return;
    const id = card.getAttribute('data-campaign-id');
    const row = commState.campaigns.find((c) => String(c.id) === String(id));
    if (!row) return;

    const action = btn.getAttribute('data-action');
    if (action === 'view') {
      const message = (row.notes || 'No notes').split('\n').slice(0, 2).join(' | ');
      showToast(`${row.name}: ${message}`);
      return;
    }

    if (action === 'duplicate') {
      await apiJson('/api/communications/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${row.name || 'Campaign'} (Copy)`,
          channel: row.channel || 'email',
          status: 'draft',
          audience_segment: row.audience_segment || 'custom',
          notes: row.notes || '',
          metadata: row.metadata || {},
        }),
      });
      showToast('Campaign duplicated');
      await loadCampaigns();
      return;
    }

    if (action === 'send') {
      await apiJson(`/api/communications/campaigns/${encodeURIComponent(String(id))}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'sent' }),
      });
      showToast('Campaign marked as sent');
      await loadCampaigns();
    }
  });

  document.querySelector('.page-actions .btn-secondary')?.addEventListener('click', () => {
    showToast('Templates are managed through campaign template selection in the New Campaign form.');
  });
}
