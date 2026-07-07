import { auth, db } from './firebase-config.js';
import {
    collection, getDocs, query,
    orderBy, doc, getDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";


// ── NOTIFICATION SOUND
function playNotifSound() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const time = ctx.currentTime;

        const notes = [523, 659, 784]; // C, E, G — soft marimba chord
        notes.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, time + i * 0.1);

            gain.gain.setValueAtTime(0.2, time + i * 0.1);
            gain.gain.exponentialRampToValueAtTime(0.001, time + i * 0.1 + 0.5);

            osc.start(time + i * 0.1);
            osc.stop(time + i * 0.1 + 0.5);
        });
    } catch (e) { }
}

const STAGES = [
    { name: 'Seed', icon: '🌱', dayStart: 1, dayEnd: 7, label: 'Seed Stage' },
    { name: 'Sprout', icon: '🪴', dayStart: 8, dayEnd: 20, label: 'Sprout Stage' },
    { name: 'Grow', icon: '🌿', dayStart: 21, dayEnd: 45, label: 'Grow Stage' },
    { name: 'Flower', icon: '🌸', dayStart: 46, dayEnd: 65, label: 'Flower Stage' },
    { name: 'Harvest', icon: '🌶️', dayStart: 66, dayEnd: 999, label: 'Harvest Stage' },
];

const AI_TIPS = {
    Seed: 'During sprouting, reduce watering frequency — overwatering can cause damping off in young seedlings.',
    Sprout: 'When entering Grow stage, increase fertilizer to support stem strength and leaf growth.',
    Grow: 'Watch for flower buds forming. Ensure 6–8 hours of sunlight daily for best flowering.',
    Flower: 'Avoid overwatering during flowering — excess moisture causes flower drop. Monitor daily.',
    Harvest: 'Harvest consistently to encourage new fruit set. Store harvested chilies in a cool dry place.',
};

let _allCycles = [];
let _userId = '';
let _role = '';

function isCompleted(cycle) {
    return cycle.status === 'completed' || !!cycle.harvestedDate;
}

function isActive(cycle) {
    return cycle.status === 'active' && !cycle.harvestedDate;
}

function calculateDaysPassed(plantingDate) {
    const planted = plantingDate?.toDate ? plantingDate.toDate() : new Date(plantingDate);
    const start = new Date(planted); start.setHours(0, 0, 0, 0);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return Math.max(Math.floor((today - start) / 86400000) + 1, 1);
}

function getStageStatus(stage, currentDay) {
    if (currentDay > stage.dayEnd) return 'done';
    if (currentDay >= stage.dayStart) return 'current';
    return 'pending';
}

function getPerformanceRating(issueCount) {
    if (issueCount === 0) return { label: 'Good', color: '#27ae60' };
    if (issueCount === 1) return { label: 'Fair', color: '#f39c12' };
    return { label: 'Poor', color: '#e74c3c' };
}

function getYieldPrediction(variety, issueCount) {
    const base = { 'Cili Padi': 200, 'Cili Besar': 120, 'Cili Benggala': 60 };
    const baseYield = base[variety] || 150;
    const deduction = issueCount * 15;
    const low = Math.max(baseYield - deduction - 20, 30);
    const high = Math.max(baseYield - deduction + 20, 50);
    const confidence = issueCount === 0 ? 'High' : issueCount === 1 ? 'Medium' : 'Low';
    const confColor = issueCount === 0 ? '#27ae60' : issueCount === 1 ? '#f39c12' : '#e74c3c';
    return { range: `~${low}–${high} chilies`, confidence, confColor };
}

function formatDate(dateVal) {
    if (!dateVal) return '—';
    const d = dateVal?.toDate ? dateVal.toDate()
        : dateVal?.seconds ? new Date(dateVal.seconds * 1000)
            : new Date(dateVal);
    return d.toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' });
}

function getPlantingDateStr(plantingDate) {
    const d = plantingDate?.toDate ? plantingDate.toDate() : new Date(plantingDate);
    return d.toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' });
}

