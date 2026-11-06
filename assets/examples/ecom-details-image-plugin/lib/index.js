import z from "@deepseek-ai/schemastery";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { ProxyAgent, fetch as fetch$1 } from "undici";
import { BUNDLED_SKILL_RANK } from "@deepseek-ai/dsh-skill";

//#region src/client.ts
/**
* apimart.ai / OpenAI 兼容图片 API 客户端（异步作业 + 轮询）。
* - 提交：POST {baseUrl}/images/generations → 返回 task_id
* - 轮询：GET  {baseUrl}/tasks/{task_id}     → completed 后取 result.images[0].url[0]
* - 代理：可选 proxyUrl，通过 undici ProxyAgent 走 HTTP CONNECT 隧道
*   （apimart.ai 在某些受限网络里需经本地代理才能访问）。
* fetch 可注入，便于测试。
* @module ecom-details-image-plugin/client
*/
/** 依据 proxyUrl 构造本客户端专用的 fetch（带 dispatcher），无代理则用全局 fetch。 */
function makeFetch(proxyUrl, fetchImpl = fetch) {
	if (!proxyUrl) return fetchImpl;
	const dispatcher = new ProxyAgent({ uri: proxyUrl });
	const proxyFetch = (input, init) => fetch$1(input, {
		...init,
		dispatcher
	});
	return proxyFetch;
}
async function postJson(url, body, apiKey, timeoutMs, fetchImpl) {
	const ctrl = new AbortController();
	const timer = setTimeout(() => ctrl.abort(), timeoutMs);
	try {
		const res = await fetchImpl(url, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json"
			},
			body: JSON.stringify(body),
			signal: ctrl.signal
		});
		if (!res.ok) {
			const detail = await res.text().catch(() => "");
			throw new Error(`生图接口返回 HTTP ${res.status}：${detail.slice(0, 300)}`);
		}
		return await res.json();
	} finally {
		clearTimeout(timer);
	}
}
async function getJson(url, apiKey, timeoutMs, fetchImpl) {
	let lastErr;
	for (let attempt = 0; attempt < 3; attempt++) {
		const ctrl = new AbortController();
		const timer = setTimeout(() => ctrl.abort(), timeoutMs);
		try {
			const res = await fetchImpl(url, {
				method: "GET",
				headers: { Authorization: `Bearer ${apiKey}` },
				signal: ctrl.signal
			});
			if (!res.ok) {
				const detail = await res.text().catch(() => "");
				throw new Error(`查询任务返回 HTTP ${res.status}：${detail.slice(0, 300)}`);
			}
			return await res.json();
		} catch (err) {
			lastErr = err;
			if (attempt < 2) await sleep(3e3 + attempt * 2e3);
		} finally {
			clearTimeout(timer);
		}
	}
	throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
/** 提交生图任务，返回 task_id */
async function submitTask(config, input, fetchImpl = fetch) {
	const payload = {
		model: config.model,
		prompt: input.prompt,
		n: 1,
		size: input.size ?? "1:1",
		resolution: input.resolution ?? "2k"
	};
	if (input.imageUrl) payload.image_urls = [input.imageUrl];
	const result = await postJson(`${config.baseUrl}/images/generations`, payload, config.apiKey, config.timeoutMs, fetchImpl);
	const code = result.code;
	if (code !== void 0 && code !== 200) throw new Error(`生图提交失败（code=${code}）：${JSON.stringify(result).slice(0, 300)}`);
	const data = result.data;
	if (!Array.isArray(data) || data.length === 0) throw new Error(`生图提交响应缺少 data 数组：${JSON.stringify(result).slice(0, 300)}`);
	const first = data[0];
	if (typeof first.task_id !== "string" || first.task_id === "") throw new Error(`生图提交响应缺少 task_id：${JSON.stringify(first).slice(0, 300)}`);
	return first.task_id;
}
/** 轮询任务直至完成或超时；completed 时取回图片 URL */
async function pollTask(config, taskId, fetchImpl = fetch) {
	const url = `${config.baseUrl}/tasks/${taskId}`;
	const deadline = Date.now() + config.timeoutMs;
	await sleep(1e4);
	while (Date.now() < deadline) {
		const data = (await getJson(url, config.apiKey, Math.min(config.timeoutMs, 3e4), fetchImpl)).data;
		const task = typeof data === "object" && data !== null ? data : {};
		const status = typeof task.status === "string" ? task.status : "";
		if (status === "completed") {
			const imgUrl = extractImageUrl(task);
			if (!imgUrl) throw new Error("任务完成但未取到图片 URL");
			return {
				taskId,
				imageUrl: imgUrl,
				cost: typeof task.cost === "number" ? task.cost : void 0,
				actualTime: typeof task.actual_time === "number" ? task.actual_time : void 0
			};
		}
		if (status === "failed") throw new Error(`生图任务失败：${JSON.stringify(task).slice(0, 300)}`);
		await sleep(config.pollIntervalMs);
	}
	throw new Error(`生图任务超时（>${Math.round(config.timeoutMs / 1e3)}s），请稍后重试`);
}
function extractImageUrl(task) {
	const result = task.result;
	if (typeof result !== "object" || result === null) return void 0;
	const images = result.images;
	if (!Array.isArray(images) || images.length === 0) return void 0;
	const urls = images[0].url;
	if (!Array.isArray(urls) || urls.length === 0) return void 0;
	const first = urls[0];
	return typeof first === "string" ? first : void 0;
}
function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

//#endregion
//#region src/fragment.ts
/** apimart / OpenAI 兼容图片 API 支持的比例（与 apimart.md 一致） */
const VALID_SIZES = [
	"auto",
	"1:1",
	"3:2",
	"2:3",
	"4:3",
	"3:4",
	"5:4",
	"4:5",
	"16:9",
	"9:16",
	"2:1",
	"1:2",
	"21:9",
	"9:21"
];
const VALID_RESOLUTIONS = [
	"1k",
	"2k",
	"4k"
];
/** 默认尺寸与分辨率 */
const DEFAULT_SIZE = "1:1";
const DEFAULT_RESOLUTION = "2k";
/** 归一化比例：非法值回退到默认 */
function normalizeSize(size) {
	if (typeof size === "string") {
		const s = size.trim().toLowerCase();
		if (VALID_SIZES.includes(s)) return s;
	}
	return DEFAULT_SIZE;
}
/** 归一化分辨率：非法值回退到默认 */
function normalizeResolution(res) {
	if (typeof res === "string") {
		const r = res.trim().toLowerCase();
		if (VALID_RESOLUTIONS.includes(r)) return r;
	}
	return DEFAULT_RESOLUTION;
}
/** 给模型看的一句话摘要（output.description 保持简短） */
function summarizeResult(meta) {
	return `已生成图片（${meta.size}，${meta.resolution}）：${meta.imageUrl}`;
}
/** 从持久化 tool/result meta 还原结构化信息（Node 端写入、浏览器端读取） */
function ecomMetaFrom(meta) {
	if (typeof meta !== "object" || meta === null) return void 0;
	const m = meta;
	if (m.kind !== "ecom-image") return void 0;
	if (typeof m.imageUrl !== "string" || m.imageUrl === "") return void 0;
	return {
		kind: "ecom-image",
		imageUrl: m.imageUrl,
		size: typeof m.size === "string" ? m.size : DEFAULT_SIZE,
		resolution: typeof m.resolution === "string" ? m.resolution : DEFAULT_RESOLUTION,
		taskId: typeof m.taskId === "string" ? m.taskId : "",
		prompt: typeof m.prompt === "string" ? m.prompt : "",
		cost: typeof m.cost === "number" ? m.cost : void 0
	};
}

//#endregion
//#region src/tool.ts
/**
* ecom_generate_image tool: submit an image-generation prompt to an
* OpenAI-compatible / apimart.ai async image API, poll the task, and project
* the resulting image URL into the persisted `tool/result` meta so the browser
* half can render it as a gallery card and replay reproduces the same card.
* The model-facing result stays a one-line summary.
* @module ecom-details-image-plugin/tool
*/
const DESCRIPTION = "生成电商图片（产品主图/详情页/社媒图/直播场景等）。当用户要求生成商品图片、视觉素材或图片 Prompt 对应的图片时使用。模型应先按 ecom-details-image 技能写出高质量的图片 Prompt（含 Style Lock、hex 颜色、留白、负面约束），再调用本工具出图；结果会以画廊卡片展示在网页界面。";
/** 定义 ecom_generate_image 工具（由 index.ts 注册到 ctx.tools） */
function ecomImageTool(config, fetchImpl) {
	return defineTool({
		name: "ecom_generate_image",
		description: DESCRIPTION,
		parameters: {
			prompt: {
				type: "string",
				required: true,
				description: "完整图片生成 Prompt。按 ecom-details-image 技能规范编写：多图任务必须以同一段 Campaign Style Lock 开头；颜色用 hex 码；产品占比、留白用数字；结尾给负面约束清单。"
			},
			size: {
				type: "string",
				enum: [
					"auto",
					"1:1",
					"3:2",
					"2:3",
					"4:3",
					"3:4",
					"5:4",
					"4:5",
					"16:9",
					"9:16",
					"2:1",
					"1:2",
					"21:9",
					"9:21"
				],
				description: "图片比例。主图默认 1:1，详情页建议 2:3，海报/社媒按平台选 16:9 / 4:5 等。"
			},
			resolution: {
				type: "string",
				enum: [
					"1k",
					"2k",
					"4k"
				],
				description: "分辨率档位（1k/2k/4k）。默认 2k；4k 仅 16:9/9:16/2:1/1:2/21:9/9:21 支持。"
			},
			image_url: {
				type: "string",
				description: "参考产品图片的 URL（图生图，提升产品一致性）。有公网可访问的商品图 URL 时传入。"
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
					imageUrl: {
						type: "string",
						required: true
					},
					size: {
						type: "string",
						required: true
					},
					resolution: {
						type: "string",
						required: true
					},
					taskId: {
						type: "string",
						required: true
					},
					prompt: {
						type: "string",
						required: true
					},
					cost: { type: "number" }
				}
			},
			render: (_args, value) => [{
				type: "text",
				text: value.text
			}],
			presentationMeta: (_args, value) => ({
				kind: "ecom-image",
				imageUrl: value.imageUrl,
				size: value.size,
				resolution: value.resolution,
				taskId: value.taskId,
				prompt: value.prompt ?? ""
			})
		},
		isConcurrencySafe: () => false,
		async execute(args) {
			const input = args;
			const prompt = typeof input.prompt === "string" ? input.prompt.trim() : "";
			if (prompt === "") throw new Error("ecom_generate_image: prompt 是必填参数");
			const size = normalizeSize(input.size);
			const resolution = normalizeResolution(input.resolution);
			const imageUrl = typeof input.image_url === "string" && input.image_url.trim() !== "" ? input.image_url.trim() : void 0;
			const fetchImpl_ = makeFetch(config.proxyUrl, fetchImpl ?? fetch);
			const taskId = await submitTask(config, {
				prompt,
				size,
				resolution,
				imageUrl
			}, fetchImpl_);
			const result = await pollTask(config, taskId, fetchImpl_);
			return {
				text: summarizeResult({
					kind: "ecom-image",
					...result,
					size,
					resolution,
					prompt
				}),
				imageUrl: result.imageUrl,
				size,
				resolution,
				taskId,
				prompt,
				cost: result.cost
			};
		},
		presentCall: () => ({
			card: "generic",
			title: "生成电商图片",
			kind: "other"
		}),
		presentResult(_args, result) {
			if (result.isError) return void 0;
			const meta = ecomMetaFrom(result.meta);
			if (meta === void 0) return void 0;
			return {
				card: "generic",
				title: `电商图片 · ${meta.size}`
			};
		}
	});
}

