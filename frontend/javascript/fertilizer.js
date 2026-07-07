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
window._lastFertilizerResult = null;

// ── SECTION CONFIG ────────────────────────────────────────────
// Maps backend key → display label
const SECTIONS = [
    { key: "fertilizer",  label: "🌱 Fertilizer Recommendation" },
    { key: "schedule",    label: "⏱ Application Schedule"       },
    { key: "watering",    label: "💧 Watering Guide"             },
    { key: "sunlight",    label: "🌞 Sunlight Requirement"       },
    { key: "environment", label: "🌡 Environment Conditions"     },
    { key: "soil",        label: "🪴 Soil Information"           },
    { key: "mistakes",    label: "⚠️ Common Mistakes"           },
    { key: "expected",    label: "🌿 Expected Result"            },
    { key: "tip",         label: "📝 Simple Action Tip"          },
];

// ── GUEST LIMIT ───────────────────────────────────────────────
function checkGuestLimit() {
    if (auth.currentUser) return true;
    if (localStorage.getItem("fertilizer_used") === "true") {
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
    document.getElementById("fertilizerToast")?.remove();

    const toast = document.createElement("div");
    toast.id = "fertilizerToast";
    toast.className = "toast";
    toast.innerText = message;
    toast.style.pointerEvents = "none";
    document.body.appendChild(toast);

    requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add("show")));
    setTimeout(() => {
        toast.classList.remove("show");
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ── LOADER ────────────────────────────────────────────────────
let loadingInterval;

function showLoader() {
    const btn      = document.getElementById("generateBtn");
    const textEl   = document.getElementById("btnText");
    const loadingEl = document.getElementById("btnGenerating");

    textEl.classList.add("hidden");
    loadingEl.classList.remove("hidden");
    if (btn) btn.disabled = true;

    const messages = [
        "Analyzing your inputs",
        "Checking soil conditions",
        "Adjusting watering strategy",
        "Optimizing sunlight exposure",
        "Generating best fertilizer plan",
    ];

    let i = 0;
    function updateMessage() {
        loadingEl.innerHTML = messages[i] + '<span class="dots"></span>';
        i = (i + 1) % messages.length;
    }
    updateMessage();
    loadingInterval = setInterval(updateMessage, 2000);
}

function hideLoader() {
    clearInterval(loadingInterval);
    const btn      = document.getElementById("generateBtn");
    const textEl   = document.getElementById("btnText");
    const loadingEl = document.getElementById("btnGenerating");

    textEl.classList.remove("hidden");
    loadingEl.classList.add("hidden");
    if (btn) btn.disabled = false;
}

// ── FORM SUBMIT ───────────────────────────────────────────────
document.getElementById("guidanceForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    await getFertilizerRecommendation();
});

// ── MAIN FUNCTION ─────────────────────────────────────────────
async function getFertilizerRecommendation() {
    if (!checkGuestLimit()) return;

    const input = {
        chili_type:   document.getElementById("chiliVariety").value,
        growth_stage: document.getElementById("growthStage").value,
        soil_type:    document.getElementById("soilType").value,
        moisture:     document.getElementById("moistureLevel").value,
        sunlight:     document.getElementById("sunlightLevel").value,
        location:     document.getElementById("environment").value,
    };

    if (!input.chili_type || !input.growth_stage || !input.soil_type ||
        !input.moisture   || !input.sunlight     || !input.location) {
        alert("Please fill all inputs!");
        return;
    }

    showLoader();
    document.getElementById("recommendationSection").classList.add("hidden");

    try {
        const response = await fetch(`${BACKEND_URL}/api/fertilizer`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.detail || `Server error ${response.status}`);
        }

        const data = await response.json();
        console.log("Backend response:", data);

        // Backend now returns structured fields — pass data directly
        displayResult(data);

        window._lastFertilizerResult = {
            input:  input,
            result: data.raw,
        };

        if (!auth.currentUser) {
            localStorage.setItem("fertilizer_used", "true");
        }

        if (auth.currentUser) {
            addDoc(collection(db, "users", auth.currentUser.uid, "activities"), {
                title:       "Fertilizer Guidance",
                description: `${input.chili_type} · ${input.growth_stage} stage`,
                icon:        "🌿",
                color:       "green",
                timestamp:   serverTimestamp(),
            }).catch(err => console.warn("Activity log failed:", err));
        }

    } catch (error) {
        console.error("Fertilizer API error:", error);
        document.getElementById("recommendationSection").classList.remove("hidden");
        document.getElementById("recommendationContent").innerHTML = `
            <div class="rec-item">
                <p class="rec-body">❌ ${escapeHtml(error.message)}<br>
                Make sure backend is running at ${BACKEND_URL}</p>
            </div>`;
    } finally {
        hideLoader();
    }
}

// ── DISPLAY RESULT ────────────────────────────────────────────
// Backend returns structured fields — just render them
function displayResult(data) {
    playNotifSound();
    const content = document.getElementById("recommendationContent");

    // Filter sections that have actual content
    const populated = SECTIONS.filter(s => data[s.key] && data[s.key].length > 0);

    if (populated.length === 0) {
        // Fallback: render raw text if no sections parsed
        const clean = (data.raw || "No recommendation generated.").replace(/\*\*/g, "");
        content.innerHTML = `
            <div class="rec-item">
                <p class="rec-body">${escapeHtml(clean).replace(/\n/g, "<br>")}</p>
            </div>`;
        document.getElementById("recommendationSection").classList.remove("hidden");
        return;
    }

    content.innerHTML = populated.map((section, i) => {
        const lines = data[section.key];
        const showDivider = i < populated.length - 1;

        // Single line → paragraph, multiple lines → list
        const body = lines.length === 1
            ? `<p class="rec-body">${escapeHtml(lines[0])}</p>`
            : `<ul class="rec-body-list">${lines.map(l => `<li>${escapeHtml(l)}</li>`).join("")}</ul>`;

        return `
            <div class="rec-item">
                <div class="rec-heading">${section.label}</div>
                ${body}
            </div>
            ${showDivider ? '<hr class="rec-divider">' : ""}
        `;
    }).join("");

    document.getElementById("recommendationSection").classList.remove("hidden");
    document.getElementById("recommendationSection").scrollIntoView({ behavior: "smooth", block: "start" });
}

// ── HELPERS ───────────────────────────────────────────────────
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

// ── SAVE BUTTON → MODAL ───────────────────────────────────────
document.getElementById("saveRecommendationBtn").addEventListener("click", () => {
    if (!window._lastFertilizerResult) {
        alert("Please generate a recommendation first!");
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
    if (!window._lastFertilizerResult) {
        hideModal();
        alert("Please generate a recommendation first!");
        return;
    }

    const confirmBtn = document.getElementById("confirmSave");
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
                feature:   "fertilizer",
                input:     window._lastFertilizerResult.input,
                result:    window._lastFertilizerResult.result,
                createdAt: serverTimestamp(),
            })
        );

        addDoc(collection(db, "users", user.uid, "activities"), {
            title:       "Saved Fertilizer Recommendation",
            description: `${window._lastFertilizerResult.input.chili_type} · ${window._lastFertilizerResult.input.growth_stage}`,
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