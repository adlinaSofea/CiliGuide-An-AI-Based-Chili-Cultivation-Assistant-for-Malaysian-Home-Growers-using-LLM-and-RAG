// reminder.js

const COLOR_EMOJI = { Green: '🟢', Red: '🔴', Yellow: '🟡' };

export function getColorBadge(color) {
  return COLOR_EMOJI[color] || '🟢';
}

export function getHarvestHint(variety, color) {
  const hints = {
    'Cili Padi': { Green: 'Harvest when firm & fully green before color change', Red: 'Wait until fully red for maximum heat & flavor' },
    'Cili Besar': { Green: 'Pick when large and firm, still green', Red: 'Allow to turn fully red for sweetness' },
    'Cili Benggala': { Green: 'Pick when blocky and firm, bright green', Red: 'Wait 2–3 weeks after green stage to turn red', Yellow: 'Harvest when fully yellow and firm' }
  };
  return hints[variety]?.[color] || 'Harvest when firm and at target color';
}


// Build fully dynamic daily reminders per stage

export function buildReminders(cycle, stage, daysPassed) {
  if (!daysPassed) daysPassed = 1; // fallback

  // Pool of reminders per stage
  const reminderPool = {
    seed: [
      'Keep soil moist, check daily',
      'Maintain warmth 25–30°C',
      'Monitor seed germination progress',
      'Light exposure: 4–6 hours',
      'Avoid overwatering',
      'Check for mold on soil',
      'Gently aerate soil if needed'
    ],
    sprout: [
      'Thin weak seedlings',
      'Provide 6–8 hours sunlight',
      'Check leaves for yellowing',
      'Water lightly but regularly',
      'Rotate plants for even growth',
      'Monitor stem strength',
      'Watch for early pests'
    ],
    grow: [
      'Apply nitrogen-rich fertilizer',
      'Deep watering once daily',
      'Check soil nutrients',
      'Monitor growth rate',
      'Prune weak branches',
      'Support tall stems if needed',
      'Inspect for pests'
    ],
    flower: [
      'Switch to phosphorus-rich fertilizer',
      'Water every 2–3 days',
      'Check for aphids and mites',
      'Monitor flower development',
      'Remove dead leaves',
      'Support branches with heavy flowers',
      'Pollinate flowers if necessary'
    ],
    harvest: [
      'Pick ripe fruits regularly',
      'Check fruit color daily',
      'Inspect for pests',
      'Harvest encourages more fruit production',
      'Store harvested fruits properly',
      'Trim unhealthy branches',
      'Prepare for next cycle planting'
    ]
  };

  const stageReminders = reminderPool[stage] || reminderPool['grow'];

  // Pick 2–3 random reminders for the day
  const shuffled = [...stageReminders].sort(() => 0.5 - Math.random());
  const dailyReminders = shuffled.slice(0, 3);

  // Build HTML
  return dailyReminders.map((reminder, i) => `
    <div class="reminder">
      <span class="r-dot urgent"></span>
      <div class="r-info">
        <strong>${reminder}</strong>
      </div>
      <span class="r-badge urgent">Today</span>
    </div>
  `).join('');
}