function filterNotesByStage(notes, plantingDate, stage) {
    const planted = plantingDate?.toDate ? plantingDate.toDate() : new Date(plantingDate);
    const plantedMidnight = new Date(planted);
    plantedMidnight.setHours(0, 0, 0, 0);

    return notes.filter(note => {
        const rawDate = note.date || note.noteDate;
        if (!rawDate) return false;
        let noteDate;
        if (rawDate?.toDate) noteDate = rawDate.toDate();
        else if (rawDate?.seconds) noteDate = new Date(rawDate.seconds * 1000);
        else noteDate = new Date(rawDate);
        noteDate.setHours(0, 0, 0, 0);
        const diffDays = Math.floor((noteDate - plantedMidnight) / 86400000) + 1;
        return diffDays >= stage.dayStart && diffDays <= stage.dayEnd;
    });
}

function buildOptions(cycles) {
    return cycles.map(c => {
        const tag = isCompleted(c) ? ' [completed]' : '';
        return `<option value="${c.id}">${c.variety} — planted ${getPlantingDateStr(c.plantingDate)}${tag}</option>`;
    }).join('');
}

window.filterCycleReport = function (filter) {
    document.querySelectorAll('.cr-filter-tab').forEach(t => t.classList.remove('active'));
    document.getElementById(`cr-tab-${filter}`)?.classList.add('active');

    let filtered = _allCycles;
    if (filter === 'active') filtered = _allCycles.filter(c => isActive(c));
    if (filter === 'completed') filtered = _allCycles.filter(c => isCompleted(c));

    const content = document.getElementById('stageReportContent');
    const dropdown = document.getElementById('reportCycleDropdown');

    if (filtered.length === 0) {
        dropdown.innerHTML = `<option>No ${filter} cycles</option>`;
        content.innerHTML = `
            <div class="empty-state" style="padding:30px;">
                <p>No ${filter} cycles found.</p>
            </div>`;
        return;
    }

    dropdown.innerHTML = buildOptions(filtered);
    renderStageReport(_userId, filtered[0], _role);

    dropdown.onchange = (e) => {
        const selected = filtered.find(c => c.id === e.target.value);
        if (selected) renderStageReport(_userId, selected, _role);
    };
};

export async function loadCycleReport(userId, role) {
    const container = document.getElementById('cycleReportContainer');
    if (!container) return;

    container.innerHTML = `<div style="padding:30px;text-align:center;color:var(--muted);">Loading report...</div>`;

    try {
        const cyclesSnap = await getDocs(
            query(collection(db, 'users', userId, 'harvestCycles'), orderBy('plantingDate', 'desc'))
        );

        if (cyclesSnap.empty) {
            container.innerHTML = `
                <div class="empty-state">
                    <div style="font-size:2.5rem;">🌱</div>
                    <p>No cycles found. Start a harvest cycle to generate stage reports.</p>
                </div>`;
            return;
        }

        const cycles = [];
        cyclesSnap.forEach(docSnap => cycles.push({ id: docSnap.id, ...docSnap.data() }));

        _allCycles = cycles;
        _userId = userId;
        _role = role;

        const activeCount = cycles.filter(c => isActive(c)).length;
        const completedCount = cycles.filter(c => isCompleted(c)).length;

        container.innerHTML = `
            <div style="margin-bottom:16px;">
                <div style="display:flex;gap:0;margin-bottom:12px;border-bottom:1.5px solid var(--border);">
                    <button class="cr-filter-tab active" id="cr-tab-all"
                        onclick="filterCycleReport('all')">
                        All (${cycles.length})
                    </button>
                    <button class="cr-filter-tab" id="cr-tab-active"
                        onclick="filterCycleReport('active')">
                        Active (${activeCount})
                    </button>
                    <button class="cr-filter-tab" id="cr-tab-completed"
                        onclick="filterCycleReport('completed')">
                        Completed (${completedCount})
                    </button>
                </div>

                <div style="display:flex;align-items:center;gap:10px;">
                    <label style="font-size:.75rem;color:var(--muted);white-space:nowrap;
                                  font-weight:700;text-transform:uppercase;letter-spacing:.05em;">
                        Cycle:
                    </label>
                    <select id="reportCycleDropdown" style="flex:1;font-size:.85rem;">
                        ${buildOptions(cycles)}
                    </select>
                </div>
            </div>
            <div id="stageReportContent"></div>`;

        await renderStageReport(userId, cycles[0], role);

        document.getElementById('reportCycleDropdown')
            ?.addEventListener('change', async (e) => {
                const selected = cycles.find(c => c.id === e.target.value);
                if (selected) await renderStageReport(userId, selected, role);
            });

    } catch (err) {
        console.error('loadCycleReport error:', err);
        container.innerHTML = `<div class="empty-state"><p>Failed to load report.</p></div>`;
    }
}

