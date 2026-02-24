/**
 * Funds 4 Furry Friends - Shared App Shell / Global UI Behaviors
 */

const APP_KEYS = {
  theme: 'funds_theme',
  session: 'funds_session',
  notifications: 'funds_notifications',
  accounts: 'funds_accounts',
  signupRequests: 'funds_signup_requests',
  primaryColor: 'funds_primary_color',
  brandLogo: 'funds_brand_logo',
  brandName: 'funds_brand_name',
};

const DEFAULT_NOTIFICATIONS = [
  { id: 'n1', title: 'Welcome to Funds 4 Furry Friends', body: 'Dashboard is ready for review.', createdAt: new Date().toISOString(), read: false, audiences: ['all'] },
  { id: 'n2', title: 'CRM Mode Enabled', body: 'Supabase-backed dashboard APIs are active.', createdAt: new Date().toISOString(), read: false, audiences: ['administrator', 'member'] },
];

document.addEventListener('DOMContentLoaded', () => {
  initAppShell();
  initSidebarToggle();
  initSearchFunctionality();
  initAnimations();
  initTooltips();
  initProgressBars();
  initNotifications();
  initGlobalButtons();
});

function initAppShell() {
  applySavedPrimaryThemeColor();
  applySavedBrandLogo();
  applySavedBrandName();
  ensureTheme();
  ensureAccounts();
  ensureSession();
  removeMessagesControl();
  injectHeaderControls();
  applyRoleAccessRestrictions();
  enforceReadOnlyMode();
}

function ensureTheme() {
  const savedTheme = localStorage.getItem(APP_KEYS.theme) || document.documentElement.getAttribute('data-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
}

function getSavedPrimaryThemeColor() {
  return localStorage.getItem(APP_KEYS.primaryColor) || '';
}

function setPrimaryThemeColor(color) {
  const normalized = normalizeHexColor(color);
  if (!normalized) return { ok: false, error: 'Invalid color value.' };
  localStorage.setItem(APP_KEYS.primaryColor, normalized);
  applyPrimaryThemeColor(normalized);
  return { ok: true, color: normalized };
}

function resetPrimaryThemeColor() {
  localStorage.removeItem(APP_KEYS.primaryColor);
  clearPrimaryThemeColorOverride();
  return { ok: true };
}

function applySavedPrimaryThemeColor() {
  const saved = getSavedPrimaryThemeColor();
  if (saved) applyPrimaryThemeColor(saved);
}

function applyPrimaryThemeColor(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return;
  const root = document.documentElement;
  const light = adjustRgb(rgb, 0.18);
  const dark = adjustRgb(rgb, -0.24);
  const glowStrong = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.30)`;
  const glowSoft = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.12)`;
  const tint05 = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.05)`;
  const tint08 = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.08)`;
  const tint10 = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.10)`;
  const tint15 = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.15)`;
  const tint20 = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.20)`;
  const tint30 = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.30)`;
  root.style.setProperty('--accent-green', rgbToHex(rgb));
  root.style.setProperty('--accent-green-rgb', `${rgb.r}, ${rgb.g}, ${rgb.b}`);
  root.style.setProperty('--accent-green-light', rgbToHex(light));
  root.style.setProperty('--accent-green-dark', rgbToHex(dark));
  root.style.setProperty('--accent-green-glow', glowStrong);
  root.style.setProperty('--text-impact', rgbToHex(rgb));
  root.style.setProperty('--color-success', rgbToHex(rgb));
  root.style.setProperty('--primary-tint-05', tint05);
  root.style.setProperty('--primary-tint-08', tint08);
  root.style.setProperty('--primary-tint-10', tint10);
  root.style.setProperty('--primary-tint-15', tint15);
  root.style.setProperty('--primary-tint-20', tint20);
  root.style.setProperty('--primary-tint-30', tint30);
  root.style.setProperty('--sidebar-active-glow', glowStrong);
  root.style.setProperty('--shadow-button', `0 8px 24px rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.30), 0 4px 12px rgba(0, 0, 0, 0.60)`);
  root.style.setProperty('--shadow-sidebar-active', `0 0 20px ${glowSoft}, inset 0 0 20px ${glowSoft}`);
  root.style.setProperty('--progress-fill', `linear-gradient(90deg, ${rgbToHex(rgb)}, ${rgbToHex(light)})`);
  root.style.setProperty('--chart-line-color', rgbToHex(rgb));
  root.style.setProperty('--chart-fill-gradient', `linear-gradient(180deg, ${tint30}, transparent)`);
  root.style.setProperty('--category-shelter', rgbToHex(rgb));
  applyDynamicThemeSurfaceAccent({ tint05, tint08, tint10, tint15, tint20, tint30, glowSoft });
  emitPrimaryColorChange();
}

function clearPrimaryThemeColorOverride() {
  const root = document.documentElement;
  root.style.removeProperty('--accent-green');
  root.style.removeProperty('--accent-green-rgb');
  root.style.removeProperty('--accent-green-light');
  root.style.removeProperty('--accent-green-dark');
  root.style.removeProperty('--accent-green-glow');
  root.style.removeProperty('--text-impact');
  root.style.removeProperty('--color-success');
  root.style.removeProperty('--primary-tint-05');
  root.style.removeProperty('--primary-tint-08');
  root.style.removeProperty('--primary-tint-10');
  root.style.removeProperty('--primary-tint-15');
  root.style.removeProperty('--primary-tint-20');
  root.style.removeProperty('--primary-tint-30');
  root.style.removeProperty('--sidebar-active-glow');
  root.style.removeProperty('--shadow-button');
  root.style.removeProperty('--shadow-sidebar-active');
  root.style.removeProperty('--progress-fill');
  root.style.removeProperty('--chart-line-color');
  root.style.removeProperty('--chart-fill-gradient');
  root.style.removeProperty('--category-shelter');
  applyDynamicThemeSurfaceAccent(null);
  emitPrimaryColorChange();
}

