import { auth, db } from './firebase-config.js';
import {
  onAuthStateChanged,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  deleteUser
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  collection,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";


function getUserColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(6, '0').slice(0, 6);
}

// AVATAR
function setUserAvatar(userId, userName) {
  const name = userName
    || document.getElementById('profileName')?.textContent
    || 'User';

  const userColor = getUserColor(name);
  const avatarUrl = `https://api.dicebear.com/8.x/initials/svg?seed=${encodeURIComponent(name)}&size=128&radius=50&backgroundColor=${userColor}&backgroundType=solid&fontSize=38&fontWeight=600`;

  const ids = ['userAvatar', 'profileAvatar'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.src = avatarUrl;
    el.onerror = () => {
      el.style.display = 'none';
      const parent = el.parentElement;
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
        fallback.textContent = name.charAt(0).toUpperCase();
        parent.appendChild(fallback);
      }
    };
  });
}

// ROLE HELPERS
function updateRoleLabel(role) {
  const el = document.querySelector('.sb-role');
  if (!el) return;
  el.textContent = getRoleLabel(role);
}

function getRoleFromCycles(count) {
  if (count >= 5) return 'advanced_grower';
  if (count >= 2) return 'intermediate_grower';
  return 'beginner_grower';
}

function getRoleLabel(role) {
  const map = {
    beginner_grower:     'Beginner Home Grower',
    intermediate_grower: 'Intermediate Home Grower',
    advanced_grower:     'Experienced Home Grower',
  };
  return map[role] || 'Beginner Home Grower';
}

// FEATURE UNLOCK STATUS
function renderFeatureUnlockStatus(cycleCount) {
  const container = document.getElementById('featureUnlockStatus');
  if (!container) return;

  const features = [
    { name: 'Cycle Tracking', unlocked: true,             always: true },
    { name: 'Cycle Report',   unlocked: true,             always: true },
    { name: 'Comparison',     unlocked: cycleCount >= 2,  required: 2, remaining: Math.max(0, 2 - cycleCount) },
    { name: 'Analytics',      unlocked: cycleCount >= 3,  required: 3, remaining: Math.max(0, 3 - cycleCount) }
  ];

  let html = `<div class="unlock-header">📊 Features unlock as you grow</div>`;

  features.forEach(f => {
    const icon        = f.unlocked ? '✅' : '🔒';
    const statusClass = f.unlocked ? 'unlocked' : 'locked';
    let statusText;
    if (f.always)        statusText = 'Active';
    else if (f.unlocked) statusText = 'Unlocked!';
    else statusText = f.remaining === 1
        ? `Unlocks at ${f.required} cycles (${f.remaining} more to go!)`
        : `Unlocks at ${f.required} cycles`;

    html += `
      <div class="unlock-item ${statusClass}">
        <span class="unlock-icon">${icon}</span>
        <span class="unlock-name">${f.name}</span>
        <span class="unlock-status">${statusText}</span>
      </div>`;
  });

  html += `
    <div style="font-size:11px;color:var(--muted);margin-top:10px;text-align:center;
                padding:8px;background:var(--bg);border-radius:8px;">
      🔒 Unlocks are permanent — completing or archiving cycles won't reset your level.
    </div>`;

  container.innerHTML = html;
}

// ROLE-BASED UI
export function applyRoleBasedUI(role) {
  const isBeginner     = role === 'beginner_grower';
  const isIntermediate = role === 'intermediate_grower';
  const isExperienced  = role === 'advanced_grower';

  // ── Sidebar label — all levels show Harvest Analysis ──
  const sbHarvestAnalysis = document.getElementById('sb-harvest-analysis');
  if (sbHarvestAnalysis) {
    sbHarvestAnalysis.textContent = '📈 Harvest Analysis';
  }

  // ── Page title & subtitle — all levels see Harvest Analysis ──
  const harvestAnalysisHeader = document.querySelector('#sec-harvest-prediction .page-header h1');
  const harvestAnalysisSub    = document.querySelector('#sec-harvest-prediction .page-sub');
  if (harvestAnalysisHeader) {
    harvestAnalysisHeader.textContent = 'Harvest Analysis';
  }
  if (harvestAnalysisSub) {
    harvestAnalysisSub.textContent = 'Understand Malaysian growing seasons and predict your future harvest yield.';
  }

  // ── Smart Planting Guide — only for Intermediate and above ──
  const smartPlantingSection = document.getElementById('smartPlantingSection');
  const predictionPanel      = document.getElementById('predictionPanel');
  if (smartPlantingSection) {
    smartPlantingSection.style.display = isBeginner ? 'none' : 'block';
  }
  if (predictionPanel) {
    predictionPanel.style.display = isBeginner ? 'none' : 'grid';
  }
}

