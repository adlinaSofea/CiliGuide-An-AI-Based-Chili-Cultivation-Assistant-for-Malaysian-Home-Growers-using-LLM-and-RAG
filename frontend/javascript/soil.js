// IMPORTS

import { auth, db } from "./firebase-config.js";
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ── NOTIFICATION SOUND ────────────────────────────────────────
function playNotifSound() {
  try {
    const ctx  = new (window.AudioContext || window.webkitAudioContext)();
    const time = ctx.currentTime;

    const notes = [523, 659, 784]; // C, E, G — soft marimba chord
    notes.forEach((freq, i) => {
      const osc  = ctx.createOscillator();
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
  } catch (e) {}
}

// STATE

const BACKEND_URL = "https://ciliguide.my";
let selectedFile = null;
let lastAnalysisResult = null;


// DOM REFS

const uploadZone    = document.getElementById('uploadZone');
const fileInput     = document.getElementById('fileInput');
const uploadEmpty   = document.getElementById('uploadEmpty');
const uploadPreview = document.getElementById('uploadPreview');
const previewImg    = document.getElementById('previewImg');
const fileInfo      = document.getElementById('fileInfo');
const fileName      = document.getElementById('fileName');
const fileSize      = document.getElementById('fileSize');
const analyseBtn    = document.getElementById('analyseBtn');
const btnText       = document.getElementById('btnText');
const btnLoader     = document.getElementById('btnLoader');
const btnArrow      = document.getElementById('btnArrow');
const resultsPanel  = document.getElementById('resultsPanel');


// GUEST LIMIT (1 USE)

function checkGuestLimit() {
    const user = auth.currentUser;
    if (user) return true;

    const used = localStorage.getItem("soil_used");
    if (used === "true") {
        alert("⚠️ You have reached the free limit. Please register to continue.");
        window.location.href = "login.html";
        return false;
    }
    return true;
}


// MODAL HELPERS

function showModal() {
    const modal = document.getElementById('saveModal');
    if (!modal) return;
    modal.classList.add('show');
}

function hideModal() {
    const modal = document.getElementById('saveModal');
    if (!modal) return;
    modal.classList.remove('show');
}


// TOAST HELPER

function showToast(message = "✅ Saved!") {
    const existing = document.getElementById('soilToast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id        = 'soilToast';
    toast.className = 'toast';
    toast.innerText = message;
    toast.style.pointerEvents = 'none';
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
        requestAnimationFrame(() => toast.classList.add('show'));
    });

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => { if (toast.parentNode) toast.remove(); }, 300);
    }, 3000);
}


// LOADER HELPERS

// LOADER HELPERS

function showLoader() {
    analyseBtn.disabled = true;
    analyseBtn.innerHTML = `
        <span class="soil-spinner"></span>
        <span class="soil-loading-text" id="soilLoadingText">Analysing image...</span>
    `;

    // Cycle through status messages
    const messages = [
        'Analysing image...',
        'Reading soil texture...',
        'Detecting moisture level...',
        'Generating recommendations...',
        'Almost done...'
    ];

    let i = 0;
    window._soilMsgInterval = setInterval(() => {
        i++;
        const el = document.getElementById('soilLoadingText');
        if (el && i < messages.length) {
            el.textContent = messages[i];
        }
    }, 1200);
}

function hideLoader() {
    clearInterval(window._soilMsgInterval);
    analyseBtn.disabled  = false;
    analyseBtn.innerHTML = `
        <span id="btnText">Analyse Soil</span>
        <span id="btnArrow">→</span>
        <span id="btnLoader" class="hidden"></span>
    `;
}


// FILE HANDLING

function handleFile(file) {
    if (!file || !file.type.startsWith('image/')) {
        alert('Please upload a valid image file (JPG, PNG, WEBP).');
        return;
    }

    if (file.size > 10 * 1024 * 1024) {
        alert('File is too large. Maximum size is 10MB.');
        return;
    }

    selectedFile = file;

    const reader = new FileReader();
    reader.onload = (e) => {
        previewImg.src = e.target.result;
        uploadEmpty.classList.add('hidden');
        uploadPreview.classList.remove('hidden');
    };
    reader.readAsDataURL(file);

    fileName.textContent = file.name;
    fileSize.textContent = formatFileSize(file.size);
    fileInfo.classList.remove('hidden');

    analyseBtn.disabled = false;
    resultsPanel.classList.add('hidden');
    lastAnalysisResult = null;
}

