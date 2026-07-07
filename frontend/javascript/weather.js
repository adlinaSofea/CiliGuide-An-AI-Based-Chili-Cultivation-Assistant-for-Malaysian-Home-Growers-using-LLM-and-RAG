// WEATHER CONFIG
// ─────────────────────────────────────────────────────────────
// LOCAL TESTING  → set USE_PROXY = false  (calls OpenWeatherMap directly)

// ─────────────────────────────────────────────────────────────
const USE_PROXY   = false;
const BACKEND_URL = "https://api.ciliguide.com";        // your VPS domain (used when USE_PROXY = true)
 


// HELPER — fetch weather+forecast by city name
async function getWeatherByCity(city) {
  if (USE_PROXY) {
    const res = await fetch(`${BACKEND_URL}/api/weather/city?city=${encodeURIComponent(city)}`);
    return res.json();
  } else {
    const [w, f] = await Promise.all([
      fetch(`https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&units=metric&appid=${API_KEY}`).then(r => r.json()),
      fetch(`https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(city)}&units=metric&appid=${API_KEY}`).then(r => r.json())
    ]);
    return { weather: w, forecast: f };
  }
}

// HELPER — fetch weather+forecast by coordinates
async function getWeatherByCoords(lat, lon) {
  if (USE_PROXY) {
    const res = await fetch(`${BACKEND_URL}/api/weather/coords?lat=${lat}&lon=${lon}`);
    return res.json();
  } else {
    const [w, f] = await Promise.all([
      fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${API_KEY}`).then(r => r.json()),
      fetch(`https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=metric&appid=${API_KEY}`).then(r => r.json())
    ]);
    return { weather: w, forecast: f };
  }
}


// HELPER — finds the visible element when duplicate IDs exist
function getEl(id) {
  const all = document.querySelectorAll('#' + id);
  for (const el of all) {
    const page = el.closest('.page');
    if (!page || page.classList.contains('active')) return el;
  }
  return all[all.length - 1] || null;
}

function setEl(id, value) {
  const el = getEl(id);
  if (el) el.innerText = value;
}


// INIT WEATHER
export function initWeather(locationFromCycle) {
  if (locationFromCycle) {
    fetchWeatherByCity(locationFromCycle);
  } else {
    initGeoWeather();
  }
}


// FETCH WEATHER BY CITY
export async function fetchWeatherByCity(cityName) {
  try {
    if (!cityName) throw new Error("No city specified");

    const data = await getWeatherByCity(cityName);

    if (data.weather.cod !== 200)    throw new Error(data.weather.message);
    if (data.forecast.cod !== "200") throw new Error(data.forecast.message);

    updateCurrentWeather(data.weather);
    updateForecast(data.forecast);

  } catch (err) {
    console.error("Weather fetch failed:", err);
    setEl("w-desc-val", "Weather fetch failed");
    setEl("w-temp-val", "--°C");
    setEl("w-loc-val",  "📍 Unknown");
  }
}


// GEOLOCATION FALLBACK
export function initGeoWeather() {
  if (!navigator.geolocation) {
    setEl("w-desc-val", "Location not supported");
    return;
  }

  navigator.geolocation.getCurrentPosition(
    pos => fetchWeatherByCoords(pos.coords.latitude, pos.coords.longitude),
    err => {
      console.warn("Geolocation failed:", err);
      setEl("w-desc-val", "Location access denied");
      setEl("w-temp-val", "--°C");
      setEl("w-loc-val",  "📍 Unknown");
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

async function fetchWeatherByCoords(lat, lon) {
  try {
    const data = await getWeatherByCoords(lat, lon);

    if (data.weather.cod !== 200)    throw new Error(data.weather.message);
    if (data.forecast.cod !== "200") throw new Error(data.forecast.message);

    updateCurrentWeather(data.weather);
    updateForecast(data.forecast);

  } catch (err) {
    console.error("Weather fetch failed:", err);
    setEl("w-desc-val", "Weather fetch failed");
    setEl("w-temp-val", "--°C");
    setEl("w-loc-val",  "📍 Unknown");
  }
}


// UPDATE CURRENT WEATHER
function updateCurrentWeather(data) {
  const temp     = Math.round(data.main.temp);
  const desc     = data.weather[0].description;
  const city     = data.name;
  const humidity = data.main.humidity;
  const wind     = Math.round(data.wind.speed * 3.6);
  const uv       = estimateUV(temp);

  setEl("w-temp-val", `${temp}°C`);
  setEl("w-desc-val", desc);
  setEl("w-loc-val",  `📍 ${city}`);
  setEl("w-humidity", `${humidity}%`);
  setEl("w-wind",     `${wind} km/h`);
  setEl("w-uv",       `UV ${uv}`);

  setWeatherIcon(data.weather[0].main);
  generateAlerts(temp, data);
}


// SIMPLE UV ESTIMATION
function estimateUV(temp) {
  if (temp >= 35) return 10;
  if (temp >= 32) return 9;
  if (temp >= 30) return 8;
  if (temp >= 28) return 7;
  if (temp >= 26) return 6;
  return 5;
}


// WEATHER ICON
function setWeatherIcon(condition) {
  let icon = "☀️";
  switch (condition) {
    case "Clouds":       icon = "☁️";  break;
    case "Rain":         icon = "🌧️"; break;
    case "Thunderstorm": icon = "⛈️"; break;
    case "Clear":        icon = "☀️";  break;
    case "Drizzle":      icon = "🌦️"; break;
    case "Snow":         icon = "❄️";  break;
  }
  const el = getEl("w-icon-val");
  if (el) el.innerText = icon;
}


// FARMING ALERTS
function generateAlerts(temp, data) {
  const heatAlert = getEl("heat-alert");
  const rainAlert = getEl("rain-alert");

  if (!heatAlert || !rainAlert) return;

  if (temp >= 32) {
    heatAlert.innerText = `🌡️ High heat ${temp}°C — water twice today & provide shade 11am–3pm`;
  } else if (temp >= 28) {
    heatAlert.innerText = `🌤️ Warm weather ${temp}°C — water once daily`;
  } else {
    heatAlert.innerText = `🌤️ Temperature normal for chili plants`;
  }

  const rain = data.weather[0].main.toLowerCase();
  if (rain.includes("rain") || rain.includes("drizzle") || rain.includes("thunderstorm")) {
    rainAlert.innerText = `🌧️ Rain today — hold fertilizer & protect seedlings`;
  } else {
    rainAlert.innerText = `⏭️ No rain expected — normal care`;
  }
}


// FORECAST
function updateForecast(data) {
  const container = getEl("w-forecast-container");
  if (!container) return;
  container.innerHTML = "";

  for (let i = 0; i < 5; i++) {
    const forecast = data.list[i * 8];
    if (!forecast) continue;

    const date = new Date(forecast.dt_txt);
    const day  = date.toLocaleDateString("en-US", { weekday: "short" });
    const temp = Math.round(forecast.main.temp);

    let icon = "☀️";
    switch (forecast.weather[0].main) {
      case "Clouds":       icon = "⛅"; break;
      case "Rain":         icon = "🌧️"; break;
      case "Thunderstorm": icon = "⛈️"; break;
      case "Drizzle":      icon = "🌦️"; break;
      case "Snow":         icon = "❄️"; break;
      case "Clear":        icon = "☀️"; break;
    }

    const dayEl = document.createElement("div");
    dayEl.className = "w-day";
    dayEl.innerHTML = `
      <div class="wd-name">${day}</div>
      <div class="wd-icon">${icon}</div>
      <div class="wd-temp">${temp}°</div>
    `;
    container.appendChild(dayEl);
  }
}
