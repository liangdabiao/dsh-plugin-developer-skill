# Tool 开发指南（dsh 0.2.x：defineTool 与原生注册两条路）

> 依据：官方 "Build a tool" + "Tool authoring reference" cookbook，并对照三个已上架插件的真实工具写法（guizang 的原生注册、media-desk/geochat 的工程化处理）。

## 目录
- [一句话](#一句话)
- [两条注册路线：defineTool vs 原生对象](#两条注册路线definetool-vs-原生对象)
- [工具的四要素](#工具的四要素)
- [execute(args, exec)：执行上下文](#executableargs-exec执行上下文)
- [output：规范值契约（schema + render）](#output规范值契约schema--render)
- [presentationMeta：给浏览器的持久化投影](#presentationmeta给浏览器的持久化投影)
- [presentCall / presentResult：通用 UI 卡片](#presentcall--presentresult通用-ui-卡片)
- [错误处理](#错误处理)
- [完整示例：原生注册的工具](#完整示例原生注册的工具)
- [defineTool 完整示例](#definetool-完整示例)

## 一句话

**工具 = 给模型看的"可执行函数签名" + 你写的 `execute` 实现。** 模型看到 `description` 和 `parameters`（它们进系统提示组装流程）；调用后收到 `output.render` 产出的文本；浏览器端从持久化的 `block.meta` 读 `presentationMeta` 渲染卡片。工具在 **Host 进程**执行（不走模型 bash 沙箱），所以能写工作区外的数据目录、带密钥调外部 API。

## 两条注册路线：defineTool vs 原生对象

| | `defineTool`（官方推荐） | 原生对象直接注册 |
| --- | --- | --- |
| 导入 | `import { defineTool } from '@deepseek-ai/dsh-tools'`（peer 依赖） | 无任何 SDK 依赖 |
| 参数校验 | **自动**：类型、required、字面量、exact-one unions、嵌套值 | **自己写**（execute 里 check） |
| parameters 形态 | DSL：`{ keyword: { type:'string', required:true, description } }` | JSON Schema：`{ type:'object', additionalProperties:false, required:[...], properties:{...} }` |
| 适用 | 常规工具（省去手写校验） | 零依赖插件 / 需要精确控制校验时机（guizang、geochat 全用这条） |
| 版本风险 | 引入 SDK 依赖，要写 peer 版本下限 | 无 |

```js
// 注册方式相同：ctx.tools.register(...)（本身是 effect 语义，插件卸载自动注销）
ctx.tools.register(defineTool({ ... }))   // defineTool 路线
ctx.tools.register(rawToolObject)         // 原生路线
```

> 无论哪条路：**注册后不得修改 schema 或替换回调**（注册表借用只读定义）；要热替换就释放 effect 再重新注册。DSL 表达不了的非空字符串、正数、跨字段规则，两条路都要手写校验。

## 工具的四要素

| 字段 | 谁看 | 写作要点 |
| --- | --- | --- |
| `name` | 模型 | 蛇形命名 `[a-z][a-z0-9_]*`，加插件前缀防撞名（`guizang_library_add`） |
| `description` | 模型 | **决定模型会不会调用**。"做什么 + 何时用 + 注意什么"三件套；geochat 的三段式：「返回：… 使用：… 边界：…」并写明验证边界（截图不替代 inspect 验证） |
| `parameters` | 模型 | 每个参数都给 `description`（模型只看得到有描述的参数）；显式 `additionalProperties: false` + `required` |
| `output` | 模型 + 浏览器 | `schema`/`render` 定模型看到的；`presentationMeta` 定浏览器渲染的数据 |

外加 `execute(args, exec)` 实现，可选 `timeoutMs`。

## execute(args, exec)：执行上下文

```js
async execute(args, exec) {
  // args      —— 校验后的参数（defineTool 有类型推导；原生路线自行校验）
  // exec.signal —— 取消信号：长工作必须尊重（分页/循环里传下去）
  // exec.agent.id —— 运行时分配的会话 id。要做会话绑定用它，
  //                  绝不要接受模型在参数里自报的 sessionId（geochat 有专门回归测试）
  // exec.token   —— 不可变的分发身份（防重放/校验来源）
}
```

- **执行身份保护**：注册表把参数物化成冻结的无损 JSON 并分配 `exec.token`，分发期间 callId/name/arguments/agent/token 不可变——不要试图在 execute 里改它们。
- **同步返回单一规范 JSON 值**（object/array/scalar/null 都可以做根）；注册表做无损快照、校验、冻结后交给 `output.render`。

## output：规范值契约（schema + render）

```js
output: {
  schema: {                       // 声明 execute 返回值的形状（ValueSchemaSpec）
    type: 'object',
    additionalProperties: false,
    required: ['text', 'count'],
    properties: { text: { type: 'string' }, count: { type: 'number' } },
  },
  render: (_args, value) => [{ type: 'text', text: value.text }],  // → 模型看到的
}
```

铁律（踩坑总结）：
1. **`execute()` 返回值字段必须与 schema 完全一致**——`additionalProperties:false` 下多一个字段就校验拒绝一次（"工具被拒"最常见原因）。
2. **render 出的文本要短**：模型还要把它复述进回复。一句话回执 + "用户在哪里能看到"就够。
3. **基础设施失败抛异常；域内非理想结果作为成功值返回**（非零退出码、空结果都不是异常）。
4. 抛错或返回无效值 → `isError`，模型会看到错误并自行修正——错误消息写清楚"哪里错、怎么改"。

## presentationMeta：给浏览器的持久化投影

```js
output: {
  // ...schema/render 同上
  presentationMeta: (_args, value) => ({ kind: 'my-plugin:query', items: value.items }),
}
```

- 从同一规范值派生的**可重放 JSON**，持久化在 tool/result 的 meta 里——**不占模型上下文**；浏览器端 Toolview 从 `block.meta` 读回渲染，会话回放也一致。
- 纯函数（无 I/O、无时钟）；嵌套 Code 分发（PTC 子调用）会跳过此投影。
- 只有当"UI 卡片需要模型可见内容无法无损保留的结构化事实"时才用——能用 render 文本表达的别投影。
- 浏览器端怎么消费：见 browser-side.md（keyed `tool.call.toolview` + 无 meta 时骨架屏降级）。

## presentCall / presentResult：通用 UI 卡片

不写 Toolview 也有界面：声明 presenter 即可映射到官方通用卡片。

```js
presentCall: (args) => ({ card: 'generic', title: `查询 · ${args.keyword}`, kind: 'search',
                          locations: [{ path: args.file, line: 3 }] }),
presentResult: (_args, result) => result.isError ? undefined
  : { card: 'generic', title: '查询完成', content: result.content },
```

| card | 用途 | 关键字段 |
| --- | --- | --- |
| `generic` | 默认 | title / kind(图标) / rawInput / content / `locations:[{path,line?}]` |
| `terminal` | shell 类 | title / description / cwd |
| `diff` | 文件创建/修改 | `diffs:[{path, oldText, newText}]`（新建 oldText: null） |
| `read` / `search` / `web` | 内置语义卡 | 从 `result.meta` 重建（文件窗口/分组匹配/检索结果），无对应调用视图 |

**纯度规则**：presenter 在实时流和会话回放时都会运行，必须是 args(+result) 的纯函数——无 I/O、无状态读取、无时钟/随机数；UI 专用格式（fenced 块、相对路径）不得混进规范值；畸形日志参数让包装器返回 undefined 走通用回退，而不是抛错。

> **注意**：内置 Web Client 不消费 presentCall/presentResult——它跟随原始 tool/call、tool/result 事件。想要专属富卡片，在 Client 半边的 `tool.call.toolview` keyed 槽注册组件（browser-side.md）。

## 错误处理

```js
async execute(args) {
  // ① 参数/调用错误 → throw：模型知道这次调用无效，下一轮自纠
  if (!args.path?.trim()) throw new Error('my_read: path 是必填参数（绝对路径）')
  // ② 业务失败 → 结构化返回：模型读得懂并调整策略
  const res = await fetch(url)
  if (res.status === 404) return { text: `未找到「${args.keyword}」…这不是错误，可如实告知用户`, found: false }
  if (!res.ok) return { text: `服务返回 ${res.status}，建议稍后重试`, ok: false }
  // ③ 空状态不是错误：返回明确文案，防止模型把空态当故障汇报
}
```

## 完整示例：原生注册的工具

（骨架 `assets/plugin-skeleton/src/host.js` 的 `memoAddTool` 就是这套，可运行。）

```js
const memoAddTool = {
  name: 'my_plugin_memo_add',
  description: '把一条备忘写进用户的工作台。当用户说「记一下…」「帮我记住…」时使用；用户可在侧栏页面看到。',
  parameters: {
    type: 'object', additionalProperties: false, required: ['text'],
    properties: { text: { type: 'string', description: '备忘内容，最长 2000 字' } },
  },
  timeoutMs: 10_000,
  output: {
    schema: {
      type: 'object', additionalProperties: false, required: ['text', 'id'],
      properties: { text: { type: 'string' }, id: { type: 'string' } },
    },
    render: (_args, value) => [{ type: 'text', text: value.text }],
    presentationMeta: (_args, value) => ({ kind: 'my-plugin:memo', id: value.id }),
  },
  async execute(args) {
    check(args, this.parameters)                       // 手写校验（缺参/未知参/enum）
    const memo = addMemo(args.text.trim(), config)     // 写 $DSH_HOME（原子写）
    return { text: `已记下：${memo.text.slice(0, 50)}，用户可在侧栏「工作台」看到。`, id: memo.id }
  },
}
```

## defineTool 完整示例

```js
import { defineTool } from '@deepseek-ai/dsh-tools'   // peerDependencies 声明版本下限

ctx.tools.register(defineTool({
  name: 'my_read',
  description: 'Read a file from disk.',
  parameters: {
    path: { type: 'string', required: true, description: 'Absolute path' },
    limit: { type: 'number' },                        // 可选参数
  },
  output: {
    schema: { type: 'string' },                       // 标量也可以做根
    render: (_args, value) => [{ type: 'text', text: value }],
  },
  async execute(args, exec) {
    return readFile(args.path, { encoding: 'utf8', signal: exec.signal })  // args 已类型化+校验
  },
}))
```

> 调外部 API 的进阶（异步作业+轮询、代理、可注入 fetch）→ http-client.md；长任务后台化 → host-integration.md；浏览器端 Toolview → browser-side.md。