async function renderStageReport(userId, cycle, role) {
    const content = document.getElementById('stageReportContent');
    if (!content) return;

    const currentDay = calculateDaysPassed(cycle.plantingDate);
    const isAdvanced = role === 'advanced_grower';
    const isIntermediate = role === 'intermediate_grower';
    const showComparison = isAdvanced || isIntermediate;

    const cycleDocSnap = await getDoc(doc(db, 'users', userId, 'harvestCycles', cycle.id));
    const allNotes = cycleDocSnap.data()?.notes || [];

    let prevCycle = null;
    let prevNotes = [];
    if (showComparison) {
        const allCycles = [];
        const snap = await getDocs(
            query(collection(db, 'users', userId, 'harvestCycles'), orderBy('plantingDate', 'asc'))
        );
        snap.forEach(d => allCycles.push({ id: d.id, ...d.data() }));
        const idx = allCycles.findIndex(c => c.id === cycle.id);
        if (idx > 0) {
            prevCycle = allCycles[idx - 1];
            const prevDocSnap = await getDoc(doc(db, 'users', userId, 'harvestCycles', prevCycle.id));
            prevNotes = prevDocSnap.data()?.notes || [];
        }
    }

    const totalNotes = allNotes.length;
    const totalIssues = allNotes.filter(n =>
        n.category?.includes('Pest') || n.category?.includes('Disease')
    ).length;
    const stagesDone = STAGES.filter(s => currentDay > s.dayEnd).length;
    const progress = Math.min(Math.round((currentDay / (cycle.varietyDays || 90)) * 100), 100);

    const cycleCompleted = isCompleted(cycle);

    let html = `
        <div class="cr-cycle-banner">
            <div class="cr-banner-left">
                <div class="cr-banner-variety">
                    ${cycle.variety} — Cycle
                    ${cycleCompleted ? `<span class="cr-banner-completed">Harvested</span>` : ''}
                </div>
                <div class="cr-banner-meta">
                    Planted ${getPlantingDateStr(cycle.plantingDate)} ·
                    ${cycle.location || 'Malaysia'} ·
                    ${cycle.method || cycle.growingEnvironment || 'Outdoor'} ·
                    ${cycle.harvestGoal || cycle.targetColor || ''} harvest
                </div>
                <div class="cr-banner-track">
                    <div class="cr-banner-fill" style="width:${progress}%"></div>
                </div>
                <div class="cr-banner-pct">
                    Day ${currentDay} of ~${cycle.varietyDays || 90} · ${progress}% complete
                </div>
            </div>
            <div class="cr-banner-stats">
                <div>
                    <div class="cr-banner-stat-val">${stagesDone}</div>
                    <div class="cr-banner-stat-lbl">Stages done</div>
                </div>
                <div>
                    <div class="cr-banner-stat-val">${totalNotes}</div>
                    <div class="cr-banner-stat-lbl">Notes</div>
                </div>
                <div>
                    <div class="cr-banner-stat-val">${totalIssues}</div>
                    <div class="cr-banner-stat-lbl">Issues</div>
                </div>
            </div>
        </div>

        <div class="cr-stage-timeline">
            ${STAGES.map((stage, idx) => {
        const status = cycleCompleted ? 'done' : getStageStatus(stage, currentDay);
        const stageNotes = filterNotesByStage(allNotes, cycle.plantingDate, stage);
        const issues = stageNotes.filter(n =>
            n.category?.includes('Pest') || n.category?.includes('Disease')
        );
        const issueCount = issues.length;
        const daysInStage = status === 'done'
            ? (stage.dayEnd === 999 ? currentDay - stage.dayStart + 1 : stage.dayEnd - stage.dayStart + 1)
            : status === 'current' ? currentDay - stage.dayStart + 1 : 0;

        const rating = getPerformanceRating(issueCount);
        const isLast = idx === STAGES.length - 1;
        const statusLabel = status === 'done' ? 'Completed'
            : status === 'current' ? 'In Progress'
                : 'Upcoming';

        // ── BUTTON LOGIC ─────────────────────────────
        const actionBtn = (() => {
            if (status === 'pending') return '';

            // Harvest stage ONLY when done → redirect to harvest report
            if (stage.name === 'Harvest' && status === 'done') {
                return `<button class="cr-tl-btn cr-tl-btn--primary" onclick="navigate('harvest-report')">
                            View Harvest Report &rarr;
                        </button>`;
            }

            // Harvest stage in progress → NO button
            if (stage.name === 'Harvest') return '';

            // All other stages (Seed, Sprout, Grow, Flower) → download PDF
            return `<button class="cr-tl-btn" onclick="downloadStageReportPDF('${cycle.id}','${stage.name}','${cycle.variety}','${role}')">
                        Download Full Report
                    </button>`;
        })();
        // ───────────────────────────────────────────

        const quickStats = status !== 'pending' ? `
                    <div class="cr-tl-quickstats">
                        <span class="cr-tl-stat">
                            <strong>${daysInStage}</strong> days
                        </span>
                        <span class="cr-tl-stat">
                            <strong>${stageNotes.length}</strong> notes
                        </span>
                        <span class="cr-tl-stat ${issueCount > 0 ? 'cr-tl-stat--issue' : ''}">
                            <strong>${issueCount}</strong> issues
                        </span>
                        <span class="cr-tl-stat">
                            <span style="color:${rating.color};font-weight:700;">${rating.label}</span> rating
                        </span>
                    </div>` : '';

        const notesPreview = status !== 'pending' && stageNotes.length > 0 ? `
                    <div class="cr-tl-notes">
                        ${stageNotes.slice(0, 2).map(n => `
                            <div class="cr-tl-note">
                                <span class="cr-tl-note-cat">${n.category?.split(' ').slice(0, 2).join(' ') || 'Note'}</span>
                                <span class="cr-tl-note-text">${n.text || n.noteText || '—'}</span>
                            </div>
                        `).join('')}
                        ${stageNotes.length > 2 ? `<div class="cr-tl-more">+${stageNotes.length - 2} more notes in full report</div>` : ''}
                    </div>` : '';

        const aiTip = status !== 'pending' ? `
                    <div class="cr-tl-tip">
                        ${AI_TIPS[stage.name]}
                    </div>` : '';

        const comparison = showComparison && prevCycle && status !== 'pending' ? `
                    <div class="cr-tl-compare">
                        vs ${prevCycle.variety} (previous): ${(() => {
                const prevStageNotes = filterNotesByStage(prevNotes, prevCycle.plantingDate, stage);
                const prevIssues = prevStageNotes.filter(n =>
                    n.category?.includes('Pest') || n.category?.includes('Disease')
                ).length;
                const diff = issueCount - prevIssues;
                return diff === 0 ? 'Same issues as last cycle'
                    : diff > 0 ? `${diff} more issues — monitor earlier`
                        : `${Math.abs(diff)} fewer issues — improving!`;
            })()}
                    </div>` : '';

        return `
                    <div class="cr-tl-item cr-tl-item--${status}">
                        <div class="cr-tl-marker">
                            <div class="cr-tl-dot cr-tl-dot--${status}">
                                ${status === 'done' ? '&check;' : ''}
                            </div>
                            ${!isLast ? `<div class="cr-tl-line cr-tl-line--${status}"></div>` : ''}
                        </div>
                        <div class="cr-tl-card">
                            <div class="cr-tl-header">
                                <div class="cr-tl-title">
                                    <div class="cr-tl-icon">${stage.icon}</div>
                                    <div>
                                        <div class="cr-tl-name">${stage.label}</div>
                                        <div class="cr-tl-range">Day ${stage.dayStart}–${stage.dayEnd === 999 ? '66+' : stage.dayEnd}</div>
                                    </div>
                                </div>
                                <div class="cr-tl-actions">
                                    <span class="cr-tl-badge cr-tl-badge--${status}">${statusLabel}</span>
                                    ${actionBtn}
                                </div>
                            </div>
                            ${quickStats}
                            ${notesPreview}
                            ${comparison}
                            ${aiTip}
                        </div>
                    </div>
                `;
    }).join('')}
        </div>`;

    content.innerHTML = html;
}