function getSavedBrandLogo() {
  return localStorage.getItem(APP_KEYS.brandLogo) || '';
}

function getSavedBrandName() {
  return localStorage.getItem(APP_KEYS.brandName) || '';
}

function setBrandLogo(dataUrl) {
  const value = String(dataUrl || '').trim();
  if (!value) return { ok: false, error: 'No logo image provided.' };
  localStorage.setItem(APP_KEYS.brandLogo, value);
  applySavedBrandLogo();
  return { ok: true };
}

function clearBrandLogo() {
  localStorage.removeItem(APP_KEYS.brandLogo);
  applySavedBrandLogo();
  return { ok: true };
}

function setBrandName(name) {
  const value = String(name || '').trim();
  if (!value) {
    localStorage.removeItem(APP_KEYS.brandName);
    applySavedBrandName();
    return { ok: true, cleared: true };
  }
  localStorage.setItem(APP_KEYS.brandName, value);
  applySavedBrandName();
  return { ok: true, name: value };
}

function clearBrandName() {
  localStorage.removeItem(APP_KEYS.brandName);
  applySavedBrandName();
  return { ok: true };
}

function applySavedBrandLogo() {
  const saved = getSavedBrandLogo();
  document.querySelectorAll('.brand').forEach((brand) => {
    const iconEl = brand.querySelector('.brand-icon');
    if (!iconEl) return;
    if (!iconEl.dataset.defaultIconText) {
      iconEl.dataset.defaultIconText = iconEl.textContent || '🐾';
    }
    if (saved) {
      iconEl.innerHTML = `<img src="${escapeHtml(saved)}" alt="Organization logo" class="brand-logo-image" style="width:36px;height:36px;object-fit:contain;border-radius:8px;">`;
    } else {
      iconEl.textContent = iconEl.dataset.defaultIconText;
    }
  });
}

function applySavedBrandName() {
  const saved = getSavedBrandName();
  document.querySelectorAll('.brand .brand-name').forEach((nameEl) => {
    if (!nameEl.dataset.defaultBrandName) {
      nameEl.dataset.defaultBrandName = nameEl.textContent || 'Funds 4 Furry Friends';
    }
    nameEl.textContent = saved || nameEl.dataset.defaultBrandName;
  });
}

function applyDynamicThemeSurfaceAccent(palette) {
  let styleEl = document.getElementById('fundsDynamicThemeAccentStyle');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'fundsDynamicThemeAccentStyle';
    document.head.appendChild(styleEl);
  }
  if (!palette) {
    styleEl.textContent = '';
    return;
  }
  styleEl.textContent = `
    .stat-card,
    .mini-card {
      border: 1px solid ${palette.tint15};
      box-shadow: 0 8px 22px ${palette.glowSoft}, var(--shadow-card);
    }
    .stat-card:hover,
    .mini-card:hover {
      box-shadow: 0 12px 26px ${palette.tint20}, var(--shadow-hover);
    }
    .filter-group .select,
    .filter-group select.input,
    .btn-group .btn-secondary {
      border-color: ${palette.tint20};
      background-color: ${palette.tint05};
    }
    .filter-group .select:hover,
    .filter-group select.input:hover,
    .btn-group .btn-secondary:hover {
      border-color: ${palette.tint30};
      background-color: ${palette.tint08};
    }
    .chart-container,
    .chart-card .card-body,
    .impact-card .card-body {
      box-shadow: inset 0 0 0 1px ${palette.tint10};
      border-radius: inherit;
    }
  `;
}

function emitPrimaryColorChange() {
  window.dispatchEvent(new CustomEvent('funds:primary-color-change', {
    detail: {
      color: getComputedStyle(document.documentElement).getPropertyValue('--accent-green').trim(),
    },
  }));
}

