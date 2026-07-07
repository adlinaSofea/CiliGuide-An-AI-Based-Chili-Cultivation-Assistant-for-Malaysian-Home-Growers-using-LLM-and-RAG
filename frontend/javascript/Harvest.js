// IMPORTS
import { auth, db } from './firebase-config.js';

import {
  collection, addDoc, query, orderBy, doc,
  updateDoc, deleteDoc, arrayUnion, onSnapshot, Timestamp
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

import { buildReminders } from './reminder.js';
import { initWeather } from './weather.js';


// CONSTANTS
const VARIETY_CONFIG = {
  'Cili Padi': {
    icon: '🌶️',
    desc: 'Small & fiery. Fast to mature.',
    colors: ['Green', 'Red'],
    baseDays: { Green: 67, Red: 85 }
  },
  'Cili Besar': {
    icon: '🌶️',
    desc: 'Medium-large. Great for cooking.',
    colors: ['Green', 'Red'],
    baseDays: { Green: 67, Red: 85 }
  },
  'Cili Benggala': {
    icon: '🫑',
    desc: 'Bell pepper type. 3 harvest colors.',
    colors: ['Green', 'Red', 'Yellow'],
    baseDays: { Green: 70, Red: 95, Yellow: 80 }
  }
};

const ENV_MODIFIER  = { Indoor: +7, Outdoor: 0, Greenhouse: -5 };
const COLOR_EMOJI   = { Green: '🟢', Red: '🔴', Yellow: '🟡' };

const COLOR_DESC = {
  Green:  'Harvest before full ripening — faster & slightly milder',
  Red:    'Full maturity — stronger heat & richer flavor',
  Yellow: 'Golden stage — sweet & fruity (Benggala only)'
};

const DATE_FMT_FULL  = { day: 'numeric', month: 'long',  year: 'numeric' };
const DATE_FMT_SHORT = { day: 'numeric', month: 'short', year: 'numeric' };
const DATE_FMT_MON   = { month: 'short', year: 'numeric' };


// STATE
let cycleStep              = 1;
let variantName            = 'Cili Padi';
let harvestGoal            = 'Green';
let environmentChoice      = 'Indoor';
let currentUser            = null;
let activeCycles           = [];
let completedCycles        = [];
let currentNoteModalCycleId = null;


// HELPERS
function calcDays(variety, color, env) {
  const cfg  = VARIETY_CONFIG[variety];
  if (!cfg) return 75;
  const base = cfg.baseDays[color] ?? cfg.baseDays[cfg.colors[0]];
  return base + (ENV_MODIFIER[env] ?? 0);
}

function toDate(val) {
  return val?.toDate ? val.toDate() : new Date(val);
}

function escapeHtml(text) {
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}

function getColorBadge(color) {
  return COLOR_EMOJI[color] || '🟢';
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value ?? '';
}

function getValue(id) {
  return document.getElementById(id)?.value ?? '';
}

function calcProgress(cycle) {
  const start = new Date(toDate(cycle.plantingDate));
  start.setHours(0, 0, 0, 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const daysPassed = Math.max(Math.floor((today - start) / 86_400_000) + 1, 1);
  const pct        = Math.min(Math.round((daysPassed / cycle.varietyDays) * 100), 100);

  return { daysPassed, pct };
}

function getStage(days) {
  if (days <= 7)  return 'seed';
  if (days <= 20) return 'sprout';
  if (days <= 45) return 'grow';
  if (days <= 65) return 'flower';
  return 'harvest';
}


// AUTH
function initAuthListener() {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      currentUser = user;
      loadHarvestCycles(user.uid);
    } else {
      currentUser = null;
      renderEmptyState();
    }
  });
}


// FIRESTORE — REAL-TIME LOAD
function loadHarvestCycles(userId) {
  const q = query(
    collection(db, 'users', userId, 'harvestCycles'),
    orderBy('createdAt', 'desc')
  );

  onSnapshot(q, (snapshot) => {
    activeCycles    = [];
    completedCycles = [];

    snapshot.forEach((docSnap) => {
      const cycle = { id: docSnap.id, ...docSnap.data() };

      if (cycle.status === 'active') {
        const { pct } = calcProgress(cycle);

        if (pct >= 100) {
          // Auto-complete when progress hits 100%
          updateDoc(doc(db, 'users', userId, 'harvestCycles', cycle.id), {
            status:        'completed',
            harvestedDate: Timestamp.now(),
            updatedAt:     Timestamp.now()
          }).catch(console.error);
        } else {
          activeCycles.push(cycle);
        }

      } else if (cycle.status === 'completed') {
        completedCycles.push(cycle);

      }
      // ── 'past' cycles are only visible in History page ──
      // No auto-purge — user deletes manually from History
    });

    renderHarvestCycles();

    const loc = activeCycles[0]?.location || null;
    initWeather(loc);

  }, (err) => {
    console.error('loadHarvestCycles error:', err);
    window.showToast?.('❌', 'Load Failed', 'Could not load harvest cycles.');
  });
}


