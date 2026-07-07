// IMPORTS
import { auth, db } from "./firebase-config.js";
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ── NOTIFICATION SOUND ────────────────────────────────────────
function playNotifSound() {
  try {
    const ctx  = new (window.AudioContext || window.webkitAudioContext)();
    const time = ctx.currentTime;
    const notes = [523, 659, 784];
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

// ── STATE ─────────────────────────────────────────────────────
const BACKEND_URL = "https://ciliguide.my";
window._lastHarvestResult = null;

// ── SECTION CONFIG ────────────────────────────────────────────
const SECTIONS = [
    { emoji: "📦", label: "📦 Storage Recommendation"  },
    { emoji: "🍽️", label: "🍽️ Cooking Suggestions"    },
    { emoji: "🕒", label: "🕒 Preservation Methods"    },
    { emoji: "🌡", label: "🌡 Handling Tips"           },
    { emoji: "🧴", label: "🧴 Drying / Processing"     },
    { emoji: "❄️", label: "❄️ Freezing Instructions"  },
];

// ── GUEST LIMIT ───────────────────────────────────────────────
function checkGuestLimit() {
    const user = auth.currentUser;
    if (user) return true;
    if (localStorage.getItem("harvest_used") === "true") {
        alert("⚠️ You have reached the free limit. Please register to continue.");
        window.location.href = "login.html";
        return false;
    }
    return true;
}

// ── MODAL ─────────────────────────────────────────────────────
function showModal() { document.getElementById("saveModal")?.classList.add("show"); }
function hideModal() { document.getElementById("saveModal")?.classList.remove("show"); }

// ── TOAST ─────────────────────────────────────────────────────
function showToast(message = "✅ Recommendation saved!") {
    document.getElementById("harvestToast")?.remove();
    const toast = document.createElement("div");
    toast.id = "harvestToast";
    toast.className = "toast";
    toast.innerText = message;
    toast.style.pointerEvents = "none";
    document.body.appendChild(toast);
    requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add("show")));
    setTimeout(() => {
        toast.classList.remove("show");
        setTimeout(() => { if (toast?.parentNode) toast.remove(); }, 300);
    }, 3000);
}

// ── LOADER ────────────────────────────────────────────────────
let loadingInterval;

function showLoader() {
    const btn       = document.getElementById("generateBtn");
    const textEl    = document.getElementById("btnText");
    const loadingEl = document.getElementById("btnGenerating");
    textEl.classList.add("hidden");
    loadingEl.classList.remove("hidden");
    const messages = [
        "Analyzing harvest condition",
        "Checking freshness & usability",
        "Assessing storage suitability",
        "Generating post-harvest suggestions",
    ];
    let i = 0;
    function updateMessage() {
        loadingEl.innerHTML = messages[i] + '<span class="dots"></span>';
        i = (i + 1) % messages.length;
    }
    updateMessage();
    loadingInterval = setInterval(updateMessage, 2000);
    if (btn) btn.disabled = true;
}

function hideLoader() {
    clearInterval(loadingInterval);
    const btn       = document.getElementById("generateBtn");
    const textEl    = document.getElementById("btnText");
    const loadingEl = document.getElementById("btnGenerating");
    textEl.classList.remove("hidden");
    loadingEl.classList.add("hidden");
    if (btn) btn.disabled = false;
}

// ── FORM SUBMIT ───────────────────────────────────────────────
document.getElementById("harvestForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    await getHarvestSuggestion();
});

