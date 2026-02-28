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
  explorerDiscoveryJob: 'funds_explorer_discovery_job',
  pagePermissions: 'funds_page_permissions_v1',
  backendAuthToken: 'funds_backend_auth_token',
};

const DEFAULT_NOTIFICATIONS = [
  { id: 'n1', title: 'Welcome to Funds 4 Furry Friends', body: 'Dashboard is ready for review.', createdAt: new Date().toISOString(), read: false, audiences: ['all'] },
  { id: 'n2', title: 'CRM Mode Enabled', body: 'Supabase-backed dashboard APIs are active.', createdAt: new Date().toISOString(), read: false, audiences: ['administrator', 'member'] },
];
let backendAuthTokenMemory = '';
let authBootstrapStatusCache = null;

document.addEventListener('DOMContentLoaded', () => {
  initAppShell();
  initSidebarToggle();
  initSearchFunctionality();
  initAnimations();
  initTooltips();
  initProgressBars();
  initNotifications();
  initExplorerDiscoveryMonitor();
  initGlobalButtons();
});

function initAppShell() {
  initBackendAuthTransport();
  applySavedPrimaryThemeColor();
  applySavedBrandLogo();
  applySavedBrandName();
  ensureTheme();
  ensureAccounts();
  ensureSession();
  ensurePagePermissionSchema();
  removeMessagesControl();
  normalizeSidebarNavigation();
  injectHeaderControls();
  applyRoleAccessRestrictions();
  enforceReadOnlyMode();
}

let backendAuthTransportInitialized = false;
const apiResponseCache = new Map();
function initBackendAuthTransport() {
  if (backendAuthTransportInitialized || typeof window.fetch !== 'function') return;
  backendAuthTransportInitialized = true;
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    try {
      const url = typeof input === 'string' ? input : String(input?.url || '');
      const isApi = url.startsWith('/api/') || /^https?:\/\/[^/]+\/api\//i.test(url);
      if (isApi) {
        const token = getBackendAuthToken();
        if (token) {
          const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined) || {});
          if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
          init = { ...init, headers };
        }
      }
    } catch {}
    const response = await nativeFetch(input, init);
    if (response.status === 401) {
      const session = getSession();
      if (session.loggedIn) {
        clearBackendAuthToken();
      }
    }
    return response;
  };
}

function buildApiCacheKey(url, init = {}) {
  const method = String(init?.method || 'GET').toUpperCase();
  const headers = new Headers(init?.headers || {});
  const auth = headers.get('Authorization') || '';
  return `${method}|${url}|${auth}`;
}

function shouldUseApiCache(url, init = {}) {
  const method = String(init?.method || 'GET').toUpperCase();
  if (method !== 'GET') return false;
  return String(url || '').startsWith('/api/');
}

function pruneApiResponseCache() {
  const now = Date.now();
  for (const [k, v] of apiResponseCache.entries()) {
    if (!v || Number(v.expiresAt || 0) <= now) apiResponseCache.delete(k);
  }
  if (apiResponseCache.size > 120) {
    const keys = Array.from(apiResponseCache.keys()).slice(0, apiResponseCache.size - 120);
    keys.forEach((k) => apiResponseCache.delete(k));
  }
}

function clearApiResponseCache() {
  apiResponseCache.clear();
}

async function apiJson(url, options = {}) {
  const init = { ...(options || {}) };
  const useCache = init.useCache !== false;
  const cacheTtlMs = Math.max(1000, Number(init.cacheTtlMs || 30000));
  delete init.useCache;
  delete init.cacheTtlMs;

  const cacheable = useCache && shouldUseApiCache(url, init);
  const cacheKey = cacheable ? buildApiCacheKey(url, init) : '';
  if (cacheable) {
    pruneApiResponseCache();
    const cached = apiResponseCache.get(cacheKey);
    if (cached && Number(cached.expiresAt || 0) > Date.now()) {
      return JSON.parse(JSON.stringify(cached.payload));
    }
  }

  const response = await fetch(url, init);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const msg = String(payload?.error || `HTTP ${response.status}`).trim();
    const err = new Error(msg);
    err.status = response.status;
    err.code = payload?.code || null;
    err.details = payload?.details || null;
    err.hint = payload?.hint || null;
    throw err;
  }

  if (cacheable) {
    apiResponseCache.set(cacheKey, {
      expiresAt: Date.now() + cacheTtlMs,
      payload,
    });
  } else {
    const method = String(init?.method || 'GET').toUpperCase();
    if (method !== 'GET') clearApiResponseCache();
  }
  return payload;
}

function getBackendAuthToken() {
  if (backendAuthTokenMemory) return backendAuthTokenMemory;
  const sessionToken = sessionStorage.getItem(APP_KEYS.backendAuthToken) || '';
  if (sessionToken) backendAuthTokenMemory = sessionToken;
  const legacyToken = localStorage.getItem(APP_KEYS.backendAuthToken) || '';
  if (legacyToken) {
    localStorage.removeItem(APP_KEYS.backendAuthToken);
    sessionStorage.setItem(APP_KEYS.backendAuthToken, legacyToken);
    backendAuthTokenMemory = legacyToken;
    return legacyToken;
  }
  return sessionToken;
}

function setBackendAuthToken(token) {
  if (!token) {
    clearBackendAuthToken();
    return;
  }
  backendAuthTokenMemory = String(token);
  sessionStorage.setItem(APP_KEYS.backendAuthToken, backendAuthTokenMemory);
  localStorage.removeItem(APP_KEYS.backendAuthToken);
}

function clearBackendAuthToken() {
  backendAuthTokenMemory = '';
  sessionStorage.removeItem(APP_KEYS.backendAuthToken);
  localStorage.removeItem(APP_KEYS.backendAuthToken);
}

async function backendAuthLogin(email, password) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: payload?.error || `HTTP ${res.status}` };
  }
  clearBackendAuthToken();
  return { ok: true, token: '', session: payload?.session || null };
}

async function backendAuthLogout() {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch {}
  clearBackendAuthToken();
}

