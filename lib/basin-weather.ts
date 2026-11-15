import archive from "./data/el-chalten-2025-ifs-daily.json";

const daily = archive.daily;
export const replayYear = Number(archive.source.startDate.slice(0, 4));
export const replayDays = daily.time.length;
export const weatherSource = archive.source;

// A degree-day approximation supplies a repeatable snowpack and melt response.
let pack = 0;
let recentRain = 0;
const records = daily.time.map((date, i) => {
  const temperature = daily.temperature_2m_mean[i];
  const rain = daily.rain_sum[i];
  const snow = daily.snowfall_sum[i];
  pack = Math.min(180, pack + snow);
  const melt = Math.min(pack, Math.max(0, temperature - 0.2) * .96);
  pack -= melt;
  recentRain = recentRain * .69 + rain;
  return {
    date, temperature, rain, snow,
    cloud: daily.cloud_cover_mean[i] / 100,
    daylight: daily.daylight_duration[i] / 3600,
    wind: daily.wind_speed_10m_max[i],
    windBearing: daily.wind_direction_10m_dominant[i],
    snowCover: Math.min(1, Math.sqrt(pack / 120)),
    runoff: Math.min(.48, recentRain * .006 + melt * .038),
  };
});

export function historicalWeatherAt(day: number) {
  return records[Math.min(replayDays - 1, Math.max(0, Math.floor(day)))];
}