// RENDER ALL CYCLES
function renderHarvestCycles() {
  const activeEl    = document.getElementById('activeCycleContainer');
  const completedEl = document.getElementById('completedCyclesContainer');
  const emptyState  = document.getElementById('noHarvestState');

  if (!activeEl || !completedEl) return;

  activeEl.innerHTML    = '';
  completedEl.innerHTML = '';

  if (activeCycles.length > 0) {
    if (emptyState) emptyState.style.display = 'none';
    activeCycles.forEach(c => activeEl.appendChild(createActiveCycleCard(c)));
  } else {
    if (emptyState) emptyState.style.display = 'block';
  }

  completedCycles.forEach(c => completedEl.appendChild(createCompletedCycleCard(c)));
}


// ACTIVE CYCLE CARD
function createActiveCycleCard(cycle) {
  const card = document.createElement('div');
  card.className = 'cycle-card';

  const { daysPassed, pct } = calcProgress(cycle);
  const stage        = getStage(daysPassed);
  const remindersHTML = buildReminders(cycle, stage, daysPassed);

  const plantedDate = toDate(cycle.plantingDate);
  const harvestDate = new Date(plantedDate);
  harvestDate.setDate(harvestDate.getDate() + cycle.varietyDays);

  const icon = VARIETY_CONFIG[cycle.variety]?.icon || '🌶️';

  card.innerHTML = `
    <div class="cycle-head">
      <div>
        <h3>${icon} ${cycle.variety}</h3>
        <p>Planted: ${plantedDate.toLocaleDateString('en-MY', DATE_FMT_SHORT)} · ${cycle.location} · ${cycle.method}</p>
        <p>${getColorBadge(cycle.harvestGoal)} Target: ${cycle.harvestGoal} harvest · ~${cycle.varietyDays} days</p>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;">
        <span class="status-active">🟢 Active</span>
        <button
          onclick="window.deleteCycle('${cycle.id}','${escapeHtml(cycle.variety)}')"
          style="background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.3);
                 color:white;padding:3px 10px;border-radius:20px;font-size:.65rem;
                 font-weight:600;cursor:pointer;transition:background .2s;"
          onmouseover="this.style.background='rgba(255,255,255,.28)'"
          onmouseout="this.style.background='rgba(255,255,255,.15)'">
          🗑️ Delete
        </button>
      </div>
    </div>

    <div class="card-body">
      ${buildStageRow(stage)}

      <div class="prog-meta">
        <strong>Day ${daysPassed} of ~${cycle.varietyDays}</strong>
        <span>Est. Harvest: ${harvestDate.toLocaleDateString('en-MY', DATE_FMT_SHORT)} 🗓️</span>
      </div>

      <div class="prog-track">
        <div class="prog-fill" style="width:${pct}%"></div>
      </div>

      <p class="rem-title">🌤️ Today's Care Reminders</p>
      ${remindersHTML}

      <div class="log-section">
        <div class="log-head">
          <span>📓 Growth Log</span>
          <button class="btn btn-ghost btn-sm"
            onclick="window.openNoteModal('${cycle.id}','${escapeHtml(cycle.variety)}')">
            + Add Note
          </button>
        </div>
        ${buildGrowthLog(cycle.notes || [], cycle.id)}
      </div>
    </div>`;

  return card;
}


