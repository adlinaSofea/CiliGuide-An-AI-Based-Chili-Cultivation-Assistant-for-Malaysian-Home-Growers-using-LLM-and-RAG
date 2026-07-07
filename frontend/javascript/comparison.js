import { auth, db } from './firebase-config.js';
import {
  collection, getDocs, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let _allCycles    = [];
let _visibleCount = 5;       // how many cards are currently shown
const MAX_VISIBLE = 5;       // default and step size per "Load more" click

// ─── STAGE CONFIG ─────────────────────────────────────────────────────────────

function getStageConfig(days, isCompleted) {
  if (isCompleted) return { label: 'Harvested', bg: '#f3f4f6', color: '#9ca3af' };
  if (days <= 7)   return { label: 'Seed',      bg: '#faf5ff', color: '#7e22ce' };
  if (days <= 20)  return { label: 'Sprout',    bg: '#f0fdf4', color: '#15803d' };
  if (days <= 45)  return { label: 'Grow',      bg: '#f0fdf4', color: '#16a34a' };
  if (days <= 65)  return { label: 'Flower',    bg: '#fdf2f8', color: '#be185d' };
  return                  { label: 'Harvest',   bg: '#fff7ed', color: '#c2410c' };
}

// ─── RANK MEDAL ───────────────────────────────────────────────────────────────

function rankMedal(index) {
  return ['🥇','🥈','🥉'][index] || '';
}

// ─── PROGRESS CONFIG ──────────────────────────────────────────────────────────

function getProgressConfig(progress, isCompleted) {
  if (isCompleted)    return { color: '#d1d5db' };
  if (progress >= 90) return { color: '#ea580c' };
  if (progress >= 60) return { color: '#f59e0b' };
  if (progress >= 30) return { color: '#e2c084' };
  return                     { color: '#dc2626' };
}

// ─── DONUT SVG ────────────────────────────────────────────────────────────────

function buildDonut(progress, color) {
  const r    = 16;
  const circ = 2 * Math.PI * r;
  const offset = circ - (progress / 100) * circ;
  return `
    <div class="comp-donut-wrap">
      <svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
        <circle class="comp-donut-track" cx="20" cy="20" r="${r}"/>
        <circle class="comp-donut-fill"
          cx="20" cy="20" r="${r}"
          stroke="${color}"
          stroke-dasharray="${circ.toFixed(2)}"
          stroke-dashoffset="${offset.toFixed(2)}"/>
      </svg>
      <div class="comp-donut-pct">${progress}%</div>
    </div>`;
}

// ─── VIEW TOGGLE (Active / All) ───────────────────────────────────────────────

window.toggleComparisonView = function (view) {
  // Reset pagination when switching tabs
  _visibleCount = MAX_VISIBLE;

  document.querySelectorAll('.comp-view-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`.comp-view-btn[data-view="${view}"]`)?.classList.add('active');

  const toShow = view === 'active'
    ? _allCycles.filter(c => !c.harvestedDate && c.status === 'active')
    : _allCycles;

  renderComparisonCards(toShow);
};

// ─── LOAD MORE (+5) ───────────────────────────────────────────────────────────

window.loadMoreComparisonCycles = function () {
  _visibleCount += MAX_VISIBLE;

  const activeBtn = document.querySelector('.comp-view-btn.active');
  const view = activeBtn?.dataset.view || 'active';

  const toShow = view === 'active'
    ? _allCycles.filter(c => !c.harvestedDate && c.status === 'active')
    : _allCycles;

  renderComparisonCards(toShow);
};

// ─── COLLAPSE back to default ─────────────────────────────────────────────────

window.collapseComparisonCycles = function () {
  _visibleCount = MAX_VISIBLE;

  const activeBtn = document.querySelector('.comp-view-btn.active');
  const view = activeBtn?.dataset.view || 'active';

  const toShow = view === 'active'
    ? _allCycles.filter(c => !c.harvestedDate && c.status === 'active')
    : _allCycles;

  renderComparisonCards(toShow);
};

// ─── SORT: active first (newest), then completed ──────────────────────────────

function getSorted(cycles) {
  const byDate = (a, b) => {
    const dA = a.plantingDate?.toDate ? a.plantingDate.toDate() : new Date(a.plantingDate);
    const dB = b.plantingDate?.toDate ? b.plantingDate.toDate() : new Date(b.plantingDate);
    return dB - dA;
  };
  const active    = cycles.filter(c => !c.harvestedDate && c.status === 'active').sort(byDate);
  const completed = cycles.filter(c =>  c.harvestedDate || c.status === 'completed').sort(byDate);
  return [...active, ...completed];
}

// ─── BUILD SINGLE CARD HTML ───────────────────────────────────────────────────

function buildCardHTML(cycle, activeInVisible) {
  const daysPassed  = calculateDaysPassed(cycle.plantingDate);
  const totalDays   = cycle.varietyDays || 90;
  const progress    = Math.min(Math.round((daysPassed / totalDays) * 100), 100);
  const daysLeft    = Math.max(totalDays - daysPassed, 0);
  const isCompleted = !!cycle.harvestedDate || cycle.status === 'completed';
  const isSoon      = !isCompleted && daysLeft <= 7;
  const activeRank  = activeInVisible.indexOf(cycle);

  const { color: progColor } = getProgressConfig(progress, isCompleted);
  const stageConf            = getStageConfig(daysPassed, isCompleted);
  const noteCount            = cycle.notes?.length || 0;
  const issueCount           = cycle.notes?.filter(n =>
    n.category?.includes('Pest') || n.category?.includes('Disease')).length || 0;

  const pctColor = isCompleted ? '#9ca3af' : progColor;
  const barColor = isCompleted ? '#e5e7eb' : progColor;

  let badgeClass, badgeText;
  if (isCompleted)  { badgeClass = 'badge-done';   badgeText = 'Completed'; }
  else if (isSoon)  { badgeClass = 'badge-soon';   badgeText = 'Harvest soon!'; }
  else              { badgeClass = 'badge-active';  badgeText = 'Active'; }

  const chipNoteBg   = isCompleted ? '#f3f4f6' : '#eff6ff';
  const chipNoteClr  = isCompleted ? '#9ca3af' : '#1d4ed8';
  const chipIssueBg  = isCompleted ? '#f3f4f6' : '#fef2f2';
  const chipIssueClr = isCompleted ? '#9ca3af' : '#b91c1c';
  const chipCleanBg  = isCompleted ? '#f3f4f6' : '#f0fdf4';
  const chipCleanClr = isCompleted ? '#9ca3af' : '#15803d';
  const varietyStyle = isCompleted ? 'color:#9ca3af;' : '';
  const metaStyle    = isCompleted ? 'color:#c4c8ce;' : '';

  return `
    <div class="compare-card ${isCompleted ? 'compare-card--done' : ''}">
      <div class="compare-card-inner">

        <div class="compare-card-header">
          <div class="compare-card-header-left">
            ${buildDonut(progress, barColor)}
            <div>
              <div class="compare-variety" style="${varietyStyle}">
                ${activeRank >= 0 && rankMedal(activeRank)
                  ? `<span class="comp-rank-medal">${rankMedal(activeRank)}</span>`
                  : ''}${cycle.variety}
              </div>
              <div class="compare-meta" style="${metaStyle}">
                Planted ${formatDate(cycle.plantingDate)} ·
                ${cycle.harvestGoal || cycle.targetColor || ''} harvest ·
                ${cycle.method || cycle.growingEnvironment || 'Outdoor'}
              </div>
            </div>
          </div>
          <span class="compare-status-badge ${badgeClass}">${badgeText}</span>
        </div>

        <div class="comp-chips-row">
          <span class="comp-chip" style="background:${chipNoteBg};color:${chipNoteClr};">
            ${noteCount} note${noteCount !== 1 ? 's' : ''}
          </span>
          ${issueCount > 0
            ? `<span class="comp-chip" style="background:${chipIssueBg};color:${chipIssueClr};">
                ${issueCount} issue${issueCount !== 1 ? 's' : ''}
               </span>`
            : `<span class="comp-chip" style="background:${chipCleanBg};color:${chipCleanClr};">
                No issues
               </span>`}
        </div>

        <div class="compare-progress-wrap">
          <div class="compare-progress-row">
            <span style="${isCompleted ? 'color:#9ca3af;' : ''}">Progress</span>
            <span class="compare-progress-pct" style="color:${pctColor};">${progress}%</span>
          </div>
          <div class="prog-track">
            <div class="prog-fill" style="width:${progress}%;background:${barColor};"></div>
          </div>
        </div>

        <div class="compare-stats-grid">
          <div class="compare-stat">
            <div class="compare-stat-label">Day</div>
            <div class="compare-stat-val" style="${isCompleted ? 'color:#9ca3af;' : ''}">${daysPassed}</div>
          </div>
          <div class="compare-stat">
            <div class="compare-stat-label">Days left</div>
            <div class="compare-stat-val" style="${isCompleted ? 'color:#9ca3af;' : ''}">${isCompleted ? '—' : daysLeft}</div>
          </div>
          <div class="compare-stat" style="grid-column:1/-1;">
            <div class="compare-stat-label">Stage</div>
            <div class="compare-stat-val" style="display:flex;justify-content:center;">
              <div class="comp-stage-pill" style="background:${stageConf.bg};color:${stageConf.color};">
                ${stageConf.label}
              </div>
            </div>
          </div>
        </div>

        <div class="compare-footer-row" style="${isCompleted ? 'color:#9ca3af;' : ''}">
          ${isCompleted
            ? `Harvested on ${formatDate(cycle.harvestedDate)}`
            : `Est. harvest: ${getEstHarvestDate(cycle.plantingDate, totalDays)}`}
        </div>

      </div>
    </div>`;
}

// ─── RENDER CARDS ─────────────────────────────────────────────────────────────

function renderComparisonCards(cycles) {
  const container = document.getElementById('comparisonCardsWrap');
  if (!container) return;

  const sorted      = getSorted(cycles);
  const visible     = sorted.slice(0, _visibleCount);
  const remaining   = sorted.length - visible.length;       // how many still hidden
  const nextBatch   = Math.min(MAX_VISIBLE, remaining);     // how many next click reveals

  if (visible.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding:30px;grid-column:1/-1;">
        <p>No cycles to show. Start a new cycle to compare.</p>
      </div>`;
    return;
  }

  const activeInVisible = visible.filter(c => !c.harvestedDate && c.status === 'active');

  let html = '<div class="compare-grid">';
  visible.forEach(cycle => { html += buildCardHTML(cycle, activeInVisible); });
  html += '</div>';

  // ── Pagination bar ────────────────────────────────────────────────────────
  if (remaining > 0) {
    // More to load — show Load more button
    html += `
      <div class="comp-showall-bar">
        <span class="comp-showall-info">
          Showing ${visible.length} of ${sorted.length} cycles
        </span>
        <div style="display:flex;gap:8px;align-items:center;">
          ${_visibleCount > MAX_VISIBLE
            ? `<button class="comp-collapse-btn" onclick="collapseComparisonCycles()">
                Show less
               </button>`
            : ''}
          <button class="comp-showall-btn" onclick="loadMoreComparisonCycles()">
            Load ${nextBatch} more
            <span class="comp-remaining-badge">${remaining} remaining</span>
          </button>
        </div>
      </div>`;
  } else if (_visibleCount > MAX_VISIBLE) {
    // All loaded and user expanded — show collapse option
    html += `
      <div class="comp-showall-bar">
        <span class="comp-showall-info">
          Showing all ${sorted.length} cycles
        </span>
        <button class="comp-collapse-btn" onclick="collapseComparisonCycles()">
          Show less
        </button>
      </div>`;
  }

  container.innerHTML = html;

  const activeCycles = cycles.filter(c => !c.harvestedDate && c.status === 'active');
  renderSummary(activeCycles, cycles.length);
}

// ─── RENDER SUMMARY ───────────────────────────────────────────────────────────

function renderSummary(activeCycles, totalCount) {
  const summaryEl = document.getElementById('comparisonSummary');
  if (!summaryEl) return;

  if (activeCycles.length < 2) { summaryEl.innerHTML = ''; return; }

  const stats = activeCycles.map(c => {
    const days     = calculateDaysPassed(c.plantingDate);
    const total    = c.varietyDays || 90;
    const progress = Math.min(Math.round((days / total) * 100), 100);
    return { ...c, days, progress, daysLeft: Math.max(total - days, 0) };
  });

  const fastest   = stats.reduce((a, b) => a.progress >= b.progress ? a : b);
  const soonest   = stats.reduce((a, b) => a.daysLeft  <= b.daysLeft  ? a : b);
  const mostGrown = stats.reduce((a, b) => a.days      >= b.days      ? a : b);

  summaryEl.innerHTML = `
    <div class="compare-summary">
      <div class="compare-summary-head">
        <span class="comp-sum-head-icon">📊</span>
        <div>
          <div class="comp-sum-head-title">Head-to-Head Summary</div>
          <div class="comp-sum-head-sub">Active cycles compared</div>
        </div>
      </div>
      <div class="compare-summary-body">
        <div class="compare-summary-grid">
          <div class="compare-summary-item cs-item-1">
            <div class="cs-label">Furthest Progress</div>
            <div class="cs-winner">🥇 ${fastest.variety}</div>
            <div class="cs-detail">${fastest.progress}% complete</div>
          </div>
          <div class="compare-summary-item cs-item-2">
            <div class="cs-label">Harvests Soonest</div>
            <div class="cs-winner">⏰ ${soonest.variety}</div>
            <div class="cs-detail">${soonest.daysLeft} days left</div>
          </div>
          <div class="compare-summary-item cs-item-3">
            <div class="cs-label">Most Days Grown</div>
            <div class="cs-winner">🌱 ${mostGrown.variety}</div>
            <div class="cs-detail">Day ${mostGrown.days}</div>
          </div>
          <div class="compare-summary-item cs-item-4">
            <div class="cs-label">Total Cycles</div>
            <div class="cs-winner" style="font-size:1.3rem;font-weight:800;color:var(--text);">
              ${totalCount}
            </div>
            <div class="cs-detail">${activeCycles.length} active</div>
          </div>
        </div>
      </div>
    </div>`;
}

// ─── MAIN LOAD ────────────────────────────────────────────────────────────────

export async function loadComparison(userId) {
  const container  = document.getElementById('comparisonContainer');
  const emptyState = document.getElementById('comparisonEmpty');
  if (!container) return;

  // Reset pagination on fresh load
  _visibleCount = MAX_VISIBLE;

  try {
    const snap = await getDocs(query(
      collection(db, 'users', userId, 'harvestCycles'),
      orderBy('plantingDate', 'desc')
    ));

    if (snap.empty || snap.size < 2) {
      if (emptyState) emptyState.style.display = 'block';
      container.innerHTML = `
        <div class="empty-state">
          <div style="font-size:2.5rem;">🌶️</div>
          <p>Start at least 2 cycles to compare varieties.</p>
        </div>`;
      return;
    }

    if (emptyState) emptyState.style.display = 'none';

    _allCycles = [];
    snap.forEach(docSnap => _allCycles.push({ id: docSnap.id, ...docSnap.data() }));

    const activeCount = _allCycles.filter(c => !c.harvestedDate && c.status === 'active').length;
    const totalCount  = _allCycles.length;

    container.innerHTML = `
      <div class="comp-header-banner">
        <div class="comp-header-icon-wrap">📋</div>
        <div>
          <div class="comp-header-title">Variety Comparison</div>
          <div class="comp-header-sub">Compare progress, stages &amp; health across your cycles</div>
        </div>
        <div class="comp-header-badge">
          <span class="comp-hbadge">${activeCount} active</span>
          <span class="comp-hbadge">${totalCount} total</span>
        </div>
      </div>

      <div class="comp-view-toggle">
        <button class="comp-view-btn active" data-view="active"
          onclick="toggleComparisonView('active')">
          Active (${activeCount})
        </button>
        <button class="comp-view-btn" data-view="all"
          onclick="toggleComparisonView('all')">
          All cycles (${totalCount})
        </button>
      </div>

      <div id="comparisonCardsWrap"></div>
      <div id="comparisonSummary"></div>`;

    const defaultView = activeCount > 0
      ? _allCycles.filter(c => !c.harvestedDate && c.status === 'active')
      : _allCycles;

    if (activeCount === 0) {
      document.querySelector('.comp-view-btn[data-view="active"]')?.classList.remove('active');
      document.querySelector('.comp-view-btn[data-view="all"]')?.classList.add('active');
    }

    renderComparisonCards(defaultView);

  } catch (err) {
    console.error('loadComparison error:', err);
  }
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function calculateDaysPassed(plantingDate) {
  const planted = plantingDate?.toDate ? plantingDate.toDate() : new Date(plantingDate);
  const start = new Date(planted); start.setHours(0,0,0,0);
  const today = new Date();        today.setHours(0,0,0,0);
  return Math.max(Math.floor((today - start) / 86400000) + 1, 1);
}

function formatDate(dateVal) {
  if (!dateVal) return '—';
  const d = dateVal?.toDate ? dateVal.toDate() : new Date(dateVal);
  return d.toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' });
}

function getEstHarvestDate(plantingDate, totalDays) {
  const planted = plantingDate?.toDate ? plantingDate.toDate() : new Date(plantingDate);
  const est = new Date(planted);
  est.setDate(est.getDate() + totalDays);
  return est.toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' });
}