window.__ModuleLoader__.load({ id: "@demo/ecom-details-image-plugin", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
let react_jsx_runtime = require("react/jsx-runtime");

//#region src/fragment.ts
/** 默认尺寸与分辨率 */
const DEFAULT_SIZE = "1:1";
const DEFAULT_RESOLUTION = "2k";
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
//#region src/client/index.tsx
const name = "ecom-details-image-plugin";
const inject = ["slots"];
const CSS = `
.ecom{font-family:'PingFang SC','Microsoft YaHei',sans-serif;border-radius:16px;overflow:hidden;
  background:#fff;box-shadow:0 8px 24px rgba(0,0,0,.12);border:1px solid #eee;}
.ecom .stage{position:relative;background:#f5f5f7;min-height:180px;display:flex;align-items:center;justify-content:center;}
.ecom .img{max-width:100%;max-height:480px;display:block;object-fit:contain;}
.ecom .row{padding:12px 16px;}
.ecom .title{font-size:14px;font-weight:600;color:#1a1a1a;display:flex;align-items:center;gap:8px;}
.ecom .tags{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;}
.ecom .tag{font-size:12px;background:#eef1f6;color:#444;border-radius:20px;padding:2px 10px;}
.ecom .tag.primary{background:#2563eb;color:#fff;}
.ecom .link{font-size:13px;color:#2563eb;margin-top:8px;word-break:break-all;display:block;}
.ecom .load{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:180px;gap:12px;
  color:#666;font-size:14px;}
@keyframes ecom-shimmer{0%{background-position:-400px 0}100%{background-position:400px 0}}
.ecom .skeleton{width:70%;height:16px;border-radius:8px;
  background:linear-gradient(90deg,#eee 25%,#f5f5f7 50%,#eee 75%);background-size:800px 100%;
  animation:ecom-shimmer 1.4s infinite;}
.ecom .skeleton.short{width:40%;}
`;
/** 结果文本首行，用于降级单行展示 */
function firstResultLine(content) {
	for (const block of content) if (block.type === "text" && typeof block.text === "string" && block.text.length > 0) {
		const newline = block.text.indexOf("\n");
		return newline === -1 ? block.text : block.text.slice(0, newline);
	}
	return "图片生成失败";
}
/** 图片画廊卡片 */
function EcomGallery({ meta }) {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: "ecom",
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
			className: "stage",
			children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
				className: "img",
				src: meta.imageUrl,
				alt: "生成的电商图片",
				loading: "lazy"
			})
		}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			className: "row",
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "title",
					children: "🖼️ 电商图片已生成"
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "tags",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "tag primary",
							children: meta.size
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "tag",
							children: meta.resolution
						}),
						meta.taskId && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: "tag",
							children: [
								"task ",
								meta.taskId.slice(0, 12),
								"…"
							]
						})
					]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
					className: "link",
					href: meta.imageUrl,
					target: "_blank",
					rel: "noreferrer",
					children: meta.imageUrl
				})
			]
		})]
	});
}
/** 生成中占位（骨架屏） */
function LoadingCard() {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
		className: "ecom",
		children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			className: "load",
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: "skeleton" }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: "skeleton short" }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: { fontSize: 13 },
					children: "⏳ 正在生成图片…（通常 30~90 秒）"
				})
			]
		})
	});
}
/**
* Keyed toolview for the `ecom_generate_image` tool. Running and failed calls
* stay single lines; only a well-formed persisted meta mounts the gallery.
*/
function EcomGalleryView({ callId, block }) {
	if (!("kind" in block)) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(LoadingCard, {}, callId);
	if (block.isError) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
		style: {
			fontSize: 12,
			opacity: .65
		},
		children: firstResultLine(block.content)
	});
	const meta = ecomMetaFrom(block.meta);
	if (meta === void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
		style: {
			fontSize: 12,
			opacity: .65
		},
		children: firstResultLine(block.content)
	});
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("style", { children: CSS }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(EcomGallery, { meta })] }, callId);
}
function apply(ctx) {
	ctx.slots.inject("tool.call.toolview", () => ctx.slots.register({
		name: "tool.call.toolview",
		key: "ecom_generate_image"
	}, EcomGalleryView));
}

//#endregion
exports.apply = apply;
exports.inject = inject;
exports.name = name;
return module.exports; } });