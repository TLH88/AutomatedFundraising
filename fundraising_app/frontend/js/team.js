/**
 * Team Management page controller
 */

const TeamPage = (() => {
  const TEAM_DISABLED_IDS_KEY = 'funds_team_disabled_ids';
  const state = {
    members: [],
    showDisabled: false,
    search: '',
    roleFilter: 'all',
    statusFilter: 'all',
    disabledIds: new Set(),
  };

  function isTeamPage() {
    return !!document.getElementById('teamList');
  }

  async function apiJson(url, options) {
    const res = await fetch(url, options);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async function init() {
    if (!isTeamPage()) return;
    state.disabledIds = loadDisabledIds();
    ensureFiltersBar();
    ensureAccessRequestsPanel();
    bindActions();
    ensureDefaultAdminMember();
    await loadMembers();
    ensureNewMemberModal();
  }

  function bindActions() {
    document.getElementById('inviteMemberBtn')?.addEventListener('click', () => openModal('inviteModal'));
    document.getElementById('newMemberBtn')?.addEventListener('click', () => openModal('newMemberModal'));

    const inviteForm = document.getElementById('inviteMemberForm');
    inviteForm?.addEventListener('submit', submitInviteForm);

    document.getElementById('teamShowDisabledToggle')?.addEventListener('change', (e) => {
      state.showDisabled = !!e.target.checked;
      renderStats();
      renderMembers();
    });
    document.getElementById('teamMemberSearch')?.addEventListener('input', (e) => {
      state.search = String(e.target.value || '').trim().toLowerCase();
      renderStats();
      renderMembers();
    });
    document.getElementById('teamRoleFilter')?.addEventListener('change', (e) => {
      state.roleFilter = String(e.target.value || 'all');
      renderStats();
      renderMembers();
    });
    document.getElementById('teamStatusFilter')?.addEventListener('change', (e) => {
      state.statusFilter = String(e.target.value || 'all');
      renderStats();
      renderMembers();
    });
    document.getElementById('teamResetFiltersBtn')?.addEventListener('click', () => {
      state.search = '';
      state.roleFilter = 'all';
      state.statusFilter = 'all';
      const searchEl = document.getElementById('teamMemberSearch');
      const roleEl = document.getElementById('teamRoleFilter');
      const statusEl = document.getElementById('teamStatusFilter');
      if (searchEl) searchEl.value = '';
      if (roleEl) roleEl.value = 'all';
      if (statusEl) statusEl.value = 'all';
      renderStats();
      renderMembers();
    });
    document.getElementById('reenablePriorUsersBtn')?.addEventListener('click', () => {
      if (!canAdminister()) return;
      ensureReenablePriorUsersModal();
      renderReenablePriorUsersList();
      openModal('reenablePriorUsersModal');
    });
    document.getElementById('teamAccessRequestsPanel')?.addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-request-action]');
      if (!btn) return;
      const requestId = btn.dataset.requestId;
      const action = btn.dataset.requestAction;
      if (!requestId || !action) return;
      if (action === 'approve') {
        await approveSignupRequest(requestId);
      } else if (action === 'reject') {
        await rejectSignupRequest(requestId);
      }
    });

    document.getElementById('teamList')?.addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const memberId = btn.dataset.memberId;
      const action = btn.dataset.action;
      if (!memberId) return;

      if (action === 'view') {
        window.location.href = `member-profile.html?id=${encodeURIComponent(memberId)}`;
        return;
      }
      if (action === 'edit') {
        window.location.href = `member-profile.html?id=${encodeURIComponent(memberId)}&mode=edit`;
        return;
      }
      if (action === 'remove') {
        await removeMember(memberId);
        return;
      }
      if (action === 'reenable') {
        await reenableMember(memberId);
      }
    });

  }

  function ensureReenablePriorUsersModal() {
    if (document.getElementById('reenablePriorUsersModal')) return;
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'reenablePriorUsersModal';
    modal.innerHTML = `
      <div class="modal-backdrop"></div>
      <div class="modal-content modal-large">
        <div class="modal-header">
          <h2 class="modal-title">Re-enable Prior Users</h2>
          <button class="modal-close" type="button">×</button>
        </div>
        <div class="modal-body">
          <div class="input-group">
            <label class="input-label">Search by Name or Email</label>
            <input class="input" id="reenablePriorUsersSearch" placeholder="Search disabled accounts...">
          </div>
          <div id="reenablePriorUsersResults"></div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('.modal-backdrop')?.addEventListener('click', () => closeModal('reenablePriorUsersModal'));
    modal.querySelector('.modal-close')?.addEventListener('click', () => closeModal('reenablePriorUsersModal'));
    modal.querySelector('#reenablePriorUsersSearch')?.addEventListener('input', () => renderReenablePriorUsersList());
    modal.addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-reenable-member-id]');
      if (!btn) return;
      await reenableMember(btn.dataset.reenableMemberId);
      renderReenablePriorUsersList();
    });
  }

  function ensureFiltersBar() {
    if (document.getElementById('teamFiltersBar')) return;
    const statsGrid = document.querySelector('.team-stats-grid');
    if (!statsGrid) return;
    const bar = document.createElement('div');
    bar.id = 'teamFiltersBar';
    bar.className = 'card';
    bar.style.marginBottom = 'var(--spacing-lg)';
    bar.innerHTML = `
      <div class="card-body" style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;padding:14px 18px;">
        <div style="flex:1;min-width:300px;">
          <p class="text-muted text-caption" style="margin:0;">Disabled accounts are hidden by default. Member removal disables access but preserves records.</p>
          <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:10px;">
            <input class="input" id="teamMemberSearch" placeholder="Search by name or email..." style="min-width:220px;max-width:320px;">
            <select class="select" id="teamRoleFilter" style="max-width:180px;">
              <option value="all">All Roles</option>
              <option value="administrator">Administrator</option>
              <option value="editor">Member</option>
              <option value="viewer">Visitor</option>
            </select>
            <select class="select" id="teamStatusFilter" style="max-width:180px;">
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="invited">Invited</option>
              <option value="inactive">Inactive</option>
              <option value="disabled">Disabled</option>
            </select>
            <button type="button" class="btn btn-secondary btn-pill" id="teamResetFiltersBtn">Reset</button>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
          <button type="button" class="btn btn-secondary btn-pill" id="reenablePriorUsersBtn">Re-enable Prior Users</button>
          <label class="checkbox-label" style="margin:0;display:flex;align-items:center;gap:8px;">
            <input type="checkbox" id="teamShowDisabledToggle">
            <span>Show Disabled Accounts</span>
          </label>
        </div>
      </div>
    `;
    statsGrid.insertAdjacentElement('beforebegin', bar);
    if (!canAdminister()) {
      const toggle = bar.querySelector('#teamShowDisabledToggle');
      const reenableBtn = bar.querySelector('#reenablePriorUsersBtn');
      if (toggle) {
        toggle.disabled = true;
        toggle.closest('label')?.setAttribute('title', 'Only administrators can view disabled accounts.');
      }
      if (reenableBtn) reenableBtn.style.display = 'none';
    }
  }

  function ensureAccessRequestsPanel() {
    if (document.getElementById('teamAccessRequestsPanel')) return;
    const teamList = document.getElementById('teamList');
    if (!teamList) return;
    const panel = document.createElement('div');
    panel.id = 'teamAccessRequestsPanel';
    panel.className = 'card';
    panel.style.marginBottom = 'var(--spacing-lg)';
    panel.innerHTML = `
      <div class="card-header">
        <h2 class="card-title">Access Requests</h2>
        <span class="badge badge-info" id="teamAccessRequestCount">0 Pending</span>
      </div>
      <div class="card-body" id="teamAccessRequestsList">
        <p class="text-muted" style="margin:0;">No pending requests.</p>
      </div>
    `;
    teamList.insertAdjacentElement('beforebegin', panel);
  }

  function getCurrentSession() {
    return window.FundsApp?.getSession?.() || { role: 'visitor', loggedIn: false };
  }

  function currentRole() {
    return window.FundsApp?.normalizeRole?.(getCurrentSession().role) || 'visitor';
  }

  function canAdminister() {
    return currentRole() === 'administrator';
  }

  async function ensureDefaultAdminMember() {
    try {
      const admin = window.FundsApp.getDefaultAdminAccount();
      const teamRes = await apiJson('/api/team?limit=500');
      const exists = (teamRes.team || []).some((m) => String(m.email || '').toLowerCase() === admin.email.toLowerCase());
      if (exists) return;
      const created = await apiJson('/api/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'member',
          full_name: admin.full_name,
          email: admin.email,
          role: 'administrator',
          status: 'active',
          title: admin.title || 'System Administrator',
        }),
      });
      const member = created.member;
      if (member?.id) {
        window.FundsApp.upsertLocalAccount({ ...admin, team_member_id: member.id });
      }
    } catch (err) {
      console.warn('Unable to ensure default admin member record', err);
    }
  }

  async function loadMembers() {
    const res = await apiJson('/api/team?limit=500');
    syncDisabledIdsFromLocalAccounts(res.team || []);
    state.members = (res.team || []).map(normalizeMember);
    syncLocalAccountsFromTeam();
    renderStats();
    renderAccessRequests();
    renderMembers();
  }

  function syncDisabledIdsFromLocalAccounts(teamRows) {
    const localAccounts = window.FundsApp?.getAccounts?.() || [];
    let changed = false;
    (teamRows || []).forEach((row) => {
      const backendStatus = String(row?.status || '').toLowerCase();
      const email = String(row?.email || '').toLowerCase();
      if (!email || backendStatus !== 'inactive') return;
      const acct = localAccounts.find((a) => String(a.email || '').toLowerCase() === email);
      if (String(acct?.status || '').toLowerCase() === 'disabled') {
        const id = String(row?.id || '');
        if (id && !state.disabledIds.has(id)) {
          state.disabledIds.add(id);
          changed = true;
        }
      }
    });
    if (changed) saveDisabledIds(state.disabledIds);
  }

  function normalizeMember(member) {
    const rawStatus = String(member.status || 'active').toLowerCase();
    const memberId = String(member.id || '');
    const uiStatus = rawStatus === 'inactive' && state.disabledIds.has(memberId) ? 'disabled' : rawStatus;
    return {
      id: member.id,
      full_name: member.full_name || member.name || 'Team Member',
      email: member.email || '',
      role: String(member.role || 'viewer').toLowerCase(),
      role_label: member.role_label || (member.role === 'administrator' ? 'Administrator' : member.role === 'editor' ? 'Member' : 'Visitor'),
      status: uiStatus,
      backend_status: rawStatus,
      title: member.title || '',
      avatar_url: member.avatar_url || '',
      joined_at: member.joined_at || null,
      invited_at: member.invited_at || null,
    };
  }

  function syncLocalAccountsFromTeam() {
    const existingAccounts = window.FundsApp.getAccounts();
    state.members.forEach((m) => {
      const acct = existingAccounts.find((a) => a.email === String(m.email).toLowerCase());
      if (acct) {
        window.FundsApp.upsertLocalAccount({
          ...acct,
          full_name: m.full_name,
          role: m.role === 'editor' ? 'member' : m.role,
          avatar_url: m.avatar_url || acct.avatar_url,
          team_member_id: m.id,
          status: m.status,
          title: m.title || acct.title,
        });
      }
    });
  }

  function renderStats() {
    const visibleMembers = getVisibleMembers();
    const total = visibleMembers.length;
    const active = visibleMembers.filter((m) => m.status === 'active').length;
    const invited = visibleMembers.filter((m) => m.status === 'invited').length;
    const admins = state.members.filter((m) => m.role === 'administrator').length;
    setText('teamStatTotal', total);
    setText('teamStatActive', active);
    setText('teamStatInvited', invited);
    setText('teamStatAdmins', admins);
  }

  function renderMembers() {
    const list = document.getElementById('teamList');
    if (!list) return;
    const visible = getVisibleMembers();
    list.innerHTML = visible.length
      ? visible.map(renderMemberCard).join('')
      : `<div class="card"><div class="card-body"><p class="text-muted" style="margin:0;">No team members match the current filter.</p></div></div>`;
  }

  function renderAccessRequests() {
    const panel = document.getElementById('teamAccessRequestsPanel');
    const countEl = document.getElementById('teamAccessRequestCount');
    const listEl = document.getElementById('teamAccessRequestsList');
    if (!panel || !countEl || !listEl) return;

    if (!canAdminister()) {
      panel.style.display = 'none';
      return;
    }
    panel.style.display = '';

    const requests = (window.FundsApp.getSignupRequests?.() || []).filter((r) => r.status === 'pending');
    countEl.textContent = `${requests.length} Pending`;
    countEl.className = `badge ${requests.length ? 'badge-urgent' : 'badge-info'}`;

    if (!requests.length) {
      listEl.innerHTML = '<p class="text-muted" style="margin:0;">No pending access requests.</p>';
      return;
    }

    listEl.innerHTML = requests.map((r) => `
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;padding:12px 0;border-bottom:1px solid var(--table-divider);">
        <div style="min-width:0;">
          <p style="margin:0;color:var(--text-primary);font-weight:600;">${escapeHtml(r.full_name || 'Unknown')}</p>
          <p class="text-muted text-caption" style="margin:4px 0 0;">${escapeHtml(r.email)} • ${escapeHtml(capitalize(r.requested_role))}${r.title ? ` • ${escapeHtml(r.title)}` : ''}</p>
          ${r.reason ? `<p class="text-muted text-caption" style="margin:6px 0 0;">${escapeHtml(r.reason)}</p>` : ''}
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-secondary btn-pill" type="button" data-request-action="reject" data-request-id="${escapeHtml(r.id)}">Reject</button>
          <button class="btn btn-primary btn-pill" type="button" data-request-action="approve" data-request-id="${escapeHtml(r.id)}">Approve</button>
        </div>
      </div>
    `).join('');
  }

  function getVisibleMembers() {
    let rows = state.members.slice();
    if (!(state.showDisabled && canAdminister())) {
      rows = rows.filter((m) => m.status !== 'disabled');
    }
    if (state.search) {
      rows = rows.filter((m) =>
        String(m.full_name || '').toLowerCase().includes(state.search) ||
        String(m.email || '').toLowerCase().includes(state.search)
      );
    }
    if (state.roleFilter !== 'all') {
      rows = rows.filter((m) => m.role === state.roleFilter);
    }
    if (state.statusFilter !== 'all') {
      rows = rows.filter((m) => m.status === state.statusFilter);
    }
    return rows;
  }

  function renderMemberCard(m) {
    const roleClass = m.role === 'administrator' ? 'admin' : m.role === 'editor' ? 'editor' : 'viewer';
    const canRemoveMember = canAdminister() && String(m.email).toLowerCase() !== 'admin@funds4furry.local';
    const isDisabled = m.status === 'disabled';
    const editButtonHtml = canAdminister()
      ? `<button class="btn btn-sm btn-secondary" data-action="edit" data-member-id="${escapeHtml(m.id)}" ${isDisabled ? 'disabled title="Re-enable this account before editing"' : ''}>Edit</button>`
      : '';
    const removeButtonHtml = canAdminister()
      ? (isDisabled
        ? `<button class="btn btn-sm btn-secondary" data-action="reenable" data-member-id="${escapeHtml(m.id)}">Re-enable</button>`
        : `<button class="btn btn-sm btn-secondary" data-action="remove" data-member-id="${escapeHtml(m.id)}" ${canRemoveMember ? '' : 'disabled title="Default admin account cannot be disabled"'}>Disable</button>`)
      : '';
    return `
      <div class="team-member-card">
        <div class="team-member-avatar">${m.avatar_url ? `<img src="${escapeHtml(m.avatar_url)}" alt="${escapeHtml(m.full_name)}">` : `<div class="avatar avatar-md avatar-placeholder">${escapeHtml(initials(m.full_name))}</div>`}</div>
        <div class="team-member-info">
          <h3 class="team-member-name">${escapeHtml(m.full_name)}</h3>
          <p class="team-member-email">${escapeHtml(m.email)}</p>
          ${m.title ? `<p class="team-member-email">${escapeHtml(m.title)}</p>` : ''}
        </div>
        <div class="team-member-role"><span class="role-badge ${roleClass}">${escapeHtml(m.role_label)}</span></div>
        <div class="team-member-status"><span class="status-badge ${escapeHtml(m.status)}">${escapeHtml(capitalize(m.status))}</span></div>
        <div class="team-member-actions">
          <button class="btn btn-sm btn-secondary" data-action="view" data-member-id="${escapeHtml(m.id)}">View</button>
          ${editButtonHtml}
          ${removeButtonHtml}
        </div>
      </div>
    `;
  }

  async function submitInviteForm(e) {
    e.preventDefault();
    if (!canAdminister()) {
      window.FundsApp.notify('Permission denied', 'Only administrators can invite members.', ['member', 'visitor']);
      return;
    }
    const data = Object.fromEntries(new FormData(e.target));
    try {
      await apiJson('/api/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: data.full_name,
          email: data.email,
          title: data.title || null,
          role: data.role || 'viewer',
          status: 'invited',
        }),
      });
      window.FundsApp.notify('Invitation sent', `Invitation queued for ${data.email}.`, ['administrator']);
      e.target.reset();
      closeModal('inviteModal');
      await loadMembers();
    } catch (err) {
      console.error(err);
      window.FundsApp.showToast('Failed to send invite');
    }
  }

  function ensureNewMemberModal() {
    if (document.getElementById('newMemberModal')) return;
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'newMemberModal';
    modal.innerHTML = `
      <div class="modal-backdrop"></div>
      <div class="modal-content modal-large">
        <div class="modal-header"><h2 class="modal-title">Create New Member</h2><button class="modal-close" type="button">×</button></div>
        <div class="modal-body">
          <form id="newMemberForm" class="form">
            <div class="form-row">
              <div class="input-group"><label class="input-label">Full Name *</label><input class="input" name="full_name" required></div>
              <div class="input-group"><label class="input-label">Email *</label><input class="input" type="email" name="email" required></div>
            </div>
            <div class="form-row">
              <div class="input-group"><label class="input-label">Role *</label><select class="select" name="role"><option value="editor">Member</option><option value="viewer">Visitor</option><option value="administrator">Administrator</option></select></div>
              <div class="input-group"><label class="input-label">Title</label><input class="input" name="title" placeholder="Coordinator"></div>
            </div>
            <div class="form-row">
              <div class="input-group"><label class="input-label">Initial Password *</label><input class="input" type="password" name="password" value="Member" required></div>
              <div class="input-group"><label class="input-label">Profile Photo URL</label><input class="input" type="url" name="avatar_url" placeholder="https://..."></div>
            </div>
            <div class="input-group">
              <label class="input-label">Or Upload Profile Photo</label>
              <input class="input" type="file" id="newMemberPhotoFile" accept="image/*">
            </div>
            <div class="modal-actions">
              <button type="button" class="btn btn-secondary" data-close-new-member>Cancel</button>
              <button type="submit" class="btn btn-primary">Save Member</button>
            </div>
          </form>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('.modal-backdrop')?.addEventListener('click', () => closeModal('newMemberModal'));
    modal.querySelector('.modal-close')?.addEventListener('click', () => closeModal('newMemberModal'));
    modal.querySelector('[data-close-new-member]')?.addEventListener('click', () => closeModal('newMemberModal'));
    modal.querySelector('#newMemberPhotoFile')?.addEventListener('change', onNewMemberPhotoFile);
    modal.querySelector('#newMemberForm')?.addEventListener('submit', submitNewMemberForm);
  }

  async function onNewMemberPhotoFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    const form = document.getElementById('newMemberForm');
    if (form?.avatar_url) form.avatar_url.value = dataUrl;
    window.FundsApp.showToast('Profile photo added');
  }

  async function submitNewMemberForm(e) {
    e.preventDefault();
    if (!canAdminister()) {
      window.FundsApp.notify('Permission denied', 'Only administrators can create members.', ['member', 'visitor']);
      return;
    }
    const data = Object.fromEntries(new FormData(e.target));
    try {
      const createdRes = await apiJson('/api/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'member',
          full_name: data.full_name,
          email: data.email,
          role: data.role,
          status: 'active',
          title: data.title || null,
          avatar_url: data.avatar_url || null,
        }),
      });
      const member = createdRes.member;
      window.FundsApp.upsertLocalAccount({
        full_name: data.full_name,
        email: data.email,
        password: data.password || 'Member',
        role: data.role === 'editor' ? 'member' : data.role,
        status: 'active',
        title: data.title || null,
        avatar_url: data.avatar_url || '',
        team_member_id: member?.id || null,
      });
      window.FundsApp.notify('Member created', `${data.full_name} has been added.`, ['administrator']);
      e.target.reset();
      closeModal('newMemberModal');
      await loadMembers();
    } catch (err) {
      console.error(err);
      window.FundsApp.showToast('Failed to create member');
    }
  }

  async function removeMember(memberId) {
    if (!canAdminister()) {
      window.FundsApp.notify('Permission denied', 'Only administrators can remove members.', ['member', 'visitor']);
      return;
    }
    const member = state.members.find((m) => m.id === memberId);
    if (!member) return;
    if (String(member.email).toLowerCase() === 'admin@funds4furry.local') {
      window.FundsApp.showToast('Default admin cannot be removed');
      return;
    }
    if (!window.confirm(`Disable ${member.full_name}? This will preserve records but block sign-in access.`)) return;
    try {
      await apiJson(`/api/team/${encodeURIComponent(memberId)}`, { method: 'DELETE' });
      state.disabledIds.add(String(memberId));
      saveDisabledIds(state.disabledIds);
      const acct = member.email ? window.FundsApp.findAccountByEmail(member.email) : null;
      if (acct) {
        window.FundsApp.upsertLocalAccount({ ...acct, status: 'disabled' });
      }
      window.FundsApp.notify('Member disabled', `${member.full_name} was disabled.`, ['administrator']);
      await loadMembers();
    } catch (err) {
      console.error(err);
      window.FundsApp.showToast('Failed to remove member');
    }
  }

  async function reenableMember(memberId) {
    if (!canAdminister()) {
      window.FundsApp.notify('Permission denied', 'Only administrators can re-enable members.', ['member', 'visitor']);
      return;
    }
    const member = state.members.find((m) => m.id === memberId);
    if (!member) return;
    try {
      await apiJson(`/api/team/${encodeURIComponent(memberId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'active' }),
      });
      state.disabledIds.delete(String(memberId));
      saveDisabledIds(state.disabledIds);
      const acct = member.email ? window.FundsApp.findAccountByEmail(member.email) : null;
      if (acct) {
        window.FundsApp.upsertLocalAccount({ ...acct, status: 'active' });
      }
      window.FundsApp.notify('Member re-enabled', `${member.full_name} can sign in again.`, ['administrator']);
      await loadMembers();
    } catch (err) {
      console.error(err);
      window.FundsApp.showToast('Failed to re-enable member');
    }
  }

  function renderReenablePriorUsersList() {
    const container = document.getElementById('reenablePriorUsersResults');
    const search = String(document.getElementById('reenablePriorUsersSearch')?.value || '').trim().toLowerCase();
    if (!container) return;
    const disabledMembers = state.members.filter((m) => m.status === 'disabled');
    const matches = !search ? disabledMembers : disabledMembers.filter((m) =>
      String(m.full_name || '').toLowerCase().includes(search) ||
      String(m.email || '').toLowerCase().includes(search)
    );
    if (!matches.length) {
      container.innerHTML = '<p class="text-muted" style="margin:0;">No disabled accounts match your search.</p>';
      return;
    }
    container.innerHTML = matches.map((m) => `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--table-divider);">
        <div style="min-width:0;">
          <p style="margin:0;color:var(--text-primary);font-weight:600;">${escapeHtml(m.full_name)}</p>
          <p class="text-muted text-caption" style="margin:4px 0 0;">${escapeHtml(m.email)} • ${escapeHtml(m.role_label)}</p>
        </div>
        <button type="button" class="btn btn-primary btn-pill" data-reenable-member-id="${escapeHtml(m.id)}">Re-enable</button>
      </div>
    `).join('');
  }

  function loadDisabledIds() {
    try {
      const parsed = JSON.parse(localStorage.getItem(TEAM_DISABLED_IDS_KEY) || '[]');
      if (Array.isArray(parsed)) return new Set(parsed.map((id) => String(id)));
    } catch {}
    return new Set();
  }

  function saveDisabledIds(ids) {
    localStorage.setItem(TEAM_DISABLED_IDS_KEY, JSON.stringify(Array.from(ids)));
  }

  async function approveSignupRequest(requestId) {
    if (!canAdminister()) return;
    const request = (window.FundsApp.getSignupRequests?.() || []).find((r) => r.id === requestId && r.status === 'pending');
    if (!request) {
      window.FundsApp.showToast('Request not found');
      renderAccessRequests();
      return;
    }
    if (window.FundsApp.findAccountByEmail(request.email)) {
      window.FundsApp.reviewSignupRequest?.(requestId, 'reject', { decision_note: 'Duplicate account exists' });
      window.FundsApp.showToast('Request rejected: account already exists');
      renderAccessRequests();
      return;
    }
    if (state.members.some((m) => String(m.email).toLowerCase() === String(request.email).toLowerCase())) {
      window.FundsApp.reviewSignupRequest?.(requestId, 'reject', { decision_note: 'Duplicate team member exists' });
      window.FundsApp.showToast('Request rejected: team member already exists');
      renderAccessRequests();
      return;
    }

    const backendRole = request.requested_role === 'member' ? 'editor' : 'viewer';
    try {
      const createdRes = await apiJson('/api/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'member',
          full_name: request.full_name,
          email: request.email,
          role: backendRole,
          status: 'active',
          title: request.title || null,
        }),
      });
      const member = createdRes.member;
      window.FundsApp.upsertLocalAccount({
        full_name: request.full_name,
        email: request.email,
        password: request.password,
        role: request.requested_role,
        status: 'active',
        title: request.title || null,
        team_member_id: member?.id || null,
      });
      window.FundsApp.reviewSignupRequest?.(requestId, 'approve');
      window.FundsApp.notify('Signup request approved', `${request.full_name} has been granted access.`, ['administrator']);
      await loadMembers();
    } catch (err) {
      console.error(err);
      window.FundsApp.showToast('Failed to approve request');
    }
  }

  async function rejectSignupRequest(requestId) {
    if (!canAdminister()) return;
    const request = (window.FundsApp.getSignupRequests?.() || []).find((r) => r.id === requestId && r.status === 'pending');
    if (!request) {
      renderAccessRequests();
      return;
    }
    if (!window.confirm(`Reject access request from ${request.full_name || request.email}?`)) return;
    window.FundsApp.reviewSignupRequest?.(requestId, 'reject');
    window.FundsApp.notify('Signup request rejected', `${request.email} was rejected.`, ['administrator']);
    renderAccessRequests();
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = String(value);
  }

  function openModal(id) {
    document.getElementById(id)?.classList.add('active');
  }

  function closeModal(id) {
    window.FundsApp.closeModal(id);
  }

  function initials(name) {
    return String(name || '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0].toUpperCase())
      .join('') || 'TM';
  }

  function capitalize(v) {
    const s = String(v || '');
    return s ? s[0].toUpperCase() + s.slice(1) : '';
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => {
  TeamPage.init();
});
