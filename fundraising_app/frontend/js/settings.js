/**
 * Settings page enhancements (user administration / default admin password)
 */

const SettingsPage = (() => {
  const DEFAULT_ADMIN_EMAIL = 'admin@funds4furry.local';

  function isPage() {
    return (location.pathname.split('/').pop() || '').toLowerCase() === 'settings.html' &&
      !!document.querySelector('.settings-grid');
  }

  function init() {
    if (!isPage() || !window.FundsApp) return;
    injectAdminPasswordCard();
    injectBrandingCard();
    bindAdminPasswordForm();
    bindBrandingForm();
  }

  function injectAdminPasswordCard() {
    const grid = document.querySelector('.settings-grid');
    if (!grid || document.getElementById('defaultAdminPasswordCard')) return;

    const account = window.FundsApp.getDefaultAdminAccount?.();
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
            <label class="label">Default Administrator Account</label>
            <input class="input" type="text" value="${escapeHtml(account?.email || DEFAULT_ADMIN_EMAIL)}" disabled>
          </div>
          <p class="text-muted text-caption" id="defaultAdminPasswordHelp">
            ${canManage
              ? 'Change the hard-coded default administrator password. The default account cannot be removed so the system remains accessible.'
              : 'Only an Administrator can change the default administrator password.'}
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
            <button type="submit" class="btn btn-primary" id="defaultAdminPasswordSaveBtn" ${canManage ? '' : 'disabled'}>Update Admin Password</button>
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

  function onAdminPasswordSubmit(e) {
    e.preventDefault();

    const session = window.FundsApp.getSession?.() || { role: 'visitor', loggedIn: false };
    const role = window.FundsApp.normalizeRole?.(session.role) || 'visitor';
    if (!session.loggedIn || role !== 'administrator') {
      window.FundsApp.notify('Permission denied', 'Only administrators can change the default admin password.', ['member', 'visitor']);
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
    if (next.length < 3) {
      window.FundsApp.showToast('New password must be at least 3 characters');
      return;
    }

    const btn = document.getElementById('defaultAdminPasswordSaveBtn');
    const originalText = btn?.textContent || 'Update Admin Password';
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Updating...';
    }

    const result = window.FundsApp.changeAccountPassword(DEFAULT_ADMIN_EMAIL, current, next);
    if (!result?.ok) {
      window.FundsApp.showToast(result?.error || 'Failed to change password');
      if (btn) {
        btn.disabled = false;
        btn.textContent = originalText;
      }
      return;
    }

    form.reset();
    window.FundsApp.notify('Admin password updated', 'Default administrator password has been changed.', ['administrator']);
    window.FundsApp.showToast('Default admin password updated');
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

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => {
  SettingsPage.init();
});