function getSession() {
  try {
    const parsed = JSON.parse(localStorage.getItem(APP_KEYS.session) || 'null');
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {}
  return { role: 'visitor', loggedIn: false, name: 'Visitor', email: null };
}

function setSession(session) {
  localStorage.setItem(APP_KEYS.session, JSON.stringify(session));
}

function ensureSession() {
  const current = getSession();
  if (!current.role) {
    setSession({ role: 'visitor', loggedIn: false, name: 'Visitor', email: null });
    return;
  }
  if (current.loggedIn) {
    const account = findAccountByEmail(current.email);
    if (!account) {
      setSession({ role: 'visitor', loggedIn: false, name: 'Visitor', email: null });
    }
  }
}

function defaultAdminAccount() {
  return {
    id: 'local-admin-default',
    full_name: 'Default Administrator',
    email: 'admin@funds4furry.local',
    password: 'Admin',
    role: 'administrator',
    status: 'active',
    title: 'System Administrator',
    avatar_url: '',
    team_member_id: null,
    is_default_admin: true,
  };
}

function normalizeAccount(account) {
  const a = account && typeof account === 'object' ? account : {};
  return {
    id: String(a.id || `acct-${Date.now()}`),
    full_name: String(a.full_name || a.name || 'Member'),
    email: String(a.email || '').trim().toLowerCase(),
    password: String(a.password || ''),
    role: normalizeRole(a.role || 'visitor'),
    status: String(a.status || 'active').toLowerCase(),
    title: a.title || null,
    avatar_url: a.avatar_url || '',
    team_member_id: a.team_member_id || null,
    is_default_admin: !!a.is_default_admin,
  };
}

function getAccounts() {
  try {
    const parsed = JSON.parse(localStorage.getItem(APP_KEYS.accounts) || 'null');
    if (Array.isArray(parsed)) return parsed.map(normalizeAccount);
  } catch {}
  return [];
}

function setAccounts(accounts) {
  const normalized = accounts.map(normalizeAccount);
  localStorage.setItem(APP_KEYS.accounts, JSON.stringify(normalized));
}

function ensureAccounts() {
  let accounts = getAccounts();
  const existingDefault = accounts.find((a) => a.is_default_admin || a.email === 'admin@funds4furry.local');
  if (!existingDefault) {
    accounts = [defaultAdminAccount(), ...accounts];
  } else {
    // Ensure default admin remains administrator and active.
    accounts = accounts.map((a) => {
      if (a.is_default_admin || a.email === 'admin@funds4furry.local') {
        return { ...a, is_default_admin: true, role: 'administrator', status: 'active' };
      }
      return a;
    });
  }
  setAccounts(accounts);
}

function findAccountByEmail(email) {
  const target = String(email || '').trim().toLowerCase();
  if (!target) return null;
  return getAccounts().find((a) => a.email === target) || null;
}

function upsertLocalAccount(accountLike) {
  const incoming = normalizeAccount(accountLike);
  let accounts = getAccounts();
  const idx = accounts.findIndex((a) => a.id === incoming.id || (incoming.email && a.email === incoming.email));
  if (idx >= 0) {
    const preservedPassword = incoming.password || accounts[idx].password;
    accounts[idx] = normalizeAccount({ ...accounts[idx], ...incoming, password: preservedPassword });
  } else {
    accounts.unshift(incoming);
  }
  ensureDefaultAdminStillPresent(accounts);
  setAccounts(accounts);
  return findAccountByEmail(incoming.email) || incoming;
}

function ensureDefaultAdminStillPresent(accounts) {
  if (!accounts.some((a) => a.is_default_admin || a.email === 'admin@funds4furry.local')) {
    accounts.unshift(defaultAdminAccount());
  }
}

function removeLocalAccountByEmail(email) {
  let accounts = getAccounts();
  const target = String(email || '').trim().toLowerCase();
  accounts = accounts.filter((a) => !(a.email === target && !a.is_default_admin));
  ensureDefaultAdminStillPresent(accounts);
  setAccounts(accounts);
}

function accountToSession(account) {
  const a = normalizeAccount(account);
  return {
    account_id: a.id,
    role: a.role === 'editor' ? 'member' : a.role,
    loggedIn: a.role !== 'visitor',
    name: a.full_name,
    email: a.email,
    title: a.title,
    avatar_url: a.avatar_url || '',
    team_member_id: a.team_member_id || null,
    is_default_admin: !!a.is_default_admin,
  };
}

function signInWithCredentials(email, password) {
  const account = findAccountByEmail(email);
  if (!account) return { ok: false, error: 'No account found for that email.' };
  if (String(account.status || 'active').toLowerCase() !== 'active') return { ok: false, error: 'This account is not active.' };
  if (account.password !== String(password || '')) return { ok: false, error: 'Incorrect password.' };
  const session = accountToSession(account);
  setSession(session);
  return { ok: true, session, account };
}

function changeAccountPassword(email, currentPassword, nextPassword) {
  const account = findAccountByEmail(email);
  if (!account) return { ok: false, error: 'Account not found.' };
  if (account.password !== String(currentPassword || '')) return { ok: false, error: 'Current password is incorrect.' };
  if (!nextPassword || String(nextPassword).length < 3) return { ok: false, error: 'New password must be at least 3 characters.' };
  upsertLocalAccount({ ...account, password: String(nextPassword) });
  return { ok: true };
}

function getDefaultAdminAccount() {
  return getAccounts().find((a) => a.is_default_admin) || defaultAdminAccount();
}

function normalizeSignupRequest(request) {
  const r = request && typeof request === 'object' ? request : {};
  return {
    id: String(r.id || `signup-${Date.now()}`),
    full_name: String(r.full_name || r.name || '').trim(),
    email: String(r.email || '').trim().toLowerCase(),
    password: String(r.password || ''),
    requested_role: normalizeRole(r.requested_role || r.role || 'member'),
    title: r.title ? String(r.title) : '',
    reason: r.reason ? String(r.reason) : '',
    status: String(r.status || 'pending').toLowerCase(),
    created_at: r.created_at || new Date().toISOString(),
    reviewed_at: r.reviewed_at || null,
    reviewed_by: r.reviewed_by || null,
    decision_note: r.decision_note || '',
  };
}

function getSignupRequests() {
  try {
    const parsed = JSON.parse(localStorage.getItem(APP_KEYS.signupRequests) || 'null');
    if (Array.isArray(parsed)) return parsed.map(normalizeSignupRequest);
  } catch {}
  return [];
}

function setSignupRequests(requests) {
  localStorage.setItem(APP_KEYS.signupRequests, JSON.stringify(requests.map(normalizeSignupRequest)));
}

function validateSignupRequestInput(payload) {
  const full_name = String(payload?.full_name || '').trim();
  const email = String(payload?.email || '').trim().toLowerCase();
  const password = String(payload?.password || '');
  const requested_role = normalizeRole(payload?.requested_role || 'member');
  if (!full_name) return { ok: false, error: 'Full name is required.' };
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'A valid email is required.' };
  if (!password || password.length < 3) return { ok: false, error: 'Password must be at least 3 characters.' };
  if (findAccountByEmail(email)) return { ok: false, error: 'An account already exists for that email.' };
  const pending = getSignupRequests().find((r) => r.email === email && r.status === 'pending');
  if (pending) return { ok: false, error: 'A signup request for this email is already pending approval.' };
  return { ok: true, value: { full_name, email, password, requested_role, title: String(payload?.title || '').trim(), reason: String(payload?.reason || '').trim() } };
}

