import z from "@deepseek-ai/schemastery";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { BUNDLED_SKILL_RANK } from "@deepseek-ai/dsh-skill";

//#region src/client.ts
async function getJson(url, timeoutMs, fetchImpl) {
	const ctrl = new AbortController();
	const timer = setTimeout(() => ctrl.abort(), timeoutMs);
	try {
		const res = await fetchImpl(url, { signal: ctrl.signal });
		if (!res.ok) throw new Error(`天气服务返回 ${res.status}`);
		return await res.json();
	} finally {
		clearTimeout(timer);
	}
}
/** 城市名 → 经纬度（Open-Meteo 地理编码）。找不到返回 null。 */
async function geocode(config, city, fetchImpl = fetch) {
	return (await getJson(`${config.geocodingUrl}?name=${encodeURIComponent(city)}&count=1&language=zh`, config.timeoutMs, fetchImpl)).results?.[0] ?? null;
}
/** 经纬度 → 当前天气与今日高低温 */
async function forecast(config, lat, lon, fetchImpl = fetch) {
	return getJson(`${config.baseUrl}?latitude=${lat}&longitude=${lon}&current_weather=true&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1`, config.timeoutMs, fetchImpl);
}

//#endregion
//#region src/fragment.ts
/** WMO 天气码 → 动效类型（纯函数，可单测） */
function codeToType(code) {
	if (code === 0) return "sunny";
	if (code <= 2) return "partly";
	if (code === 3) return "cloudy";
	if (code === 45 || code === 48) return "fog";
	if (code >= 51 && code <= 57) return "rain";
	if (code >= 61 && code <= 67) return "rain";
	if (code >= 71 && code <= 77) return "snow";
	if (code >= 80 && code <= 82) return "rain";
	if (code >= 85 && code <= 86) return "snow";
	if (code >= 95) return "storm";
	return "partly";
}
/** 解析 Open-Meteo current_weather 原始数据 → WeatherInfo（纯函数） */
function parseWeather(city, current, daily) {
	const dirs = [
		"北",
		"东北",
		"东",
		"东南",
		"南",
		"西南",
		"西",
		"西北"
	];
	const idx = Math.round((current.winddirection ?? 0) % 360 / 45) % 8;
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
		minTemp: daily?.temperature_2m_min?.[0] != null ? Math.round(daily.temperature_2m_min[0]) : null
	};
}
/** 给模型看的一句话摘要（output.description 要短） */
function summarize(info, unit) {
	const t = unit === "c" ? `${info.temp}°C` : `${Math.round(info.temp * 9 / 5 + 32)}°F`;
	const wind = `${info.windSpeed}km/h ${info.windDir}风`;
	const range = info.minTemp != null && info.maxTemp != null ? `，${info.minTemp}~${info.maxTemp}°C` : "";
	return `${info.city}当前${codeLabelByType(info.type)}，${t}${range}，${wind}。已生成天气卡片。`;
}
function codeLabelByType(t) {
	return {
		sunny: "晴天",
		partly: "多云",
		cloudy: "阴天",
		fog: "有雾",
		rain: "有雨",
		snow: "有雪",
		storm: "雷暴"
	}[t];
}
/** 从持久化 tool/result meta 还原结构化天气信息（Node 端写入、浏览器端读取） */
function weatherMetaFrom(meta) {
	if (typeof meta !== "object" || meta === null) return void 0;
	const m = meta;
	if (m.kind !== "weather") return void 0;
	if (typeof m.info !== "object" || m.info === null) return void 0;
	const unit = m.unit === "f" ? "f" : "c";
	return {
		info: m.info,
		unit
	};
}

