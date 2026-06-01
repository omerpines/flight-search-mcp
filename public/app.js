'use strict';

// ── State ──────────────────────────────────────────────────────────────────
const state = {
  adults: 1,
  lastParams: null,
};

// ── DOM helpers ────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const show = (el) => el.removeAttribute('hidden');
const hide = (el) => el.setAttribute('hidden', '');

// ── API ────────────────────────────────────────────────────────────────────
async function fetchAPI(endpoint, body) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// ── Form helpers ───────────────────────────────────────────────────────────
function isRoundTrip() {
  return document.querySelector('input[name="trip-type"]:checked').value === 'roundtrip';
}

function getParams() {
  const origin = $('origin').value.trim().toUpperCase();
  const destination = $('destination').value.trim().toUpperCase();
  const departureDate = $('departure-date').value;
  const returnDate = isRoundTrip() ? $('return-date').value : undefined;

  if (!origin || origin.length !== 3) { showToast('Enter a valid 3-letter origin code (e.g. TLV)'); return null; }
  if (!destination || destination.length !== 3) { showToast('Enter a valid 3-letter destination code (e.g. JFK)'); return null; }
  if (!departureDate) { showToast('Please select a departure date'); return null; }
  if (isRoundTrip() && !returnDate) { showToast('Please select a return date'); return null; }

  return {
    origin,
    destination,
    departureDate,
    returnDate,
    adults: state.adults,
    travelClass: $('travel-class').value,
    nonStop: $('nonstop').checked,
    priority: $('priority').value,
    maxResults: 15,
  };
}

// ── Formatters ─────────────────────────────────────────────────────────────
function fmtDuration(mins) {
  const h = Math.floor(mins / 60), m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso.replace(' ', 'T'));
  return isNaN(d) ? iso : d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso.replace(' ', 'T'));
  return isNaN(d) ? iso : d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

function stopBadge(stops) {
  if (stops === 0) return '<span class="badge badge-nonstop">Non-stop</span>';
  if (stops === 1) return '<span class="badge badge-stops-1">1 stop</span>';
  return `<span class="badge badge-stops-n">${stops} stops</span>`;
}

// ── Render helpers ─────────────────────────────────────────────────────────
function renderTimeline(segments, durationMins) {
  if (!segments || segments.length === 0) return '';
  const first = segments[0], last = segments[segments.length - 1];
  const stops = segments.length - 1;
  const via = stops > 0
    ? segments.slice(0, -1).map(s => s.to || s.toAirport).join(', ')
    : null;

  return `
    <div class="timeline">
      <div>
        <div class="tl-time">${fmtTime(first.departAt)}</div>
        <div class="tl-code">${first.from}</div>
      </div>
      <div class="tl-line">
        <div class="tl-bar"></div>
        <div class="tl-meta">${fmtDuration(durationMins)}${via ? ` · via ${via}` : ''}</div>
      </div>
      <div>
        <div class="tl-time">${fmtTime(last.arriveAt)}</div>
        <div class="tl-code">${last.to}</div>
      </div>
    </div>`;
}

function renderCard(flight, opts = {}) {
  const { isBest = false, score = null, rank = null } = opts;
  const params = state.lastParams;

  const badges = [
    isBest ? '<span class="badge badge-best">✦ Best deal</span>' : '',
    rank && !isBest ? `<span class="badge badge-rank">#${rank}</span>` : '',
    stopBadge(flight.stops ?? flight.totalStops ?? 0),
  ].filter(Boolean).join('');

  const outbound = flight.outbound || {};
  const segments = outbound.segments || flight.outboundSegments || [];
  const durationMins = outbound.duration
    ? parseInt(outbound.duration) // might be "3h 20m"
    : (flight.totalDurationMinutes || flight.totalDurationMin || 0);

  const timelineHtml = renderTimeline(segments, durationMins);

  const airlines = (flight.airlines || []).join(', ');
  const returnInfo = flight.return
    ? `<span>Returns ${fmtDate(flight.return.departAt)}</span>`
    : '';

  const priceObj = flight.price || {};
  const priceDisplay = typeof priceObj === 'object'
    ? (priceObj.display || `${priceObj.currency} ${priceObj.total}`)
    : String(priceObj);

  const scorePart = score !== null
    ? `<div class="score-badge">Score ${score}</div>`
    : '';

  const trackBtn = params
    ? `<button class="btn-track" onclick="trackFlight()">⊕ Track price</button>`
    : '';

  return `
    <div class="flight-card${isBest ? ' best-deal' : ''}">
      <div class="card-left">
        <div class="badge-row">${badges}</div>
        ${timelineHtml}
        <div class="card-sub">
          <span>${airlines || 'Multiple airlines'}</span>
          ${returnInfo}
          ${durationMins ? `<span>${fmtDuration(durationMins)} total</span>` : ''}
        </div>
      </div>
      <div class="card-right">
        <div class="price-block">
          <div class="price-main">${priceDisplay}</div>
          <div class="price-sub">per person</div>
        </div>
        ${scorePart}
        <div class="card-actions">
          <button class="btn-details" onclick="showDetails('${flight.offerId}')">View details</button>
          ${trackBtn}
        </div>
      </div>
    </div>`;
}

