
// community.js 

import { auth, db } from "./firebase-config.js";
import {
    collection, addDoc, deleteDoc,
    doc, updateDoc, getDoc, onSnapshot, serverTimestamp,
    query, orderBy, arrayUnion, arrayRemove
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";


// STATE

let currentUser      = null;
let currentUsername  = '';
let commPosts        = [];
let commActiveFilter = 'all';
let commEditingId    = null;
let commSelCat       = '';
let commImgDataUrl   = null;


// INJECT LIGHTBOX 

(function injectLightboxStyle() {
    if (document.getElementById('_commLightboxStyle')) return;
    const s = document.createElement('style');
    s.id = '_commLightboxStyle';
    s.textContent = `
        /* ── Post image — clickable ── */
        .comm-post-img {
            cursor: zoom-in;
            transition: opacity .15s;
        }
        .comm-post-img:hover { opacity: .9; }

        /* ── Lightbox overlay ── */
        #commLightbox {
            display: none;
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,.92);
            z-index: 9998;
            align-items: center;
            justify-content: center;
            cursor: zoom-out;
            padding: 16px;
        }
        #commLightbox.open { display: flex; }

        #commLightboxImg {
            max-width: min(92vw, 1100px);
            max-height: 90vh;
            border-radius: 10px;
            object-fit: contain;
            box-shadow: 0 8px 48px rgba(0,0,0,.6);
            animation: lbFadeIn .2s ease;
            cursor: default;
        }
        @keyframes lbFadeIn {
            from { opacity:0; transform:scale(.96); }
            to   { opacity:1; transform:scale(1);   }
        }

        #commLightboxClose {
            position: fixed;
            top: 16px;
            right: 20px;
            background: rgba(255,255,255,.15);
            border: none;
            color: white;
            font-size: 1.4rem;
            width: 40px;
            height: 40px;
            border-radius: 50%;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 9999;
            transition: background .15s;
        }
        #commLightboxClose:hover { background: rgba(255,255,255,.3); }
    `;
    document.head.appendChild(s);
})();


// LIGHTBOX HELPERS
function openLightbox(src) {
    let lb  = document.getElementById('commLightbox');
    let img = document.getElementById('commLightboxImg');
    let btn = document.getElementById('commLightboxClose');

  
    if (!lb) {
        lb = document.createElement('div');
        lb.id = 'commLightbox';

        btn = document.createElement('button');
        btn.id          = 'commLightboxClose';
        btn.textContent = '✕';
        btn.title       = 'Close';
        btn.addEventListener('click', (e) => { e.stopPropagation(); closeLightbox(); });

        img = document.createElement('img');
        img.id  = 'commLightboxImg';
        img.alt = 'Full image';

        
        img.addEventListener('click', (e) => e.stopPropagation());

        lb.appendChild(btn);
        lb.appendChild(img);
        document.body.appendChild(lb);

        // Click backdrop to close
        lb.addEventListener('click', closeLightbox);
    }

    img.src = src;
    lb.classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeLightbox() {
    document.getElementById('commLightbox')?.classList.remove('open');
    document.body.style.overflow = '';
}


function getUserColor(name) {
    let hash = 0;
    for (let i = 0; i < (name || '').length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
        hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(6, '0').slice(0, 6);
}

function getDiceBearUrl(name) {
    const seed  = encodeURIComponent(name || 'User');
    const color = getUserColor(name || 'User');
    return `https://api.dicebear.com/8.x/initials/svg?seed=${seed}&size=128&radius=50&backgroundColor=${color}&backgroundType=solid&fontSize=38&fontWeight=600`;
}

function makeAvatarImg(name, size = 36) {
    return `<img
        src="${getDiceBearUrl(name)}"
        alt="${escComm(name || 'User')}"
        style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;flex-shrink:0;display:block;"
        onerror="this.style.display='none'">`;
}


// MODAL HELPERS

function showCommModal() {
    document.getElementById('commPostModalOverlay')?.classList.add('open');
}
function hideCommModal() {
    document.getElementById('commPostModalOverlay')?.classList.remove('open');
    commEditingId = null;
}


// INIT
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('commPostModalOverlay')
        ?.addEventListener('click', (e) => {
            if (e.target.id === 'commPostModalOverlay') hideCommModal();
        });

    document.getElementById('commNewPostBox')
        ?.addEventListener('click', () => openCommModal());

    document.querySelectorAll('.comm-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            commActiveFilter = btn.dataset.cat || 'all';
            document.querySelectorAll('.comm-filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderCommFeed();
        });
    });

    document.querySelectorAll('.comm-cat-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            document.querySelectorAll('.comm-cat-pill').forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            commSelCat = pill.dataset.cat;
        });
    });

    document.getElementById('commModalCloseBtn')?.addEventListener('click', hideCommModal);
    document.getElementById('commCancelBtn')?.addEventListener('click', hideCommModal);
    document.getElementById('commSubmitBtn')?.addEventListener('click', commSubmitPost);
    document.getElementById('commImgInput')?.addEventListener('change', function () { commHandleImgInput(this); });
    document.getElementById('commImgRemove')?.addEventListener('click', (e) => { e.stopPropagation(); commClearImg(); });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { hideCommModal(); closeLightbox(); }
    });
});


