// FIREBASE IMPORTS
import { auth } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { logActivity } from './activity.js';

let currentUser = null;
onAuthStateChanged(auth, (user) => {
    if (user) currentUser = user;
});


// DATA STRUCTURES
const CONTAINER_DATA = {
            "pot": {
                label: "Pot",
                drainageBonus: 2,
                rootSpaceMultiplier: 0.95,
                description: "Standard container growing"
            },
            "grow_bag": {
                label: "Grow Bag",
                drainageBonus: 1,
                rootSpaceMultiplier: 1.00,
                description: "Good drainage and aeration"
            },
            "raised_bed": {
                label: "Raised Bed",
                drainageBonus: 3,
                rootSpaceMultiplier: 1.05,
                description: "Best home growing option"
            },
            "ground": {
                label: "Ground Bed",
                drainageBonus: 0,
                rootSpaceMultiplier: 0.90,
                description: "Direct soil planting"
            }
        };

        const EXPERIENCE_DATA = {
            "beginner": {
                label: "Beginner Home Grower",
                careBonus: 0,
                confidenceFloor: 35,
                detailLevel: "simple"
            },
            "intermediate": {
                label: "Intermediate Home Grower",
                careBonus: 2,
                confidenceFloor: 30,
                detailLevel: "standard"
            },
            "experienced": {
                label: "Experienced Home Grower",
                careBonus: 4,
                confidenceFloor: 25,
                detailLevel: "detailed"
            }
        };

        const CHILI_COLORS = {
            "Cili Padi": [
                {
                    label: "Green",
                    range: "60-75 days",
                    days: 67,
                    gramsPerFruit: 1.7,
                    note: "Firm, crunchy, fresh grassy heat — immature/mature stage"
                },
                {
                    label: "Red",
                    range: "75-90 days",
                    days: 82,
                    gramsPerFruit: 1.7,
                    note: "Fully ripe, maximum capsaicin, bright red colour"
                },
            ],
            "Cili Besar": [
                {
                    label: "Green",
                    range: "60-75 days",
                    days: 67,
                    gramsPerFruit: 10,
                    note: "Earlier harvest, firm texture, commonly used fresh"
                },
                {
                    label: "Red",
                    range: "70-100 days",
                    days: 85,
                    gramsPerFruit: 12,
                    note: "Fully ripe, vibrant red colour, maximum spiciness"
                },
            ],
            "Cili Benggala": [
                {
                    label: "Green",
                    range: "60-80 days",
                    days: 70,
                    gramsPerFruit: 88,
                    note: "Vegetal, slightly bitter, crunchy texture"
                },
                {
                    label: "Yellow",
                    range: "70-90 days",
                    days: 80,
                    gramsPerFruit: 92,
                    note: "Milder than green, citrusy, light sweetness"
                },
                {
                    label: "Red",
                    range: "80-110 days",
                    days: 95,
                    gramsPerFruit: 95,
                    note: "Sweetest stage, highest in Vitamin C, best for cooking"
                },
            ],
        };

        const ENVIRONMENT_SCORES = {
            "Indoor": {
                score: 9,
                yieldMultiplier: 0.85,
                diseaseRisk: "Low",
                label: "Indoor"
            },
            "Outdoor": {
                score: 15,
                yieldMultiplier: 1.00,
                diseaseRisk: "High",
                label: "Outdoor"
            },
            "Greenhouse": {
                score: 16,
                yieldMultiplier: 1.00,
                diseaseRisk: "Low",
                label: "Greenhouse"
            },
        };

        const CHILI_DATA = {
            "Cili Padi": {
                scoreBase: 16,
                yieldPerPlant: 180,
                cyclesPerYear: 3,
                label: "Cili Padi"
            },
            "Cili Besar": {
                scoreBase: 13,
                yieldPerPlant: 90,
                cyclesPerYear: 2.5,
                label: "Cili Besar"
            },
            "Cili Benggala": {
                scoreBase: 11,
                yieldPerPlant: 20,
                cyclesPerYear: 2,
                label: "Cili Benggala"
            },
        };

        const SOIL_SCORES = {
            "Loamy": { score: 15 },
            "Peaty": { score: 11 },
            "Potting Mix": { score: 10 },
            "Coconut Coir": { score: 9 },
            "Sandy": { score: 6 },
            "Clay": { score: 4 },
        };

        const SEASON_SCORES = {
            "Jan–Mar": {
                score: 15,
                yieldMultiplier: 1.00,
                qualityMultiplier: 1.00,
                label: "West Coast Dry Season (Jan–Mar)",
            },
            "Apr–Sep": {
                score: 20,
                yieldMultiplier: 0.90,
                qualityMultiplier: 0.95,
                label: "Inter-Monsoon / SW Monsoon (Apr–Sep)",
            },
            "Oct–Dec": {
                score: 4,
                yieldMultiplier: 0.50,
                qualityMultiplier: 0.65,
                label: "Northeast Monsoon (Oct–Dec)",
            },
        };

        const WATER_SCORES = {
            "Moderate": { score: 18 },
            "High": { score: 7 },
            "Low": { score: 6 },
        };

        const SUN_SCORES = {
            "Full Sun": { score: 15 },
            "Partial": { score: 10 },
            "Low": { score: 4 },
        };

        const MAX_SCORE = 100;

        
        // UTILITY FUNCTIONS
        function updateColorOptions() {
            const chili = document.getElementById("sel-chili").value;
            const colorSel = document.getElementById("sel-color");

            colorSel.innerHTML = `<option value="">Select colour</option>`;

            if (!chili || !CHILI_COLORS[chili]) return;

            CHILI_COLORS[chili].forEach(c => {
                const opt = document.createElement("option");
                opt.value = c.label;
                opt.textContent = `${c.label} (${c.range}) — ${c.note}`;
                opt.dataset.days = c.days;
                opt.dataset.grams = c.gramsPerFruit;
                colorSel.appendChild(opt);
            });
        }

        
        // MAIN PREDICTION FUNCTION
        async function predictHarvest() {
            // Gather all inputs
            const chili = document.getElementById("sel-chili").value;
            const soil = document.getElementById("sel-soil").value;
            const season = document.getElementById("sel-season").value;
            const water = document.getElementById("sel-water").value;
            const sun = document.getElementById("sel-sun").value;
            const environment = document.getElementById("sel-environment").value;
            const container = document.getElementById("sel-container").value;
            const experience = document.getElementById("sel-experience").value;
            const plantCount = parseInt(document.getElementById("input-plants").value) || 4;

            const colorSel = document.getElementById("sel-color");
            const selectedColor = colorSel.options[colorSel.selectedIndex];
            const targetColor = colorSel.value;

            // Validation
            if (!chili || !soil || !season || !water || !sun || !environment || !container || !experience || !targetColor) {
                alert("Please fill in all conditions before predicting.");
                return;
            }

            if (plantCount < 1 || plantCount > 50) {
                alert("Please enter a valid number of plants (1-50).");
                return;
            }

            // Button loading state
            const btn = document.getElementById("btn-predict");
            const originalHTML = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = `<span class="btn-dot"></span> Analysing...`;
            btn.classList.add("loading");

            await new Promise(r => setTimeout(r, 700));

            // Resolve data objects
            const containerData = CONTAINER_DATA[container];
            const expData = EXPERIENCE_DATA[experience];
            const envData = ENVIRONMENT_SCORES[environment];

            // Colour-specific values
            const daysToHarvest = parseInt(selectedColor.dataset.days);
            const gramsPerFruit = parseFloat(selectedColor.dataset.grams);

            // SCORING
            const chiliData = CHILI_DATA[chili];
            const seasonData = SEASON_SCORES[season] || { score: 7, yieldMultiplier: 0.8, qualityMultiplier: 0.8 };
            const waterData = WATER_SCORES[water] || { score: 7 };

            const soilScore = Math.min(15, (SOIL_SCORES[soil]?.score ?? 7) + containerData.drainageBonus);
            const sunScore = SUN_SCORES[sun]?.score ?? 7;
            const rawScore = chiliData.scoreBase + soilScore + seasonData.score
                + waterData.score + sunScore + envData.score + expData.careBonus;

            const rawConfidence = Math.round((rawScore / MAX_SCORE) * 100);
            const confidence = Math.max(expData.confidenceFloor, Math.min(100, rawConfidence));

            // INTERACTION PENALTIES
            let interactionPenalty = 1.0;

            if (season === "Oct–Dec" && environment === "Outdoor") {
                interactionPenalty *= 0.50;
            }
            if (soil === "Clay" && water === "High") {
                interactionPenalty *= 0.40;
            }
            if (sun === "Low" && environment === "Indoor") {
                interactionPenalty *= 0.70;
            }
            if (soil === "Sandy" && water === "Low") {
                interactionPenalty *= 0.75;
            }
            if (container === "ground" && season === "Oct–Dec") {
                interactionPenalty *= 0.85;
            }

            // YIELD CALCULATION
            const conditionFactor = 0.30 + (confidence / 100) * 0.70;

            const baseYield = chiliData.yieldPerPlant
                * seasonData.yieldMultiplier
                * envData.yieldMultiplier
                * containerData.rootSpaceMultiplier
                * conditionFactor;

            const yieldPerPlant = Math.round(baseYield * interactionPenalty);
            const totalFruits = yieldPerPlant * plantCount;
            const totalWeightKg = ((totalFruits * gramsPerFruit) / 1000).toFixed(2);

            // Quality tier
            const qualityScore = confidence * seasonData.qualityMultiplier;
            let quality, yieldGrade, qualityColor;

            if (qualityScore >= 82) {
                quality = "Excellent"; yieldGrade = "High"; qualityColor = "#1e8449";
            } else if (qualityScore >= 65) {
                quality = "Good"; yieldGrade = "Moderate"; qualityColor = "#2471a3";
            } else if (qualityScore >= 47) {
                quality = "Fair"; yieldGrade = "Low"; qualityColor = "#d4ac0d";
            } else {
                quality = "Poor"; yieldGrade = "Very Low"; qualityColor = "#c0392b";
            }

            // UPDATE UI
            document.getElementById("yield-value").innerText = totalFruits.toLocaleString();
            document.getElementById("yield-sub").innerText = `${targetColor} chilies expected at harvest · ${plantCount} plants in ${containerData.label}`;
            document.getElementById("res-weight").innerText = totalWeightKg + " kg";
            document.getElementById("res-quality").innerText = quality;
        

            const confEl = document.getElementById("res-confidence");
            if (confEl) {
                confEl.innerText = confidence + "%";
                confEl.style.color = confidence >= 68 ? "#1e8449" : confidence >= 50 ? "#d4ac0d" : "#c0392b";
            }

            const qualityEl = document.getElementById("res-quality");
            if (qualityEl) qualityEl.style.color = qualityColor;

            updateTimeline(daysToHarvest, season, confidence);

            // RECOMMENDATIONS ENGINE
            const recos = [];
            const detail = expData.detailLevel;

            // Overall verdict
            if (confidence >= 85) {
                recos.push({
                    cls: "active",
                    icon: "🌟",
                    title: "Excellent Outcome Expected",
                    msg: `Your ${plantCount} ${containerData.label.toLowerCase()} plants will likely produce around ${totalFruits.toLocaleString()} ${targetColor.toLowerCase()} chilies (${totalWeightKg} kg) — more than enough for regular home cooking and sharing with neighbours.`
                });
            } else if (confidence >= 68) {
                recos.push({
                    cls: "active",
                    icon: "👍",
                    title: "Good Outcome Expected",
                    msg: `Your ${plantCount} plants will likely yield around ${totalFruits.toLocaleString()} ${targetColor.toLowerCase()} chilies (${totalWeightKg} kg). A few improvements below could push this even higher for your next cycle.`
                });
            } else if (confidence >= 50) {
                recos.push({
                    cls: "warn",
                    icon: "⚠️",
                    title: "Below-Average Outcome Expected",
                    msg: `With current conditions, expect around ${totalFruits.toLocaleString()} ${targetColor.toLowerCase()} chilies (${totalWeightKg} kg) — lower than what this variety can deliver. Check the advice below to improve your setup.`
                });
            } else {
                recos.push({
                    cls: "bad",
                    icon: "🚨",
                    title: "Poor Outcome Expected",
                    msg: `With current conditions, your ${plantCount} plants will struggle — estimated around ${totalFruits.toLocaleString()} ${targetColor.toLowerCase()} chilies only. Several key factors are working against a successful harvest.`
                });
            }

            // Container advice
            if (container === "pot") {
                recos.push({
                    cls: "active",
                    icon: "🪴",
                    title: "Pot Growing — Manageable for Beginners",
                    msg: detail === "simple"
                        ? "Pots are great for beginners! Just make sure they have drainage holes at the bottom."
                        : "Pots offer good drainage and root aeration. Use at least 12-inch pots for Cili Besar/Benggala, 8-inch for Cili Padi. Check drainage holes aren't blocked — standing water causes root rot."
                });
            } else if (container === "grow_bag") {
                recos.push({
                    cls: "active",
                    icon: "🛍️",
                    title: "Grow Bag — Good Airflow for Roots",
                    msg: detail === "simple"
                        ? "Grow bags help roots breathe and prevent overwatering. Great choice for home growing!"
                        : "Grow bags provide excellent root aeration and prevent waterlogging. The fabric sides allow air-pruning of roots, creating a denser, healthier root ball. Water more frequently as they dry faster than plastic pots."
                });
            } else if (container === "raised_bed") {
                recos.push({
                    cls: "active",
                    icon: "📦",
                    title: "Raised Bed — Best Home Growing Option",
                    msg: detail === "simple"
                        ? "Raised beds give the best drainage and root space. Your plants will love the extra room!"
                        : "Raised beds offer the best combination of drainage, root space, and soil control for home growers. The elevated soil warms faster in the morning and drains well during monsoon. Fill with quality potting mix for best results."
                });
            } else if (container === "ground") {
                recos.push({
                    cls: "warn",
                    icon: "🌱",
                    title: "Ground Bed — Watch for Waterlogging",
                    msg: detail === "simple"
                        ? "Ground planting gives roots lots of space, but Malaysian clay soil can hold too much water. Consider raised beds if drainage is poor."
                        : "Ground planting provides unlimited root space but carries higher disease risk in Malaysia's heavy clay soils. If your garden floods during rain, consider switching to raised beds or pots for the next cycle."
                });
            }

            // Environment outcome
            if (environment === "Indoor") {
                recos.push({
                    cls: "warn",
                    icon: "🏠",
                    title: "Indoor Growing — Light Is The Main Constraint",
                    msg: detail === "simple"
                        ? "Indoor plants are safe from rain but need lots of light. Put them by the sunniest window!"
                        : "Indoor plants are protected from rain and pests, but limited sunlight will reduce fruit count. Position near the brightest window (south-facing if possible). Consider a small grow light if you get less than 5 hours of direct sun."
                });
            } else if (environment === "Outdoor") {
                if (season === "Oct–Dec") {
                    recos.push({
                        cls: "bad",
                        icon: "🌧️",
                        title: "Outdoor + Monsoon — Move Plants Under Cover!",
                        msg: detail === "simple"
                            ? "Oct–Dec monsoon rain will damage your plants! Move pots under a porch or use an umbrella. Expect much lower harvest."
                            : "Outdoor plants during Oct–Dec face heavy monsoon rain and 90%+ humidity. This is the riskiest combination for home growers — fungal disease, fruit rot, and leaf drop are very likely. If you can't move plants indoors, at least place them where rain drains away quickly. Your yield forecast has been reduced by 50% to reflect this risk."
                    });
                } else {
                    recos.push({
                        cls: "active",
                        icon: "☀️",
                        title: "Outdoor Growing — Great Natural Conditions",
                        msg: detail === "simple"
                            ? "Outdoor growing gives your plants full sun and fresh air — perfect for a strong home harvest!"
                            : "Outdoor growing in this season gives your plants full natural sunlight and good airflow — the best conditions for a strong home harvest. Just watch for caterpillars (ulat) and aphids during the dry season."
                    });
                }
            } else if (environment === "Greenhouse") {
                recos.push({
                    cls: "active",
                    icon: "🏗️",
                    title: "Greenhouse — Most Consistent Results",
                    msg: detail === "simple"
                        ? "Your greenhouse protects plants from heavy rain and keeps temperature steady. Great for consistent harvests all year!"
                        : "Greenhouse protection neutralises monsoon risk and provides the most consistent growing environment. Temperature and humidity control means fewer disease problems. Especially valuable for Cili Benggala, which is most sensitive to heavy rain."
                });
            }

            // Combined interaction warnings
            if (soil === "Clay" && water === "High") {
                recos.push({
                    cls: "bad",
                    icon: "💧",
                    title: "Critical: Clay Soil + Overwatering = Root Rot",
                    msg: detail === "simple"
                        ? "Clay holds water like a sponge. Adding lots of water will drown your roots! Let soil dry between watering."
                        : "Clay soil already holds too much water — adding high watering on top will cause severe root rot within 1-2 weeks. Roots need air as much as water. Let the top 2 inches of soil dry before watering again. Your forecast has been reduced significantly."
                });
            }

            if (soil === "Sandy" && water === "Low") {
                recos.push({
                    cls: "warn",
                    icon: "🏖️",
                    title: "Sandy Soil + Low Water = Double Trouble",
                    msg: detail === "simple"
                        ? "Sandy soil drains fast and low water means thirsty plants. Water more often or your harvest will drop."
                        : "Sandy soil already struggles to hold moisture, and low watering makes this much worse. Plants will experience severe water and nutrient stress — flowers will drop before becoming fruit. Water twice as often as you think you need to."
                });
            }

            if (sun === "Low" && environment === "Indoor") {
                recos.push({
                    cls: "warn",
                    icon: "💡",
                    title: "Indoor + Low Light — Add a Grow Light",
                    msg: detail === "simple"
                        ? "Less than 3 hours of sun indoors is too dark for chili plants. A cheap LED grow light will help a lot!"
                        : "Growing indoors with less than 3 hours of sun creates a critical light shortage. Plants will grow tall and weak (leggy) with very few flowers. A basic LED grow light (20-30W) running 8-10 hours daily will transform your results."
                });
            }

            // Soil outcome
            if (soil === "Clay") {
                recos.push({
                    cls: "bad",
                    icon: "🟤",
                    title: "Clay Soil — Improve Drainage Urgently",
                    msg: detail === "simple"
                        ? "Clay traps water around roots causing rot. Mix in sand or cocopeat to loosen it up, or switch to pots."
                        : "Clay soil will trap water around roots, leading to root rot and stunted growth. For ground planting: mix in coarse sand, cocopeat, or compost (1:1 ratio). For pots: use only 20% clay soil mixed with 80% potting mix. Yellowing leaves are the first warning sign."
                });
            } else if (soil === "Sandy") {
                recos.push({
                    cls: "warn",
                    icon: "🏖️",
                    title: "Sandy Soil — Feed More Often",
                    msg: detail === "simple"
                        ? "Nutrients wash out quickly in sandy soil. Use liquid fertilizer every 2 weeks for best results."
                        : "Sandy soil cannot hold nutrients after rain. Use slow-release fertilizer pellets at planting, then liquid seaweed or NPK 15-15-15 every 10-14 days. Watch for pale yellow leaves — that's hunger, not disease."
                });
            } else if (soil === "Coconut Coir") {
                recos.push({
                    cls: "active",
                    icon: "🥥",
                    title: "Coconut Coir — Great Drainage, Feed Regularly",
                    msg: detail === "simple"
                        ? "Coir drains perfectly but has no food for plants. Add liquid fertilizer every week and your plants will thrive!"
                        : "Coir provides excellent root aeration and drainage — roots won't rot. However, it contains almost zero nutrients. Start with slow-release fertilizer mixed in, then liquid feed every 7-10 days. Perfect for beginners who tend to overwater."
                });
            } else if (soil === "Potting Mix") {
                recos.push({
                    cls: "active",
                    icon: "🌿",
                    title: "Potting Mix — Balanced and Forgiving",
                    msg: detail === "simple"
                        ? "Potting mix holds water and nutrients well. A solid choice for any home grower!"
                        : "Potting mix is the safest choice for home growers — it retains moisture and nutrients effectively while still draining well. Look for mixes with added perlite (white granules) for extra aeration. Replace or refresh every 6-12 months as nutrients deplete."
                });
            } else if (soil === "Loamy") {
                recos.push({
                    cls: "active",
                    icon: "⭐",
                    title: "Loamy Soil — Perfect for Chilies",
                    msg: detail === "simple"
                        ? "Loamy soil is the gold standard! Your plants will grow strong and produce lots of fruit."
                        : "Loamy soil is the ideal growing medium — perfect balance of sand, silt, and clay. It drains well, holds nutrients, and supports strong root development. If you have loamy garden soil, you're very lucky! Just add compost yearly to maintain fertility."
                });
            } else if (soil === "Peaty") {
                recos.push({
                    cls: "warn",
                    icon: "🍂",
                    title: "Peaty Soil — Check Acidity",
                    msg: detail === "simple"
                        ? "Peat can be too acidic for chilies. Mix in garden lime or use potting mix instead."
                        : "Peaty soil is often too acidic (below pH 5.5) for optimal chili growth. Chilies prefer pH 6.0-6.8. Mix in agricultural lime (1 tablespoon per pot) or blend 50/50 with potting mix. If leaves turn yellow with green veins, acidity is locking out nutrients."
                });
            }

            // Season outcome
            if (season === "Oct–Dec") {
                recos.push({
                    cls: "bad",
                    icon: "🌧️",
                    title: "Monsoon Season — Protect Your Plants",
                    msg: detail === "simple"
                        ? "Oct–Dec brings heavy rain and fungus problems. Move pots under cover and check leaves daily for spots."
                        : "Oct–Dec monsoon means 90%+ humidity and daily heavy rain — perfect conditions for fungal diseases like anthracnose and leaf spot. Move pots under porch/awning. Remove yellow leaves immediately. Spray neem oil preventively every 7 days. Expect 40-60% lower harvest than dry season."
                });
                recos.push({
                    cls: "warn",
                    icon: "📅",
                    title: "Tip: Jan–Mar Would Give ~2× More Chilies",
                    msg: "The same setup planted in January–March would likely harvest around double the chilies for the same effort — dry season gives the best growing conditions on Malaysia's West Coast with lower disease pressure and more sunshine."
                });
            } else if (season === "Jan–Mar") {
                recos.push({
                    cls: "active",
                    icon: "☀️",
                    title: "Dry Season — Best Time for Home Growing!",
                    msg: detail === "simple"
                        ? "Jan–Mar is the driest, sunniest time. Your plants will love it and you'll get the biggest harvest!"
                        : "January–March is the driest and sunniest period on Malaysia's West Coast — ideal for chili growing at home. Consistent sun, lower humidity, and minimal disease pressure mean strong growth and maximum fruit set. Water regularly as pots dry out faster in dry weather."
                });
                recos.push({
                    cls: "warn",
                    icon: "🌊",
                    title: "East Coast Growers: Jan–Mar Is Your Wet Season",
                    msg: "If you're in Kelantan, Terengganu, or Pahang, January–March is your Northeast Monsoon peak — disease risk will be much higher than this forecast suggests. Consider indoor growing or delay until April."
                });
            } else if (season === "Apr–Sep") {
                recos.push({
                    cls: "active",
                    icon: "🌤️",
                    title: "Mixed Season — Manageable with Care",
                    msg: detail === "simple"
                        ? "Apr–Sep has good and rainy periods. April-May is especially nice. Watch for heavy rain in September."
                        : "April–September is generally workable for home chili growing. April-May (inter-monsoon) is especially good — balanced rain and sun. May-September (SW Monsoon) brings heavier afternoon rain. Ensure good drainage and watch for waterlogging after storms."
                });
                recos.push({
                    cls: "warn",
                    icon: "😷",
                    title: "Haze May Reduce Sunlight Jun–Sep",
                    msg: "If planting from June onward, haze from Indonesia could cut effective sunlight by 1-2 hours per day during bad periods — slightly slowing growth. Not a big problem for home growers, just expect a small yield reduction."
                });
            }

            // Watering outcome
            if (water === "High") {
                recos.push({
                    cls: "bad",
                    icon: "🚿",
                    title: "Overwatering — #1 Killer of Potted Chilies",
                    msg: detail === "simple"
                        ? "Too much water causes root rot. Water only when the top soil feels dry to your finger."
                        : "Overwatering is the most common mistake for beginner home growers. Chili roots need oxygen — soggy soil suffocates them. Check soil moisture by sticking your finger 2 inches deep. Water only when it feels dry. Wilting leaves can mean OVERwatering too (roots can't absorb water when rotting)."
                });
            } else if (water === "Low") {
                recos.push({
                    cls: "warn",
                    icon: "🏜️",
                    title: "Underwatering — Flowers Will Drop",
                    msg: detail === "simple"
                        ? "Not enough water and your flowers fall off before making fruit. In Malaysian heat, check pots daily!"
                        : "Underwatering during flowering and fruiting causes stress — plants drop flowers and young fruits to survive. In Malaysian heat (30-35°C), pots can dry completely in one day. Check daily by weight: light pot = needs water. Mulch the surface with dry leaves to reduce evaporation by 50%."
                });
            } else {
                recos.push({
                    cls: "active",
                    icon: "💧",
                    title: "Moderate Watering — Perfect Balance",
                    msg: detail === "simple"
                        ? "Water when soil is dry on top. This is exactly right for healthy chili plants!"
                        : "Moderate watering keeps soil moist but not soggy — perfect for chili roots. Water deeply until it drains from the bottom, then let the top inch dry before watering again. This encourages deep root growth and prevents surface mold."
                });
            }

            // Sunlight outcome
            if (sun === "Low") {
                recos.push({
                    cls: "warn",
                    icon: "🌑",
                    title: "Low Sunlight — Biggest Yield Killer",
                    msg: detail === "simple"
                        ? "Less than 3 hours of sun means very few chilies. Move plants to the brightest spot you have!"
                        : "Low sunlight is the single biggest factor reducing home harvests. Chili plants are sun-lovers — less than 3 hours produces weak, leggy plants with almost no fruit. Even a balcony with morning sun is better than a shady courtyard. Consider reflective surfaces (white walls, aluminium foil) to bounce more light onto plants."
                });
            } else if (sun === "Partial") {
                recos.push({
                    cls: "active",
                    icon: "⛅",
                    title: "Partial Sun — Decent for Home Use",
                    msg: detail === "simple"
                        ? "4-5 hours of sun will grow plants and produce fruit. Not maximum yield, but still worthwhile!"
                        : "4–5 hours of sun will support moderate growth and fruiting. Fruit count per plant will be 20-30% lower than full sun, but still worthwhile for home cooking. Morning sun (east-facing) is better than afternoon sun — less heat stress on plants."
                });
            } else {
                recos.push({
                    cls: "active",
                    icon: "☀️",
                    title: "Full Sun — Maximum Fruit Production",
                    msg: detail === "simple"
                        ? "6+ hours of direct sun is perfect! Your plants will be strong, flower lots, and fill with fruit."
                        : "Full sun (6+ hours) allows plants to photosynthesise at maximum capacity — producing strong stems, abundant flowers, and well-filled fruits. This is the single biggest contributor to a great home harvest. In Malaysia's intense sun, afternoon shade cloth (30%) can prevent leaf scorch while maintaining high yields."
                });
            }

            // Chili variety + colour specific
            if (chili === "Cili Padi") {
                recos.push({
                    cls: "active",
                    icon: "🌶️",
                    title: `Cili Padi (${targetColor}) — ${yieldPerPlant} Fruits/Plant`,
                    msg: detail === "simple"
                        ? `Each plant gives ~${yieldPerPlant} tiny but fiery chilies. Great for sambal! Ready in about ${daysToHarvest} days.`
                        : `Cili Padi is Malaysia's favourite chili — tiny but powerful! Each of your ${plantCount} plants should produce ~${yieldPerPlant} fruits (avg ${gramsPerFruit}g each). ${targetColor} harvest ready around day ${daysToHarvest}. Pro tip: Don't over-fertilise with nitrogen — it makes leafy plants with few fruits. Use higher potassium (K) fertilizer during flowering.`
                });
            } else if (chili === "Cili Besar") {
                recos.push({
                    cls: "active",
                    icon: "🫑",
                    title: `Cili Besar (${targetColor}) — ${yieldPerPlant} Fruits/Plant`,
                    msg: detail === "simple"
                        ? `Each plant gives ~${yieldPerPlant} big chilies. Perfect for stuffing and salads! Total weight: ${totalWeightKg} kg.`
                        : `Cili Besar is the most rewarding for beginners — big, visible fruits and fewer pest problems than Cili Padi. Each plant: ~${yieldPerPlant} fruits (avg ${gramsPerFruit}g). Total from ${plantCount} plants: ${totalWeightKg} kg. ${targetColor} ready around day ${daysToHarvest}. Support branches with bamboo stakes when fruits get heavy to prevent breaking.`
                });
            } else if (chili === "Cili Benggala") {
                recos.push({
                    cls: "active",
                    icon: "🍎",
                    title: `Cili Benggala (${targetColor}) — ${yieldPerPlant} Big Fruits/Plant`,
                    msg: detail === "simple"
                        ? `Only ~${yieldPerPlant} fruits per plant, but each is HUGE (${gramsPerFruit}g)! Total: ${totalWeightKg} kg. Great for pickles!`
                        : `Cili Benggala produces fewer but much larger fruits — perfect for beginners who want visible results. Each plant: ~${yieldPerPlant} fruits averaging ${gramsPerFruit}g each. Despite low fruit count, total weight is ${totalWeightKg} kg from ${plantCount} plants. ${targetColor} stage ready around day ${daysToHarvest}. Needs staking from early stages — fruits get very heavy!`
                });
            }

            // Experience-specific tip
            if (experience === "beginner") {
                recos.push({
                    cls: "active",
                    icon: "🎓",
                    title: "Beginner Tip: Start Simple, Learn Fast",
                    msg: "As a beginner, focus on just three things: (1) Don't overwater — let soil dry between watering, (2) Give maximum sun possible, (3) Check leaves weekly for pests. Master these and your second cycle will be much better!"
                });
            } else if (experience === "intermediate") {
                recos.push({
                    cls: "active",
                    icon: "📈",
                    title: "Intermediate Tip: Time to Optimise",
                    msg: "You've got the basics down! Now focus on: fertiliser timing (more potassium during flowering), pruning lower leaves for airflow, and keeping a simple log of what works. Your 3rd and 4th cycles should see 20-30% yield improvements as you dial in your setup."
                });
            } else if (experience === "experienced") {
                recos.push({
                    cls: "active",
                    icon: "🏆",
                    title: "Experienced Grower: Push for Personal Best",
                    msg: `With ${plantCount}+ cycles under your belt, you're ready to experiment! Try comparing two soil mixes side-by-side, or test if foliar feeding (spraying nutrients on leaves) boosts your yield. Your personal best is waiting to be beaten — use the Comparison and Personal Best features to track progress.`
                });
            }

            // Summary
            recos.push({
                cls: confidence >= 68 ? "active" : "warn",
                icon: "📊",
                title: `Forecast Confidence: ${confidence}%`,
                msg: `Score ${rawScore}/${MAX_SCORE} · ${plantCount} plants in ${containerData.label} · ${environment}. ${
                    confidence >= 85 ? "All growing factors are at or near ideal — expect a reliable, strong harvest." :
                    confidence >= 68 ? "Most factors are favourable — the forecast is likely but weather surprises happen." :
                    confidence >= 50 ? "Several factors are limiting the outcome — actual results may vary ±30%." :
                                       "Multiple critical factors are working against a good harvest — consider adjusting your setup before planting."
                } ${targetColor} harvest expected around day ${daysToHarvest} from transplant.`
            });

           
            // Render recommendations
            const recoContainer = document.getElementById("reco-list");
            recoContainer.innerHTML = "";

           recos.forEach(r => {
                const div = document.createElement("div");
                div.className = `reco-item ${r.cls}`;
                div.innerHTML = `
                    <div>
                        <div style="font-weight:700;margin-bottom:4px;font-size:.8rem;letter-spacing:.01em;">
                            ${r.title}
                        </div>
                        <div style="font-size:.78rem;line-height:1.65;opacity:.88;">
                            ${r.msg}
                        </div>
                    </div>`;
                recoContainer.appendChild(div);
            });

            // Reset button
            btn.innerHTML = originalHTML;
            btn.disabled = false;
            btn.classList.remove("loading");

            // ── LOG ACTIVITY TO FIREBASE ──
            if (!currentUser) return;

            try {
                await logActivity(currentUser.uid, {
                    title: "Harvest Prediction",
                    description: `${chili} (${targetColor}) · ${plantCount} plants · ${containerData.label} · ${environment} · ${seasonData.label} → ${totalFruits.toLocaleString()} fruits, ${totalWeightKg} kg (${quality} · ${confidence}% confidence)`,
                    icon: "🌱",
                    color: confidence >= 68 ? "green" : confidence >= 50 ? "yellow" : "red"
                });
            } catch (error) {
                console.error("Error saving activity:", error);
            }
        }

        
        // TIMELINE VISUALIZER
        
        function updateTimeline(days, season, confidence) {
            const fill = document.getElementById("timeline-fill");
            const text = document.getElementById("timeline-text");

            if (!fill || !text) return;

            const maxDays = 120;
            const pct = Math.min(100, (days / maxDays) * 100);

            fill.style.width = pct + "%";

            let color = "#27ae60";
            if (season === "Oct–Dec") color = "#e74c3c";
            else if (season === "Apr–Sep") color = "#f39c12";

            fill.style.background = `linear-gradient(90deg, ${color}, ${color}dd)`;

            const today = new Date();
            const harvestDate = new Date(today.getTime() + days * 24 * 60 * 60 * 1000);
            const dateStr = harvestDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

            text.innerHTML = `
                <strong>~${days} days</strong> to harvest · Expected around <strong>${dateStr}</strong>
                ${confidence < 50 ? '<br><span style="color:#e74c3c;font-size:11px;">⚠️ Low confidence — timeline may vary significantly</span>' : ''}
            `;
        }

        
        // EVENT LISTENERS 
        document.addEventListener("DOMContentLoaded", () => {
            // Wire up the chili dropdown to update colors when changed
            const chiliSelect = document.getElementById("sel-chili");
            if (chiliSelect) {
                chiliSelect.addEventListener("change", updateColorOptions);
            }

            // Wire up the predict button
            const btn = document.getElementById("btn-predict");
            if (btn) {
                btn.addEventListener("click", predictHarvest);
            }
        });