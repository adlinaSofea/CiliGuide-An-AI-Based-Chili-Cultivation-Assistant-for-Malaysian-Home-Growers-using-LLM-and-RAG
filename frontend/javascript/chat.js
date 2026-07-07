
// IMPORTS

import { auth, db } from "./firebase-config.js";
import {
    collection, addDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";


// STATE

const BACKEND_URL   = "https://ciliguide.my";
const GUEST_LIMIT   = 3;
let currentChatId   = null;
let currentMessages = [];
let allChats        = {};
let isWaiting       = false;
let currentUser     = null;


// INIT

document.addEventListener('DOMContentLoaded', () => {
    loadAllChatsFromStorage();
    renderChatHistory();
    updateGuestBar();

    document.getElementById('userInput')?.focus();

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.chat-menu-btn') && !e.target.closest('.chat-menu')) {
            document.querySelectorAll('.chat-menu.open').forEach(m => m.classList.remove('open'));
        }
    });
});


// AUTH STATE

onAuthStateChanged(auth, (user) => {
    currentUser = user;
    updateGuestBar();
});


// GUEST LIMIT HELPERS

function getGuestCount() {
    return parseInt(localStorage.getItem('chat_guest_count') || '0');
}

function incrementGuestCount() {
    if (currentUser) return;
    localStorage.setItem('chat_guest_count', getGuestCount() + 1);
}

function checkGuestLimit() {
    if (currentUser) return true;

    if (getGuestCount() >= GUEST_LIMIT) {
        alert("⚠️ You have reached the free limit of 3 messages. Please register to continue chatting.");
        window.location.href = "login.html";
        return false;
    }
    return true;
}

function updateGuestBar() {
    const bar  = document.getElementById('guestLimitBar');
    const text = document.getElementById('guestLimitText');
    if (!bar || !text) return;

    if (currentUser) {
        bar.style.display = 'none';
        return;
    }

    const used      = getGuestCount();
    const remaining = Math.max(GUEST_LIMIT - used, 0);

    bar.style.display = 'flex';

    if (remaining === 0) {
        text.textContent      = '⚠️ Free limit reached.';
        bar.style.background  = '#fdecea';
        bar.style.borderColor = '#e74c3c';
        text.style.color      = '#e74c3c';
    } else if (remaining === 1) {
        text.textContent      = '⚠️ 1 free message remaining.';
        bar.style.background  = '#fff3e0';
        bar.style.borderColor = '#e67e22';
        text.style.color      = '#e67e22';
    } else {
        text.textContent      = `${remaining} free messages remaining`;
        bar.style.background  = '#f8f8f8';
        bar.style.borderColor = '#eee';
        text.style.color      = '#888';
    }
}


// LOCAL STORAGE HELPERS

function saveAllChats() {
    localStorage.setItem('ciliguide_chats', JSON.stringify(allChats));
}

function loadAllChatsFromStorage() {
    const stored = localStorage.getItem('ciliguide_chats');
    if (stored) {
        try { allChats = JSON.parse(stored); }
        catch { allChats = {}; }
    }
}

function generateChatId() {
    return 'chat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
}


// DISCLAIMER HELPER

function addDisclaimer() {
    const container = document.getElementById('messagesContainer');

    // Remove ALL existing disclaimers first
    container.querySelectorAll('.disclaimer').forEach(d => d.remove());

    const disc       = document.createElement('div');
    disc.className   = 'disclaimer';
    disc.textContent = '⚠️ CiliGuide is an AI and may make mistakes. Please verify important information.';
    container.appendChild(disc);
}


// NEW CHAT
window.newChat = function () {
    currentChatId   = null;
    currentMessages = [];

    const container = document.getElementById('messagesContainer');
    container.innerHTML = `
        <div class="empty-state" id="emptyState">
            <div class="empty-state-icon"></div>
            <p><strong><img src="../assets/images/chili_logo3.png">Welcome to CiliGuide!</strong></p>
            <p>Ask me anything about chili cultivation, disease detection, or farming tips.</p>
        </div>
    `;

    // Add disclaimer once via helper
    addDisclaimer();

    document.querySelectorAll('.chat-item').forEach(i => i.classList.remove('active'));
    document.getElementById('userInput')?.focus();
};


// LOAD CHAT

