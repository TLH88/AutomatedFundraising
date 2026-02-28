/**
 * Public landing page enhancements
 * - Member/Admin access CTA state
 */

document.addEventListener('DOMContentLoaded', () => {
  if (!document.querySelector('.landing-main')) return;
  hydrateLandingAccessButtons();
});

function hydrateLandingAccessButtons() {
  const session = window.FundsApp?.getSession?.() || { loggedIn: false, role: 'visitor', name: 'Visitor' };
  const role = String(session.role || 'visitor').toLowerCase();
  const loggedIn = !!session.loggedIn && role !== 'visitor';
  const finalBtn = document.getElementById('landingFinalSigninBtn');
  const footerBtn = document.getElementById('landingFooterSigninBtn');

  if (loggedIn) {
    const roleLabel = role === 'administrator' ? 'Administrator' : 'Member';
    if (finalBtn) {
      finalBtn.href = 'index.html';
      finalBtn.textContent = `Enter ${roleLabel} Workspace`;
    }
    if (footerBtn) {
      footerBtn.href = 'index.html';
      footerBtn.textContent = 'Dashboard';
    }
    return;
  }

  if (finalBtn) {
    finalBtn.href = '#';
    finalBtn.textContent = 'Team Sign In';
    finalBtn.addEventListener('click', (e) => {
      e.preventDefault();
      window.FundsApp?.openSignInModal?.();
    });
  }
  if (footerBtn) {
    footerBtn.href = '#';
    footerBtn.textContent = 'Dashboard Sign In';
    footerBtn.addEventListener('click', (e) => {
      e.preventDefault();
      window.FundsApp?.openSignInModal?.();
    });
  }
}
