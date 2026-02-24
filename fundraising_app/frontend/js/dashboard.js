/**
 * Dashboard page controller (index.html)
 */

const DashboardPage = (() => {
  const state = {
    donations: [],
    donationFilter: 'all',
    donors: [],
    campaigns: [],
    updates: [],
    donationDraft: null,
  };

  function isDashboardPage() {
    return !!document.getElementById('recentDonationsTableBody');
  }

  async function apiJson(url, options) {
    const res = await fetch(url, options);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async function init() {
    if (!isDashboardPage()) return;
    bindStaticActions();
    hydrateWelcomeGreeting();
    await loadDashboardData();
  }

  function bindStaticActions() {
    const filterGroup = document.getElementById('recentDonationsFilters');
    filterGroup?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-donation-filter]');
      if (!btn) return;
      state.donationFilter = btn.dataset.donationFilter || 'all';
      filterGroup.querySelectorAll('[data-donation-filter]').forEach((b) => {
        b.classList.toggle('btn-primary', b === btn);
        b.classList.toggle('btn-secondary', b !== btn);
      });
      renderRecentDonations();
    });

    const activeCampaignsViewAll = document.getElementById('activeCampaignsViewAllLink');
    if (activeCampaignsViewAll) {
      activeCampaignsViewAll.href = 'campaigns.html?status=all';
    }
  }

  async function loadDashboardData() {
    try {
      const [donationsRes, updatesRes, donorsRes, campaignsRes, totalRes, impactRes, statsRes, activeRes] = await Promise.all([
        apiJson('/api/donations/recent?limit=20'),
        apiJson('/api/updates/recent'),
        apiJson('/api/donors?limit=200'),
        apiJson('/api/campaigns?limit=200'),
        apiJson('/api/fundraising/total'),
        apiJson('/api/impact/monthly'),
        apiJson('/api/stats/overview'),
        apiJson('/api/campaigns/active'),
      ]);
      state.donations = donationsRes.donations || [];
      state.updates = updatesRes.updates || [];
      state.donors = donorsRes.donors || [];
      state.campaigns = campaignsRes.campaigns || [];

      renderRecentDonations();
      renderRecentUpdates();
      hydrateSummaryCards(totalRes, impactRes, statsRes, activeRes);
      ensureRecordDonationModal();
    } catch (error) {
      console.error('Dashboard load error', error);
      window.FundsApp?.showToast?.('Some dashboard data failed to load');
    }
  }

  function hydrateSummaryCards(total, impact, stats, active) {
    const welcomeTotal = document.querySelector('.welcome-center .stat-value');
    if (welcomeTotal && total?.total != null) welcomeTotal.textContent = window.FundsApp.formatCurrency(total.total);

    const animalsHelped = document.querySelector('.welcome-center .text-impact');
    if (animalsHelped && total?.animals_helped != null) animalsHelped.textContent = `${total.animals_helped} Animals Helped This Month`;

    const monthlyImpactValue = document.querySelector('.impact-header + .card-body .stat-value');
    if (monthlyImpactValue && impact?.amount != null) monthlyImpactValue.textContent = window.FundsApp.formatCurrency(impact.amount);

    const miniCards = document.querySelectorAll('.mini-card');
    miniCards.forEach((card) => {
      const label = card.querySelector('.stat-label')?.textContent?.trim();
      const valueEl = card.querySelector('.stat-value');
      if (!label || !valueEl) return;
      if (label === 'Active Campaigns' && active?.campaigns) {
        valueEl.textContent = String(active.campaigns.length);
      }
      if (label === 'Donor Retention' && stats?.donor_retention != null) {
        valueEl.textContent = `${stats.donor_retention}%`;
      }
      if (label === 'Upcoming Events' && stats?.upcoming_events != null) {
        valueEl.textContent = String(stats.upcoming_events);
      }
    });
  }

  function hydrateWelcomeGreeting() {
    const el = document.querySelector('.welcome-greeting');
    if (!el) return;
    const session = window.FundsApp?.getSession?.() || { loggedIn: false, name: 'Visitor' };
    if (!session.loggedIn || !session.name || String(session.name).toLowerCase() === 'visitor') {
      el.textContent = 'Welcome back!';
      return;
    }
    const firstName = String(session.name).trim().split(/\s+/)[0] || 'Friend';
    el.textContent = `Welcome back, ${firstName}`;
  }

  function getFilteredDonations() {
    switch (state.donationFilter) {
      case 'one-time':
        return state.donations.filter((d) => String(d.type || '').toLowerCase().includes('one-time'));
      case 'recurring':
        return state.donations.filter((d) => !!d.recurring);
      case 'major':
        return state.donations.filter((d) => !!d.major_gift || Number(d.amount || 0) >= 1000);
      case 'all':
      default:
        return state.donations;
    }
  }

  function renderRecentDonations() {
    const tbody = document.getElementById('recentDonationsTableBody');
    if (!tbody) return;
    const rows = getFilteredDonations().slice(0, 10);
    tbody.innerHTML = rows.length ? rows.map(renderDonationRow).join('') : `
      <tr><td colspan="5" class="text-muted">No donations match this filter.</td></tr>
    `;
  }

  function renderDonationRow(d) {
    const donor = escapeHtml(d.donor || 'Anonymous');
    const campaign = escapeHtml(d.campaign || 'General Fund');
    const category = String(d.category || 'general').toLowerCase();
    const badgeClass = categoryBadgeClass(category);
    const amountLabel = window.FundsApp.formatCurrency(Number(d.amount || 0)) + (d.major_gift ? ' ⭐' : '');
    const typeLabel = escapeHtml(d.type || 'One-time');
    const typeBadge = /monthly|quarterly|annual/i.test(typeLabel) ? 'badge-success' : 'badge-info';
    const dateText = escapeHtml(formatDashboardDate(d.date));
    const initials = initialsFromName(donor);
    return `
      <tr>
        <td>
          <div class="flex gap-md" style="align-items: center;">
            <div class="avatar avatar-sm avatar-placeholder">${escapeHtml(initials)}</div>
            <div>
              <div class="font-semibold">${donor}</div>
              <div class="text-muted text-caption">${d.recurring ? '❤ Recurring Donor' : 'Donor'}</div>
            </div>
          </div>
        </td>
        <td>
          <div class="flex gap-sm" style="align-items: center;">
            <span class="badge ${badgeClass}">${escapeHtml(categoryEmoji(category))} ${escapeHtml(capitalize(category))}</span>
            <span>${campaign}</span>
          </div>
        </td>
        <td class="text-impact font-semibold numeric">${escapeHtml(amountLabel)}</td>
        <td class="text-secondary">${dateText}</td>
        <td><span class="badge ${typeBadge}">${typeLabel}</span></td>
      </tr>
    `;
  }

  function renderRecentUpdates() {
    const list = document.getElementById('recentUpdatesList');
    if (!list) return;
    list.innerHTML = state.updates.slice(0, 6).map((u, idx) => `
      ${idx ? '<div class="divider"></div>' : ''}
      <button type="button" class="news-item" data-update-open="${escapeHtml(String(u.id || idx))}" style="width:100%;text-align:left;background:none;">
        <div class="news-image" style="background:${updateGradient(u.icon)}; border-radius:8px; width:60px; height:60px; flex-shrink:0; display:flex; align-items:center; justify-content:center; font-size:24px;">
          ${updateIcon(u.icon)}
        </div>
        <div class="news-content">
          <h4 class="news-title">${escapeHtml(u.title || 'Update')}</h4>
          <p class="news-meta text-muted">
            <span class="badge ${updateBadgeClass(u.category)}" style="margin-right: 8px;">${escapeHtml(u.category || 'Update')}</span>
            <span>${escapeHtml(u.time || '')}</span>
          </p>
        </div>
      </button>
    `).join('');

    list.querySelectorAll('[data-update-open]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.updateOpen;
        const update = state.updates.find((u) => String(u.id) === id);
        if (update) openUpdateModal(update);
      });
    });
  }

  function ensureRecordDonationModal() {
    if (document.getElementById('recordDonationModal')) return;
    const modal = document.createElement('div');
    modal.id = 'recordDonationModal';
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-backdrop"></div>
      <div class="modal-content modal-large">
        <div class="modal-header">
          <h2 class="modal-title">Record Donation</h2>
          <button type="button" class="modal-close">×</button>
        </div>
        <div class="modal-body">
          <form id="recordDonationForm" class="form">
            <div class="form-row">
              <div class="input-group">
                <label class="input-label">Donor</label>
                <select class="select" name="donor_id" id="recordDonationDonorSelect"></select>
              </div>
              <div class="input-group">
                <label class="input-label">Campaign</label>
                <select class="select" name="campaign_id" id="recordDonationCampaignSelect"></select>
              </div>
            </div>
            <div class="form-row">
              <div class="input-group">
                <label class="input-label">Donor Name (match or new)</label>
                <input class="input" name="donor_name_input" id="recordDonationDonorNameInput" placeholder="Jane Doe">
              </div>
              <div class="input-group">
                <label class="input-label">Donor Email (optional)</label>
                <input class="input" name="donor_email_input" id="recordDonationDonorEmailInput" type="email" placeholder="jane@example.org">
              </div>
            </div>
            <div class="flex gap-sm" style="margin-top:-8px; margin-bottom:16px; align-items:center;">
              <button type="button" class="btn btn-secondary btn-pill" id="matchDonorBtn">Match Donor</button>
              <button type="button" class="btn btn-secondary btn-pill" id="addDonorFromDonationBtn" data-write-action="true">Add New Donor</button>
              <span class="text-muted text-caption" id="donorMatchStatus">Select an existing donor, or enter donor info and match/add.</span>
            </div>
            <div class="form-row">
              <div class="input-group">
                <label class="input-label">Amount</label>
                <input class="input" name="amount" type="number" step="0.01" min="1" required placeholder="100.00">
              </div>
              <div class="input-group">
                <label class="input-label">Donation Type</label>
                <select class="select" name="donation_type">
                  <option value="one-time">One-time</option>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="annual">Annual</option>
                  <option value="pledge">Pledge</option>
                </select>
              </div>
            </div>
            <div class="form-row">
              <div class="input-group">
                <label class="input-label">Source</label>
                <select class="select" name="source">
                  <option value="manual">Manual</option>
                  <option value="website">Website</option>
                  <option value="event">Event</option>
                  <option value="phone">Phone</option>
                  <option value="check">Check</option>
                  <option value="cash">Cash</option>
                </select>
              </div>
              <div class="input-group">
                <label class="input-label">Date & Time</label>
                <input class="input" name="donation_date" type="datetime-local">
              </div>
            </div>
            <div class="input-group">
              <label class="input-label">Notes</label>
              <textarea class="textarea" name="notes" placeholder="Optional notes..."></textarea>
            </div>
            <div class="modal-actions">
              <button type="button" class="btn btn-secondary" data-close-modal>Cancel</button>
              <button type="submit" class="btn btn-primary" data-allow-visitor-write="false">Save Donation</button>
            </div>
          </form>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('.modal-backdrop')?.addEventListener('click', () => window.FundsApp.closeModal('recordDonationModal'));
    modal.querySelector('.modal-close')?.addEventListener('click', () => window.FundsApp.closeModal('recordDonationModal'));
    modal.querySelector('[data-close-modal]')?.addEventListener('click', () => window.FundsApp.closeModal('recordDonationModal'));
    modal.querySelector('#recordDonationForm')?.addEventListener('submit', submitDonationForm);
    modal.querySelector('#recordDonationDonorSelect')?.addEventListener('change', syncDonorInputsFromSelection);
    modal.querySelector('#matchDonorBtn')?.addEventListener('click', handleDonorMatchClick);
    modal.querySelector('#addDonorFromDonationBtn')?.addEventListener('click', () => {
      state.donationDraft = captureDonationFormDraft();
      openAddDonorFromDonationModal();
    });

    renderDonationModalOptions();
  }

  function renderDonationModalOptions() {
    const donorSelect = document.getElementById('recordDonationDonorSelect');
    const campaignSelect = document.getElementById('recordDonationCampaignSelect');
    if (donorSelect) {
      const donorOptions = state.donors.map((d) => `<option value="${escapeHtml(String(d.id))}">${escapeHtml(d.name || 'Unknown Donor')}</option>`).join('');
      donorSelect.innerHTML = `
        <option value="">Anonymous / Not Linked</option>
        ${state.donors.length ? '<option value="__linked__" disabled>Linked to Donor</option>' : ''}
        ${donorOptions}
      `;
    }
    if (campaignSelect) {
      campaignSelect.innerHTML = `
        <option value="">General Fund / Not Linked</option>
        ${state.campaigns.map((c) => `<option value="${escapeHtml(String(c.id))}">${escapeHtml(c.name || 'Untitled Campaign')}</option>`).join('')}
      `;
    }
    const dtInput = document.querySelector('#recordDonationForm [name="donation_date"]');
    if (dtInput && !dtInput.value) {
      dtInput.value = toDatetimeLocal(new Date());
    }
    syncDonorInputsFromSelection();
    updateDonorMatchStatus();
  }

  async function submitDonationForm(e) {
    e.preventDefault();
    const form = e.target;
    state.donationDraft = captureDonationFormDraft();
    const data = Object.fromEntries(new FormData(form));
    let donor = state.donors.find((d) => String(d.id) === String(data.donor_id));
    const donorNameInput = String(data.donor_name_input || '').trim();
    const donorEmailInput = String(data.donor_email_input || '').trim();

    if (!donor && (donorNameInput || donorEmailInput)) {
      donor = findMatchingDonor(donorNameInput, donorEmailInput);
      if (donor) {
        setDonationDonorSelection(String(donor.id));
      } else {
        window.FundsApp.notify('Donor not found', 'No donor record matched the entered donor information.');
        const shouldAdd = window.confirm('No matching donor was found. Would you like to add this donor now?');
        if (shouldAdd) {
          openAddDonorFromDonationModal({ name: donorNameInput, email: donorEmailInput });
        }
        return;
      }
    }

    const campaign = state.campaigns.find((c) => String(c.id) === String(data.campaign_id));
    const payload = {
      donor_id: donor?.id || data.donor_id || null,
      campaign_id: data.campaign_id || null,
      donor_name: donor?.name || donorNameInput || null,
      campaign_name: campaign?.name || null,
      category: campaign?.category || 'general',
      amount: Number(data.amount || 0),
      donation_type: data.donation_type || 'one-time',
      source: data.source || 'manual',
      donation_date: data.donation_date ? new Date(data.donation_date).toISOString() : new Date().toISOString(),
      notes: data.notes || null,
    };

    try {
      const res = await apiJson('/api/donations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res?.donation) {
        state.donations.unshift(res.donation);
        renderRecentDonations();
      } else {
        await refreshRecentDonations();
      }
      window.FundsApp.closeModal('recordDonationModal');
      form.reset();
      state.donationDraft = null;
      renderDonationModalOptions();
      window.FundsApp.notify('Donation recorded', `${window.FundsApp.formatCurrency(payload.amount)} saved successfully.`);
    } catch (error) {
      console.error('Donation save failed', error);
      window.FundsApp.showToast('Failed to save donation');
    }
  }

  async function refreshRecentDonations() {
    const res = await apiJson('/api/donations/recent?limit=20');
    state.donations = res.donations || [];
    renderRecentDonations();
  }

  function openRecordDonationModal() {
    ensureRecordDonationModal();
    renderDonationModalOptions();
    if (state.donationDraft) {
      restoreDonationFormDraft(state.donationDraft);
    }
    document.getElementById('recordDonationModal')?.classList.add('active');
  }

  function captureDonationFormDraft() {
    const form = document.getElementById('recordDonationForm');
    if (!form) return null;
    const draft = Object.fromEntries(new FormData(form));
    draft.__capturedAt = new Date().toISOString();
    return draft;
  }

  function restoreDonationFormDraft(draft) {
    const form = document.getElementById('recordDonationForm');
    if (!form || !draft) return;
    Object.entries(draft).forEach(([key, value]) => {
      if (key.startsWith('__')) return;
      const field = form.elements.namedItem(key);
      if (!field) return;
      field.value = value ?? '';
    });
    syncDonorInputsFromSelection();
    updateDonorMatchStatus();
  }

  function findMatchingDonor(nameInput, emailInput) {
    const email = String(emailInput || '').trim().toLowerCase();
    const name = normalizeName(nameInput);
    if (email) {
      const byEmail = state.donors.find((d) => String(d.email || '').trim().toLowerCase() === email);
      if (byEmail) return byEmail;
    }
    if (name) {
      const exact = state.donors.find((d) => normalizeName(d.name) === name);
      if (exact) return exact;
      const partial = state.donors.find((d) => normalizeName(d.name).includes(name) || name.includes(normalizeName(d.name)));
      if (partial) return partial;
    }
    return null;
  }

  function handleDonorMatchClick() {
    const nameInput = document.getElementById('recordDonationDonorNameInput')?.value || '';
    const emailInput = document.getElementById('recordDonationDonorEmailInput')?.value || '';
    const donor = findMatchingDonor(nameInput, emailInput);
    if (!donor) {
      updateDonorMatchStatus('No donor match found. You can add this donor.', true);
      window.FundsApp.notify('Donor not found', 'No donor matched the entered name/email.');
      return;
    }
    setDonationDonorSelection(String(donor.id));
    applyMatchedDonorToInputs(donor);
    updateDonorMatchStatus(`Matched donor: ${donor.name}`, false);
    window.FundsApp.notify('Donor matched', `${donor.name} selected for this donation.`);
  }

  function setDonationDonorSelection(donorId) {
    const donorSelect = document.getElementById('recordDonationDonorSelect');
    if (!donorSelect) return;
    donorSelect.value = donorId || '';
    syncDonorInputsFromSelection();
  }

  function syncDonorInputsFromSelection() {
    const donorSelect = document.getElementById('recordDonationDonorSelect');
    const donorNameInput = document.getElementById('recordDonationDonorNameInput');
    const donorEmailInput = document.getElementById('recordDonationDonorEmailInput');
    if (!donorSelect || !donorNameInput || !donorEmailInput) return;
    const donor = state.donors.find((d) => String(d.id) === String(donorSelect.value));
    if (donor) {
      applyMatchedDonorToInputs(donor);
      updateDonorMatchStatus(`Linked to donor record: ${donor.name}`, false);
    } else if (!donorSelect.value) {
      if (!donorNameInput.value && !donorEmailInput.value) {
        updateDonorMatchStatus('Anonymous / not linked donation. Enter donor info to match or add.', false);
      }
    }
  }

  function applyMatchedDonorToInputs(donor) {
    const donorNameInput = document.getElementById('recordDonationDonorNameInput');
    const donorEmailInput = document.getElementById('recordDonationDonorEmailInput');
    if (donorNameInput) donorNameInput.value = donor?.name || '';
    if (donorEmailInput) donorEmailInput.value = donor?.email || '';
  }

  function updateDonorMatchStatus(text, isWarning = false) {
    const el = document.getElementById('donorMatchStatus');
    if (!el) return;
    if (text) el.textContent = text;
    el.classList.toggle('text-urgent', !!isWarning);
    el.classList.toggle('text-muted', !isWarning);
  }

  function ensureAddDonorFromDonationModal() {
    if (document.getElementById('addDonorFromDonationModal')) return;
    const modal = document.createElement('div');
    modal.id = 'addDonorFromDonationModal';
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-backdrop"></div>
      <div class="modal-content">
        <div class="modal-header">
          <h2 class="modal-title">Add Donor</h2>
          <button type="button" class="modal-close">×</button>
        </div>
        <div class="modal-body">
          <form id="addDonorFromDonationForm" class="form">
            <div class="input-group">
              <label class="input-label">Full Name *</label>
              <input class="input" name="full_name" required placeholder="Jane Doe">
            </div>
            <div class="input-group">
              <label class="input-label">Email</label>
              <input class="input" type="email" name="email" placeholder="jane@example.org">
            </div>
            <div class="input-group">
              <label class="input-label">Phone</label>
              <input class="input" name="phone" placeholder="(555) 555-5555">
            </div>
            <div class="input-group">
              <label class="input-label">Tier</label>
              <select class="select" name="tier">
                <option value="friend">Friend</option>
                <option value="supporter">Supporter</option>
                <option value="champion">Champion</option>
                <option value="hero">Hero</option>
              </select>
            </div>
            <div class="input-group">
              <label class="input-label">Notes</label>
              <textarea class="textarea" name="notes" placeholder="Optional donor notes..."></textarea>
            </div>
            <div class="modal-actions">
              <button type="button" class="btn btn-secondary" data-close-add-donor>Cancel</button>
              <button type="submit" class="btn btn-primary">Save Donor</button>
            </div>
          </form>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('.modal-backdrop')?.addEventListener('click', closeAddDonorModalAndReturn);
    modal.querySelector('.modal-close')?.addEventListener('click', closeAddDonorModalAndReturn);
    modal.querySelector('[data-close-add-donor]')?.addEventListener('click', closeAddDonorModalAndReturn);
    modal.querySelector('#addDonorFromDonationForm')?.addEventListener('submit', submitAddDonorFromDonation);
  }

  function openAddDonorFromDonationModal(prefill = null) {
    ensureAddDonorFromDonationModal();
    const donationModal = document.getElementById('recordDonationModal');
    const addModal = document.getElementById('addDonorFromDonationModal');
    const form = document.getElementById('addDonorFromDonationForm');
    if (form) {
      form.reset();
      const draft = state.donationDraft || {};
      form.full_name.value = prefill?.name || draft.donor_name_input || '';
      form.email.value = prefill?.email || draft.donor_email_input || '';
    }
    donationModal?.classList.remove('active');
    addModal?.classList.add('active');
  }

  function closeAddDonorModalAndReturn() {
    window.FundsApp.closeModal('addDonorFromDonationModal');
    openRecordDonationModal();
  }

  async function submitAddDonorFromDonation(e) {
    e.preventDefault();
    const form = e.target;
    const payload = Object.fromEntries(new FormData(form));
    try {
      const res = await apiJson('/api/donors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      await refreshDonors();
      const created = res.donor || findMatchingDonor(payload.full_name, payload.email);
      if (created?.id) {
        if (!state.donationDraft) state.donationDraft = captureDonationFormDraft();
        state.donationDraft.donor_id = String(created.id);
        state.donationDraft.donor_name_input = created.name || payload.full_name || '';
        state.donationDraft.donor_email_input = created.email || payload.email || '';
      }
      window.FundsApp.notify('Donor added', `${payload.full_name} has been added.`);
      window.FundsApp.closeModal('addDonorFromDonationModal');
      openRecordDonationModal();
      if (created?.id) {
        setDonationDonorSelection(String(created.id));
      }
      updateDonorMatchStatus(`Linked to donor record: ${created?.name || payload.full_name}`, false);
    } catch (error) {
      console.error('Failed to add donor from donation flow', error);
      window.FundsApp.showToast('Unable to add donor');
    }
  }

  async function refreshDonors() {
    const donorsRes = await apiJson('/api/donors?limit=500');
    state.donors = donorsRes.donors || [];
    renderDonationModalOptions();
  }

  function openUpdateModal(update) {
    let modal = document.getElementById('dashboardUpdateModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'dashboardUpdateModal';
      modal.className = 'modal';
      modal.innerHTML = `
        <div class="modal-backdrop"></div>
        <div class="modal-content">
          <div class="modal-header">
            <h2 class="modal-title">Update Details</h2>
            <button type="button" class="modal-close">×</button>
          </div>
          <div class="modal-body" id="dashboardUpdateModalBody"></div>
        </div>
      `;
      document.body.appendChild(modal);
      modal.querySelector('.modal-backdrop')?.addEventListener('click', () => window.FundsApp.closeModal('dashboardUpdateModal'));
      modal.querySelector('.modal-close')?.addEventListener('click', () => window.FundsApp.closeModal('dashboardUpdateModal'));
    }

    const body = document.getElementById('dashboardUpdateModalBody');
    if (body) {
      const page = update.page || pageForUpdateCategory(update.category);
      body.innerHTML = `
        <p class="text-muted">Category: <strong class="text-primary">${escapeHtml(update.category || 'Update')}</strong></p>
        <p class="text-primary" style="font-size:var(--text-h3); font-weight:600;">${escapeHtml(update.title || 'Update')}</p>
        <p>${escapeHtml(update.summary || 'No additional details available yet.')}</p>
        <p class="text-muted">Time: ${escapeHtml(update.time || '')}</p>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" data-close-update>Close</button>
          <a class="btn btn-primary" href="${escapeHtml(page)}">Open Related Page</a>
        </div>
      `;
      body.querySelector('[data-close-update]')?.addEventListener('click', () => window.FundsApp.closeModal('dashboardUpdateModal'));
    }
    modal.classList.add('active');
  }

  function pageForUpdateCategory(category) {
    const key = String(category || '').toLowerCase();
    if (key.includes('story')) return 'stories.html';
    if (key.includes('event')) return 'events.html';
    return 'analytics.html';
  }

  function updateGradient(icon) {
    if (icon === 'event') return 'linear-gradient(135deg, #F59E0B, #D97706)';
    if (icon === 'milestone') return 'linear-gradient(135deg, #3B82F6, #2563EB)';
    return 'linear-gradient(135deg, #10B981, #059669)';
  }

  function updateIcon(icon) {
    if (icon === 'event') return '📅';
    if (icon === 'milestone') return '🏆';
    return '🎉';
  }

  function updateBadgeClass(category) {
    const key = String(category || '').toLowerCase();
    if (key.includes('event')) return 'badge-urgent';
    if (key.includes('milestone')) return 'badge-info';
    return 'badge-success';
  }

  function categoryEmoji(category) {
    if (category.includes('dog')) return '🐶';
    if (category.includes('cat')) return '🐱';
    if (category.includes('shelter')) return '🏠';
    if (category.includes('medical')) return '🏥';
    return '💚';
  }

  function categoryBadgeClass(category) {
    if (category.includes('dog')) return 'badge-dogs';
    if (category.includes('cat')) return 'badge-cats';
    if (category.includes('shelter')) return 'badge-shelter';
    if (category.includes('medical')) return 'badge-medical';
    return 'badge-info';
  }

  function initialsFromName(name) {
    return String(name || 'A')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0].toUpperCase())
      .join('');
  }

  function formatDashboardDate(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return window.FundsApp.formatRelativeTime(date);
  }

  function toDatetimeLocal(d) {
    const date = new Date(d);
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date.toISOString().slice(0, 16);
  }

  function capitalize(v) {
    const s = String(v || '');
    return s ? s[0].toUpperCase() + s.slice(1) : '';
  }

  function normalizeName(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  return { init, openRecordDonationModal };
})();

document.addEventListener('DOMContentLoaded', () => {
  DashboardPage.init();
});

window.DashboardPage = DashboardPage;