window.loadChat = function (chatId, event) {
    if (event) event.stopPropagation();

    const chat = allChats[chatId];
    if (!chat) return;

    currentChatId   = chatId;
    currentMessages = [...chat.messages];

    document.querySelectorAll('.chat-item').forEach(i => i.classList.remove('active'));
    document.querySelector(`[data-chat-id="${chatId}"]`)?.classList.add('active');

    const container = document.getElementById('messagesContainer');
    container.innerHTML = '';

    // Render all messages WITHOUT adding disclaimer each time
    currentMessages.forEach(msg => {
        appendMessageToDOM(msg.role, msg.content, false);
    });

    // Add disclaimer ONCE at the very end
    addDisclaimer();

    scrollToBottom();
    document.getElementById('userInput')?.focus();
};


// RENDER CHAT HISTORY SIDEBAR

function renderChatHistory() {
    const historyEl = document.getElementById('chatHistory');
    if (!historyEl) return;

    historyEl.innerHTML = '';

    const sorted = Object.values(allChats).sort(
        (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)
    );

    if (sorted.length === 0) {
        historyEl.innerHTML = `
            <div style="padding:1rem;text-align:center;color:#aaa;font-size:.85rem;">
                No chats yet. Start a new conversation!
            </div>`;
        return;
    }

    sorted.forEach(chat => {
        const item          = document.createElement('div');
        item.className      = 'chat-item' + (chat.id === currentChatId ? ' active' : '');
        item.dataset.chatId = chat.id;

        item.innerHTML = `
            <div class="chat-item-content" onclick="loadChat('${chat.id}', event)">
                <div class="chat-title">${escapeHtml(chat.title)}</div>
                <div class="chat-time">${formatTimeAgo(chat.updatedAt)}</div>
            </div>
            <button class="chat-menu-btn" onclick="toggleChatMenu('${chat.id}', event)">⋮</button>
            <div class="chat-menu" id="chatMenu_${chat.id}">
                <button onclick="deleteChat('${chat.id}', event)">🗑️ Delete</button>
            </div>
        `;

        historyEl.appendChild(item);
    });
}


// SEND MESSAGE

window.sendMessage = async function () {
    const input = document.getElementById('userInput');
    const text  = input?.value.trim();

    if (!text || isWaiting) return;

    if (!checkGuestLimit()) return;

    input.value = '';
    isWaiting   = true;

    const emptyState = document.getElementById('emptyState');
    if (emptyState) emptyState.remove();

    if (!currentChatId) {
        currentChatId   = generateChatId();
        currentMessages = [];
        allChats[currentChatId] = {
            id:        currentChatId,
            title:     text.length > 40 ? text.substring(0, 40) + '...' : text,
            messages:  [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        renderChatHistory();
    }

    currentMessages.push({ role: 'user', content: text });
    appendMessageToDOM('user', text, true);

    const typingId = showTyping();

    try {
        const response = await fetch(`${BACKEND_URL}/api/advisory`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ question: text })
        });

        if (!response.ok) throw new Error('Server error: ' + response.status);

        const data  = await response.json();
        const reply = data.result || 'Sorry, I could not generate a response.';

        removeTyping(typingId);

        currentMessages.push({ role: 'assistant', content: reply });
        appendMessageToDOM('assistant', reply, true);

        allChats[currentChatId].messages  = [...currentMessages];
        allChats[currentChatId].updatedAt = new Date().toISOString();
        saveAllChats();
        renderChatHistory();

        incrementGuestCount();
        updateGuestBar();

        saveActivityLog(text, reply);

    } catch (error) {
        removeTyping(typingId);
        appendMessageToDOM('assistant',
            `❌ Error: ${error.message}\nMake sure backend is running at ${BACKEND_URL}`,
            true
        );
        console.error('Chat error:', error);
    } finally {
        isWaiting = false;
        document.getElementById('userInput')?.focus();
    }
};


// SAVE ACTIVITY LOG → FIRESTORE

async function saveActivityLog(question, reply) {
    if (!currentUser) return;

    try {
        addDoc(collection(db, 'users', currentUser.uid, 'activities'), {
            title:       'Chat Advisory',
            description: question.length > 60
                ? question.substring(0, 60) + '...'
                : question,
            icon:        '💬',
            color:       'blue',
            timestamp:   serverTimestamp()
        }).catch(err => console.warn('Activity log failed:', err));

        addDoc(collection(db, 'users', currentUser.uid, 'history'), {
            feature:   'chat',
            input:     { question },
            result:    reply,
            createdAt: serverTimestamp()
        }).catch(err => console.warn('History save failed:', err));

    } catch (err) {
        console.warn('saveActivityLog error:', err);
    }
}