// ── MAIN FUNCTION ─────────────────────────────────────────────
async function getHarvestSuggestion() {
    if (!checkGuestLimit()) return;

    const input = {
        chili_type:  document.getElementById("chiliVariety").value,
        condition:   document.getElementById("condition").value,
        quantity:    document.getElementById("quantity").value.trim(),
        fruit_color: document.getElementById("fruitColor").value,
    };

    if (!input.chili_type || !input.condition || !input.quantity || !input.fruit_color) {
        alert("Please fill all inputs!");
        return;
    }

    showLoader();
    document.getElementById("resultCard").classList.add("hidden");

    try {
        const response = await fetch(`${BACKEND_URL}/api/post-harvest`, {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify(input),
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.detail || `Server error ${response.status}`);
        }

        const data = await response.json();
        console.log("Backend response:", data);

        if (data.sections && Object.keys(data.sections).length > 0) {
            displayStructured(data.sections);
            playNotifSound();
        } else {
            const raw = data.result || data.raw || data.output || data.response || "";
            displayFromRaw(raw);
        }

        playNotifSound();

        window._lastHarvestResult = {
            input,
            result: data.result || data.raw || "",
        };

        if (!auth.currentUser) {
            localStorage.setItem("harvest_used", "true");
        }

        if (auth.currentUser) {
            addDoc(collection(db, "users", auth.currentUser.uid, "activities"), {
                title:       "Post-Harvest Suggestion",
                description: `${input.chili_type} · ${input.condition} · ${input.quantity}`,
                icon:        "📦",
                color:       "orange",
                timestamp:   serverTimestamp(),
            }).catch(err => console.warn("Activity log failed:", err));
        }

    } catch (error) {
        console.error("Harvest API error:", error);
        document.getElementById("resultCard").classList.remove("hidden");
        document.getElementById("recList").innerHTML = `
            <div class="rec-item">
                <div class="rec-body">❌ ${escapeHtml(error.message)}<br>
                Make sure backend is running at ${BACKEND_URL}</div>
            </div>`;
    } finally {
        hideLoader();
    }
}

// ── DISPLAY: structured dict from backend ─────────────────────
function displayStructured(sections) {
    const populated = SECTIONS.filter(s => {
        const val = sections[s.emoji] || sections[s.label] || null;
        return val && val.length > 0;
    });

    if (populated.length === 0) {
        displayFallback("No recommendation generated.");
        return;
    }

    document.getElementById("recList").innerHTML = populated.map((s, i) => {
        const lines = sections[s.emoji] || sections[s.label] || [];
        const body  = renderLines(lines);
        const showDivider = i < populated.length - 1;
        return `
            <div class="rec-item">
                <div class="rec-heading">${s.label}</div>
                ${body}
            </div>
            ${showDivider ? '<hr class="rec-divider">' : ""}
        `;
    }).join("");

    document.getElementById("resultCard").classList.remove("hidden");
    document.getElementById("resultCard").scrollIntoView({ behavior: "smooth", block: "start" });
}

// ── DISPLAY: parse raw text when backend returns plain string ──
function displayFromRaw(text) {
    if (!text) { displayFallback("No recommendation generated."); return; }

    const found = [];
    SECTIONS.forEach(s => {
        const re = new RegExp(
            s.emoji.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
            "\\s*.+?[:\\n]",
            "i"
        );
        const m = text.match(re);
        if (m) {
            const idx = text.indexOf(m[0]);
            found.push({ label: s.label, start: idx, end: idx + m[0].length });
        }
    });

    found.sort((a, b) => a.start - b.start);

    if (found.length === 0) {
        displayFallback(text);
        return;
    }

    const parsed = found.map((s, i) => {
        const contentStart = s.end;
        const contentEnd   = found[i + 1] ? found[i + 1].start : text.length;
        const block        = text.slice(contentStart, contentEnd).trim();
        const lines        = block
            .split("\n")
            .map(l => cleanText(l.replace(/^[\s\-–•*]+/, "").trim()))
            .filter(l => l.length > 0);
        return { label: s.label, lines };
    }).filter(s => s.lines.length > 0);

    if (parsed.length === 0) { displayFallback(text); return; }

    document.getElementById("recList").innerHTML = parsed.map((s, i) => {
        const showDivider = i < parsed.length - 1;
        return `
            <div class="rec-item">
                <div class="rec-heading">${s.label}</div>
                ${renderLines(s.lines)}
            </div>
            ${showDivider ? '<hr class="rec-divider">' : ""}
        `;
    }).join("");

    document.getElementById("resultCard").classList.remove("hidden");
    document.getElementById("resultCard").scrollIntoView({ behavior: "smooth", block: "start" });
}