// AUTH 
onAuthStateChanged(auth, async (user) => {
    currentUser = user;

    if (user) {
        await refreshUsername(user);
        updateCommAvatar();
        loadCommunityPosts();
    }
});

async function refreshUsername(user) {
    try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (snap.exists()) {
            const data = snap.data();
            // Try both 'username' and 'userName' — matches however profile.js saves it
            currentUsername = data.username || data.userName
                || user.displayName
                || user.email?.split('@')[0]
                || 'User';
        } else {
            currentUsername = user.displayName || user.email?.split('@')[0] || 'User';
        }
    } catch {
        currentUsername = user.displayName || user.email?.split('@')[0] || 'User';
    }
    console.log('[Community] username resolved to:', currentUsername);
}

function updateCommAvatar() {
    const av = document.getElementById('commUserAv');
    if (!av) return;
    av.innerHTML = '';
    av.style.cssText = 'background:transparent;padding:0;overflow:hidden;width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;';

    const img = document.createElement('img');
    img.src           = getDiceBearUrl(currentUsername);
    img.alt           = currentUsername;
    img.style.cssText = 'width:100%;height:100%;border-radius:50%;object-fit:cover;display:block;';
    img.onerror = () => {
        av.textContent      = currentUsername.substring(0, 2).toUpperCase();
        av.style.background = '#e74c3c';
        av.style.color      = 'white';
        av.style.fontSize   = '.8rem';
        av.style.fontWeight = '700';
    };
    av.appendChild(img);
}


// LOAD POSTS
function loadCommunityPosts() {
    const q = query(collection(db, 'community'), orderBy('createdAt', 'desc'));

    onSnapshot(q, (snap) => {
        commPosts = snap.docs.map(d => {
            const data = d.data();
            const isMe = !!(currentUser && data.authorId && data.authorId === currentUser.uid);
            return { id: d.id, ...data, isMe };
        });
        renderCommFeed();
    }, (err) => console.error('Feed error:', err));
}


// RENDER FEED
function renderCommFeed() {
    const feed       = document.getElementById('commFeed');
    const emptyState = document.getElementById('commEmptyState');
    if (!feed) return;

    feed.querySelectorAll('.comm-post-card').forEach(c => c.remove());

    const visible = commActiveFilter === 'all'
        ? commPosts
        : commPosts.filter(p => p.category === commActiveFilter);

    if (visible.length === 0) {
        if (emptyState) emptyState.style.display = '';
        return;
    }
    if (emptyState) emptyState.style.display = 'none';
    visible.forEach(p => feed.insertAdjacentHTML('beforeend', renderCommPost(p)));
}


