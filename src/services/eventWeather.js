const weatherLabels = {
  0: "Klar",
  1: "Überwiegend klar",
  2: "Teilweise bewölkt",
  3: "Bewölkt",
  45: "Nebel",
  48: "Reifnebel",
  51: "Leichter Nieselregen",
  53: "Nieselregen",
  55: "Starker Nieselregen",
  61: "Leichter Regen",
  63: "Regen",
  65: "Starker Regen",
  71: "Leichter Schneefall",
  73: "Schneefall",
  75: "Starker Schneefall",
  80: "Regenschauer",
  81: "Starke Regenschauer",
  82: "Heftige Regenschauer",
  95: "Gewitter",
};

export async function geocodeLocation(location) {
  const response = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=de&format=json`,
  );
  if (!response.ok) throw new Error("Ort konnte nicht gefunden werden.");
  const data = await response.json();
  const result = data.results?.[0];
  if (!result) throw new Error("Ort konnte nicht gefunden werden.");
  return result;
}

export async function fetchEventForecast(location, date) {
  const eventDate = new Date(`${date}T12:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysAway = Math.ceil((eventDate - today) / 86_400_000);

  if (daysAway < 0) return { unavailable: true, reason: "Das Event liegt bereits in der Vergangenheit." };
  if (daysAway > 16) {
    return {
      unavailable: true,
      daysAway,
      reason: `Eine belastbare Wetterprognose ist etwa 16 Tage vorher verfügbar.`,
    };
  }

  const savedPlace = typeof location === "object" && location?.latitude && location?.longitude
    ? location
    : null;
  const place = savedPlace || await geocodeLocation(typeof location === "string" ? location : location?.label || location?.displayName || "");
  const params = new URLSearchParams({
    latitude: String(place.latitude),
    longitude: String(place.longitude),
    start_date: date,
    end_date: date,
    timezone: "auto",
    daily: [
      "weather_code",
      "temperature_2m_max",
      "temperature_2m_min",
      "precipitation_sum",
      "precipitation_probability_max",
      "wind_speed_10m_max",
    ].join(","),
  });
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!response.ok) throw new Error("Wetterprognose konnte nicht geladen werden.");
  const data = await response.json();
  const daily = data.daily;
  return {
    place: place.label || place.displayName || [place.name, place.admin1, place.country].filter(Boolean).join(", "),
    condition: weatherLabels[daily.weather_code?.[0]] || "Unbekannt",
    max: Math.round(daily.temperature_2m_max?.[0]),
    min: Math.round(daily.temperature_2m_min?.[0]),
    rain: Number(daily.precipitation_sum?.[0] || 0),
    rainChance: Math.round(daily.precipitation_probability_max?.[0] || 0),
    wind: Math.round(daily.wind_speed_10m_max?.[0] || 0),
  };
}

export function buildEventAdvice(forecast) {
  const advice = [];
  if (forecast.max >= 24) advice.push("leichte Kleidung", "mehr trinken und Elektrolyte einplanen");
  else if (forecast.max <= 8) advice.push("wärmere Schicht für Start und Wartezeiten");
  if (forecast.rainChance >= 40 || forecast.rain >= 1) advice.push("Regenjacke oder Wechseloberteil einpacken");
  if (forecast.wind >= 25) advice.push("winddichte Schicht einplanen");
  return advice.length ? advice.join(" · ") : "Voraussichtlich normale Laufkleidung ausreichend.";
}