// LOAD USER PROFILE
export async function loadUserProfile(userId) {
  try {
    if (!userId) { console.warn("loadUserProfile: no userId"); return; }

    const docRef  = doc(db, "users", userId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      await createDefaultProfile(userId);
      return loadUserProfile(userId);
    }

    const data = docSnap.data(); // ✅ use 'data' not 'userData'
    const user = auth.currentUser;
    if (!user) { console.warn("loadUserProfile: no auth user"); return; }

    const setValue = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.value = value ?? '';
    };

    const setText = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.textContent = value ?? '';
    };

    setValue("inputUsername", data.username);
    setValue("inputEmail",    user.email);
    setValue("inputPhone",    data.phone);
    setValue("inputLocation", data.location);
    setValue("bioText",       data.bio);

    // ── Get cycle count using maxCyclesEver (never drops) ──
    const cyclesSnap   = await getDocs(collection(db, 'users', userId, 'harvestCycles'));
    const currentCount = cyclesSnap.size;
    const savedMax     = data?.maxCyclesEver || 0; 
    const cycleCount   = Math.max(currentCount, savedMax);

    // Auto-calculate level from cycle count
    const autoRole    = getRoleFromCycles(cycleCount);
    const displayRole = getRoleLabel(autoRole);

    // Update experience level display
    const displayRoleEl = document.getElementById('displayRole');
    const roleReasonEl  = document.getElementById('roleReason');
    if (displayRoleEl) displayRoleEl.textContent = displayRole;
    if (roleReasonEl) {
      const reasons = {
        beginner_grower:     cycleCount === 0
          ? 'Start your first cycle to level up!'
          : `${cycleCount} cycle${cycleCount !== 1 ? 's' : ''} started — 2 needed to unlock Comparison`,
        intermediate_grower: `${cycleCount} cycles started — ${Math.max(0, 5 - cycleCount)} more to reach Experienced`,
        advanced_grower:     `${cycleCount} cycles started — Experienced level reached!`
      };
      roleReasonEl.textContent = reasons[autoRole];
    }

    // Render feature unlock list
    renderFeatureUnlockStatus(cycleCount);

    // Sync hidden role input and apply UI
    setValue("inputRole", autoRole);
    updateRoleLabel(autoRole);
    applyRoleBasedUI(autoRole);

    // Profile header
    const username = data.username || 'User';
    setText("profileName",  username);
    setText("profileEmail", user.email);
    setUserAvatar(userId, username); // ✅ pass username so avatar loads correctly

    if (data.createdAt) {
      const joinDate = data.createdAt.toDate
        ? data.createdAt.toDate()
        : new Date(data.createdAt);
      if (!isNaN(joinDate)) {
        setText("profileJoined", `Member since ${joinDate.getFullYear()}`);
      }
    }

    updateBioCount();

  } catch (error) {
    console.error("Profile load error:", error);
  }
}

// CREATE DEFAULT PROFILE
async function createDefaultProfile(userId) {
  const user = auth.currentUser;
  if (!user) return;
  await setDoc(doc(db, "users", userId), {
    username:      user.displayName || user.email.split("@")[0] || "User",
    email:         user.email,
    phone:         "",
    location:      "",
    bio:           "",
    role:          "beginner_grower",
    maxCyclesEver: 0,
    createdAt:     serverTimestamp(),
    updatedAt:     serverTimestamp()
  });
}

