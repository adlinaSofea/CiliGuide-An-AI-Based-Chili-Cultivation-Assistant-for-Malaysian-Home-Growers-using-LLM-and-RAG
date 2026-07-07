// IMPORTS
import { auth, db } from "./firebase-config.js";
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";


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

// STATE
let currentUser = null;
let lastPlanResult = null;
let currentStep = 1;
const TOTAL_STEPS = 5;

const answers = { q1: null, q2: null, q3: null, q4: null, q5: null };

onAuthStateChanged(auth, (user) => { currentUser = user; });


// ── OPEN / CLOSE QUIZ ────────────────────────────────────────

window.openQuiz = function () {
    // Reset
    currentStep = 1;
    Object.keys(answers).forEach(k => answers[k] = null);

    document.querySelectorAll('.opt-tile, .opt-row').forEach(el => {
        el.classList.remove('selected');
        const check = el.querySelector('.or-check');
        if (check) check.textContent = '○';
    });

    for (let i = 1; i <= TOTAL_STEPS; i++) {
        document.getElementById('qq' + i)?.classList.remove('active');
    }
    document.getElementById('qq1').classList.add('active');

    updateQuizUI();
    document.getElementById('quizOverlay').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
};

window.closeQuiz = function () {
    document.getElementById('quizOverlay').classList.add('hidden');
    document.body.style.overflow = '';
};


// ── SELECT OPTION ────────────────────────────────────────────

window.selectOpt = function (el) {
    const q = el.dataset.q;
    const val = el.dataset.val;

    document.querySelectorAll(`[data-q="${q}"]`).forEach(opt => {
        opt.classList.remove('selected');
        const check = opt.querySelector('.or-check');
        if (check) check.textContent = '○';
    });

    el.classList.add('selected');
    const check = el.querySelector('.or-check');
    if (check) check.textContent = '✅';

    answers[q] = val;
    document.getElementById('quizNextBtn').disabled = false;
};


// ── NAVIGATION ───────────────────────────────────────────────

window.quizNext = function () {
    if (!answers['q' + currentStep]) return;

    if (currentStep === TOTAL_STEPS) {
        closeQuiz();
        startGenerating();
        return;
    }

    document.getElementById('qq' + currentStep).classList.remove('active');
    currentStep++;
    document.getElementById('qq' + currentStep).classList.add('active');
    updateQuizUI();
};

window.quizBack = function () {
    if (currentStep <= 1) return;
    document.getElementById('qq' + currentStep).classList.remove('active');
    currentStep--;
    document.getElementById('qq' + currentStep).classList.add('active');
    updateQuizUI();
};

function updateQuizUI() {
    const pct = (currentStep / TOTAL_STEPS) * 100;
    document.getElementById('quizProgressFill').style.width = pct + '%';
    document.getElementById('quizStepLabel').textContent = `Question ${currentStep} of ${TOTAL_STEPS}`;

    const backBtn = document.getElementById('quizBackBtn');
    backBtn.style.visibility = currentStep > 1 ? 'visible' : 'hidden';

    const nextBtn = document.getElementById('quizNextBtn');
    nextBtn.disabled = !answers['q' + currentStep];
    nextBtn.textContent = currentStep === TOTAL_STEPS ? 'Generate My Plan' : 'Next →';
}


// ── GENERATING ANIMATION ─────────────────────────────────────

function startGenerating() {
    const overlay = document.getElementById('genOverlay');
    const statusEl = document.getElementById('genStatus');
    const barEl = document.getElementById('genBar');

    overlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    const steps = [
        { msg: 'Reading your answers...', pct: 15 },
        { msg: 'Matching your chili variety...', pct: 35 },
        { msg: 'Building fertilizer plan...', pct: 55 },
        { msg: 'Calculating watering schedule...', pct: 75 },
        { msg: 'Adding beginner tips...', pct: 90 },
        { msg: '✅ Done!', pct: 100 },
    ];

    let i = 0;
    const interval = setInterval(() => {
        if (i < steps.length) {
            statusEl.textContent = steps[i].msg;
            barEl.style.width = steps[i].pct + '%';
            i++;
        } else {
            clearInterval(interval);
            setTimeout(() => {
                overlay.classList.add('hidden');
                document.body.style.overflow = '';
                const plan = buildPlan(answers);
                displayResult(plan);
            }, 500);
        }
    }, 480);
}