//#endregion
//#region src/tool.ts
/**
* weather tool: query a city's current weather and project a structured
* WeatherInfo into the persisted `tool/result` meta so the browser half can
* render it as an animated card and replay reproduces the same card.
* The model-facing result stays a one-line text summary.
* @module weather-plugin/tool
*/
const DESCRIPTION = "查询城市实时天气。当用户询问某地天气、气温、是否下雨/下雪、风力或\"要不要带伞\"时使用。结果会以带动效的天气卡片展示（晴天/多云/阴/雾/雨/雪/雷暴动画）。";
/** 定义 weather 工具（由 index.ts 注册到 ctx.tools） */
function weatherTool(config, fetchImpl) {
	return defineTool({
		name: "weather",
		description: DESCRIPTION,
		parameters: {
			city: {
				type: "string",
				required: true,
				description: "城市名，如：北京、上海、广州、纽约"
			},
			unit: {
				type: "string",
				enum: ["c", "f"],
				description: "温度单位：c=摄氏度，f=华氏度"
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					text: {
						type: "string",
						required: true
					},
					unit: {
						type: "string",
						enum: ["c", "f"],
						required: true
					},
					info: {
						type: "object",
						additionalProperties: true,
						required: true
					}
				}
			},
			render: (_args, value) => [{
				type: "text",
				text: value.text
			}],
			presentationMeta: (_args, value) => ({
				kind: "weather",
				info: value.info,
				unit: value.unit
			})
		},
		isConcurrencySafe: () => true,
		async execute(args) {
			const input = args;
			const city = typeof input.city === "string" ? input.city : "";
			if (city === "") throw new Error("weather: city 是必填参数");
			const unit = input.unit === "f" ? "f" : "c";
			const fetchImpl_ = fetchImpl ?? fetch;
			const geo = await geocode(config, city, fetchImpl_);
			if (!geo) throw new Error(`未找到城市「${city}」，请检查城市名拼写（可尝试直辖市或省会名）`);
			const fc = await forecast(config, geo.latitude, geo.longitude, fetchImpl_);
			const info = parseWeather(geo.name, fc.current_weather, fc.daily);
			return {
				text: summarize(info, unit),
				info,
				unit
			};
		},
		presentCall: () => ({
			card: "generic",
			title: "天气",
			kind: "other"
		}),
		presentResult(_args, result) {
			if (result.isError) return void 0;
			const meta = weatherMetaFrom(result.meta);
			if (meta === void 0) return void 0;
			return {
				card: "generic",
				title: `天气 · ${meta.info.city}`
			};
		}
	});
}

//#endregion
//#region src/skill.ts
/**
* Bundled skill provider for weather-plugin: one skill that teaches the model
* how to brief a weather report. Mirrors the official provider shape:
* candidates listed by `list()`, full bodies served by `get()`.
* @module weather-plugin/skill
*/
const PROVIDER_NAME = "weather-plugin";
const CANDIDATES = [{
	name: "weather-briefing",
	description: "向用户播报天气时使用：固定结构、语气自然、附一条实用建议。在调用 weather 工具拿到实时数据后，按此规范组织播报。",
	invocation: {
		modelInvocable: true,
		userInvocable: true
	},
	provider: PROVIDER_NAME,
	source: "bundled",
	rank: BUNDLED_SKILL_RANK,
	locator: "weather-briefing"
}];
const BODY = `# 天气播报规范
1. 先报城市与天气类型（如：北京当前晴天）。
2. 再报温度与体感，单位与用户要求一致（摄氏度/华氏度）。
3. 补充风力（风速+风向）。
4. 有高低温时附上今日范围。
5. 结合天气给一句实用建议（雨天带伞、降温加衣、雪天慢行），不超过 10 字。
6. 只依据 weather 工具返回的实时数据，不编造预报。`;
/** The bundled provider registered on `ctx.skills`. */
const weatherSkillProvider = {
	name: PROVIDER_NAME,
	list: () => Promise.resolve(CANDIDATES),
	async get(candidate) {
		return {
			name: candidate.name,
			description: candidate.description,
			invocation: candidate.invocation,
			provider: PROVIDER_NAME,
			source: "bundled",
			rank: candidate.rank,
			content: BODY
		};
	}
};

//#endregion
//#region src/index.ts
const name = "weather-plugin";
const inject = [
	"tools",
	"systemPrompt",
	"skills"
];
const DEFAULT_BASE_URL = "https://api.open-meteo.com/v1/forecast";
const DEFAULT_GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";
const Config = z.object({
	baseUrl: z.string().default(DEFAULT_BASE_URL).description("Open-Meteo 天气 API 基地址；可指向自建镜像做离线开发。"),
	geocodingUrl: z.string().default(DEFAULT_GEOCODING_URL).description("Open-Meteo 地理编码 API 基地址。"),
	timeoutMs: z.number().step(1).min(1e3).default(1e4).description("单次天气请求超时（毫秒）。")
});
const PROMPT_TEXT = `## Query weather (weather)
Use the \`weather\` tool when the user asks about the weather, temperature, rain/snow, or wind for any city (for example "北京天气怎么样" or "will it rain in London tomorrow morning?"). Pass the city name in \`city\`. The tool returns real-time conditions as an animated weather card; report it following the weather-briefing skill. Only pass \`unit\` when the user asks for Fahrenheit.`;
function apply(ctx, config) {
	const resolved = {
		baseUrl: config.baseUrl ?? DEFAULT_BASE_URL,
		geocodingUrl: config.geocodingUrl ?? DEFAULT_GEOCODING_URL,
		timeoutMs: config.timeoutMs ?? 1e4
	};
	ctx.effect(() => ctx.tools.register(weatherTool(resolved)), "weather-plugin.tool");
	ctx.effect(() => ctx.skills.registerProvider(() => weatherSkillProvider), "weather-plugin.skill");
	ctx.effect(() => ctx.systemPrompt.section({
		name: "tool:weather",
		order: 117,
		text: PROMPT_TEXT
	}), "weather-plugin.prompt");
}

//#endregion
export { Config, apply, inject, name };