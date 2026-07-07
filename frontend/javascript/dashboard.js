// FIREBASE IMPORTS
import { db, auth } from './firebase-config.js';

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import {
  doc,
  getDoc,
  updateDoc,
  collection,
  getDocs,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// MODULE IMPORTS
import { initProfilePage, loadUserProfile } from './profile.js';
import { initHarvestPage } from './Harvest.js';
import { initHistoryPage, loadActivityHistory } from './history.js';
import { initCommunityNotifications, hideCommunityBadge } from './notification.js';
import { loadComparison } from './comparison.js';
import { initCycleReport } from './cycleReport.js';
import { initAnalytics } from './analytics.js';
import { loadCycleOptions } from './report.js';
import { initPersonalBest } from './personalBest.js';

// ── NOTIFICATION SOUND ────────────────────────────────────────
function playNotifSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const time = ctx.currentTime;
    const notes = [523, 659, 784];
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

// STATE
let currentUser = null;
let harvestInitialized = false;

// NAVIGATION
window.navigate = function (page, clickedBtn) {
  document.querySelectorAll('.sb-item').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.sb-subitem').forEach(b => b.classList.remove('active'));

  if (clickedBtn) clickedBtn.classList.add('active');

  const submenu = document.getElementById('harvestSubMenu');
  const harvestBtn = document.getElementById('harvestToggle');

  if (clickedBtn && clickedBtn.classList.contains('sb-subitem')) {
    submenu?.classList.add('show');
    harvestBtn?.classList.add('expanded');
  } else {
    submenu?.classList.remove('show');
    harvestBtn?.classList.remove('expanded');
  }

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('sec-' + page)?.classList.add('active');

  if (currentUser) {
    switch (page) {
      case 'overview':
        loadOverviewData(currentUser.uid);
        break;
      case 'profile':
        loadUserProfile(currentUser.uid);
        break;
      case 'history':
        loadActivityHistory(currentUser.uid);
        break;
      case 'harvest':
      case 'harvest-prediction':
      case 'harvest-report':
        if (!harvestInitialized && typeof initHarvestPage === 'function') {
          initHarvestPage(currentUser.uid);
          harvestInitialized = true;
        }
        loadComparison(currentUser.uid);
        break;
      case 'community':
        hideCommunityBadge();
        break;
    }
  }

  closeSidebar();
  window.scrollTo(0, 0);
};

// SUBMENU TOGGLE
window.toggleHarvestSubMenu = function (btn) {
  const submenu = document.getElementById('harvestSubMenu');
  submenu?.classList.toggle('show');
  btn?.classList.toggle('expanded');
};

// SIDEBAR — MOBILE
const hamburger = document.getElementById('hamburgerBtn');
const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('sidebarOverlay');

hamburger?.addEventListener('click', toggleSidebar);
overlay?.addEventListener('click', closeSidebar);

function toggleSidebar() {
  sidebar?.classList.toggle('open');
  overlay?.classList.toggle('open');
}

function closeSidebar() {
  sidebar?.classList.remove('open');
  overlay?.classList.remove('open');
}

// TOAST
let toastTimer;
window.showToast = function (icon, title, msg) {
  clearTimeout(toastTimer);
  document.getElementById('toastIcon').textContent = icon;
  document.getElementById('toastTitle').textContent = title;
  document.getElementById('toastMsg').textContent = msg;
  const toast = document.getElementById('toast');
  toast.classList.add('show');
  toastTimer = setTimeout(() => toast.classList.remove('show'), 5000);
};

// AUTH STATE
let isLoggingOut = false;
onAuthStateChanged(auth, async (user) => {
  if (!user && !isLoggingOut) {
    window.location.href = 'login.html';
    return;
  }
  if (!user) return;

  currentUser = user;

  await applyFeatureUnlocks(user.uid);

  updateUserUI(user);
  loadOverviewData(user.uid);
  loadHarvestBanner(user.uid);
  loadRecentActivities(user.uid);
  loadActiveHarvestCard(user.uid);
  initCommunityNotifications(user.uid);
});

function getUserColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(6, '0').slice(0, 6);
}

// ROLE HELPER
function getRoleFromCycles(count) {
  if (count >= 5) return 'advanced_grower';
  if (count >= 2) return 'intermediate_grower';
  return 'beginner_grower';
}

