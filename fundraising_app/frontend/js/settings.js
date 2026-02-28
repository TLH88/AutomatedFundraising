/**
 * Settings page enhancements (user administration / account password)
 */

const SettingsPage = (() => {

  function isPage() {
    return (location.pathname.split('/').pop() || '').toLowerCase() === 'settings.html' &&
      !!document.querySelector('.settings-grid');
  }

  function init() {
    if (!isPage() || !window.FundsApp) return;
    injectAdminPasswordCard();
    injectBrandingCard();
    injectPagePermissionsCard();
    injectSettingsNavigatorCard();
    bindAdminPasswordForm();
    bindBrandingForm();
    bindPagePermissionsCard();
    bindSettingsNavigatorCard();
  }

  function injectAdminPasswordCard() {
    const grid = document.querySelector('.settings-grid');
    if (!grid || document.getElementById('defaultAdminPasswordCard')) return;

    const account = window.FundsApp.findAccountByEmail?.(session?.email) || null;
    const session = window.FundsApp.getSession?.() || { role: 'visitor', loggedIn: false };
    const role = window.FundsApp.normalizeRole?.(session.role) || 'visitor';
    const canManage = session.loggedIn && role === 'administrator';

    const card = document.createElement('div');
    card.className = 'card';
    card.id = 'defaultAdminPasswordCard';
    card.innerHTML = `
      <div class="card-header"><h2 class="card-title">User Administration</h2></div>
      <div class="card-body">
        <form id="defaultAdminPasswordForm" class="form">
          <div class="input-group">
            <label class="label">Current Account</label>
            <input class="input" type="text" value="${escapeHtml(account?.email || session?.email || 'Not signed in')}" disabled>
          </div>
          <p class="text-muted text-caption" id="defaultAdminPasswordHelp">
            ${canManage
              ? 'Change the password for your signed-in administrator account.'
              : 'Only an Administrator can change account passwords from this page.'}
          </p>
          <div class="input-group">
            <label class="label">Current Password</label>
            <input class="input" name="current_password" type="password" placeholder="Current password" ${canManage ? '' : 'disabled'}>
          </div>
          <div class="input-group">
            <label class="label">New Password</label>
            <input class="input" name="new_password" type="password" placeholder="New password" ${canManage ? '' : 'disabled'}>
          </div>
          <div class="input-group">
            <label class="label">Confirm New Password</label>
            <input class="input" name="confirm_password" type="password" placeholder="Confirm new password" ${canManage ? '' : 'disabled'}>
          </div>
          <div class="modal-actions" style="justify-content:flex-start;">
            <button type="submit" class="btn btn-primary" id="defaultAdminPasswordSaveBtn" ${canManage ? '' : 'disabled'}>Update Password</button>
          </div>
        </form>
      </div>
    `;

    grid.prepend(card);
  }

  function bindAdminPasswordForm() {
    const form = document.getElementById('defaultAdminPasswordForm');
    if (!form) return;
    form.addEventListener('submit', onAdminPasswordSubmit);
  }

  function injectBrandingCard() {
    const grid = document.querySelector('.settings-grid');
    if (!grid || document.getElementById('brandingThemeCard')) return;
    const session = window.FundsApp.getSession?.() || { role: 'visitor', loggedIn: false };
    const role = window.FundsApp.normalizeRole?.(session.role) || 'visitor';
    const canManage = session.loggedIn && role === 'administrator';
    const savedColor = window.FundsApp.getSavedPrimaryThemeColor?.() || '#10B981';
    const savedLogo = window.FundsApp.getSavedBrandLogo?.() || '';
    const savedBrandName = window.FundsApp.getSavedBrandName?.() || '';

    const card = document.createElement('div');
    card.className = 'card';
    card.id = 'brandingThemeCard';
    card.innerHTML = `
      <div class="card-header"><h2 class="card-title">Branding & Theme</h2></div>
      <div class="card-body">
        <form id="brandingThemeForm" class="form">
          <div class="input-group">
            <label class="label">Global Primary Theme Color</label>
            <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
              <input type="color" class="input" id="globalThemeColorPicker" name="primary_color" value="${escapeHtml(savedColor)}" style="width:64px;padding:6px;height:44px;" ${canManage ? '' : 'disabled'}>
              <input type="text" class="input" id="globalThemeColorHex" value="${escapeHtml(savedColor)}" placeholder="#10B981" style="max-width:140px;" ${canManage ? '' : 'disabled'}>
              <button type="button" class="btn btn-secondary btn-pill" id="resetThemeColorBtn" ${canManage ? '' : 'disabled'}>Reset Color</button>
            </div>
            <p class="text-muted text-caption" style="margin-top:8px;">Updates the global primary accent color used across buttons, links, and inputs.</p>
          </div>

          <div class="input-group">
            <label class="label">Global Brand Name</label>
            <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
              <input type="text" class="input" id="globalBrandNameInput" value="${escapeHtml(savedBrandName)}" placeholder="Funds 4 Furry Friends" style="min-width:280px;flex:1;" ${canManage ? '' : 'disabled'}>
              <button type="button" class="btn btn-secondary btn-pill" id="resetBrandNameBtn" ${canManage ? '' : 'disabled'}>Reset Name</button>
            </div>
            <p class="text-muted text-caption" style="margin-top:8px;">Updates the brand text displayed next to the logo in the top header across pages.</p>
          </div>

          <div class="input-group">
            <label class="label">Global Site Logo</label>
            <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
              <div id="globalLogoPreview" style="width:72px;height:72px;border-radius:12px;border:1px solid var(--glass-border);display:flex;align-items:center;justify-content:center;background:var(--glass-bg);overflow:hidden;padding:6px;">
                ${savedLogo ? `<img src="${escapeHtml(savedLogo)}" alt="Logo preview" style="width:100%;height:100%;object-fit:contain;">` : '<span style="font-size:28px;">🐾</span>'}
              </div>
              <input type="file" id="globalLogoFile" accept="image/*" ${canManage ? '' : 'disabled'}>
              <button type="button" class="btn btn-secondary btn-pill" id="clearGlobalLogoBtn" ${canManage ? '' : 'disabled'}>Reset Logo</button>
            </div>
            <p class="text-muted text-caption" style="margin-top:8px;">Uploaded logo is applied to header branding across pages on this device. Header logo area renders at approximately <code>42 x 42 px</code>; use a square image with padding for best results.</p>
          </div>

          <div class="modal-actions" style="justify-content:flex-start;">
            <button type="submit" class="btn btn-primary" id="saveBrandingThemeBtn" ${canManage ? '' : 'disabled'}>Apply Branding</button>
          </div>
        </form>
      </div>
    `;
    grid.prepend(card);
  }

  function bindBrandingForm() {
    const form = document.getElementById('brandingThemeForm');
    if (!form) return;

    const colorPicker = document.getElementById('globalThemeColorPicker');
    const colorHex = document.getElementById('globalThemeColorHex');
    const logoFile = document.getElementById('globalLogoFile');
    const resetColorBtn = document.getElementById('resetThemeColorBtn');
    const clearLogoBtn = document.getElementById('clearGlobalLogoBtn');
    const brandNameInput = document.getElementById('globalBrandNameInput');
    const resetBrandNameBtn = document.getElementById('resetBrandNameBtn');

    colorPicker?.addEventListener('input', () => {
      if (colorHex) colorHex.value = colorPicker.value;
      window.FundsApp.setPrimaryThemeColor?.(colorPicker.value);
    });

    colorHex?.addEventListener('change', () => {
      const result = window.FundsApp.setPrimaryThemeColor?.(colorHex.value);
      if (!result?.ok) {
        window.FundsApp.showToast(result?.error || 'Invalid color');
        colorHex.value = window.FundsApp.getSavedPrimaryThemeColor?.() || '#10B981';
        if (colorPicker) colorPicker.value = colorHex.value;
        return;
      }
      colorHex.value = result.color;
      if (colorPicker) colorPicker.value = result.color;
    });

    resetColorBtn?.addEventListener('click', () => {
      window.FundsApp.resetPrimaryThemeColor?.();
      const fallback = '#10B981';
      if (colorHex) colorHex.value = fallback;
      if (colorPicker) colorPicker.value = fallback;
      window.FundsApp.showToast('Theme color reset');
    });

    logoFile?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const dataUrl = await fileToDataUrl(file);
        window.FundsApp.setBrandLogo?.(dataUrl);
        updateLogoPreview(dataUrl);
        window.FundsApp.showToast('Logo updated');
      } catch (err) {
        console.error(err);
        window.FundsApp.showToast('Unable to load logo image');
      }
    });

    clearLogoBtn?.addEventListener('click', () => {
      window.FundsApp.clearBrandLogo?.();
      updateLogoPreview('');
      if (logoFile) logoFile.value = '';
      window.FundsApp.showToast('Logo reset');
    });

    brandNameInput?.addEventListener('change', () => {
      window.FundsApp.setBrandName?.(brandNameInput.value);
    });

    resetBrandNameBtn?.addEventListener('click', () => {
      window.FundsApp.clearBrandName?.();
      if (brandNameInput) brandNameInput.value = '';
      window.FundsApp.showToast('Brand name reset');
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (brandNameInput) window.FundsApp.setBrandName?.(brandNameInput.value);
      window.FundsApp.showToast('Branding applied');
    });
  }

  function injectPagePermissionsCard() {
    const grid = document.querySelector('.settings-grid');
    if (!grid || document.getElementById('pagePermissionsCard')) return;
    const session = window.FundsApp.getSession?.() || { role: 'visitor', loggedIn: false };
    const role = window.FundsApp.normalizeRole?.(session.role) || 'visitor';
    const canManage = session.loggedIn && role === 'administrator';
    const schema = window.FundsApp.ensurePagePermissionSchema?.() || window.FundsApp.getPagePermissionSchema?.() || { pages: {} };
    const rows = renderPermissionRows(schema);

    const card = document.createElement('div');
    card.className = 'card';
    card.id = 'pagePermissionsCard';
    card.innerHTML = `
      <div class="card-header"><h2 class="card-title">Page Permissions</h2></div>
      <div class="card-body">
        <p class="text-muted text-caption" style="margin-top:0;">
          Basic global page access control by account type. New pages are auto-detected from navigation links and added to this list with default permissions.
        </p>
        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-bottom:10px;">
          <button type="button" class="btn btn-secondary btn-pill" id="refreshPagePermissionsBtn" ${canManage ? '' : 'disabled'}>Detect New Pages</button>
          <span class="badge badge-info" id="pagePermissionsCountBadge">${Object.keys(schema.pages || {}).length} pages</span>
          <span class="text-muted text-caption" id="pagePermissionsUpdatedAt">Last updated: ${escapeHtml(formatDateTime(schema.updated_at))}</span>
        </div>
        <div style="overflow:auto; border:1px solid var(--glass-border); border-radius:12px;">
          <table style="width:100%; border-collapse:collapse; min-width:640px;">
            <thead>
              <tr style="text-align:left; color:var(--text-muted); font-size:12px; text-transform:uppercase; letter-spacing:.04em;">
                <th style="padding:10px 12px; border-bottom:1px solid var(--glass-border);">Page</th>
                <th style="padding:10px 12px; border-bottom:1px solid var(--glass-border); text-align:center;">Administrator</th>
                <th style="padding:10px 12px; border-bottom:1px solid var(--glass-border); text-align:center;">Member</th>
                <th style="padding:10px 12px; border-bottom:1px solid var(--glass-border); text-align:center;">Visitor</th>
              </tr>
            </thead>
            <tbody id="pagePermissionsTableBody">
              ${rows}
            </tbody>
          </table>
        </div>
        <p class="text-muted text-caption" style="margin:10px 0 0;">
          Administrators and Members still require sign-in. Visitors are read-only and page access is controlled here.
        </p>
      </div>
    `;
    grid.prepend(card);
  }

  function bindPagePermissionsCard() {
    const card = document.getElementById('pagePermissionsCard');
    if (!card) return;
    const session = window.FundsApp.getSession?.() || { role: 'visitor', loggedIn: false };
    const role = window.FundsApp.normalizeRole?.(session.role) || 'visitor';
    const canManage = session.loggedIn && role === 'administrator';

    card.querySelector('#refreshPagePermissionsBtn')?.addEventListener('click', () => {
      if (!canManage) return;
      window.FundsApp.ensurePagePermissionSchema?.();
      rerenderPagePermissionsTable();
      window.FundsApp.showToast?.('Page permission schema refreshed');
    });

    card.addEventListener('change', (e) => {
      const checkbox = e.target.closest?.('[data-page-perm-page][data-page-perm-role]');
      if (!checkbox) return;
      if (!canManage) {
        checkbox.checked = !checkbox.checked;
        window.FundsApp.notify?.('Permission denied', 'Only administrators can edit page permissions.', ['member', 'visitor']);
        return;
      }
      const page = checkbox.getAttribute('data-page-perm-page');
      const permRole = checkbox.getAttribute('data-page-perm-role');
      const result = window.FundsApp.setPageRolePermission?.(page, permRole, !!checkbox.checked);
      if (!result?.ok) {
        checkbox.checked = !checkbox.checked;
        window.FundsApp.showToast?.(result?.error || 'Unable to update permission');
        return;
      }
      updatePagePermissionsMeta(result.schema);
    });
  }

  function injectSettingsNavigatorCard() {
    const grid = document.querySelector('.settings-grid');
    if (!grid || document.getElementById('settingsNavigatorCard')) return;

    const options = getSettingsCardOptions(grid);
    const card = document.createElement('div');
    card.className = 'card';
    card.id = 'settingsNavigatorCard';
    card.style.gridColumn = '1 / -1';
    card.innerHTML = `
      <div class="card-header">
        <h2 class="card-title">Settings Navigator</h2>
      </div>
      <div class="card-body">
        <p class="text-muted text-caption" style="margin-top:0;">
          Select a settings area to work on. Other settings cards stay hidden until you choose one.
        </p>
        <div class="input-group" style="max-width:520px;">
          <label class="label" for="settingsCardPicker">Choose Setting</label>
          <select class="select" id="settingsCardPicker">
            <option value="">Select a setting...</option>
            ${options.map((opt) => `<option value="${escapeHtml(opt.id)}">${escapeHtml(opt.label)}</option>`).join('')}
          </select>
        </div>
        <div id="settingsNavigatorQuickList" style="display:flex; gap:8px; flex-wrap:wrap; margin-top:8px;">
          ${options.map((opt) => `
            <button type="button" class="btn btn-secondary btn-pill" data-settings-card-target="${escapeHtml(opt.id)}">
              ${escapeHtml(opt.label)}
            </button>
          `).join('')}
        </div>
        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-top:12px;">
          <button type="button" class="btn btn-secondary btn-pill" id="showAllSettingsCardsBtn">Show All</button>
          <button type="button" class="btn btn-secondary btn-pill" id="hideAllSettingsCardsBtn">Hide All</button>
          <span class="text-muted text-caption" id="settingsNavigatorStatus">No setting selected. All settings cards are hidden.</span>
        </div>
      </div>
    `;

    grid.prepend(card);
    // Start in hidden mode to declutter the page until a selection is made.
    hideAllSettingsCards();
  }

  function bindSettingsNavigatorCard() {
    const picker = document.getElementById('settingsCardPicker');
    const quickList = document.getElementById('settingsNavigatorQuickList');
    const showAllBtn = document.getElementById('showAllSettingsCardsBtn');
    const hideAllBtn = document.getElementById('hideAllSettingsCardsBtn');

    picker?.addEventListener('change', () => {
      const targetId = String(picker.value || '').trim();
      if (!targetId) {
        hideAllSettingsCards();
        updateSettingsNavigatorStatus('');
        return;
      }
      showOnlySettingsCard(targetId);
      updateSettingsNavigatorStatus(targetId);
    });

    quickList?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-settings-card-target]');
      if (!btn) return;
      const targetId = btn.getAttribute('data-settings-card-target');
      if (!targetId) return;
      if (picker) picker.value = targetId;
      showOnlySettingsCard(targetId);
      updateSettingsNavigatorStatus(targetId);
    });

    showAllBtn?.addEventListener('click', () => {
      showAllSettingsCards();
      if (picker) picker.value = '';
      updateSettingsNavigatorStatus('__all__');
    });

    hideAllBtn?.addEventListener('click', () => {
      hideAllSettingsCards();
      if (picker) picker.value = '';
      updateSettingsNavigatorStatus('');
    });
  }

  function getSettingsContentCards() {
    return Array.from(document.querySelectorAll('.settings-grid > .card'))
      .filter((card) => card.id !== 'settingsNavigatorCard');
  }

  function getSettingsCardOptions(grid = document.querySelector('.settings-grid')) {
    return Array.from(grid?.querySelectorAll(':scope > .card') || [])
      .filter((card) => card.id !== 'settingsNavigatorCard')
      .map((card, index) => {
        if (!card.id) card.id = `settingsCardAuto-${index + 1}`;
        const title = (card.querySelector('.card-title')?.textContent || '').trim() || `Settings Card ${index + 1}`;
        return { id: card.id, label: title };
      });
  }

  function hideAllSettingsCards() {
    getSettingsContentCards().forEach((card) => {
      card.style.display = 'none';
    });
  }

  function showAllSettingsCards() {
    getSettingsContentCards().forEach((card) => {
      card.style.display = '';
    });
  }

  function showOnlySettingsCard(cardId) {
    getSettingsContentCards().forEach((card) => {
      card.style.display = card.id === cardId ? '' : 'none';
    });
  }

  function updateSettingsNavigatorStatus(targetId) {
    const statusEl = document.getElementById('settingsNavigatorStatus');
    if (!statusEl) return;
    if (!targetId) {
      statusEl.textContent = 'No setting selected. All settings cards are hidden.';
      return;
    }
    if (targetId === '__all__') {
      statusEl.textContent = 'Showing all settings cards.';
      return;
    }
    const card = document.getElementById(targetId);
    const label = (card?.querySelector('.card-title')?.textContent || '').trim() || 'selected setting';
    statusEl.textContent = `Showing: ${label}`;
  }

  function rerenderPagePermissionsTable() {
    const body = document.getElementById('pagePermissionsTableBody');
    if (!body) return;
    const schema = window.FundsApp.getPagePermissionSchema?.() || { pages: {} };
    body.innerHTML = renderPermissionRows(schema);
    updatePagePermissionsMeta(schema);
  }

  function updatePagePermissionsMeta(schema) {
    const badge = document.getElementById('pagePermissionsCountBadge');
    const updated = document.getElementById('pagePermissionsUpdatedAt');
    if (badge) badge.textContent = `${Object.keys((schema && schema.pages) || {}).length} pages`;
    if (updated) updated.textContent = `Last updated: ${formatDateTime(schema?.updated_at)}`;
  }

  function renderPermissionRows(schema) {
    const session = window.FundsApp.getSession?.() || { role: 'visitor', loggedIn: false };
    const role = window.FundsApp.normalizeRole?.(session.role) || 'visitor';
    const canManage = session.loggedIn && role === 'administrator';
    const pages = Object.values((schema && schema.pages) || {})
      .sort((a, b) => String(a.label || a.key || '').localeCompare(String(b.label || b.key || '')));
    if (!pages.length) {
      return `<tr><td colspan="4" style="padding:12px; color:var(--text-muted);">No pages detected yet.</td></tr>`;
    }
    return pages.map((entry) => {
      const page = String(entry.key || '').toLowerCase();
      const label = String(entry.label || page);
      const roles = entry.roles || {};
      return `
        <tr>
          <td style="padding:10px 12px; border-bottom:1px solid var(--glass-border);">
            <div style="font-weight:600; color:var(--text-primary);">${escapeHtml(label)}</div>
            <div class="text-muted text-caption"><code>${escapeHtml(page)}</code></div>
          </td>
          ${renderPermCheckboxCell(page, 'administrator', !!roles.administrator, canManage)}
          ${renderPermCheckboxCell(page, 'member', !!roles.member, canManage)}
          ${renderPermCheckboxCell(page, 'visitor', !!roles.visitor, canManage)}
        </tr>
      `;
    }).join('');
  }

  function renderPermCheckboxCell(page, role, checked, canManage) {
    return `
      <td style="padding:10px 12px; border-bottom:1px solid var(--glass-border); text-align:center;">
        <input
          type="checkbox"
          data-page-perm-page="${escapeHtml(page)}"
          data-page-perm-role="${escapeHtml(role)}"
          ${checked ? 'checked' : ''}
          ${canManage ? '' : 'disabled'}
          aria-label="${escapeHtml(`Allow ${role} access to ${page}`)}">
      </td>
    `;
  }

  async function onAdminPasswordSubmit(e) {
    e.preventDefault();

    const session = window.FundsApp.getSession?.() || { role: 'visitor', loggedIn: false };
    const role = window.FundsApp.normalizeRole?.(session.role) || 'visitor';
    if (!session.loggedIn || role !== 'administrator') {
      window.FundsApp.notify('Permission denied', 'Only administrators can change account passwords from settings.', ['member', 'visitor']);
      return;
    }

    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    const current = String(data.current_password || '');
    const next = String(data.new_password || '');
    const confirm = String(data.confirm_password || '');

    if (!current || !next || !confirm) {
      window.FundsApp.showToast('Please complete all password fields');
      return;
    }
    if (next !== confirm) {
      window.FundsApp.showToast('New password and confirmation do not match');
      return;
    }
    if (next.length < 8) {
      window.FundsApp.showToast('New password must be at least 8 characters');
      return;
    }
    if (!/[A-Z]/.test(next) || !/[a-z]/.test(next) || !/\d/.test(next)) {
      window.FundsApp.showToast('New password must include uppercase, lowercase, and a number');
      return;
    }

    const btn = document.getElementById('defaultAdminPasswordSaveBtn');
    const originalText = btn?.textContent || 'Update Password';
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Updating...';
    }

    const targetEmail = String(session?.email || '').trim().toLowerCase();
    if (!targetEmail) {
      window.FundsApp.showToast('Unable to determine current account email');
      if (btn) {
        btn.disabled = false;
        btn.textContent = originalText;
      }
      return;
    }
    const result = await window.FundsApp.changeAccountPassword(targetEmail, current, next);
    if (!result?.ok) {
      window.FundsApp.showToast(result?.error || 'Failed to change password');
      if (btn) {
        btn.disabled = false;
        btn.textContent = originalText;
      }
      return;
    }

    form.reset();
    window.FundsApp.notify('Password updated', 'Your administrator password has been changed.', ['administrator']);
    window.FundsApp.showToast('Password updated');
    if (btn) {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  }

  function updateLogoPreview(dataUrl) {
    const preview = document.getElementById('globalLogoPreview');
    if (!preview) return;
    preview.innerHTML = dataUrl
      ? `<img src="${escapeHtml(dataUrl)}" alt="Logo preview" style="width:100%;height:100%;object-fit:contain;">`
      : '<span style="font-size:28px;">🐾</span>';
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatDateTime(value) {
    try {
      if (!value) return 'Not available';
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return 'Not available';
      return d.toLocaleString();
    } catch {
      return 'Not available';
    }
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => {
  SettingsPage.init();
});