// ── Search ─────────────────────────────────────────────────────────────────
async function doSearch() {
  const params = getParams();
  if (!params) return;
  state.lastParams = params;

  showLoading('Searching flights…');
  try {
    const data = await fetchAPI('/api/search-flights', params);
    hideLoading();
    renderSearchResults(data);
  } catch (err) {
    hideLoading();
    showToast(`Error: ${err.message}`);
  }
}

function renderSearchResults(data) {
  const section = $('results-section');
  const header = $('results-header');
  const list = $('flight-list');

  show(section);
  section.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const count = data.resultsCount || (data.offers || []).length;
  const insights = data.priceInsights;
  const insightHtml = insights
    ? `<div class="price-insight">Typical: ${insights.priceLevel || ''} · From $${insights.lowestPrice}</div>`
    : '';

  header.innerHTML = `
    <div class="results-title">${count} flight${count !== 1 ? 's' : ''} found · ${data.query?.from?.split('(')[0]?.trim() || ''} → ${data.query?.to?.split('(')[0]?.trim() || ''}</div>
    ${insightHtml}`;

  if (!data.offers || data.offers.length === 0) {
    list.innerHTML = '<p style="color:var(--text-2);text-align:center;padding:40px">No flights found. Try different dates or airports.</p>';
    return;
  }

  list.innerHTML = data.offers.map((f, i) => renderCard(f, { rank: i + 1 })).join('');
}

// ── Best deal ──────────────────────────────────────────────────────────────
async function doBestDeal() {
  const params = getParams();
  if (!params) return;
  state.lastParams = params;

  showLoading('Finding the best deal…');
  try {
    const data = await fetchAPI('/api/best-deal', params);
    hideLoading();
    renderBestDeal(data);
  } catch (err) {
    hideLoading();
    showToast(`Error: ${err.message}`);
  }
}

function renderBestDeal(data) {
  const section = $('results-section');
  const header = $('results-header');
  const list = $('flight-list');

  show(section);
  section.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const best = data.bestDeal;
  const all = data.allRanked || [];
  const insights = data.priceInsights;
  const insightHtml = insights ? `<div class="price-insight">Typical: ${insights.priceLevel || ''} · From $${insights.lowestPrice}</div>` : '';

  header.innerHTML = `
    <div class="results-title">Best deal · ${data.query?.from?.split('(')[0]?.trim() || ''} → ${data.query?.to?.split('(')[0]?.trim() || ''}</div>
    ${insightHtml}`;

  // Build best card from bestDeal.details
  const bestFlight = best.details || { offerId: best.offerId, airlines: best.airlines, totalDurationMinutes: 0, totalStops: 0, price: best.price, stops: 0 };
  bestFlight.offerId = best.offerId;

  const bestHtml = `
    <div class="best-deal-header">✦ Best Deal — Score ${best.score} (${data.query?.priority || 'balanced'} priority)</div>
    ${renderCard(bestFlight, { isBest: true, score: best.score })}`;

  // Other ranked flights (skip rank 1 since we already showed it)
  const othersHtml = all.length > 1
    ? `<div class="results-divider"><span>All ${all.length} options ranked</span></div>` +
      all.slice(1).map(r => {
        const mini = {
          offerId: r.offerId,
          airlines: r.airlines,
          stops: parseInt(r.stops) || 0,
          totalDurationMin: 0,
          price: { display: r.price },
        };
        return renderCard(mini, { rank: r.rank, score: r.score });
      }).join('')
    : '';

  list.innerHTML = bestHtml + othersHtml;
}

// ── Details modal ──────────────────────────────────────────────────────────
async function showDetails(offerId) {
  const params = state.lastParams;
  if (!params) { showToast('Please search first'); return; }

  showLoading('Loading details…');
  try {
    const data = await fetchAPI('/api/flight-details', {
      offerId,
      origin: params.origin,
      destination: params.destination,
      departureDate: params.departureDate,
      returnDate: params.returnDate,
      adults: params.adults,
      travelClass: params.travelClass,
    });
    hideLoading();
    openModal(data);
  } catch (err) {
    hideLoading();
    showToast(`Error: ${err.message}`);
  }
}

function renderSegments(segments, label) {
  if (!segments || segments.length === 0) return '';
  const rows = segments.map(s => `
    <div class="segment-item">
      <div class="seg-icon">✈</div>
      <div class="seg-info">
        <div class="seg-flight">${s.flightNumber || s.flight || ''} · ${s.airline || s.carrier || ''}</div>
        <div class="seg-route">${s.from || s.fromAirport || ''} → ${s.to || s.toAirport || ''}</div>
        <div class="seg-time">${fmtDate(s.departAt || s.departs)} ${fmtTime(s.departAt || s.departs)} → ${fmtTime(s.arriveAt || s.arrives)} · ${fmtDuration(s.durationMinutes)}</div>
        <div class="seg-meta">
          ${s.aircraft ? `<span>✈ ${s.aircraft}</span>` : ''}
          ${s.legroom ? `<span>💺 ${s.legroom}</span>` : ''}
        </div>
        ${(s.amenities || s.extensions || []).length
          ? `<div class="seg-extras">${(s.amenities || s.extensions || []).map(a => `<span class="pill">${a}</span>`).join('')}</div>`
          : ''}
      </div>
    </div>`).join('');

  return `<div class="segment-block"><div class="segment-label">${label}</div>${rows}</div>`;
}

