# Skill（技能）开发指南（dsh 0.2.x：SkillProvider 与快照聚合）

> 依据：guizang 插件（5 个 skill 的 provider + 快照 + rewrite/addendum 完整实现 `lib/skills.js`）与 media-desk（把用户规则导出成宿主用户级 skill）的实战模式。

## 目录
- [技能是什么](#技能是什么)
- [SkillProvider：list + get 两级加载](#skillproviderlist--get-两级加载)
- [候选（Candidate）字段全解](#候选candidate字段全解)
- [description 是唯一的分发渠道](#description-是唯一的分发渠道)
- [创作契约：让模型"按规范写"](#创作契约让模型按规范写)
- [目录形态：多技能聚合（SKILL.md 目录扫描）](#目录形态多技能聚合skillmd-目录扫描)
- [rewrite + addendum：不改快照文件改注入内容](#rewrite--addendum不改快照文件改注入内容)
- [rank 让位机制](#rank-让位机制)
- [反向输出：插件把用户规则写成宿主 skill](#反向输出插件把用户规则写成宿主-skill)

## 技能是什么

**技能 = 给 AI 的"写作规范手册"。** 工具给 AI"手"，技能给 AI"说明书"。触发方式有两条：模型自主加载（`modelInvocable`）和用户 `/命令`（`userInvocable`）——一个候选可以两者都开。

## SkillProvider：list + get 两级加载

```js
ctx.skills.registerProvider(() => myProvider)   // 本身是 effect 语义，卸载自动注销

const myProvider = {
  name: 'my-plugin',
  list: () => candidates,        // 常驻：轻量候选清单（name+description+元信息）
  async get(candidate) {         // 按需：模型决定使用时才加载完整正文
    return { name, description, invocation, source: 'bundled', provider, content: BODY }
  },
}
```

| 层 | 内容 | 何时加载 |
| --- | --- | --- |
| `list()` | name + description + 元信息 | 常驻上下文（模型据此判断何时触发） |
| `get()` | 完整 `content` 正文 | 仅当模型决定使用 / 用户 `/命令` |

**上下文是稀缺资源**：候选 description 写精炼，正文写完整。单个技能也可以不经 provider 直接注册：`ctx.skills.register({ name, description, source:'bundled', content, invocation })`（geochat 的 55 个技能就是逐个 register）。

## 候选（Candidate）字段全解

```js
{
  name: 'my-writing-style',                          // kebab-case，正则 /^[a-z0-9]+(-[a-z0-9]+)*$/
  description: '写「产品文案」时使用：统一风格、结构、话术。',  // 触发条件！
  path: 'my-writing-style',
  invocation: { modelInvocable: true, userInvocable: true },
  source: 'bundled',                                 // 随插件内置
  provider: 'my-plugin',
  rank: 600,                                         // 让位机制，见下文
  locator: 'my-writing-style',                       // get() 靠它找回（目录路径/文件名/id）
  resourceBase: { kind: 'directory', path: skillDir },  // 附属资源（脚本/模板/示例）位置
}
```

`get(candidate)` 返回时**剥掉 rank/locator**（它们是 provider 内部字段，不进模型上下文），补上 `content`。

## description 是唯一的分发渠道

模型在成百上千候选里靠 description 挑技能。写法：**"做什么 + 什么场景用"**，把用户的可能说法写进去：

> ✅ `整理或播报「工作台备忘」内容时使用：统一播报结构（条数 → 逐条 → 追问）。`
> ✅ `用户提到"学习我的语气""用我的口吻写"时使用…`
> ❌ `这是一个关于写作的技能。`

## 创作契约：让模型"按规范写"

正文（content）就是创作契约：

1. **结构契约**：固定结构（先报什么 → 再报什么 → 以什么结尾）。
2. **必含要素**：缺一不可的内容清单。
3. **格式契约**：字数、语言、markdown 与否。
4. **示例驱动**：1~2 个好例子比抽象描述有效。
5. **边界**：写明"不做什么"（只依据工具返回的真实数据，不编造）。
6. **绑定工具**：正文第一句就说明数据从哪个工具来、禁止绕过（"用 `guizang_voice` 工具读写，不要用 bash 直接改：数据目录在工作区外，沙箱里写不进去"）。

## 目录形态：多技能聚合（SKILL.md 目录扫描）

一个插件带多个技能时，别把正文硬编码进 JS——用"目录 + frontmatter 扫描"：

```
skills/            ← 外部快照（可选）
own-skills/        ← 插件自研技能
  └─ my-voice/
      └─ SKILL.md  ← frontmatter(name + description) + 正文
```

```js
function readSkills(dirs) {           // 扫描每个子目录的 SKILL.md
  // 解析 frontmatter：--- 分隔块里 name/description 两行（正则即可，不必上 YAML 库）
  // 校验：name 合法、description > 20 字、无重名
}
// createSkillProvider(dirs)：list() 返回候选；get() 按 locator 找回目录 → 读文件 → rewrite + addendum → content
```

**快照聚合**（把别的 AI 产品的独立 skill 仓库装进插件）：`tools/vendor-skills.mjs` 模式——浅克隆上游仓库 → 只复制 `git ls-files` 跟踪的文件（SKIP 掉 README/tests/CI）→ 读 frontmatter 校验 name → 写 `manifest.json`（记录 repo + 40 位 commit，页面可展示）。**快照文件永不手改**；正文里用 `<SKILL_ROOT>`/`<PLUGIN_ROOT>` 占位符，`get()` 时 `replaceAll` 成真实安装路径，让快照内容对路径无感知。

## rewrite + addendum：不改快照文件改注入内容

把 git 时代的独立 skill 装进插件后，原正文的"检查更新（git pull）"步骤必败（快照没有 .git），"npm install" 也多半多余。**不改正文文件，改注入给模型的内容**：

```js
const REWRITES = {                                  // 按技能名做正则替换
  'guizang-ppt-skill': [[/git -C "[^"]+" fetch[\s\S]*?git -C "[^"]+" reset[\s\S]*?\n/, '']],
}
function rewrite(skill) { /* 应用 REWRITES[skill.name] */ }

function addendum(skill) {                          // 按技能名追加插件环境说明
  return `\n\n## 插件环境说明\n\n- 依赖已随插件装好，跳过 npm install。\n` +
    `- 交付后调用 \`guizang_library_add\` 登记作品。\n` +
    `- 数据读写用 \`guizang_voice\` 工具，不要用 bash 直改 ~/.dsh/guizang-design/。\n`
}
```

**用测试钉住**（guizang 的做法，直接抄）：断言 rewrite 后正文无 git 命令（`/git -C|git fetch|git pull|rev-list/`）、addendum 存在且含工具名、**addendum 不含 `.mjs`**（防止模型去跑脚本——沙箱写不了数据目录，必败）。

> 另一个现成实现：`assets/examples/dsh-seedance-studio/lib/skills.js`（120 行）——快照扫描 + frontmatter 解析 + `<SKILL_ROOT>` 替换 + **信息量很大的 addendum**（插件环境说明、项目目录约定、标准执行顺序、画布与积分纪律），它的 addendum 写法值得抄。

## rank 让位机制

```js
rank: 600   // 插件自带的技能
```

用户在 `~/.dsh/skills` 或项目 `.dsh/skills` 自装的**同名** skill 排在插件前面，插件让位。guizang 的实测值是 600；如果官方导出了 `BUNDLED_SKILL_RANK` 常量（旧版 `@deepseek-ai/dsh-skill`），优先用常量。**含义：插件技能是"默认提供"，用户显式安装的优先。**

## 反向输出：插件把用户规则写成宿主 skill

media-desk 的「复盘 → 写作规则 → 导出 Skill」演示了反方向：插件把用户确认过的规则落盘为**用户级技能**，让宿主按原生 skill 机制分发：

```js
// $DSH_HOME/skills/<name>/SKILL.md —— frontmatter + 正文
writeFileSync(join(home, 'skills', 'my-rules', 'SKILL.md'),
  `---\nname: my-rules\ndescription: 用户确认过的写作规则清单…\n---\n\n${rulesText}`)
// 注意：示例数据绝不导出；写之前让用户过目确认
```

> 完整可运行范例：`assets/plugin-skeleton/src/host.js` 的 `memoSkillProvider`（含 addendum 和测试断言）。
