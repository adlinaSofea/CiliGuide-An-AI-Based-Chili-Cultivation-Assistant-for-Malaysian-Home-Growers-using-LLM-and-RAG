import { db } from './firebase-config.js';
import {
    collection, getDocs, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ─── HELPERS ────────────────────────────────────────────────────────────────

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

function shortenVariety(name) {
    return name?.replace('Cili ', 'C. ') || '—';
}

function formatDate(date) {
    if (!date) return '—';
    const d = date?.toDate ? date.toDate() : new Date(date);
    return d.toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ─── PAGINATION STATE ────────────────────────────────────────────────────────
const TIMELINE_PER_PAGE = 10;
let timelinePage = 1;
let allCycles = [];

// ─── INJECT STYLES ──────────────────────────────────────────────────────────

function injectStyles() {
    if (document.getElementById('pb-styles')) return;
    const style = document.createElement('style');
    style.id = 'pb-styles';
    style.textContent = `
        #personalBestContainer * { box-sizing: border-box; }
        #personalBestContainer { font-family: inherit; padding: 0; }

        .pb-stat-row {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 12px;
            margin-bottom: 16px;
        }
        .pb-stat-box {
            background: #fff;
            border: 1px solid #ede9e3;
            border-radius: 14px;
            padding: 18px 14px 15px;
            text-align: center;
            position: relative;
            overflow: hidden;
        }
        .pb-stat-box::after {
            content: '';
            position: absolute;
            bottom: 0; left: 0; right: 0;
            height: 3px;
            border-radius: 0 0 14px 14px;
        }
        .pb-stat-box.s1::after { background: linear-gradient(90deg,#e74c3c,#f39c12); }
        .pb-stat-box.s2::after { background: linear-gradient(90deg,#2980b9,#1abc9c); }
        .pb-stat-box.s3::after { background: linear-gradient(90deg,#f39c12,#e67e22); }
        .pb-stat-box.s4::after { background: linear-gradient(90deg,#8e44ad,#9b59b6); }
        .pb-stat-num {
            font-size: 30px;
            font-weight: 800;
            color: #1a1a1a;
            line-height: 1;
            margin-bottom: 5px;
        }
        .pb-stat-lbl {
            font-size: 12px;
            color: #aaa;
            margin-bottom: 3px;
            font-weight: 500;
        }
        .pb-stat-sub { font-size: 11px; font-weight: 700; }

        .pb-mid-row {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 14px;
            margin-bottom: 16px;
        }

        .pb-card {
            background: #fff;
            border: 1px solid #ede9e3;
            border-radius: 14px;
            overflow: hidden;
            display: flex;
            flex-direction: column;
        }

        .pb-hof-head {
            background: linear-gradient(135deg, #1a0800 0%, #3d1200 50%, #6b2000 100%);
            padding: 14px 18px;
            display: flex;
            align-items: center;
            gap: 10px;
            position: relative;
            overflow: hidden;
        }
        .pb-hof-head::after {
            content: '🏆';
            position: absolute;
            right: 14px; top: 50%;
            transform: translateY(-50%);
            font-size: 44px;
            opacity: 0.13;
        }
        .pb-hof-head-icon { font-size: 18px; }
        .pb-hof-head-title { font-size: 14px; font-weight: 700; color: #fff; }
        .pb-hof-head-sub   { font-size: 11px; color: rgba(255,255,255,0.5); margin-top: 1px; }

        .pb-hof-row {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 12px 18px;
            border-bottom: 1px solid #f5f2ee;
            transition: background 0.15s;
        }
        .pb-hof-row:last-child { border: none; }
        .pb-hof-row:hover { background: #faf8f5; }
        .pb-hof-dot {
            width: 28px; height: 28px;
            display: flex; align-items: center; justify-content: center;
            font-size: 18px; flex-shrink: 0;
        }
        .pb-hof-body { flex: 1; min-width: 0; }
        .pb-hof-name { font-size: 13px; font-weight: 700; color: #1a1a1a; }
        .pb-hof-sub  { font-size: 11px; color: #bbb; margin-top: 1px; }
        .pb-chip {
            font-size: 11px; font-weight: 700;
            padding: 4px 11px;
            border-radius: 20px;
            white-space: nowrap; flex-shrink: 0;
        }

        .pb-ph-head {
            background: linear-gradient(135deg, #0a1628 0%, #0d2547 40%, #0d3b6e 100%);
            padding: 14px 18px;
            display: flex;
            align-items: center;
            gap: 10px;
            position: relative;
            overflow: hidden;
        }
        .pb-ph-head::before {
            content: '';
            position: absolute;
            top: -20px; right: -20px;
            width: 90px; height: 90px;
            background: radial-gradient(circle, rgba(56,189,248,0.18) 0%, transparent 70%);
            pointer-events: none;
        }
        .pb-ph-head::after {
            content: '🛡️';
            position: absolute;
            right: 14px; top: 50%;
            transform: translateY(-50%);
            font-size: 42px;
            opacity: 0.14;
        }
        .pb-ph-head-icon  { font-size: 18px; }
        .pb-ph-head-title { font-size: 14px; font-weight: 700; color: #fff; }
        .pb-ph-head-sub   { font-size: 11px; color: rgba(255,255,255,0.5); margin-top: 1px; }

        .pb-ph-body { padding: 18px 18px 16px; display: flex; flex-direction: column; flex: 1; }
        .pb-ph-feedback { margin-top: auto; }

        .pb-ph-gauge-wrap {
            display: flex;
            flex-direction: column;
            align-items: center;
            margin-bottom: 14px;
            position: relative;
        }
        .pb-ph-donut {
            position: relative;
            width: 110px; height: 110px;
            margin-bottom: 10px;
        }
        .pb-ph-donut svg {
            width: 100%; height: 100%;
            transform: rotate(-210deg);
        }
        .pb-ph-donut-track {
            fill: none;
            stroke: #e8f4fd;
            stroke-width: 10;
            stroke-linecap: round;
        }
        .pb-ph-donut-fill {
            fill: none;
            stroke-width: 10;
            stroke-linecap: round;
            transition: stroke-dashoffset 1.2s cubic-bezier(.4,0,.2,1);
        }
        .pb-ph-donut-center {
            position: absolute;
            inset: 0;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
        }
        .pb-ph-score-num {
            font-size: 26px;
            font-weight: 900;
            color: #0d3b6e;
            line-height: 1;
            letter-spacing: -1px;
        }
        .pb-ph-score-lbl {
            font-size: 9px;
            font-weight: 700;
            color: #93c5fd;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-top: 2px;
        }
        .pb-ph-score-max {
            font-size: 10px;
            color: #bcd4f0;
            font-weight: 600;
        }

        .pb-ph-streak {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            background: linear-gradient(135deg, #e0f2fe, #dbeafe);
            border: 1px solid #bfdbfe;
            border-radius: 20px;
            padding: 5px 13px;
            font-size: 12px;
            font-weight: 700;
            color: #1e40af;
        }
        .pb-ph-streak-dot {
            width: 7px; height: 7px;
            border-radius: 50%;
            background: #3b82f6;
            animation: pb-pulse 1.8s ease-in-out infinite;
        }
        @keyframes pb-pulse {
            0%,100% { opacity: 1; transform: scale(1); }
            50%      { opacity: 0.5; transform: scale(0.75); }
        }

        .pb-ph-stats {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 8px;
            margin-bottom: 12px;
        }
        .pb-ph-stat {
            background: #f0f7ff;
            border: 1px solid #dbeafe;
            border-radius: 10px;
            padding: 10px 8px;
            text-align: center;
            position: relative;
            overflow: hidden;
        }
        .pb-ph-stat::after {
            content: '';
            position: absolute;
            bottom: 0; left: 0; right: 0;
            height: 2px;
            border-radius: 0 0 10px 10px;
        }
        .pb-ph-stat.ph-s1::after { background: linear-gradient(90deg,#f97316,#ef4444); }
        .pb-ph-stat.ph-s2::after { background: linear-gradient(90deg,#f59e0b,#eab308); }
        .pb-ph-stat.ph-s3::after { background: linear-gradient(90deg,#22c55e,#16a34a); }
        .pb-ph-stat-icon { font-size: 14px; margin-bottom: 3px; display: block; }
        .pb-ph-stat-num {
            font-size: 18px;
            font-weight: 900;
            color: #0d3b6e;
            line-height: 1;
        }
        .pb-ph-stat-lbl {
            font-size: 10px;
            color: #6b9fd4;
            font-weight: 600;
            margin-top: 3px;
        }

        .pb-ph-feedback {
            border-radius: 10px;
            padding: 10px 13px;
            font-size: 12px;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 8px;
            line-height: 1.4;
        }
        .pb-ph-feedback-icon { font-size: 15px; flex-shrink: 0; }

        .pb-timeline-card {
            background: #fff;
            border: 1px solid #ede9e3;
            border-radius: 14px;
            overflow: hidden;
            margin-bottom: 16px;
        }

        .pb-tl-head {
            background: linear-gradient(135deg, #0b2612 0%, #1a4a25 50%, #1e6b2e 100%);
            padding: 14px 18px;
            display: flex;
            align-items: center;
            gap: 10px;
            position: relative;
            overflow: hidden;
        }
        .pb-tl-head::after {
            content: '🌱';
            position: absolute;
            right: 14px; top: 50%;
            transform: translateY(-50%);
            font-size: 42px;
            opacity: 0.15;
        }
        .pb-tl-head-icon  { font-size: 18px; }
        .pb-tl-head-title { font-size: 14px; font-weight: 700; color: #fff; }
        .pb-tl-head-sub   { font-size: 11px; color: rgba(255,255,255,0.5); margin-top: 1px; }

        .pb-tl-row {
            display: flex;
            align-items: center;
            gap: 14px;
            padding: 13px 20px;
            border-bottom: 1px solid #f5f2ee;
            transition: background 0.15s;
        }
        .pb-tl-row:last-child { border: none; }
        .pb-tl-row:hover { background: #faf8f5; }
        .pb-tl-num {
            width: 28px; height: 28px;
            border-radius: 50%;
            display: flex; align-items: center; justify-content: center;
            font-size: 11px; font-weight: 800;
            flex-shrink: 0;
            border: 2px solid;
        }
        .pb-tl-num.done   { background: #eafaf1; border-color: #27ae60; color: #1e8449; }
        .pb-tl-num.active { background: #fdecea; border-color: #e74c3c; color: #922b21; }
        .pb-tl-body { flex: 1; min-width: 0; }
        .pb-tl-name { font-size: 13px; font-weight: 700; color: #1a1a1a; margin-bottom: 2px; }
        .pb-tl-date { font-size: 11px; color: #bbb; margin-bottom: 7px; }
        .pb-tl-track {
            height: 6px;
            background: #f0ebe4;
            border-radius: 4px;
            overflow: hidden;
        }
        .pb-tl-fill { height: 100%; border-radius: 4px; }
        .pb-tl-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
        .pb-tl-badge {
            font-size: 11px; font-weight: 700;
            padding: 3px 10px; border-radius: 20px;
        }
        .pb-tl-pct {
            font-size: 12px; font-weight: 800;
            min-width: 36px; text-align: right;
        }

        /* ── PAGINATION ── */
        .pb-tl-pagination {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 12px 20px;
            border-top: 1px solid #f5f2ee;
            background: #fafaf8;
        }
        .pb-tl-pag-btn {
            padding: 6px 14px;
            border: 1.5px solid #e5e5e5;
            border-radius: 8px;
            background: white;
            font-size: 12px;
            cursor: pointer;
            color: #555;
            font-family: inherit;
            transition: all 0.2s;
        }
        .pb-tl-pag-btn:hover:not(:disabled) {
            border-color: #e74c3c;
            color: #e74c3c;
        }
        .pb-tl-pag-btn:disabled {
            opacity: 0.4;
            cursor: not-allowed;
        }
        .pb-tl-pag-info {
            font-size: 12px;
            color: #888;
            text-align: center;
        }

        .pb-loading {
            display: flex; flex-direction: column;
            align-items: center; justify-content: center;
            padding: 60px 20px; gap: 14px;
        }
        .pb-spinner {
            width: 34px; height: 34px;
            border: 3px solid #eee;
            border-top-color: #e74c3c;
            border-radius: 50%;
            animation: pb-spin 0.75s linear infinite;
        }
        @keyframes pb-spin { to { transform: rotate(360deg); } }
        .pb-loading-txt { font-size: 13px; color: #aaa; }
        .pb-empty {
            display: flex; flex-direction: column;
            align-items: center; padding: 60px 24px;
            text-align: center; gap: 10px;
        }
        .pb-empty-icon  { font-size: 48px; }
        .pb-empty-title { font-size: 16px; font-weight: 700; color: #1a1a1a; }
        .pb-empty-sub   { font-size: 13px; color: #aaa; max-width: 220px; line-height: 1.5; }

        @media (max-width: 600px) {
            .pb-stat-row { grid-template-columns: repeat(2,1fr); }
            .pb-mid-row  { grid-template-columns: 1fr; }
        }
    `;
    document.head.appendChild(style);
}

// ─── RENDER TIMELINE PAGE ────────────────────────────────────────────────────

function renderTimelinePage() {
    const totalPages = Math.ceil(allCycles.length / TIMELINE_PER_PAGE);
    const start      = (timelinePage - 1) * TIMELINE_PER_PAGE;
    const slice      = allCycles.slice(start, start + TIMELINE_PER_PAGE);

    const rows = slice.map((c, i) => {
        const globalIndex = start + i + 1;
        const done     = c.status === 'completed' || !!c.harvestedDate;
        const progress = done ? 100 : getProgress(c);
        const barFill  = done
            ? 'background:linear-gradient(90deg,#27ae60,#2ecc71);'
            : 'background:linear-gradient(90deg,#e74c3c,#e67e22);';
        const badgeBg  = done ? '#eafaf1' : '#fdecea';
        const badgeClr = done ? '#1e8449' : '#922b21';
        const pctClr   = done ? '#27ae60' : '#e74c3c';
        const label    = done ? 'Completed' : 'Active';
        const rightVal = done
            ? `${Math.min(calculateDaysPassed(c.plantingDate), c.varietyDays || 90)}d`
            : `${progress}%`;

        return `
            <div class="pb-tl-row">
                <div class="pb-tl-num ${done ? 'done' : 'active'}">${globalIndex}</div>
                <div class="pb-tl-body">
                    <div class="pb-tl-name">${c.variety}</div>
                    <div class="pb-tl-date">Planted ${formatDate(c.plantingDate)}</div>
                    <div class="pb-tl-track">
                        <div class="pb-tl-fill" style="width:${progress}%;${barFill}"></div>
                    </div>
                </div>
                <div class="pb-tl-right">
                    <span class="pb-tl-badge" style="background:${badgeBg};color:${badgeClr};">${label}</span>
                    <span class="pb-tl-pct" style="color:${pctClr};">${rightVal}</span>
                </div>
            </div>`;
    }).join('');

    const pagination = totalPages > 1 ? `
        <div class="pb-tl-pagination">
            <button class="pb-tl-pag-btn" onclick="window.pbTimelinePrev()" ${timelinePage === 1 ? 'disabled' : ''}>
                ← Prev
            </button>
            <div class="pb-tl-pag-info">
                Page ${timelinePage} of ${totalPages}
                <span style="color:#bbb;font-size:11px;">(${allCycles.length} total)</span>
            </div>
            <button class="pb-tl-pag-btn" onclick="window.pbTimelineNext()" ${timelinePage === totalPages ? 'disabled' : ''}>
                Next →
            </button>
        </div>` : '';

    const timelineEl = document.getElementById('pb-timeline-rows');
    const pagEl      = document.getElementById('pb-timeline-pag');
    if (timelineEl) timelineEl.innerHTML = rows;
    if (pagEl)      pagEl.innerHTML      = pagination;
}

window.pbTimelinePrev = function () {
    if (timelinePage > 1) { timelinePage--; renderTimelinePage(); }
};
window.pbTimelineNext = function () {
    const totalPages = Math.ceil(allCycles.length / TIMELINE_PER_PAGE);
    if (timelinePage < totalPages) { timelinePage++; renderTimelinePage(); }
};

// ─── PLANT HEALTH CARD ───────────────────────────────────────────────────────

function buildPlantHealthCard(cycles) {
    const totalIssues = cycles.reduce((s, c) =>
        s + (c.notes?.filter(n =>
            n.category?.includes('Pest') || n.category?.includes('Disease')).length || 0), 0);

    const pestsThisCycle = cycles.reduce((s, c) =>
        s + (c.notes?.filter(n =>
            n.category?.includes('Pest') || n.category?.includes('Disease')).length || 0), 0);

    const diseasesThisCycle = cycles.reduce((s, c) =>
        s + (c.notes?.filter(n =>
            n.category?.includes('Disease')).length || 0), 0);

    const cleanCycles = cycles.filter(c =>
        (c.notes?.filter(n =>
            n.category?.includes('Pest') || n.category?.includes('Disease')).length || 0) === 0
    ).length;

    const score = Math.max(100 - totalIssues * 10, 0);

    let streak = 0;
    for (let i = cycles.length - 1; i >= 0; i--) {
        const issues = cycles[i].notes?.filter(n =>
            n.category?.includes('Pest') || n.category?.includes('Disease')).length || 0;
        if (issues === 0) streak++;
        else break;
    }

    let pestFreeSince = null;
    for (let i = 0; i < cycles.length; i++) {
        const issues = cycles[i].notes?.filter(n =>
            n.category?.includes('Pest') || n.category?.includes('Disease')).length || 0;
        if (issues === 0 && pestFreeSince === null) pestFreeSince = i + 1;
        if (issues > 0) pestFreeSince = null;
    }

    const radius = 42;
    const circumference = (270 / 360) * 2 * Math.PI * radius;
    const offset = circumference - (score / 100) * circumference;

    let arcColor, arcColor2;
    if (score >= 80)      { arcColor = '#22d3ee'; arcColor2 = '#3b82f6'; }
    else if (score >= 50) { arcColor = '#f59e0b'; arcColor2 = '#f97316'; }
    else                  { arcColor = '#f87171'; arcColor2 = '#ef4444'; }

    let fbIcon, fbMsg, fbBg, fbClr;
    if (score >= 80) {
        fbIcon = '✅'; fbMsg = 'Your plant is thriving! Minimal pest issues detected.';
        fbBg = '#eff6ff'; fbClr = '#1d4ed8';
    } else if (score >= 50) {
        fbIcon = '⚠️'; fbMsg = 'Some issues detected. Keep an eye on your plants.';
        fbBg = '#fffbeb'; fbClr = '#92400e';
    } else {
        fbIcon = '🚨'; fbMsg = 'High pest activity. Review your care routine urgently.';
        fbBg = '#fef2f2'; fbClr = '#991b1b';
    }

    const streakLine = streak > 0
        ? `<span class="pb-ph-streak">
               <span class="pb-ph-streak-dot"></span>
               Defense streak: ${streak} clean cycle${streak !== 1 ? 's' : ''}
           </span>`
        : '';

    const pestFreeLine = pestFreeSince !== null && streak > 0
        ? `<div style="font-size:11px;color:#6b9fd4;margin-top:6px;font-weight:600;">Pest-free since Cycle ${pestFreeSince}</div>`
        : '';

    return `
        <div class="pb-card">
            <div class="pb-ph-head">
                <span class="pb-ph-head-icon">🐛</span>
                <div>
                    <div class="pb-ph-head-title">Plant Health</div>
                    <div class="pb-ph-head-sub">Pest defense score</div>
                </div>
            </div>
            <div class="pb-ph-body">
                <div class="pb-ph-gauge-wrap">
                    <div class="pb-ph-donut">
                        <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                            <defs>
                                <linearGradient id="pb-arc-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                                    <stop offset="0%"   stop-color="${arcColor}" />
                                    <stop offset="100%" stop-color="${arcColor2}" />
                                </linearGradient>
                            </defs>
                            <circle class="pb-ph-donut-track" cx="50" cy="50" r="${radius}"
                                stroke-dasharray="${circumference.toFixed(2)} ${(2 * Math.PI * radius).toFixed(2)}"
                                stroke-dashoffset="0"/>
                            <circle class="pb-ph-donut-fill" cx="50" cy="50" r="${radius}"
                                stroke="url(#pb-arc-grad)"
                                stroke-dasharray="${circumference.toFixed(2)} ${(2 * Math.PI * radius).toFixed(2)}"
                                stroke-dashoffset="${offset.toFixed(2)}" id="pb-ph-arc"/>
                        </svg>
                        <div class="pb-ph-donut-center">
                            <span class="pb-ph-score-num">${score}</span>
                            <span class="pb-ph-score-lbl">score</span>
                            <span class="pb-ph-score-max">/100</span>
                        </div>
                    </div>
                    ${streakLine}
                    ${pestFreeLine}
                </div>
                <div class="pb-ph-stats">
                    <div class="pb-ph-stat ph-s1">
                        <div class="pb-ph-stat-num">${pestsThisCycle}</div>
                        <div class="pb-ph-stat-lbl">Total pests</div>
                    </div>
                    <div class="pb-ph-stat ph-s2">
                        <div class="pb-ph-stat-num">${diseasesThisCycle}</div>
                        <div class="pb-ph-stat-lbl">Total diseases</div>
                    </div>
                    <div class="pb-ph-stat ph-s3">
                        <div class="pb-ph-stat-num">${cleanCycles}</div>
                        <div class="pb-ph-stat-lbl">Clean cycles</div>
                    </div>
                </div>
                <div class="pb-ph-feedback" style="background:${fbBg};color:${fbClr};">
                    <span class="pb-ph-feedback-icon">${fbIcon}</span>
                    ${fbMsg}
                </div>
            </div>
        </div>`;
}

// ─── MAIN ───────────────────────────────────────────────────────────────────

export async function loadPersonalBest(userId) {
    injectStyles();

    const container = document.getElementById('personalBestContainer');
    if (!container) return;

    container.innerHTML = `
        <div class="pb-loading">
            <div class="pb-spinner"></div>
            <span class="pb-loading-txt">Loading your records…</span>
        </div>`;

    try {
        const snap = await getDocs(
            query(collection(db, 'users', userId, 'harvestCycles'), orderBy('plantingDate', 'asc'))
        );

        if (snap.empty) {
            container.innerHTML = `
                <div class="pb-empty">
                    <div class="pb-empty-icon">🏆</div>
                    <div class="pb-empty-title">No records yet</div>
                    <p class="pb-empty-sub">Start your first harvest cycle to build your personal best tracker.</p>
                </div>`;
            return;
        }

        allCycles = [];
        snap.forEach(d => allCycles.push({ id: d.id, ...d.data() }));
        timelinePage = 1;

        const cycles = allCycles;

        // ── Stats ──
        const totalCycles     = cycles.length;
        const completedCycles = cycles.filter(c => c.status === 'completed' || c.harvestedDate).length;
        const totalNotes      = cycles.reduce((s, c) => s + (c.notes?.length || 0), 0);
        const totalIssues     = cycles.reduce((s, c) =>
            s + (c.notes?.filter(n => n.category?.includes('Pest') || n.category?.includes('Disease')).length || 0), 0);
        const totalDays = cycles.reduce((s, c) =>
            s + Math.min(calculateDaysPassed(c.plantingDate), c.varietyDays || 90), 0);

        // ── Hall of fame ──
        const varietyCount = {};
        cycles.forEach(c => {
            if (c.status === 'completed' || c.harvestedDate)
                varietyCount[c.variety] = (varietyCount[c.variety] || 0) + 1;
        });
        const bestVariety = Object.keys(varietyCount).length > 0
            ? Object.keys(varietyCount).reduce((a, b) => varietyCount[a] >= varietyCount[b] ? a : b)
            : cycles[0]?.variety || '—';

        let cleanestCycle = null, cleanestIssues = Infinity;
        let mostNotesCycle = null, mostNotesCount = 0;
        let longestCycle = null, longestDays = 0;
        let fastestCycle = null, fastestDays = Infinity;
        const documentedCycles = cycles.filter(c => (c.notes?.length || 0) > 0).length;

        cycles.forEach((c, i) => {
            const issues = c.notes?.filter(n =>
                n.category?.includes('Pest') || n.category?.includes('Disease')).length || 0;
            if (issues < cleanestIssues) { cleanestIssues = issues; cleanestCycle = { ...c, index: i+1 }; }

            const notes = c.notes?.length || 0;
            if (notes > mostNotesCount) { mostNotesCount = notes; mostNotesCycle = { ...c, index: i+1 }; }

            const days = Math.min(calculateDaysPassed(c.plantingDate), c.varietyDays || 90);
            if (days > longestDays) { longestDays = days; longestCycle = { ...c, index: i+1 }; }

            const isComplete = c.status === 'completed' || !!c.harvestedDate;
            if (isComplete && c.harvestedDate) {
                const planted   = c.plantingDate?.toDate  ? c.plantingDate.toDate()  : new Date(c.plantingDate);
                const harvested = c.harvestedDate?.toDate ? c.harvestedDate.toDate() : new Date(c.harvestedDate);
                const actualDays = Math.max(Math.round((harvested - planted) / 86400000), 1);
                if (actualDays < fastestDays) { fastestDays = actualDays; fastestCycle = { ...c, index: i+1, actualDays }; }
            }
        });

        // ── Render ──
        container.innerHTML = `
            <div class="pb-stat-row">
                <div class="pb-stat-box s1">
                    <div class="pb-stat-num">${totalCycles}</div>
                    <div class="pb-stat-lbl">Total cycles</div>
                    <div class="pb-stat-sub" style="color:#27ae60;">${completedCycles} completed</div>
                </div>
                <div class="pb-stat-box s2">
                    <div class="pb-stat-num">${totalNotes}</div>
                    <div class="pb-stat-lbl">Notes logged</div>
                    <div class="pb-stat-sub" style="color:#2980b9;">all time</div>
                </div>
                <div class="pb-stat-box s3">
                    <div class="pb-stat-num">${totalIssues}</div>
                    <div class="pb-stat-lbl">Issues flagged</div>
                    <div class="pb-stat-sub" style="color:#e67e22;">all cycles</div>
                </div>
                <div class="pb-stat-box s4">
                    <div class="pb-stat-num">${totalDays}</div>
                    <div class="pb-stat-lbl">Days growing</div>
                    <div class="pb-stat-sub" style="color:#9b59b6;">total</div>
                </div>
            </div>

            <div class="pb-mid-row">
                <div class="pb-card">
                    <div class="pb-hof-head">
                        <span class="pb-hof-head-icon">🏆</span>
                        <div>
                            <div class="pb-hof-head-title">Hall of fame</div>
                            <div class="pb-hof-head-sub">Your best records</div>
                        </div>
                    </div>
                    <div class="pb-hof-row">
                        <div class="pb-hof-dot">🥇</div>
                        <div class="pb-hof-body">
                            <div class="pb-hof-name">Best variety</div>
                            <div class="pb-hof-sub">Most cycles completed</div>
                        </div>
                        <span class="pb-chip" style="background:#eafaf1;color:#1e8449;">${shortenVariety(bestVariety)}</span>
                    </div>
                    <div class="pb-hof-row">
                        <div class="pb-hof-dot">🛡️</div>
                        <div class="pb-hof-body">
                            <div class="pb-hof-name">Cleanest cycle</div>
                            <div class="pb-hof-sub">${cleanestCycle ? `Cycle ${cleanestCycle.index} — ${cleanestCycle.variety}` : '—'}</div>
                        </div>
                        <span class="pb-chip" style="background:#eafaf1;color:#1e8449;">${cleanestIssues === Infinity ? '0' : cleanestIssues} issues</span>
                    </div>
                    <div class="pb-hof-row">
                        <div class="pb-hof-dot">📓</div>
                        <div class="pb-hof-body">
                            <div class="pb-hof-name">Most notes logged</div>
                            <div class="pb-hof-sub">${mostNotesCycle ? `Cycle ${mostNotesCycle.index} — ${mostNotesCycle.variety}` : '—'}</div>
                        </div>
                        <span class="pb-chip" style="background:#eaf4fd;color:#1a5276;">${mostNotesCount} notes</span>
                    </div>
                    <div class="pb-hof-row">
                        <div class="pb-hof-dot">⏱️</div>
                        <div class="pb-hof-body">
                            <div class="pb-hof-name">Longest cycle</div>
                            <div class="pb-hof-sub">${longestCycle ? `Cycle ${longestCycle.index} — ${longestCycle.variety}` : '—'}</div>
                        </div>
                        <span class="pb-chip" style="background:#fdecea;color:#922b21;">${longestDays} days</span>
                    </div>
                    <div class="pb-hof-row">
                        <div class="pb-hof-dot">⚡</div>
                        <div class="pb-hof-body">
                            <div class="pb-hof-name">Fastest completion</div>
                            <div class="pb-hof-sub">${fastestCycle ? `Cycle ${fastestCycle.index} — ${fastestCycle.variety}` : 'No completed cycles yet'}</div>
                        </div>
                        <span class="pb-chip" style="background:#f0fdf4;color:#15803d;">${fastestCycle ? `${fastestCycle.actualDays} days` : '—'}</span>
                    </div>
                    <div class="pb-hof-row">
                        <div class="pb-hof-dot">📋</div>
                        <div class="pb-hof-body">
                            <div class="pb-hof-name">Most consistent</div>
                            <div class="pb-hof-sub">Cycles with at least one note logged</div>
                        </div>
                        <span class="pb-chip" style="background:#faf5ff;color:#7e22ce;">${documentedCycles} of ${totalCycles}</span>
                    </div>
                </div>

                ${buildPlantHealthCard(cycles)}
            </div>

            <div class="pb-timeline-card">
                <div class="pb-tl-head">
                    <span class="pb-tl-head-icon">🌱</span>
                    <div>
                        <div class="pb-tl-head-title">Cycle timeline</div>
                        <div class="pb-tl-head-sub">All cycles from first to latest</div>
                    </div>
                </div>
                <div id="pb-timeline-rows"></div>
                <div id="pb-timeline-pag"></div>
            </div>
        `;

        renderTimelinePage();

    } catch (err) {
        console.error('loadPersonalBest error:', err);
        container.innerHTML = `
            <div class="pb-empty">
                <div class="pb-empty-icon">⚠️</div>
                <div class="pb-empty-title">Something went wrong</div>
                <p class="pb-empty-sub">Failed to load your personal records. Please try again.</p>
            </div>`;
    }
}

export function initPersonalBest(userId) {
    loadPersonalBest(userId);
}