//#endregion
//#region src/skill.ts
/**
* Bundled skill provider for ecom-details-image-plugin: one skill that teaches
* the model how to write high-quality e-commerce image prompts (template
* matching, Campaign Style Lock, GPT-Image-2 prompt rules, sequence planning).
* Mirrors the official provider shape: candidates listed by `list()`, full
* bodies served by `get()` (lazy loaded, keeps context lean).
* @module ecom-details-image-plugin/skill
*/
const PROVIDER_NAME = "ecom-details-image-plugin";
const CANDIDATES = [{
	name: "ecom-details-image",
	description: "生成电商图片（产品主图、详情页、社媒图、直播场景、广告图等）时使用：提供场景模板匹配、Campaign Style Lock、GPT-Image-2 Prompt 铁律、图片序列规划等完整方法论。调用 ecom_generate_image 工具出图前，必须先按本技能写好图片 Prompt。",
	invocation: {
		modelInvocable: true,
		userInvocable: true
	},
	provider: PROVIDER_NAME,
	source: "bundled",
	rank: BUNDLED_SKILL_RANK,
	locator: "ecom-details-image"
}];
const BODY = `# 电商图片 Prompt 写作规范

当用户要求电商视觉素材（商品主图/详情页/社媒/直播/广告/海报等）时，按本规范先规划再写 Prompt，最后调用 ecom_generate_image 出图。

## 1. 场景模板匹配（25 类）
按用户需求匹配场景，Prompt 结构参考对应模板方向：
- 白底主图(hero)：01 → 背景 #FFFFFF、产品居中占 35-40%、留白 ≥45%
- 生活方式(lifestyle)：02 → 场景氛围图产品占 20-25%、留白 ≥50%
- 平铺(flat lay)：03 / 细节特写(macro)：04 / 海报 banner：05
- 社媒(小红书/Instagram/TikTok)：06 / UGC 买家秀：07（须用 anti-AI 技巧）
- 模特展示：08 / 前后对比(before after)：09 / 包装开箱：10
- 信息图(参数/成分/A+ 详情)：11 / 创意概念：12 / 尺码说明：13
- 多品组合：14 / 直播间：15 / 虚拟试穿：16 / 爆炸图：17 / 隐形人台：18
- 多角度网格：19 / 杂志 editorial：20 / 季节 campaign：21
- 轻奢氛围：22 / 设备样机(mockup)：23 / 店铺陈列：24 / 运动 campaign：25

## 2. GPT-Image-2 Prompt 铁律（每条必查）
1. 颜色用 hex 码，不用形容词：白底 #FFFFFF、深灰文字 #2D2D2D、金色强调 #D4AF37、浅米色背景 #F5F1E8、深绿背景 #1A3A2E。
2. 产品占比数字化：白底主图 35-40%、卖点副图 25-30%、场景氛围图 20-25%、广告图 40-45%。
3. 留白显式声明：白底/卖点/广告图「留白至少 45%」，场景图「至少 50%」，详情页长图「50%+」。
4. 否定清单不能省：每条结尾写「不要添加：道具、手、水印、假 logo、额外文字、装饰元素、渐变背景」。
5. 平台预留：国内电商主图「顶部中央 200×100 区域留空（价格叠加区）」；需要时「左上角 200×100 区域留白（logo 区）」。
6. 3 层信息架构：核心承诺 ≤15 字 + 关键证据 2-3 个（图标+短标签）+ 行动指令 ≤8 字。
7. 中文字用「」中文引号包裹；复杂笔画字换简单同义字。

## 3. 通用 Prompt 结构
1. Campaign Style Lock（多图任务必填，每张图一字不差）→ 2. 主体和场景 → 3. 目的与情绪 → 4. 构图/镜头/取景 → 5. 光线/颜色/材质 → 6. 风格与真实感 → 7. 平台比例 → 8. 图片内文字 → 9. 负面约束。
Prompt 保持简洁：只含核心信息，自然语言优于关键词堆砌；指定材质纹理与光线方向（场景图给色温如 5500K）。

## 4. Campaign Style Lock（多图一致性合同）
多图任务先定义并原样复制进每张 Prompt：视觉方向；固定色板(2-3 主色+1 强调色，写清背景/文字/强调色)；冷暖调统一；字体系统(禁混用)；背景系统统一；光线系统统一；布局系统统一；图标系统统一；产品呈现规则稳定；禁止漂移项(改色板/混字体/光线不一致/随机背景)。
无品牌规范时用默认锁：「consistent premium ecommerce visual system across the entire image set; fixed palette of clean off-white background, deep charcoal text, one product-matched accent color, one soft secondary accent; neutral-cool studio lighting; modern geometric sans-serif headline placeholders only; consistent rounded rectangular info labels; consistent thin-line icon style; generous whitespace; no color palette changes, no mixed fonts, no random backgrounds, no inconsistent lighting, no mismatched icon styles.」

## 5. 转化驱动力诊断（商品/营销图先做）
- 视觉驱动型：一眼抓吸引力、质感/细节/工艺、使用场景、简短利益点。
- 痛点驱动型：强制顺序 痛点触发→利益/方案→信任证明→优惠+CTA。
- 情感价值驱动型：情绪钩子、身份/向往、产品作为实现方式、社交证明。
主图序列（5 张）按驱动力规划：视觉/痛点/情感三种各有对应序列。

## 6. 图片序列规划（详情页/PDP/整套商品图）
默认 5 张主图 + 9 张详情页图；每张独立 Prompt，独立出图。
主图 1:1；详情页 2:3（或平台竖版比例）。
详情页序列：首屏承接→痛点放大→机制解释→核心利益→使用步骤→场景覆盖→对比选择→信任背书(无证据写 proof placeholder，不编造认证)→FAQ/风险逆转/CTA。
详情页必须是电商信息图格式（以 "E-commerce infographic [screen]" 开头），含标题、图标、标签、对比、步骤、信任徽章，不是单纯换角度产品照。

## 7. 多角度/景别规则
全套图绝不能同一角度。主图序列 ≥3 种角度（含 1 张特写/微距）；详情页 ≥4 种（含 2 张特写/微距）；不能连续 3 张同角度；全景 ≤40%；仰视/俯视各 ≥1。
角度写法：正面 3/4 "at a slight 3/4 angle"；俯视 "photographed directly from above at a 90-degree overhead angle"；侧面 90°；后侧 45°；低角度 "from a very low angle looking upward"；特写 "tight zoom on [detail]"；微距 "extreme close-up macro shot"。
背景色节奏：连续多张不能全同，交替 #FFFFFF / #F5F1E8(浅米) / 品牌深色。

## 8. Anti-AI 技巧（UGC/直播/社媒）
指定具体手机型号（iPhone 14 Pro 等）；加可见瑕疵(毛孔/噪点/暖色偏移/不完美构图)；用真实感语言 NOT professional photography / NOT AI-generated look；胶片色调 Kodak Portra 400 feel；避免 perfect/flawless/stunning/hyper-realistic。

## 9. 出图调用（ecom_generate_image）
写好后调用工具：prompt=完整 Prompt；size 按平台（主图 1:1、详情页 2:3、社媒 4:5/1:1、banner 16:9）；resolution 默认 2k（4k 仅 16:9/9:16/2:1/1:2/21:9/9:21）；有商品参考图 URL 则传 image_url。出图后提醒用户放大 200% 逐字核对中文笔画。

## 10. 红线
不虚构认证、实验数据、评分、销量、真实评价或品牌授权；证据缺失写 proof placeholder。`;
/** The bundled provider registered on `ctx.skills`. */
const ecomImageSkillProvider = {
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
const name = "ecom-details-image-plugin";
const inject = [
	"tools",
	"systemPrompt",
	"skills"
];
const DEFAULT_BASE_URL = "https://api.apimart.ai/v1";
const DEFAULT_MODEL = "gpt-image-2";
const Config = z.object({
	baseUrl: z.string().default(DEFAULT_BASE_URL).description("OpenAI 兼容图片 API 基地址（apimart.ai / OpenAI / 自建网关）。"),
	model: z.string().default(DEFAULT_MODEL).description("图片生成模型名，如 gpt-image-2、gpt-image-1.5、dall-e-3。"),
	apiKey: z.string().default("").description("图片 API 密钥。留空则从环境变量 IMG_API_KEY / OPENAI_API_KEY 读取；请勿硬编码或回显。"),
	proxyUrl: z.string().default("").description("可选 HTTP 代理地址（如 http://127.0.0.1:1080）。apimart.ai 在受限网络里需经代理访问时配置。"),
	pollIntervalMs: z.number().step(1).min(1e3).default(5e3).description("生图任务轮询间隔（毫秒）。"),
	timeoutMs: z.number().step(1).min(1e4).default(24e4).description("生图任务最大等待时间（毫秒），含提交后首轮等待。")
});
const PROMPT_TEXT = `## Generate e-commerce images (ecom_generate_image)
Use the \`ecom_generate_image\` tool when the user asks to generate product/marketing images: product hero shots, PDP details, social posts, livestream scenes, ads, banners, or any image corresponding to an image prompt.
Before calling it, load the \`ecom-details-image\` skill and follow its rules to write a high-quality image prompt (scenario template matching, Campaign Style Lock for multi-image sets, hex colors, explicit whitespace, negative constraints). Pass the full prompt in \`prompt\`; choose \`size\` by platform (1:1 hero, 2:3 PDP detail, 4:5 social) and keep \`resolution\` 2k by default. If the user provided a publicly reachable product image URL, pass it in \`image_url\` for better product consistency.
The result appears as a gallery card; report it briefly with the size/resolution tags.`;
function apply(ctx, config) {
	const apiKey = config.apiKey && config.apiKey.trim() !== "" ? config.apiKey : process.env.IMG_API_KEY ?? process.env.OPENAI_API_KEY ?? "";
	const proxyUrl = config.proxyUrl && config.proxyUrl.trim() !== "" ? config.proxyUrl : process.env.IMG_PROXY_URL ?? "";
	const resolved = {
		baseUrl: config.baseUrl || DEFAULT_BASE_URL,
		model: config.model || DEFAULT_MODEL,
		apiKey,
		proxyUrl,
		pollIntervalMs: config.pollIntervalMs ?? 5e3,
		timeoutMs: config.timeoutMs ?? 24e4
	};
	ctx.effect(() => ctx.tools.register(ecomImageTool(resolved)), "ecom-details-image-plugin.tool");
	ctx.effect(() => ctx.skills.registerProvider(() => ecomImageSkillProvider), "ecom-details-image-plugin.skill");
	ctx.effect(() => ctx.systemPrompt.section({
		name: "tool:ecom_generate_image",
		order: 116,
		text: PROMPT_TEXT
	}), "ecom-details-image-plugin.prompt");
}

//#endregion
export { Config, apply, inject, name };