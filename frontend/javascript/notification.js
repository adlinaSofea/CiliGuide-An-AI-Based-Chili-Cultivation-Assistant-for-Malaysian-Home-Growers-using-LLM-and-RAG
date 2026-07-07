import { db } from './firebase-config.js';
import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  getDocs,
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ── TOAST STACK (max 3) ───────────────────────────────────────
const MAX_TOASTS = 3;
let activeToasts = [];

function playNotifSound() {
  try {
    const ctx  = new (window.AudioContext || window.webkitAudioContext)();
    const time = ctx.currentTime;

    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'square';
    osc.frequency.setValueAtTime(988, time);
    osc.frequency.setValueAtTime(1319, time + 0.08);

    gain.gain.setValueAtTime(0.15, time);
    gain.gain.setValueAtTime(0.15, time + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.35);

    osc.start(time);
    osc.stop(time + 0.35);
  } catch (e) {}
}

function showStackedToast(icon, title, message) {
  if (activeToasts.length >= MAX_TOASTS) {
    const oldest = activeToasts.shift();
    oldest?.remove();
    recalcPositions();
  }

  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed;
    right: 20px;
    top: 80px;
    width: 320px;
    background: white;
    border-radius: 12px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.13);
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 12px 14px;
    z-index: 9999;
    border-left: 4px solid #e74c3c;
    transform: translateX(340px);
    transition: transform 0.3s cubic-bezier(.4,0,.2,1), top 0.3s ease, opacity 0.3s ease;
    opacity: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  `;

  toast.innerHTML = `
    <div style="font-size:20px;flex-shrink:0;margin-top:1px;">${icon}</div>
    <div style="flex:1;min-width:0;">
      <div style="font-size:13px;font-weight:700;color:#1e1e1e;margin-bottom:2px;">${title}</div>
      <div style="font-size:12px;color:#888;line-height:1.4;
       word-break:break-word;white-space:normal;">${message}</div>
    </div>
    <button onclick="this.parentElement.parentElement.dispatchEvent(new Event('dismiss'))"
      style="background:none;border:none;cursor:pointer;color:#bbb;font-size:16px;
             flex-shrink:0;padding:0;line-height:1;margin-top:1px;">×</button>
  `;

  document.body.appendChild(toast);
  activeToasts.push(toast);

  recalcPositions();

  requestAnimationFrame(() => {
    toast.style.transform = 'translateX(0)';
    toast.style.opacity   = '1';
  });

  playNotifSound();

  const timer = setTimeout(() => dismissToast(toast), 5000);
  toast.addEventListener('dismiss', () => {
    clearTimeout(timer);
    dismissToast(toast);
  });
}

function recalcPositions() {
  const NAVBAR_HEIGHT = 80;
  const gap = 10;

  // Force reflow first so heights are accurate
  activeToasts.forEach(t => t.offsetHeight);

  activeToasts.forEach((t, i) => {
    const fromTop = NAVBAR_HEIGHT + activeToasts
      .slice(0, i)
      .reduce((sum, el) => sum + el.getBoundingClientRect().height + gap, 0);

    t.style.top    = fromTop + 'px';
    t.style.bottom = 'auto';
  });
}

function dismissToast(toast) {
  toast.style.transform = 'translateX(340px)';
  toast.style.opacity   = '0';
  setTimeout(() => {
    toast.remove();
    activeToasts = activeToasts.filter(t => t !== toast);
    recalcPositions();
  }, 300);
}

// ── HELPER: GET USER NAME ─────────────────────────────────────
async function getUserName(userId) {
  try {
    const snap = await getDoc(doc(db, 'users', userId));
    if (snap.exists()) return snap.data().username || 'Someone';
  } catch (err) {
    console.error('getUserName error:', err);
  }
  return 'Someone';
}

// ── BADGE HELPERS ─────────────────────────────────────────────
const LAST_VISIT_KEY = 'comm_last_visit';

function showCommunityBadge() {
  const btn = document.querySelector('[data-nav="community"]');
  if (!btn) return;
  if (btn.querySelector('.comm-notif-dot')) return;

  const iconBox = btn.querySelector('.sb-icon');
  const target  = iconBox || btn;
  target.style.position = 'relative';

  const dot = document.createElement('span');
  dot.className = 'comm-notif-dot';
  target.appendChild(dot);
}

export function hideCommunityBadge() {
  document.querySelector('.comm-notif-dot')?.remove();
}

// ── SHOW LATEST ACTIVITY ON PAGE LOAD ────────────────────────
async function showLatestActivity(currentUserId) {
  const q = query(
    collection(db, 'community'),
    orderBy('createdAt', 'desc'),
    limit(10)
  );

  let snapshot;
  try {
    snapshot = await getDocs(q);
  } catch (err) {
    console.warn('showLatestActivity error:', err);
    return;
  }

  const lastVisit     = parseInt(localStorage.getItem(LAST_VISIT_KEY) || '0');
  const lastVisitDate = new Date(lastVisit);

  let latestPost     = null;
  let latestComment  = null;
  let latestLike     = null;
  let hasNewActivity = false;

  snapshot.forEach(docSnap => {
    const post     = docSnap.data();
    const postTime = post.createdAt?.toDate?.() || new Date(0);
    const isNewPost = postTime > lastVisitDate;

    if (!latestPost && post.authorId !== currentUserId) {
      latestPost = post;
      if (isNewPost) hasNewActivity = true;
    }

    if (post.comments?.length > 0) {
      const lastComment = post.comments[post.comments.length - 1];
      const commentTime = lastComment.createdAt ? new Date(lastComment.createdAt) : new Date(0);
      if (!latestComment && lastComment.authorId !== currentUserId) {
        latestComment = { post, comment: lastComment };
        if (commentTime > lastVisitDate) hasNewActivity = true;
      }
    }

    if (post.likes?.length > 0) {
      const lastLike = post.likes[post.likes.length - 1];
      if (!latestLike && lastLike !== currentUserId) {
        latestLike = { post, likerId: lastLike };
        if (isNewPost) hasNewActivity = true;
      }
    }
  });

  if (hasNewActivity) showCommunityBadge();

  // Show all 3 at once with small stagger
  const toasts = [];

  if (latestPost) {
    toasts.push({
      icon: '📝',
      title: 'Latest Post',
      msg: `${latestPost.authorName}: "${latestPost.title}"`
    });
  }

  if (latestComment) {
    const onPostBy = latestComment.post.authorId === currentUserId
      ? 'your post'
      : `${latestComment.post.authorName}'s post`;
    toasts.push({
      icon: '💬',
      title: 'Latest Comment',
      msg: `${latestComment.comment.authorName} commented on ${onPostBy}`
    });
  }

  if (latestLike) {
    const likerName = await getUserName(latestLike.likerId);
    const onPostBy  = latestLike.post.authorId === currentUserId
      ? 'your post'
      : `${latestLike.post.authorName}'s post`;
    toasts.push({
      icon: '❤️',
      title: 'Latest Like',
      msg: `${likerName} liked ${onPostBy}`
    });
  }

  // Show max 3 with small stagger so they stack nicely
  toasts.slice(0, MAX_TOASTS).forEach((t, i) => {
    setTimeout(() => showStackedToast(t.icon, t.title, t.msg), i * 300);
  });
}

