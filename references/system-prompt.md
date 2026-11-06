# 系统提示注入指南（dsh 0.2.x）

> 真实签名：`ctx.systemPrompt.section({ name, order, text })` —— 参数是一个**对象**。服务名 `systemPrompt`；不硬依赖时可 `ctx.inject(['systemPrompt'], …)`（dsh-context 的 prefix/suffix 就是延迟注入）。

## 目录
- [为什么插件要注入系统提示](#为什么插件要注入系统提示)
- [API：ctx.systemPrompt.section](#apictxsystempromptsection)
- [order：锚点定位法](#order锚点定位法)
- [方法论：怎么写好工具/技能说明](#方法论怎么写好工具技能说明)
- [系统提示 vs 技能：什么时候用哪个](#系统提示-vs-技能什么时候用哪个)

## 为什么插件要注入系统提示

dsh 允许插件往模型的系统提示里追加自己的段落。用途：
- **教模型"什么时候该用你的工具/技能"**（工具 description 很长，但系统提示里一句话就能引导行为）；
- 声明插件的使用约定（如"拿到数据后按某技能规范播报"）；
- 部署级角色设定（用户可配置的 prefix/suffix，dsh-context 模式）。

## API：ctx.systemPrompt.section

```ts
ctx.effect(() => ctx.systemPrompt.section({
  name: 'tool:weather',      // 段落唯一标识
  order: 117,                // 顺序（小的靠前）
  text: `## Query weather (weather)
Use the \`weather\` tool when the user asks about the weather...`,
}), 'weather-plugin.prompt')
```

- `name`：段落唯一 id（建议 `<插件名>:` 前缀防撞）。
- `text`：段落正文，**模型能看到并遵循**；也接受 `(context) => string` 函数按上下文生成。
- `interpolate: false`：段落含用户自由文本（如用户配置的 prefix/suffix）时务必加上，避免被模板插值意外处理；空文本返回 `''` 即整段省略。

## order：锚点定位法

通用规则在前、具体约定在后。除了手写数字（约定类常用 100+），还可以**锚定宿主内置段落**做"置顶/置底"（dsh-context 实战）：

```ts
const systemPrompt = ctx.get('systemPrompt')
// 用户可配置的前缀：紧跟宿主身份段之前（置顶）
systemPrompt.section({
  name: 'my-plugin:prefix',
  order: systemPrompt.getSectionOrder('HARNESS_IDENTITY') - 1000,
  text: config.promptPrefix, interpolate: false,
})
// 部署级人设后缀：挂在 persona suffix 之后（置底）
systemPrompt.section({
  name: 'my-plugin:suffix',
  order: systemPrompt.getSectionOrder('DEPLOYMENT_PERSONA_SUFFIX') + 1000,
  text: config.promptSuffix, interpolate: false,
})
```

固定数字也可以：`{ name: 'a-general', order: 1 }`（通用）、`{ name: 'z-specific', order: 117 }`（约定，weather-plugin 实测值）。

## 方法论：怎么写好工具/技能说明

**模型只通过文字理解工具。** 写好说明（description）直接决定模型会不会正确调用：

1. **一句话说清"做什么"**：`查询某城市实时天气。`
2. **写清"何时用"**：`当用户询问天气、温度、雨雪、风力时使用。`
3. **写清"何时不用/注意"**：`仅当用户要求华氏度时才传 unit 参数。`
4. **给出调用样例（可选，极有效）**：`例：用户问"北京天气" → 调用 { city: "北京" }`
5. **参数逐个给 description**：模型只能看到带描述的参数。
6. **数据边界**：`只依据工具返回的实时数据，不编造预报。`

> 实战检验：weather-plugin 的系统提示 + 工具 description 按"做什么 + 何时用 + 注意"三件套写，浏览器实测模型准确调用。

## 系统提示 vs 技能：什么时候用哪个

| 维度 | 系统提示 | 技能 |
| --- | --- | --- |
| 加载 | 常驻（始终在上下文） | 按需触发加载 |
| 体量 | 宜短（占用每一轮上下文） | 可长（触发时才读） |
| 用途 | 引导"何时用工具/遵守约定" | 提供"怎么写/怎么组织"的完整规范 |
| 典型 | `遇到 X 就调用工具 Y` | `写产品文案时按这 5 条规范` |

**原则**：全局的、简短的、每轮都需要的 → 系统提示；局部的、详细的、只在特定任务用到的 → 技能。别把长规范塞进系统提示。