function formatFileSize(bytes) {
    if (bytes < 1024)        return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function clearFile() {
    selectedFile    = null;
    fileInput.value = '';
    previewImg.src  = '';
    lastAnalysisResult = null;

    uploadEmpty.classList.remove('hidden');
    uploadPreview.classList.add('hidden');
    fileInfo.classList.add('hidden');

    analyseBtn.disabled = true;
    resultsPanel.classList.add('hidden');
}


// FILE INPUT EVENTS

fileInput.addEventListener('change', (e) => {
    if (e.target.files[0]) handleFile(e.target.files[0]);
});

uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.classList.add('drag-over');
});

uploadZone.addEventListener('dragleave', () => {
    uploadZone.classList.remove('drag-over');
});

uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
});

uploadZone.addEventListener('click', (e) => {
    if (e.target.closest('.btn-browse') || e.target.closest('.btn-change')) return;
    if (selectedFile) return;
    fileInput.click();
});

document.getElementById('clearBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    clearFile();
});


// ANALYSE BUTTON

analyseBtn.addEventListener('click', async () => {
    if (!selectedFile) return;
    await analyseSoil();
});


// CALL FASTAPI

async function analyseSoil() {

    if (!checkGuestLimit()) return;

    showLoader();
    resultsPanel.classList.add('hidden');

    try {
        const formData = new FormData();
        formData.append('file', selectedFile);

        const response = await fetch(`${BACKEND_URL}/api/soil`, {
            method: 'POST',
            body:   formData
        });

        if (!response.ok) throw new Error('Server error: ' + response.status);

        const data = await response.json();

        displayResults(data);

        // Mark as used for guest
        if (!auth.currentUser) {
            localStorage.setItem("soil_used", "true");
        }

        // Fire and forget activity log
        const user = auth.currentUser;
        if (user) {
            addDoc(collection(db, 'users', user.uid, 'activities'), {
                title:       'Soil Analysis',
                description: `${data.moisture_level} moisture · ${data.moisture_confidence} confidence`,
                icon:        '🌱',
                color:       'green',
                timestamp:   serverTimestamp()
            }).catch(err => console.warn('Activity log failed:', err));
        }

    } catch (error) {
        alert(
            '❌ Analysis failed: ' + error.message +
            '\nMake sure backend is running at ' + BACKEND_URL
        );
        console.error('Soil analysis error:', error);

    } finally {
        hideLoader();
    }
}


// DISPLAY RESULTS

