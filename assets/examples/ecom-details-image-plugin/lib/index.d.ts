import z from "@deepseek-ai/schemastery";
import ToolRegistry from "@deepseek-ai/dsh-tools";
import SkillService from "@deepseek-ai/dsh-skill";
import { Context } from "@deepseek-ai/cordis";
import SystemPrompt from "@deepseek-ai/dsh-system-prompt";

//#region src/client.d.ts

/**
 * apimart.ai / OpenAI 兼容图片 API 客户端（异步作业 + 轮询）。
 * - 提交：POST {baseUrl}/images/generations → 返回 task_id
 * - 轮询：GET  {baseUrl}/tasks/{task_id}     → completed 后取 result.images[0].url[0]
 * - 代理：可选 proxyUrl，通过 undici ProxyAgent 走 HTTP CONNECT 隧道
 *   （apimart.ai 在某些受限网络里需经本地代理才能访问）。
 * fetch 可注入，便于测试。
 * @module ecom-details-image-plugin/client
 */
interface EcomImageClientConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
  proxyUrl?: string;
  pollIntervalMs: number;
  timeoutMs: number;
}
//#endregion
//#region src/index.d.ts

type Context$1 = Context & {
  tools: ToolRegistry;
  systemPrompt: SystemPrompt;
  skills: SkillService;
};
declare const name = "ecom-details-image-plugin";
declare const inject: string[];
interface Config extends EcomImageClientConfig {}
declare const Config: z<Config>;
declare function apply(ctx: Context$1, config: Config): void;
//#endregion
export { Config, apply, inject, name };