// RENDER POST CARD
function renderCommPost(p) {
    const liked     = Array.isArray(p.likes) && p.likes.includes(currentUser?.uid);
    const likeCount = Array.isArray(p.likes)    ? p.likes.length    : 0;
    const commCount = Array.isArray(p.comments) ? p.comments.length : 0;

    const catMeta = {
        tip:      { emoji: '💡', label: 'Tip'      },
        question: { emoji: '❓', label: 'Question' },
        harvest:  { emoji: '🌱', label: 'Harvest'  },
        disease:  { emoji: '🦠', label: 'Disease'  },
        general:  { emoji: '📸', label: 'General'  },
    };
    const meta       = catMeta[p.category] || { emoji: '📌', label: p.category || 'General' };
    const authorName = p.isMe ? (currentUsername || p.authorName || 'Anonymous') : (p.authorName || 'Anonymous');

    const commentsHtml = Array.isArray(p.comments)
        ? p.comments.map(c => renderCommComment(p.id, c)).join('') : '';

    const menuItems = p.isMe
        ? `<button data-action="edit"   data-id="${p.id}">✏️ Edit post</button>
           <button data-action="delete" data-id="${p.id}" class="comm-danger">🗑️ Delete post</button>`
        : `<button data-action="report" data-id="${p.id}">🚩 Report post</button>`;

    // Image: clicking opens lightbox
    const imgHtml = p.imageBase64
        ? `<img src="${p.imageBase64}"
               class="comm-post-img"
               alt="Post image"
               data-lightbox="${p.id}"
               title="Click to view full image">`
        : '';

    return `
        <div class="comm-post-card" id="commPost_${p.id}">
            <div class="comm-post-head">
                <div class="comm-post-author">
                    ${makeAvatarImg(authorName, 38)}
                    <div>
                        <div class="comm-post-name">
                            ${escComm(authorName)}
                            ${p.isMe ? '<span class="comm-you-badge">You</span>' : ''}
                        </div>
                        <div class="comm-post-time">
                            ${commTimeAgo(p.createdAt?.toDate ? p.createdAt.toDate() : new Date())}
                            ${p.updatedAt ? '<span style="color:#bbb;font-size:.65rem;"> · edited</span>' : ''}
                        </div>
                    </div>
                </div>
                <div class="comm-menu-wrap">
                    <button class="comm-menu-btn" data-menu="commDrop_${p.id}">⋯</button>
                    <div class="comm-dropdown" id="commDrop_${p.id}">${menuItems}</div>
                </div>
            </div>

            <span class="comm-cat-badge ${p.category}">${meta.emoji} ${meta.label}</span>
            <div class="comm-post-title">${escComm(p.title || '')}</div>
            ${p.body ? `<div class="comm-post-body">${escComm(p.body)}</div>` : ''}
            ${imgHtml}

            <div class="comm-post-footer">
                <button class="comm-footer-btn ${liked ? 'comm-liked' : ''}" data-like="${p.id}">
                    ${liked ? '❤️' : '🤍'} ${likeCount > 0 ? likeCount : ''} Like
                </button>
                <button class="comm-footer-btn" data-comments="${p.id}">
                    💬 ${commCount > 0 ? commCount : ''} Comment
                </button>
            </div>

            <div class="comm-comments-wrap" id="commComments_${p.id}">
                <div id="commCommentsList_${p.id}">${commentsHtml}</div>
                <div class="comm-comment-input-row">
                    ${makeAvatarImg(currentUsername, 28)}
                    <input class="comm-comment-input"
                        id="commCommentInput_${p.id}"
                        data-post="${p.id}"
                        placeholder="Write a comment…"
                        maxlength="300">
                    <button class="comm-comment-send" data-send="${p.id}">➤</button>
                </div>
            </div>
        </div>`;
}


// RENDER COMMENT
function renderCommComment(postId, c) {
    const isMe = !!(currentUser && c.authorId === currentUser.uid);
    const name = c.authorName || 'User';
    return `
        <div class="comm-comment-item" id="commComment_${c.id}">
            ${makeAvatarImg(name, 28)}
            <div class="comm-comment-bubble">
                <div class="comm-comment-name">${escComm(name)}</div>
                <div class="comm-comment-text">${escComm(c.text)}</div>
                <div class="comm-comment-meta">
                    ${commTimeAgo(c.createdAt ? new Date(c.createdAt) : new Date())}
                    ${isMe
                        ? `· <button class="comm-comment-del"
                              data-del-comment="${c.id}"
                              data-del-post="${postId}">Delete</button>`
                        : ''}
                </div>
            </div>
        </div>`;
}