// COMPLETED CYCLE CARD
function createCompletedCycleCard(cycle) {
  const card = document.createElement('div');
  card.className = 'card';

  const plantedDate   = toDate(cycle.plantingDate);
  const harvestedDate = cycle.harvestedDate ? toDate(cycle.harvestedDate) : new Date();
  const actualDays    = Math.floor((harvestedDate - plantedDate) / 86_400_000);
  const icon          = VARIETY_CONFIG[cycle.variety]?.icon || '🌶️';

  card.innerHTML = `
    <div class="card-head">
      <div class="ch-row">
        <div>
          <h3>${icon} ${cycle.variety}</h3>
          <p style="font-size:.7rem;color:var(--muted);margin-top:2px;">
            ${getColorBadge(cycle.harvestGoal)} ${cycle.harvestGoal} harvest
          </p>
        </div>
      </div>
      <span class="done-pill">✅ Harvested</span>
    </div>

    <div class="card-body">
      <p class="cycle-meta">
        Planted ${plantedDate.toLocaleDateString('en-MY', DATE_FMT_MON)} ·
        Harvested ${harvestedDate.toLocaleDateString('en-MY', DATE_FMT_MON)} ·
        ${actualDays} days · Yield: ${cycle.yield || 'Good'}
      </p>
      <div class="prog-track" style="margin-bottom:14px;">
        <div class="prog-fill done" style="width:100%"></div>
      </div>
      <button
        class="btn btn-danger btn-sm"
        style="width:100%;justify-content:center;"
        onclick="window.moveToHistory('${cycle.id}','${escapeHtml(cycle.variety)}')">
        🗑️ Move to History
      </button>
    </div>`;

  return card;
}


// MOVE COMPLETED → HISTORY
window.moveToHistory = async function (cycleId, variety) {
  if (!currentUser) return;

  const confirmed = confirm(
    `Move "${variety}" to History?\n\nThis cycle will be saved in your History page.`
  );
  if (!confirmed) return;

  try {
    await updateDoc(doc(db, 'users', currentUser.uid, 'harvestCycles', cycleId), {
      status:    'past',
      deletedAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    });

    window.showToast?.('📜', 'Moved to History', `${variety} cycle saved in History.`);

  } catch (err) {
    console.error('moveToHistory error:', err);
    window.showToast?.('❌', 'Failed', 'Could not move cycle to history.');
  }
};


// DELETE ACTIVE CYCLE
window.deleteCycle = async function (cycleId, variety) {
  if (!currentUser) return;

  const confirmed = confirm(
    `Delete "${variety}" cycle?\n\nThis will permanently remove the cycle and all its notes. This cannot be undone.`
  );
  if (!confirmed) return;

  try {
    await deleteDoc(doc(db, 'users', currentUser.uid, 'harvestCycles', cycleId));
    window.showToast?.('🗑️', 'Deleted', `${variety} cycle has been removed.`);
  } catch (err) {
    console.error('deleteCycle error:', err);
    window.showToast?.('❌', 'Failed', 'Could not delete cycle.');
  }
};


// STAGE ROW
function buildStageRow(currentStage) {
  const stages = [
    { key: 'seed',    icon: '🌱', name: 'Seed',    days: 'Day 1–7'   },
    { key: 'sprout',  icon: '🪴', name: 'Sprout',  days: 'Day 8–20'  },
    { key: 'grow',    icon: '🌿', name: 'Grow',    days: 'Day 21–45' },
    { key: 'flower',  icon: '🌸', name: 'Flower',  days: 'Day 46–65' },
    { key: 'harvest', icon: '🌶️', name: 'Harvest', days: 'Day 66+'   }
  ];

  const ci = stages.findIndex(s => s.key === currentStage);

  let html = '<div class="stage-row">';
  stages.forEach((s, i) => {
    const cls = 'stage-step'
      + (i < ci  ? ' done'   : '')
      + (i === ci ? ' active' : '');
    html += `
      <div class="${cls}">
        <div class="stage-circle">${s.icon}</div>
        <span class="s-name">${s.name}</span>
        <span class="s-days">${s.days}</span>
      </div>`;

    if (i < stages.length - 1) {
      const lc = 'stage-line'
        + (i < ci         ? ' done' : '')
        + (i === ci - 1   ? ' half' : '');
      html += `<div class="${lc}"></div>`;
    }
  });

  return html + '</div>';
}