// ── RULE-BASED ENGINE ─────────────────────────────────────────

function buildPlan(a) {
    const plan = { title: '', meta: '', summary: [], fertilizer: '', water: '', sunlight: '', soil: '', tip: '', expect: '', pest: '' };

    const chiliLabel = { cili_padi: 'Cili Padi', cili_besar: 'Cili Besar', cili_benggala: 'Cili Benggala' }[a.q2];
    const locationLabel = { indoor: 'Indoor', outdoor: 'Outdoor', greenhouse: 'Greenhouse' }[a.q1];
    const sunLabel = { full_sun: 'Full Sun', partial: 'Partial Sun', low_light: 'Low Light' }[a.q3];
    const waterLabel = { daily: 'Daily', sometimes: 'Sometimes', frequent: 'Frequent' }[a.q4];
    const expLabel = { never: 'First Timer', tried: 'Tried Before', some: 'Some Experience' }[a.q5];

    plan.title = `${chiliLabel} Care Plan`;
    plan.meta = `${locationLabel} · ${sunLabel} · ${waterLabel} · ${expLabel}`;
    plan.summary = [
        { icon: '🌶️', text: chiliLabel },
        { icon: '📍', text: locationLabel },
        { icon: '☀️', text: sunLabel },
        { icon: '💧', text: waterLabel },
        { icon: '🌱', text: expLabel },
    ];

    // FERTILIZER
    if (a.q2 === 'cili_padi') {
        plan.fertilizer = 'Use a balanced fertilizer. Mix 1 small spoon into 1L of water. Apply every 2 weeks. When flowers appear, switch to fruit fertilizer for better chili growth.';
    } else if (a.q2 === 'cili_besar') {
        plan.fertilizer = 'Use a general plant fertilizer. Mix 1 small spoon into 1–1.5L of water every 10–12 days. You can add a small pinch of Epsom salt once a month.';
    } else {
        plan.fertilizer = 'Use balanced fertilizer. Mix 1 small spoon into 2L of water every 2 weeks. Add compost once a month.';
    }
    if (a.q1 === 'indoor') plan.fertilizer += ' Liquid fertilizer is easier for pots.';
    if (a.q1 === 'greenhouse') plan.fertilizer += ' Plants grow faster here — feed every 10 days.';

    // WATERING
    if (a.q4 === 'daily') {
        if (a.q1 === 'outdoor') {
            plan.water = 'Water every morning before 8am. Always touch the soil first — if still wet, skip watering. On very hot days, water again in the evening.';
        } else if (a.q1 === 'indoor') {
            plan.water = 'Water every morning. Put your finger 2cm into soil — if wet, do not water. Make sure your pot has drainage holes at the bottom.';
        } else {
            plan.water = 'Water every morning. Check soil daily. Pour water near the base, not on the leaves.';
        }
    } else if (a.q4 === 'sometimes') {
        plan.water = 'Try to water at least every 2 days. Add mulch on top of soil to keep moisture longer. Set a phone reminder if needed.';
        if (a.q2 === 'cili_padi') plan.water += ' Do not miss watering when flowers appear — fruits may drop.';
    } else {
        plan.water = 'Only water when the soil feels dry. Too much water can kill the roots. Make sure extra water drains from the bottom.';
        if (a.q1 === 'indoor') plan.water += ' Always empty the tray under the pot after watering.';
    }

    // SUNLIGHT
    if (a.q3 === 'full_sun') {
        plan.sunlight = 'Your plant needs 6+ hours of sunlight daily. More sun means more chilies and stronger flavour.';
    } else if (a.q3 === 'partial') {
        plan.sunlight = 'Morning sunlight is best. You may get slightly fewer chilies than full sun.';
        if (a.q1 === 'indoor') plan.sunlight += ' Place near your brightest window. If the plant becomes tall and weak, use a small grow light.';
    } else {
        plan.sunlight = 'This is not enough natural light. Use a small LED grow light placed above the plant for 12–14 hours daily.';
        if (a.q2 === 'cili_padi') plan.sunlight += ' Cili Padi may struggle in low light.';
    }

    // SOIL
    if (a.q1 === 'indoor') {
        plan.soil = 'Use ready-made potting soil. Add perlite (small white stones) to help water drain easily. Do not use heavy garden soil in pots.';
    } else if (a.q1 === 'outdoor') {
        plan.soil = 'Mix garden soil with compost (70% soil, 30% compost). Make sure water does not pool in the soil.';
    } else {
        plan.soil = 'Use soft soil mix with compost. Loosen the soil every few weeks so roots can grow well.';
    }
    if (a.q4 === 'frequent') plan.soil += ' Add extra perlite to help drain excess water faster.';

    // TIP — based on experience (Q5)
    if (a.q5 === 'never') {
        plan.tip = 'Start with a small pot (at least 20cm deep). Buy seedlings from a nursery instead of seeds — much easier for first timers. Water first, wait 30 mins, then fertilize. Never add fertilizer to dry soil.';
    } else if (a.q5 === 'tried') {
        plan.tip = 'The two most common mistakes: overwatering and too little sunlight. Always check soil before watering and make sure your plant gets enough sun. Do not give up — chili is very rewarding!';
    } else {
        plan.tip = 'Water first, wait 20–30 minutes, then add fertilizer. Never fertilize on dry soil. Pinch off the first few flowers to encourage a stronger, bushier plant with more fruit later.';
    }

    // EXPECTATION
    const harvestDays = { cili_padi: '2 to 2.5 months', cili_besar: '2.5 to 3 months', cili_benggala: 'about 3 months' }[a.q2];
    plan.expect = `You may start seeing flowers in 4–6 weeks. Chilies are usually ready to harvest in ${harvestDays}. Be patient — the wait is worth it!`;

    // PEST
    if (a.q2 === 'cili_padi') {
        plan.pest = 'Watch for aphids (tiny green bugs) on young leaves and mites in hot dry weather. Spray with diluted neem oil or mild soap water every 2 weeks as prevention.';
    } else if (a.q2 === 'cili_besar') {
        plan.pest = 'Common issues are leaf curl (from mites) and powdery white patches (fungal). Ensure good air circulation and avoid wetting leaves when watering.';
    } else {
        plan.pest = 'Cili Benggala is fairly hardy. Watch for aphids and caterpillars. Remove pests by hand or use neem oil spray. Check under leaves weekly.';
    }
    if (a.q1 === 'indoor') plan.pest += ' Indoor plants rarely get pests but check weekly since problems spread fast in enclosed spaces.';

    return plan;
}


