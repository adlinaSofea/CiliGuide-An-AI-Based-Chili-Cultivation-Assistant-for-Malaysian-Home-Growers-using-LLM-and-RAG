
// HISTORY.JS

import { db, auth } from './firebase-config.js';
import {
    collection, deleteDoc,
    doc, query, orderBy, onSnapshot
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

let currentUser = null;
let unsubHistory = null;   // ← unsubscribe fn for history listener
let unsubHarvest = null;   // ← unsubscribe fn for harvest listener
let historyItems = [];     // ← live cache of history docs
let harvestItems = [];     // ← live cache of harvest docs

// ICON & LABEL MAP 
const iconMap = {
    fertilizer: "🌿",
    disease: "🦠",
    "post-harvest": "📦",
    harvest: "🌱",
    chat: "💬",
    soil: "🪴",
};

const labelMap = {
    fertilizer: "Fertilizer",
    disease: "Disease",
    "post-harvest": "Post-Harvest",
    harvest: "Harvest",
    chat: "Chat",
    soil: "Soil",
};

const DATE_FMT_SHORT = { day: 'numeric', month: 'short', year: 'numeric' };

// INIT
export function initHistoryPage() {
    onAuthStateChanged(auth, (user) => {
        if (!user) return;
        currentUser = user;
    });
}

// LOAD ACTIVITY HISTORY  

export function loadActivityHistory(userId) {
    const container = document.getElementById('history-list');
    const empty = document.getElementById('history-empty');
    if (!container) return;

    // Show skeleton immediately — no blank white flash
    showSkeleton(container);

    // ── Unsubscribe any existing listeners (page revisit) ─────
    if (unsubHistory) { unsubHistory(); unsubHistory = null; }
    if (unsubHarvest) { unsubHarvest(); unsubHarvest = null; }

    historyItems = [];
    harvestItems = [];

    let historyReady = false;
    let harvestReady = false;

    // history collection 
    unsubHistory = onSnapshot(
        query(
            collection(db, 'users', userId, 'history'),
            orderBy('createdAt', 'desc')
        ),
        (snap) => {
            historyItems = snap.docs.map(d => ({
                id: d.id,
                source: 'history',
                feature: d.data().feature || 'chat',
                input: d.data().input || null,
                result: d.data().result || null,
                mode: d.data().input?.mode || null,
                createdAt: d.data().createdAt,
            }));

            historyReady = true;
            if (harvestReady) mergeAndRender();
        },
        (err) => {
            console.error('history snapshot error:', err);
            historyReady = true;
            if (harvestReady) mergeAndRender();
        }
    );

    // harvestCycles collection 
    unsubHarvest = onSnapshot(
        query(
            collection(db, 'users', userId, 'harvestCycles'),
            orderBy('createdAt', 'desc')
        ),
        (snap) => {
            const seenIds = new Set();
            harvestItems = [];

            snap.docs.forEach(d => {
                const data = d.data();
                if (data.status !== 'past') return;
                if (seenIds.has(d.id)) return;
                seenIds.add(d.id);

                harvestItems.push({
                    id: d.id,
                    source: 'harvest',
                    feature: 'harvest',
                    variety: data.variety || '–',
                    status: data.status || '–',
                    plantingDate: data.plantingDate || null,
                    harvestedDate: data.harvestedDate || null,
                    varietyDays: data.varietyDays || 0,
                    deletedAt: data.deletedAt || null,
                    createdAt: data.deletedAt || data.plantingDate,
                });
            });

            harvestReady = true;
            if (historyReady) mergeAndRender();
        },
        (err) => {
            console.error('harvest snapshot error:', err);
            harvestReady = true;
            if (historyReady) mergeAndRender();
        }
    );

    //Merge + render once both listeners have fired
    function mergeAndRender() {
        const all = [...historyItems, ...harvestItems].sort((a, b) => {
            const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(0);
            const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(0);
            return dateB - dateA;
        });

        window._allHistoryItems = all;
        window._activeFilter = window._activeFilter || 'all';

        renderHistory(getFilteredItems());
    }
}

//SKELETON LOADER
// Shows instantly while Firestore loads 
function showSkeleton(container) {
    const skeletonItem = () => `
        <div class="hist-item" style="pointer-events:none;">
            <div class="h-icon-wrap" style="background:#f0f0f0;border-radius:9px;width:36px;height:36px;flex-shrink:0;"></div>
            <div class="h-body" style="flex:1;">
                <div style="height:12px;width:55%;background:#f0f0f0;border-radius:6px;margin-bottom:8px;"></div>
                <div style="height:10px;width:75%;background:#f5f5f5;border-radius:6px;margin-bottom:6px;"></div>
                <div style="height:9px;width:30%;background:#f5f5f5;border-radius:6px;"></div>
            </div>
            <div style="width:60px;height:24px;background:#f0f0f0;border-radius:20px;"></div>
        </div>`;

    container.innerHTML = [1, 2, 3, 4, 5].map(skeletonItem).join('');
}

//RENDER HISTORY
function renderHistory(items) {
    const container = document.getElementById('history-list');
    const empty = document.getElementById('history-empty');
    if (!container) return;

    container.innerHTML = '';

    if (items.length === 0) {
        if (empty) empty.style.display = 'block';
        return;
    }

    if (empty) empty.style.display = 'none';
    items.forEach(item => container.appendChild(createHistoryItem(item)));
}

//CREATE HISTORY ITEM
function createHistoryItem(item) {
    const div = document.createElement('div');
    div.className = 'hist-item';
    div.dataset.type = item.feature;

    const icon = iconMap[item.feature] || '📋';
    const label = labelMap[item.feature] || 'Activity';
    const date = formatDate(
        item.createdAt?.toDate ? item.createdAt.toDate() : new Date()
    );

    const isBeginner = item.feature === 'fertilizer' && item.input?.mode === 'beginner';

    let title = '';
    let desc = '';

    if (item.feature === 'fertilizer') {
        if (isBeginner) {
            const chiliMap = {
                cili_padi: 'Cili Padi',
                cili_besar: 'Cili Besar',
                cili_benggala: 'Cili Benggala',
            };
            const locationMap = {
                indoor: 'Indoor',
                outdoor: 'Outdoor',
                greenhouse: 'Greenhouse',
            };
            const chili = chiliMap[item.input.chili_type] || item.input.chili_type || '–';
            const location = locationMap[item.input.location] || item.input.location || '–';
            title = 'Fertilizer — Beginner Mode';
            desc = `${chili} · ${location}`;
        } else if (item.input) {
            title = 'Fertilizer — Smart Mode';
            desc = `${item.input.chili_type || '–'} · ${item.input.growth_stage || '–'} · ${item.input.soil_type || '–'}`;
        } else {
            title = 'Fertilizer Guidance';
            desc = '–';
        }

    } else if (item.feature === 'disease' && item.input) {
        title = 'Disease Detection';
        desc = `${item.input.chili_type} · ${item.input.growth_stage} · "${item.input.symptoms?.substring(0, 40)}..."`;

    } else if (item.feature === 'post-harvest' && item.input) {
        title = 'Post-Harvest Suggestion';
        desc = `${item.input.chili_type} · ${item.input.condition} · ${item.input.quantity}`;

    } else if (item.feature === 'harvest') {
        const plantedDate = item.plantingDate?.toDate
            ? item.plantingDate.toDate()
            : new Date();

        title = `Harvest Cycle — ${item.variety}`;
        desc = `Archived · Planted ${plantedDate.toLocaleDateString('en-MY', DATE_FMT_SHORT)}`;

    } else if (item.feature === 'soil') {
        title = 'Soil Analysis';
        const result = typeof item.result === 'object' ? item.result : {};
        const level = result.moisture_level || '–';
        const conf = result.moisture_confidence || '–';
        desc = `${level} moisture · ${conf} confidence`;

    } else if (item.feature === 'chat') {
        title = 'Chat Advisory';
        desc = typeof item.result === 'string'
            ? item.result.substring(0, 60) + '...'
            : 'Chat session';

    } else {
        title = label;
        desc = '–';
    }

    const modeBadge = item.feature === 'fertilizer'
        ? `<span class="h-mode-badge ${isBeginner ? 'beginner' : 'smart'}">
               ${isBeginner ? 'Beginner' : 'Smart'}
           </span>`
        : '';

    const hasDetail = ['fertilizer', 'disease', 'post-harvest', 'soil'].includes(item.feature);

    div.innerHTML = `
        <div class="h-icon-wrap ${item.feature}">
            <span>${icon}</span>
        </div>
        <div class="h-body">
            <div class="h-title-row">
                <strong>${title}</strong>
                ${modeBadge}
            </div>
            <p>${desc}</p>
            <span class="h-date">${date}</span>
        </div>
        <div class="h-actions">
            <span class="h-tag ${item.feature}">${label}</span>
            <div class="h-btns">
                ${hasDetail ? `<button class="btn-hist-view">👁 View</button>` : ''}
                <button class="btn-hist-del">🗑</button>
            </div>
        </div>
    `;

    if (hasDetail) {
        div.querySelector('.btn-hist-view').addEventListener('click', (e) => {
            e.stopPropagation();
            openDetailModal(item);
        });
    }

    div.querySelector('.btn-hist-del').addEventListener('click', (e) => {
        e.stopPropagation();
        deleteHistoryItem(item);
    });

    return div;
}

//DELETE ITEM
async function deleteHistoryItem(item) {
    if (!currentUser) return;

    const confirmed = confirm(`Delete this ${labelMap[item.feature] || 'item'}?`);
    if (!confirmed) return;

    try {
        const collName = item.source === 'harvest' ? 'harvestCycles' : 'history';
        await deleteDoc(doc(db, 'users', currentUser.uid, collName, item.id));

        window.showToast?.('🗑️', 'Deleted', 'Item removed successfully.');
        // onSnapshot automatically re-renders — no manual filter needed

    } catch (err) {
        console.error('Delete error:', err);
        window.showToast?.('❌', 'Delete Failed', 'Could not delete item.');
    }
}

//DETAIL MODAL
function openDetailModal(item) {
    const modal = document.getElementById('historyDetailModal');
    if (!modal) return;

    const titleEl = document.getElementById('hdmTitle');
    const content = document.getElementById('hdmContent');
    const dateEl = document.getElementById('hdmDate');

    const isBeginner = item.feature === 'fertilizer' && item.input?.mode === 'beginner';

    if (titleEl) titleEl.textContent = `${iconMap[item.feature]} ${labelMap[item.feature]} Details`;
    if (dateEl) dateEl.textContent = formatDate(
        item.createdAt?.toDate ? item.createdAt.toDate() : new Date()
    );

    if (!content) return;

    if (item.feature === 'fertilizer' && isBeginner) {
        const chiliMap = { cili_padi: 'Cili Padi', cili_besar: 'Cili Besar', cili_benggala: 'Cili Benggala' };
        const locationMap = { indoor: 'Indoor', outdoor: 'Outdoor', greenhouse: 'Greenhouse' };
        const sunMap = { full_sun: 'Full Sun', partial: 'Partial Sun', low_light: 'Low Light' };
        const waterMap = { daily: 'Daily', sometimes: 'Sometimes', frequent: 'Frequent' };

        const r = typeof item.result === 'object' ? item.result : {};
        const sections = [
            { label: 'Fertilizer Recommendation', val: r.fertilizer },
            { label: 'Watering Guide', val: r.water },
            { label: 'Sunlight', val: r.sunlight },
            { label: 'Soil Tip', val: r.soil },
            { label: 'Beginner Tip', val: r.tip },
            { label: 'What to Expect', val: r.expect },
            { label: 'Pest & Disease Watch', val: r.pest }
        ].filter(s => s.val);

        content.innerHTML = `
            <div class="hdm-section">
                <div class="hdm-label">Mode</div>
                <div class="hdm-grid">
                    <div class="hdm-field" style="grid-column:1/-1">
                        <span>Type</span><strong>Beginner Mode (Rule-based)</strong>
                    </div>
                </div>
            </div>
            <div class="hdm-section">
                <div class="hdm-label">Your Inputs</div>
                <div class="hdm-grid">
                    <div class="hdm-field"><span>Chili Variety</span><strong>${chiliMap[item.input?.chili_type] || item.input?.chili_type || '–'}</strong></div>
                    <div class="hdm-field"><span>Location</span><strong>${locationMap[item.input?.location] || item.input?.location || '–'}</strong></div>
                    <div class="hdm-field"><span>Sunlight</span><strong>${sunMap[item.input?.sunlight] || item.input?.sunlight || '–'}</strong></div>
                    <div class="hdm-field"><span>Watering</span><strong>${waterMap[item.input?.watering] || item.input?.watering || '–'}</strong></div>
                </div>
            </div>
            ${sections.length > 0 ? `
            <div class="hdm-section">
                <div class="hdm-label">Care Plan</div>
                <div class="hdm-result" style="padding:0;">
                    ${sections.map((s, i) => `
                        <div style="padding:12px 14px;${i < sections.length - 1 ? 'border-bottom:1px solid #eee;' : ''}">
                            <div style="font-size:.68rem;font-weight:700;color:#e74c3c;text-transform:uppercase;letter-spacing:.5px;margin-bottom:5px;">${s.label}</div>
                            <div style="font-size:.85rem;color:#444;line-height:1.7;">${s.val}</div>
                        </div>`).join('')}
                </div>
            </div>` : ''}`;

    } else if (item.feature === 'fertilizer' && item.input) {
        content.innerHTML = `
            <div class="hdm-section">
                <div class="hdm-label">Mode</div>
                <div class="hdm-grid">
                    <div class="hdm-field" style="grid-column:1/-1"><span>Type</span><strong>Smart Mode (AI-powered)</strong></div>
                </div>
            </div>
            <div class="hdm-section">
                <div class="hdm-label">Inputs</div>
                <div class="hdm-grid">
                    <div class="hdm-field"><span>Chili Variety</span><strong>${item.input.chili_type || '–'}</strong></div>
                    <div class="hdm-field"><span>Growth Stage</span><strong>${item.input.growth_stage || '–'}</strong></div>
                    <div class="hdm-field"><span>Soil Type</span><strong>${item.input.soil_type || '–'}</strong></div>
                    <div class="hdm-field"><span>Moisture</span><strong>${item.input.moisture || '–'}</strong></div>
                    <div class="hdm-field"><span>Sunlight</span><strong>${item.input.sunlight || '–'}</strong></div>
                    <div class="hdm-field"><span>Environment</span><strong>${item.input.location || '–'}</strong></div>
                </div>
            </div>
           ${item.result ? `
    <div class="hdm-section">
        <div class="hdm-label">AI Recommendation</div>
        <div class="hdm-result">${typeof item.result === 'string'
                    ? item.result.replace(/\*\*/g, '').replace(/\n/g, '<br>')
                    : ''}</div>
    </div>` : ''}`;

    } else if (item.feature === 'disease' && item.input) {
        let cleanResult = '';
        if (item.result && typeof item.result === 'string') {
            cleanResult = item.result
                .split('\n')
                .filter(line => !line.toLowerCase().includes('confidence'))
                .join('\n')
                .replace(/\n/g, '<br>');
        }

        content.innerHTML = `
        <div class="hdm-section">
            <div class="hdm-label">Inputs</div>
            <div class="hdm-grid">
                <div class="hdm-field"><span>Chili Variety</span><strong>${item.input.chili_type || '–'}</strong></div>
                <div class="hdm-field"><span>Growth Stage</span><strong>${item.input.growth_stage || '–'}</strong></div>
                <div class="hdm-field" style="grid-column:1/-1"><span>Symptoms</span><strong>${item.input.symptoms || '–'}</strong></div>
            </div>
        </div>
        ${cleanResult ? `
        <div class="hdm-section">
            <div class="hdm-label">Detection Result</div>
            <div class="hdm-result">${cleanResult}</div>
        </div>` : ''}`;

    } else if (item.feature === 'post-harvest' && item.input) {
        content.innerHTML = `
        <div class="hdm-section">
            <div class="hdm-label">Inputs</div>
            <div class="hdm-grid">
                <div class="hdm-field"><span>Chili Variety</span><strong>${item.input.chili_type || '–'}</strong></div>
                <div class="hdm-field"><span>Condition</span><strong>${item.input.condition || '–'}</strong></div>
                <div class="hdm-field"><span>Quantity</span><strong>${item.input.quantity || '–'}</strong></div>
                <div class="hdm-field"><span>Fruit Color</span><strong>${item.input.fruit_color || '–'}</strong></div>
            </div>
        </div>
        ${item.result ? `
        <div class="hdm-section">
            <div class="hdm-label">Suggestion</div>
            <div class="hdm-result">${typeof item.result === 'string'
                    ? item.result.replace(/\*\*/g, '').replace(/\n/g, '<br>')
                    : ''}</div>
        </div>` : ''}`;

    } else if (item.feature === 'soil') {
        const result = typeof item.result === 'object' ? item.result : {};
        content.innerHTML = `
            <div class="hdm-section">
                <div class="hdm-label">Analysis Result</div>
                <div class="hdm-grid">
                    <div class="hdm-field"><span>Moisture Level</span><strong style="text-transform:capitalize;">${result.moisture_level || '–'}</strong></div>
                    <div class="hdm-field"><span>Confidence</span><strong>${result.moisture_confidence || '–'}</strong></div>
                    <div class="hdm-field"><span>File</span><strong>${result.fileName || '–'}</strong></div>
                    <div class="hdm-field"><span>Analysed At</span><strong>${result.analysedAt ? new Date(result.analysedAt).toLocaleDateString('en-MY', DATE_FMT_SHORT) : '–'}</strong></div>
                </div>
            </div>
            ${result.explanation ? `
            <div class="hdm-section">
                <div class="hdm-label">AI Explanation</div>
                <div class="hdm-result">${result.explanation}</div>
            </div>` : ''}`;
    }

    modal.classList.add('show');
}

window.closeHistoryDetailModal = function () {
    document.getElementById('historyDetailModal')?.classList.remove('show');
};

//FILTER 
window.filterHistory = function (type, btn) {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    window._activeFilter = type;
    renderHistory(getFilteredItems());
};

function getFilteredItems() {
    const all = window._allHistoryItems || [];
    const filter = window._activeFilter || 'all';
    return filter === 'all'
        ? all
        : all.filter(i => i.feature === filter);
}

// HELPERS 
function formatDate(date) {
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';

    return date.getFullYear() === now.getFullYear()
        ? date.toLocaleDateString('en-MY', { day: 'numeric', month: 'short' })
        : date.toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' });
}