// FEATURE UNLOCKS — uses maxCyclesEver so level never drops
async function applyFeatureUnlocks(userId) {
  try {
    const cyclesSnap = await getDocs(
      collection(db, 'users', userId, 'harvestCycles')
    );
    const currentCount = cyclesSnap.size;

    // Read saved max from user doc
    const userSnap = await getDoc(doc(db, 'users', userId));
    const savedMax = userSnap.exists() ? (userSnap.data()?.maxCyclesEver || 0) : 0;

    // Always use the higher value
    const cycleCount = Math.max(currentCount, savedMax);

    // Save new max if current is higher
    if (currentCount > savedMax) {
      await updateDoc(doc(db, 'users', userId), {
        maxCyclesEver: currentCount
      });
    }

    // Sidebar role badge
    const roleEl = document.querySelector('.sb-role');
    if (roleEl) {
      const role = getRoleFromCycles(cycleCount);
      roleEl.textContent = role === 'advanced_grower' ? 'Experienced Home Grower'
        : role === 'intermediate_grower' ? 'Intermediate Home Grower'
          : 'Beginner Home Grower';
    }

    // Sidebar harvest analysis label
    const sbHarvestAnalysis = document.getElementById('sb-harvest-analysis');
    if (sbHarvestAnalysis) {
      sbHarvestAnalysis.textContent = '📈 Harvest Analysis';
    }

    // Harvest analysis page content
    const smartPlantingSection = document.getElementById('smartPlantingSection');
    const predictionPanel = document.getElementById('predictionPanel');
    if (smartPlantingSection) smartPlantingSection.style.display = cycleCount < 2 ? 'none' : 'block';
    if (predictionPanel) predictionPanel.style.display = cycleCount < 2 ? 'none' : 'grid';

    // Page title & subtitle
    const harvestAnalysisHeader = document.querySelector('#sec-harvest-prediction .page-header h1');
    const harvestAnalysisSub = document.querySelector('#sec-harvest-prediction .page-sub');
    if (harvestAnalysisHeader) {
      harvestAnalysisHeader.textContent = 'Harvest Analysis';
    }
    if (harvestAnalysisSub) {
      harvestAnalysisSub.textContent = 'Understand Malaysian growing seasons and predict your future harvest yield.';
    }

    // Tab unlocks — use cycleCount (never goes down)
    const tabCompare = document.getElementById('htab-compare');
    const tabAnalytics = document.getElementById('htab-analytics');
    if (tabCompare) tabCompare.style.display = cycleCount >= 2 ? 'block' : 'none';
    if (tabAnalytics) tabAnalytics.style.display = cycleCount >= 3 ? 'block' : 'none';
    const tabPersonalBest = document.getElementById('htab-personal-best');
    if (tabPersonalBest) tabPersonalBest.style.display = cycleCount >= 5 ? 'block' : 'none';

    return cycleCount;

  } catch (err) {
    console.warn('applyFeatureUnlocks error:', err);
    return 0;
  }
}

// USER UI
async function updateUserUI(user) {
  try {
    const snap = await getDoc(doc(db, 'users', user.uid));
    const data = snap.exists() ? snap.data() : {};

    const username = data.username || user.displayName || user.email?.split('@')[0] || 'User';
    const firstName = username.split(' ')[0];
    const greeting = getGreeting();

    const avatarEl = document.getElementById('userAvatar');
    if (avatarEl) {
      const userColor = getUserColor(username);
      avatarEl.src = `https://api.dicebear.com/8.x/initials/svg?seed=${encodeURIComponent(username)}&size=128&radius=50&backgroundColor=${userColor}&backgroundType=solid&fontSize=38&fontWeight=600`;

      avatarEl.onerror = () => {
        avatarEl.style.display = 'none';
        const parent = avatarEl.parentElement;
        if (parent && !parent.querySelector('.avatar-fallback')) {
          const fallback = document.createElement('div');
          fallback.className = 'avatar-fallback';
          fallback.style.cssText = `
            width:80px;height:80px;border-radius:50%;
            background:#c0392b;color:#fff;
            display:flex;align-items:center;
            justify-content:center;
            font-size:1.5rem;font-weight:700;
          `;
          fallback.textContent = username.charAt(0).toUpperCase();
          parent.appendChild(fallback);
        }
      };
    }

    const userNameEl = document.getElementById('userName');
    const userEmailEl = document.getElementById('userEmail');
    const welcomeEl = document.getElementById('welcomeName');

    if (userNameEl) userNameEl.textContent = username;
    if (userEmailEl) userEmailEl.textContent = user.email;
    if (welcomeEl) welcomeEl.textContent = `${greeting}, ${firstName}! 👋`;

  } catch (err) {
    console.error('updateUserUI error:', err);
  }
}