// APPEND MESSAGE TO DOM

function appendMessageToDOM(role, content, animate) {
    const container = document.getElementById('messagesContainer');

    // Remove all disclaimers before adding message
    container.querySelectorAll('.disclaimer').forEach(d => d.remove());

    const wrapper     = document.createElement('div');
    wrapper.className = `message-wrapper ${role}${animate ? ' animate-in' : ''}`;

    if (role === 'user') {
        wrapper.innerHTML = `
            <div class="message user-message">
                ${escapeHtml(content)}
            </div>
        `;
    } else {
        wrapper.innerHTML = `
            <div class="message assistant-message">
                <div class="message-content">${formatMessage(content)}</div>
            </div>
        `;
    }

    container.appendChild(wrapper);

    // Re-add disclaimer ONCE via helper
    addDisclaimer();

    scrollToBottom();
}


// FORMAT MESSAGE

function formatMessage(text) {
    if (!text) return '';

    let formatted = escapeHtml(text);

    //Remove "🌶️ Chili Advisory:" prefix if present
    //formatted = formatted.replace(/^🌶️\s*Chili Advisory:\s*/i, '');

    // Bold **text**
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    //Headers — lines ending with : that are short (section titles)
    formatted = formatted.replace(
        /^([A-Z][^:\n]{3,60}):\s*$/gm,
        '<div class="msg-section-title">$1</div>'
    );

    //Numbered lists  1. item
    formatted = formatted.replace(
        /^(\d+)\.\s+(.+)$/gm,
        '<div class="msg-list-item"><span class="msg-num">$1.</span><span>$2</span></div>'
    );

    //Bullet points - item or • item
    formatted = formatted.replace(
        /^[\s]*[-•]\s+(.+)$/gm,
        '<div class="msg-bullet"><span class="msg-dot">•</span><span>$1</span></div>'
    );

    // Line breaks — but not after block elements
    formatted = formatted.replace(/\n{2,}/g, '<div class="msg-spacer"></div>');
    formatted = formatted.replace(/\n/g, '<br>');

    return formatted;
}


// TYPING INDICATOR
function showTyping() {
    const container = document.getElementById('messagesContainer');

    // Remove disclaimers before adding typing
    container.querySelectorAll('.disclaimer').forEach(d => d.remove());

    const id        = 'typing_' + Date.now();
    const wrapper   = document.createElement('div');
    wrapper.className = 'message-wrapper assistant';
    wrapper.id        = id;
    wrapper.innerHTML = `
        <div class="message assistant-message typing-indicator">
            <span></span><span></span><span></span>
        </div>
    `;
    container.appendChild(wrapper);

    // Add disclaimer once via helper
    addDisclaimer();

    scrollToBottom();
    return id;
}

function removeTyping(id) {
    document.getElementById(id)?.remove();
}


// DELETE CHAT
window.deleteChat = function (chatId, event) {
    if (event) event.stopPropagation();

    const chat = allChats[chatId];
    if (!chat) return;

    if (!confirm(`Delete "${chat.title}"?`)) return;

    delete allChats[chatId];
    saveAllChats();

    if (currentChatId === chatId) window.newChat();

    renderChatHistory();
};


// TOGGLE CHAT MENU
window.toggleChatMenu = function (chatId, event) {
    if (event) event.stopPropagation();

    document.querySelectorAll('.chat-menu.open').forEach(m => {
        if (m.id !== `chatMenu_${chatId}`) m.classList.remove('open');
    });

    document.getElementById(`chatMenu_${chatId}`)?.classList.toggle('open');
};


// SIDEBAR TOGGLE

window.toggleSidebar = function () {
    document.getElementById('sidebar')?.classList.toggle('open');
};


// HANDLE ENTER KEY

window.handleKeyPress = function (event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        window.sendMessage();
    }
};


// SCROLL TO BOTTOM

function scrollToBottom() {
    const container = document.getElementById('messagesContainer');
    if (container) {
        setTimeout(() => { container.scrollTop = container.scrollHeight; }, 50);
    }
}


// HELPERS

function escapeHtml(text) {
    const d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
}

function formatTimeAgo(dateStr) {
    const now  = new Date();
    const date = new Date(dateStr);
    const diff = now - date;

    if (diff < 60000)    return 'Just now';
    if (diff < 3600000)  return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
    if (diff < 7 * 86400000) return `${Math.floor(diff / 86400000)} days ago`;

    return date.toLocaleDateString('en-MY', { day: 'numeric', month: 'short' });
}