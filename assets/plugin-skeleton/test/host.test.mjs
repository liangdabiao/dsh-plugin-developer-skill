// Host 半边单测：Node 原生 test runner，零测试依赖，不需要装 dsh。
// 关键：把 DSH_HOME 指到临时目录必须在 import 模块代码之前（ESM 顶层 await 等它）。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

process.env.DSH_HOME = mkdtempSync(join(tmpdir(), 'your-plugin-test-'))

const {
  name, memoAddTool, memoListTool, memoSkillProvider, Config, requestRejection, safeFile,
} = await import('../src/host.js')

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

test('插件名与 cordis.patch.yml 的 id 一致', () => {
  const yml = readFileSync(join(ROOT, 'cordis.patch.yml'), 'utf8')
  assert.ok(yml.includes(`id: ${name}`), `cordis.patch.yml 应声明 id: ${name}`)
  assert.ok(yml.includes('dsh-your-plugin'), 'cordis.patch.yml 应声明 npm 包名')
})

test('工具定义合规：命名 / additionalProperties / required 与 properties 对齐', () => {
  for (const tool of [memoAddTool, memoListTool]) {
    assert.match(tool.name, /^[a-z][a-z0-9_]*$/, '工具名要 snake_case 且以字母开头')
    assert.equal(typeof tool.execute, 'function')
    assert.equal(typeof tool.output.render, 'function')
    const params = tool.parameters
    assert.equal(params.additionalProperties, false, '参数 schema 必须显式 additionalProperties: false')
    for (const key of params.required || []) {
      assert.ok(params.properties?.[key], `required 里的 ${key} 必须出现在 properties`)
    }
    for (const prop of Object.values(params.properties || {})) walkSchema(prop)
  }
})

function walkSchema(node) {
  if (node && typeof node === 'object' && node.type === 'object') {
    assert.ok(typeof node.additionalProperties === 'boolean', '嵌套 object 也要显式 additionalProperties')
    for (const key of node.required || []) {
      assert.ok(node.properties?.[key], `required 里的 ${key} 必须出现在 properties`)
    }
  }
}

test('memo_add：校验拒绝缺参/未知参/空文本，正常写入', async () => {
  await assert.rejects(() => memoAddTool.execute({}), /缺少必填参数 text/)
  await assert.rejects(() => memoAddTool.execute({ text: 'a', extra: 1 }), /未知参数 extra/)
  await assert.rejects(() => memoAddTool.execute({ text: '   ' }), /text 不能为空/)
  const value = await memoAddTool.execute({ text: '买牛奶' })
  assert.equal(typeof value.id, 'string')
  assert.ok(value.text.includes('买牛奶'), '回执要包含内容摘要')
})

test('memo_add 与 memo_list 写读同一份数据（一份逻辑两个入口）', async () => {
  await memoAddTool.execute({ text: '来自工具' })
  const list = await memoListTool.execute({})
  assert.ok(list.text.includes('来自工具'), 'list 工具要能读到 add 工具写的数据')
})

test('memo_list：空态返回明确文案而不是报错', async () => {
  process.env.DSH_HOME = mkdtempSync(join(tmpdir(), 'your-plugin-empty-')) // 换个新目录 → 空
  const value = await memoListTool.execute({})
  assert.equal(value.count, 0)
  assert.match(value.text, /不是错误/, '空态文案要写明"不是错误"')
})

test('技能 provider：候选齐全、正文带插件环境附注', async () => {
  const candidates = await memoSkillProvider.list()
  assert.ok(candidates.length >= 1)
  for (const c of candidates) {
    assert.match(c.name, /^[a-z0-9]+(-[a-z0-9]+)*$/)
    assert.ok(c.description.length > 20, 'description 决定模型何时加载，要写清触发场景')
    assert.equal(c.invocation.modelInvocable, true)
    assert.equal(c.invocation.userInvocable, true)
  }
  const skill = await memoSkillProvider.get(candidates[0])
  assert.ok(skill.content.includes('your_plugin_memo_add'), '附注要提工具')
  assert.ok(!skill.content.includes('.mjs'), '附注不能让模型跑脚本（沙箱写不了数据目录）')
})

test('Config：schema 校验并填充默认值', () => {
  const result = Config['~standard'].validate({}) // Standard Schema 接口（Cordis Loader 同款）
  assert.ok(!result.issues, '不应有校验问题')
  assert.equal(result.value.maxMemos, 50)
  assert.equal(typeof result.value.greeting, 'string')
})

test('requestRejection：拿不到鉴权服务时拒绝（fail closed）', () => {
  const noService = { get: () => undefined }
  assert.equal(requestRejection(noService, { headers: {} }), 403)
  const okService = { get: () => ({ requestRejection: () => false }) }
  assert.equal(requestRejection(okService, { headers: {} }), false) // false = 放行
})

test('safeFile：放行普通文件，拒绝穿越/点文件/目录', () => {
  const dir = mkdtempSync(join(tmpdir(), 'your-plugin-safe-'))
  writeFileSync(join(dir, 'index.html'), '<p>hi</p>')
  writeFileSync(join(dir, '.secret'), 'x')
  assert.ok(safeFile(dir, 'index.html'), '普通文件放行')
  assert.equal(safeFile(dir, '../escape.html'), null, '拒绝 .. 穿越')
  assert.equal(safeFile(dir, '.secret'), null, '拒绝点文件')
  assert.equal(safeFile(dir, 'nope.html'), null, '拒绝不存在的文件')
  assert.equal(safeFile(dir, ''), null, '拒绝空路径（目录本身）')
})
