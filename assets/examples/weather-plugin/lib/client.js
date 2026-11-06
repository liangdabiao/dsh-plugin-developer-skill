window.__ModuleLoader__.load({ id: "@demo/weather-plugin", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
let react_jsx_runtime = require("react/jsx-runtime");

//#region src/fragment.ts
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
//#region src/client/index.tsx
const name = "weather-plugin";
const inject = ["slots"];
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
function Scene({ type, isDay }) {
	const dark = !isDay;
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: "scene",
		children: [
			type === "sunny" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "wea-sun",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: "rays" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: "core" })]
			}),
			(type === "partly" || type === "cloudy") && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				type === "partly" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "wea-sun",
					style: {
						width: 44,
						height: 44,
						left: 18,
						top: 20
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: "rays" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "core",
						style: { inset: 11 }
					})]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "wea-cloud",
					style: {
						width: 72,
						height: 26,
						left: type === "cloudy" ? 22 : 66,
						top: type === "cloudy" ? 40 : 58
					}
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "wea-cloud",
					style: {
						width: 56,
						height: 20,
						left: 96,
						top: 86,
						animationDelay: "1.2s",
						opacity: .8
					}
				})
			] }),
			type === "rain" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "wea-cloud",
				style: {
					width: 80,
					height: 28,
					left: 30,
					top: 22
				}
			}), [
				22,
				48,
				74,
				100,
				126
			].map((x, i) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "wea-rainline",
				style: {
					left: x,
					animationDelay: `${i * .18}s`
				}
			}, i))] }),
			type === "snow" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "wea-cloud",
				style: {
					width: 80,
					height: 28,
					left: 30,
					top: 18,
					background: "#dfe8f5"
				}
			}), [
				26,
				58,
				90,
				122
			].map((x, i) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "wea-snowflake",
				style: {
					left: x,
					animationDelay: `${i * .7}s`,
					fontSize: 14 + i % 3 * 3
				},
				children: "❄"
			}, i))] }),
			type === "storm" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "wea-cloud",
					style: {
						width: 96,
						height: 32,
						left: 20,
						top: 18,
						background: "#aeb9cc"
					}
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "wea-bolt",
					style: {
						left: 44,
						top: 66
					},
					children: "⚡"
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "wea-bolt",
					style: {
						left: 96,
						top: 88,
						animationDelay: "1.1s"
					},
					children: "⚡"
				})
			] }),
			type === "fog" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(react_jsx_runtime.Fragment, { children: [
				0,
				1,
				2
			].map((i) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "wea-fogband",
				style: {
					width: 220 - i * 40,
					top: 36 + i * 26,
					opacity: .9 - i * .22,
					animationDelay: `${i * 1.6}s`,
					animationDuration: `${7 + i * 2}s`
				}
			}, i)) }),
			dark && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
				className: "wea-sun",
				style: {
					width: 40,
					height: 40,
					left: 22,
					top: 16
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: "rays" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "core",
					style: {
						inset: 10,
						background: "#E8ECF5"
					}
				})]
			})
		]
	});
}
const EMOJI = {
	sunny: "☀️",
	partly: "⛅",
	cloudy: "☁️",
	fog: "🌫️",
	rain: "🌧️",
	snow: "🌨️",
	storm: "⛈️"
};
/** 天气信息 → 动效卡片 */
function WeatherCard({ info, unit }) {
	const t = unit === "f" ? `${Math.round(info.temp * 9 / 5 + 32)}°F` : `${info.temp}°C`;
	const emoji = EMOJI[info.type] ?? "🌤️";
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: `wea${info.isDay ? "" : " wea-night"}`,
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			className: "scene",
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "big",
				children: emoji
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Scene, {
				type: info.type,
				isDay: info.isDay
			})]
		}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			className: "row",
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "city",
					children: ["📍 ", info.city]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "temp",
					children: t
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "desc",
					children: [
						"体感 ",
						t,
						" · ",
						info.windDir,
						"风 ",
						info.windSpeed,
						"km/h"
					]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "tags",
					children: [
						info.minTemp != null && info.maxTemp != null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: "tag",
							children: [
								info.minTemp,
								"~",
								info.maxTemp,
								"°C"
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "tag",
							children: info.isDay ? "白天" : "夜间"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: "tag",
							children: ["更新于 ", info.time?.slice(11, 16) ?? "-"]
						})
					]
				})
			]
		})]
	});
}
/** 结果文本首行，用于降级单行展示 */
function firstResultLine(content) {
	for (const block of content) if (block.type === "text" && typeof block.text === "string" && block.text.length > 0) {
		const newline = block.text.indexOf("\n");
		return newline === -1 ? block.text : block.text.slice(0, newline);
	}
	return "天气查询失败";
}
/**
* Keyed toolview for the `weather` tool. Running and failed calls stay single
* lines; only a well-formed persisted meta mounts the animated card.
*/
function WeatherCardView({ callId, block }) {
	if (!("kind" in block)) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
		style: {
			fontSize: 12,
			opacity: .65
		},
		children: "⏳ 正在查询天气…"
	});
	if (block.isError) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
		style: {
			fontSize: 12,
			opacity: .65
		},
		children: firstResultLine(block.content)
	});
	const meta = weatherMetaFrom(block.meta);
	if (meta === void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
		style: {
			fontSize: 12,
			opacity: .65
		},
		children: firstResultLine(block.content)
	});
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("style", { children: CSS }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(WeatherCard, {
		info: meta.info,
		unit: meta.unit
	})] }, callId);
}
function apply(ctx) {
	ctx.slots.inject("tool.call.toolview", () => ctx.slots.register({
		name: "tool.call.toolview",
		key: "weather"
	}, WeatherCardView));
}

//#endregion
exports.apply = apply;
exports.inject = inject;
exports.name = name;
return module.exports; } });