function submitSignupRequest(payload) {
  const validation = validateSignupRequestInput(payload);
  if (!validation.ok) return validation;
  const req = normalizeSignupRequest({
    ...validation.value,
    status: 'pending',
    created_at: new Date().toISOString(),
  });
  const requests = getSignupRequests();
  requests.unshift(req);
  setSignupRequests(requests.slice(0, 250));
  notify('Signup request submitted', `Your request for ${req.email} is pending administrator approval.`, ['all']);
  return { ok: true, request: req };
}

function reviewSignupRequest(requestId, decision, options = {}) {
  const requests = getSignupRequests();
  const idx = requests.findIndex((r) => r.id === String(requestId));
  if (idx < 0) return { ok: false, error: 'Signup request not found.' };
  const status = decision === 'approve' ? 'approved' : 'rejected';
  requests[idx] = normalizeSignupRequest({
    ...requests[idx],
    status,
    reviewed_at: new Date().toISOString(),
    reviewed_by: options.reviewed_by || getSession()?.email || null,
    decision_note: options.decision_note || '',
  });
  setSignupRequests(requests);
  return { ok: true, request: requests[idx] };
}

function removeMessagesControl() {
  document.querySelectorAll('.icon-btn').forEach((btn) => {
    const title = (btn.getAttribute('title') || '').toLowerCase();
    const text = (btn.textContent || '').toLowerCase();
    if (title.includes('message') || text.includes('💬') || text.includes('message')) {
      btn.remove();
    }
  });
}

function injectHeaderControls() {
  const topbarRight = document.querySelector('.topbar-right');
  if (!topbarRight) return;

  normalizeHeaderIconButtons(topbarRight);

  if (!topbarRight.querySelector('[data-app-control="theme-toggle"]')) {
    const themeBtn = document.createElement('button');
    themeBtn.className = 'icon-btn';
    themeBtn.type = 'button';
    themeBtn.title = 'Toggle theme';
    themeBtn.dataset.appControl = 'theme-toggle';
    themeBtn.textContent = document.documentElement.getAttribute('data-theme') === 'dark' ? '☀️' : '🌙';
    themeBtn.addEventListener('click', toggleTheme);
    const bell = getNotificationBellButton(topbarRight);
    if (bell) {
      bell.insertAdjacentElement('afterend', themeBtn);
    } else {
      topbarRight.prepend(themeBtn);
    }
  }

  normalizeHeaderIconButtons(topbarRight);
  enforceHeaderControlOrder(topbarRight);

  const existingSignIn = topbarRight.querySelector('[data-app-control="signin"]');
  if (existingSignIn) existingSignIn.remove();
  const existingSignUp = topbarRight.querySelector('[data-app-control="signup"]');
  if (existingSignUp) existingSignUp.remove();
  const existingUserMenu = topbarRight.querySelector('.user-menu');
  if (existingUserMenu) existingUserMenu.remove();

  const session = getSession();
  if (!session.loggedIn) {
    const signInBtn = document.createElement('button');
    signInBtn.className = 'btn btn-secondary btn-pill';
    signInBtn.type = 'button';
    signInBtn.dataset.appControl = 'signin';
    signInBtn.textContent = 'Sign In';
    signInBtn.addEventListener('click', openSignInModal);
    const signUpBtn = document.createElement('button');
    signUpBtn.className = 'btn btn-primary btn-pill';
    signUpBtn.type = 'button';
    signUpBtn.dataset.appControl = 'signup';
    signUpBtn.textContent = 'Sign Up';
    signUpBtn.addEventListener('click', () => openSignUpRequestModal());
    topbarRight.appendChild(signUpBtn);
    topbarRight.appendChild(signInBtn);
  } else {
    const userMenu = document.createElement('div');
    userMenu.className = 'user-menu';
    const avatarHtml = session.avatar_url
      ? `<img src="${escapeHtml(session.avatar_url)}" alt="User" class="user-avatar">`
      : `<div class="avatar avatar-sm avatar-placeholder">${escapeHtml((session.name || 'U').slice(0, 1).toUpperCase())}</div>`;
    userMenu.innerHTML = `
      ${avatarHtml}
      <span class="user-name">${escapeHtml(session.name || 'User')} (${escapeHtml(capitalize(session.role))})</span>
      <button type="button" class="btn btn-secondary btn-pill" data-app-control="signout">Sign Out</button>
    `;
    const signoutBtn = userMenu.querySelector('[data-app-control="signout"]');
    signoutBtn?.addEventListener('click', () => {
      setSession({ role: 'visitor', loggedIn: false, name: 'Visitor', email: null });
      notify('Signed out', 'You are now browsing as a Visitor.', ['all']);
      location.reload();
    });
    topbarRight.appendChild(userMenu);
  }
}

