/**
 * Open-Meteo weather client over global fetch. Pure functions with an
 * injectable fetch for tests: geocode a city, then fetch its current weather.
 * No API key needed; point baseUrl at a self-hosted mirror to develop offline.
 * @module weather-plugin/client
 */

export interface WeatherClientConfig {
  baseUrl: string
  geocodingUrl: string
  timeoutMs: number
}

export interface GeocodeResult {
  latitude: number
  longitude: number
  name: string
}

export interface CurrentWeather {
  temperature: number
  windspeed: number
  winddirection: number
  weathercode: number
  is_day: number
  time: string
}

export interface Daily {
  temperature_2m_max: number[]
  temperature_2m_min: number[]
}

export interface ForecastResult {
  current_weather: CurrentWeather
  daily: Daily
}

async function getJson<T>(url: string, timeoutMs: number, fetchImpl: typeof fetch): Promise<T> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetchImpl(url, { signal: ctrl.signal })
    if (!res.ok) throw new Error(`天气服务返回 ${res.status}`)
    return (await res.json()) as T
  } finally {
    clearTimeout(timer)
  }
}

/** 城市名 → 经纬度（Open-Meteo 地理编码）。找不到返回 null。 */
export async function geocode(
  config: WeatherClientConfig,
  city: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GeocodeResult | null> {
  const data = await getJson<{ results?: Array<{ latitude: number; longitude: number; name: string }> }>(
    `${config.geocodingUrl}?name=${encodeURIComponent(city)}&count=1&language=zh`,
    config.timeoutMs,
    fetchImpl,
  )
  return data.results?.[0] ?? null
}

/** 经纬度 → 当前天气与今日高低温 */
export async function forecast(
  config: WeatherClientConfig,
  lat: number,
  lon: number,
  fetchImpl: typeof fetch = fetch,
): Promise<ForecastResult> {
  return getJson<ForecastResult>(
    `${config.baseUrl}?latitude=${lat}&longitude=${lon}&current_weather=true` +
      `&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1`,
    config.timeoutMs,
    fetchImpl,
  )
}