// GROWTH LOG
function buildGrowthLog(notes, cycleId) {
  if (!notes.length) {
    return '<p style="color:#7f8c8d;text-align:center;padding:1rem;">No notes yet. Add your first observation!</p>';
  }

  return notes
    .map((n, originalIndex) => ({ ...n, originalIndex }))
    .sort((a, b) => toDate(b.date) - toDate(a.date))
    .slice(0, 3)
    .map((n) => {
      const d = toDate(n.date).toLocaleDateString('en-MY', {
        day: 'numeric', month: 'short'
      });
      return `
        <div class="log-row">
          <span class="log-date">${d}</span>
          <span class="log-text">${escapeHtml(n.text)}</span>
          <span class="log-tag">${n.category}</span>
          <button class="btn-delete-note"
            onclick="window.deleteNote('${cycleId}', ${n.originalIndex})"
            title="Delete note">
            🗑️
          </button>
        </div>`;
    }).join('');
}


// EMPTY STATE
function renderEmptyState() {
  const el = document.getElementById('activeCycleContainer');
  if (el) el.innerHTML = '';
}


// CREATE HARVEST CYCLE
async function createHarvestCycle(userId, data) {
  await addDoc(collection(db, 'users', userId, 'harvestCycles'), {
    variety:      data.variety,
    varietyDays:  data.varietyDays,
    plantingDate: Timestamp.fromDate(data.plantingDate),
    location:     data.location,
    method:       data.method,
    harvestGoal:  data.harvestGoal,
    status:       'active',
    currentStage: 'seed',
    notes:        [],
    createdAt:    Timestamp.now(),
    updatedAt:    Timestamp.now()
  });
}


// NOTE MODAL
window.openNoteModal = function (cycleId, variety) {
  currentNoteModalCycleId = cycleId;
  setText('noteCycleTitle', variety || 'Active Cycle');

  const dateEl = document.getElementById('noteDate');
  if (dateEl) dateEl.value = new Date().toISOString().split('T')[0];

  const textEl = document.getElementById('noteText');
  if (textEl) textEl.value = '';

  setText('noteCount', '0 / 300');
  document.getElementById('noteOverlay')?.classList.add('open');
};

window.closeNoteModal = function () {
  document.getElementById('noteOverlay')?.classList.remove('open');
  currentNoteModalCycleId = null;
};


// ADD GROWTH NOTE
async function addGrowthNote(cycleId, noteData) {
  if (!currentUser || !cycleId) return;

  try {
    await updateDoc(
      doc(db, 'users', currentUser.uid, 'harvestCycles', cycleId),
      {
        notes: arrayUnion({
          category:  noteData.category,
          text:      noteData.text,
          date:      Timestamp.fromDate(noteData.date),
          createdAt: Timestamp.now()
        }),
        updatedAt: Timestamp.now()
      }
    );
    window.showToast?.('📓', 'Note Saved', 'Your observation has been recorded.');
  } catch (err) {
    console.error('addGrowthNote error:', err);
    window.showToast?.('❌', 'Save Failed', 'Could not save note.');
  }
}


// DELETE NOTE
window.deleteNote = async function (cycleId, noteIndex) {
  if (!currentUser) {
    window.showToast?.('⚠️', 'Error', 'Please log in to delete notes.');
    return;
  }

  const confirmed = confirm('Delete this note? This action cannot be undone.');
  if (!confirmed) return;

  try {
    const cycle =
      activeCycles.find(c => c.id === cycleId) ||
      completedCycles.find(c => c.id === cycleId);

    if (!cycle || !Array.isArray(cycle.notes)) {
      window.showToast?.('❌', 'Error', 'Cycle or notes not found.');
      return;
    }

    if (noteIndex < 0 || noteIndex >= cycle.notes.length) {
      window.showToast?.('❌', 'Error', 'Invalid note index.');
      return;
    }

    const updatedNotes = [...cycle.notes];
    updatedNotes.splice(noteIndex, 1);

    await updateDoc(doc(db, 'users', currentUser.uid, 'harvestCycles', cycleId), {
      notes:     updatedNotes,
      updatedAt: Timestamp.now()
    });

    window.showToast?.('🗑️', 'Deleted', 'Note removed successfully.');

  } catch (err) {
    console.error('deleteNote error:', err);
    window.showToast?.('❌', 'Failed', 'Could not delete note.');
  }
};


