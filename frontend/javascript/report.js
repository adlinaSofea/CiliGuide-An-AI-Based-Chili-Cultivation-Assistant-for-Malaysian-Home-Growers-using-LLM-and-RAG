// ============================================
// FIREBASE IMPORTS
// ============================================
import { db, auth } from './firebase-config.js';
import {
  collection,
  getDocs,
  addDoc,
  onSnapshot,
  doc,
  deleteDoc,
  updateDoc,
  getDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { logActivity } from './activity.js';


// ============================================
// STATE
// ============================================
let currentUser = null;
let selectedIssues = [];
let selectedCycleData = null;
let selectedReportId = null;
let currentEstimate = null;


// ============================================
// AUTH
// ============================================
onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  currentUser = user;

  try {
    const snap = await getDoc(doc(db, 'users', user.uid));
  } catch (e) {
    console.warn('Could not read role:', e);
  }

  loadReports(user.uid);
  initReportForm();
});



export async function loadCycleOptions(userId) {
  const select = document.getElementById('reportCycleSelect');
  if (!select) return;

  select.innerHTML = `<option value="">Choose a cycle</option>`;

  const options = [];

  try {
    const snap = await getDocs(
      collection(db, 'users', userId, 'harvestCycles')
    );

    snap.forEach(docSnap => {
      const data = docSnap.data();

      if (data.status === 'completed' || data.status === 'past') {
        if (reportedCycleIds.has(docSnap.id)) return;
        const harvestedDate = data.harvestedDate?.toDate?.();
        const datePart = harvestedDate
          ? harvestedDate.toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })
          : 'Date unknown';
        options.push({
          id: docSnap.id,
          label: `${data.variety} · Harvested ${datePart} · ${data.varietyDays ?? '?'} days`,
          variety: data.variety,
          sortDate: data.harvestedDate?.toMillis?.() || 0
        });
      }
    });

  } catch (e) {
    console.warn('Could not load harvestCycles:', e);
  }

  options.sort((a, b) => b.sortDate - a.sortDate);

  options.forEach(opt => {
    const el = document.createElement('option');
    el.value = opt.id;
    el.textContent = opt.label;
    el.dataset.variety = opt.variety;
    select.appendChild(el);
  });

  if (options.length === 0) {
    const el = document.createElement('option');
    el.value = '';
    el.textContent = 'No completed cycles available';
    el.disabled = true;
    select.appendChild(el);
  }

  const newSelect = select.cloneNode(true);
  select.parentNode.replaceChild(newSelect, select);

  newSelect.addEventListener('change', () => {
    const selected = newSelect.options[newSelect.selectedIndex];

    selectedCycleData = {
      id: newSelect.value,
      variety: selected.dataset.variety
      // [CHANGED] removed: source: 'cycle'
    };
  });
}


// ============================================
// INIT FORM
// ============================================
function initReportForm() {
  const form = document.getElementById('harvestReportForm');
  form?.addEventListener('submit', submitReport);
}


// ============================================
// ISSUE HANDLER
// ============================================
window.toggleIssueTag = function (el) {
  const issue = el.dataset.issue;
  el.classList.toggle('active');

  if (selectedIssues.includes(issue)) {
    selectedIssues = selectedIssues.filter(i => i !== issue);
  } else {
    selectedIssues.push(issue);
  }

  document.getElementById('issueCount').textContent =
    `${selectedIssues.length} selected`;
};


// ============================================
// QUALITY SYSTEM
// ============================================
function getBaseQuality(weight, count) {
  if (!weight || !count) return 60;
  const avgFruitWeight = (weight * 1000) / count;
  if (avgFruitWeight >= 80) return 90;
  if (avgFruitWeight >= 50) return 80;
  if (avgFruitWeight >= 25) return 70;
  if (avgFruitWeight >= 10) return 60;
  return 45;
}

function applyIssueImpact(score, issues) {
  const impactMap = {
    pests: 6,
    disease: 10,
    overwater: 5,
    underwater: 5,
    heat: 4,
    cold: 4,
    nutrient: 8,
    growth: 6
  };
  let penalty = 0;
  issues.forEach(i => { penalty += impactMap[i] || 0; });
  return Math.max(0, score - penalty);
}

function getQualityLabel(score) {
  if (score >= 85) return "excellent";
  if (score >= 70) return "good";
  if (score >= 50) return "fair";
  return "poor";
}

function getQualityColor(label) {
  switch (label) {
    case "excellent": return "#1e8449";
    case "good": return "#547792";
    case "fair": return "#FFC570";
    case "poor": return "#c0392b";
    default: return "#aaa";
  }
}