function toggleTheme() {
  const html = document.documentElement;
  const current = html.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', next);
  localStorage.setItem(APP_KEYS.theme, next);
  const themeBtn = document.querySelector('[data-app-control="theme-toggle"]');
  if (themeBtn) themeBtn.textContent = next === 'dark' ? '☀️' : '🌙';
}

function openSignInModal() {
  let modal = document.getElementById('authModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'authModal';
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-backdrop"></div>
      <div class="modal-content">
        <div class="modal-header">
          <h2 class="modal-title">Sign In</h2>
          <button class="modal-close" type="button">×</button>
        </div>
        <div class="modal-body">
          <form id="authForm" class="form">
            <div class="input-group">
              <label class="input-label">Email</label>
              <input class="input" name="email" type="email" placeholder="admin@funds4furry.local" required>
            </div>
            <div class="input-group">
              <label class="input-label">Password</label>
              <input class="input" name="password" type="password" placeholder="Password" required>
            </div>
            <p class="text-muted text-caption">Default admin login: <code>admin@funds4furry.local</code> / <code>Admin</code></p>
            <p class="text-urgent text-caption" id="authErrorMessage" style="display:none;margin:0;"></p>
            <div id="authSignupCta" style="display:none; margin-top: 8px;">
              <button type="button" class="btn btn-secondary btn-pill" data-auth-signup>Request Sign Up</button>
              <p class="text-muted text-caption" style="margin:8px 0 0;">New users need administrator approval before sign in.</p>
            </div>
            <div class="modal-actions">
              <button type="button" class="btn btn-secondary" data-auth-visitor>Continue as Visitor</button>
              <button type="submit" class="btn btn-primary">Sign In</button>
            </div>
          </form>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('.modal-backdrop')?.addEventListener('click', () => closeModal('authModal'));
    modal.querySelector('.modal-close')?.addEventListener('click', () => closeModal('authModal'));
    modal.querySelector('[data-auth-visitor]')?.addEventListener('click', () => {
      setSession({ role: 'visitor', loggedIn: false, name: 'Visitor', email: null });
      closeModal('authModal');
      location.reload();
    });
    modal.querySelector('[data-auth-signup]')?.addEventListener('click', () => {
      const form = modal.querySelector('#authForm');
      const email = form?.querySelector('[name="email"]')?.value || '';
      closeModal('authModal');
      openSignUpRequestModal({ email });
    });
    modal.querySelector('#authForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target));
      const errorEl = modal.querySelector('#authErrorMessage');
      const result = signInWithCredentials(data.email, data.password);
      if (!result.ok) {
        if (errorEl) {
          errorEl.style.display = 'block';
          errorEl.textContent = result.error;
        }
        toggleAuthSignupCta(result.error, data.email);
        return;
      }
      if (errorEl) {
        errorEl.style.display = 'none';
        errorEl.textContent = '';
      }
      toggleAuthSignupCta('', '');
      notify('Session updated', `You are signed in as ${capitalize(result.session.role)}.`, [result.session.role]);
      closeModal('authModal');
      location.reload();
    });
  }
  modal.querySelector('#authErrorMessage')?.setAttribute('style', 'display:none;margin:0;');
  toggleAuthSignupCta('', '');
  modal.classList.add('active');
}

function toggleAuthSignupCta(errorMessage, email = '') {
  const cta = document.getElementById('authSignupCta');
  if (!cta) return;
  const show = /no account found/i.test(String(errorMessage || ''));
  cta.style.display = show ? 'block' : 'none';
  if (show) {
    cta.dataset.prefillEmail = String(email || '');
  } else {
    delete cta.dataset.prefillEmail;
  }
}

function openSignUpRequestModal(prefill = {}) {
  let modal = document.getElementById('signupRequestModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'signupRequestModal';
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-backdrop"></div>
      <div class="modal-content modal-large">
        <div class="modal-header">
          <h2 class="modal-title">Request New User Access</h2>
          <button class="modal-close" type="button">×</button>
        </div>
        <div class="modal-body">
          <form id="signupRequestForm" class="form">
            <div class="form-row">
              <div class="input-group">
                <label class="input-label">Full Name</label>
                <input class="input" name="full_name" required placeholder="Jane Doe">
              </div>
              <div class="input-group">
                <label class="input-label">Email</label>
                <input class="input" name="email" type="email" required placeholder="jane@example.org">
              </div>
            </div>
            <div class="form-row">
              <div class="input-group">
                <label class="input-label">Requested Access</label>
                <select class="select" name="requested_role">
                  <option value="member">Member</option>
                  <option value="visitor">Visitor (Read-only)</option>
                </select>
              </div>
              <div class="input-group">
                <label class="input-label">Title (optional)</label>
                <input class="input" name="title" placeholder="Volunteer Coordinator">
              </div>
            </div>
            <div class="form-row">
              <div class="input-group">
                <label class="input-label">Requested Password</label>
                <input class="input" name="password" type="password" required placeholder="At least 3 characters">
              </div>
              <div class="input-group">
                <label class="input-label">Confirm Password</label>
                <input class="input" name="confirm_password" type="password" required placeholder="Re-enter password">
              </div>
            </div>
            <div class="input-group">
              <label class="input-label">Reason / Notes (optional)</label>
              <textarea class="textarea" name="reason" placeholder="What do you need access for?"></textarea>
            </div>
            <p class="text-urgent text-caption" id="signupRequestError" style="display:none;margin:0;"></p>
            <div class="modal-actions">
              <button type="button" class="btn btn-secondary" data-signup-cancel>Cancel</button>
              <button type="submit" class="btn btn-primary">Submit Request</button>
            </div>
          </form>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('.modal-backdrop')?.addEventListener('click', () => closeModal('signupRequestModal'));
    modal.querySelector('.modal-close')?.addEventListener('click', () => closeModal('signupRequestModal'));
    modal.querySelector('[data-signup-cancel]')?.addEventListener('click', () => closeModal('signupRequestModal'));
    modal.querySelector('#signupRequestForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const form = e.currentTarget;
      const data = Object.fromEntries(new FormData(form));
      const errEl = modal.querySelector('#signupRequestError');
      if (String(data.password || '') !== String(data.confirm_password || '')) {
        if (errEl) {
          errEl.style.display = 'block';
          errEl.textContent = 'Password and confirmation must match.';
        }
        return;
      }
      const result = submitSignupRequest(data);
      if (!result.ok) {
        if (errEl) {
          errEl.style.display = 'block';
          errEl.textContent = result.error;
        }
        return;
      }
      if (errEl) {
        errEl.style.display = 'none';
        errEl.textContent = '';
      }
      form.reset();
      closeModal('signupRequestModal');
      showToast('Signup request submitted for approval');
    });
  }
  const form = modal.querySelector('#signupRequestForm');
  const errEl = modal.querySelector('#signupRequestError');
  if (errEl) {
    errEl.style.display = 'none';
    errEl.textContent = '';
  }
  if (form) {
    if (prefill.email) form.querySelector('[name="email"]').value = String(prefill.email);
    if (prefill.full_name) form.querySelector('[name="full_name"]').value = String(prefill.full_name);
  }
  modal.classList.add('active');
}

