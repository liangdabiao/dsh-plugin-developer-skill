// 共享契约层：Node 端、浏览器端、测试三方共用的纯函数。
// 把"天气数据怎么解析/怎么映射动画类型"钉死在这里，保证双端渲染一致、可单测。

export type WeatherType =
  | "sunny"
  | "partly"
  | "cloudy"
  | "fog"
  | "rain"
  | "snow"
  | "storm";

export interface WeatherInfo {
  city: string;
  type: WeatherType; // 驱动浏览器端动效的关键字段
  temp: number; // 摄氏度
  feelsLike: number;
  windSpeed: number; // km/h
  windDir: string; // 风向文字
  humidity: number | null; // %
  isDay: boolean;
  time: string;
  maxTemp: number | null;
  minTemp: number | null;
}

/** WMO 天气码 → 动效类型（纯函数，可单测） */
export function codeToType(code: number): WeatherType {
  if (code === 0) return "sunny";
  if (code <= 2) return "partly";
  if (code === 3) return "cloudy";
  if (code === 45 || code === 48) return "fog";
  if (code >= 51 && code <= 57) return "rain"; // 毛毛雨/冻毛毛雨
  if (code >= 61 && code <= 67) return "rain"; // 雨/冻雨
  if (code >= 71 && code <= 77) return "snow"; // 雪/米雪
  if (code >= 80 && code <= 82) return "rain"; // 阵雨
  if (code >= 85 && code <= 86) return "snow"; // 阵雪
  if (code >= 95) return "storm"; // 雷暴
  return "partly";
}

/** 天气码 → 中文描述 */
export function codeLabel(code: number): string {
  const labels: Record<number, string> = {
    0: "晴", 1: "大部晴朗", 2: "局部多云", 3: "阴",
    45: "雾", 48: "冻雾",
    51: "毛毛雨", 53: "毛毛雨", 55: "毛毛雨", 56: "冻毛毛雨", 57: "冻毛毛雨",
    61: "小雨", 63: "中雨", 65: "大雨", 66: "冻雨", 67: "强冻雨",
    71: "小雪", 73: "中雪", 75: "大雪", 77: "米雪",
    80: "阵雨", 81: "强阵雨", 82: "暴雨", 85: "阵雪", 86: "强阵雪",
    95: "雷暴", 96: "雷暴伴冰雹", 99: "强雷暴伴冰雹",
  };
  return labels[code] ?? "未知";
}

/** 解析 Open-Meteo current_weather 原始数据 → WeatherInfo（纯函数） */
export function parseWeather(
  city: string,
  current: {
    temperature: number;
    windspeed: number;
    winddirection?: number;
    weathercode: number;
    is_day?: number;
    time: string;
  },
  daily?: { temperature_2m_max?: number[]; temperature_2m_min?: number[] },
): WeatherInfo {
  const dirs = ["北", "东北", "东", "东南", "南", "西南", "西", "西北"];
  const idx = Math.round(((current.winddirection ?? 0) % 360) / 45) % 8;
  return {
    city,
    type: codeToType(current.weathercode),
    temp: Math.round(current.temperature),
    feelsLike: Math.round(current.temperature),
    windSpeed: Math.round(current.windspeed),
    windDir: dirs[idx],
    humidity: null,
    isDay: (current.is_day ?? 1) === 1,
    time: current.time,
    maxTemp: daily?.temperature_2m_max?.[0] != null ? Math.round(daily.temperature_2m_max[0]) : null,
    minTemp: daily?.temperature_2m_min?.[0] != null ? Math.round(daily.temperature_2m_min[0]) : null,
  };
}

/** 给模型看的一句话摘要（output.description 要短） */
export function summarize(info: WeatherInfo, unit: "c" | "f"): string {
  const t = unit === "c" ? `${info.temp}°C` : `${Math.round((info.temp * 9) / 5 + 32)}°F`;
  const wind = `${info.windSpeed}km/h ${info.windDir}风`;
  const range = info.minTemp != null && info.maxTemp != null
    ? `，${info.minTemp}~${info.maxTemp}°C`
    : "";
  return `${info.city}当前${codeLabelByType(info.type)}，${t}${range}，${wind}。已生成天气卡片。`;
}

function codeLabelByType(t: WeatherType): string {
  const m: Record<WeatherType, string> = {
    sunny: "晴天", partly: "多云", cloudy: "阴天", fog: "有雾",
    rain: "有雨", snow: "有雪", storm: "雷暴",
  };
  return m[t];
}

/** 供模型直接引用的规则说明 */
export const RULE_TEXT = "结果会以带动效的天气卡片展示：包含温度、体感、风力与动画天气图标。";

/** 从持久化 tool/result meta 还原结构化天气信息（Node 端写入、浏览器端读取） */
export function weatherMetaFrom(meta: unknown): { info: WeatherInfo; unit: "c" | "f" } | undefined {
  if (typeof meta !== "object" || meta === null) return undefined;
  const m = meta as { kind?: unknown; info?: unknown; unit?: unknown };
  if (m.kind !== "weather") return undefined;
  if (typeof m.info !== "object" || m.info === null) return undefined;
  const unit = m.unit === "f" ? "f" : "c";
  return { info: m.info as WeatherInfo, unit };
}