// GREETING
function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning';
  if (h < 18) return 'Good Afternoon';
  return 'Good Evening';
}

// DAY CALCULATION
function calculateDaysPassed(plantingDate) {
  const planted = plantingDate?.toDate ? plantingDate.toDate() : new Date(plantingDate);
  const start = new Date(planted); start.setHours(0, 0, 0, 0);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.max(Math.floor((today - start) / 86400000) + 1, 1);
}

// HARVEST BANNER
async function loadHarvestBanner(userId) {
  const banner = document.getElementById('welcomeHarvestText');
  if (!banner) return;

  try {
    const cycleSnap = await getDocs(collection(db, 'users', userId, 'harvestCycles'));
    let activeCycles = [];

    cycleSnap.forEach(docSnap => {
      const d = docSnap.data();
      if (!d.harvestedDate && d.status === 'active') {
        const daysPassed = calculateDaysPassed(d.plantingDate);
        const remaining = d.varietyDays - daysPassed;
        activeCycles.push({ variety: d.variety, daysPassed, remaining });
      }
    });

    if (activeCycles.length === 0) {
      banner.textContent = 'Start a harvest cycle to track your chili growth 🌱';
      return;
    }

    activeCycles.sort((a, b) => a.remaining - b.remaining);
    const soonest = activeCycles[0];
    const days = Math.max(soonest.remaining, 0);

    if (days === 0) {
      banner.textContent = activeCycles.length > 1
        ? `🌶️ Your ${soonest.variety} is ready to harvest! (${activeCycles.length} cycles active)`
        : `🌶️ Your ${soonest.variety} is ready to harvest!`;
    } else if (activeCycles.length === 1) {
      banner.textContent = `Your ${soonest.variety} is on Day ${soonest.daysPassed}. ${days} days until harvest.`;
    } else {
      banner.textContent = `You have ${activeCycles.length} active cycles. Your ${soonest.variety} harvests soonest in ${days} days.`;
    }

  } catch (err) {
    console.error('loadHarvestBanner error:', err);
    banner.textContent = 'Unable to load data.';
  }
}

// OVERVIEW STATS
function loadOverviewData(userId) {
  onSnapshot(collection(db, 'users', userId, 'harvestCycles'), async (snapshot) => {
    let activeCycles = 0, nextHarvest = null, nextVariety = null;
    let currentCount = 0;

    snapshot.forEach(docSnap => {
      const cycle = docSnap.data();
      const daysPassed = calculateDaysPassed(cycle.plantingDate);
      const remaining = cycle.varietyDays - daysPassed;
      currentCount++;

      if (!cycle.harvestedDate && cycle.status === 'active') {
        activeCycles++;
        if (nextHarvest === null || remaining < nextHarvest) {
          nextHarvest = remaining;
          nextVariety = cycle.variety || null;
        }
      }
    });

    // Use maxCyclesEver for unlock display — never drops
    const userSnap = await getDoc(doc(db, 'users', userId));
    const savedMax = userSnap.exists() ? (userSnap.data()?.maxCyclesEver || 0) : 0;
    const cycleCount = Math.max(currentCount, savedMax);

    renderOverviewFeatureUnlock(cycleCount);
    await applyFeatureUnlocks(userId);

    document.getElementById('statActiveCycles').textContent = activeCycles;

    const harvestVal = document.getElementById('statNextHarvest');
    const harvestLabel = document.getElementById('statNextHarvestLabel');

    if (nextHarvest !== null) {
      const days = Math.max(nextHarvest, 0);
      harvestVal.textContent = days === 0 ? '🌶️ Ready!' : days;
      harvestLabel.textContent = activeCycles > 1 && nextVariety
        ? `Days — ${nextVariety} (soonest)`
        : 'Days to Next Harvest';
    } else {
      harvestVal.textContent = '–';
      harvestLabel.textContent = 'Days to Next Harvest';
    }
  }, (err) => {
    console.warn('harvestCycles snapshot error:', err.code);
  });

  onSnapshot(collection(db, 'users', userId, 'history'), (snapshot) => {
    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();
    let count = 0;

    snapshot.forEach(docSnap => {
      const d = docSnap.data();
      if (d.createdAt) {
        const date = d.createdAt.toDate ? d.createdAt.toDate() : new Date(d.createdAt);
        if (date.getMonth() === thisMonth && date.getFullYear() === thisYear) count++;
      }
    });

    document.getElementById('statAIQueries').textContent = count;
  }, (err) => {
    console.warn('history snapshot error:', err.code);
    document.getElementById('statAIQueries').textContent = '0';
  });
}