function applyRoleAccessRestrictions() {
  const session = getSession();
  const role = session.role || 'visitor';
  const isVisitor = role === 'visitor' || !session.loggedIn;
  const path = (location.pathname.split('/').pop() || 'index.html').toLowerCase();

  document.querySelectorAll('.sidebar a[href="settings.html"], .sidebar a[href="team.html"]').forEach((link) => {
    if (isVisitor) {
      link.classList.add('is-disabled');
      link.setAttribute('aria-disabled', 'true');
      link.title = 'Sign in as Administrator or Member to access this page.';
      link.addEventListener('click', (e) => {
        e.preventDefault();
        notify('Restricted page', 'Visitors cannot access Settings or Team pages.', ['visitor']);
        openSignInModal();
      });
    }
  });

  if (isVisitor && (path === 'settings.html' || path === 'team.html')) {
    notify('Access restricted', 'Visitors are redirected to the dashboard.', ['visitor']);
    location.replace('index.html');
  }
}

function enforceReadOnlyMode() {
  const session = getSession();
  const isVisitor = (session.role || 'visitor') === 'visitor' || !session.loggedIn;
  if (!isVisitor) return;

  const writePatterns = /(add|new|create|record donation|start campaign|invite|generate|save|edit)\b/i;
  document.querySelectorAll('button, a.btn').forEach((el) => {
    if (el.dataset.appControl) return;
    if (el.closest('#authModal')) return;
    if (el.hasAttribute('data-allow-visitor-write')) return;
    const text = (el.textContent || '').trim();
    if (writePatterns.test(text)) {
      el.dataset.readOnlyBlocked = 'true';
      el.title = 'Visitors have read-only access. Sign in to use this action.';
      el.addEventListener('click', blockVisitorWriteAction, { capture: true });
    }
  });

  document.querySelectorAll('form').forEach((form) => {
    if (form.id === 'authForm' || form.id === 'signupRequestForm') return;
    form.addEventListener('submit', (e) => {
      notify('Read-only mode', 'Visitors cannot submit changes. Sign in to continue.', ['visitor']);
      e.preventDefault();
    }, { capture: true });
  });
}

function blockVisitorWriteAction(e) {
  const session = getSession();
  if ((session.role || 'visitor') === 'visitor' || !session.loggedIn) {
    e.preventDefault();
    e.stopPropagation();
    notify('Read-only mode', 'Visitors cannot modify data. Sign in as Administrator or Member.', ['visitor']);
    openSignInModal();
  }
}

function getNotifications() {
  try {
    const parsed = JSON.parse(localStorage.getItem(APP_KEYS.notifications) || 'null');
    if (Array.isArray(parsed)) return parsed.map(normalizeNotification);
  } catch {}
  localStorage.setItem(APP_KEYS.notifications, JSON.stringify(DEFAULT_NOTIFICATIONS.map(normalizeNotification)));
  return DEFAULT_NOTIFICATIONS.map(normalizeNotification);
}

function setNotifications(items) {
  localStorage.setItem(APP_KEYS.notifications, JSON.stringify(items.map(normalizeNotification)));
  updateNotificationBadge();
}

function notify(title, body = '', audiences = ['all']) {
  const items = getNotifications();
  items.unshift({
    id: `n-${Date.now()}`,
    title: String(title || 'Notification'),
    body: String(body || ''),
    createdAt: new Date().toISOString(),
    read: false,
    audiences: normalizeAudiences(audiences),
  });
  setNotifications(items.slice(0, 25));
  updateNotificationBadge();
  if (notificationVisibleToCurrentUser(items[0])) {
    showToast(title);
  }
}

function initNotifications() {
  const bellBtn = getNotificationBellButton();
  if (!bellBtn) return;

  bellBtn.type = 'button';
  bellBtn.dataset.appControl = 'notifications';
  bellBtn.addEventListener('click', (e) => {
    e.preventDefault();
    toggleNotificationPanel(bellBtn);
  });

  updateNotificationBadge();
}