function openModal(data) {
  const body = $('modal-body');
  const d = data.outbound || data.fullDetails?.outbound || {};
  const from = d.from || data.query?.origin || '';
  const to = d.to || data.query?.destination || '';

  // Carbon badge
  let carbonHtml = '';
  if (data.carbon) {
    const cls = (data.carbon.vsTypical || '').includes('less') ? 'carbon-good' : 'carbon-bad';
    carbonHtml = `<div class="carbon-row">🌱 ${data.carbon.grams ? `${(data.carbon.grams/1000).toFixed(1)} kg CO₂` : ''} ${data.carbon.vsTypical ? `<span class="${cls}">${data.carbon.vsTypical}</span>` : ''}</div>`;
  }

  const outSegs = data.outbound?.segments || data.fullDetails?.outbound?.segments || [];
  const retSegs = (data.return?.segments) || (data.fullDetails?.return?.segments) || [];

  body.innerHTML = `
    <div class="modal-title">${from} → ${to}</div>
    <div class="modal-subtitle">${data.source || 'Google Flights'} · ${data.tripType || ''}</div>
    <div class="modal-price">${data.price?.display || data.price?.total || ''}</div>
    ${carbonHtml}
    ${renderSegments(outSegs, 'Outbound flight')}
    ${retSegs.length ? renderSegments(retSegs, 'Return flight') : ''}
    <div class="modal-booking">
      <a class="btn-book" href="${data.bookingUrl || '#'}" target="_blank" rel="noopener">
        Book on Google Flights ↗
      </a>
    </div>`;

  const overlay = $('modal-overlay');
  show(overlay);
  overlay.focus?.();
}

// ── Price tracking ─────────────────────────────────────────────────────────
async function trackFlight() {
  const params = state.lastParams;
  if (!params) { showToast('Please search first'); return; }

  showLoading('Adding to price tracker…');
  try {
    const data = await fetchAPI('/api/track', { action: 'add', ...params });
    hideLoading();
    showToast(`✓ Tracking added! ID: ${data.trackId?.slice(0, 8)}… · Initial: ${data.initialPrice}`);
  } catch (err) {
    hideLoading();
    showToast(`Error: ${err.message}`);
  }
}

// ── UI helpers ─────────────────────────────────────────────────────────────
function showLoading(msg = 'Loading…') {
  const el = $('loading-overlay');
  el.querySelector('p').textContent = msg;
  show(el);
}
function hideLoading() { hide($('loading-overlay')); }

let toastTimer;
function showToast(msg) {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3500);
}

// ── Event wiring ────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Set min date to today
  const today = new Date().toISOString().split('T')[0];
  $('departure-date').min = today;
  $('return-date').min = today;

  // Trip type toggle
  document.querySelectorAll('input[name="trip-type"]').forEach(r => {
    r.addEventListener('change', () => {
      if (isRoundTrip()) show($('return-date-wrap'));
      else hide($('return-date-wrap'));
    });
  });

  // Departure date → update return min
  $('departure-date').addEventListener('change', () => {
    $('return-date').min = $('departure-date').value;
    if ($('return-date').value && $('return-date').value < $('departure-date').value) {
      $('return-date').value = $('departure-date').value;
    }
  });

  // Adults counter
  $('adults-dec').addEventListener('click', () => {
    if (state.adults > 1) { state.adults--; $('adults-val').textContent = state.adults; $('adults').value = state.adults; }
  });
  $('adults-inc').addEventListener('click', () => {
    if (state.adults < 9) { state.adults++; $('adults-val').textContent = state.adults; $('adults').value = state.adults; }
  });

  // Swap airports
  $('swap-btn').addEventListener('click', () => {
    const o = $('origin').value, d = $('destination').value;
    $('origin').value = d; $('destination').value = o;
  });

  // Uppercase origin/destination
  ['origin', 'destination'].forEach(id => {
    $(id).addEventListener('input', () => { $(id).value = $(id).value.toUpperCase(); });
  });

  // Buttons
  $('search-btn').addEventListener('click', doSearch);
  $('best-btn').addEventListener('click', doBestDeal);

  // Enter key on form fields
  ['origin', 'destination', 'departure-date', 'return-date'].forEach(id => {
    $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') doBestDeal(); });
  });

  // Modal close
  $('modal-close').addEventListener('click', () => hide($('modal-overlay')));
  $('modal-overlay').addEventListener('click', (e) => {
    if (e.target === $('modal-overlay')) hide($('modal-overlay'));
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hide($('modal-overlay'));
  });
});
