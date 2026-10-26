const CITY_CSV_PATH = "city_coordinates.csv";
const API_BASE = "https://api.open-meteo.com/v1/forecast";

const citySelect = document.getElementById("citySelect");
const forecastButton = document.getElementById("forecastButton");
const statusMessage = document.getElementById("statusMessage");
const forecastHeader = document.getElementById("forecastHeader");
const destinationName = document.getElementById("destinationName");
const forecastSubtitle = document.getElementById("forecastSubtitle");
const forecastGrid = document.getElementById("forecastGrid");

const weatherInfo = {
  0: { label: "Clear sky", icon: "☀️" },
  1: { label: "Mainly clear", icon: "🌤️" },
  2: { label: "Partly cloudy", icon: "⛅" },
  3: { label: "Overcast", icon: "☁️" },
  45: { label: "Fog", icon: "🌫️" },
  48: { label: "Depositing rime fog", icon: "🌫️" },
  51: { label: "Light drizzle", icon: "🌦️" },
  53: { label: "Moderate drizzle", icon: "🌦️" },
  55: { label: "Dense drizzle", icon: "🌧️" },
  56: { label: "Light freezing drizzle", icon: "🌧️" },
  57: { label: "Dense freezing drizzle", icon: "🌧️" },
  61: { label: "Slight rain", icon: "🌦️" },
  63: { label: "Moderate rain", icon: "🌧️" },
  65: { label: "Heavy rain", icon: "🌧️" },
  66: { label: "Light freezing rain", icon: "🌧️" },
  67: { label: "Heavy freezing rain", icon: "🌧️" },
  71: { label: "Slight snow", icon: "🌨️" },
  73: { label: "Moderate snow", icon: "❄️" },
  75: { label: "Heavy snow", icon: "❄️" },
  77: { label: "Snow grains", icon: "🌨️" },
  80: { label: "Slight rain showers", icon: "🌦️" },
  81: { label: "Moderate rain showers", icon: "🌧️" },
  82: { label: "Violent rain showers", icon: "🌧️" },
  85: { label: "Slight snow showers", icon: "🌨️" },
  86: { label: "Heavy snow showers", icon: "❄️" },
  95: { label: "Thunderstorm", icon: "⛈️" },
  96: { label: "Thunderstorm with hail", icon: "⛈️" },
  99: { label: "Thunderstorm with heavy hail", icon: "⛈️" }
};

let cities = [];

function parseCSV(text) {
  const rows = text.trim().split(/\r?\n/);
  if (rows.length < 2) throw new Error("The city CSV file is empty.");

  const headers = rows.shift().replace(/^\uFEFF/, "").split(",").map(h => h.trim().toLowerCase());
  const required = ["latitude", "longitude", "city", "country"];
  const missing = required.filter(name => !headers.includes(name));
  if (missing.length) throw new Error(`CSV is missing required columns: ${missing.join(", ")}.`);

  return rows.map(row => {
    const values = [];
    let value = "";
    let inQuotes = false;
    for (let i = 0; i < row.length; i++) {
      const char = row[i];
      if (char === '"' && row[i + 1] === '"' && inQuotes) {
        value += '"'; i++;
      } else if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        values.push(value.trim()); value = "";
      } else {
        value += char;
      }
    }
    values.push(value.trim());
    const record = {};
    headers.forEach((header, index) => record[header] = (values[index] || "").replace(/^"|"$/g, ""));
    return {
      latitude: Number(record.latitude),
      longitude: Number(record.longitude),
      city: record.city,
      country: record.country
    };
  }).filter(city => city.city && city.country && Number.isFinite(city.latitude) && Number.isFinite(city.longitude));
}

