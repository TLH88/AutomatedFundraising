/**
 * Funds 4 Furry Friends - Donor Profile JavaScript
 */

let donorProfileState = {
  donor: null,
};

document.addEventListener('DOMContentLoaded', async () => {
  initContactModal();
  initPageActions();
  await loadDonorData();
});

function notify(title, message) {
  if (window.FundsApp?.notify) {
    window.FundsApp.notify(title, message, ['administrator', 'member']);
    return;
  }
  console.log(`${title}: ${message}`);
}

async function apiJson(url, options) {
  if (window.FundsApp?.apiJson) return window.FundsApp.apiJson(url, options);
  const res = await fetch(url, options);
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload?.error || `HTTP ${res.status}`);
  return payload;
}

function initContactModal() {
  const contactBtn = document.getElementById('contactDonorBtn');
  const modal = document.getElementById('contactModal');
  const closeBtn = document.getElementById('closeContactModal');
  const backdrop = modal?.querySelector('.modal-backdrop');
  const smsBtn = document.getElementById('contactSms');

  contactBtn?.addEventListener('click', () => modal?.classList.add('active'));
  closeBtn?.addEventListener('click', () => modal?.classList.remove('active'));
  backdrop?.addEventListener('click', () => modal?.classList.remove('active'));

  smsBtn?.addEventListener('click', (event) => {
    event.preventDefault();
    const name = donorProfileState.donor?.name || 'donor';
    notify('SMS workflow', `Open Communications to send an SMS to ${name}.`);
  });
}

function initPageActions() {
  document.querySelectorAll('.profile-header-right .btn').forEach((btn) => {
    if (btn.dataset.bound === 'true') return;
    btn.dataset.bound = 'true';
    btn.addEventListener('click', (event) => {
      const text = btn.textContent.replace(/\s+/g, ' ').trim().toLowerCase();
      if (text.includes('add note')) {
        event.preventDefault();
        openDonorNoteModal();
      }
      if (text.includes('record donation')) {
        event.preventDefault();
        const donorId = donorProfileState.donor?.id;
        window.location.href = donorId ? `index.html?recordDonationFor=${encodeURIComponent(donorId)}` : 'index.html';
      }
    });
  });

  document.querySelectorAll('.card .card-header .btn').forEach((btn) => {
    if (btn.dataset.bound === 'true') return;
    btn.dataset.bound = 'true';
    btn.addEventListener('click', (event) => {
      const text = btn.textContent.replace(/\s+/g, ' ').trim().toLowerCase();
      if (text === 'edit') {
        event.preventDefault();
        openDonorEditModal();
      }
      if (text.includes('add note')) {
        event.preventDefault();
        openDonorNoteModal();
      }
    });
  });

  document.querySelectorAll('.table tbody .btn').forEach((btn) => {
    if (btn.dataset.bound === 'true') return;
    btn.dataset.bound = 'true';
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      const row = btn.closest('tr');
      const date = row?.children?.[0]?.textContent?.trim() || 'Unknown date';
      const campaign = row?.children?.[1]?.textContent?.trim() || 'Campaign';
      const amount = row?.children?.[2]?.textContent?.trim() || '$0.00';
      downloadReceiptText({ date, campaign, amount });
    });
  });

  const historyFilterButtons = Array.from(document.querySelectorAll('.btn-group .btn-pill'));
  historyFilterButtons.forEach((btn) => {
    if (btn.dataset.bound === 'true') return;
    btn.dataset.bound = 'true';
    btn.addEventListener('click', () => {
      historyFilterButtons.forEach((b) => {
        b.classList.remove('btn-primary');
        b.classList.add('btn-secondary');
      });
      btn.classList.remove('btn-secondary');
      btn.classList.add('btn-primary');
      applyDonationHistoryFilter(btn.textContent.trim().toLowerCase());
    });
  });
}