// ── DISPLAY: final fallback for unparseable text ──────────────
function displayFallback(text) {
    document.getElementById("recList").innerHTML = `
        <div class="rec-item">
            <div class="rec-body">${cleanText(text).replace(/\n/g, "<br>")}</div>
        </div>`;
    document.getElementById("resultCard").classList.remove("hidden");
}

// ── RENDER LINES → HTML ───────────────────────────────────────
function renderLines(lines) {
    if (!lines || lines.length === 0) return "";
    const cleaned = lines.map(l => cleanText(String(l)));

    if (cleaned.length === 1) {
        return `<p class="rec-body">${cleaned[0]}</p>`;
    }

    // Lines ending with ':' become bold subheadings; rest become indented bullet items
    let html = '';
    let inList = false;

    cleaned.forEach(line => {
        if (line.endsWith(':')) {
            if (inList) { html += '</ul>'; inList = false; }
            html += `<p style="font-weight:600;margin:12px 0 4px 0;color:#333;">${line}</p>`;
        } else {
            if (!inList) {
                html += '<ul style="margin:0 0 8px 0;padding-left:20px;list-style:disc;color:#e74c3c;">';
                inList = true;
            }
            html += `<li style="margin-bottom:5px;color:#333;">${line}</li>`;
        }
    });

    if (inList) html += '</ul>';
    return html;
}

// ── HELPERS ───────────────────────────────────────────────────
function cleanText(str) {
    return String(str)
        .replace(/\*\*(.+?)\*\*/g, "$1")
        .replace(/\*\*/g, "")
        .replace(/\*(.+?)\*/g, "$1")
        .replace(/\*/g, "")
        .replace(/`(.+?)`/g, "$1")
        .replace(/`/g, "")
        .trim();
}

function escapeHtml(str) {
    return String(str)
        .replace(/&(?!amp;|lt;|gt;|quot;)/g, "&amp;")
        .replace(/"/g, "&quot;");
}

// ── SAVE BUTTON → MODAL ───────────────────────────────────────
document.getElementById("saveBtn").addEventListener("click", () => {
    if (!window._lastHarvestResult) {
        alert("Please generate a suggestion first!");
        return;
    }
    showModal();
});

document.getElementById("cancelSave").addEventListener("click", hideModal);

// ── CONFIRM SAVE → FIRESTORE ──────────────────────────────────
document.getElementById("confirmSave").addEventListener("click", async () => {
    const user = auth.currentUser;
    if (!user) {
        hideModal();
        alert("Please login first!");
        window.location.href = "login.html";
        return;
    }
    if (!window._lastHarvestResult) {
        hideModal();
        alert("Please generate a suggestion first!");
        return;
    }

    const confirmBtn   = document.getElementById("confirmSave");
    const originalText = confirmBtn.innerText;
    confirmBtn.innerText = "Saving...";
    confirmBtn.disabled  = true;

    const saveWithTimeout = (promise, ms = 8000) =>
        Promise.race([
            promise,
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error("Save timed out")), ms)
            ),
        ]);

    try {
        await saveWithTimeout(
            addDoc(collection(db, "users", user.uid, "history"), {
                feature:   "post-harvest",
                input:     window._lastHarvestResult.input,
                result:    window._lastHarvestResult.result,
                createdAt: serverTimestamp(),
            })
        );

        addDoc(collection(db, "users", user.uid, "activities"), {
            title:       "Saved Post-Harvest Suggestion",
            description: `${window._lastHarvestResult.input.chili_type} · ${window._lastHarvestResult.input.condition}`,
            icon:        "💾",
            color:       "blue",
            timestamp:   serverTimestamp(),
        }).catch(err => console.warn("Activity log failed:", err));

        hideModal();
        playNotifSound();
        showToast("✅ Recommendation saved!");

    } catch (err) {
        console.error("Save error:", err);
        hideModal();
        alert("❌ Save failed: " + err.message);

    } finally {
        confirmBtn.innerText           = originalText;
        confirmBtn.disabled            = false;
        confirmBtn.style.pointerEvents = "auto";
        confirmBtn.style.opacity       = "1";
    }
});