async function backendChangePassword(payload) {
  const res = await fetch('/api/auth/password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data?.error || `HTTP ${res.status}` };
  return { ok: true, data };
}

async function fetchAuthBootstrapStatus(force = false) {
  if (!force && authBootstrapStatusCache) return authBootstrapStatusCache;
  try {
    const payload = await apiJson('/api/auth/bootstrap/status', { useCache: false });
    authBootstrapStatusCache = {
      needs_bootstrap: !!payload?.needs_bootstrap,
      bootstrap_token_configured: !!payload?.bootstrap_token_configured,
      checked_at: Date.now(),
      error: null,
    };
  } catch (err) {
    authBootstrapStatusCache = {
      needs_bootstrap: false,
      bootstrap_token_configured: false,
      checked_at: Date.now(),
      error: String(err?.message || err || ''),
    };
  }
  return authBootstrapStatusCache;
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
    const sessionRaw = sessionStorage.getItem(APP_KEYS.session);
    const legacyRaw = localStorage.getItem(APP_KEYS.session);
    if (!sessionRaw && legacyRaw) {
      sessionStorage.setItem(APP_KEYS.session, legacyRaw);
      localStorage.removeItem(APP_KEYS.session);
    }
    const parsed = JSON.parse(sessionStorage.getItem(APP_KEYS.session) || 'null');
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {}
  return { role: 'visitor', loggedIn: false, name: 'Visitor', email: null };
}

function setSession(session) {
  sessionStorage.setItem(APP_KEYS.session, JSON.stringify(session));
  localStorage.removeItem(APP_KEYS.session);
}

function ensureSession() {
  const current = getSession();
  if (!current.role) {
    setSession({ role: 'visitor', loggedIn: false, name: 'Visitor', email: null });
    return;
  }
}

function normalizeAccount(account) {
  const a = account && typeof account === 'object' ? account : {};
  const normalizedRole = normalizeRole(a.role || 'visitor');
  const normalizedName = String(a.full_name || a.name || 'Member');
  const normalizedEmail = String(a.email || '').trim().toLowerCase();
  const avatarUrl = String(a.avatar_url || '').trim()
    || (normalizedRole !== 'visitor' ? generateAnimalAvatarDataUrl(`${normalizedEmail}|${normalizedName}|${a.id || ''}`) : '');
  return {
    id: String(a.id || `acct-${Date.now()}`),
    full_name: normalizedName,
    email: normalizedEmail,
    role: normalizedRole,
    status: String(a.status || 'active').toLowerCase(),
    title: a.title || null,
    avatar_url: avatarUrl,
    team_member_id: a.team_member_id || null,
    is_default_admin: !!a.is_default_admin,
  };
}

function getAccounts() {
  try {
    const accountsRaw = sessionStorage.getItem(APP_KEYS.accounts);
    const legacyRaw = localStorage.getItem(APP_KEYS.accounts);
    if (!accountsRaw && legacyRaw) {
      sessionStorage.setItem(APP_KEYS.accounts, legacyRaw);
      localStorage.removeItem(APP_KEYS.accounts);
    }
    const parsed = JSON.parse(sessionStorage.getItem(APP_KEYS.accounts) || 'null');
    if (Array.isArray(parsed)) return parsed.map(normalizeAccount);
  } catch {}
  return [];
}

function setAccounts(accounts) {
  const normalized = accounts.map(normalizeAccount);
  sessionStorage.setItem(APP_KEYS.accounts, JSON.stringify(normalized));
  localStorage.removeItem(APP_KEYS.accounts);
}

function ensureAccounts() {
  const accounts = getAccounts();
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
    accounts[idx] = normalizeAccount({ ...accounts[idx], ...incoming });
  } else {
    accounts.unshift(incoming);
  }
  setAccounts(accounts);
  return findAccountByEmail(incoming.email) || incoming;
}