function normalizeHeaderIconButtons(container = document) {
  Array.from(container.querySelectorAll('.icon-btn')).forEach((btn) => {
    const text = (btn.textContent || '').trim();
    const lowerTitle = (btn.getAttribute('title') || '').toLowerCase();
    if (text.includes('🔔') && !lowerTitle.includes('notification')) {
      btn.setAttribute('title', 'Notifications');
    }
    if (text.includes('💬') && !lowerTitle.includes('message')) {
      btn.setAttribute('title', 'Messages');
    }
  });
}

function getNotificationBellButton(container = document) {
  return Array.from(container.querySelectorAll('.icon-btn')).find((btn) => {
    const title = (btn.getAttribute('title') || '').toLowerCase();
    const text = (btn.textContent || '').toLowerCase();
    return title.includes('notification') || text.includes('🔔');
  }) || null;
}

function enforceHeaderControlOrder(topbarRight) {
  const bell = getNotificationBellButton(topbarRight);
  const theme = topbarRight.querySelector('[data-app-control="theme-toggle"]');
  if (bell) topbarRight.prepend(bell);
  if (theme && bell) bell.insertAdjacentElement('afterend', theme);
  else if (theme) topbarRight.prepend(theme);
}

function updateNotificationBadge() {
  const unread = getVisibleNotifications().filter((n) => !n.read).length;
  document.querySelectorAll('.notification-badge').forEach((badge) => {
    badge.textContent = unread > 99 ? '99+' : String(unread);
    badge.style.display = unread ? 'flex' : 'none';
  });
}

function toggleNotificationPanel(anchor) {
  let panel = document.getElementById('notificationPanel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'notificationPanel';
    panel.className = 'app-popover-panel';
    document.body.appendChild(panel);
    document.addEventListener('click', (e) => {
      if (!panel.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) {
        panel.classList.remove('is-open');
      }
    });
  }

  if (panel.classList.contains('is-open')) {
    panel.classList.remove('is-open');
    return;
  }

  const visibleItems = getVisibleNotifications();
  panel.innerHTML = `
    <div class="app-popover-header">
      <strong>Notifications</strong>
      <button type="button" class="btn btn-secondary btn-pill" data-mark-read>Mark all read</button>
    </div>
    <div class="app-popover-list">
      ${visibleItems.length ? visibleItems.map(renderNotificationItem).join('') : '<p class="text-muted">No notifications for your account.</p>'}
    </div>
  `;
  panel.querySelector('[data-mark-read]')?.addEventListener('click', () => {
    const visibleIds = new Set(visibleItems.map((n) => n.id));
    setNotifications(getNotifications().map((n) => (visibleIds.has(n.id) ? { ...n, read: true } : n)));
    toggleNotificationPanel(anchor);
    toggleNotificationPanel(anchor);
  });

  const rect = anchor.getBoundingClientRect();
  panel.style.top = `${rect.bottom + 8 + window.scrollY}px`;
  panel.style.left = `${Math.max(12, rect.right - 360 + window.scrollX)}px`;
  panel.classList.add('is-open');
}

function renderNotificationItem(item) {
  return `
    <div class="app-popover-item ${item.read ? '' : 'is-unread'}">
      <div class="app-popover-item-title">${escapeHtml(item.title)}</div>
      ${item.body ? `<div class="app-popover-item-body">${escapeHtml(item.body)}</div>` : ''}
      <div class="app-popover-item-time">${escapeHtml(formatRelativeTime(item.createdAt))}</div>
    </div>
  `;
}

function getVisibleNotifications() {
  return getNotifications().filter(notificationVisibleToCurrentUser);
}

function notificationVisibleToCurrentUser(notification) {
  const role = getCurrentUserRole();
  const audiences = normalizeAudiences(notification?.audiences);
  return audiences.includes('all') || audiences.includes(role) || (role === 'administrator' && audiences.includes('member'));
}

function getCurrentUserRole() {
  const session = getSession();
  return normalizeRole(session.role || 'visitor');
}

function normalizeRole(role) {
  const r = String(role || 'visitor').toLowerCase();
  if (r === 'editor') return 'member';
  return r;
}

function normalizeNotification(item) {
  const n = item && typeof item === 'object' ? item : {};
  return {
    id: String(n.id || `n-${Date.now()}`),
    title: String(n.title || 'Notification'),
    body: String(n.body || ''),
    createdAt: n.createdAt || new Date().toISOString(),
    read: !!n.read,
    audiences: normalizeAudiences(n.audiences),
  };
}

function normalizeAudiences(audiences) {
  const raw = Array.isArray(audiences) ? audiences : (audiences ? [audiences] : ['all']);
  const out = raw
    .map((a) => String(a || '').toLowerCase().trim())
    .filter(Boolean);
  return out.length ? Array.from(new Set(out)) : ['all'];
}

function initGlobalButtons() {
  document.addEventListener('click', (e) => {
    if (e.target.closest('.btn') && e.target.textContent.includes('Record Donation')) {
      handleRecordDonation();
    }

    if (e.target.closest('.btn') && (e.target.textContent.includes('Start Campaign') || e.target.textContent.includes('New Campaign'))) {
      handleStartCampaign();
    }

    if (e.target.closest('.btn') && e.target.textContent.includes('Share Impact')) {
      handleShareImpact();
    }
  });
}

