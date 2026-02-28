(function () {
  const page = document.body?.dataset?.publicPage || '';

  document.addEventListener('DOMContentLoaded', () => {
    if (page === 'animals') initPublicAnimals();
    if (page === 'events') initPublicEvents();
    if (page === 'impact') initPublicImpact();
    if (page === 'help') initPublicHelp();
  });

  async function apiJson(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  function esc(v) {
    return String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function title(v) {
    return String(v || '').replace(/\b\w/g, (m) => m.toUpperCase());
  }

  function fmtMoney(n) {
    const val = Number(n || 0);
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);
  }

  function fmtDate(v) {
    if (!v) return 'TBD';
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return String(v);
    return d.toLocaleDateString();
  }

  function defaultCardImage(kind = 'generic') {
    if (kind === 'animal') {
      return 'https://images.unsplash.com/photo-1548767797-d8c844163c4c?auto=format&fit=crop&w=1200&q=80';
    }
    if (kind === 'campaign') {
      return 'https://images.unsplash.com/photo-1516734212186-a967f81ad0d7?auto=format&fit=crop&w=1400&q=80';
    }
    return 'https://images.unsplash.com/photo-1548199973-03cce0bbc87b?auto=format&fit=crop&w=1200&q=80';
  }

  async function initPublicAnimals() {
    const grid = document.getElementById('publicAnimalsGrid');
    const qInput = document.getElementById('publicAnimalsSearch');
    const speciesSel = document.getElementById('publicAnimalsSpecies');
    if (!grid) return;
    let rows = [];
    try {
      const data = await apiJson('/api/animals?limit=500');
      rows = Array.isArray(data.animals) ? data.animals : [];
    } catch (e) {
      grid.innerHTML = '<div class="public-list-item">Unable to load animals right now.</div>';
      return;
    }

    const render = () => {
      const q = String(qInput?.value || '').trim().toLowerCase();
      const sp = String(speciesSel?.value || 'all').toLowerCase();
      const filtered = rows.filter((r) => {
        const name = String(r.name || '').toLowerCase();
        const breed = String(r.breed || '').toLowerCase();
        const species = String(r.species || '').toLowerCase();
        const status = String(r.status || '').toLowerCase();
        if (sp !== 'all' && species !== sp) return false;
        if (!q) return true;
        return `${name} ${breed} ${species} ${status}`.includes(q);
      });
      grid.innerHTML = filtered.map((r) => {
        const img = String(r.photo_url || r.image_url || '').trim() || defaultCardImage('animal');
        const bg = img ? `background-image:url('${esc(img)}')` : '';
        return `
          <article class="public-card">
            <div class="public-card-image" style="${bg}"></div>
            <div class="public-card-badges">
              <span class="public-card-badge">${esc(title(r.species || 'animal'))}</span>
              <span class="public-card-badge">${esc(title(String(r.status || 'in care').replace(/_/g, ' ')))}</span>
            </div>
            <div class="public-card-body">
              <h3>${esc(r.name || 'Unnamed')}</h3>
              <div class="public-chip-row">
                <span class="public-chip">${esc(title(r.sex || r.gender || 'unknown'))}</span>
                <span class="public-chip">Rescued ${esc(fmtDate(r.rescue_date))}</span>
              </div>
              <p>${esc(r.notes || 'No description provided.')}</p>
              <div class="public-card-footer">
                <button class="btn btn-secondary" type="button" data-animal-view="${esc(r.id)}">View Profile</button>
                <button class="btn btn-primary" type="button" data-animal-adopt="${esc(r.id)}">Adopt Me</button>
              </div>
            </div>
          </article>
        `;
      }).join('');

      grid.querySelectorAll('[data-animal-view]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-animal-view');
          const row = rows.find((x) => String(x.id) === String(id));
          if (!row) return;
          const modal = ensureModal();
          modal.querySelector('.modal-title').textContent = row.name || 'Animal Profile';
          modal.querySelector('.modal-body').innerHTML = `
            <div style="display:grid;gap:12px;">
              ${(row.photo_url || row.image_url) ? `<img src="${esc(row.photo_url || row.image_url)}" alt="${esc(row.name || 'animal')}" style="width:100%;max-height:260px;object-fit:cover;border-radius:12px;">` : ''}
              <p><strong>Species:</strong> ${esc(title(row.species || 'animal'))}</p>
              <p><strong>Breed:</strong> ${esc(row.breed || 'Unknown')}</p>
              <p><strong>Gender:</strong> ${esc(title(row.sex || row.gender || 'unknown'))}</p>
              <p><strong>Status:</strong> ${esc(title(String(row.status || 'in care').replace(/_/g, ' ')))}</p>
              <p><strong>Rescue Date:</strong> ${esc(fmtDate(row.rescue_date))}</p>
              <p>${esc(row.notes || 'No additional details available.')}</p>
            </div>
          `;
          modal.classList.add('active');
        });
      });

      grid.querySelectorAll('[data-animal-adopt]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-animal-adopt');
          const row = rows.find((x) => String(x.id) === String(id));
          if (!row) return;
          openAdoptionRequestModal(row);
        });
      });
    };

    qInput?.addEventListener('input', render);
    speciesSel?.addEventListener('change', render);
    render();
  }

  async function initPublicEvents() {
    const monthLabel = document.getElementById('publicEventsMonthLabel');
    const grid = document.getElementById('publicEventsCalendar');
    const list = document.getElementById('publicEventsList');
    let month = new Date();
    let events = [];
    try {
      const data = await apiJson('/api/events?limit=500');
      events = Array.isArray(data.events) ? data.events : [];
    } catch {
      if (list) list.innerHTML = '<div class="public-list-item">Unable to load events right now.</div>';
      return;
    }

    const render = () => {
      const y = month.getFullYear();
      const m = month.getMonth();
      if (monthLabel) monthLabel.textContent = month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
      if (grid) {
        const first = new Date(y, m, 1);
        const days = new Date(y, m + 1, 0).getDate();
        const start = first.getDay();
        const keys = new Set(events.map((e) => {
          const d = new Date(e.starts_at || e.start_date || e.date || '');
          return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
        }));
        const cells = [];
        for (let i = 0; i < start; i += 1) cells.push('<div class="public-cal-cell empty"></div>');
        for (let d = 1; d <= days; d += 1) {
          const key = new Date(y, m, d).toISOString().slice(0, 10);
          cells.push(`<div class="public-cal-cell"><span class="day">${d}</span>${keys.has(key) ? '<span class="public-cal-dot"></span>' : ''}</div>`);
        }
        grid.innerHTML = `
          <div class="public-cal-head">Sun</div><div class="public-cal-head">Mon</div><div class="public-cal-head">Tue</div>
          <div class="public-cal-head">Wed</div><div class="public-cal-head">Thu</div><div class="public-cal-head">Fri</div><div class="public-cal-head">Sat</div>
          ${cells.join('')}
        `;
      }
      if (list) {
        const rows = events
          .slice()
          .sort((a, b) => String(a.starts_at || '').localeCompare(String(b.starts_at || '')))
          .filter((e) => {
            const d = new Date(e.starts_at || e.start_date || '');
            return !Number.isNaN(d.getTime()) && d.getMonth() === m && d.getFullYear() === y;
          });
        list.innerHTML = rows.length ? rows.map((e) => `
          <article class="public-list-item">
            <h3>${esc(e.name || 'Event')}</h3>
            <p><strong>Date:</strong> ${esc(fmtDate(e.starts_at || e.start_date))}</p>
            <p><strong>Location:</strong> ${esc(e.location_name || e.location_address || 'TBD')}</p>
            <p>${esc(e.description || 'No event details provided.')}</p>
          </article>
        `).join('') : '<div class="public-list-item">No events scheduled this month.</div>';
      }
    };

    document.getElementById('publicEventsPrev')?.addEventListener('click', () => { month = new Date(month.getFullYear(), month.getMonth() - 1, 1); render(); });
    document.getElementById('publicEventsNext')?.addEventListener('click', () => { month = new Date(month.getFullYear(), month.getMonth() + 1, 1); render(); });
    render();
  }

  async function initPublicImpact() {
    const activeEl = document.getElementById('publicActiveCampaigns');
    const completeEl = document.getElementById('publicCompletedCampaigns');
    const storiesEl = document.getElementById('publicStories');
    try {
      const [campaignsData, storiesData] = await Promise.all([
        apiJson('/api/campaigns?limit=200'),
        apiJson('/api/stories?limit=200'),
      ]);
      const campaigns = Array.isArray(campaignsData.campaigns) ? campaignsData.campaigns : [];
      const stories = Array.isArray(storiesData.stories) ? storiesData.stories : [];
      const active = campaigns.filter((c) => String(c.status || '').toLowerCase() === 'active');
      const completed = campaigns.filter((c) => ['completed', 'archived'].includes(String(c.status || '').toLowerCase()));

      if (activeEl) {
        activeEl.innerHTML = active.length ? active.map((c) => `
          <article class="public-card">
            <div class="public-card-image" style="background-image:url('${esc(String(c.image_url || '').trim() || defaultCardImage('campaign'))}')"></div>
            <div class="public-card-badges">
              <span class="public-card-badge status-active">Active</span>
              <span class="public-card-badge">${esc(title(c.category || 'general'))}</span>
            </div>
            <div class="public-card-body">
              <h3>${esc(c.name || 'Campaign')}</h3>
              <p>${esc(c.description || '')}</p>
              <p class="public-card-metric">${esc(fmtMoney(c.raised_amount || 0))} <span class="public-card-muted">of ${esc(fmtMoney(c.goal_amount || 0))}</span></p>
              <div class="public-chip-row">
                <span class="public-chip">Donors: ${esc(String(c.donor_count || c.donors || 0))}</span>
                <span class="public-chip">End: ${esc(fmtDate(c.end_date || c.ends_at))}</span>
              </div>
              <div class="public-card-footer">
                <a class="btn btn-primary" href="#donate">Donate</a>
                <a class="btn btn-secondary" href="#how-you-can-help">How You Can Help</a>
              </div>
            </div>
          </article>
        `).join('') : '<div class="public-list-item">No active campaigns at the moment.</div>';
      }
      if (completeEl) {
        completeEl.innerHTML = completed.length ? completed.map((c) => `
          <article class="public-card">
            <div class="public-card-image" style="background-image:url('${esc(String(c.image_url || '').trim() || defaultCardImage('campaign'))}')"></div>
            <div class="public-card-badges">
              <span class="public-card-badge status-${esc(String(c.status || 'completed').toLowerCase())}">${esc(title(c.status || 'completed'))}</span>
              <span class="public-card-badge">${esc(title(c.category || 'general'))}</span>
            </div>
            <div class="public-card-body">
              <h3>${esc(c.name || 'Campaign')}</h3>
              <p>${esc(c.description || '')}</p>
              <p class="public-card-metric">${esc(fmtMoney(c.raised_amount || 0))} <span class="public-card-muted">raised</span></p>
              <div class="public-card-footer">
                <button type="button" class="btn btn-secondary" data-campaign-view="${esc(c.id || '')}">View</button>
              </div>
            </div>
          </article>
        `).join('') : '<div class="public-list-item">No completed campaigns to display yet.</div>';
      }
      if (storiesEl) {
        storiesEl.innerHTML = stories.length ? stories.slice(0, 8).map((s) => `
          <article class="public-list-item">
            <h3>${esc(s.title || 'Success Story')}</h3>
            <p>${esc(s.content || s.summary || 'No story details provided.')}</p>
          </article>
        `).join('') : '<div class="public-list-item">No success stories available yet.</div>';
      }
      bindCampaignViewButtons([...active, ...completed]);
    } catch {
      if (activeEl) activeEl.innerHTML = '<div class="public-list-item">Unable to load campaign data right now.</div>';
      if (completeEl) completeEl.innerHTML = '';
      if (storiesEl) storiesEl.innerHTML = '';
    }
  }

  function bindCampaignViewButtons(campaigns) {
    document.querySelectorAll('[data-campaign-view]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-campaign-view');
        const row = campaigns.find((x) => String(x.id) === String(id));
        if (!row) return;
        const modal = ensureModal();
        modal.querySelector('.modal-title').textContent = row.name || 'Campaign';
        modal.querySelector('.modal-body').innerHTML = `
          <div style="display:grid;gap:12px;">
            <img src="${esc(String(row.image_url || '').trim() || defaultCardImage('campaign'))}" alt="${esc(row.name || 'campaign')}" style="width:100%;max-height:260px;object-fit:cover;border-radius:12px;">
            <p><strong>Status:</strong> ${esc(title(row.status || 'active'))}</p>
            <p><strong>Category:</strong> ${esc(title(row.category || 'general'))}</p>
            <p><strong>Raised:</strong> ${esc(fmtMoney(row.raised_amount || 0))}</p>
            <p><strong>Goal:</strong> ${esc(fmtMoney(row.goal_amount || 0))}</p>
            <p>${esc(row.description || 'No campaign details available.')}</p>
          </div>
        `;
        modal.classList.add('active');
      });
    });
  }

  async function openAdoptionRequestModal(animal) {
    const modal = ensureModal();
    modal.querySelector('.modal-title').textContent = `Adopt ${animal.name || 'This Animal'}`;
    modal.querySelector('.modal-body').innerHTML = `
      <form id="publicAdoptRequestForm" class="form" style="display:grid;gap:12px;">
        <input type="hidden" name="animal_id" value="${esc(animal.id || '')}">
        <input type="hidden" name="animal_name" value="${esc(animal.name || '')}">
        <div class="input-group">
          <label class="input-label">Your Name</label>
          <input class="input" name="name" required placeholder="Full name">
        </div>
        <div class="input-group">
          <label class="input-label">Phone Number</label>
          <input class="input" name="phone" required placeholder="(555) 123-4567">
        </div>
        <div class="input-group">
          <label class="input-label">Email Address</label>
          <input class="input" name="email" type="email" required placeholder="you@example.org">
        </div>
        <div class="input-group">
          <label class="input-label">Notes</label>
          <textarea class="textarea" name="notes" rows="4" placeholder="Tell us about your home and why you'd like to adopt."></textarea>
        </div>
        <p id="publicAdoptRequestError"></p>
        <div class="public-card-footer" style="padding-top:0;border-top:none;">
          <button type="button" class="btn btn-secondary" id="publicAdoptRequestCancelBtn">Cancel</button>
          <button type="submit" class="btn btn-primary" id="publicAdoptRequestSubmitBtn">Submit Request</button>
        </div>
      </form>
    `;
    modal.classList.add('active');

    modal.querySelector('#publicAdoptRequestCancelBtn')?.addEventListener('click', () => modal.classList.remove('active'));
    const form = modal.querySelector('#publicAdoptRequestForm');
    const submitBtn = modal.querySelector('#publicAdoptRequestSubmitBtn');
    const errEl = modal.querySelector('#publicAdoptRequestError');
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (errEl) {
        errEl.style.display = 'none';
        errEl.textContent = '';
      }
      const data = Object.fromEntries(new FormData(form).entries());
      const phone = String(data.phone || '').trim();
      const email = String(data.email || '').trim();
      const name = String(data.name || '').trim();
      if (!name || !phone || !email) {
        if (errEl) {
          errEl.textContent = 'Name, phone number, and email are required.';
          errEl.style.display = 'block';
        }
        return;
      }

      const oldText = submitBtn?.textContent || 'Submit Request';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Submitting...';
      }
      try {
        const res = await fetch('/api/public/adoption-requests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            animal_id: data.animal_id,
            animal_name: data.animal_name,
            requester_name: name,
            requester_phone: phone,
            requester_email: email,
            notes: String(data.notes || '').trim(),
          }),
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(payload?.error || `HTTP ${res.status}`);
        }
        window.FundsApp?.showToast?.('Adoption request submitted');
        modal.classList.remove('active');
      } catch (err) {
        if (errEl) {
          errEl.textContent = `Unable to submit adoption request: ${err.message || 'Unknown error'}`;
          errEl.style.display = 'block';
        }
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = oldText;
        }
      }
    });
  }

  function ensureModal() {
    let modal = document.getElementById('publicDetailModal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'publicDetailModal';
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-backdrop"></div>
      <div class="modal-content">
        <div class="modal-header">
          <h2 class="modal-title">Details</h2>
          <button type="button" class="modal-close">&times;</button>
        </div>
        <div class="modal-body"></div>
      </div>
    `;
    document.body.appendChild(modal);
    const close = () => modal.classList.remove('active');
    modal.querySelector('.modal-backdrop')?.addEventListener('click', close);
    modal.querySelector('.modal-close')?.addEventListener('click', close);
    return modal;
  }

  function initPublicHelp() {
    bindHelpAccordion();
    bindHelpActions();
  }

  function bindHelpAccordion() {
    const toggles = document.querySelectorAll('[data-help-toggle]');
    toggles.forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-help-toggle');
        const body = document.getElementById(`publicHelp${title(key)}Body`);
        if (!body) return;
        const isOpen = !body.hidden;
        body.hidden = isOpen;
        btn.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
        const indicator = btn.querySelector('.public-help-toggle-indicator');
        if (indicator) indicator.textContent = isOpen ? '+' : '-';
      });
    });
  }

  function bindHelpActions() {
    document.getElementById('publicDonateNowBtn')?.addEventListener('click', () => {
      window.FundsApp?.showToast?.('Payment integration will be connected next. Thank you for your support.');
    });

    document.getElementById('publicVolunteerRequestBtn')?.addEventListener('click', () => {
      openHelpRequestModal('volunteer');
    });
    document.getElementById('publicVolunteerSpotlightBtn')?.addEventListener('click', () => {
      openHelpRequestModal('volunteer');
    });
    document.getElementById('publicVolunteerCtaBtn')?.addEventListener('click', () => {
      openHelpRequestModal('volunteer');
    });

    document.getElementById('publicBusinessInfoBtn')?.addEventListener('click', () => {
      openHelpRequestModal('business');
    });
    document.getElementById('publicContactSpotlightBtn')?.addEventListener('click', () => {
      window.location.href = 'mailto:support@funds4furryfriends.org';
    });
  }

  function openHelpRequestModal(kind) {
    const mode = String(kind || '').toLowerCase();
    const isBusiness = mode === 'business';
    const modal = ensureModal();
    modal.querySelector('.modal-title').textContent = isBusiness ? 'Request More Information' : 'Request to Volunteer';
    modal.querySelector('.modal-body').innerHTML = `
      <form id="publicHelpRequestForm" class="form" style="display:grid;gap:12px;">
        <input type="hidden" name="request_type" value="${esc(mode)}">
        <div class="input-group">
          <label class="input-label">Your Name</label>
          <input class="input" name="name" required placeholder="Full name">
        </div>
        <div class="input-group">
          <label class="input-label">Phone Number</label>
          <input class="input" name="phone" required placeholder="(555) 123-4567">
        </div>
        <div class="input-group">
          <label class="input-label">Email Address</label>
          <input class="input" name="email" type="email" required placeholder="you@example.org">
        </div>
        ${isBusiness ? `
          <div class="input-group">
            <label class="input-label">Company Name</label>
            <input class="input" name="company_name" required placeholder="Company name">
          </div>
          <div class="input-group">
            <label class="input-label">Company Size</label>
            <select class="select" name="company_size" required>
              <option value="">Select size</option>
              <option value="1-10">1-10</option>
              <option value="11-50">11-50</option>
              <option value="51-250">51-250</option>
              <option value="251-1000">251-1000</option>
              <option value="1000+">1000+</option>
            </select>
          </div>
          <div class="input-group">
            <label class="input-label">Giving Interest</label>
            <select class="select" name="giving_interest">
              <option value="">Select interest</option>
              <option value="sponsorship">Sponsorship</option>
              <option value="matching-gifts">Matching Gifts</option>
              <option value="in-kind">In-Kind Support</option>
              <option value="employee-program">Employee Volunteer Program</option>
            </select>
          </div>
        ` : ''}
        <div class="input-group">
          <label class="input-label">Notes</label>
          <textarea class="textarea" name="notes" rows="4" placeholder="${isBusiness ? 'Tell us about your company goals and preferred support options.' : 'Tell us about your interests and availability.'}"></textarea>
        </div>
        <p id="publicHelpRequestError" style="display:none;color:var(--accent-urgent);margin:0;"></p>
        <div class="public-card-footer" style="padding-top:0;border-top:none;">
          <button type="button" class="btn btn-secondary" id="publicHelpRequestCancelBtn">Cancel</button>
          <button type="submit" class="btn btn-primary" id="publicHelpRequestSubmitBtn">${isBusiness ? 'Submit Request' : 'Submit Volunteer Request'}</button>
        </div>
      </form>
    `;
    modal.classList.add('active');
    modal.querySelector('#publicHelpRequestCancelBtn')?.addEventListener('click', () => modal.classList.remove('active'));

    const form = modal.querySelector('#publicHelpRequestForm');
    const errEl = modal.querySelector('#publicHelpRequestError');
    const submitBtn = modal.querySelector('#publicHelpRequestSubmitBtn');
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (errEl) {
        errEl.style.display = 'none';
        errEl.textContent = '';
      }
      const data = Object.fromEntries(new FormData(form).entries());
      const name = String(data.name || '').trim();
      const phone = String(data.phone || '').trim();
      const email = String(data.email || '').trim();
      if (!name || !phone || !email) {
        if (errEl) {
          errEl.textContent = 'Name, phone number, and email are required.';
          errEl.style.display = 'block';
        }
        return;
      }
      if (isBusiness && (!String(data.company_name || '').trim() || !String(data.company_size || '').trim())) {
        if (errEl) {
          errEl.textContent = 'Company name and company size are required.';
          errEl.style.display = 'block';
        }
        return;
      }

      const old = submitBtn?.textContent || 'Submit Request';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Submitting...';
      }
      try {
        const res = await fetch('/api/public/help-requests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            request_type: mode,
            requester_name: name,
            requester_phone: phone,
            requester_email: email,
            company_name: String(data.company_name || '').trim() || null,
            company_size: String(data.company_size || '').trim() || null,
            giving_interest: String(data.giving_interest || '').trim() || null,
            notes: String(data.notes || '').trim(),
          }),
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload?.error || `HTTP ${res.status}`);
        window.FundsApp?.showToast?.(isBusiness ? 'Business request submitted' : 'Volunteer request submitted');
        modal.classList.remove('active');
      } catch (err) {
        if (errEl) {
          errEl.textContent = `Unable to submit request: ${err.message || 'Unknown error'}`;
          errEl.style.display = 'block';
        }
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = old;
        }
      }
    });
  }
})();