function removeLocalAccountByEmail(email) {
  let accounts = getAccounts();
  const target = String(email || '').trim().toLowerCase();
  accounts = accounts.filter((a) => a.email !== target);
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

async function signInWithCredentials(email, password) {
  const backend = await backendAuthLogin(email, password);
  if (!backend.ok) return { ok: false, error: backend.error || 'Unable to sign in to backend session.' };
  const backendUser = backend?.session?.user || {};
  const account = findAccountByEmail(backendUser.email || email);
  const mergedAccount = upsertLocalAccount({
    ...(account || {}),
    email: String(backendUser.email || email || '').trim().toLowerCase(),
    full_name: backendUser.full_name || account?.full_name || 'Member',
    role: backendUser.role || account?.role || 'member',
    team_member_id: backendUser.team_member_id ?? account?.team_member_id ?? null,
    is_default_admin: !!backendUser.is_default_admin || !!account?.is_default_admin,
    status: 'active',
  });
  const session = accountToSession(mergedAccount);
  setSession(session);
  return { ok: true, session, account: mergedAccount };
}

async function changeAccountPassword(email, currentPassword, nextPassword) {
  const pwd = String(nextPassword || '');
  if (pwd.length < 8) return { ok: false, error: 'New password must be at least 8 characters.' };
  if (!/[A-Z]/.test(pwd) || !/[a-z]/.test(pwd) || !/\d/.test(pwd)) {
    return { ok: false, error: 'New password must include uppercase, lowercase, and a number.' };
  }
  const backendResult = await backendChangePassword({ email, current_password: currentPassword, new_password: nextPassword });
  if (!backendResult.ok) return backendResult;
  return { ok: true };
}

function getDefaultAdminAccount() {
  return getAccounts().find((a) => normalizeRole(a.role) === 'administrator') || null;
}

function normalizeSignupRequest(request) {
  const r = request && typeof request === 'object' ? request : {};
  return {
    id: String(r.id || `signup-${Date.now()}`),
    full_name: String(r.full_name || r.name || '').trim(),
    email: String(r.email || '').trim().toLowerCase(),
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
    const requestsRaw = sessionStorage.getItem(APP_KEYS.signupRequests);
    const legacyRaw = localStorage.getItem(APP_KEYS.signupRequests);
    if (!requestsRaw && legacyRaw) {
      sessionStorage.setItem(APP_KEYS.signupRequests, legacyRaw);
      localStorage.removeItem(APP_KEYS.signupRequests);
    }
    const parsed = JSON.parse(sessionStorage.getItem(APP_KEYS.signupRequests) || 'null');
    if (Array.isArray(parsed)) return parsed.map(normalizeSignupRequest);
  } catch {}
  return [];
}

function setSignupRequests(requests) {
  sessionStorage.setItem(APP_KEYS.signupRequests, JSON.stringify(requests.map(normalizeSignupRequest)));
  localStorage.removeItem(APP_KEYS.signupRequests);
}

function validateSignupRequestInput(payload) {
  const full_name = String(payload?.full_name || '').trim();
  const email = String(payload?.email || '').trim().toLowerCase();
  const requested_role = normalizeRole(payload?.requested_role || 'member');
  if (!full_name) return { ok: false, error: 'Full name is required.' };
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'A valid email is required.' };
  if (findAccountByEmail(email)) return { ok: false, error: 'An account already exists for that email.' };
  const pending = getSignupRequests().find((r) => r.email === email && r.status === 'pending');
  if (pending) return { ok: false, error: 'A signup request for this email is already pending approval.' };
  return { ok: true, value: { full_name, email, requested_role, title: String(payload?.title || '').trim(), reason: String(payload?.reason || '').trim() } };
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

function normalizeSidebarNavigation() {
  const sidebarNav = document.querySelector('.sidebar .sidebar-nav');
  if (!sidebarNav) return;

  const directNavLinks = Array.from(sidebarNav.children).filter((el) => el.tagName === 'A');
  const donorsLink = directNavLinks.find((a) => /(^|\/)donors\.html$/i.test(a.getAttribute('href') || ''));
  if (!donorsLink) return;

  Array.from(sidebarNav.children).forEach((child) => {
    if (child === donorsLink) return;
    if (child.tagName !== 'A') return;
    const href = child.getAttribute('href') || '';
    if (/(^|\/)(funds-explorer|lead-generation)\.html$/i.test(href)) {
      child.remove();
    }
  });

  let subnav = sidebarNav.querySelector('.sidebar-subnav[data-global-subnav="donors"]')
    || Array.from(sidebarNav.querySelectorAll('.sidebar-subnav')).find((el) => (
      el.querySelector('a[href$="funds-explorer.html"]') || el.querySelector('a[href$="lead-generation.html"]')
    ));
  if (!subnav) {
    subnav = document.createElement('div');
    subnav.className = 'sidebar-subnav';
    subnav.setAttribute('aria-label', 'Donors sub-pages');
  }
  subnav.dataset.globalSubnav = 'donors';

  let explorerLink = subnav.querySelector('a[href$="funds-explorer.html"]');
  if (!explorerLink) {
    explorerLink = document.createElement('a');
    explorerLink.href = 'funds-explorer.html';
    explorerLink.className = 'nav-item';
    explorerLink.innerHTML = '<span class="nav-icon">&rsaquo;</span><span class="nav-label">Funds Explorer</span>';
    subnav.appendChild(explorerLink);
  }

  let leadGenLink = subnav.querySelector('a[href$="lead-generation.html"]');
  if (!leadGenLink) {
    leadGenLink = document.createElement('a');
    leadGenLink.href = 'lead-generation.html';
    leadGenLink.className = 'nav-item';
    leadGenLink.innerHTML = '<span class="nav-icon">&rsaquo;</span><span class="nav-label">Lead Generation</span>';
    subnav.appendChild(leadGenLink);
  }

  if (donorsLink.nextElementSibling !== subnav) {
    donorsLink.insertAdjacentElement('afterend', subnav);
  }

  const page = String(location.pathname || '').split('/').pop().toLowerCase() || 'index.html';
  const onDonorsPage = page === 'donors.html';
  const onExplorerPage = page === 'funds-explorer.html';
  const onLeadGenPage = page === 'lead-generation.html';
  donorsLink.classList.toggle('active', onDonorsPage || onExplorerPage || onLeadGenPage);
  explorerLink.classList.toggle('active', onExplorerPage);
  leadGenLink.classList.toggle('active', onLeadGenPage);

  const storiesLink = Array.from(sidebarNav.querySelectorAll('a[href]')).find((a) => /(^|\/)stories\.html$/i.test(a.getAttribute('href') || ''));
  setSidebarNavIcon(donorsLink, '💲');
  setSidebarNavIcon(storiesLink, '❤️');
}

function setSidebarNavIcon(link, iconText) {
  if (!link) return;
  const iconEl = link.querySelector('.nav-icon');
  if (!iconEl) return;
  iconEl.textContent = String(iconText || '');
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
    signoutBtn?.addEventListener('click', async () => {
      await backendAuthLogout();
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
                <input class="input" name="email" type="email" placeholder="name@organization.org" required>
              </div>
              <div class="input-group">
                <label class="input-label">Password</label>
                <input class="input" name="password" type="password" placeholder="Password" required>
              </div>
            <p class="text-muted text-caption">Sign in with an approved team account. If no admin exists yet, use the backend bootstrap flow.</p>
            <div id="authBootstrapNotice" class="text-caption" style="display:none; margin:8px 0; padding:10px 12px; border-radius:8px; border:1px solid rgba(245, 158, 11, 0.35); background:rgba(245, 158, 11, 0.12); color:#f59e0b;"></div>
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
      clearBackendAuthToken();
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
    modal.querySelector('#authForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target));
      const errorEl = modal.querySelector('#authErrorMessage');
      const result = await signInWithCredentials(data.email, data.password);
      if (!result.ok) {
        const bootstrapStatus = await fetchAuthBootstrapStatus(true);
        renderAuthBootstrapNotice(bootstrapStatus);
        if (errorEl) {
          errorEl.style.display = 'block';
          errorEl.textContent = bootstrapStatus?.needs_bootstrap
            ? 'Initial administrator setup is required before sign in.'
            : result.error;
        }
        toggleAuthSignupCta(result.error, data.email, bootstrapStatus);
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
  renderAuthBootstrapNotice({ needs_bootstrap: false, bootstrap_token_configured: false });
  toggleAuthSignupCta('', '', { needs_bootstrap: false, bootstrap_token_configured: false });
  modal.classList.add('active');
  refreshAuthBootstrapNotice();
}

function renderAuthBootstrapNotice(status) {
  const notice = document.getElementById('authBootstrapNotice');
  if (!notice) return;
  if (!status?.needs_bootstrap) {
    notice.style.display = 'none';
    notice.textContent = '';
    return;
  }
  notice.style.display = 'block';
  if (status.bootstrap_token_configured) {
    notice.textContent = 'Setup required: no active administrator account exists. Use the bootstrap API to create the first admin account.';
  } else {
    notice.textContent = 'Setup required: no active administrator exists and AUTH_BOOTSTRAP_TOKEN is not configured on the server.';
  }
}

async function refreshAuthBootstrapNotice() {
  const status = await fetchAuthBootstrapStatus(true);
  renderAuthBootstrapNotice(status);
}

function toggleAuthSignupCta(errorMessage, email = '', bootstrapStatus = null) {
  const cta = document.getElementById('authSignupCta');
  if (!cta) return;
  if (bootstrapStatus?.needs_bootstrap) {
    cta.style.display = 'none';
    delete cta.dataset.prefillEmail;
    return;
  }
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
                <label class="input-label">Account Setup</label>
                <input class="input" value="Administrator will set a temporary password after approval." disabled>
              </div>
              <div class="input-group">
                <label class="input-label">Approval Notice</label>
                <input class="input" value="You will receive credentials after request review." disabled>
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
  ensurePagePermissionSchema();
  const session = getSession();
  const role = normalizeRole(session.role || 'visitor');
  const path = getCurrentPageKey();

  document.querySelectorAll('.sidebar a[href], .sidebar-footer a[href], .topbar a.nav-link[href], .landing-footer-links a[href]').forEach((link) => {
    const pageKey = normalizePageKey(link.getAttribute('href'));
    if (!pageKey) return;
    const allowed = canRoleAccessPage(role, pageKey, session);
    if (!allowed) {
      link.hidden = true;
      link.setAttribute('aria-hidden', 'true');
      link.classList.add('is-disabled');
      link.setAttribute('aria-disabled', 'true');
      link.title = `Access restricted for ${capitalize(role)} accounts.`;
      if (!link.dataset.permissionBound) {
        link.addEventListener('click', (e) => {
          if (canRoleAccessPage(normalizeRole(getSession().role || 'visitor'), pageKey, getSession())) return;
          e.preventDefault();
          notify('Restricted page', `Your account does not have access to ${prettyPageLabel(pageKey)}.`, [role]);
          if (!getSession().loggedIn) openSignInModal();
        });
        link.dataset.permissionBound = 'true';
      }
    } else {
      link.hidden = false;
      link.removeAttribute('aria-hidden');
      link.classList.remove('is-disabled');
      link.removeAttribute('aria-disabled');
      if (link.title && /Access restricted|Sign in/.test(link.title)) link.title = '';
    }
  });

  document.querySelectorAll('.sidebar-subnav').forEach((subnav) => {
    const visibleLinks = Array.from(subnav.querySelectorAll('a[href]')).filter((a) => !a.hidden);
    subnav.hidden = visibleLinks.length === 0;
  });

  if (path && !canRoleAccessPage(role, path, session)) {
    notify('Access restricted', `You were redirected because ${capitalize(role)} accounts cannot access ${prettyPageLabel(path)}.`, [role]);
    location.replace('/');
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
    flashNotificationBell(4000);
  }
}

function initNotifications() {
  const bellBtn = getNotificationBellButton();
  if (!bellBtn) return;
  ensureNotificationBellFlashStyles();

  bellBtn.type = 'button';
  bellBtn.dataset.appControl = 'notifications';
  bellBtn.addEventListener('click', (e) => {
    e.preventDefault();
    toggleNotificationPanel(bellBtn);
  });

  updateNotificationBadge();
}

function flashNotificationBell(durationMs = 4000) {
  const bell = getNotificationBellButton();
  if (!bell) return;
  bell.classList.add('notification-bell-flash');
  if (bell.__flashTimer) clearTimeout(bell.__flashTimer);
  bell.__flashTimer = setTimeout(() => {
    bell.classList.remove('notification-bell-flash');
    bell.__flashTimer = null;
  }, Math.max(250, Number(durationMs || 4000)));
}

function ensureNotificationBellFlashStyles() {
  if (document.getElementById('fundsNotificationBellFlashStyles')) return;
  const style = document.createElement('style');
  style.id = 'fundsNotificationBellFlashStyles';
  style.textContent = `
    .icon-btn.notification-bell-flash { animation: fundsBellShake .55s ease-in-out infinite; transform-origin: 50% 10%; }
    .icon-btn.notification-bell-flash::after {
      content:'';
      position:absolute;
      inset:-4px;
      border-radius:999px;
      border:1px solid rgba(var(--accent-green-rgb), .5);
      animation: fundsBellHalo .9s ease-out infinite;
      pointer-events:none;
    }
    @keyframes fundsBellShake {
      0%,100% { transform: rotate(0deg) scale(1); filter: brightness(1); }
      15% { transform: rotate(-14deg) scale(1.03); filter: brightness(1.08); }
      30% { transform: rotate(12deg) scale(1.02); }
      45% { transform: rotate(-9deg) scale(1.03); }
      60% { transform: rotate(7deg) scale(1.01); }
      75% { transform: rotate(-4deg) scale(1.02); }
    }
    @keyframes fundsBellHalo {
      0% { box-shadow: 0 0 0 0 rgba(var(--accent-green-rgb), .28); opacity:.75; }
      80% { box-shadow: 0 0 0 10px rgba(var(--accent-green-rgb), 0); opacity:0; }
      100% { opacity:0; }
    }
  `;
  document.head.appendChild(style);
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
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        <button type="button" class="btn btn-secondary btn-pill" data-mark-read>Mark all read</button>
        <button type="button" class="btn btn-secondary btn-pill" data-clear-read>Clear read</button>
      </div>
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
  panel.querySelector('[data-clear-read]')?.addEventListener('click', () => {
    removeReadNotifications();
    toggleNotificationPanel(anchor);
    toggleNotificationPanel(anchor);
  });
  panel.querySelectorAll('[data-notification-id]').forEach((el) => {
    el.addEventListener('click', (e) => {
      const removeBtn = e.target.closest('[data-remove-notification-id]');
      const id = String(el.getAttribute('data-notification-id') || '');
      if (!id) return;
      if (removeBtn) {
        e.preventDefault();
        e.stopPropagation();
        removeNotificationById(id);
      } else {
        markNotificationRead(id);
      }
      toggleNotificationPanel(anchor);
      toggleNotificationPanel(anchor);
    });
  });

  const rect = anchor.getBoundingClientRect();
  panel.style.top = `${rect.bottom + 8 + window.scrollY}px`;
  panel.style.left = `${Math.max(12, rect.right - 360 + window.scrollX)}px`;
  panel.classList.add('is-open');
}

function renderNotificationItem(item) {
  return `
    <div class="app-popover-item ${item.read ? '' : 'is-unread'}" data-notification-id="${escapeHtml(item.id)}" role="button" tabindex="0">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">
        <div class="app-popover-item-title">${escapeHtml(item.title)}</div>
        <button type="button" class="btn btn-secondary btn-pill" data-remove-notification-id="${escapeHtml(item.id)}" style="padding:2px 8px; min-height:auto;">×</button>
      </div>
      ${item.body ? `<div class="app-popover-item-body">${escapeHtml(item.body)}</div>` : ''}
      <div class="app-popover-item-time">${escapeHtml(formatRelativeTime(item.createdAt))}</div>
    </div>
  `;
}

function markNotificationRead(id) {
  const target = String(id || '');
  if (!target) return;
  setNotifications(getNotifications().map((n) => (n.id === target ? { ...n, read: true } : n)));
}

function removeNotificationById(id) {
  const target = String(id || '');
  if (!target) return;
  setNotifications(getNotifications().filter((n) => n.id !== target));
}

function removeReadNotifications() {
  setNotifications(getNotifications().filter((n) => !n.read));
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

function getCurrentPageKey() {
  return normalizePageKey(location.pathname.split('/').pop() || 'index.html');
}

function normalizePageKey(href) {
  const raw = String(href || '').trim();
  if (!raw) return '';
  if (/^(https?:|mailto:|tel:|javascript:)/i.test(raw)) return '';
  const path = raw.split('#')[0].split('?')[0];
  const page = path.split('/').pop() || '';
  if (!page || !/\.html?$/i.test(page)) return '';
  return page.toLowerCase();
}

function prettyPageLabel(pageKey) {
  const key = normalizePageKey(pageKey);
  if (!key) return 'this page';
  const schema = getPagePermissionSchema();
  return schema.pages?.[key]?.label || key.replace(/\.html?$/i, '').replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function defaultPagePermissionRoles(pageKey) {
  const key = normalizePageKey(pageKey);
  const base = { administrator: true, member: true, visitor: true };
  if (!key) return base;
  const visitorPublicPages = new Set([
    'landing.html',
    'public-animals.html',
    'public-events.html',
    'public-impact.html',
    'public-help.html',
  ]);
  const internalNavPages = new Set([
    'index.html',
    'campaigns.html',
    'donors.html',
    'funds-explorer.html',
    'lead-generation.html',
    'analytics.html',
    'impact-reports.html',
    'animals.html',
    'events.html',
    'communications.html',
    'stories.html',
    'team.html',
    'settings.html',
    'member-profile.html',
    'donor-profile.html',
    'help.html',
  ]);
  if (['settings.html', 'team.html'].includes(key)) {
    return { administrator: true, member: false, visitor: false };
  }
  if (internalNavPages.has(key) && !visitorPublicPages.has(key)) {
    return { administrator: true, member: true, visitor: false };
  }
  return base;
}

function inferPageLabel(pageKey, fallbackText = '') {
  const key = normalizePageKey(pageKey);
  const fromNav = Array.from(document.querySelectorAll(`a[href$="${key}"] .nav-label`)).map((n) => (n.textContent || '').trim()).find(Boolean);
  if (fromNav) return fromNav;
  const fromTitle = String(document.querySelector('.page-title')?.textContent || '').trim();
  if (fromTitle && key === getCurrentPageKey()) return fromTitle;
  if (fallbackText) return String(fallbackText).trim();
  return prettyPageLabel(key);
}

function discoverPagesFromDom() {
  const pages = new Map();
  document.querySelectorAll('a[href]').forEach((a) => {
    const key = normalizePageKey(a.getAttribute('href'));
    if (!key) return;
    const labelEl = a.querySelector('.nav-label');
    const label = (labelEl?.textContent || a.textContent || '').trim();
    if (!pages.has(key)) pages.set(key, { key, label: inferPageLabel(key, label) });
  });
  const current = getCurrentPageKey();
  if (current) {
    pages.set(current, { key: current, label: inferPageLabel(current) });
  }
  return Array.from(pages.values());
}

function normalizePermissionSchema(raw) {
  const out = { pages: {}, updated_at: new Date().toISOString() };
  const src = raw && typeof raw === 'object' ? raw : {};
  const pages = src.pages && typeof src.pages === 'object' ? src.pages : {};
  Object.entries(pages).forEach(([page, entry]) => {
    const key = normalizePageKey(page);
    if (!key) return;
    const e = entry && typeof entry === 'object' ? entry : {};
    const defaults = defaultPagePermissionRoles(key);
    out.pages[key] = {
      key,
      label: String(e.label || inferPageLabel(key)),
      roles: {
        administrator: typeof e.roles?.administrator === 'boolean' ? e.roles.administrator : defaults.administrator,
        member: typeof e.roles?.member === 'boolean' ? e.roles.member : defaults.member,
        visitor: typeof e.roles?.visitor === 'boolean' ? e.roles.visitor : defaults.visitor,
      },
      discovered_at: e.discovered_at || new Date().toISOString(),
      updated_at: e.updated_at || new Date().toISOString(),
    };
  });
  out.updated_at = src.updated_at || new Date().toISOString();
  return out;
}

function getPagePermissionSchema() {
  try {
    return normalizePermissionSchema(JSON.parse(localStorage.getItem(APP_KEYS.pagePermissions) || 'null'));
  } catch {
    return normalizePermissionSchema(null);
  }
}

function setPagePermissionSchema(schema) {
  localStorage.setItem(APP_KEYS.pagePermissions, JSON.stringify(normalizePermissionSchema(schema)));
}

function ensurePagePermissionSchema() {
  const schema = getPagePermissionSchema();
  let changed = false;
  for (const page of discoverPagesFromDom()) {
    const key = page.key;
    if (!key) continue;
    if (!schema.pages[key]) {
      schema.pages[key] = {
        key,
        label: page.label || inferPageLabel(key),
        roles: defaultPagePermissionRoles(key),
        discovered_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      changed = true;
      continue;
    }
    const newLabel = page.label || inferPageLabel(key);
    if (newLabel && schema.pages[key].label !== newLabel) {
      schema.pages[key].label = newLabel;
      schema.pages[key].updated_at = new Date().toISOString();
      changed = true;
    }
  }
  if (changed) {
    schema.updated_at = new Date().toISOString();
    setPagePermissionSchema(schema);
  }
  return schema;
}

function canRoleAccessPage(role, pageKey, sessionLike = null) {
  const session = sessionLike || getSession();
  const normalizedRole = normalizeRole(role || session.role || 'visitor');
  const key = normalizePageKey(pageKey);
  if (!key) return true;
  const schema = getPagePermissionSchema();
  const entry = schema.pages?.[key];
  const defaults = defaultPagePermissionRoles(key);
  const roles = entry?.roles || defaults;
  const isLoggedIn = !!session.loggedIn;
  // Administrator and Member accounts require login; visitors do not.
  if ((normalizedRole === 'administrator' || normalizedRole === 'member') && !isLoggedIn) return false;
  return !!roles[normalizedRole];
}

function setPageRolePermission(pageKey, role, allowed) {
  const key = normalizePageKey(pageKey);
  const normalizedRole = normalizeRole(role);
  if (!key || !['administrator', 'member', 'visitor'].includes(normalizedRole)) {
    return { ok: false, error: 'Invalid page or role.' };
  }
  const schema = ensurePagePermissionSchema();
  if (!schema.pages[key]) {
    schema.pages[key] = {
      key,
      label: inferPageLabel(key),
      roles: defaultPagePermissionRoles(key),
      discovered_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }
  schema.pages[key].roles[normalizedRole] = !!allowed;
  schema.pages[key].updated_at = new Date().toISOString();
  schema.updated_at = new Date().toISOString();
  setPagePermissionSchema(schema);
  return { ok: true, schema };
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

function getExplorerDiscoveryJobState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(APP_KEYS.explorerDiscoveryJob) || 'null');
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {}
  return null;
}

function setExplorerDiscoveryJobState(nextState) {
  if (!nextState) {
    localStorage.removeItem(APP_KEYS.explorerDiscoveryJob);
    window.dispatchEvent(new CustomEvent('funds:explorer-job-update', { detail: null }));
    return null;
  }
  const merged = {
    ...getExplorerDiscoveryJobState(),
    ...nextState,
    updatedAtLocal: new Date().toISOString(),
  };
  localStorage.setItem(APP_KEYS.explorerDiscoveryJob, JSON.stringify(merged));
  window.dispatchEvent(new CustomEvent('funds:explorer-job-update', { detail: merged }));
  return merged;
}

function clearExplorerDiscoveryJobState() {
  setExplorerDiscoveryJobState(null);
}

let explorerDiscoveryMonitorStarted = false;
let explorerDiscoveryPollTimer = null;
let explorerDiscoveryPollInFlight = false;

function initExplorerDiscoveryMonitor() {
  if (explorerDiscoveryMonitorStarted) return;
  explorerDiscoveryMonitorStarted = true;

  window.addEventListener('storage', (event) => {
    if (event.key === APP_KEYS.explorerDiscoveryJob) {
      window.dispatchEvent(new CustomEvent('funds:explorer-job-update', { detail: getExplorerDiscoveryJobState() }));
    }
  });

  const tick = () => { pollExplorerDiscoveryJob().catch(() => {}); };
  tick();
  explorerDiscoveryPollTimer = window.setInterval(tick, 2500);
}

async function pollExplorerDiscoveryJob() {
  const state = getExplorerDiscoveryJobState();
  if (!state?.job_id) return;
  if (explorerDiscoveryPollInFlight) return;
  const status = String(state.status || '').toLowerCase();
  if (status && ['completed', 'failed', 'cancelled'].includes(status)) return;

  explorerDiscoveryPollInFlight = true;
  try {
    const response = await fetch(`/api/explorer/discover/jobs/${encodeURIComponent(state.job_id)}`);
    if (!response.ok) {
      if (response.status === 404) {
        handleExplorerJobMonitorNotification({ ...state, status: 'failed', message: 'Explorer search job no longer exists.' });
        setExplorerDiscoveryJobState({ ...state, status: 'failed', message: 'Explorer search job no longer exists.' });
      }
      return;
    }
    const payload = await response.json();
    const job = payload?.job || {};
    const next = setExplorerDiscoveryJobState({
      job_id: job.job_id || state.job_id,
      status: job.status || state.status || 'running',
      progress: typeof job.progress === 'number' ? job.progress : (state.progress || 0),
      step: job.step || state.step || '',
      message: job.message || state.message || '',
      result: job.result || state.result || null,
      error: job.error || null,
      started_at: job.started_at || state.started_at || null,
      finished_at: job.finished_at || state.finished_at || null,
      created_at: job.created_at || state.created_at || null,
      notifications: state.notifications || {},
    });
    handleExplorerJobMonitorNotification(next);
  } catch {
    // Silent poll failure; next tick may recover.
  } finally {
    explorerDiscoveryPollInFlight = false;
  }
}

function handleExplorerJobMonitorNotification(state) {
  if (!state?.job_id) return;
  const notificationsState = { ...(state.notifications || {}) };
  const status = String(state.status || '').toLowerCase();
  const step = String(state.step || '').toLowerCase();
  const msg = String(state.message || '').trim();
  let changed = false;

  if (status === 'warning' && msg && notificationsState.lastWarningMessage !== msg) {
    notify('Funds Explorer Issue', msg, ['all']);
    notificationsState.lastWarningMessage = msg;
    changed = true;
  }

  if (status === 'failed' && !notificationsState.failed) {
    notify('Funds Explorer Failed', msg || 'The donor discovery search encountered an error.', ['all']);
    notificationsState.failed = true;
    changed = true;
  }

  if (status === 'completed' && !notificationsState.completed) {
    const result = state.result || {};
    const saved = Number(result.saved_count || 0);
    const matched = Number(result.matched_count || saved);
    notify('Funds Explorer Complete', `Imported ${saved} organization${saved === 1 ? '' : 's'} (${matched} matched).`, ['all']);
    notificationsState.completed = true;
    changed = true;
  }

  if (step === 'starting' && status === 'running' && !notificationsState.started) {
    notify('Funds Explorer Started', msg || 'A donor discovery search is now running.', ['all']);
    notificationsState.started = true;
    changed = true;
  }

  if (changed) {
    setExplorerDiscoveryJobState({ ...state, notifications: notificationsState });
  }
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

function ensureDataLoadGuardStyles() {
  let styleEl = document.getElementById('fundsDataLoadGuardStyle');
  if (styleEl) return;
  styleEl = document.createElement('style');
  styleEl.id = 'fundsDataLoadGuardStyle';
  styleEl.textContent = `
    .funds-data-guard-host { position: relative; }
    .funds-data-guard-host[data-funds-loading="true"] > * { visibility: hidden; }
    .funds-data-guard-overlay {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: none;
      border-radius: inherit;
      background: linear-gradient(180deg, rgba(0,0,0,0.18), rgba(0,0,0,0.06));
      backdrop-filter: blur(2px);
      z-index: 2;
    }
    [data-theme="light"] .funds-data-guard-overlay {
      background: linear-gradient(180deg, rgba(255,255,255,0.84), rgba(255,255,255,0.65));
    }
    .funds-data-guard-card {
      min-width: 260px;
      max-width: 420px;
      padding: 14px 16px;
      border-radius: 14px;
      border: 1px solid rgba(var(--accent-green-rgb, 16, 185, 129), 0.25);
      background: rgba(10, 14, 20, 0.88);
      box-shadow: 0 14px 26px rgba(0, 0, 0, 0.28);
      color: var(--text-primary);
      text-align: center;
    }
    [data-theme="light"] .funds-data-guard-card {
      background: rgba(255,255,255,0.92);
      box-shadow: 0 12px 22px rgba(20, 28, 45, 0.12);
    }
    .funds-data-guard-title {
      font-size: var(--text-small);
      color: var(--text-secondary);
      margin-bottom: 10px;
    }
    .funds-data-guard-track {
      height: 8px;
      border-radius: 999px;
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.08);
      overflow: hidden;
      position: relative;
    }
    [data-theme="light"] .funds-data-guard-track {
      background: rgba(20, 28, 45, 0.05);
      border-color: rgba(20, 28, 45, 0.08);
    }
    .funds-data-guard-track::before {
      content: "";
      position: absolute;
      inset: 0;
      width: 42%;
      border-radius: 999px;
      background: linear-gradient(90deg, transparent, rgba(var(--accent-green-rgb,16,185,129),0.95), transparent);
      animation: fundsDataGuardSweep 1.3s linear infinite;
    }
    @keyframes fundsDataGuardSweep {
      from { transform: translateX(-120%); }
      to { transform: translateX(260%); }
    }
  `;
  document.head.appendChild(styleEl);
}

function createDataLoadGuard(options = {}) {
  ensureDataLoadGuardStyles();
  const target = typeof options.target === 'string' ? document.querySelector(options.target) : options.target;
  if (!target) return null;
  const title = String(options.message || 'Loading live data...');
  let originalHtml = null;
  let overlay = null;
  let active = false;
  const bodyPreloadManaged = document.body?.dataset?.apiPage === 'true';

  function start() {
    if (active) return;
    active = true;
    if (bodyPreloadManaged) {
      document.body.dataset.apiPageState = 'loading';
    }
    if (originalHtml == null) originalHtml = target.innerHTML;
    if (bodyPreloadManaged) return;
    target.classList.add('funds-data-guard-host');
    target.dataset.fundsLoading = 'true';
    target.setAttribute('aria-busy', 'true');
    overlay = document.createElement('div');
    overlay.className = 'funds-data-guard-overlay';
    overlay.innerHTML = `
      <div class="funds-data-guard-card">
        <div class="funds-data-guard-title">${escapeHtml(title)}</div>
        <div class="funds-data-guard-track"></div>
      </div>
    `;
    target.appendChild(overlay);
  }

  function success() {
    if (!active) return;
    active = false;
    if (bodyPreloadManaged) {
      document.body.dataset.apiPageState = 'ready';
      return;
    }
    target.dataset.fundsLoading = 'false';
    target.removeAttribute('aria-busy');
    overlay?.remove();
    overlay = null;
  }

  function fail(opts = {}) {
    if (!active) return;
    if (bodyPreloadManaged) {
      document.body.dataset.apiPageState = 'error';
      active = false;
      return;
    }
    if (opts.restoreFallback !== false && originalHtml != null && !target.dataset.fundsGuardPreserveCurrent) {
      target.innerHTML = originalHtml;
    }
    success();
  }

  return { start, success, fail, target };
}

let activeGlobalConfirmResolver = null;

function ensureGlobalConfirmModal() {
  let modal = document.getElementById('globalConfirmModal');
  if (modal) return modal;
  const host = document.createElement('div');
  host.innerHTML = `
    <div class="modal" id="globalConfirmModal" aria-hidden="true">
      <div class="modal-backdrop" data-confirm-cancel></div>
      <div class="modal-content" style="max-width:560px;">
        <div class="modal-header">
          <div>
            <h2 class="modal-title" id="globalConfirmTitle">Confirm Action</h2>
            <p id="globalConfirmSubtitle" style="margin:6px 0 0;color:var(--text-secondary);font-size:var(--text-small);"></p>
          </div>
          <button type="button" class="modal-close" data-confirm-cancel aria-label="Close confirmation dialog">×</button>
        </div>
        <div class="modal-body">
          <p id="globalConfirmMessage" style="margin:0;color:var(--text-secondary);line-height:1.6;"></p>
          <div class="modal-actions" style="margin-top:var(--spacing-lg);">
            <button type="button" class="btn btn-secondary" data-confirm-cancel id="globalConfirmCancelBtn">Cancel</button>
            <button type="button" class="btn btn-primary" id="globalConfirmOkBtn">Confirm</button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(host.firstElementChild);
  modal = document.getElementById('globalConfirmModal');

  modal.querySelectorAll('[data-confirm-cancel]').forEach((el) => {
    el.addEventListener('click', () => resolveGlobalConfirm(false));
  });
  modal.querySelector('#globalConfirmOkBtn')?.addEventListener('click', () => resolveGlobalConfirm(true));
  document.addEventListener('keydown', (event) => {
    if (!modal.classList.contains('active')) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      resolveGlobalConfirm(false);
    }
    if (event.key === 'Enter') {
      const targetTag = String(event.target?.tagName || '').toLowerCase();
      if (['input', 'textarea', 'select'].includes(targetTag)) return;
      event.preventDefault();
      resolveGlobalConfirm(true);
    }
  });
  return modal;
}

function resolveGlobalConfirm(confirmed) {
  const modal = document.getElementById('globalConfirmModal');
  if (modal) {
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
  }
  const resolver = activeGlobalConfirmResolver;
  activeGlobalConfirmResolver = null;
  if (typeof resolver === 'function') resolver(!!confirmed);
}

function confirmDialog(options = {}) {
  const modal = ensureGlobalConfirmModal();
  if (activeGlobalConfirmResolver) {
    // Resolve any prior pending dialog as cancelled before opening a new one.
    resolveGlobalConfirm(false);
  }
  const title = String(options.title || 'Confirm Action');
  const message = String(options.message || 'Are you sure you want to continue?');
  const subtitle = String(options.subtitle || '');
  const confirmLabel = String(options.confirmLabel || 'Confirm');
  const cancelLabel = String(options.cancelLabel || 'Cancel');
  const confirmVariant = String(options.confirmVariant || 'primary');

  modal.querySelector('#globalConfirmTitle').textContent = title;
  modal.querySelector('#globalConfirmMessage').textContent = message;
  const subtitleEl = modal.querySelector('#globalConfirmSubtitle');
  subtitleEl.textContent = subtitle;
  subtitleEl.style.display = subtitle ? '' : 'none';

  const okBtn = modal.querySelector('#globalConfirmOkBtn');
  const cancelBtn = modal.querySelector('#globalConfirmCancelBtn');
  okBtn.textContent = confirmLabel;
  cancelBtn.textContent = cancelLabel;
  okBtn.classList.remove('btn-primary', 'btn-secondary');
  okBtn.classList.add(confirmVariant === 'danger' ? 'btn-secondary' : 'btn-primary');
  if (confirmVariant === 'danger') {
    okBtn.style.borderColor = 'rgba(239, 68, 68, 0.45)';
    okBtn.style.background = 'linear-gradient(135deg, rgba(239,68,68,0.24), rgba(185,28,28,0.30))';
    okBtn.style.color = '#FEE2E2';
    okBtn.style.boxShadow = '0 8px 18px rgba(239, 68, 68, 0.18)';
  } else {
    okBtn.style.borderColor = '';
    okBtn.style.background = '';
    okBtn.style.color = '';
    okBtn.style.boxShadow = '';
  }

  modal.classList.add('active');
  modal.setAttribute('aria-hidden', 'false');
  window.setTimeout(() => okBtn?.focus(), 0);

  return new Promise((resolve) => {
    activeGlobalConfirmResolver = resolve;
  });
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

function hashString(value) {
  let h = 2166136261 >>> 0;
  const s = String(value || '');
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededRandom(seed) {
  let t = seed >>> 0;
  return function rand() {
    t += 0x6D2B79F5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function generateAnimalAvatarDataUrl(seed = '') {
  const animals = ['🐶', '🐱', '🐰', '🦊', '🐼', '🐨', '🦝', '🐹', '🦉', '🐢'];
  const palettes = [
    ['#10B981', '#059669'],
    ['#3B82F6', '#1D4ED8'],
    ['#F59E0B', '#D97706'],
    ['#EC4899', '#BE185D'],
    ['#8B5CF6', '#6D28D9'],
    ['#14B8A6', '#0F766E'],
  ];
  const rng = seededRandom(hashString(seed || `${Date.now()}-${Math.random()}`));
  const animal = animals[Math.floor(rng() * animals.length)] || '🐾';
  const [c1, c2] = palettes[Math.floor(rng() * palettes.length)] || palettes[0];
  const dotColor = palettes[Math.floor(rng() * palettes.length)]?.[0] || '#FFFFFF';
  const dots = Array.from({ length: 6 }, () => ({
    x: Math.round(10 + rng() * 108),
    y: Math.round(10 + rng() * 108),
    r: Math.round(2 + rng() * 5),
    o: (0.12 + rng() * 0.24).toFixed(2),
  }));
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${c1}"/>
      <stop offset="100%" stop-color="${c2}"/>
    </linearGradient>
  </defs>
  <rect width="128" height="128" rx="28" fill="url(#g)"/>
  <circle cx="104" cy="22" r="18" fill="rgba(255,255,255,0.12)"/>
  ${dots.map((d) => `<circle cx="${d.x}" cy="${d.y}" r="${d.r}" fill="${dotColor}" opacity="${d.o}"/>`).join('')}
  <circle cx="64" cy="64" r="34" fill="rgba(255,255,255,0.14)"/>
  <text x="64" y="75" text-anchor="middle" font-size="40">${animal}</text>
</svg>`.trim();
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const avatarFetchCache = new Map();
async function generateAnimalAvatar(seed = '', options = {}) {
  const normalizedSeed = String(seed || '').trim();
  if (!normalizedSeed) return generateAnimalAvatarDataUrl(`${Date.now()}-${Math.random()}`);
  if (avatarFetchCache.has(normalizedSeed)) return avatarFetchCache.get(normalizedSeed);
  const role = String(options.role || 'profile').trim().toLowerCase();
  const payload = {
    seed: normalizedSeed,
    email: options.email || '',
    name: options.name || options.full_name || '',
    role,
    record_id: options.record_id || '',
  };
  try {
    const res = await fetch('/api/avatars/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json().catch(() => ({}));
    const avatarUrl = String(data?.avatar_url || '').trim();
    if (avatarUrl) {
      avatarFetchCache.set(normalizedSeed, avatarUrl);
      return avatarUrl;
    }
  } catch {}
  const fallback = generateAnimalAvatarDataUrl(normalizedSeed);
  avatarFetchCache.set(normalizedSeed, fallback);
  return fallback;
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
  getExplorerDiscoveryJobState,
  setExplorerDiscoveryJobState,
  clearExplorerDiscoveryJobState,
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
  getBackendAuthToken,
  backendAuthLogout,
  apiJson,
  clearApiResponseCache,
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
  generateAnimalAvatarDataUrl,
  generateAnimalAvatar,
  getPagePermissionSchema,
  ensurePagePermissionSchema,
  setPageRolePermission,
  canRoleAccessPage,
  prettyPageLabel,
  openSignInModal,
  openSignUpRequestModal,
  confirmDialog,
  createDataLoadGuard,
  closeModal,
};