// EVENT DELEGATION
document.addEventListener('click', (e) => {

    // Lightbox — click on post image
    const lbImg = e.target.closest('[data-lightbox]');
    if (lbImg) {
        const src = lbImg.src || lbImg.querySelector('img')?.src;
        if (src) openLightbox(src);
        return;
    }

    // Menu toggle
    const menuBtn = e.target.closest('[data-menu]');
    if (menuBtn) {
        e.stopPropagation();
        const menu   = document.getElementById(menuBtn.dataset.menu);
        const isOpen = menu?.classList.contains('open');
        commCloseAllDropdowns();
        if (menu && !isOpen) menu.classList.add('open');
        return;
    }

    const editBtn = e.target.closest('[data-action="edit"]');
    if (editBtn) { e.stopPropagation(); commCloseAllDropdowns(); commEditPost(editBtn.dataset.id); return; }

    const delBtn = e.target.closest('[data-action="delete"]');
    if (delBtn) { e.stopPropagation(); commCloseAllDropdowns(); commDeletePost(delBtn.dataset.id); return; }

    const repBtn = e.target.closest('[data-action="report"]');
    if (repBtn) { e.stopPropagation(); commCloseAllDropdowns(); window.showToast('🚩', 'Reported', 'Post reported. Thank you!'); return; }

    const likeBtn = e.target.closest('[data-like]');
    if (likeBtn) { commToggleLike(likeBtn.dataset.like); return; }

    const commBtn = e.target.closest('[data-comments]');
    if (commBtn) {
        const el = document.getElementById('commComments_' + commBtn.dataset.comments);
        if (el) {
            const isOpen = el.style.display === 'block';
            el.style.display = isOpen ? 'none' : 'block';
            if (!isOpen) document.getElementById('commCommentInput_' + commBtn.dataset.comments)?.focus();
        }
        return;
    }

    const sendBtn = e.target.closest('[data-send]');
    if (sendBtn) { commSubmitComment(sendBtn.dataset.send); return; }

    const delCBtn = e.target.closest('[data-del-comment]');
    if (delCBtn) { commDeleteComment(delCBtn.dataset.delPost, delCBtn.dataset.delComment); return; }

    // Close dropdowns when clicking elsewhere
    if (!e.target.closest('.comm-menu-wrap')) commCloseAllDropdowns();
});

document.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const input = e.target.closest('.comm-comment-input');
        if (input?.dataset.post) commSubmitComment(input.dataset.post);
    }
});


// OPEN MODAL
function openCommModal() {
    if (!currentUser) { showToast('⚠️', 'Login Required', 'Please login first'); return; }

    commEditingId  = null;
    commSelCat     = '';
    commImgDataUrl = null;

    const g = id => document.getElementById(id);
    const t = g('commModalTitle'); if (t) t.textContent = 'Create Post';
    const s = g('commModalSub');   if (s) s.textContent = 'Share something with the community';
    const i = g('commPostTitle');  if (i) i.value = '';
    const b = g('commPostBody');   if (b) b.value = '';
    const tc = g('commTitleCount'); if (tc) tc.textContent = '0';
    const bc = g('commBodyCount');  if (bc) bc.textContent = '0';

    commClearImg();
    document.querySelectorAll('.comm-cat-pill').forEach(p => p.classList.remove('active'));
    showCommModal();
    setTimeout(() => g('commPostTitle')?.focus(), 150);
}

window.openCommModal  = openCommModal;
window.closeCommModal = hideCommModal;


// IMAGE HELPERS
function commHandleImgInput(input) {
    const file = input.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { showToast('⚠️', 'Too Large', 'Image must be under 5 MB'); return; }
    if (!file.type.startsWith('image/')) { showToast('⚠️', 'Invalid', 'Please upload an image'); return; }

    const reader = new FileReader();
    reader.onload = ev => {
        commImgDataUrl = ev.target.result;
        const g = id => document.getElementById(id);
        const preview = g('commImgPreview');
        if (preview) { preview.src = commImgDataUrl; preview.style.display = 'block'; }
        const rem = g('commImgRemove'); if (rem) rem.style.display = 'flex';
        const ph  = g('commUploadPlaceholder'); if (ph) ph.style.display = 'none';
        g('commUploadArea')?.classList.add('has-img');
    };
    reader.readAsDataURL(file);
}

