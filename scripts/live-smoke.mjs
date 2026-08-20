import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

if (!process.env.SEEANY_API_KEY) throw new Error('SEEANY_API_KEY is required for live-smoke')

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ['dist/index.js'],
  env: { ...process.env, SEEANY_MCP_MODE: 'live' },
})

const client = new Client({ name: 'seeany-product-visuals-mcp-live-smoke', version: '0.2.0' })
await client.connect(transport)

function textOf(result) {
  return result.content?.find((item) => item.type === 'text')?.text || ''
}

const uploaded = await client.callTool({
  name: 'seeany_upload_asset',
  arguments: { file_path: '../public/images/products/shaver_product.png' },
})
const uploadedText = textOf(uploaded)
const assetId = uploadedText.match(/"id":\s*"(asset_[a-z0-9]+)"/i)?.[1]
if (!assetId) throw new Error(`Live upload failed: ${uploadedText}`)

const created = await client.callTool({
  name: 'seeany_generate_product_image',
  arguments: {
    prompt: 'Create one clean ecommerce hero image of the product. Preserve the product shape and details, use a pure white studio background, centered composition, soft natural shadow, commercial product photography.',
    reference_asset_ids: [assetId],
    model: 'seeany-fast',
    aspect_ratio: '1:1',
    resolution: '1k',
    count: 1,
  },
})
const createdText = textOf(created)
const jobId = createdText.match(/"job_id":\s*"([^"]+)"/)?.[1]
if (!jobId) throw new Error(`Live generation submission failed: ${createdText}`)

const completed = await client.callTool({
  name: 'seeany_wait_generation',
  arguments: { job_id: jobId, timeout_seconds: 120 },
})
const completedText = textOf(completed)
if (!completedText.includes('"status": "succeeded"') && !completedText.includes('"status":"succeeded"')) {
  throw new Error(`Live generation did not succeed: ${completedText}`)
}

const outputDir = await mkdtemp(path.join(os.tmpdir(), 'seeany-product-visuals-mcp-live-'))
try {
  const downloaded = await client.callTool({
    name: 'seeany_download_assets',
    arguments: { job_id: jobId, output_dir: outputDir },
  })
  const downloadedText = textOf(downloaded)
  if (!downloadedText.includes('file_path')) throw new Error(`Live download failed: ${downloadedText}`)
  console.log(JSON.stringify({ ok: true, job_id: jobId, output_dir: outputDir, result: downloadedText }, null, 2))
} finally {
  await rm(outputDir, { recursive: true, force: true })
}

await transport.close()