// ── DISPLAY RESULT ────────────────────────────────────────────

function displayResult(plan) {
    playNotifSound();
    document.getElementById('resultMeta').textContent = plan.meta;

    const pillsEl = document.getElementById('summaryPills');
    if (pillsEl) {
        pillsEl.innerHTML = plan.summary.map(s =>
            `<div class="sum-pill">${s.icon} ${s.text}</div>`
        ).join('');
    }

    document.getElementById('resFertilizer').textContent = plan.fertilizer;
    document.getElementById('resWater').textContent = plan.water;
    document.getElementById('resSunlight').textContent = plan.sunlight;
    document.getElementById('resSoil').textContent = plan.soil;
    document.getElementById('resTip').textContent = plan.tip;
    document.getElementById('resExpect').textContent = plan.expect;
    document.getElementById('resPest').textContent = plan.pest;

    lastPlanResult = { inputs: { ...answers }, plan, generatedAt: new Date().toISOString() };

    document.getElementById('heroSection').classList.add('hidden');
    document.getElementById('resultWrapper').classList.remove('hidden');

    // ── Enable scrolling for result ──
    document.body.style.overflow = 'auto';
    document.documentElement.style.overflow = 'auto';
    document.querySelector('.main-content').classList.add('scrollable');
    document.querySelector('.page-wrapper').classList.add('scrollable');
    window.scrollTo(0, 0);
}