function commClearImg() {
    commImgDataUrl = null;
    const g = id => document.getElementById(id);
    const preview = g('commImgPreview');
    if (preview) { preview.src = ''; preview.style.display = 'none'; }
    const rem = g('commImgRemove'); if (rem) rem.style.display = 'none';
    const ph  = g('commUploadPlaceholder'); if (ph) ph.style.display = 'block';
    g('commUploadArea')?.classList.remove('has-img');
    const inp = g('commImgInput'); if (inp) inp.value = '';
}


// SUBMIT POST
async function commSubmitPost() {
    if (!currentUser) { showToast('⚠️', 'Login Required', 'Please login first'); return; }

    const title = document.getElementById('commPostTitle')?.value.trim();
    const body  = document.getElementById('commPostBody')?.value.trim();

    if (!title)      { showToast('⚠️', 'Missing Title',    'Please add a title');       return; }
    if (!commSelCat) { showToast('⚠️', 'Missing Category', 'Please choose a category'); return; }

    // ── Snapshot data before closing ──
    const titleSnap    = title;
    const bodySnap     = body || '';
    const catSnap      = commSelCat;
    const imgSnap      = commImgDataUrl || null;
    const editingSnap  = commEditingId;

    // ── Close modal instantly — no waiting ──
    hideCommModal();
    showToast('✅', editingSnap ? 'Updated' : 'Posted', editingSnap ? 'Post updated!' : 'Your post has been shared!');


    // ── Save to Firestore in background ──
    try {
        if (editingSnap) {
            await updateDoc(doc(db, 'community', editingSnap), {
                title:       titleSnap,
                body:        bodySnap,
                category:    catSnap,
                imageBase64: imgSnap,
                updatedAt:   serverTimestamp(),
            });
        } else {
            await addDoc(collection(db, 'community'), {
                authorId:    currentUser.uid,
                authorName:  currentUsername,
                authorEmail: currentUser.email,
                category:    catSnap,
                title:       titleSnap,
                body:        bodySnap,
                imageBase64: imgSnap,
                likes:       [],
                comments:    [],
                createdAt:   serverTimestamp(),
            });
        }
    } catch (err) {
        console.error('Post error:', err);
        showToast('❌', 'Failed', 'Could not save post. Try again.');
    }
}


// EDIT POST
async function commEditPost(id) {
    if (!currentUser) { showToast('⚠️', 'Login Required', 'Please login first'); return; }

    let p = commPosts.find(x => x.id === id);
    if (!p) {
        try {
            const snap = await getDoc(doc(db, 'community', id));
            if (!snap.exists()) { showToast('❌', 'Not Found', 'Post not found.'); return; }
            p = { id: snap.id, ...snap.data() };
        } catch (err) { console.error(err); showToast('❌', 'Error', 'Could not load post.'); return; }
    }

    if (p.authorId !== currentUser.uid) {
        showToast('⚠️', 'Not Allowed', 'You can only edit your own posts.');
        return;
    }

    commEditingId  = id;
    commSelCat     = p.category;
    commImgDataUrl = p.imageBase64 || null;

    const g = id => document.getElementById(id);
    const t = g('commModalTitle'); if (t) t.textContent = 'Edit Post';
    const s = g('commModalSub');   if (s) s.textContent = 'Update your post';
    const i = g('commPostTitle');  if (i) i.value = p.title || '';
    const b = g('commPostBody');   if (b) b.value = p.body  || '';
    const btn = g('commSubmitBtn'); if (btn) btn.textContent = 'Save Changes';
    const tc = g('commTitleCount'); if (tc) tc.textContent = (p.title || '').length;
    const bc = g('commBodyCount');  if (bc) bc.textContent = (p.body  || '').length;

    if (p.imageBase64) {
        const preview = g('commImgPreview');
        if (preview) { preview.src = p.imageBase64; preview.style.display = 'block'; }
        const rem = g('commImgRemove'); if (rem) rem.style.display = 'flex';
        const ph  = g('commUploadPlaceholder'); if (ph) ph.style.display = 'none';
        g('commUploadArea')?.classList.add('has-img');
    } else {
        commClearImg();
    }

    document.querySelectorAll('.comm-cat-pill')
        .forEach(pill => pill.classList.toggle('active', pill.dataset.cat === p.category));

    showCommModal();
    setTimeout(() => g('commPostTitle')?.focus(), 150);
}


