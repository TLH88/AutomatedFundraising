/**
 * Events Calendar JavaScript
 * Live API-backed events list + create event workflow.
 */

const eventsState = {
  rows: [],
  filtered: [],
};

document.addEventListener('DOMContentLoaded', () => {
  initEventFilters();
  initEventForm();
  initEventButtons();
  loadEvents();
});

async function apiJson(url, options = {}) {
  if (window.FundsApp?.apiJson) return window.FundsApp.apiJson(url, options);
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function toast(message) {
  if (window.FundsApp?.showToast) {
    window.FundsApp.showToast(message);
    return;
  }
  const t = document.createElement('div');
  t.textContent = message;
  t.style.cssText = 'position:fixed;right:24px;bottom:24px;background:#111827;color:#fff;padding:12px 16px;border-radius:10px;z-index:9999';
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
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

function parseStart(row) {
  const raw = row?.starts_at || row?.start_date || row?.date || '';
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseEnd(row) {
  const raw = row?.ends_at || row?.end_date || '';
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function eventStatus(row) {
  const now = new Date();
  const s = parseStart(row);
  const e = parseEnd(row);
  if (!s) return 'upcoming';
  if (e && now > e) return 'completed';
  if (now >= s && (!e || now <= e)) return 'ongoing';
  return 'upcoming';
}

function formatDateBadge(row) {
  const d = parseStart(row);
  if (!d) return { month: 'TBD', day: '--' };
  return {
    month: d.toLocaleDateString(undefined, { month: 'short' }).toUpperCase(),
    day: String(d.getDate()).padStart(2, '0'),
  };
}

function formatTimeRange(row) {
  const s = parseStart(row);
  const e = parseEnd(row);
  if (!s) return 'Time TBD';
  const start = s.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (!e) return start;
  const end = e.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `${start} - ${end}`;
}

async function loadEvents() {
  const list = document.getElementById('eventsList');
  if (list) {
    list.innerHTML = '<div class="event-card"><div class="event-card-body"><div class="event-card-header"><h3 class="event-title">Loading events...</h3></div></div></div>';
  }
  try {
    const data = await apiJson('/api/events?limit=500', { useCache: false });
    eventsState.rows = Array.isArray(data.events) ? data.events : [];
    applyFilters();
    renderStats();
  } catch (err) {
    if (list) {
      list.innerHTML = '<div class="event-card"><div class="event-card-body"><div class="event-card-header"><h3 class="event-title">Unable to load events.</h3></div></div></div>';
    }
    toast(`Failed to load events: ${err.message || err}`);
  }
}

function initEventFilters() {
  document.getElementById('eventTypeFilter')?.addEventListener('change', applyFilters);
  document.getElementById('statusFilter')?.addEventListener('change', applyFilters);
  document.getElementById('eventsSearchInput')?.addEventListener('input', applyFilters);
}

function applyFilters() {
  const typeValue = String(document.getElementById('eventTypeFilter')?.value || 'all').toLowerCase();
  const statusValue = String(document.getElementById('statusFilter')?.value || 'all').toLowerCase();
  const q = String(document.getElementById('eventsSearchInput')?.value || '').trim().toLowerCase();

  eventsState.filtered = eventsState.rows.filter((row) => {
    const type = String(row.event_type || row.type || '').toLowerCase();
    const status = eventStatus(row);
    if (typeValue !== 'all' && type !== typeValue) return false;
    if (statusValue !== 'all' && status !== statusValue) return false;
    if (q) {
      const hay = `${row.name || ''} ${row.description || ''} ${row.location_name || row.location || ''} ${type}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  renderEventsList();
}

function renderEventsList() {
  const list = document.getElementById('eventsList');
  if (!list) return;
  const rows = eventsState.filtered;
  if (!rows.length) {
    list.innerHTML = '<div class="event-card"><div class="event-card-body"><div class="event-card-header"><h3 class="event-title">No events found for current filters.</h3></div></div></div>';
    return;
  }

  const sorted = rows.slice().sort((a, b) => {
    const da = parseStart(a)?.getTime() || 0;
    const db = parseStart(b)?.getTime() || 0;
    return da - db;
  });

  list.innerHTML = sorted.map((row) => {
    const badge = formatDateBadge(row);
    const type = String(row.event_type || row.type || 'event').toLowerCase();
    const location = row.location_name || row.location_address || row.location || 'Location TBD';
    const rsvp = Number(row.rsvp_count || row.rsvps || 0);
    return `
      <div class="event-card" data-event-id="${esc(row.id || '')}">
        <div class="event-card-left">
          <div class="event-date-badge"><span class="event-month">${esc(badge.month)}</span><span class="event-day">${esc(badge.day)}</span></div>
        </div>
        <div class="event-card-body">
          <div class="event-card-header">
            <h3 class="event-title">${esc(row.name || 'Untitled Event')}</h3>
            <div class="event-type-badge ${esc(type)}">${esc(title(type || 'event'))}</div>
          </div>
          <p class="event-description">${esc(row.description || 'No description provided.')}</p>
          <div class="event-meta">
            <span class="event-meta-item">⏰ ${esc(formatTimeRange(row))}</span>
            <span class="event-meta-item">📍 ${esc(location)}</span>
            <span class="event-meta-item">👥 ${esc(String(rsvp))} RSVPs</span>
          </div>
        </div>
        <div class="event-card-actions">
          <button class="btn btn-sm btn-secondary" type="button" data-event-view="${esc(row.id || '')}">View Details</button>
          <button class="btn btn-sm btn-primary" type="button" data-event-manage="${esc(row.id || '')}">Manage RSVPs</button>
        </div>
      </div>
    `;
  }).join('');

  bindEventRowButtons();
}

function renderStats() {
  const rows = eventsState.rows;
  const now = new Date();
  const thirtyDays = new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000));

  const upcoming = rows.filter((r) => {
    const s = parseStart(r);
    return s && s >= now && s <= thirtyDays;
  }).length;

  const totalRsvps = rows.reduce((sum, r) => sum + Number(r.rsvp_count || r.rsvps || 0), 0);
  const totalRevenue = rows.reduce((sum, r) => sum + Number(r.revenue_amount || r.amount_raised || 0), 0);

  const attendanceRows = rows.filter((r) => Number.isFinite(Number(r.attendance_rate || r.attendance_percent)));
  const avgAttendance = attendanceRows.length
    ? Math.round(attendanceRows.reduce((sum, r) => sum + Number(r.attendance_rate || r.attendance_percent || 0), 0) / attendanceRows.length)
    : 0;

  const fmtMoney = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  setText('eventsStatUpcoming', String(upcoming));
  setText('eventsStatRsvps', String(totalRsvps));
  setText('eventsStatRevenue', fmtMoney.format(totalRevenue));
  setText('eventsStatAttendance', `${avgAttendance}%`);
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function initEventForm() {
  const form = document.getElementById('addEventForm');
  if (!form) return;
  form.addEventListener('submit', onCreateEventSubmit);
}

async function onCreateEventSubmit(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const data = Object.fromEntries(new FormData(form).entries());
  const submitBtn = document.getElementById('createEventSubmitBtn');

  const date = String(data.start_date || '').trim();
  const time = String(data.start_time || '').trim();
  if (!date || !time) {
    toast('Date and time are required.');
    return;
  }

  const startsAt = new Date(`${date}T${time}`);
  if (Number.isNaN(startsAt.getTime())) {
    toast('Invalid date/time value.');
    return;
  }

  const payload = {
    name: String(data.name || '').trim(),
    description: String(data.description || '').trim(),
    event_type: String(data.event_type || '').trim(),
    location_name: String(data.location_name || '').trim(),
    starts_at: startsAt.toISOString(),
    status: 'planned',
  };

  if (!payload.name || !payload.description || !payload.event_type || !payload.location_name) {
    toast('Please complete all required fields.');
    return;
  }

  const original = submitBtn?.textContent || 'Create Event';
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving...';
  }

  try {
    await apiJson('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      useCache: false,
    });
    toast('Event created successfully.');
    closeModal('addEventModal');
    form.reset();
    await loadEvents();
  } catch (err) {
    toast(`Unable to create event: ${err.message || err}`);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = original;
    }
  }
}

function bindEventRowButtons() {
  document.querySelectorAll('[data-event-view]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-event-view');
      const row = eventsState.rows.find((r) => String(r.id) === String(id));
      if (!row) return;
      const title = row.name || 'Event';
      toast(`Viewing: ${title}`);
    });
  });

  document.querySelectorAll('[data-event-manage]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-event-manage');
      const row = eventsState.rows.find((r) => String(r.id) === String(id));
      if (!row) return;
      toast(`RSVP management: ${row.name || 'Event'}`);
    });
  });
}

function initEventButtons() {
  document.getElementById('eventsExportBtn')?.addEventListener('click', () => {
    exportEventsCsv();
  });
}

function exportEventsCsv() {
  const rows = (eventsState.filtered && eventsState.filtered.length ? eventsState.filtered : eventsState.rows).slice();
  if (!rows.length) {
    toast('No events available to export.');
    return;
  }
  const header = ['name', 'event_type', 'status', 'starts_at', 'ends_at', 'location_name', 'description'];
  const lines = [header.join(',')];
  for (const r of rows) {
    const cols = [
      r.name || '',
      r.event_type || r.type || '',
      eventStatus(r),
      r.starts_at || r.start_date || '',
      r.ends_at || r.end_date || '',
      r.location_name || r.location_address || r.location || '',
      r.description || '',
    ].map(csvEscape);
    lines.push(cols.join(','));
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `events-export-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  toast(`Exported ${rows.length} event(s).`);
}

function csvEscape(value) {
  const text = String(value ?? '');
  if (/["\n,]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add('active');
}

function closeModal(modalId) {
  if (window.FundsApp?.closeModal) {
    window.FundsApp.closeModal(modalId);
    return;
  }
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('active');
}