// SAVE PROFILE
async function saveProfileChanges() {
  const user = auth.currentUser;
  if (!user) return;

  const username = document.getElementById("inputUsername")?.value.trim();
  const phone    = document.getElementById("inputPhone")?.value.trim();
  const location = document.getElementById("inputLocation")?.value.trim();
  const bio      = document.getElementById("bioText")?.value.trim();

  if (!username) {
    window.showToast("⚠️", "Validation Error", "Username is required.");
    return;
  }

  // Get cycle count with maxCyclesEver
  const cyclesSnap   = await getDocs(collection(db, 'users', user.uid, 'harvestCycles'));
  const currentCount = cyclesSnap.size;
  const userSnap     = await getDoc(doc(db, 'users', user.uid));
  const savedMax     = userSnap.exists() ? (userSnap.data()?.maxCyclesEver || 0) : 0;
  const cycleCount   = Math.max(currentCount, savedMax);
  const autoRole     = getRoleFromCycles(cycleCount);

  try {
    await updateDoc(doc(db, "users", user.uid), {
      username,
      phone,
      location,
      bio,
      role:          autoRole,  // always save auto role
      maxCyclesEver: cycleCount,
      updatedAt:     serverTimestamp()
    });

    updateRoleLabel(autoRole);
    applyRoleBasedUI(autoRole);
    renderFeatureUnlockStatus(cycleCount);

    await loadUserProfile(user.uid);
    window.showToast("✅", "Profile Saved", "Your profile has been updated.");

  } catch (error) {
    console.error("Save profile error:", error);
    window.showToast("❌", "Save Failed", error.message);
  }
}

// PASSWORD CHANGE
async function changePassword() {
  const user = auth.currentUser;
  if (!user) return;

  const currentPassword = document.getElementById("inputCurrentPassword")?.value;
  const newPassword     = document.getElementById("newPwInput")?.value;
  const confirmPassword = document.getElementById("inputConfirmPassword")?.value;

  if (!currentPassword || !newPassword || !confirmPassword) {
    window.showToast("⚠️", "Error", "All fields are required.");
    return;
  }
  if (newPassword !== confirmPassword) {
    window.showToast("⚠️", "Error", "Passwords do not match.");
    return;
  }
  if (newPassword.length < 6) {
    window.showToast("⚠️", "Error", "Password must be at least 6 characters.");
    return;
  }

  const credential = EmailAuthProvider.credential(user.email, currentPassword);
  try {
    await reauthenticateWithCredential(user, credential);
    await updatePassword(user, newPassword);
    document.getElementById("inputCurrentPassword").value = "";
    document.getElementById("newPwInput").value           = "";
    document.getElementById("inputConfirmPassword").value = "";
    window.showToast("🔒", "Password Updated", "Your password has been changed.");
  } catch (error) {
    console.error("Password change error:", error);
    window.showToast("❌", "Update Failed", error.message);
  }
}

// DELETE ACCOUNT
async function deleteUserAccount() {
  const user = auth.currentUser;
  if (!user) return;
  if (!confirm("This action is permanent. Continue?")) return;

  const password = window.prompt('Please enter your password to confirm account deletion:');
  if (!password) return;

  try {
    const credential = EmailAuthProvider.credential(user.email, password);
    await reauthenticateWithCredential(user, credential);
    await deleteDoc(doc(db, "users", user.uid));
    await deleteUser(user);
    window.location.href = "index.html";
  } catch (error) {
    console.error("Delete account error:", error);
    if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
      window.showToast("❌", "Wrong Password", "Incorrect password. Account not deleted.");
    } else if (error.code === 'auth/too-many-requests') {
      window.showToast("❌", "Too Many Attempts", "Too many failed attempts. Try again later.");
    } else {
      window.showToast("❌", "Delete Failed", error.message);
    }
  }
}

// BIO COUNTER
function updateBioCount() {
  const bio   = document.getElementById("bioText");
  const count = document.getElementById("bioCount");
  if (!bio || !count) return;
  count.textContent = `${bio.value.length} / 160`;
}

// INIT PROFILE PAGE
export function initProfilePage() {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      const profileSection = document.getElementById("sec-profile");
      if (profileSection?.classList.contains("active")) {
        loadUserProfile(user.uid);
      }
    }
  });

  document.getElementById("bioText")?.addEventListener("input", updateBioCount);
  document.getElementById("btnSaveProfile")?.addEventListener("click", saveProfileChanges);
  document.getElementById("btnUpdatePassword")?.addEventListener("click", changePassword);
  document.getElementById("btnDeleteAccount")?.addEventListener("click", deleteUserAccount);
}