async function loadCities() {
  try {
    const response = await fetch(CITY_CSV_PATH);
    if (!response.ok) throw new Error(`Could not load ${CITY_CSV_PATH} (HTTP ${response.status}).`);
    cities = parseCSV(await response.text());
    if (!cities.length) throw new Error("No valid city rows were found in the CSV file.");

    cities.sort((a, b) => a.city.localeCompare(b.city));
    citySelect.innerHTML = "";
    cities.forEach((city, index) => {
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = `${city.city}, ${city.country}`;
      citySelect.appendChild(option);
    });
    citySelect.disabled = false;
    forecastButton.disabled = false;
    setStatus(`Loaded ${cities.length} destinations. Choose a city to view its forecast.`);
    await showForecast();
  } catch (error) {
    setStatus(`${error.message} Keep all four project files in the same folder and open index.html using VS Code Live Server.`, true);
  }
}

function setStatus(message, isError = false) {
  statusMessage.textContent = message;
  statusMessage.classList.toggle("error", isError);
  statusMessage.classList.remove("hidden");
}

function hideStatus() {
  statusMessage.classList.add("hidden");
}

function getWeather(code) {
  return weatherInfo[code] || { label: "Conditions unavailable", icon: "🌍" };
}

function formatDate(dateString) {
  const date = new Date(`${dateString}T12:00:00`);
  return {
    weekday: new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(date),
    full: new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" }).format(date)
  };
}

function makeWeatherCard(day, index, daily) {
  const date = formatDate(day);
  const weather = getWeather(daily.weather_code[index]);
  const high = daily.temperature_2m_max[index];
  const low = daily.temperature_2m_min[index];
  const wind = daily.wind_speed_10m_max[index];
  const rain = daily.precipitation_probability_max[index];

  const card = document.createElement("article");
  card.className = "weather-card";
  card.innerHTML = `
    <div class="day-name">${date.weekday}</div>
    <div class="day-date">${date.full}</div>
    <div class="weather-icon" aria-hidden="true">${weather.icon}</div>
    <div class="weather-label">${weather.label}</div>
    <div class="temperatures">
      <span class="temp-high">${high ?? "—"}°</span>
      <span class="temp-low">${low ?? "—"}°</span>
    </div>
    <div class="card-detail">💨 Wind: ${wind ?? "—"} km/h</div>
    <div class="card-detail">☂ Rain chance: ${rain ?? "—"}%</div>
  `;
  return card;
}

async function showForecast() {
  if (!cities.length) return;
  const city = cities[Number(citySelect.value)];
  if (!city) return;

  forecastButton.disabled = true;
  forecastButton.textContent = "Loading…";
  forecastGrid.replaceChildren();
  forecastHeader.classList.add("hidden");
  setStatus(`Fetching the forecast for ${city.city}, ${city.country}…`);

  const params = new URLSearchParams({
    latitude: String(city.latitude),
    longitude: String(city.longitude),
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max",
    forecast_days: "7",
    timezone: "auto"
  });

  try {
    const response = await fetch(`${API_BASE}?${params.toString()}`);
    if (!response.ok) throw new Error(`Weather service returned HTTP ${response.status}.`);
    const data = await response.json();
    if (!data.daily || !Array.isArray(data.daily.time) || data.daily.time.length === 0) {
      throw new Error("The weather service returned no forecast days for this destination.");
    }

    destinationName.textContent = `${city.city}, ${city.country}`;
    forecastSubtitle.textContent = "A seven-day outlook to help you plan ahead.";
    forecastHeader.classList.remove("hidden");
    data.daily.time.slice(0, 7).forEach((day, index) => {
      forecastGrid.appendChild(makeWeatherCard(day, index, data.daily));
    });
    hideStatus();
  } catch (error) {
    forecastGrid.replaceChildren();
    setStatus(
      `We couldn't load this forecast. ${error.message || "Please try again."} Check your internet connection and try again. If this continues, open the browser console (F12 → Console) for details.`,
      true
    );
  } finally {
    forecastButton.disabled = false;
    forecastButton.innerHTML = 'Show forecast <span aria-hidden="true">→</span>';
  }
}

forecastButton.addEventListener("click", showForecast);
citySelect.addEventListener("change", showForecast);
await loadCities();
