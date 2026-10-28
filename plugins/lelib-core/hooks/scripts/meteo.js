// Hook SessionStart : affiche la météo du jour à l'ouverture de Claude Code.
// Ville configurable via la variable d'environnement LELIB_METEO_VILLE (Paris par défaut).
// Données Open-Meteo (gratuit, sans clé). Lancé avec --use-env-proxy pour passer le proxy GRDF.

const VILLE = process.env.LELIB_METEO_VILLE || "Paris";
const TIMEOUT_MS = 4000;

// Codes météo WMO utilisés par Open-Meteo.
const CODES = {
  0: ["☀️", "ciel dégagé"],
  1: ["🌤️", "peu nuageux"],
  2: ["⛅", "partiellement nuageux"],
  3: ["☁️", "couvert"],
  45: ["🌫️", "brouillard"],
  48: ["🌫️", "brouillard givrant"],
  51: ["🌦️", "bruine légère"],
  53: ["🌦️", "bruine"],
  55: ["🌦️", "bruine forte"],
  56: ["🌧️", "bruine verglaçante"],
  57: ["🌧️", "bruine verglaçante forte"],
  61: ["🌧️", "pluie faible"],
  63: ["🌧️", "pluie"],
  65: ["🌧️", "pluie forte"],
  66: ["🌧️", "pluie verglaçante"],
  67: ["🌧️", "pluie verglaçante forte"],
  71: ["🌨️", "neige faible"],
  73: ["🌨️", "neige"],
  75: ["❄️", "neige forte"],
  77: ["🌨️", "grains de neige"],
  80: ["🌦️", "averses faibles"],
  81: ["🌦️", "averses"],
  82: ["⛈️", "averses violentes"],
  85: ["🌨️", "averses de neige"],
  86: ["🌨️", "fortes averses de neige"],
  95: ["⛈️", "orage"],
  96: ["⛈️", "orage avec grêle"],
  99: ["⛈️", "orage avec forte grêle"],
};

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function main() {
  const geo = await getJson(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(VILLE)}&count=1&language=fr`
  );
  const lieu = geo.results?.[0];
  if (!lieu) return `🌍 Météo : ville « ${VILLE} » introuvable (variable LELIB_METEO_VILLE).`;

  const meteo = await getJson(
    `https://api.open-meteo.com/v1/forecast?latitude=${lieu.latitude}&longitude=${lieu.longitude}` +
      `&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m` +
      `&daily=temperature_2m_min,temperature_2m_max,precipitation_probability_max` +
      `&timezone=auto&forecast_days=1`
  );
  const c = meteo.current;
  const d = meteo.daily;
  const [icone, libelle] = CODES[c.weather_code] ?? ["🌡️", "conditions inconnues"];
  const r = Math.round;

  return (
    `${icone} Météo à ${lieu.name} : ${r(c.temperature_2m)} °C (ressenti ${r(c.apparent_temperature)} °C), ${libelle}` +
    ` · min ${r(d.temperature_2m_min[0])}° / max ${r(d.temperature_2m_max[0])}°` +
    ` · pluie ${d.precipitation_probability_max[0] ?? 0} %` +
    ` · vent ${r(c.wind_speed_10m)} km/h`
  );
}

main()
  .catch(() => "🌍 Météo indisponible pour le moment.")
  .then((message) => {
    // systemMessage est affiché à l'utilisateur au démarrage de la session.
    process.stdout.write(JSON.stringify({ systemMessage: message }));
    process.exit(0);
  });