// ============================================
// MAIN SUBMIT
// ============================================
async function submitReport(e) {
  e.preventDefault();

  if (!currentUser || !selectedCycleData) {
    // [CHANGED] updated message for home growers
    window.showToast('⚠️', 'No Cycle Selected', 'Please select a completed growing cycle first');
    return;
  }

  const weight = parseFloat(document.getElementById('reportWeight').value);
  const count = parseInt(document.getElementById('reportCount').value);
  const days = parseInt(document.getElementById('reportDaysGrown').value);
  const date = document.getElementById('reportHarvestDate').value;

  if (!weight || !count || !days || !date) {
    window.showToast('⚠️', 'Incomplete', 'Please complete all fields');
    return;
  }

  const baseScore = getBaseQuality(weight, count);
  const adjustedScore = applyIssueImpact(baseScore, selectedIssues);
  const qualityPercent = Math.min(100, Math.max(0, Math.round(adjustedScore)));
  const qualityLabel = getQualityLabel(qualityPercent);

  const issuesSnapshot = [...selectedIssues];
  const cycleSnapshot = { ...selectedCycleData };

  // Reset form immediately
  document.getElementById('harvestReportForm').reset();
  selectedIssues = [];
  selectedCycleData = null;
  currentEstimate = null;
  document.getElementById('issueCount').textContent = '0 selected';
  document.querySelectorAll('.issue-tag, .report-issue-tag')
    .forEach(tag => tag.classList.remove('active', 'selected'));

  window.showToast('✅', 'Report Saved', `${cycleSnapshot.variety} · ${qualityLabel.toUpperCase()}`);

  try {
    await addDoc(collection(db, 'users', currentUser.uid, 'reports'), {
      cycleId: cycleSnapshot.id,
      variety: cycleSnapshot.variety,
      // [CHANGED] removed source field entirely
      weight,
      count,
      days,
      date,
      qualityLabel,
      qualityPercent,
      issues: issuesSnapshot,
      createdAt: serverTimestamp()
    });

    await addDoc(collection(db, 'users', currentUser.uid, 'journeyLog'), {
      cycleId: cycleSnapshot.id,
      variety: cycleSnapshot.variety,
      weight,
      count,
      days,
      date,
      qualityLabel,
      qualityPercent,
      issues: issuesSnapshot,
      savedAt: serverTimestamp()
    });

    // Mark cycle as past after reporting (keep for history)
    await updateDoc(
      doc(db, 'users', currentUser.uid, 'harvestCycles', cycleSnapshot.id),
      { status: 'past', updatedAt: serverTimestamp() }
    );

    await logActivity(currentUser.uid, {
      title: "Harvest Report",
      description: `${cycleSnapshot.variety} → ${count} chilies (${qualityLabel})`,
      icon: "📊",
      color: "green"
    });

  } catch (err) {
    console.error(err);
    window.showToast('❌', 'Save Failed', 'Report may not have saved. Please try again.');
  }
}


// ============================================
// LOAD REPORTS
// ============================================
let allReportsData = [];
const REPORTS_PER_PAGE = 3;
let currentReportsPage = 1;
let reportedCycleIds = new Set();

function loadReports(userId) {
  onSnapshot(collection(db, 'users', userId, 'reports'), (snapshot) => {
    allReportsData = [];
    reportedCycleIds = new Set();
    snapshot.forEach(docSnap => {
      const d = { id: docSnap.id, ...docSnap.data() };
      allReportsData.push(d);
      if (d.cycleId) reportedCycleIds.add(d.cycleId);
    });

    allReportsData.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    currentReportsPage = 1;
    renderReportCards();

    // Reload dropdown AFTER reportedCycleIds is populated
    loadCycleOptions(userId);
  });
}