function displayResults(data) {
    playNotifSound();
    const { moisture_level, moisture_confidence, explanation, recommendations } = data;

    // Timestamp
    document.getElementById('resultsTs').textContent =
        'Analysed on ' + new Date().toLocaleString('en-MY', {
            day:    'numeric',
            month:  'long',
            year:   'numeric',
            hour:   '2-digit',
            minute: '2-digit'
        });

    // Moisture label (no percentage)
    const levelLabels = { dry: 'Dry', moist: 'Moist', wet: 'Wet' };
    const moistureEl = document.getElementById('moistureValue');
    if (moistureEl) {
        moistureEl.textContent = levelLabels[(moisture_level || '').toLowerCase()] || '—';
    }

    // Confidence value
    const confPct  = parseInt(moisture_confidence) || 50;
    const confEl   = document.getElementById('confValue');
    if (confEl) {
        confEl.innerHTML = confPct + '<span class="metric-unit">%</span>';
    }

    // Confidence status
    const confStatusEl = document.getElementById('confStatus');
    if (confStatusEl) {
        if (confPct >= 70) {
            confStatusEl.textContent = '✓ High confidence';
            confStatusEl.style.color = '#2e7d32';
        } else if (confPct >= 40) {
            confStatusEl.textContent = '⚠ Moderate confidence';
            confStatusEl.style.color = '#f39c12';
        } else {
            confStatusEl.textContent = '✗ Low confidence';
            confStatusEl.style.color = '#e74c3c';
        }
    }

    // Explanation
    const expEl = document.getElementById('expBody');
    if (expEl) {
        if (explanation && explanation.trim().length > 0) {
            expEl.textContent      = explanation;
            expEl.style.fontStyle  = 'normal';
            expEl.style.color      = '#555';
        } else {
            expEl.textContent      = 'The model could not generate an explanation for this image. Try uploading a clearer photo of your soil.';
            expEl.style.fontStyle  = 'italic';
            expEl.style.color      = '#999';
        }
    }

    // Fallback recommendations
    const fallbackRecos = {
        dry: [
            'Water your soil immediately.',
            'Use mulch to retain moisture.',
            'Water early morning or evening.'
        ],
        moist: [
            'Soil is optimal for growth.',
            'Ensure good drainage.',
            'Add organic compost.'
        ],
        wet: [
            'Reduce watering immediately.',
            'Improve drainage system.',
            'Check for root rot risk.'
        ]
    };

    // Use AI recommendations or fallback
    const recos = (recommendations && Array.isArray(recommendations) && recommendations.length > 0)
        ? recommendations
        : fallbackRecos[(moisture_level || '').toLowerCase()] || fallbackRecos.moist;

    // Display recommendations
    const recoListEl = document.getElementById('recoList');
    if (recoListEl) {
        recoListEl.innerHTML = recos.map(text => `
            <div class="reco-item">${text}</div>
        `).join('');
    }

    lastAnalysisResult = {
        moisture_level,
        moisture_confidence,
        explanation,
        recommendations: recos,
        analysedAt: new Date().toISOString(),
        fileName:   selectedFile?.name || '',
    };

    resultsPanel.classList.remove('hidden');
    resultsPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}


// NEW ANALYSIS BUTTON

document.getElementById('newAnalysisBtn').addEventListener('click', () => {
    clearFile();
    window.scrollTo({ top: 0, behavior: 'smooth' });
});


// SAVE BUTTON → SHOW MODAL

document.getElementById('saveResultBtn').addEventListener('click', () => {
    if (!lastAnalysisResult) {
        alert('Please analyse soil first!');
        return;
    }

    const user = auth.currentUser;
    if (!user) {
        alert('Please login to save reports!');
        window.location.href = 'login.html';
        return;
    }

    showModal();
});

document.getElementById('cancelSave').addEventListener('click', () => {
    hideModal();
});


// CONFIRM SAVE → FIRESTORE

document.getElementById('confirmSave').addEventListener('click', async () => {
    const user = auth.currentUser;
    if (!user || !lastAnalysisResult) {
        hideModal();
        return;
    }

    const confirmBtn   = document.getElementById('confirmSave');
    const originalText = confirmBtn.innerText;
    confirmBtn.innerText  = 'Saving...';
    confirmBtn.disabled   = true;

    const saveWithTimeout = (promise, ms = 8000) =>
        Promise.race([
            promise,
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Save timed out')), ms)
            )
        ]);

    try {
        await saveWithTimeout(
            addDoc(collection(db, 'users', user.uid, 'history'), {
                feature:   'soil',
                result:    lastAnalysisResult,
                createdAt: serverTimestamp()
            })
        );

        // Fire and forget activity log
        addDoc(collection(db, 'users', user.uid, 'activities'), {
            title:       'Saved Soil Report',
            description: `${lastAnalysisResult.moisture_level} moisture · ${lastAnalysisResult.moisture_confidence}`,
            icon:        '💾',
            color:       'blue',
            timestamp:   serverTimestamp()
        }).catch(err => console.warn('Activity log failed:', err));

        hideModal();
        playNotifSound();
        showToast('✅ Soil report saved!');

    } catch (err) {
        console.error('Save error:', err);
        hideModal();
        alert('❌ Save failed: ' + err.message);

    } finally {
        confirmBtn.innerText           = originalText;
        confirmBtn.disabled            = false;
        confirmBtn.style.pointerEvents = 'auto';
        confirmBtn.style.opacity       = '1';
    }
});