// CYCLE MODAL — OPEN / CLOSE
window.openCycleModal = function () {
  if (!currentUser) {
    window.showToast?.('❌', 'Error', 'Please log in to create a cycle.');
    return;
  }

  cycleStep         = 1;
  variantName       = 'Cili Padi';
  harvestGoal       = 'Green';
  environmentChoice = 'Indoor';

  const dateEl = document.getElementById('plantDate');
  if (dateEl) dateEl.value = new Date().toISOString().split('T')[0];

  document.querySelectorAll('.variety-card').forEach((c, i) => {
    c.classList.toggle('selected', i === 0);
  });

  renderCycleStep();
  document.getElementById('cycleOverlay')?.classList.add('open');
};

window.closeCycleModal = function () {
  document.getElementById('cycleOverlay')?.classList.remove('open');
};


// CYCLE MODAL — STEP RENDER
function renderCycleStep() {
  const labels = [
    'Step 1 of 4 — Choose your chili variety',
    'Step 2 of 4 — Select harvest color',
    'Step 3 of 4 — Planting details',
    'Step 4 of 4 — Confirm & start tracking'
  ];

  for (let i = 1; i <= 4; i++) {
    document.getElementById('step' + i)?.classList.toggle('active', i === cycleStep);
    const dot = document.getElementById('sd' + i);
    if (dot) {
      dot.className = 'step-dot'
        + (i < cycleStep  ? ' done'   : '')
        + (i === cycleStep ? ' active' : '');
    }
  }

  setText('cycleStepLabel', labels[cycleStep - 1]);

  const backBtn = document.getElementById('btnBack');
  if (backBtn) backBtn.style.display = cycleStep > 1 ? 'inline-flex' : 'none';

  const nextBtn = document.getElementById('btnNext');
  if (nextBtn) nextBtn.textContent = cycleStep === 4 ? '🌱 Start Tracking!' : 'Next →';
}


// CYCLE MODAL — NEXT / BACK
window.nextStep = async function () {
  if (cycleStep === 4) {
    if (!currentUser) return;

    const plantDate = getValue('plantDate');
    const location  = getValue('plantLoc') || 'Malaysia';

    if (!plantDate) {
      window.showToast?.('⚠️', 'Validation Error', 'Please select a planting date.');
      return;
    }

    const days = calcDays(variantName, harvestGoal, environmentChoice);
    const data = {
      variety:      variantName,
      varietyDays:  days,
      plantingDate: new Date(plantDate),
      location,
      method:       environmentChoice,
      harvestGoal
    };

    // ── Close + toast immediately ──
    window.closeCycleModal();
    window.showToast?.(
      '🌱', 'Cycle Started!',
      `${data.variety} · ${getColorBadge(data.harvestGoal)} ${data.harvestGoal} · ~${days} days`
    );

    // ── Write to Firestore in background ──
    createHarvestCycle(currentUser.uid, data).catch((err) => {
      console.error('createHarvestCycle error:', err);
      window.showToast?.('❌', 'Save Failed', 'Cycle could not be saved. Try again.');
    });

    return;
  }

  cycleStep++;
  renderCycleStep();
  if (cycleStep === 2) buildColorOptions();
  if (cycleStep === 4) buildSummary();
};

window.prevStep = function () {
  if (cycleStep > 1) {
    cycleStep--;
    renderCycleStep();
    if (cycleStep === 2) buildColorOptions();
  }
};


