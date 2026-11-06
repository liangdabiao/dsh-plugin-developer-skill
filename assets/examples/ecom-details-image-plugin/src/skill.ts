/**
 * Bundled skill provider for ecom-details-image-plugin: one skill that teaches
 * the model how to write high-quality e-commerce image prompts (template
 * matching, Campaign Style Lock, GPT-Image-2 prompt rules, sequence planning).
 * Mirrors the official provider shape: candidates listed by `list()`, full
 * bodies served by `get()` (lazy loaded, keeps context lean).
 * @module ecom-details-image-plugin/skill
 */

import {
  BUNDLED_SKILL_RANK,
  type SkillCandidate,
  type SkillDefinition,
  type SkillProvider,
} from '@deepseek-ai/dsh-skill'

const PROVIDER_NAME = 'ecom-details-image-plugin'
const INVOCATION = { modelInvocable: true, userInvocable: true } as const

const CANDIDATES: SkillCandidate[] = [
  {
    name: 'ecom-details-image',
    description:
      '生成电商图片（产品主图、详情页、社媒图、直播场景、广告图等）时使用：' +
      '提供场景模板匹配、Campaign Style Lock、GPT-Image-2 Prompt 铁律、图片序列规划等完整方法论。' +
      '调用 ecom_generate_image 工具出图前，必须先按本技能写好图片 Prompt。',
    invocation: INVOCATION,
    provider: PROVIDER_NAME,
    source: 'bundled',
    rank: BUNDLED_SKILL_RANK,
    locator: 'ecom-details-image',
  },
]

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
不虚构认证、实验数据、评分、销量、真实评价或品牌授权；证据缺失写 proof placeholder。`

/** The bundled provider registered on `ctx.skills`. */
export const ecomImageSkillProvider: SkillProvider = {
  name: PROVIDER_NAME,
  list: () => Promise.resolve(CANDIDATES),
  async get(candidate): Promise<SkillDefinition> {
    return {
      name: candidate.name,
      description: candidate.description,
      invocation: candidate.invocation,
      provider: PROVIDER_NAME,
      source: 'bundled',
      rank: candidate.rank,
      content: BODY,
    }
  },
}