window.downloadStageReportPDF = async function (cycleId, stageName, variety, role) {
    const user = auth.currentUser;
    if (!user) return;

    const isBeginner = role === 'beginner_grower';
    const isIntermediate = role === 'intermediate_grower';
    const isAdvanced = role === 'advanced_grower';

    const roleLabel = isBeginner ? 'Beginner Home Grower'
        : isIntermediate ? 'Intermediate Home Grower'
            : 'Experienced Home Grower';

    const cycleSnap = await getDoc(doc(db, 'users', user.uid, 'harvestCycles', cycleId));
    const cycle = cycleSnap.data();
    const allNotes = cycle?.notes || [];
    const currentDay = calculateDaysPassed(cycle.plantingDate);

    const stage = STAGES.find(s => s.name === stageName);
    const filteredNotes = filterNotesByStage(allNotes, cycle.plantingDate, stage);
    const issues = filteredNotes.filter(n =>
        n.category?.includes('Pest') || n.category?.includes('Disease')
    );
    const rating = getPerformanceRating(issues.length);


    const stageStatus = currentDay > stage.dayEnd ? 'done'
        : currentDay >= stage.dayStart ? 'current'
            : 'pending';

    const daysInStage = stageStatus === 'done'
        ? stage.dayEnd - stage.dayStart + 1
        : currentDay - stage.dayStart + 1;

    const generatedDate = new Date().toLocaleDateString('en-MY', {
        day: 'numeric', month: 'long', year: 'numeric'
    });

    const logoImg = new Image();
    logoImg.crossOrigin = 'anonymous';
    logoImg.src = '../assets/images/chili_logo3.png';
    logoImg.onload = () => {
        const c = document.createElement('canvas');
        c.width = 60; c.height = 60;
        c.getContext('2d').drawImage(logoImg, 0, 0, 60, 60);
        buildAndPrint(c.toDataURL('image/png'));
    };
    logoImg.onerror = () => buildAndPrint(null);

   function buildAndPrint(base64Logo) {
    const logoHTML = base64Logo
        ? `<img src="${base64Logo}" style="width:36px;height:36px;vertical-align:middle;margin-right:10px;border-radius:50%;">`
        : '';
 
    const progress = Math.min(Math.round((currentDay / (cycle.varietyDays || 90)) * 100), 100);
    const stageProgress = Math.min(Math.round((Math.max(0, currentDay - stage.dayStart + 1) / (stage.dayEnd - stage.dayStart + 1)) * 100), 100);
 
    const generatedDate = new Date().toLocaleDateString('en-MY', {
        day: 'numeric', month: 'long', year: 'numeric'
    });
 
    // ── Stage timeline dots ──
    const stageDotsHTML = STAGES.map(s => {
        const st = currentDay > s.dayEnd ? 'done' : currentDay >= s.dayStart ? 'current' : 'pending';
        const color = st === 'done' ? '#27ae60' : st === 'current' ? '#e74c3c' : '#ddd';
        const textColor = st === 'done' ? '#27ae60' : st === 'current' ? '#e74c3c' : '#bbb';
        return `
            <div style="display:flex;flex-direction:column;align-items:center;flex:1;">
                <div style="width:28px;height:28px;border-radius:50%;background:${color};
                    display:flex;align-items:center;justify-content:center;
                    font-size:12px;color:white;margin-bottom:4px;">
                    ${st === 'done' ? '✓' : s.icon}
                </div>
                <span style="font-size:9px;font-weight:${st === 'current' ? '700' : '400'};
                    color:${textColor};text-align:center;">${s.name}</span>
            </div>
        `;
    }).join('<div style="flex:1;height:2px;background:#eee;margin-top:14px;align-self:start;margin-top:13px;"></div>');
 
    // ── Notes table ──
    const notesTableRows = filteredNotes.length > 0
        ? filteredNotes.map(n => {
            const rawDate = n.date || n.noteDate;
            const dateStr = rawDate ? formatDate(rawDate) : '—';
            const cat = n.category?.replace(/[^\w\s/]/g, '').trim() || 'Note';
            const text = n.text || n.noteText || '—';
            const isIssue = cat.includes('Pest') || cat.includes('Disease');
            return `
                <tr>
                    <td style="padding:8px 10px;font-size:12px;color:#555;white-space:nowrap;">${dateStr}</td>
                    <td style="padding:8px 10px;">
                        <span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;
                            background:${isIssue ? '#fdecea' : '#eaf4fd'};
                            color:${isIssue ? '#c0392b' : '#2980b9'};">
                            ${cat}
                        </span>
                    </td>
                    <td style="padding:8px 10px;font-size:12px;color:#333;line-height:1.5;">${text}</td>
                </tr>`;
        }).join('')
        : `<tr><td colspan="3" style="padding:16px 10px;text-align:center;font-size:12px;color:#aaa;">
                No notes recorded for this stage.
           </td></tr>`;
 
    // ── Issue summary pills ──
    const issuePillsHTML = issues.length > 0
        ? issues.map(n => `
            <div style="padding:8px 12px;background:#fff8f8;border:1px solid #f5c6c6;
                border-radius:8px;margin-bottom:6px;font-size:12px;color:#444;">
                <span style="font-weight:700;color:#c0392b;">⚠ </span>${n.text || n.noteText || '—'}
            </div>`).join('')
        : `<div style="padding:10px 12px;background:#eafaf1;border:1px solid #a9dfbf;
                border-radius:8px;font-size:12px;color:#1e8449;">
                ✓ No pest or disease issues recorded for this stage.
           </div>`;
 
    // ── Next stage tip ──
    const nextStage = STAGES.find(s => s.dayStart > stage.dayEnd);
    const nextStageHTML = nextStage ? `
        <div style="background:#fffbf0;border-left:4px solid #f39c12;border-radius:0 8px 8px 0;
            padding:12px 14px;margin-top:20px;">
            <div style="font-size:10px;font-weight:700;color:#e67e22;text-transform:uppercase;
                letter-spacing:.5px;margin-bottom:4px;">
                Up Next — ${nextStage.label} (Day ${nextStage.dayStart}+)
            </div>
            <div style="font-size:12px;color:#555;line-height:1.6;">${AI_TIPS[nextStage.name]}</div>
        </div>` : '';
 
    // ── Watering / Fertilizer counts ──
    const waterCount = filteredNotes.filter(n => n.category?.includes('Watering')).length;
    const fertCount = filteredNotes.filter(n => n.category?.includes('Fertilizer')).length;
    const generalCount = filteredNotes.filter(n =>
        !n.category?.includes('Watering') &&
        !n.category?.includes('Fertilizer') &&
        !n.category?.includes('Pest') &&
        !n.category?.includes('Disease')
    ).length;
 
    const html = `
        <!DOCTYPE html><html>
        <head>
            <meta charset="UTF-8">
            <title>${stage.label} Report — ${variety}</title>
            <style>
                *{margin:0;padding:0;box-sizing:border-box;}
                body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
                     color:#333;background:#fff;line-height:1.6;}
                .page{padding:36px 40px;}
 
                /* Header */
                .header{display:flex;justify-content:space-between;align-items:center;
                    padding-bottom:16px;border-bottom:3px solid #e74c3c;margin-bottom:24px;}
                .brand{display:flex;align-items:center;font-size:18px;font-weight:700;color:#e74c3c;}
                .brand-sub{font-size:11px;font-weight:400;color:#888;display:block;margin-top:1px;}
                .brand-text{display:flex;flex-direction:column;}
                .header-right{text-align:right;}
                .gen-date{font-size:11px;color:#888;}
                .role-pill{display:inline-block;margin-top:4px;font-size:10px;font-weight:700;
                    background:#fdecea;color:#e74c3c;padding:3px 10px;border-radius:20px;}
 
                /* Hero banner */
                .hero{background:linear-gradient(135deg,#e74c3c,#8e1f16);border-radius:10px;
                    padding:20px 24px;margin-bottom:20px;display:flex;
                    justify-content:space-between;align-items:center;}
                .hero-left{}
                .hero-variety{font-size:20px;font-weight:700;color:white;}
                .hero-meta{font-size:12px;color:rgba(255,255,255,.75);margin-top:3px;}
                .hero-stage-pill{display:inline-block;margin-top:8px;font-size:11px;font-weight:700;
                    background:rgba(255,255,255,.2);color:white;padding:4px 12px;
                    border-radius:20px;border:1px solid rgba(255,255,255,.3);}
                .hero-right{text-align:center;}
                .hero-pct{font-size:42px;font-weight:800;color:white;line-height:1;}
                .hero-pct-label{font-size:11px;color:rgba(255,255,255,.7);margin-top:4px;}
 
                /* Progress bar */
                .prog-wrap{margin-top:12px;}
                .prog-label{display:flex;justify-content:space-between;
                    font-size:11px;color:rgba(255,255,255,.6);margin-bottom:5px;}
                .prog-track{height:5px;background:rgba(255,255,255,.2);border-radius:99px;}
                .prog-fill{height:100%;border-radius:99px;background:rgba(255,255,255,.8);}
 
 
                /* Section title */
                .section-title{font-size:10px;font-weight:700;text-transform:uppercase;
                    letter-spacing:.6px;color:#e74c3c;margin:20px 0 10px;
                    padding-bottom:6px;border-bottom:1px solid #f0f0f0;}
 
                /* Stage timeline */
                .stage-dots{display:flex;align-items:flex-start;margin-bottom:20px;
                    background:#fafafa;border:1px solid #eee;border-radius:8px;padding:16px;}
 
                /* Notes table */
                table{width:100%;border-collapse:collapse;}
                th{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;
                    color:#888;padding:8px 10px;background:#fafafa;border-bottom:1.5px solid #eee;
                    text-align:left;}
                tr:last-child td{border-bottom:none;}
                td{border-bottom:1px solid #f5f5f5;vertical-align:top;}
 
                /* Rating badge */
                .rating{display:inline-flex;align-items:center;gap:6px;
                    padding:6px 14px;border-radius:20px;font-size:12px;font-weight:700;}
 
                /* Footer */
                .footer{border-top:1px solid #eee;padding-top:12px;margin-top:24px;
                    font-size:10px;color:#bbb;display:flex;justify-content:space-between;}
 
                @media print{body{background:white;}@page{margin:1cm;}}
            </style>
        </head>
        <body>
        <div class="page">
 
            <!-- Header -->
            <div class="header">
                <div class="brand">
                    ${logoHTML}
                    <div class="brand-text">
                        CiliGuide
                        <span class="brand-sub">Stage Growth Report</span>
                    </div>
                </div>
                <div class="header-right">
                    <div class="gen-date">Generated: ${generatedDate}</div>
                    <span class="role-pill">${roleLabel}</span>
                </div>
            </div>
 
            <!-- Hero banner -->
            <div class="hero">
                <div class="hero-left">
                    <div class="hero-variety">${variety}</div>
                    <div class="hero-meta">
                        Planted: ${getPlantingDateStr(cycle.plantingDate)} &middot;
                        ${cycle.location || 'Malaysia'} &middot;
                        ${cycle.method || 'Outdoor'}
                    </div>
                    <span class="hero-stage-pill">${stage.icon} ${stage.label} &middot; Day ${stage.dayStart}–${stage.dayEnd === 999 ? '66+' : stage.dayEnd}</span>
                    <div class="prog-wrap">
                        <div class="prog-label">
                            <span>Overall cycle progress</span>
                            <span>Day ${currentDay} of ${cycle.varietyDays || 90}</span>
                        </div>
                        <div class="prog-track">
                            <div class="prog-fill" style="width:${progress}%"></div>
                        </div>
                    </div>
                </div>
                <div class="hero-right">
                    <div class="hero-pct">${daysInStage}</div>
                    <div class="hero-pct-label">days in this stage</div>
                </div>
            </div>

 
            <!-- Stage timeline -->
            <div class="section-title">Cycle stages</div>
            <div class="stage-dots">
                ${stageDotsHTML}
            </div>
 
            <!-- Growth notes table -->
            <div class="section-title">Growth notes (${filteredNotes.length})</div>
            <table>
                <thead>
                    <tr>
                        <th style="width:90px;">Date</th>
                        <th style="width:120px;">Category</th>
                        <th>Observation</th>
                    </tr>
                </thead>
                <tbody>${notesTableRows}</tbody>
            </table>
 
            <!-- Issues -->
            <div class="section-title">Issues detected (${issues.length})</div>
            ${issuePillsHTML}
 
            <!-- AI tip for next stage -->
            ${nextStageHTML}
 
            <!-- Footer -->
            <div class="footer">
                <span>CiliGuide — AI-Based Malaysian Home Chili Grower System</span>
                <span>Generated automatically &middot; Do not alter</span>
            </div>
 
        </div>
        </body></html>`;
 
    const popup = window.open('', '_blank', 'width=820,height=700');
    if (!popup) {
        window.showToast('⚠️', 'Blocked', 'Please allow popups to download PDF.');
        return;
    }
    popup.document.write(html);
    popup.document.close();
    popup.onload = function () {
        setTimeout(() => { popup.print(); popup.close(); }, 300);
    };
    playNotifSound();
    window.showToast('📄', 'PDF Ready', `${stage.label} report is ready to print.`);
}
};

export function initCycleReport(userId, role) {
    loadCycleReport(userId, role);
}