function handleRecordDonation() {
  if (window.DashboardPage && typeof window.DashboardPage.openRecordDonationModal === 'function' && document.getElementById('recordDonationBtn')) {
    window.DashboardPage.openRecordDonationModal();
    return;
  }
  window.location.href = 'donors.html';
}

function handleStartCampaign() {
  window.location.href = 'campaigns.html';
}

function handleShareImpact() {
  const shareText = "Check out the amazing impact we're making at Funds 4 Furry Friends!";
  if (navigator.share) {
    navigator.share({ title: 'Funds 4 Furry Friends Impact', text: shareText, url: window.location.href }).catch(() => {});
  } else {
    copyToClipboard(shareText);
    showToast('Impact message copied to clipboard!');
  }
}

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

    document.addEventListener('click', (e) => {
      if (window.innerWidth < 768) {
        if (!sidebar.contains(e.target) && !menuToggle.contains(e.target)) {
          sidebar.classList.remove('open');
        }
      }
    });
  }
}

function initSearchFunctionality() {
  const searchInput = document.querySelector('.search-input');
  if (!searchInput) return;
  searchInput.addEventListener('input', debounce((e) => {
    console.log('Searching for:', e.target.value.toLowerCase());
  }, 300));
}

function initAnimations() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry, index) => {
      if (entry.isIntersecting) {
        setTimeout(() => {
          entry.target.style.opacity = '1';
          entry.target.style.transform = 'translateY(0)';
        }, index * 80);
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

  document.querySelectorAll('.card').forEach((card) => {
    if (card.dataset.animReady === 'true') return;
    card.dataset.animReady = 'true';
    card.style.opacity = '0';
    card.style.transform = 'translateY(20px)';
    card.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
    observer.observe(card);
  });
}

function initTooltips() {
  document.querySelectorAll('.tooltip').forEach((tooltip) => {
    const tooltipText = tooltip.querySelector('.tooltip-text');
    if (!tooltipText) return;
    tooltip.addEventListener('mouseenter', () => {
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
  });
}

function initProgressBars() {
  const progressBars = document.querySelectorAll('.progress-bar');
  if (!progressBars.length) return;
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const bar = entry.target;
      const targetWidth = bar.getAttribute('data-width') || bar.style.width;
      setTimeout(() => { bar.style.width = targetWidth; }, 300);
      observer.unobserve(bar);
    });
  }, { threshold: 0.5 });
  progressBars.forEach((bar) => {
    const width = bar.style.width;
    bar.setAttribute('data-width', width);
    bar.style.width = '0%';
    observer.observe(bar);
  });
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('active');
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

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

function showToast(message, duration = 3000) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed; bottom: 24px; right: 24px; background: var(--accent-green);
    color: white; padding: 16px 24px; border-radius: 12px; box-shadow: var(--shadow-card);
    z-index: 9999; font-weight: 500;
  `;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.2s ease';
    setTimeout(() => toast.remove(), 220);
  }, duration);
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(amount || 0));
}

function formatDate(date) {
  return new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(date));
}

function formatRelativeTime(date) {
  const now = new Date();
  const then = new Date(date);
  if (Number.isNaN(then.getTime())) return String(date || '');
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 60) return `${Math.max(1, diffMins)} minute${diffMins !== 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
  return formatDate(then);
}

function capitalize(value) {
  const text = String(value || '');
  return text ? text[0].toUpperCase() + text.slice(1) : '';
}

function normalizeHexColor(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const withHash = raw.startsWith('#') ? raw : `#${raw}`;
  const short = /^#([0-9a-fA-F]{3})$/;
  const full = /^#([0-9a-fA-F]{6})$/;
  if (short.test(withHash)) {
    const [, s] = withHash.match(short);
    return `#${s[0]}${s[0]}${s[1]}${s[1]}${s[2]}${s[2]}`.toUpperCase();
  }
  if (full.test(withHash)) {
    return withHash.toUpperCase();
  }
  return '';
}

function hexToRgb(hex) {
  const normalized = normalizeHexColor(hex);
  if (!normalized) return null;
  return {
    r: parseInt(normalized.slice(1, 3), 16),
    g: parseInt(normalized.slice(3, 5), 16),
    b: parseInt(normalized.slice(5, 7), 16),
  };
}

function rgbToHex({ r, g, b }) {
  const toHex = (n) => clamp(n).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

function adjustRgb(rgb, amount) {
  const apply = (n) => amount >= 0 ? n + ((255 - n) * amount) : n * (1 + amount);
  return {
    r: clamp(Math.round(apply(rgb.r))),
    g: clamp(Math.round(apply(rgb.g))),
    b: clamp(Math.round(apply(rgb.b))),
  };
}

function clamp(n) {
  return Math.max(0, Math.min(255, Number(n || 0)));
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

window.FundsApp = {
  formatCurrency,
  formatDate,
  formatRelativeTime,
  showToast,
  copyToClipboard,
  notify,
  getSession,
  setSession,
  getAccounts,
  findAccountByEmail,
  upsertLocalAccount,
  removeLocalAccountByEmail,
  getSignupRequests,
  submitSignupRequest,
  reviewSignupRequest,
  signInWithCredentials,
  changeAccountPassword,
  getDefaultAdminAccount,
  normalizeRole,
  getSavedPrimaryThemeColor,
  setPrimaryThemeColor,
  resetPrimaryThemeColor,
  getSavedBrandLogo,
  setBrandLogo,
  clearBrandLogo,
  getSavedBrandName,
  setBrandName,
  clearBrandName,
  openSignInModal,
  openSignUpRequestModal,
  closeModal,
};
