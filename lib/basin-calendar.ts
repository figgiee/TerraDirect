import { historicalWeatherAt, replayYear } from "./basin-weather";

const dayMs = 86_400_000;
const monthNames = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" });
export const firstYear = 2026;
export const firstDay = 70;

export function yearLength(year: number) {
  return (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / dayMs;
}

export function seasonAt(year: number, day: number, historical = false) {
  const date = new Date(Date.UTC(year, 0, 1) + Math.floor(day) * dayMs);
  const month = date.getUTCMonth();
  const season: keyof typeof seasonalDirections = month < 2 || month === 11 ? "Summer" : month < 5 ? "Autumn" : month < 8 ? "Winter" : "Spring";
  const length = yearLength(year);
  const winter = (1 + Math.cos((day - 205) * Math.PI * 2 / length)) / 2;
  const melt = Math.exp(-Math.pow((day - 288) / 48, 2));
  const variation = Math.sin(year * 4.143) * 0.09;
  const weather = historical ? historicalWeatherAt(day) : null;
  const greening = Math.max(0, Math.min(1, (day - 254) / 70));
  const gold = season === "Autumn" ? Math.sin(Math.PI * Math.min(1, (day - 55) / 110)) : 0;
  return {
    label: monthNames.format(date), season,
    snow: weather ? Math.max(weather.snowCover * .81, winter ** 2.65 * .30) : Math.max(0, Math.min(1, winter ** 2.25 + variation)),
    foliage: month < 2 || month === 11 ? 0 : month < 5 ? Math.min(1, (day - 56) / 87) : month < 8 ? 1 : Math.max(0, 1 - (day - 243) / 91),
    gold,
    green: season === "Summer" ? 1 : season === "Spring" ? greening : .22 * (1 - gold),
    inflow: 0.85 + melt * (weather ? .27 : .59) - winter * 0.18 + variation + (weather?.runoff ?? 0),
    light: weather ? (weather.daylight - 8) / 8.5 - weather.cloud * .58 : 1 - winter,
    weather,
  };
}

export type BasinSeason = ReturnType<typeof seasonAt>;

export function advanceCalendar(year: number, day: number, days: number, historical = false) {
  if (historical) return { year: replayYear, day: (day + days) % yearLength(replayYear) };
  day += days;
  while (day >= yearLength(year)) {
    day -= yearLength(year);
    year++;
  }
  return { year, day };
}

export const seasonalDirections = {
  Summer: "Summer daylight warms the same valley. Exposed slopes and deep green lenga surround the flowing creek.",
  Autumn: "The same lenga woodland turns mottled copper and amber. Cool sunlight and thin haze settle over the valley.",
  Winter: "Winter snow settles in gullies and across shaded slopes. Leafless lenga line the darker creek, which stays visible.",
  Spring: "Snow recedes uphill and exposes wet gravel. Lenga leaf out and snowmelt visibly quickens the same creek.",
};