window.resetAll = function () {
    Object.keys(answers).forEach(k => answers[k] = null);
    lastPlanResult = null;

    document.getElementById('resultWrapper').classList.add('hidden');
    document.getElementById('heroSection').classList.remove('hidden');

    // ── Force remove scrollable immediately ──
    const main = document.querySelector('.main-content');
    const wrapper = document.querySelector('.page-wrapper');

    main.classList.remove('scrollable');
    wrapper.classList.remove('scrollable');

    // ── Force scroll back to top first, then lock ──
    window.scrollTo(0, 0);
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
};



// ── SAVE MODAL ────────────────────────────────────────────────

function showModal() {
    const modal = document.getElementById('saveModal');
    modal.classList.remove('hidden');
    modal.classList.add('show');
}

window.hideModal = function () {
    const modal = document.getElementById('saveModal');
    modal.classList.remove('show');
    modal.classList.add('hidden');
};

window.savePlan = function () {
    if (!lastPlanResult) { alert('Please generate a plan first!'); return; }
    if (!currentUser) { alert('Please login to save your plan!'); window.location.href = 'login.html'; return; }
    showModal();
};

window.confirmSavePlan = async function () {
    if (!currentUser || !lastPlanResult) return;

    const btn = document.getElementById('confirmSave');
    const originalText = btn.textContent;
    btn.textContent = 'Saving...';
    btn.disabled = true;

    const saveWithTimeout = (promise, ms = 8000) =>
        Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('Save timed out')), ms))]);

    try {
        await saveWithTimeout(
            addDoc(collection(db, 'users', currentUser.uid, 'history'), {
                feature: 'fertilizer',
                input: {
                    chili_type: lastPlanResult.inputs.q2,
                    location: lastPlanResult.inputs.q1,
                    sunlight: lastPlanResult.inputs.q3,
                    watering: lastPlanResult.inputs.q4,
                    experience: lastPlanResult.inputs.q5,
                    mode: 'beginner',
                },
                result: {
                    title: lastPlanResult.plan.title,
                    fertilizer: lastPlanResult.plan.fertilizer,
                    water: lastPlanResult.plan.water,
                    sunlight: lastPlanResult.plan.sunlight,
                    soil: lastPlanResult.plan.soil,
                    tip: lastPlanResult.plan.tip,
                    expect: lastPlanResult.plan.expect,
                    pest: lastPlanResult.plan.pest,
                },
                createdAt: serverTimestamp(),
            })
        );

        addDoc(collection(db, 'users', currentUser.uid, 'activities'), {
            title: 'Beginner Care Plan',
            description: `${lastPlanResult.plan.title} · ${lastPlanResult.plan.meta}`,
            icon: '🌱',
            color: 'green',
            timestamp: serverTimestamp(),
        }).catch(err => console.warn('Activity log failed:', err));
        playNotifSound();
        showToast('✅ Care plan saved!');
        hideModal();

    } catch (err) {
        console.error('Save error:', err);
        alert('❌ Save failed: ' + err.message);
        hideModal();
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
};


// ── TOAST ─────────────────────────────────────────────────────

function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.remove('hidden');
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

document.addEventListener('click', (e) => {
    const modal = document.getElementById('saveModal');
    if (e.target === modal) hideModal();
});