// ── LISTEN FOR NEW ACTIVITY (Real-time) ───────────────────────
function listenForNewActivity(currentUserId) {
  const startTime    = new Date();
  const shownActivity = new Set();

  const q = query(
    collection(db, 'community'),
    orderBy('createdAt', 'desc')
  );

  onSnapshot(q, (snapshot) => {
    snapshot.docChanges().forEach(async (change) => {
      const post   = change.doc.data();
      const postId = change.doc.id;

      const postTime = post.createdAt?.toDate?.() || new Date(0);
      if (postTime <= startTime) return;

      // NEW POST
      if (change.type === 'added' && post.authorId !== currentUserId) {
        const key = `post-${postId}`;
        if (!shownActivity.has(key)) {
          shownActivity.add(key);
          showCommunityBadge();
          showStackedToast('📝', 'New Post', `${post.authorName}: "${post.title}"`);
        }
      }

      // NEW COMMENT
      if (change.type === 'modified' && post.comments?.length > 0) {
        const lastComment = post.comments[post.comments.length - 1];
        const commentTime = lastComment.createdAt
          ? new Date(lastComment.createdAt)
          : new Date(0);

        if (commentTime > startTime && lastComment?.authorId !== currentUserId) {
          const key = `comment-${postId}-${commentTime.getTime()}`;
          if (!shownActivity.has(key)) {
            shownActivity.add(key);
            showCommunityBadge();
            const onPostBy = post.authorId === currentUserId
              ? `your post "${post.title}"`
              : `${post.authorName}'s post`;
            showStackedToast('💬', 'New Comment',
              `${lastComment.authorName} commented on ${onPostBy}`);
          }
        }
      }

      // NEW LIKE
      if (change.type === 'modified' && post.likes?.length > 0) {
        const lastLikeId = post.likes[post.likes.length - 1];
        if (lastLikeId && lastLikeId !== currentUserId) {
          const key = `like-${postId}-${post.likes.length}`;
          if (!shownActivity.has(key)) {
            shownActivity.add(key);
            showCommunityBadge();
            const likerName = await getUserName(lastLikeId);
            const onPostBy  = post.authorId === currentUserId
              ? `your post "${post.title}"`
              : `${post.authorName}'s post`;
            showStackedToast('❤️', 'New Like', `${likerName} liked ${onPostBy}`);
          }
        }
      }
    });
  }, (error) => {
    console.warn('Community listener error:', error.code);
  });
}

