import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ['dist/index.js'],
  env: { ...process.env, SEEANY_MCP_MODE: 'demo' },
})

const packageJson = JSON.parse(
  await readFile(new URL('../package.json', import.meta.url), 'utf8'),
)
const client = new Client({
  name: 'seeany-product-visuals-mcp-smoke',
  version: packageJson.version,
})
await client.connect(transport)

const serverVersion = client.getServerVersion()
if (serverVersion?.version !== packageJson.version) {
  throw new Error(
    `MCP server version ${serverVersion?.version || 'unknown'} does not match package version ${packageJson.version}`,
  )
}

const workDir = await mkdtemp(path.join(os.tmpdir(), 'seeany-product-visuals-mcp-smoke-'))
const fixturePath = path.join(workDir, 'fixture.png')
await writeFile(
  fixturePath,
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  ),
)

const listed = await client.listTools()
const toolNames = listed.tools.map((tool) => tool.name)
const expected = [
  'seeany_plan_product_visual',
  'seeany_create_product_visual',
  'seeany_get_capabilities',
  'seeany_get_account',
  'seeany_upload_asset',
  'seeany_quote_generation',
  'seeany_refine_prompt',
  'seeany_generate_product_image',
  'seeany_get_generation',
  'seeany_wait_generation',
  'seeany_download_assets',
]

for (const name of expected) {
  if (!toolNames.includes(name)) throw new Error(`Missing tool: ${name}`)
}

function parseResult(result) {
  const resultText = result.content?.find((item) => item.type === 'text')?.text || ''
  const jsonStart = resultText.indexOf('\n')
  if (jsonStart < 0) throw new Error(`Tool result did not include JSON: ${resultText}`)
  return JSON.parse(resultText.slice(jsonStart + 1))
}

const planned = await client.callTool({
  name: 'seeany_plan_product_visual',
  arguments: {
    request: '生成一张高端剃须刀的 1:1 白底电商主图',
    reference_file_paths: [fixturePath],
    use_case: 'white_background',
    model: 'seeany-fast',
    count: 1,
    output_dir: path.join(workDir, 'planned-output'),
  },
})
const plan = parseResult(planned)
if (!String(plan.id).startsWith('plan_')) throw new Error(`Planning failed: ${JSON.stringify(plan)}`)
if (plan.creates_generation_task !== false || plan.job_id) throw new Error('Planning unexpectedly created a generation job')

const invalidPlan = await client.callTool({
  name: 'seeany_plan_product_visual',
  arguments: { request: '测试不支持的分辨率', model: 'seeany-fast', resolution: '4k' },
})
if (invalidPlan.isError !== true) throw new Error('Planning accepted an unsupported seeany-fast 4k combination')

const executed = await client.callTool({
  name: 'seeany_create_product_visual',
  arguments: { plan_id: plan.id, confirm_cost: false, timeout_seconds: 3 },
})
const execution = parseResult(executed)
if (execution.status !== 'succeeded' || !execution.job_id || execution.downloaded_files?.length !== 1) {
  throw new Error(`High-level execution failed: ${JSON.stringify(execution)}`)
}

const repeated = await client.callTool({
  name: 'seeany_create_product_visual',
  arguments: { plan_id: plan.id, confirm_cost: false, timeout_seconds: 3 },
})
const repeatedExecution = parseResult(repeated)
if (repeatedExecution.job_id !== execution.job_id || repeatedExecution.reused_existing_job !== true) {
  throw new Error('Repeated plan execution did not reuse the existing generation job')
}

const uploaded = await client.callTool({
  name: 'seeany_upload_asset',
  arguments: { file_path: fixturePath },
})
const uploadedText = uploaded.content?.find((item) => item.type === 'text')?.text || ''
if (!uploadedText.includes('"id": "asset_')) throw new Error(`Asset upload failed: ${uploadedText}`)

const quote = await client.callTool({
  name: 'seeany_quote_generation',
  arguments: { model: 'seeany-quality', count: 2, use_case: 'white_background' },
})
const quoteText = quote.content?.find((item) => item.type === 'text')?.text || ''
if (!quoteText.includes('estimated_credits')) throw new Error(`Quote failed: ${quoteText}`)

const created = await client.callTool({
  name: 'seeany_generate_product_image',
  arguments: {
    prompt: '生成一张高端剃须刀的 Amazon 白底主图',
    use_case: 'white_background',
    model: 'seeany-quality',
    count: 2,
    aspect_ratio: '1:1',
    resolution: '2k',
  },
})

const text = created.content?.find((item) => item.type === 'text')?.text || ''
const jobId = text.match(/job_demo_[a-z0-9_]+/i)?.[0]
if (!jobId) throw new Error(`Could not find job id in tool result: ${text}`)

const completed = await client.callTool({
  name: 'seeany_wait_generation',
  arguments: { job_id: jobId, timeout_seconds: 3 },
})

const completedText = completed.content?.find((item) => item.type === 'text')?.text || ''
if (!completedText.includes('succeeded')) throw new Error(`Generation did not succeed: ${completedText}`)

const outputDir = path.join(workDir, 'output')
try {
  const downloaded = await client.callTool({
    name: 'seeany_download_assets',
    arguments: { job_id: jobId, output_dir: outputDir },
  })
  const downloadedText = downloaded.content?.find((item) => item.type === 'text')?.text || ''
  if (!downloadedText.includes('file_path')) throw new Error(`Download failed: ${downloadedText}`)
} finally {
  await rm(workDir, { recursive: true, force: true })
}

await transport.close()

const liveGateTransport = new StdioClientTransport({
  command: process.execPath,
  args: ['dist/index.js'],
  env: { ...process.env, SEEANY_MCP_MODE: 'live', SEEANY_API_KEY: 'smoke-test-key' },
})
const liveGateClient = new Client({
  name: 'seeany-product-visuals-mcp-live-gate-smoke',
  version: packageJson.version,
})
await liveGateClient.connect(liveGateTransport)
const livePlan = parseResult(await liveGateClient.callTool({
  name: 'seeany_plan_product_visual',
  arguments: { request: '验证 Live 模式费用确认门槛', model: 'seeany-fast', count: 1 },
}))
if (typeof livePlan.estimated_price_cny !== 'number' || livePlan.requires_cost_confirmation !== true) {
  throw new Error(`Live planning did not return a confirmation gate: ${JSON.stringify(livePlan)}`)
}
const rejectedLiveExecution = await liveGateClient.callTool({
  name: 'seeany_create_product_visual',
  arguments: { plan_id: livePlan.id, confirm_cost: false, timeout_seconds: 1 },
})
if (rejectedLiveExecution.isError !== true || !parseResult(rejectedLiveExecution).error?.includes('confirm_cost=true')) {
  throw new Error('Live execution was not blocked before explicit cost confirmation')
}
await liveGateTransport.close()
console.log(`Smoke test passed: MCP ${serverVersion.version}, ${toolNames.length} tools, idempotent plan/execute, Live cost gate, validation, and advanced chains succeeded (${execution.job_id}, ${jobId})`)
