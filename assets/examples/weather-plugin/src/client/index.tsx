/**
 * weather-plugin, browser half: registers the animated weather card under the
 * `weather` key of the atomic toolview hole. Data comes from the persisted
 * `tool/result` meta projected by the node half, so replay reproduces the same
 * card. Clients without this half degrade to the tool's text result.
 * Runs in the sandboxed iframe: no external CDN, pure CSS animations.
 * @module weather-plugin/client
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-tool/client'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import type { CSSProperties } from 'react'
import { weatherMetaFrom, type WeatherInfo, type WeatherType } from '../fragment'

export const name = 'weather-plugin'

export const inject = ['slots']

const CSS = `
.wea{font-family:'PingFang SC','Microsoft YaHei',sans-serif;border-radius:16px;overflow:hidden;
  color:#fff;box-shadow:0 8px 24px rgba(0,0,0,.15);position:relative;min-height:210px;
  background:linear-gradient(180deg,var(--sky-top,#5b9df0),var(--sky-bottom,#a8d4f7));}
.wea.wea-night{background:linear-gradient(180deg,#1c2b4a,#3a5a8c);}
.wea .scene{position:relative;height:132px;overflow:hidden;}
.wea .big{font-size:52px;line-height:1;position:absolute;right:22px;top:14px;filter:drop-shadow(0 4px 8px rgba(0,0,0,.2));z-index:2;}
.wea .row{padding:12px 18px 16px;background:rgba(0,0,0,.10);}
.wea .city{font-size:15px;font-weight:600;opacity:.92;}
.wea .temp{font-size:38px;font-weight:700;line-height:1.1;margin:2px 0;}
.wea .desc{font-size:13px;opacity:.92;}
.wea .tags{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;}
.wea .tag{font-size:12px;background:rgba(255,255,255,.22);border-radius:20px;padding:2px 10px;}

@keyframes wea-spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}
.wea-sun{position:absolute;left:26px;top:18px;width:64px;height:64px;}
.wea-sun .core{position:absolute;inset:16px;border-radius:50%;background:#FFD34E;}
.wea-sun .rays{position:absolute;inset:0;border-radius:50%;border:3px dashed rgba(255,211,78,.7);
  animation:wea-spin 12s linear infinite;}

@keyframes wea-drift{0%,100%{transform:translateX(0)}50%{transform:translateX(34px)}}
.wea-cloud{position:absolute;background:#fff;border-radius:24px;opacity:.95;
  animation:wea-drift 5s ease-in-out infinite;}
.wea-cloud:before{content:"";position:absolute;top:-14px;left:14px;width:34px;height:34px;border-radius:50%;background:inherit;}
.wea-cloud:after{content:"";position:absolute;top:-8px;left:34px;width:24px;height:24px;border-radius:50%;background:inherit;}

@keyframes wea-rain{0%{transform:translateY(-12px);opacity:0}25%{opacity:1}
  100%{transform:translateY(112px);opacity:0}}
.wea-rainline{position:absolute;top:0;width:2px;height:16px;background:rgba(255,255,255,.85);
  border-radius:2px;animation:wea-rain 0.9s linear infinite;}

@keyframes wea-snow{0%{transform:translate(0,-10px) rotate(0)}50%{transform:translate(18px,60px) rotate(180deg)}
  100%{transform:translate(-6px,118px) rotate(360deg)}}
.wea-snowflake{position:absolute;top:-8px;color:#fff;font-size:14px;text-shadow:0 0 4px rgba(255,255,255,.6);
  animation:wea-snow 3.2s linear infinite;}

@keyframes wea-flash{0%,92%,100%{opacity:0}94%,97%{opacity:1}}
.wea-bolt{position:absolute;color:#FFE066;font-size:30px;opacity:0;
  animation:wea-flash 2.4s linear infinite;}

@keyframes wea-fog{0%{transform:translateX(-30%)}100%{transform:translateX(110%)}}
.wea-fogband{position:absolute;height:16px;border-radius:12px;background:rgba(255,255,255,.55);
  animation:wea-fog 7s linear infinite;}

@keyframes wea-breathe{0%,100%{opacity:.4;transform:scale(.96)}50%{opacity:1;transform:scale(1.02)}}
.wea-load{display:flex;flex-direction:column;align-items:center;justify-content:center;height:210px;gap:10px;
  background:linear-gradient(180deg,#5b9df0,#a8d4f7);color:#fff;font-size:14px;}
.wea-load .dot{width:34px;height:34px;border:4px solid rgba(255,255,255,.35);border-top-color:#fff;
  border-radius:50%;animation:wea-spin .9s linear infinite;}
.wea-load .tx{animation:wea-breathe 1.6s ease-in-out infinite;}
`;

/** 每种天气类型渲染的动画场景 */
function Scene({ type, isDay }: { type: WeatherType; isDay: boolean }) {
  const dark = !isDay;
  return (
    <div className="scene">
      {type === "sunny" && (
        <div className="wea-sun"><div className="rays" /><div className="core" /></div>
      )}
      {(type === "partly" || type === "cloudy") && (
        <>
          {type === "partly" && (
            <div className="wea-sun" style={{ width: 44, height: 44, left: 18, top: 20 }}>
              <div className="rays" /><div className="core" style={{ inset: 11 }} />
            </div>
          )}
          <div className="wea-cloud" style={{
            width: 72, height: 26,
            left: type === "cloudy" ? 22 : 66,
            top: type === "cloudy" ? 40 : 58,
          } as CSSProperties} />
          <div className="wea-cloud" style={{ width: 56, height: 20, left: 96, top: 86, animationDelay: "1.2s", opacity: 0.8 } as CSSProperties} />
        </>
      )}
      {type === "rain" && (
        <>
          <div className="wea-cloud" style={{ width: 80, height: 28, left: 30, top: 22 } as CSSProperties} />
          {[22, 48, 74, 100, 126].map((x, i) => (
            <div key={i} className="wea-rainline" style={{ left: x, animationDelay: `${i * 0.18}s` } as CSSProperties} />
          ))}
        </>
      )}
      {type === "snow" && (
        <>
          <div className="wea-cloud" style={{ width: 80, height: 28, left: 30, top: 18, background: "#dfe8f5" } as CSSProperties} />
          {[26, 58, 90, 122].map((x, i) => (
            <div key={i} className="wea-snowflake" style={{ left: x, animationDelay: `${i * 0.7}s`, fontSize: 14 + (i % 3) * 3 } as CSSProperties}>❄</div>
          ))}
        </>
      )}
      {type === "storm" && (
        <>
          <div className="wea-cloud" style={{ width: 96, height: 32, left: 20, top: 18, background: "#aeb9cc" } as CSSProperties} />
          <div className="wea-bolt" style={{ left: 44, top: 66 } as CSSProperties}>⚡</div>
          <div className="wea-bolt" style={{ left: 96, top: 88, animationDelay: "1.1s" } as CSSProperties}>⚡</div>
        </>
      )}
      {type === "fog" && (
        <>
          {[0, 1, 2].map((i) => (
            <div key={i} className="wea-fogband" style={{
              width: 220 - i * 40, top: 36 + i * 26, opacity: 0.9 - i * 0.22,
              animationDelay: `${i * 1.6}s`, animationDuration: `${7 + i * 2}s`,
            } as CSSProperties} />
          ))}
        </>
      )}
      {dark && (
        <span className="wea-sun" style={{ width: 40, height: 40, left: 22, top: 16 } as CSSProperties}>
          <div className="rays" /><div className="core" style={{ inset: 10, background: "#E8ECF5" }} />
        </span>
      )}
    </div>
  );
}