// ── PLANT REMINDERS ───────────────────────────────────────────
function checkPlantReminders(currentUserId) {

  const MORNING_MESSAGES = [
    { icon: '🌅', title: 'Good Morning!',        msg: 'Time to check on your chili plants today.' },
    { icon: '💧', title: 'Watering Time?',        msg: 'Don\'t forget to check if your plants need water.' },
    { icon: '🌿', title: 'Plant Check-in',        msg: 'Have you visited your chili plants today?' },
    { icon: '☀️', title: 'Rise & Grow!',          msg: 'Your chilies are waiting for you this morning.' },
    { icon: '🌱', title: 'Daily Check',           msg: 'A quick check keeps your plants happy and healthy.' },
  ];

  const MOTIVATION_MESSAGES = [
    { icon: '🏆', title: 'Level Up!',             msg: 'Start a new cycle to unlock more features.' },
    { icon: '📈', title: 'Grow Your Experience',  msg: 'The more cycles you complete, the smarter your insights get.' },
    { icon: '🌶️', title: 'Keep Growing!',         msg: 'Active growers get better yield predictions over time.' },
    { icon: '🎯', title: 'Stay Consistent',       msg: 'Log a note today to track your plant\'s progress.' },
    { icon: '💪', title: 'You\'re Doing Great!',  msg: 'Every cycle teaches you something new about growing.' },
  ];

  const CARE_MESSAGES = [
    { icon: '🔍', title: 'Pest Check',            msg: 'Inspect your leaves today — catch issues early!' },
    { icon: '🌡️', title: 'Weather Alert',         msg: 'Hot day ahead — make sure your plants have enough water.' },
    { icon: '✂️', title: 'Pruning Reminder',      msg: 'Consider pruning dead leaves to encourage new growth.' },
    { icon: '📝', title: 'Log a Note',            msg: 'Haven\'t logged today? Record your plant\'s condition now.' },
    { icon: '🪴', title: 'Fertilizer Check',      msg: 'When did you last fertilize? Your plants might be hungry.' },
  ];

  const q = query(
    collection(db, 'users', currentUserId, 'harvestCycles'),
    orderBy('createdAt', 'desc')
  );

  onSnapshot(q, (snapshot) => {
    if (snapshot.empty) return;

    const activeCycles = [];
    snapshot.forEach(docSnap => {
      const cycle = docSnap.data();
      if (cycle.status === 'active' && !cycle.harvestedDate) {
        activeCycles.push(cycle);
      }
    });

    if (activeCycles.length === 0) return;

    const now  = new Date();
    const hour = now.getHours();
    const day  = now.getDay(); // 0=Sun, 6=Sat

    // Pick message pool based on time of day
    let pool;
    if (hour >= 6 && hour < 11) {
      pool = MORNING_MESSAGES;
    } else if (hour >= 11 && hour < 17) {
      pool = CARE_MESSAGES;
    } else {
      pool = MOTIVATION_MESSAGES;
    }

    // Pick a random message from the pool
    const pick = pool[Math.floor(Math.random() * pool.length)];

    // Show after 2s delay so it doesn't clash with other toasts
    setTimeout(() => {
      showStackedToast(pick.icon, pick.title, pick.msg);
    }, 5000);

    // If user has 2+ active cycles — bonus motivational nudge
    if (activeCycles.length >= 2) {
      setTimeout(() => {
        showStackedToast(
          '🌶️',
          `${activeCycles.length} Cycles Active`,
          `You're growing ${activeCycles.length} varieties — check them all today!`
        );
      }, 2600);
    }
  });
}

// ── MAIN INIT ─────────────────────────────────────────────────
export function initCommunityNotifications(currentUserId) {
  showLatestActivity(currentUserId);
  listenForNewActivity(currentUserId);
  checkPlantReminders(currentUserId);
}