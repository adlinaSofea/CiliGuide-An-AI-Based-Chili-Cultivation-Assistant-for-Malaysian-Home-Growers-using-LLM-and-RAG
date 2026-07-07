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
window._lastDiseaseResult = null;

// ── GUEST LIMIT ───────────────────────────────────────────────
function checkGuestLimit() {
    const user = auth.currentUser;
    if (user) return true;
    if (localStorage.getItem("disease_used") === "true") {
        alert("⚠️ You have reached the free limit. Please register to continue.");
        window.location.href = "login.html";
        return false;
    }
    return true;
}

// ── MODAL ─────────────────────────────────────────────────────
function showModal() {
    const modal = document.getElementById("saveModal");
    if (!modal) return;
    modal.classList.add("show");
}

function hideModal() {
    const modal = document.getElementById("saveModal");
    if (!modal) return;
    modal.classList.remove("show");
}

// ── LOADER ────────────────────────────────────────────────────
let loadingInterval;

function showLoader() {
    const btn       = document.getElementById("detectBtn");
    const textEl    = document.getElementById("btnText");
    const loadingEl = document.getElementById("btnGenerating");

    textEl.classList.add("hidden");
    loadingEl.classList.remove("hidden");

    const messages = [
        "Analyzing symptoms",
        "Matching disease patterns",
        "Identifying possible infection",
        "Generating treatment suggestions",
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
    const btn       = document.getElementById("detectBtn");
    const textEl    = document.getElementById("btnText");
    const loadingEl = document.getElementById("btnGenerating");

    textEl.classList.remove("hidden");
    loadingEl.classList.add("hidden");
    if (btn) btn.disabled = false;
}

// ── TOAST ─────────────────────────────────────────────────────
function showToast(message = "✅ Report saved!") {
    const existing = document.getElementById("saveToast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.id = "saveToast";
    toast.className = "toast";
    toast.innerText = message;
    toast.style.pointerEvents = "none";
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
        requestAnimationFrame(() => toast.classList.add("show"));
    });

    setTimeout(() => {
        toast.classList.remove("show");
        setTimeout(() => {
            if (toast && toast.parentNode) toast.remove();
        }, 300);
    }, 3000);
}

// ── FORM SUBMIT ───────────────────────────────────────────────
document.getElementById("diseaseForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    await detectDisease();
});

// ── MAIN DETECTION ────────────────────────────────────────────
async function detectDisease() {
    if (!checkGuestLimit()) return;

    // Collect checked symptoms
    const checkboxes = document.querySelectorAll('.checkbox-group input[type="checkbox"]:checked');
    const selectedSymptoms = Array.from(checkboxes).map(cb => cb.value);

    const chiliType       = document.getElementById("chiliVariety").value;
    const growthStage     = document.getElementById("growthStage").value;
    const additionalDetails = document.getElementById("symptomsDetails").value.trim();

    // Validation
    if (!chiliType || !growthStage) {
        alert("Please select chili variety and growth stage!");
        return;
    }
    if (selectedSymptoms.length === 0 && !additionalDetails) {
        alert("Please select at least one symptom or provide additional details!");
        return;
    }

    // Build symptoms string
    let symptomsText = "";
    if (selectedSymptoms.length > 0) {
        symptomsText = "The plant shows: " + selectedSymptoms.join(", ") + ".";
    }
    if (additionalDetails) {
        symptomsText += (symptomsText ? " " : "") + additionalDetails;
    }

    const input = {
        chili_type:   chiliType,
        growth_stage: growthStage,
        symptoms:     symptomsText,
    };

    console.log("Sending to backend:", input);

    showLoader();
    document.getElementById("resultCard").classList.add("hidden");

    try {
        const response = await fetch(`${BACKEND_URL}/api/disease`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
        });

        if (!response.ok) throw new Error("Server error: " + response.status);

        const data = await response.json();
        console.log("Backend response:", data);

        // Backend returns structured fields — pass data object directly
        displayResult(data);

        // Store for save — use data.raw for Firestore
        window._lastDiseaseResult = {
            input:  input,
            result: data.raw,
        };

        if (!auth.currentUser) {
            localStorage.setItem("disease_used", "true");
        }

        // Activity log (fire and forget)
        const user = auth.currentUser;
        if (user) {
            addDoc(collection(db, "users", user.uid, "activities"), {
                title:       "Disease Detection",
                description: `${input.chili_type} · ${input.growth_stage} stage`,
                icon:        "🦠",
                color:       "red",
                timestamp:   serverTimestamp(),
            }).catch(err => console.warn("Activity log failed:", err));
        }

    } catch (error) {
        // Show error state in result card
        document.getElementById("resultCard").classList.remove("hidden");
        document.getElementById("diseaseName").textContent = "Error";
        document.getElementById("symptomsList").innerHTML =
            `<li>❌ ${error.message}<br>Make sure backend is running at ${BACKEND_URL}</li>`;
        document.getElementById("actionsList").innerHTML = "";
        document.getElementById("noteText").textContent  = "";
        console.error("Disease API error:", error);

    } finally {
        hideLoader();
    }
}