const EMOJI: Record<WeatherType, string> = {
  sunny: "☀️", partly: "⛅", cloudy: "☁️", fog: "🌫️", rain: "🌧️", snow: "🌨️", storm: "⛈️",
};

/** 天气信息 → 动效卡片 */
function WeatherCard({ info, unit }: { info: WeatherInfo; unit: "c" | "f" }) {
  const t = unit === "f" ? `${Math.round((info.temp * 9) / 5 + 32)}°F` : `${info.temp}°C`;
  const emoji = EMOJI[info.type] ?? "🌤️";
  return (
    <div className={`wea${info.isDay ? "" : " wea-night"}`}>
      <div className="scene">
        <div className="big">{emoji}</div>
        <Scene type={info.type} isDay={info.isDay} />
      </div>
      <div className="row">
        <div className="city">📍 {info.city}</div>
        <div className="temp">{t}</div>
        <div className="desc">体感 {t} · {info.windDir}风 {info.windSpeed}km/h</div>
        <div className="tags">
          {info.minTemp != null && info.maxTemp != null && (
            <span className="tag">{info.minTemp}~{info.maxTemp}°C</span>
          )}
          <span className="tag">{info.isDay ? "白天" : "夜间"}</span>
          <span className="tag">更新于 {info.time?.slice(11, 16) ?? "-"}</span>
        </div>
      </div>
    </div>
  );
}

/** 结果文本首行，用于降级单行展示 */
function firstResultLine(content: readonly { type: string; text?: string }[]): string {
  for (const block of content) {
    if (block.type === "text" && typeof block.text === "string" && block.text.length > 0) {
      const newline = block.text.indexOf("\n");
      return newline === -1 ? block.text : block.text.slice(0, newline);
    }
  }
  return "天气查询失败";
}

/**
 * Keyed toolview for the `weather` tool. Running and failed calls stay single
 * lines; only a well-formed persisted meta mounts the animated card.
 */
function WeatherCardView({ callId, block }: ToolCallViewProps) {
  if (!("kind" in block)) {
    return <div style={{ fontSize: 12, opacity: 0.65 }}>⏳ 正在查询天气…</div>;
  }
  if (block.isError) {
    return <div style={{ fontSize: 12, opacity: 0.65 }}>{firstResultLine(block.content)}</div>;
  }
  const meta = weatherMetaFrom(block.meta);
  if (meta === undefined) {
    return <div style={{ fontSize: 12, opacity: 0.65 }}>{firstResultLine(block.content)}</div>;
  }
  return (
    <div key={callId}>
      <style>{CSS}</style>
      <WeatherCard info={meta.info} unit={meta.unit} />
    </div>
  );
}

export function apply(ctx: ClientContext): void {
  ctx.slots.inject("tool.call.toolview", () => ctx.slots.register(
    { name: "tool.call.toolview", key: "weather" },
    WeatherCardView,
  ));
}