// RECENT ACTIVITIES
function loadRecentActivities(userId) {
  const container = document.getElementById('recentActivityContainer');
  if (!container) return;

  container.innerHTML = `<div style="padding:20px;text-align:center;color:#777">Loading...</div>`;

  const q = query(
    collection(db, 'users', userId, 'activities'),
    orderBy('timestamp', 'desc'),
    limit(5)
  );

  const showEmpty = () => {
    container.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
                  padding:40px 20px;color:#aaa;gap:8px;">
        <span style="font-size:2rem;">📭</span>
        <p style="font-weight:600;color:#555;margin:0;">No recent activity yet</p>
      </div>`;
  };

  onSnapshot(q, (snapshot) => {
    container.innerHTML = '';
    if (snapshot.empty) { showEmpty(); return; }

    snapshot.forEach(docSnap => {
      const d = docSnap.data();
      const item = document.createElement('div');
      item.className = 'act-item';
      item.innerHTML = `
        <div class="act-dot ${d.color || 'green'}">${d.icon || '📋'}</div>
        <div>
          <strong>${d.title}</strong>
          <span>${d.description}</span>
        </div>`;
      container.appendChild(item);
    });
  }, (err) => {
    console.warn('activities snapshot error:', err.code);
    showEmpty();
  });
}

// ACTIVE HARVEST CARD
function loadActiveHarvestCard(userId) {
  const container = document.getElementById('activeHarvestCard');
  if (!container) return;

  onSnapshot(collection(db, 'users', userId, 'harvestCycles'), (snapshot) => {
    let activeCycle = null;
    snapshot.forEach(docSnap => {
      const d = docSnap.data();
      if (!d.harvestedDate && d.status === 'active') activeCycle = d;
    });

    if (!activeCycle) {
      container.innerHTML = `<div style="text-align:center;padding:40px;color:#777">🌱 No active harvest cycle yet</div>`;
      return;
    }
    renderActiveHarvestUI(container, activeCycle);
  }, (err) => {
    console.warn('activeHarvestCard snapshot error:', err.code);
    container.innerHTML = `<div style="text-align:center;padding:40px;color:#777">🌱 No active harvest cycle yet</div>`;
  });
}

// RENDER HARVEST UI
function renderActiveHarvestUI(container, cycle) {
  const daysPassed = calculateDaysPassed(cycle.plantingDate);
  const totalDays = cycle.varietyDays;
  const progress = Math.min(Math.round((daysPassed / totalDays) * 100), 100);

  const stages = [
    { name: 'Seed', icon: '🌱', limit: 7 },
    { name: 'Sprout', icon: '🪴', limit: 20 },
    { name: 'Grow', icon: '🌿', limit: 45 },
    { name: 'Flower', icon: '🌸', limit: 65 },
    { name: 'Harvest', icon: '🌶️', limit: 999 }
  ];

  let currentStageIndex = stages.length - 1;
  for (let i = 0; i < stages.length; i++) {
    if (daysPassed <= stages[i].limit) { currentStageIndex = i; break; }
  }

  let stageHTML = '<div class="stage-row">';
  stages.forEach((stage, i) => {
    let cls = 'stage-step';
    if (i < currentStageIndex) cls += ' done';
    if (i === currentStageIndex) cls += ' active';
    stageHTML += `
      <div class="${cls}">
        <div class="stage-circle">${stage.icon}</div>
        <span>${stage.name}</span>
      </div>`;
    if (i < stages.length - 1) {
      stageHTML += `<div class="stage-line${i < currentStageIndex ? ' done' : ''}"></div>`;
    }
  });
  stageHTML += '</div>';

  // ── Mini Progress Data ──
  // Fetch maxCyclesEver for accurate level
  getDoc(doc(db, 'users', currentUser.uid)).then(userSnap => {
    const maxCycles = userSnap.exists() ? (userSnap.data()?.maxCyclesEver || 0) : 0;

    // Level calculation
    let currentLevel, nextLevel, levelProgress, remaining, levelColor;

    if (maxCycles >= 5) {
      currentLevel = 'Experienced';
      nextLevel = null;
      levelProgress = 100;
      remaining = 0;
      levelColor = '#1e8449';
    } else if (maxCycles >= 2) {
      currentLevel = 'Intermediate';
      nextLevel = 'Experienced';
      levelProgress = Math.min(((maxCycles - 2) / 3) * 100, 100); // 4→8 is the range
      remaining = Math.max(0, 5 - maxCycles);
      levelColor = '#547792';
    } else {
      currentLevel = 'Beginner';
      nextLevel = 'Intermediate';
      levelProgress = Math.min((maxCycles / 2) * 100, 100); // 0→4 is the range
      remaining = Math.max(0, 2 - maxCycles);
      levelColor = '#FFC570';
    }

    const progressHTML = nextLevel ? `
      <div class="mini-progress">
        <div class="mini-progress-header">
          <span>🏆</span>
          <span>Your Growing Level</span>
        </div>
        <div class="mini-progress-bar">
          <div class="mini-progress-fill" style="width:${levelProgress}%; background: linear-gradient(90deg, ${levelColor}, #ff8a65);"></div>
        </div>
        <div class="mini-progress-meta">
          <span class="mini-progress-current">${currentLevel}</span>
          <span class="mini-progress-next">→ ${nextLevel}</span>
        </div>
        <p class="mini-progress-hint">
          ${remaining === 1
        ? 'Complete 1 more harvest to level up!'
        : `Complete ${remaining} more harvests to reach ${nextLevel}!`}
        </p>
      </div>
    ` : `
      <div class="mini-progress">
        <div class="mini-progress-header">
          <span>🏆</span>
          <span>Your Growing Level</span>
        </div>
        <div class="mini-progress-bar">
          <div class="mini-progress-fill" style="width:100%; background: linear-gradient(90deg, #1e8449, #2ecc71);"></div>
        </div>
        <div class="mini-progress-meta">
          <span class="mini-progress-current" style="color:#1e8449;">${currentLevel}</span>
          <span class="mini-progress-next">Max Level! 🎉</span>
        </div>
        <p class="mini-progress-hint">
          You've mastered growing! Try new varieties or help other growers.
        </p>
        <a href="#" class="mini-progress-link" onclick="navigate('community'); return false;">
          Join Community →
        </a>
      </div>
    `;

    container.innerHTML = `
      <div class="harvest-content">
        <p class="cycle-name">${cycle.variety} – Cycle</p>
        ${stageHTML}
        <div class="prog-meta">
          <strong>Day ${daysPassed} of ~${totalDays}</strong>
          <span>Est. Harvest in ${Math.max(totalDays - daysPassed, 0)} days</span>
        </div>
        <div class="prog-track">
          <div class="prog-fill" style="width:${progress}%"></div>
        </div>
        ${progressHTML}
      </div>
      <button class="btn btn-outline btn-full" onclick="navigate('harvest')">
        Track My Harvest →
      </button>`;
  }).catch(() => {
    // Fallback without progress if fetch fails
    container.innerHTML = `
      <div class="harvest-content">
        <p class="cycle-name">${cycle.variety} – Cycle</p>
        ${stageHTML}
        <div class="prog-meta">
          <strong>Day ${daysPassed} of ~${totalDays}</strong>
          <span>Est. Harvest in ${Math.max(totalDays - daysPassed, 0)} days</span>
        </div>
        <div class="prog-track">
          <div class="prog-fill" style="width:${progress}%"></div>
        </div>
      </div>
      <button class="btn btn-outline btn-full" onclick="navigate('harvest')">
        Track My Harvest →
      </button>`;
  });
}

// FEATURE UNLOCK RENDERER — uses maxCyclesEver so never goes back
function renderOverviewFeatureUnlock(cycleCount) {
  const container = document.getElementById('overviewFeatureUnlock');
  if (!container) return;

  const progressPct = Math.min((cycleCount / 5) * 100, 100);

  const features = [
    {
      name: 'Cycle Tracking',
      unlocked: true,
      icon: '🌱',
      always: true
    },
    {
      name: 'Cycle Report',
      unlocked: true,
      icon: '📋',
      always: true
    },
    {
      name: 'Comparison',
      unlocked: cycleCount >= 2,
      remaining: Math.max(0, 2 - cycleCount),
      icon: cycleCount >= 2 ? '📊' : '🔒'
    },
    {
      name: 'Analytics',
      unlocked: cycleCount >= 3,
      remaining: Math.max(0, 3 - cycleCount),
      icon: cycleCount >= 3 ? '📈' : '🔒'
    }, {

      name: 'Personal Best',
      unlocked: cycleCount >= 5,
      remaining: Math.max(0, 5 - cycleCount),
      icon: cycleCount >= 5 ? '🏆' : '🔒'
    }
  ];

  const displayCount = Math.min(cycleCount, 5); // cap display at 5

  let html = `
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
      <span style="font-size:.72rem;color:var(--muted);font-weight:600;">
          Feature Progress
      </span>
      <span style="font-size:.72rem;font-weight:700;color:var(--red);">
          ${displayCount} / 5 cycles · ${Math.round(progressPct)}%
      </span>
  </div>
    <div class="unlock-progress-bar" style="margin-bottom:16px;">
        <div class="unlock-progress-fill" style="width:${progressPct}%"></div>
    </div>`;

  features.forEach(f => {
    const statusClass = f.unlocked ? 'unlocked' : 'locked';
    const statusText = f.unlocked
      ? 'Unlocked'
      : f.remaining === 1
        ? '1 more cycle to go!'
        : `${f.remaining} more cycles to go!`;

    html += `
      <div class="unlock-item ${statusClass}">
        <div class="unlock-icon">${f.icon}</div>
        <span class="unlock-name">${f.name}</span>
        <span class="unlock-status">${statusText}</span>
      </div>`;
  });

  // Permanent note — outside forEach, shown once at bottom
  html += `
    <div style="font-size:11px;color:var(--muted);margin-top:12px;text-align:center;
                padding:8px;background:var(--bg);border-radius:8px;">
      🔒 Unlocks are permanent — completing or archiving cycles won't reset your level.
    </div>`;

  container.innerHTML = html;
}

// LOGOUT MODAL
window.openLogoutModal = () => document.getElementById('logoutOverlay')?.classList.add('open');
window.closeLogoutModal = () => document.getElementById('logoutOverlay')?.classList.remove('open');

document.getElementById("confirmLogoutBtn")?.addEventListener("click", async () => {
  try {
    isLoggingOut = true;
    const confirmBtn = document.getElementById("confirmLogoutBtn");
    const originalText = confirmBtn.textContent;
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = `<span class="logout-spinner"></span> Logging out...`;


    setTimeout(async () => {
      try {
        await signOut(auth);
        sessionStorage.setItem("logoutSuccess", "true");
        playNotifSound();
        setTimeout(() => {
          window.location.href = "index.html";
        }, 800);
      } catch (signOutError) {
        console.error("SignOut error:", signOutError);
        isLoggingOut = false;
        confirmBtn.disabled = false;
        confirmBtn.textContent = originalText;
        alert("Logout failed. Please try again.");
      }
    }, 1500);

  } catch (error) {
    console.error("Logout error:", error);
    isLoggingOut = false;
    const confirmBtn = document.getElementById("confirmLogoutBtn");
    confirmBtn.disabled = false;
    confirmBtn.textContent = "Yes, Log Out";
    alert("Logout failed. Please try again.");
  }
});

// DOM READY
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("[data-nav]").forEach(btn => {
    btn.addEventListener("click", () => navigate(btn.dataset.nav, btn));
  });

  const harvestBtn = document.getElementById("harvestToggle");
  const submenu = document.getElementById("harvestSubMenu");
  harvestBtn?.addEventListener("click", () => {
    submenu.classList.toggle("show");
    harvestBtn.classList.toggle("expanded");
  });

  document.querySelectorAll(".sb-subitem").forEach(btn => {
    btn.addEventListener("click", () => navigate(btn.dataset.nav, btn));
  });

  initProfilePage();
  initHistoryPage();
});

// HARVEST TAB SWITCHER
window.switchHarvestTab = function (tab) {
  document.querySelectorAll('.harvest-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.harvest-tab-content').forEach(c => c.style.display = 'none');

  document.getElementById('htab-' + tab)?.classList.add('active');
  document.getElementById('htab-content-' + tab).style.display = 'block';

  const user = auth.currentUser;
  if (!user) return;

  if (tab === 'compare') loadComparison(user.uid);
  if (tab === 'report') {
    getDocs(collection(db, 'users', user.uid, 'harvestCycles')).then(async snap => {
      const currentCount = snap.size;
      const userSnap = await getDoc(doc(db, 'users', user.uid));
      const savedMax = userSnap.exists() ? (userSnap.data()?.maxCyclesEver || 0) : 0;
      const cycleCount = Math.max(currentCount, savedMax);
      const role = getRoleFromCycles(cycleCount);
      initCycleReport(user.uid, role);
    });
  }
  if (tab === 'analytics') initAnalytics(user.uid);
  if (tab === 'personal-best') initPersonalBest(user.uid);
};