// ── DISPLAY RESULT ────────────────────────────────────────────
// Backend returns structured fields — no regex parsing needed here
function displayResult(data) {
    playNotifSound();
    const {
        disease_name = "Unknown",
        symptoms     = [],
        actions      = [],
        notes        = "",
    } = data;

    // Disease name
    document.getElementById("diseaseName").textContent = cleanText(disease_name);

    // Symptoms list
    const symptomsList = document.getElementById("symptomsList");
    symptomsList.innerHTML = symptoms.length
        ? symptoms.map(s => `<li>${cleanText(s)}</li>`).join("")
        : "<li>No symptoms listed.</li>";

    // Actions list
    const actionsList = document.getElementById("actionsList");
    actionsList.innerHTML = actions.length
        ? actions.map(a => `<li>${cleanText(a)}</li>`).join("")
        : "<li>No actions listed.</li>";

    // Notes
    document.getElementById("noteText").textContent =
        notes && notes.length >= 10 ? cleanText(notes) : "No additional notes provided.";

    // Show result card
    document.getElementById("resultCard").classList.remove("hidden");
    document.getElementById("resultCard").scrollIntoView({ behavior: "smooth", block: "start" });
}

// ── HELPERS ───────────────────────────────────────────────────

// Strips markdown bold/italic markers then escapes HTML
function cleanText(str) {
    return escapeHtml(
        String(str)
            .replace(/\*\*(.+?)\*\*/g, "$1")   // **bold** → plain
            .replace(/\*(.+?)\*/g, "$1")           // *italic* → plain
            .replace(/`(.+?)`/g, "$1")              // `code` → plain
    );
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

// ── SAVE BUTTON → MODAL ───────────────────────────────────────
document.getElementById("saveBtn").addEventListener("click", () => {
    if (!window._lastDiseaseResult) {
        alert("Please detect a disease first!");
        return;
    }
    showModal();
});

document.getElementById("cancelSave").addEventListener("click", () => {
    hideModal();
});

// ── CONFIRM SAVE → FIRESTORE ──────────────────────────────────
document.getElementById("confirmSave").addEventListener("click", async () => {
    const user = auth.currentUser;
    if (!user) {
        hideModal();
        alert("Please login first!");
        window.location.href = "login.html";
        return;
    }
    if (!window._lastDiseaseResult) {
        hideModal();
        alert("Please detect a disease first!");
        return;
    }

    const confirmBtn = document.getElementById("confirmSave");
    const originalText = confirmBtn.innerText;
    confirmBtn.innerText = "Saving...";
    confirmBtn.disabled = true;

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
                feature:   "disease",
                input:     window._lastDiseaseResult.input,
                result:    window._lastDiseaseResult.result,
                createdAt: serverTimestamp(),
            })
        );

        // Fire and forget
        addDoc(collection(db, "users", user.uid, "activities"), {
            title:       "Saved Disease Report",
            description: `${window._lastDiseaseResult.input.chili_type} · ${window._lastDiseaseResult.input.growth_stage}`,
            icon:        "💾",
            color:       "blue",
            timestamp:   serverTimestamp(),
        }).catch(err => console.warn("Activity log failed:", err));

        hideModal();
        playNotifSound();
        showToast("✅ Report saved successfully!");

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