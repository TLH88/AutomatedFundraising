/**
 * Member profile page controller
 */

const MemberProfilePage = (() => {
  const DEFAULT_ADMIN_EMAIL = 'admin@funds4furry.local';

  const state = {
    memberId: null,
    member: null,
    mode: 'view',
    permissions: {
      isAdmin: false,
      isMember: false,
      isVisitor: true,
      isSelf: false,
      canEdit: false,
      canDelete: false,
    },
  };

  function isPage() {
    return !!document.getElementById('memberProfileForm');
  }

  async function init() {
    if (!isPage()) return;

    if (!window.FundsApp) return;

    const session = window.FundsApp.getSession();
    const role = window.FundsApp.normalizeRole(session?.role);
    if (!session?.loggedIn || role === 'visitor') {
      window.FundsApp.notify('Access restricted', 'Sign in to access team member profiles.', ['visitor']);
      window.location.replace('index.html');
      return;
    }

    bindActions();
    await resolveMemberId();
    if (!state.memberId) {
      window.FundsApp.showToast('Member profile not found');
      window.location.replace('team.html');
      return;
    }

    await loadMember();
  }

  function bindActions() {
    document.getElementById('memberSaveBtn')?.addEventListener('click', onSaveClick);
    document.getElementById('memberDeleteBtn')?.addEventListener('click', onDeleteClick);
    document.getElementById('memberChangePhotoLink')?.addEventListener('click', (e) => {
      e.preventDefault();
      if (!state.permissions.canEdit) {
        window.FundsApp.showToast('View-only profile');
        return;
      }
      document.getElementById('memberPhotoFile')?.click();
    });
    document.getElementById('memberProfileForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      onSaveClick();
    });
    document.getElementById('memberProfileForm')?.addEventListener('input', renderHeaderSummary);
    document.getElementById('memberProfileForm')?.addEventListener('change', renderHeaderSummary);
    document.getElementById('memberPhotoFile')?.addEventListener('change', onPhotoFileChange);
    document.querySelector('#memberProfileForm [name="avatar_url"]')?.addEventListener('input', updateAvatarPreviewFromForm);
  }

  async function resolveMemberId() {
    const params = new URLSearchParams(window.location.search);
    const urlId = params.get('id');
    if (urlId) {
      state.memberId = urlId;
      state.mode = (params.get('mode') || 'view').toLowerCase() === 'edit' ? 'edit' : 'view';
      return;
    }

    const session = window.FundsApp.getSession();
    if (session?.team_member_id) {
      state.memberId = session.team_member_id;
      state.mode = 'edit';
      return;
    }

    if (session?.email) {
      try {
        const res = await apiJson('/api/team?limit=500');
        const match = (res.team || []).find((m) => sameEmail(m.email, session.email));
        if (match?.id) {
          state.memberId = match.id;
          state.mode = 'edit';
        }
      } catch (err) {
        console.error(err);
      }
    }
  }

  async function loadMember() {
    try {
      const res = await apiJson(`/api/team/${encodeURIComponent(state.memberId)}`);
      state.member = normalizeMember(res.member);
      computePermissions();
      render();
    } catch (err) {
      console.error(err);
      window.FundsApp.showToast('Failed to load member profile');
      window.location.replace('team.html');
    }
  }

  function normalizeMember(member) {
    const m = member || {};
    return {
      id: m.id,
      full_name: m.full_name || m.name || 'Team Member',
      email: m.email || '',
      role: String(m.role || 'viewer').toLowerCase(),
      status: String(m.status || 'active').toLowerCase(),
      title: m.title || '',
      avatar_url: m.avatar_url || '',
      joined_at: m.joined_at || null,
      invited_at: m.invited_at || null,
      role_label: m.role_label || (m.role === 'administrator' ? 'Administrator' : m.role === 'editor' ? 'Member' : 'Visitor'),
    };
  }

  function computePermissions() {
    const session = window.FundsApp.getSession();
    const role = window.FundsApp.normalizeRole(session?.role);
    const isAdmin = role === 'administrator';
    const isMember = role === 'member';
    const isVisitor = !session?.loggedIn || role === 'visitor';
    const isSelf = !!state.member && (
      (session?.team_member_id && String(session.team_member_id) === String(state.member.id)) ||
      sameEmail(session?.email, state.member.email)
    );

    state.permissions = {
      isAdmin,
      isMember,
      isVisitor,
      isSelf,
      canEdit: isAdmin || isSelf,
      canDelete: isAdmin && !sameEmail(state.member?.email, DEFAULT_ADMIN_EMAIL) && !isSelf,
    };
  }

  function render() {
    populateForms();
    applyPermissionState();
    renderHeaderSummary();
    updateAvatarPreviewFromForm();
    revealProfileShell();
  }

  function populateForms() {
    const profileForm = document.getElementById('memberProfileForm');
    const accountForm = document.getElementById('memberAccountForm');
    if (!profileForm || !accountForm || !state.member) return;

    profileForm.elements.id.value = state.member.id || '';
    profileForm.elements.full_name.value = state.member.full_name || '';
    profileForm.elements.email.value = state.member.email || '';
    profileForm.elements.role.value = state.member.role || 'viewer';
    profileForm.elements.status.value = state.member.status || 'active';
    profileForm.elements.title.value = state.member.title || '';
    profileForm.elements.avatar_url.value = state.member.avatar_url || '';
    profileForm.elements.joined_at_date.value = toDateInputValue(state.member.joined_at || state.member.invited_at);

    const account = window.FundsApp.findAccountByEmail(state.member.email);
    accountForm.elements.account_email.value = account?.email || state.member.email || '';
    accountForm.elements.account_password.value = '';

    setText('memberProfileHeaderName', state.member.full_name);
  }

  function applyPermissionState() {
    const { canEdit, canDelete, isAdmin, isSelf } = state.permissions;
    const profileForm = document.getElementById('memberProfileForm');
    const accountForm = document.getElementById('memberAccountForm');
    const saveBtn = document.getElementById('memberSaveBtn');
    const deleteBtn = document.getElementById('memberDeleteBtn');
    const modeLabel = document.getElementById('memberProfileModeLabel');

    if (!profileForm || !accountForm) return;

    profileForm.querySelectorAll('input, select, textarea').forEach((el) => {
      if (el.name === 'id') return;
      el.disabled = !canEdit;
    });
    accountForm.querySelectorAll('input, select, textarea').forEach((el) => {
      el.disabled = !canEdit;
    });
    document.getElementById('memberPhotoFile')?.toggleAttribute('disabled', !canEdit);
    const photoLink = document.getElementById('memberChangePhotoLink');
    if (photoLink) {
      photoLink.setAttribute('aria-disabled', canEdit ? 'false' : 'true');
      photoLink.style.opacity = canEdit ? '1' : '0.6';
      photoLink.style.pointerEvents = canEdit ? 'auto' : 'none';
    }

    if (!isAdmin) {
      const roleField = profileForm.elements.role;
      const statusField = profileForm.elements.status;
      if (roleField) roleField.disabled = true;
      if (statusField) statusField.disabled = true;
    }

    if (sameEmail(state.member?.email, DEFAULT_ADMIN_EMAIL)) {
      profileForm.elements.email.disabled = true;
      accountForm.elements.account_email.disabled = true;
      if (modeLabel) {
        modeLabel.textContent = 'Default administrator email is fixed. Password can be changed on Settings.';
      }
    } else if (!canEdit) {
      if (modeLabel) modeLabel.textContent = 'View-only profile. Only administrators can edit other members.';
    } else if (isSelf && !isAdmin) {
      if (modeLabel) modeLabel.textContent = 'You can edit your own profile. Role and status are administrator-managed.';
    } else if (isAdmin) {
      if (modeLabel) modeLabel.textContent = 'Administrator mode: you can edit this member profile and access settings.';
    }

    if (saveBtn) {
      saveBtn.disabled = !canEdit;
      saveBtn.textContent = canEdit ? 'Save Profile' : 'View Only';
    }
    if (deleteBtn) {
      deleteBtn.disabled = !canDelete;
      deleteBtn.style.display = isAdmin ? '' : 'none';
      if (!canDelete && isAdmin) {
        deleteBtn.title = isSelf
          ? 'Sign in as another administrator to remove this account.'
          : (sameEmail(state.member?.email, DEFAULT_ADMIN_EMAIL) ? 'Default administrator cannot be removed.' : 'Remove unavailable');
      }
    }

    if (state.mode === 'edit' && canEdit) {
      profileForm.querySelector('input[name="full_name"]')?.focus();
    }
  }

  function renderHeaderSummary() {
    if (!state.member) return;
    const profileForm = document.getElementById('memberProfileForm');
    const fullName = profileForm?.elements.full_name?.value || state.member.full_name || 'Team Member';
    const role = profileForm?.elements.role?.value || state.member.role || 'viewer';
    const status = profileForm?.elements.status?.value || state.member.status || 'active';
    const joined = profileForm?.elements.joined_at_date?.value || toDateInputValue(state.member.joined_at || state.member.invited_at);
    const email = profileForm?.elements.email?.value || state.member.email || '';

    const roleLabel = role === 'administrator' ? 'Administrator' : role === 'editor' ? 'Member' : 'Visitor';
    const statusLabel = capitalize(status);
    const tenureLabel = formatMemberTenure(joined);
    applyProfileTheme(role);

    setText('memberProfileHeaderName', fullName);
    setText('memberProfileRolePill', roleLabel);
    setText('memberProfileStatusPill', statusLabel);
    setText('memberProfileSubtitle', email || 'View and manage team member information');
    setText('memberProfileStatRole', roleLabel);
    setText('memberProfileStatStatus', statusLabel);
    setText('memberProfileStatJoined', tenureLabel);
  }

  function applyProfileTheme(role) {
    const shell = document.querySelector('.member-profile-shell');
    if (!shell) return;
    shell.classList.remove('profile-theme-loading', 'profile-theme-admin', 'profile-theme-member', 'profile-theme-visitor');
    const r = String(role || '').toLowerCase();
    if (r === 'administrator') {
      shell.classList.add('profile-theme-admin');
      return;
    }
    if (r === 'editor') {
      shell.classList.add('profile-theme-member');
      return;
    }
    shell.classList.add('profile-theme-visitor');
  }

  function revealProfileShell() {
    const shell = document.getElementById('memberProfileShell');
    if (!shell) return;
    shell.classList.remove('is-profile-pending');
  }

  async function onSaveClick() {
    if (!state.permissions.canEdit) {
      window.FundsApp.showToast('View-only profile');
      return;
    }

    const profileForm = document.getElementById('memberProfileForm');
    const accountForm = document.getElementById('memberAccountForm');
    if (!profileForm || !accountForm) return;

    const profileData = Object.fromEntries(new FormData(profileForm));
    const accountData = Object.fromEntries(new FormData(accountForm));

    if (sameEmail(state.member?.email, DEFAULT_ADMIN_EMAIL) && !sameEmail(profileData.email, DEFAULT_ADMIN_EMAIL)) {
      window.FundsApp.showToast('Default admin email cannot be changed');
      profileForm.elements.email.value = DEFAULT_ADMIN_EMAIL;
      return;
    }

    const updatePayload = {
      full_name: profileData.full_name,
      email: profileData.email,
      title: profileData.title || null,
      avatar_url: profileData.avatar_url || null,
      joined_at: profileData.joined_at_date ? `${profileData.joined_at_date}T00:00:00+00:00` : null,
    };

    if (state.permissions.isAdmin) {
      updatePayload.role = profileData.role;
      updatePayload.status = profileData.status;
    }

    const saveBtn = document.getElementById('memberSaveBtn');
    const originalText = saveBtn?.textContent || 'Save Profile';
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';
    }

    try {
      const res = await apiJson(`/api/team/${encodeURIComponent(state.member.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatePayload),
      });

      const updatedMember = normalizeMember(res.member);
      const previousEmail = state.member.email;
      state.member = updatedMember;

      syncLocalAccountAfterSave(previousEmail, updatedMember, accountData.account_email, accountData.account_password);
      maybeUpdateCurrentSession(updatedMember);
      computePermissions();
      render();

      window.FundsApp.notify('Profile saved', `${updatedMember.full_name} was updated.`, ['administrator', 'member']);
    } catch (err) {
      console.error(err);
      window.FundsApp.showToast('Failed to save member profile');
    } finally {
      if (saveBtn) {
        saveBtn.disabled = !state.permissions.canEdit;
        saveBtn.textContent = state.permissions.canEdit ? originalText : 'View Only';
      }
    }
  }

  async function onDeleteClick() {
    if (!state.permissions.canDelete) {
      window.FundsApp.showToast('Remove is not available for this member');
      return;
    }
    if (!window.confirm(`Disable ${state.member.full_name}? This preserves records and blocks sign-in access.`)) {
      return;
    }

    const deleteBtn = document.getElementById('memberDeleteBtn');
    const originalText = deleteBtn?.textContent || 'Remove Member';
    if (deleteBtn) {
      deleteBtn.disabled = true;
      deleteBtn.textContent = 'Removing...';
    }

    try {
      await apiJson(`/api/team/${encodeURIComponent(state.member.id)}`, { method: 'DELETE' });
      if (state.member.email) {
        const acct = window.FundsApp.findAccountByEmail(state.member.email);
        if (acct) window.FundsApp.upsertLocalAccount({ ...acct, status: 'disabled' });
      }
      window.FundsApp.notify('Member disabled', `${state.member.full_name} was disabled.`, ['administrator']);
      window.location.href = 'team.html';
    } catch (err) {
      console.error(err);
      window.FundsApp.showToast('Failed to remove member');
      if (deleteBtn) {
        deleteBtn.disabled = false;
        deleteBtn.textContent = originalText;
      }
    }
  }

  function syncLocalAccountAfterSave(previousEmail, member, accountEmailInput, newPasswordInput) {
    const prevEmail = String(previousEmail || '').trim().toLowerCase();
    const desiredAccountEmail = String(accountEmailInput || member.email || '').trim().toLowerCase();
    const nextPassword = String(newPasswordInput || '');

    let existing = window.FundsApp.findAccountByEmail(prevEmail) || window.FundsApp.findAccountByEmail(member.email);
    if (!existing && desiredAccountEmail) {
      existing = window.FundsApp.findAccountByEmail(desiredAccountEmail);
    }

    if (!existing && !desiredAccountEmail) return;

    const merged = {
      ...(existing || {}),
      full_name: member.full_name,
      email: desiredAccountEmail || member.email,
      role: member.role === 'editor' ? 'member' : member.role,
      status: member.status,
      title: member.title || null,
      avatar_url: member.avatar_url || '',
      team_member_id: member.id,
    };
    if (nextPassword) merged.password = nextPassword;

    if (existing && prevEmail && merged.email && prevEmail !== merged.email && !existing.is_default_admin) {
      window.FundsApp.removeLocalAccountByEmail(prevEmail);
    }
    window.FundsApp.upsertLocalAccount(merged);
  }

  function maybeUpdateCurrentSession(member) {
    const session = window.FundsApp.getSession();
    if (!session?.loggedIn) return;
    const isCurrent = (session.team_member_id && String(session.team_member_id) === String(member.id)) || sameEmail(session.email, member.email);
    if (!isCurrent) return;

    window.FundsApp.setSession({
      ...session,
      name: member.full_name,
      email: member.email,
      title: member.title || null,
      avatar_url: member.avatar_url || '',
      team_member_id: member.id,
      role: member.role === 'editor' ? 'member' : member.role,
    });
  }

  async function onPhotoFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await fileToDataUrl(file);
      const field = document.querySelector('#memberProfileForm [name="avatar_url"]');
      if (field) {
        field.value = dataUrl;
        updateAvatarPreviewFromForm();
      }
      window.FundsApp.showToast('Profile photo added');
    } catch (err) {
      console.error(err);
      window.FundsApp.showToast('Failed to read profile photo');
    }
  }

  function updateAvatarPreviewFromForm() {
    const container = document.getElementById('memberAvatarPreview');
    const profileForm = document.getElementById('memberProfileForm');
    if (!container || !profileForm) return;

    const name = profileForm.elements.full_name?.value || state.member?.full_name || 'Team Member';
    const avatarUrl = profileForm.elements.avatar_url?.value || '';
    container.innerHTML = avatarUrl
      ? `<img src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(name)}">`
      : `<div class="avatar avatar-md avatar-placeholder">${escapeHtml(initials(name))}</div>`;
    renderHeaderSummary();
  }

  function toDateInputValue(value) {
    if (!value) return '';
    const text = String(value);
    return text.length >= 10 ? text.slice(0, 10) : '';
  }

  function formatMemberTenure(joinedDateValue) {
    if (!joinedDateValue) return '-';
    const start = new Date(joinedDateValue);
    if (Number.isNaN(start.getTime())) return '-';

    const now = new Date();
    let years = now.getFullYear() - start.getFullYear();
    let months = now.getMonth() - start.getMonth();
    if (now.getDate() < start.getDate()) months -= 1;
    if (months < 0) {
      years -= 1;
      months += 12;
    }
    if (years < 0) years = 0;
    if (months < 0) months = 0;

    return `${years} Year${years === 1 ? '' : 's'} ${months} Month${months === 1 ? '' : 's'}`;
  }

  function sameEmail(a, b) {
    return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
  }

  async function apiJson(url, options) {
    const res = await fetch(url, options);
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const body = await res.json();
        if (body?.error) detail = body.error;
      } catch {}
      throw new Error(detail);
    }
    return res.json();
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function initials(name) {
    return String(name || '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() || '')
      .join('') || 'TM';
  }

  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = String(text || '');
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
  MemberProfilePage.init();
});