// DELETE POST
async function commDeletePost(id) {
    if (!currentUser) { showToast('⚠️', 'Login Required', 'Please login first'); return; }

    try {
        const snap = await getDoc(doc(db, 'community', id));
        if (!snap.exists()) { showToast('❌', 'Not Found', 'Post not found.'); return; }
        if (snap.data().authorId !== currentUser.uid) {
            showToast('⚠️', 'Not Allowed', 'You can only delete your own posts.');
            return;
        }
    } catch (err) { console.error(err); showToast('❌', 'Error', 'Could not verify.'); return; }

    if (!confirm('Delete this post? This cannot be undone.')) return;

    try {
        await deleteDoc(doc(db, 'community', id));
        showToast('🗑️', 'Deleted', 'Post removed.');
    } catch (err) {
        console.error(err);
        showToast('❌', 'Failed', 'Could not delete post.');
    }
}


// LIKE
async function commToggleLike(id) {
    if (!currentUser) { showToast('⚠️', 'Login Required', 'Please login to like'); return; }
    const p     = commPosts.find(x => x.id === id);
    if (!p) return;
    const liked = Array.isArray(p.likes) && p.likes.includes(currentUser.uid);
    try {
        await updateDoc(doc(db, 'community', id), {
            likes: liked ? arrayRemove(currentUser.uid) : arrayUnion(currentUser.uid)
        });
    } catch (err) { console.error('Like error:', err); }
}


// SUBMIT COMMENT
async function commSubmitComment(postId) {
    if (!currentUser) { showToast('⚠️', 'Login Required', 'Please login to comment'); return; }
    const input = document.getElementById('commCommentInput_' + postId);
    const text  = input?.value.trim();
    if (!text) return;

    const comment = {
        id:         'c_' + Date.now(),
        authorId:   currentUser.uid,
        authorName: currentUsername,
        text,
        createdAt:  Date.now(),
    };
    input.value = '';

    try {
        await updateDoc(doc(db, 'community', postId), { comments: arrayUnion(comment) });
    } catch (err) {
        console.error('Comment error:', err);
        showToast('❌', 'Failed', 'Could not add comment.');
    }
}


// DELETE COMMENT
async function commDeleteComment(postId, commentId) {
    if (!confirm('Delete this comment?')) return;
    const p = commPosts.find(x => x.id === postId);
    const c = p?.comments?.find(x => x.id === commentId);
    if (!c) return;
    try {
        await updateDoc(doc(db, 'community', postId), { comments: arrayRemove(c) });
        showToast('🗑️', 'Deleted', 'Comment removed.');
    } catch (err) { console.error(err); }
}


// DROPDOWN HELPERS
function commCloseAllDropdowns() {
    document.querySelectorAll('.comm-dropdown.open').forEach(m => m.classList.remove('open'));
}


// UTILITY
function escComm(t) {
    const d = document.createElement('div');
    d.textContent = String(t ?? '');
    return d.innerHTML;
}

function commTimeAgo(date) {
    if (!date) return '';
    const diff = Date.now() - (date instanceof Date ? date.getTime() : Number(date));
    if (diff < 60000)     return 'Just now';
    if (diff < 3600000)   return Math.floor(diff / 60000) + 'm ago';
    if (diff < 86400000)  return Math.floor(diff / 3600000) + 'h ago';
    if (diff < 604800000) return Math.floor(diff / 86400000) + 'd ago';
    const d = date instanceof Date ? date : new Date(date);
    return d.toLocaleDateString('en-MY', { day: 'numeric', month: 'short' });
}