// PICK VARIETY
window.pickVariety = function (el) {
  document.querySelectorAll('.variety-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  variantName = el.querySelector('.vc-name')?.textContent.trim() || 'Cili Padi';

  const cfg = VARIETY_CONFIG[variantName];
  if (cfg && !cfg.colors.includes(harvestGoal)) harvestGoal = cfg.colors[0];
};


// BUILD COLOR OPTIONS (Step 2)
function buildColorOptions() {
  const cfg = VARIETY_CONFIG[variantName];
  if (!cfg) return;

  const sub = document.getElementById('step2Sub');
  if (sub) {
    sub.textContent = variantName === 'Cili Benggala'
      ? 'Cili Benggala supports 3 harvest colors — pick your target.'
      : `${variantName} can be harvested Green or Red — pick your target.`;
  }

  const container = document.getElementById('goalContainer');
  if (!container) return;
  container.innerHTML = '';

  if (!cfg.colors.includes(harvestGoal)) harvestGoal = cfg.colors[0];

  cfg.colors.forEach(color => {
    const days = calcDays(variantName, color, environmentChoice);
    const card = document.createElement('div');
    card.className = `goal-card${color === harvestGoal ? ' selected' : ''}`;
    card.setAttribute('onclick', 'window.pickGoal(this)');
    card.innerHTML = `
      <div class="goal-icon">${COLOR_EMOJI[color]}</div>
      <div class="goal-name">${color}</div>
      <div class="goal-days">~${days} days</div>
      <div class="goal-desc">${COLOR_DESC[color]}</div>`;
    container.appendChild(card);
  });

  updatePreview();
}

function updatePreview() {
  const el = document.getElementById('previewDays');
  if (!el) return;
  const days = calcDays(variantName, harvestGoal, environmentChoice);
  const mod  = ENV_MODIFIER[environmentChoice] ?? 0;
  const envTxt = mod > 0 ? `+${mod}d Indoor` : mod < 0 ? `${mod}d Greenhouse` : 'Outdoor base';
  el.textContent = `~${days} days  (${envTxt})`;
}


// PICK COLOR GOAL
window.pickGoal = function (el) {
  document.querySelectorAll('.goal-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  harvestGoal = el.querySelector('.goal-name')?.textContent.trim() || 'Green';
  updatePreview();
};


// PICK ENVIRONMENT
window.pickMethod = function (el) {
  document.querySelectorAll('.method-pill').forEach(p => p.classList.remove('selected'));
  el.classList.add('selected');
  environmentChoice = el.querySelector('.mp-label')?.textContent.trim() || 'Indoor';
  if (cycleStep === 2) buildColorOptions();
};


// BUILD STEP 4 SUMMARY
function buildSummary() {
  const dateVal = getValue('plantDate');
  const locVal  = getValue('plantLoc') || 'Malaysia';
  const days    = calcDays(variantName, harvestGoal, environmentChoice);

  setText('sumVariety', `${VARIETY_CONFIG[variantName]?.icon || '🌶️'} ${variantName}`);
  setText('sumGoal',    `${getColorBadge(harvestGoal)} ${harvestGoal}`);
  setText('sumLoc',     locVal);
  setText('sumMethod',  environmentChoice);
  setText('sumDays',    `~${days} days  (${variantName} · ${harvestGoal} · ${environmentChoice})`);

  if (dateVal) {
    const planted     = new Date(dateVal);
    const harvestDate = new Date(dateVal);
    harvestDate.setDate(harvestDate.getDate() + days);
    setText('sumDate',    planted.toLocaleDateString('en-MY', DATE_FMT_FULL));
    setText('sumHarvest', harvestDate.toLocaleDateString('en-MY', DATE_FMT_FULL));
  }
}


// INIT
export function initHarvestPage() {
  initAuthListener();

  document.getElementById('cycleOverlay')?.addEventListener('click', e => {
    if (e.target.id === 'cycleOverlay') window.closeCycleModal();
  });
  document.getElementById('noteOverlay')?.addEventListener('click', e => {
    if (e.target.id === 'noteOverlay') window.closeNoteModal();
  });

  const noteTA  = document.getElementById('noteText');
  const noteCnt = document.getElementById('noteCount');
  noteTA?.addEventListener('input', () => {
    if (noteCnt) noteCnt.textContent = `${noteTA.value.length} / 300`;
  });

  // SAVE NOTE
  document.getElementById('btnSaveNote')?.addEventListener('click', () => {
    if (!currentUser) {
      window.showToast?.('⚠️', 'Not Logged In', 'Please log in to save notes.');
      window.closeNoteModal();
      return;
    }

    const cycleId = currentNoteModalCycleId;
    if (!cycleId) {
      window.showToast?.('⚠️', 'Error', 'No active cycle selected.');
      return;
    }

    const text = getValue('noteText');
    if (!text.trim()) {
      window.showToast?.('⚠️', 'Validation Error', 'Please enter a note.');
      return;
    }

    const category = getValue('noteCategory') || 'General';
    const dateVal  = getValue('noteDate');
    const date     = dateVal ? new Date(dateVal) : new Date();

    // ── Clear UI first (instant UX) ──
    const noteTA  = document.getElementById('noteText');
    const noteCnt = document.getElementById('noteCount');
    if (noteTA)  noteTA.value       = '';
    if (noteCnt) noteCnt.textContent = '0 / 300';

    // ── Close modal then save in background ──
    window.closeNoteModal();

    addGrowthNote(cycleId, { category, text, date })
      .catch(err => {
        console.error('Background save failed:', err);
        window.showToast?.('❌', 'Save Failed', 'Could not save note.');
      });
  });
}