function downloadReceiptText({ date, campaign, amount }) {
  const blob = new Blob([`Donation Receipt\nDate: ${date}\nCampaign: ${campaign}\nAmount: ${amount}\n`], { type: 'text/plain' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `donation-receipt-${sanitizeFilename(date)}.txt`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
  notify('Receipt downloaded', `Receipt for ${campaign} (${amount}) was downloaded.`);
}

function applyDonationHistoryFilter(mode) {
  const rows = Array.from(document.querySelectorAll('.table tbody tr'));
  const now = new Date();
  rows.forEach((row) => {
    const raw = row.children?.[0]?.textContent?.trim();
    const parsed = raw ? new Date(raw) : null;
    let visible = true;
    if (mode.includes('last year') && parsed && !Number.isNaN(parsed.getTime())) {
      const oneYearAgo = new Date(now);
      oneYearAgo.setFullYear(now.getFullYear() - 1);
      visible = parsed >= oneYearAgo;
    } else if (mode.includes('last 6')) {
      const sixMonthsAgo = new Date(now);
      sixMonthsAgo.setMonth(now.getMonth() - 6);
      visible = parsed && !Number.isNaN(parsed.getTime()) ? parsed >= sixMonthsAgo : false;
    }
    row.style.display = visible ? '' : 'none';
  });
}

async function loadDonorData() {
  const donorId = new URLSearchParams(window.location.search).get('id');
  if (!donorId) {
    notify('Donor profile', 'No donor ID was provided. Showing the sample profile view.');
    return;
  }

  try {
    const response = await fetch(`/api/donors/${encodeURIComponent(donorId)}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const donor = await response.json();
    if (!donor || donor.error) throw new Error(donor?.error || 'Invalid donor payload');
    donorProfileState.donor = donor;
    hydrateDonorProfile(donor);
  } catch (error) {
    console.error('Failed to load donor profile:', error);
    notify('Donor profile load failed', 'Unable to load donor details from the backend. Showing the existing page content.');
  }
}

function hydrateDonorProfile(donor) {
  const name = donor.name || [donor.first_name, donor.last_name].filter(Boolean).join(' ') || 'Donor';
  const email = donor.email || '';
  const phone = donor.phone || '';
  const tier = capitalize(donor.tier || donor.donor_tier || 'friend');
  const donationType = donor.donation_type || donor.donation_type_preference || 'One-time';
  const totalDonated = Number(donor.total_donated || 0);
  const engagementScore = Number(donor.engagement_score || 0);
  const firstDonation = donor.first_donation_date || donor.created_at;
  const lastDonation = donor.last_donation_date;
  const donationHistory = Array.isArray(donor.donation_history) ? donor.donation_history : [];
  const donationCount = Number(donor.donation_count || donationHistory.length || 0);

  document.querySelector('.breadcrumb-current')?.replaceChildren(document.createTextNode(name));
  const profileNameEl = document.querySelector('.profile-name');
  if (profileNameEl) profileNameEl.textContent = name;

  const heroTier = document.querySelector('.donor-tier-badge.hero');
  if (heroTier) {
    heroTier.classList.remove('hero');
    heroTier.classList.add((tier || 'friend').toLowerCase());
    heroTier.innerHTML = `<span>⭐</span>${escapeHtml(tier)}`;
  }

  const avatarImg = document.querySelector('.profile-avatar-large img');
  if (avatarImg) {
    avatarImg.src = donor.avatar_url || window.FundsApp?.generateAnimalAvatarDataUrl?.(`${email}|${name}|donor`) || avatarImg.src;
    avatarImg.alt = name;
  }

  const meta = document.querySelector('.profile-meta');
  if (meta) {
    meta.innerHTML = `
      <span>💚 Donor since ${firstDonation ? formatDate(firstDonation) : 'Unknown'}</span>
      <span>•</span>
      <span>${formatTenure(firstDonation)}</span>
    `;
  }

  const statValues = document.querySelectorAll('.profile-stat-value');
  if (statValues[0]) statValues[0].textContent = formatCurrency(totalDonated);
  if (statValues[1]) statValues[1].textContent = lastDonation ? formatRelativeDate(lastDonation) : 'No donations yet';
  if (statValues[2]) statValues[2].textContent = toTitle(donationType);
  if (statValues[3]) statValues[3].textContent = String(Math.round(engagementScore));

  const statCaptions = document.querySelectorAll('.profile-stat-card .text-muted.text-caption, .profile-stat-card .text-impact.text-caption');
  if (statCaptions[0]) statCaptions[0].textContent = `${donationCount} donation${donationCount === 1 ? '' : 's'}`;
  if (statCaptions[1]) statCaptions[1].textContent = donationHistory[0] ? `${formatCurrency(donationHistory[0].amount || 0)} - ${(donationHistory[0].campaign || 'General')}` : 'No donation history';
  if (statCaptions[2]) statCaptions[2].textContent = donationType ? `${toTitle(donationType)} gift` : 'Donation preference not set';
  if (statCaptions[3]) statCaptions[3].textContent = engagementScore >= 80 ? 'Highly engaged' : engagementScore >= 50 ? 'Moderately engaged' : 'Growing engagement';

  updateContactCard({ donor, name, email, phone });
  updateContactModalLinks({ name, email, phone });
  renderDonationHistoryTable(donationHistory);
}

function updateContactCard({ donor, name, email, phone }) {
  const contactItems = document.querySelectorAll('.contact-info-item');
  contactItems.forEach((item) => {
    const label = item.querySelector('.contact-info-label')?.textContent?.toLowerCase() || '';
    if (label.includes('email')) {
      const link = item.querySelector('a');
      if (link) {
        link.textContent = email || 'Not provided';
        link.href = email ? `mailto:${email}` : '#';
      }
    } else if (label.includes('phone')) {
      const link = item.querySelector('a');
      if (link) {
        link.textContent = phone || 'Not provided';
        link.href = phone ? `tel:${phone}` : '#';
      }
    } else if (label.includes('location')) {
      const val = item.querySelector('.contact-info-value');
      if (val) val.textContent = donor.location || donor.city_state || 'Not provided';
    }
  });
}

function updateContactModalLinks({ name, email, phone }) {
  const title = document.querySelector('#contactModal .modal-title');
  const links = document.querySelectorAll('#contactModal .contact-option-card');
  if (title) title.textContent = `Contact ${name}`;
  const call = links[0];
  const emailLink = links[1];
  if (call) {
    call.href = phone ? `tel:${phone}` : '#';
    call.querySelector('.contact-option-value')?.replaceChildren(document.createTextNode(phone || 'No phone on file'));
  }
  if (emailLink) {
    emailLink.href = email ? `mailto:${email}` : '#';
    emailLink.querySelector('.contact-option-value')?.replaceChildren(document.createTextNode(email || 'No email on file'));
  }
}

function renderDonationHistoryTable(history) {
  if (!Array.isArray(history) || !history.length) return;
  const tbody = document.querySelector('.table tbody');
  if (!tbody) return;
  tbody.innerHTML = history.slice(0, 10).map((d) => `
    <tr>
      <td>${escapeHtml(formatDate(d.date || d.donated_at || d.created_at))}</td>
      <td>${escapeHtml(d.campaign || d.campaign_name || 'General Donation')}</td>
      <td class="text-impact font-semibold numeric">${escapeHtml(formatCurrency(d.amount || 0))}</td>
      <td><span class="badge badge-success">${escapeHtml(toTitle(d.type || d.donation_type || 'Donation'))}</span></td>
      <td><span class="badge badge-success">${escapeHtml(toTitle(d.status || 'Completed'))}</span></td>
      <td><button class="btn btn-secondary btn-pill" type="button">📄 View</button></td>
    </tr>
  `).join('');
  initPageActions();
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || 'Unknown');
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatRelativeDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return formatDate(value);
  const now = new Date();
  const diffDays = Math.floor((now - date) / 86400000);
  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) === 1 ? '' : 's'} ago`;
  return formatDate(value);
}

function formatTenure(firstDonationDate) {
  if (!firstDonationDate) return 'Donor tenure not available';
  const start = new Date(firstDonationDate);
  if (Number.isNaN(start.getTime())) return 'Donor tenure not available';
  const now = new Date();
  let years = now.getFullYear() - start.getFullYear();
  let months = now.getMonth() - start.getMonth();
  if (now.getDate() < start.getDate()) months -= 1;
  if (months < 0) { years -= 1; months += 12; }
  if (years < 0) years = 0;
  if (years === 0 && months === 0) return 'New donor';
  const parts = [];
  if (years > 0) parts.push(`${years} year${years === 1 ? '' : 's'}`);
  if (months > 0) parts.push(`${months} month${months === 1 ? '' : 's'}`);
  return parts.join(', ');
}

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value || 0));
}

function toTitle(value) {
  return String(value || '').replace(/[_-]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

function capitalize(value) {
  const text = String(value || '');
  return text ? text[0].toUpperCase() + text.slice(1) : '';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeFilename(value) {
  return String(value || 'receipt').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
}

function ensureDonorEditModal() {
  if (document.getElementById('donorEditModal')) return;
  const modal = document.createElement('div');
  modal.id = 'donorEditModal';
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-content modal-large">
      <div class="modal-header"><h2 class="modal-title">Edit Donor Profile</h2><button type="button" class="modal-close">×</button></div>
      <div class="modal-body">
        <form id="donorEditForm" class="form">
          <div class="form-row">
            <div class="input-group"><label class="label">Full Name</label><input class="input" name="name" required></div>
            <div class="input-group"><label class="label">Email</label><input class="input" name="email" type="email"></div>
          </div>
          <div class="form-row">
            <div class="input-group"><label class="label">Phone</label><input class="input" name="phone"></div>
            <div class="input-group"><label class="label">Tier</label><select class="select" name="tier"><option value="friend">Friend</option><option value="supporter">Supporter</option><option value="champion">Champion</option><option value="hero">Hero</option></select></div>
          </div>
          <div class="form-row">
            <div class="input-group"><label class="label">Status</label><select class="select" name="status"><option value="active">Active</option><option value="inactive">Inactive</option><option value="lapsed">Lapsed</option></select></div>
            <div class="input-group"><label class="label">Donation Type</label><select class="select" name="donation_type"><option value="">Unspecified</option><option value="one-time">One-time</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="annual">Annual</option></select></div>
          </div>
          <div class="form-row">
            <div class="input-group"><label class="label">Total Donated</label><input class="input" type="number" name="total_donated" min="0" step="0.01"></div>
            <div class="input-group"><label class="label">Engagement Score</label><input class="input" type="number" name="engagement_score" min="0" max="100" step="1"></div>
          </div>
          <div class="input-group"><label class="label">Profile Notes</label><textarea class="textarea" name="notes" rows="4"></textarea></div>
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" data-cancel-donor-edit>Cancel</button>
            <button type="submit" class="btn btn-primary">Save Donor</button>
          </div>
        </form>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.querySelector('.modal-backdrop')?.addEventListener('click', () => modal.classList.remove('active'));
  modal.querySelector('.modal-close')?.addEventListener('click', () => modal.classList.remove('active'));
  modal.querySelector('[data-cancel-donor-edit]')?.addEventListener('click', () => modal.classList.remove('active'));
  modal.querySelector('#donorEditForm')?.addEventListener('submit', submitDonorEdit);
}

function openDonorEditModal() {
  ensureDonorEditModal();
  const donor = donorProfileState.donor;
  if (!donor) return notify('Donor profile', 'Donor data has not loaded yet.');
  const form = document.getElementById('donorEditForm');
  if (!form) return;
  form.name.value = donor.name || '';
  form.email.value = donor.email || '';
  form.phone.value = donor.phone || '';
  form.tier.value = String(donor.tier || 'friend').toLowerCase();
  form.status.value = String(donor.status || 'active').toLowerCase();
  form.donation_type.value = donor.donation_type || '';
  form.total_donated.value = Number(donor.total_donated || 0);
  form.engagement_score.value = Number(donor.engagement_score || 0);
  form.notes.value = donor.notes || '';
  document.getElementById('donorEditModal')?.classList.add('active');
}

async function submitDonorEdit(event) {
  event.preventDefault();
  const donorId = donorProfileState.donor?.id;
  if (!donorId) return notify('Donor save failed', 'Donor ID is missing.');
  const payload = Object.fromEntries(new FormData(event.currentTarget));
  try {
    const result = await apiJson(`/api/donors/${encodeURIComponent(donorId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    donorProfileState.donor = result.donor || donorProfileState.donor;
    hydrateDonorProfile(donorProfileState.donor);
    document.getElementById('donorEditModal')?.classList.remove('active');
    notify('Donor profile saved', 'Changes were saved successfully.');
  } catch (err) {
    console.error(err);
    notify('Donor save failed', err.message || 'Unable to save donor.');
  }
}

function ensureDonorNoteModal() {
  if (document.getElementById('donorNoteModal')) return;
  const modal = document.createElement('div');
  modal.id = 'donorNoteModal';
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-content">
      <div class="modal-header"><h2 class="modal-title">Add Donor Note</h2><button type="button" class="modal-close">×</button></div>
      <div class="modal-body">
        <form id="donorNoteForm" class="form">
          <div class="input-group"><label class="label">Note</label><textarea class="textarea" name="content" rows="5" required></textarea></div>
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" data-cancel-donor-note>Cancel</button>
            <button type="submit" class="btn btn-primary">Save Note</button>
          </div>
        </form>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.querySelector('.modal-backdrop')?.addEventListener('click', () => modal.classList.remove('active'));
  modal.querySelector('.modal-close')?.addEventListener('click', () => modal.classList.remove('active'));
  modal.querySelector('[data-cancel-donor-note]')?.addEventListener('click', () => modal.classList.remove('active'));
  modal.querySelector('#donorNoteForm')?.addEventListener('submit', submitDonorNote);
}

function openDonorNoteModal() {
  ensureDonorNoteModal();
  document.getElementById('donorNoteForm')?.reset();
  document.getElementById('donorNoteModal')?.classList.add('active');
}

async function submitDonorNote(event) {
  event.preventDefault();
  const donorId = donorProfileState.donor?.id;
  if (!donorId) return notify('Donor note failed', 'Donor ID is missing.');
  const payload = Object.fromEntries(new FormData(event.currentTarget));
  try {
    await apiJson(`/api/donors/${encodeURIComponent(donorId)}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    prependNoteToUi(String(payload.content || ''));
    if (donorProfileState.donor) donorProfileState.donor.notes = String(payload.content || donorProfileState.donor.notes || '');
    document.getElementById('donorNoteModal')?.classList.remove('active');
    notify('Donor note saved', 'Note added to donor profile.');
  } catch (err) {
    console.error(err);
    notify('Donor note failed', err.message || 'Unable to save donor note.');
  }
}

function prependNoteToUi(content) {
  const list = document.querySelector('.notes-list');
  if (!list || !content.trim()) return;
  const who = window.FundsApp?.getSession?.()?.name || 'Team Member';
  const item = document.createElement('div');
  item.className = 'note-item';
  item.innerHTML = `
    <div class="note-header">
      <span class="font-semibold">${escapeHtml(who)}</span>
      <span class="text-muted text-caption">Just now</span>
    </div>
    <p class="note-content">${escapeHtml(content)}</p>
  `;
  list.prepend(item);
}