function renderReportCards() {
  const container  = document.getElementById('historyReportsContainer');
  const countEl    = document.getElementById('reportHistoryCount');
  const emptyState = document.getElementById('reportsEmptyState');
  if (!container || !countEl || !emptyState) return;

  const from = document.getElementById('journeyDateFrom')?.value;
  const to   = document.getElementById('journeyDateTo')?.value;
  const fromDate = from ? new Date(from) : null;
  const toDate   = to   ? new Date(to + 'T23:59:59') : null;

  const filtered = allReportsData.filter(d => {
    if (!d.date) return true;
    const dt = new Date(d.date);
    if (fromDate && dt < fromDate) return false;
    if (toDate   && dt > toDate)   return false;
    return true;
  });

  countEl.textContent = `${filtered.length} report${filtered.length !== 1 ? 's' : ''}`;

  // Remove only cards and pagination, NOT the whole container (keeps filter bar safe)
  container.querySelectorAll('.report-history-card, .report-pagination').forEach(el => el.remove());

  if (filtered.length === 0) {
    emptyState.style.display = 'block';
    return;
  }
  emptyState.style.display = 'none';

  const totalPages = Math.ceil(filtered.length / REPORTS_PER_PAGE);
  if (currentReportsPage > totalPages) currentReportsPage = totalPages;
  const start     = (currentReportsPage - 1) * REPORTS_PER_PAGE;
  const paginated = filtered.slice(start, start + REPORTS_PER_PAGE);

  paginated.forEach(d => {
    const color = getQualityColor(d.qualityLabel);
    const card  = document.createElement('div');
    card.className = 'report-history-card';
    card.style.cssText = `
      border-left: 5px solid ${color};
      border-top: 1px solid #eee;
      border-right: 1px solid #eee;
      border-bottom: 1px solid #eee;
      border-radius: 0 12px 12px 0;
      position: relative;
      cursor: pointer;
      margin-bottom: 12px;
      padding: 16px;
      background: #fff;
      box-shadow: 0 2px 8px rgba(0,0,0,0.07);
    `;
    card.innerHTML = `
      <div class="report-card-header">
        <div>
          <div class="report-card-title">${d.variety}</div>
          <div class="report-card-date"><small>Harvest Date: ${d.date}</small></div>
        </div>
        <div style="color:${color};border:1.5px solid ${color};background:${color}18;
                    font-weight:700;padding:3px 14px;border-radius:20px;font-size:.72rem;
                    letter-spacing:.5px;white-space:nowrap;align-self:center;">
          ${d.qualityLabel.toUpperCase()}
        </div>
      </div>
      <div class="report-card-stats">
        <div><strong>${d.weight}</strong><br><small>kg</small></div>
        <div><strong>${d.count}</strong><br><small>Chilies</small></div>
        <div><strong>${d.qualityPercent}%</strong><br><small>Quality</small></div>
      </div>
    `;
    card.onclick = () => openReportModal(d.id, d);
    container.appendChild(card);
  });

  if (totalPages > 1) {
    const pag = document.createElement('div');
    pag.className = 'report-pagination';
    pag.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:10px 4px;margin-top:4px;';

    const btnStyle = 'padding:6px 14px;border:1.5px solid #e5e5e5;border-radius:8px;background:white;font-size:.78rem;cursor:pointer;color:#888;';

    const prevBtn = document.createElement('button');
    prevBtn.textContent = '← Prev';
    prevBtn.style.cssText = btnStyle;
    if (currentReportsPage === 1) { prevBtn.disabled = true; prevBtn.style.opacity = '0.4'; prevBtn.style.cursor = 'not-allowed'; }
    prevBtn.addEventListener('click', () => {
      if (currentReportsPage > 1) { currentReportsPage--; renderReportCards(); container.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    });

    const pageInfo = document.createElement('span');
    pageInfo.style.cssText = 'font-size:.78rem;color:#888;';
    pageInfo.innerHTML = `Page ${currentReportsPage} of ${totalPages} <span style="color:#bbb;font-size:.7rem;">(${filtered.length} total)</span>`;

    const nextBtn = document.createElement('button');
    nextBtn.textContent = 'Next →';
    nextBtn.style.cssText = btnStyle;
    if (currentReportsPage === totalPages) { nextBtn.disabled = true; nextBtn.style.opacity = '0.4'; nextBtn.style.cursor = 'not-allowed'; }
    nextBtn.addEventListener('click', () => {
      if (currentReportsPage < totalPages) { currentReportsPage++; renderReportCards(); container.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    });

    pag.appendChild(prevBtn);
    pag.appendChild(pageInfo);
    pag.appendChild(nextBtn);
    container.appendChild(pag);
  }
}

window.changeReportsPage = function(page) {
  const totalPages = Math.ceil(allReportsData.length / REPORTS_PER_PAGE);
  if (page < 1 || page > totalPages) return;
  currentReportsPage = page;
  renderReportCards();
};


// ============================================
// OPEN REPORT MODAL
// ============================================
function openReportModal(id, d) {
  selectedReportId = id;

  const overlay = document.getElementById('reportModalOverlay');
  overlay.classList.add('open');

  document.getElementById('reportModalTitle').textContent = d.variety;
  document.getElementById('reportModalDate').textContent = 'Harvest Date:  ' + d.date;
  document.getElementById('reportModalPercent').textContent = d.qualityPercent + '%';
  document.getElementById('reportModalDays').textContent = d.days;
  document.getElementById('reportModalWeight').textContent = d.weight + ' kg';
  document.getElementById('reportModalCount').textContent = d.count;
  document.getElementById('reportModalQuality').textContent = d.qualityLabel.toUpperCase();

  const box = document.getElementById('reportModalIssues');
  box.innerHTML = '';

  if (!d.issues?.length) {
    box.innerHTML = `<p style="opacity:.6; font-size:.8rem;">No issues reported</p>`;
  } else {
    d.issues.forEach(i => {
      const el = document.createElement('span');
      el.className = 'report-modal-issue-badge';
      el.textContent = i;
      box.appendChild(el);
    });
  }
}


// ============================================
// CLOSE REPORT MODAL
// ============================================
window.closeReportModal = function () {
  document.getElementById('reportModalOverlay').classList.remove('open');
};


// ============================================
// DELETE REPORT
// ============================================
window.deleteReportFromModal = async function () {
  if (!selectedReportId) return;
  if (!confirm('Delete this report?')) return;

  document.getElementById('reportModalOverlay').classList.remove('open');

  try {
    await deleteDoc(doc(db, 'users', currentUser.uid, 'reports', selectedReportId));
    selectedReportId = null;
    window.showToast('🗑️', 'Deleted', 'Report removed successfully');
  } catch (err) {
    console.error(err);
    window.showToast('❌', 'Failed', 'Try again');
  }
};


// ============================================
// ESTIMATE CHILIES
// ============================================
const CHILI_AVG_WEIGHT_G = {
  'cili padi': 2.5,
  'cili besar': 14.5,
  'cili benggala': 106.9
};

const CHILI_REF_LABEL = {
  'cili padi': 'Cili Padi (V. Capsicum frutescens) · 2.5g · Ref: MARDI Manual Penanaman',
  'cili besar': 'Cili Kulai (V. Capsicum annuum) · Purata 13g · Ref: DOA Pakej Teknologi Cili',
  'cili benggala': 'Cili Benggala (Capsicum annuum L.) · Purata 106.9g (Fertigasi) · Ref: MARDI (2024)'
};

window.openEstimateModal = function () {
  const overlay = document.getElementById('estimateModalOverlay');
  overlay.classList.add('open');

  const varietyLabel = document.getElementById('estimateVarietyLabel');
  if (selectedCycleData?.variety) {
    varietyLabel.textContent = selectedCycleData.variety + ' · detected from cycle';
  } else {
    varietyLabel.textContent = 'No cycle selected — please select a cycle first';
  }

  const existingWeight = document.getElementById('reportWeight').value;
  const weightInput = document.getElementById('estimateWeightInput');

  if (existingWeight) {
    weightInput.value = existingWeight;
    calculateEstimate();
  } else {
    weightInput.value = '';
    document.getElementById('estimateResult').textContent = '—';
    document.getElementById('estimateRefNote').textContent = 'Enter weight above to see estimate.';
    currentEstimate = null;
  }
};

window.closeEstimateModal = function () {
  document.getElementById('estimateModalOverlay').classList.remove('open');
  document.getElementById('estimateWeightInput').value = '';
  document.getElementById('estimateResult').textContent = '—';
  document.getElementById('estimateRefNote').textContent = 'Select a cycle and enter weight to see estimate.';
  currentEstimate = null;
};

window.calculateEstimate = function () {
  const weightKg = parseFloat(document.getElementById('estimateWeightInput').value);
  const rawVariety = (selectedCycleData?.variety || '').toLowerCase().trim();
  const avgWeightG = CHILI_AVG_WEIGHT_G[rawVariety];

  if (!weightKg || weightKg <= 0) {
    document.getElementById('estimateResult').textContent = '—';
    document.getElementById('estimateRefNote').textContent = 'Enter weight above to see estimate.';
    currentEstimate = null;
    return;
  }

  if (!avgWeightG) {
    document.getElementById('estimateResult').textContent = '—';
    // [CHANGED] removed "or plot" from message
    document.getElementById('estimateRefNote').textContent =
      'Could not detect chili variety. Please select a cycle first.';
    currentEstimate = null;
    return;
  }

  const estimated = Math.round((weightKg * 1000) / avgWeightG);
  currentEstimate = estimated;

  document.getElementById('estimateResult').textContent = estimated.toLocaleString();
  document.getElementById('estimateRefNote').textContent =
    (CHILI_REF_LABEL[rawVariety] || '')
};

window.useEstimate = function () {
  if (!currentEstimate) {
    window.showToast('⚠️', 'No Estimate', 'Please enter a weight first.');
    return;
  }
  document.getElementById('reportCount').value = currentEstimate;
  window.closeEstimateModal();
  window.showToast('✅', 'Estimate Applied', `${currentEstimate.toLocaleString()} chilies filled in — you can still edit it.`);
};


// ============================================
// DOWNLOAD SINGLE HARVEST PDF [CHANGED]
// ============================================
window.downloadReportPDF = function () {
  if (!selectedReportId) return;

  const title = document.getElementById('reportModalTitle').textContent;
  const date = document.getElementById('reportModalDate').textContent;
  const percent = document.getElementById('reportModalPercent').textContent;
  const days = document.getElementById('reportModalDays').textContent;
  const weight = document.getElementById('reportModalWeight').textContent;
  const count = document.getElementById('reportModalCount').textContent;
  const quality = document.getElementById('reportModalQuality').textContent;

  // [CHANGED] Get raw issues array for proper bullet formatting
  // We need to re-fetch from the report data since modal shows badges
  
  getDoc(doc(db, 'users', currentUser.uid, 'reports', selectedReportId)).then(reportDoc => {
    const reportData = reportDoc.data();
    const issues = reportData?.issues || [];

    buildSingleReportPDF(title, date, percent, days, weight, count, quality, issues);
  }).catch(() => {
    // Fallback if fetch fails
    buildSingleReportPDF(title, date, percent, days, weight, count, quality, []);
  });
};

function buildSingleReportPDF(title, date, percent, days, weight, count, quality, issues) {
  // [CHANGED] Calculate average fruit weight
  const weightNum = parseFloat(weight);
  const countNum = parseInt(count);
  const avgFruitWeight = (weightNum && countNum) ? ((weightNum * 1000) / countNum).toFixed(1) : '—';

  // [CHANGED] Format issues as proper bullet list
  let issueHTML = '';
  if (!issues || issues.length === 0) {
    issueHTML = '<p style="opacity:.6; font-style:italic;">No issues reported</p>';
  } else {
    issueHTML = '<ul style="margin:0; padding-left:20px; list-style:disc;">' +
      issues.map(i => `<li style="margin-bottom:6px; text-transform:capitalize;">${i}</li>`).join('') +
      '</ul>';
  }

  const logoImg = new Image();
  logoImg.crossOrigin = 'anonymous';
  logoImg.src = '../assets/images/chili_logo3.png';

  logoImg.onload = function () {
    const canvas = document.createElement('canvas');
    canvas.width = 60;
    canvas.height = 60;
    canvas.getContext('2d').drawImage(logoImg, 0, 0, 60, 60);
    printSingleReport(canvas.toDataURL('image/png'));
  };

  logoImg.onerror = function () {
    printSingleReport(null);
  };

  function printSingleReport(base64Logo) {
    const logoHTML = base64Logo
      ? `<img src="${base64Logo}" style="width:36px;height:36px;vertical-align:middle;margin-right:10px;border-radius:50%;">`
      : '🌶️';

    const generatedDate = new Date().toLocaleDateString('en-MY', {
      day: 'numeric', month: 'long', year: 'numeric'
    });

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>My Harvest Record — ${title}</title>
        <style>
          * { margin:0; padding:0; box-sizing:border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            color: #333;
            padding: 40px;
            line-height: 1.6;
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 3px solid #e74c3c;
            padding-bottom: 16px;
            margin-bottom: 24px;
          }
          .brand {
            display: flex;
            align-items: center;
            font-size: 20px;
            font-weight: 700;
            color: #e74c3c;
          }
          .brand span {
            font-size: 12px;
            font-weight: 400;
            color: #888;
            display: block;
            margin-top: 1px;
          }
          .brand-text { display: flex; flex-direction: column; }
          .report-date { font-size: 12px; color: #888; text-align: right; }
          .quality-banner {
            background: #fdecea;
            border-left: 5px solid #e74c3c;
            border-radius: 8px;
            padding: 16px 20px;
            margin-bottom: 24px;
            display: flex;
            align-items: center;
            justify-content: space-between;
          }
          .qb-title { font-size: 18px; font-weight: 700; color: #e74c3c; }
          .qb-sub { font-size: 12px; color: #888; margin-top: 2px; }
          .qb-pct { font-size: 36px; font-weight: 700; color: #e74c3c; }
          
          /* [CHANGED] Added avg weight highlight box */
          .metric-highlight {
            background: #e74c3c08;
            border: 1px solid #e74c3c20;
            border-radius: 8px;
            padding: 14px;
            margin-bottom: 24px;
            text-align: center;
          }
          .metric-value { font-size: 24px; font-weight: 700; color: #e74c3c; }
          .metric-label { font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; }
          
          .section-title {
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.6px;
            color: #e74c3c;
            margin-bottom: 10px;
          }
          .grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
            margin-bottom: 24px;
          }
          .field {
            background: #f9f9f9;
            border: 1px solid #eee;
            border-radius: 8px;
            padding: 12px 14px;
          }
          .field-label {
            font-size: 11px;
            color: #888;
            margin-bottom: 3px;
            text-transform: uppercase;
            letter-spacing: 0.4px;
          }
          .field-value { font-size: 16px; font-weight: 700; color: #222; }
          
          /* [CHANGED] Updated issues box with proper list styling */
          .issues-box {
            background: #fff8f8;
            border: 1px solid #f5c6c6;
            border-radius: 8px;
            padding: 14px 16px;
            margin-bottom: 24px;
            font-size: 13px;
            color: #444;
          }
          .issues-box ul { margin: 0; }
          .issues-box li { margin-bottom: 4px; }
          
          .footer {
            border-top: 1px solid #eee;
            padding-top: 12px;
            font-size: 11px;
            color: #aaa;
            display: flex;
            justify-content: space-between;
          }
          @media print {
            body { padding: 20px; }
            @page { margin: 1cm; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="brand">
            ${logoHTML}
            <div class="brand-text">
              CiliGuide
              <span>My Harvest Record</span>
            </div>
          </div>
          <div class="report-date">
            Generated: ${generatedDate}
          </div>
        </div>

        <div class="quality-banner">
          <div>
            <div class="qb-title">${title}</div>
            <div class="qb-sub">${date}</div>
          </div>
          <div class="qb-pct">${percent}</div>
        </div>

        <!-- [CHANGED] Added average fruit weight -->
        <div class="metric-highlight">
          <div class="metric-value">${avgFruitWeight}g</div>
          <div class="metric-label">Average Fruit Weight</div>
        </div>

        <p class="section-title">Harvest Details</p>
        <div class="grid">
          <div class="field">
            <div class="field-label">Days Grown</div>
            <div class="field-value">${days}</div>
          </div>
          <div class="field">
            <div class="field-label">Total Weight</div>
            <div class="field-value">${weight}</div>
          </div>
          <div class="field">
            <div class="field-label">Number of Chilies</div>
            <div class="field-value">${count}</div>
          </div>
          <div class="field">
            <div class="field-label">Overall Quality</div>
            <div class="field-value">${quality}</div>
          </div>
        </div>

        <p class="section-title">Issues Encountered</p>
        <!-- [CHANGED] Uses proper bullet list HTML -->
        <div class="issues-box">${issueHTML}</div>

        <div class="footer">
          <span>CiliGuide — Your Chili Growing Companion</span>
          <span>Generated automatically · Do not alter</span>
        </div>
      </body>
      </html>
    `;

    const popup = window.open('', '_blank', 'width=800,height=600');

    if (!popup) {
      window.showToast('⚠️', 'Blocked', 'Please allow popups for this site to download PDF.');
      return;
    }

    popup.document.write(html);
    popup.document.close();

    popup.onload = function () {
      setTimeout(() => {
        popup.print();
        popup.close();
      }, 300);
    };
  }
}


// ============================================
// HOME GROWER SUMMARY PDF [NEW]
// ============================================
window.downloadHomeGrowerSummaryPDF = async function () {
  if (!currentUser) {
    window.showToast('⚠️', 'Sign In Required', 'Please log in first');
    return;
  }

  // Read from permanent journey store — NOT affected by report deletion
  const journeySnap = await getDocs(
    collection(db, 'users', currentUser.uid, 'journeyLog')
  );
  const reportsSnap = await getDocs(
    collection(db, 'users', currentUser.uid, 'reports')
  );

  // Merge both — journey log preserves deleted records
  const journeyRecords = [];
  journeySnap.forEach(d => journeyRecords.push({ ...d.data(), _src: 'journey' }));

  const activeReports = [];
  reportsSnap.forEach(d => activeReports.push({ id: d.id, ...d.data() }));

  // Combine, deduplicate by cycleId
  const seen = new Set();
  const allRecords = [];
  [...activeReports, ...journeyRecords].forEach(r => {
    const key = r.cycleId || r.date || Math.random();
    if (!seen.has(key)) {
      seen.add(key);
      allRecords.push(r);
    }
  });

  if (allRecords.length === 0) {
    window.showToast('ℹ️', 'No Records Yet', 'Log your first harvest to see your journey!');
    return;
  }

  // ── Date filter from UI ──
  const fromInput = document.getElementById('journeyDateFrom')?.value;
  const toInput   = document.getElementById('journeyDateTo')?.value;
  const fromDate  = fromInput ? new Date(fromInput) : null;
  const toDate    = toInput   ? new Date(toInput + 'T23:59:59') : null;

  const filteredRecords = allRecords.filter(r => {
    if (!r.date) return true;
    const d = new Date(r.date);
    if (fromDate && d < fromDate) return false;
    if (toDate   && d > toDate)   return false;
    return true;
  });

  if (filteredRecords.length === 0) {
    const msg = (fromInput || toInput)
      ? 'No records found in the selected date range.'
      : 'Log your first harvest to see your journey!';
    window.showToast('ℹ️', 'No Records', msg);
    return;
  }

  allRecords.length = 0;
  filteredRecords.forEach(r => allRecords.push(r));

  allRecords.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  const total = allRecords.length;
  const totalWeight = allRecords.reduce((s, r) => s + (r.weight || 0), 0);
  const totalChilies = allRecords.reduce((s, r) => s + (r.count || 0), 0);
  const avgQuality = Math.round(allRecords.reduce((s, r) => s + (r.qualityPercent || 0), 0) / total);
  const avgDays = Math.round(allRecords.reduce((s, r) => s + (r.days || 0), 0) / total);

  // Variety breakdown
  const varietyStats = {};
  allRecords.forEach(r => {
    const v = r.variety || 'Unknown';
    if (!varietyStats[v]) varietyStats[v] = { harvests: 0, weight: 0, bestQuality: 0 };
    varietyStats[v].harvests++;
    varietyStats[v].weight += r.weight || 0;
    varietyStats[v].bestQuality = Math.max(varietyStats[v].bestQuality, r.qualityPercent || 0);
  });

  // Issue frequency
  const issueMap = {};
  allRecords.forEach(r => {
    (r.issues || []).forEach(i => { issueMap[i] = (issueMap[i] || 0) + 1; });
  });
  const topIssues = Object.entries(issueMap).sort((a, b) => b[1] - a[1]).slice(0, 3);

  const issueTips = {
    pests: 'Check undersides of leaves weekly. Neem oil spray helps prevent recurrence.',
    disease: 'Ensure good airflow between plants. Avoid wetting leaves when watering.',
    overwater: 'Let soil dry 2-3cm deep before next watering.',
    underwater: 'Water in the morning. Mulching helps retain moisture longer.',
    heat: 'Move containers to partial shade during heatwaves above 35°C.',
    cold: 'Bring indoors or use covers when temperature drops below 18°C.',
    nutrient: 'Apply balanced NPK fertilizer every 2 weeks during fruiting stage.',
    growth: 'Prune lower leaves to redirect energy toward fruit production.'
  };

  const first = allRecords[allRecords.length - 1];
  const latest = allRecords[0];
  const improvement = latest.qualityPercent - first.qualityPercent;

  const growerTitle = total >= 5 ? 'Seasoned Grower'
    : total >= 3 ? 'Dedicated Grower'
      : 'Growing Enthusiast';

  const growerMsg = total >= 5
    ? 'You have built solid growing experience. Your consistency shows in the results.'
    : total >= 3
      ? 'You are developing a strong understanding of your plants. Keep going.'
      : 'Every expert started with a single plant. You are building good habits.';

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
    buildJourneyPDF(c.toDataURL('image/png'));
  };
  logoImg.onerror = () => buildJourneyPDF(null);

  function buildJourneyPDF(base64Logo) {
    const logoHTML = base64Logo
      ? `<img src="${base64Logo}" style="width:34px;height:34px;vertical-align:middle;margin-right:10px;border-radius:50%;">`
      : '';

    // Recent harvest rows — clean table style
    const recentRows = allRecords.slice(0, 5).map((r, i) => {
      const color = getQualityColor(r.qualityLabel || 'fair');
      return `
        <tr style="border-bottom:1px solid #f0f0f0;">
          <td style="padding:10px 8px;font-size:13px;color:#333;font-weight:600;">
            ${r.variety || '—'}
          </td>
          <td style="padding:10px 8px;font-size:12px;color:#888;">${r.date || '—'}</td>
          <td style="padding:10px 8px;font-size:12px;color:#333;">${r.weight || 0} kg</td>
          <td style="padding:10px 8px;font-size:12px;color:#333;">${r.count || 0}</td>
          <td style="padding:10px 8px;font-size:12px;color:#333;">${r.days || 0} days</td>
          <td style="padding:10px 8px;">
            <span style="font-size:11px;font-weight:700;color:${color};
                         background:${color}15;padding:3px 10px;border-radius:12px;">
              ${(r.qualityLabel || 'fair').toUpperCase()}
            </span>
          </td>
        </tr>`;
    }).join('');

    // Variety rows
    const varietyRows = Object.entries(varietyStats).map(([name, stats]) => `
      <tr style="border-bottom:1px solid #f0f0f0;">
        <td style="padding:10px 8px;font-size:13px;font-weight:600;color:#333;">${name}</td>
        <td style="padding:10px 8px;font-size:12px;color:#333;text-align:center;">${stats.harvests}</td>
        <td style="padding:10px 8px;font-size:12px;color:#333;text-align:center;">${stats.weight.toFixed(1)} kg</td>
        <td style="padding:10px 8px;font-size:12px;color:#333;text-align:center;">${stats.bestQuality}%</td>
      </tr>`).join('');

    // Issue rows
    const issueRows = topIssues.length > 0
      ? topIssues.map(([issue, count]) => `
          <tr style="border-bottom:1px solid #f0f0f0;">
            <td style="padding:10px 8px;font-size:13px;font-weight:600;color:#333;text-transform:capitalize;">
              ${issue}
            </td>
            <td style="padding:10px 8px;font-size:12px;color:#888;text-align:center;">${count}x</td>
            <td style="padding:10px 8px;font-size:12px;color:#555;line-height:1.5;">
              ${issueTips[issue] || 'Monitor closely and adjust care routine.'}
            </td>
          </tr>`).join('')
      : `<tr><td colspan="3" style="padding:14px 8px;font-size:13px;color:#888;text-align:center;">
             No issues recorded across all cycles.
         </td></tr>`;

    const html = `
      <!DOCTYPE html><html>
      <head>
        <meta charset="UTF-8">
        <title>My Growing Journey — CiliGuide</title>
        <style>
          *{margin:0;padding:0;box-sizing:border-box;}
          body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
               color:#333;padding:40px;line-height:1.6;background:#fff;}
          .header{display:flex;justify-content:space-between;align-items:center;
                  border-bottom:3px solid #e74c3c;padding-bottom:16px;margin-bottom:28px;}
          .brand{display:flex;align-items:center;font-size:18px;font-weight:700;color:#e74c3c;}
          .brand-sub{font-size:11px;font-weight:400;color:#888;display:block;margin-top:1px;}
          .brand-text{display:flex;flex-direction:column;}
          .meta{font-size:11px;color:#888;text-align:right;line-height:1.7;}

          .summary-box{background:#fafafa;border:1px solid #eee;border-radius:10px;
                       padding:20px 24px;margin-bottom:24px;}
          .summary-title{font-size:12px;color:#888;text-transform:uppercase;
                         letter-spacing:.6px;margin-bottom:14px;font-weight:700;}
          .summary-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:0;}
          .summary-stat{text-align:center;padding:0 12px;border-right:1px solid #eee;}
          .summary-stat:last-child{border-right:none;}
          .ss-val{font-size:22px;font-weight:700;color:#333;margin-bottom:2px;}
          .ss-lbl{font-size:10px;color:#888;text-transform:uppercase;letter-spacing:.4px;}

          .progress-box{background:#fafafa;border:1px solid #eee;border-radius:10px;
                        padding:16px 24px;margin-bottom:24px;}
          .pb-row{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;}
          .pb-label{font-size:12px;color:#888;}
          .pb-pct{font-size:14px;font-weight:700;color:#e74c3c;}
          .pb-track{height:8px;background:#e8e8e8;border-radius:99px;overflow:hidden;}
          .pb-fill{height:100%;border-radius:99px;
                   background:linear-gradient(90deg,#e74c3c,#f39c12,#27ae60);}
          .pb-improve{margin-top:10px;font-size:12px;color:#888;text-align:center;}
          .pb-improve strong{color:${improvement >= 0 ? '#27ae60' : '#e74c3c'};}

          .section{margin-bottom:24px;}
          .section-title{font-size:11px;font-weight:700;text-transform:uppercase;
                         letter-spacing:.6px;color:#e74c3c;margin-bottom:12px;
                         padding-bottom:6px;border-bottom:1px solid #f0f0f0;}

          table{width:100%;border-collapse:collapse;}
          th{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;
             color:#888;padding:8px;text-align:left;background:#fafafa;
             border-bottom:1.5px solid #eee;}

          .grower-box{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;
                      padding:18px 20px;margin-bottom:24px;text-align:center;}
          .grower-title{font-size:15px;font-weight:700;color:#166534;margin-bottom:4px;}
          .grower-msg{font-size:12px;color:#444;line-height:1.6;}

          .footer{border-top:1px solid #eee;padding-top:12px;margin-top:8px;
                  font-size:10px;color:#bbb;display:flex;justify-content:space-between;}
          @media print{body{padding:24px;}@page{margin:1cm;}}
        </style>
      </head>
      <body>

        <div class="header">
          <div class="brand">
            ${logoHTML}
            <div class="brand-text">
              CiliGuide
              <span class="brand-sub">My Growing Journey</span>
            </div>
          </div>
          <div class="meta">
            Generated: ${generatedDate}<br>
            ${total} harvest${total !== 1 ? 's' : ''} recorded
          </div>
        </div>

        <!-- Summary stats -->
        <div class="summary-box">
          <div class="summary-title">Overall Summary</div>
          <div class="summary-stats">
            <div class="summary-stat">
              <div class="ss-val">${total}</div>
              <div class="ss-lbl">Harvests</div>
            </div>
            <div class="summary-stat">
              <div class="ss-val">${totalWeight.toFixed(1)}kg</div>
              <div class="ss-lbl">Total Weight</div>
            </div>
            <div class="summary-stat">
              <div class="ss-val">${totalChilies.toLocaleString()}</div>
              <div class="ss-lbl">Chilies Grown</div>
            </div>
            <div class="summary-stat">
              <div class="ss-val">${avgDays}d</div>
              <div class="ss-lbl">Avg Days/Cycle</div>
            </div>
          </div>
        </div>

        <!-- Quality progress bar -->
        <div class="progress-box">
          <div class="pb-row">
            <span class="pb-label">Average Harvest Quality</span>
            <span class="pb-pct">${avgQuality}%</span>
          </div>
          <div class="pb-track">
            <div class="pb-fill" style="width:${avgQuality}%;"></div>
          </div>
          ${improvement !== 0 ? `
          <div class="pb-improve">
            Quality has <strong>${improvement > 0 ? 'improved' : 'decreased'} by ${Math.abs(improvement)}%</strong>
            from your first to latest harvest.
          </div>` : ''}
        </div>

        <!-- Recent harvests -->
        <div class="section">
          <div class="section-title">Recent Harvests (last ${Math.min(total, 5)})</div>
          <table>
            <thead>
              <tr>
                <th>Variety</th>
                <th>Date</th>
                <th>Weight</th>
                <th>Chilies</th>
                <th>Duration</th>
                <th>Quality</th>
              </tr>
            </thead>
            <tbody>${recentRows}</tbody>
          </table>
        </div>

        <!-- Variety breakdown -->
        <div class="section">
          <div class="section-title">Varieties Grown</div>
          <table>
            <thead>
              <tr>
                <th>Variety</th>
                <th style="text-align:center;">Cycles</th>
                <th style="text-align:center;">Total Weight</th>
                <th style="text-align:center;">Best Quality</th>
              </tr>
            </thead>
            <tbody>${varietyRows}</tbody>
          </table>
        </div>

        <!-- Issue insights -->
        <div class="section">
          <div class="section-title">Common Issues and Tips</div>
          <table>
            <thead>
              <tr>
                <th>Issue</th>
                <th style="text-align:center;">Times</th>
                <th>Tip</th>
              </tr>
            </thead>
            <tbody>${issueRows}</tbody>
          </table>
        </div>

        <!-- Grower badge -->
        <div class="grower-box">
          <div class="grower-title">${growerTitle}</div>
          <div class="grower-msg">${growerMsg}</div>
        </div>

        <div class="footer">
          <span>CiliGuide — Smart Chili Growing Companion</span>
          <span>Generated automatically. Do not alter.</span>
        </div>

      </body></html>`;

    const popup = window.open('', '_blank', 'width=850,height=750');
    if (!popup) {
      window.showToast('⚠️', 'Popup Blocked', 'Please allow popups to download');
      return;
    }
    popup.document.write(html);
    popup.document.close();
    popup.onload = () => setTimeout(() => { popup.print(); popup.close(); }, 400);
  }
};

// ============================================
// JOURNEY DATE FILTER
// ============================================
window.applyJourneyFilter = function () {
  const from   = document.getElementById('journeyDateFrom')?.value;
  const to     = document.getElementById('journeyDateTo')?.value;
  const tagEl  = document.getElementById('journeyFilterTag');
  const textEl = document.getElementById('journeyFilterText');

  if (from || to) {
    const label = from && to ? `Filtered: ${from} to ${to}`
                : from       ? `From: ${from} onwards`
                :              `Up to: ${to}`;
    if (textEl) textEl.textContent = label;
    if (tagEl)  tagEl.style.display = 'block';
  } else {
    if (tagEl) tagEl.style.display = 'none';
  }

  // Re-render cards with new filter
  currentReportsPage = 1;
  renderReportCards();
};

window.clearJourneyFilter = function () {
  const fromEl = document.getElementById('journeyDateFrom');
  const toEl   = document.getElementById('journeyDateTo');
  const tagEl  = document.getElementById('journeyFilterTag');
  if (fromEl) fromEl.value = '';
  if (toEl)   toEl.value   = '';
  if (tagEl)  tagEl.style.display = 'none';

  // Re-render cards without filter
  currentReportsPage = 1;
  renderReportCards();
};