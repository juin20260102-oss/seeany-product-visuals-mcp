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
  console.log(`Smoke test passed: MCP ${serverVersion.version}, ${toolNames.length} tools, upload/quote/job/download chain succeeded (${jobId})`)
} finally {
  await rm(workDir, { recursive: true, force: true })
}

await transport.close()
