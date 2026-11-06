import z from "@deepseek-ai/schemastery";
import ToolRegistry from "@deepseek-ai/dsh-tools";
import SkillService from "@deepseek-ai/dsh-skill";
import { Context } from "@deepseek-ai/cordis";
import SystemPrompt from "@deepseek-ai/dsh-system-prompt";

//#region src/client.d.ts
/**
 * Open-Meteo weather client over global fetch. Pure functions with an
 * injectable fetch for tests: geocode a city, then fetch its current weather.
 * No API key needed; point baseUrl at a self-hosted mirror to develop offline.
 * @module weather-plugin/client
 */
interface WeatherClientConfig {
  baseUrl: string;
  geocodingUrl: string;
  timeoutMs: number;
}
//#endregion
//#region src/index.d.ts

type Context$1 = Context & {
  tools: ToolRegistry;
  systemPrompt: SystemPrompt;
  skills: SkillService;
};
declare const name = "weather-plugin";
declare const inject: string[];
interface Config extends WeatherClientConfig {}
declare const Config: z<Config>;
declare function apply(ctx: Context$1, config: Config): void;
//#endregion
export { Config, apply, inject, name };