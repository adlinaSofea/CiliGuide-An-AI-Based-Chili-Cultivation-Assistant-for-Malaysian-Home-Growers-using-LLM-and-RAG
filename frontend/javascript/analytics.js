import { auth, db } from './firebase-config.js';
import {
    collection, getDocs, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let _allCycles = [];
let _userId    = '';

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function calculateDaysPassed(plantingDate) {
    const planted = plantingDate?.toDate ? plantingDate.toDate() : new Date(plantingDate);
    const start = new Date(planted); start.setHours(0,0,0,0);
    const today = new Date();        today.setHours(0,0,0,0);
    return Math.max(Math.floor((today - start) / 86400000) + 1, 1);
}

function getProgress(cycle) {
    const days = calculateDaysPassed(cycle.plantingDate);
    return Math.min(Math.round((days / (cycle.varietyDays || 90)) * 100), 100);
}

function getStatusLabel(cycle) {
    if (cycle.status === 'completed' || cycle.harvestedDate) return 'Done';
    if (getProgress(cycle) >= 80) return 'Near harvest';
    return 'Active';
}

function getStatusColors(cycle) {
    const label = getStatusLabel(cycle);
    if (label === 'Done')         return { bar: '#27ae60', badge: '#eafaf1', text: '#1e8449' };
    if (label === 'Near harvest') return { bar: '#f39c12', badge: '#fef9e7', text: '#b7770d' };
    return { bar: '#e74c3c', badge: '#fdecea', text: '#c0392b' };
}

function shortenName(name, index) {
    return `${(name?.replace('Cili ','C. ') || '—')} #${index + 1}`;
}

function getIssueCount(cycle) {
    return cycle.notes?.filter(n =>
        n.category?.includes('Pest') || n.category?.includes('Disease')
    ).length || 0;
}

// ─── FILTER / GROUP SWITCHES ──────────────────────────────────────────────────

window.switchAnalyticsFilter = function(filter) {
    document.querySelectorAll('.an-filter-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`.an-filter-btn[data-filter="${filter}"]`)?.classList.add('active');
    const group = document.querySelector('.an-group-btn.active')?.dataset.group || 'cycle';
    const cycles = filter === 'last5' ? _allCycles.slice(-5) : _allCycles;
    group === 'variety' ? renderGrouped(cycles) : renderCharts(cycles);
};

window.switchAnalyticsGroup = function(group) {
    document.querySelectorAll('.an-group-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`.an-group-btn[data-group="${group}"]`)?.classList.add('active');
    const filter = document.querySelector('.an-filter-btn.active')?.dataset.filter || 'last5';
    const cycles = filter === 'last5' ? _allCycles.slice(-5) : _allCycles;
    group === 'variety' ? renderGrouped(cycles) : renderCharts(cycles);
};

// ─── RENDER CHARTS (PER CYCLE) ────────────────────────────────────────────────

function renderCharts(cycles) {
    const wrap = document.getElementById('analyticsChartWrap');
    if (!wrap) return;

    const maxIssues = Math.max(...cycles.map(c => getIssueCount(c)), 1);

    const progressBars = cycles.map((c, i) => {
        const pct    = getProgress(c);
        const colors = getStatusColors(c);
        return `
            <div class="an-bc-col">
                <span class="an-bc-pct" style="color:${colors.bar};">${pct}%</span>
                <div class="an-bc-bar" style="height:${Math.max(pct,8)}%;background:${colors.bar};"></div>
            </div>`;
    }).join('');

    const progressLabels = cycles.map((c, i) => {
        const colors = getStatusColors(c);
        return `
            <div class="an-bc-label-col">
                <span class="an-bc-name">${shortenName(c.variety, i)}</span>
                <span class="an-bc-badge" style="background:${colors.badge};color:${colors.text};">${getStatusLabel(c)}</span>
            </div>`;
    }).join('');

    const issueBars = cycles.map((c, i) => {
        const count  = getIssueCount(c);
        const hPct   = Math.round((count / maxIssues) * 100);
        const color  = count === 0 ? '#27ae60' : count === 1 ? '#f39c12' : '#e74c3c';
        const bg     = count === 0 ? '#eafaf1' : count === 1 ? '#fef9e7' : '#fdecea';
        return `
            <div class="an-bc-col">
                <span class="an-bc-pct" style="color:${color};">${count}</span>
                <div class="an-bc-bar" style="height:${Math.max(hPct,4)}%;background:${bg};border:2px solid ${color};"></div>
            </div>`;
    }).join('');

    const issueLabels = cycles.map((c, i) => `
        <div class="an-bc-label-col">
            <span class="an-bc-name">${shortenName(c.variety, i)}</span>
        </div>`).join('');

    let trendMsg = '';
    if (cycles.length >= 2) {
        const issues = cycles.map(c => getIssueCount(c));
        const first  = issues[0], last = issues[issues.length - 1];
        if (last < first)       trendMsg = '✅ Issues decreasing — great improvement!';
        else if (last === first) trendMsg = '📊 Issue count is stable across cycles.';
        else                    trendMsg = '⚠️ Issues increasing — review your care routine.';
    }

    wrap.innerHTML = `
        <div class="an-two-col">
            <div class="an-card">
                <div class="an-card-head an-head-navy-progress an-progress-head">
                    <span class="an-head-icon">📊</span>
                    <div>
                        <div class="an-head-title">Cycle progress</div>
                        <div class="an-head-sub">% complete · ${cycles.length} cycle${cycles.length !== 1 ? 's' : ''}</div>
                    </div>
                </div>
                <div class="an-card-body">
                    <div class="an-bar-chart-wrap">${progressBars}</div>
                    <div class="an-bc-labels-row">${progressLabels}</div>
                </div>
            </div>
            <div class="an-card">
                <div class="an-card-head an-head-red an-issues-head">
                    <span class="an-head-icon">🐛</span>
                    <div>
                        <div class="an-head-title">Issues per cycle</div>
                        <div class="an-head-sub">Pest &amp; disease count</div>
                    </div>
                </div>
                <div class="an-card-body">
                    <div class="an-bar-chart-wrap">${issueBars}</div>
                    <div class="an-bc-labels-row">${issueLabels}</div>
                    ${trendMsg ? `<div class="an-tip-box">${trendMsg}</div>` : ''}
                </div>
            </div>
        </div>`;
}

// ─── RENDER GROUPED (BY VARIETY) ─────────────────────────────────────────────

function renderGrouped(cycles) {
    const wrap = document.getElementById('analyticsChartWrap');
    if (!wrap) return;

    const groups = {};
    cycles.forEach(c => {
        if (!groups[c.variety]) groups[c.variety] = [];
        groups[c.variety].push(c);
    });

    const varieties   = Object.keys(groups);
    const maxIssues   = Math.max(...varieties.map(v =>
        groups[v].reduce((s, c) => s + getIssueCount(c), 0) / groups[v].length
    ), 1);

    const avgBars = varieties.map(v => {
        const g   = groups[v];
        const avg = Math.round(g.reduce((s, c) => s + getProgress(c), 0) / g.length);
        return `
            <div class="an-bc-col">
                <span class="an-bc-pct" style="color:#3b82f6;">${avg}%</span>
                <div class="an-bc-bar" style="height:${Math.max(avg,8)}%;background:#3b82f6;"></div>
            </div>`;
    }).join('');

    const avgLabels = varieties.map(v => {
        const g = groups[v];
        return `
            <div class="an-bc-label-col">
                <span class="an-bc-name">${v.replace('Cili ','C. ')}</span>
                <span class="an-bc-badge" style="background:#eff6ff;color:#1d4ed8;">${g.length} cycle${g.length !== 1 ? 's' : ''}</span>
            </div>`;
    }).join('');

    const issueBars = varieties.map(v => {
        const g   = groups[v];
        const avg = Math.round(g.reduce((s, c) => s + getIssueCount(c), 0) / g.length);
        const hPct  = Math.round((avg / maxIssues) * 100);
        const color = avg === 0 ? '#27ae60' : avg <= 1 ? '#f39c12' : '#e74c3c';
        const bg    = avg === 0 ? '#eafaf1' : avg <= 1 ? '#fef9e7' : '#fdecea';
        return `
            <div class="an-bc-col">
                <span class="an-bc-pct" style="color:${color};">${avg}</span>
                <div class="an-bc-bar" style="height:${Math.max(hPct,4)}%;background:${bg};border:2px solid ${color};"></div>
            </div>`;
    }).join('');

    const issueLabels = varieties.map(v => `
        <div class="an-bc-label-col">
            <span class="an-bc-name">${v.replace('Cili ','C. ')}</span>
        </div>`).join('');

    wrap.innerHTML = `
        <div class="an-two-col">
            <div class="an-card">
                <div class="an-card-head an-head-navy-progress an-progress-head">
                    <span class="an-head-icon">📊</span>
                    <div>
                        <div class="an-head-title">Avg progress by variety</div>
                        <div class="an-head-sub">Average % complete across cycles</div>
                    </div>
                </div>
                <div class="an-card-body">
                    <div class="an-bar-chart-wrap">${avgBars}</div>
                    <div class="an-bc-labels-row">${avgLabels}</div>
                </div>
            </div>
            <div class="an-card">
                <div class="an-card-head an-head-red an-issues-head">
                    <span class="an-head-icon">🐛</span>
                    <div>
                        <div class="an-head-title">Avg issues by variety</div>
                        <div class="an-head-sub">Average pest &amp; disease per cycle</div>
                    </div>
                </div>
                <div class="an-card-body">
                    <div class="an-bar-chart-wrap">${issueBars}</div>
                    <div class="an-bc-labels-row">${issueLabels}</div>
                </div>
            </div>
        </div>`;
}

// ─── MAIN LOAD ────────────────────────────────────────────────────────────────

export async function loadAnalytics(userId) {
    const container = document.getElementById('analyticsContainer');
    if (!container) return;

    container.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;
                    justify-content:center;padding:60px 20px;gap:14px;">
            <div style="width:34px;height:34px;border:3px solid #eee;
                        border-top-color:#27ae60;border-radius:50%;
                        animation:an-spin 0.75s linear infinite;"></div>
            <span style="font-size:13px;color:#aaa;">Loading analytics…</span>
        </div>
        <style>@keyframes an-spin{to{transform:rotate(360deg);}}</style>`;

    try {
        const snap = await getDocs(
            query(collection(db, 'users', userId, 'harvestCycles'), orderBy('plantingDate', 'asc'))
        );

        if (snap.empty) {
            container.innerHTML = `
                <div style="display:flex;flex-direction:column;align-items:center;
                            padding:60px 24px;text-align:center;gap:10px;">
                    <div style="font-size:48px;">📈</div>
                    <div style="font-size:16px;font-weight:700;color:#1a1a1a;">No data yet</div>
                    <p style="font-size:13px;color:#aaa;max-width:220px;line-height:1.5;">
                        Start a harvest cycle to see your analytics.</p>
                </div>`;
            return;
        }

        _allCycles = [];
        snap.forEach(d => _allCycles.push({ id: d.id, ...d.data() }));
        _userId = userId;

        const totalCycles  = _allCycles.length;
        const activeCycles = _allCycles.filter(c => c.status === 'active' && !c.harvestedDate).length;
        const totalIssues  = _allCycles.reduce((s, c) => s + getIssueCount(c), 0);
        const showFilter   = totalCycles > 5;

        container.innerHTML = `
            <div class="an-header-banner">
                <div class="an-header-icon-wrap">📈</div>
                <div>
                    <div class="an-header-title">Growth Analytics</div>
                    <div class="an-header-sub">Track your progress and pest trends across all cycles</div>
                </div>
            </div>

            <div class="an-stats-row">
                <div class="an-stat-box an-s1">
                    <div class="an-stat-val">${totalCycles}</div>
                    <div class="an-stat-lbl">Total cycles</div>
                    <div class="an-stat-sub" style="color:#27ae60;">${activeCycles} active</div>
                </div>
                <div class="an-stat-box an-s2">
                    <div class="an-stat-val">${totalIssues}</div>
                    <div class="an-stat-lbl">Issues flagged</div>
                    <div class="an-stat-sub" style="color:#f39c12;">all time</div>
                </div>
            </div>

            <div class="an-controls-row">
                ${showFilter ? `
                <div class="an-toggle-wrap">
                    <button class="an-filter-btn active" data-filter="last5"
                        onclick="switchAnalyticsFilter('last5')">Last 5</button>
                    <button class="an-filter-btn" data-filter="all"
                        onclick="switchAnalyticsFilter('all')">All ${totalCycles}</button>
                </div>` : '<div></div>'}

                <div class="an-toggle-wrap">
                    <button class="an-group-btn active" data-group="cycle"
                        onclick="switchAnalyticsGroup('cycle')">Per cycle</button>
                    <button class="an-group-btn" data-group="variety"
                        onclick="switchAnalyticsGroup('variety')">By variety</button>
                </div>
            </div>

            <div id="analyticsChartWrap"></div>`;

        const defaultCycles = showFilter ? _allCycles.slice(-5) : _allCycles;
        renderCharts(defaultCycles);

    } catch (err) {
        console.error('loadAnalytics error:', err);
        container.innerHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;
                        padding:60px 24px;text-align:center;gap:10px;">
                <div style="font-size:48px;">⚠️</div>
                <div style="font-size:16px;font-weight:700;color:#1a1a1a;">Something went wrong</div>
                <p style="font-size:13px;color:#aaa;">Failed to load analytics. Please try again.</p>
            </div>`;
    }
}

export function initAnalytics(userId) {
    loadAnalytics(userId);
}