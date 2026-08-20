import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { mkdtemp, readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

if (!process.env.SEEANY_API_KEY) throw new Error('SEEANY_API_KEY is required for live-smoke')

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ['dist/index.js'],
  env: { ...process.env, SEEANY_MCP_MODE: 'live' },
})

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const client = new Client({ name: 'seeany-product-visuals-mcp-live-smoke', version: packageJson.version })
await client.connect(transport)

function parseResult(result) {
  const text = result.content?.find((item) => item.type === 'text')?.text || ''
  const jsonStart = text.indexOf('\n')
  if (jsonStart < 0) throw new Error(`Tool result did not include JSON: ${text}`)
  return JSON.parse(text.slice(jsonStart + 1))
}

const outputDir = await mkdtemp(path.join(os.tmpdir(), 'seeany-product-visuals-mcp-live-'))
try {
  const planned = await client.callTool({
    name: 'seeany_plan_product_visual',
    arguments: {
      request: 'Create one clean ecommerce hero image of the product. Preserve the product shape and details, use a pure white studio background, centered composition, soft natural shadow, commercial product photography.',
      reference_file_paths: ['../public/images/products/shaver_product.png'],
      use_case: 'white_background',
      model: 'seeany-fast',
      aspect_ratio: '1:1',
      resolution: '1k',
      count: 1,
      output_dir: outputDir,
    },
  })
  const plan = parseResult(planned)
  if (!plan.id || typeof plan.estimated_price_cny !== 'number' || plan.job_id) {
    throw new Error(`Live planning failed or created a task too early: ${JSON.stringify(plan)}`)
  }

  const executed = await client.callTool({
    name: 'seeany_create_product_visual',
    arguments: { plan_id: plan.id, confirm_cost: true, timeout_seconds: 120 },
  }, undefined, { timeout: 180_000 })
  const execution = parseResult(executed)
  if (execution.status !== 'succeeded' || !execution.job_id || !execution.downloaded_files?.length) {
    throw new Error(`Live high-level execution failed: ${JSON.stringify(execution)}`)
  }

  console.log(JSON.stringify({
    ok: true,
    plan_id: plan.id,
    job_id: execution.job_id,
    estimated_price_cny: plan.estimated_price_cny,
    output_dir: outputDir,
    files: execution.downloaded_files,
  }, null, 2))
} catch (error) {
  console.error(`Live smoke output directory preserved for recovery: ${outputDir}`)
  throw error
}

await transport.close()
