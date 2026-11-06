/**
 * ecom-details-image-plugin, browser half: registers the image gallery card
 * under the `ecom_generate_image` key of the atomic toolview hole. Data comes
 * from the persisted `tool/result` meta projected by the node half, so replay
 * reproduces the same card. Clients without this half degrade to the tool's
 * text result. Runs in the sandboxed iframe: no external CDN, image from the
 * API URL, pure CSS for the loading shimmer.
 * @module ecom-details-image-plugin/client
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-tool/client'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import { ecomMetaFrom, type EcomImageMeta } from '../fragment'

export const name = 'ecom-details-image-plugin'

export const inject = ['slots']

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
function firstResultLine(content: readonly { type: string; text?: string }[]): string {
  for (const block of content) {
    if (block.type === "text" && typeof block.text === "string" && block.text.length > 0) {
      const newline = block.text.indexOf("\n");
      return newline === -1 ? block.text : block.text.slice(0, newline);
    }
  }
  return "图片生成失败";
}

/** 图片画廊卡片 */
function EcomGallery({ meta }: { meta: EcomImageMeta }) {
  return (
    <div className="ecom">
      <div className="stage">
        <img className="img" src={meta.imageUrl} alt="生成的电商图片" loading="lazy" />
      </div>
      <div className="row">
        <div className="title">🖼️ 电商图片已生成</div>
        <div className="tags">
          <span className="tag primary">{meta.size}</span>
          <span className="tag">{meta.resolution}</span>
          {meta.taskId && <span className="tag">task {meta.taskId.slice(0, 12)}…</span>}
        </div>
        <a className="link" href={meta.imageUrl} target="_blank" rel="noreferrer">
          {meta.imageUrl}
        </a>
      </div>
    </div>
  );
}

/** 生成中占位（骨架屏） */
function LoadingCard() {
  return (
    <div className="ecom">
      <div className="load">
        <div className="skeleton" />
        <div className="skeleton short" />
        <div style={{ fontSize: 13 }}>⏳ 正在生成图片…（通常 30~90 秒）</div>
      </div>
    </div>
  );
}

/**
 * Keyed toolview for the `ecom_generate_image` tool. Running and failed calls
 * stay single lines; only a well-formed persisted meta mounts the gallery.
 */
function EcomGalleryView({ callId, block }: ToolCallViewProps) {
  if (!("kind" in block)) {
    return <LoadingCard key={callId} />;
  }
  if (block.isError) {
    return <div style={{ fontSize: 12, opacity: 0.65 }}>{firstResultLine(block.content)}</div>;
  }
  const meta = ecomMetaFrom(block.meta);
  if (meta === undefined) {
    return <div style={{ fontSize: 12, opacity: 0.65 }}>{firstResultLine(block.content)}</div>;
  }
  return (
    <div key={callId}>
      <style>{CSS}</style>
      <EcomGallery meta={meta} />
    </div>
  );
}

export function apply(ctx: ClientContext): void {
  ctx.slots.inject("tool.call.toolview", () => ctx.slots.register(
    { name: "tool.call.toolview", key: "ecom_generate_image" },
    EcomGalleryView,
  ));
}
