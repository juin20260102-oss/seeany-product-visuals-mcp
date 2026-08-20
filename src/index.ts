#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'

type JobStatus = 'queued' | 'running' | 'succeeded' | 'partial_failed' | 'failed'
type RunMode = 'demo' | 'live'

interface OutputAsset {
  asset_id: string
  file_name: string
  mime_type: string
  width: number
  height: number
  download_url: string
}

interface GenerationJob {
  id: string
  task_uuid?: string
  mode: RunMode
  status: JobStatus
  prompt: string
  model: string
  count: number
  created_at: string
  updated_at: string
  estimated_credits?: number
  estimated_price_cny?: number
  outputs: OutputAsset[]
  error?: string
}

interface UploadedAsset {
  id: string
  file_name: string
  mime_type: string
  size_bytes: number
  sha256: string
  source_path: string
  remote_url?: string
}

type PlanStatus = 'planned' | 'running' | 'succeeded' | 'partial_failed' | 'failed'

interface ProductVisualPlan {
  id: string
  mode: RunMode
  status: PlanStatus
  request: string
  production_prompt: string
  reference_file_paths: string[]
  reference_asset_ids: string[]
  model: string
  use_case: 'white_background' | 'scene' | 'detail'
  aspect_ratio: string
  resolution: string
  count: number
  output_dir: string
  created_at: string
  estimated_credits?: number
  estimated_price_cny?: number
  job_id?: string
  downloaded_files?: Array<{ asset_id: string; file_path: string }>
  error?: string
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../../')
const packageMetadata = JSON.parse(
  await fs.readFile(path.resolve(__dirname, '../package.json'), 'utf8'),
) as { version?: string }
const serverVersion = packageMetadata.version || '0.0.0'
const demoBaseUrl = (process.env.SEEANY_DEMO_BASE_URL || 'https://seeany-nuxt.pages.dev').replace(/\/$/, '')
const apiBaseUrl = (process.env.SEEANY_API_BASE_URL || 'https://api.seeany.com').replace(/\/$/, '')
const apiKey = process.env.SEEANY_API_KEY?.trim()
const configuredMode = process.env.SEEANY_MCP_MODE?.trim().toLowerCase()
const runMode: RunMode = configuredMode === 'demo' || !apiKey ? 'demo' : 'live'
const apiUserAgent = process.env.SEEANY_USER_AGENT || 'seeany-product-visuals-mcp'
const demoFallbackPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

const jobs = new Map<string, GenerationJob>()
const assets = new Map<string, UploadedAsset>()
const productVisualPlans = new Map<string, ProductVisualPlan>()

const supportedRatios = ['auto', '1:1', '3:4', '4:5', '9:16', '2:3', '16:9', '4:3', '5:4', '3:2', '21:9'] as const
const supportedUseCases = ['white_background', 'scene', 'detail'] as const

const fixtureImages = [
  'shaver_product.png',
  'shaver_bathroom_scene.png',
  'shaver_handle_detail.png',
  'leather_bag.png',
  'apparel_product.png',
] as const

const modelCatalog = [
  {
    id: 'seeany-quality',
    name: 'SeeAny Quality',
    api_mode: 'nano-banana-pro',
    capabilities: ['white_background', 'scene', 'detail', 'ecommerce_suite'],
    resolutions: ['1k', '2k', '4k'],
    demo_price_per_image: 15,
  },
  {
    id: 'seeany-fast',
    name: 'SeeAny Fast',
    api_mode: 'nano-banana',
    capabilities: ['white_background', 'scene', 'detail'],
    resolutions: ['1k', '2k'],
    demo_price_per_image: 8,
  },
] as const

const toolDefinitions = [
  {
    name: 'seeany_plan_product_visual',
    description: 'Plan a complete product-visual job and estimate its cost without creating a paid generation task. Returns a plan_id for explicit execution.',
    inputSchema: {
      type: 'object',
      properties: {
        request: { type: 'string', minLength: 1, maxLength: 2000, description: 'The desired ecommerce product visual in natural language.' },
        reference_file_paths: { type: 'array', items: { type: 'string' }, maxItems: 6, description: 'Optional local product reference images. They are validated now and uploaded only during execution.' },
        model: { type: 'string', enum: ['seeany-quality', 'seeany-fast'], default: 'seeany-quality' },
        use_case: { type: 'string', enum: ['white_background', 'scene', 'detail'], default: 'scene' },
        aspect_ratio: { type: 'string', enum: supportedRatios, default: '1:1' },
        resolution: { type: 'string', enum: ['1k', '2k', '4k'], default: '1k' },
        count: { type: 'integer', minimum: 1, maximum: 4, default: 1 },
        output_dir: { type: 'string', default: './seeany-output', description: 'Local directory used after successful generation.' },
      },
      required: ['request'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: 'seeany_create_product_visual',
    description: 'Execute a previously quoted product-visual plan, wait for its stored job, and download outputs. In live mode confirm_cost must be true. Reusing a plan_id resumes its recorded job instead of submitting another one.',
    inputSchema: {
      type: 'object',
      properties: {
        plan_id: { type: 'string' },
        confirm_cost: { type: 'boolean', description: 'Explicit confirmation of the quoted live-mode cost.' },
        timeout_seconds: { type: 'integer', minimum: 1, maximum: 120, default: 120 },
        output_dir: { type: 'string', description: 'Optional override for the plan output directory.' },
      },
      required: ['plan_id', 'confirm_cost'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
  {
    name: 'seeany_get_capabilities',
    description: 'List SeeAny image generation models, ratios, resolutions, and current execution mode.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: 'seeany_get_account',
    description: 'Show whether this MCP is using the local demo or the authenticated SeeAny API.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: 'seeany_upload_asset',
    description: 'Upload a local product image to SeeAny and return an asset id and URL for later generation.',
    inputSchema: {
      type: 'object',
      properties: { file_path: { type: 'string', description: 'Absolute or workspace-relative local image path.' } },
      required: ['file_path'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
  {
    name: 'seeany_quote_generation',
    description: 'Estimate generation cost before creating a task. This is an estimate and does not reserve credits.',
    inputSchema: {
      type: 'object',
      properties: {
        model: { type: 'string', enum: ['seeany-quality', 'seeany-fast'] },
        count: { type: 'integer', minimum: 1, maximum: 4 },
        use_case: { type: 'string', enum: ['white_background', 'scene', 'detail', 'ecommerce_suite'] },
        resolution: { type: 'string', enum: ['1k', '2k', '4k'], default: '1k' },
      },
      required: ['model', 'count', 'use_case'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: 'seeany_refine_prompt',
    description: 'Use SeeAny AI prompt refinement to turn a rough product-image request into a production-ready prompt.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', minLength: 1, maxLength: 4000 },
        action: { type: 'string', enum: ['more_premium', 'more_ecommerce', 'more_creative', 'shorter', 'regenerate'] },
        extra_context: { type: 'string', maxLength: 2000 },
        reference_asset_ids: { type: 'array', items: { type: 'string' }, maxItems: 6 },
      },
      required: ['prompt'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
  {
    name: 'seeany_generate_product_image',
    description: 'Create an asynchronous SeeAny product-image task, then use seeany_wait_generation to receive results.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Product image description, up to 2000 characters.' },
        reference_asset_ids: { type: 'array', items: { type: 'string' }, maxItems: 10 },
        model: { type: 'string', enum: ['seeany-quality', 'seeany-fast'], default: 'seeany-quality' },
        use_case: { type: 'string', enum: ['white_background', 'scene', 'detail'], default: 'scene' },
        aspect_ratio: { type: 'string', enum: ['auto', '1:1', '3:4', '4:5', '9:16', '2:3', '16:9', '4:3', '5:4', '3:2', '21:9'], default: '1:1' },
        resolution: { type: 'string', enum: ['1k', '2k', '4k'], default: '1k' },
        count: { type: 'integer', minimum: 1, maximum: 4, default: 1 },
      },
      required: ['prompt'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
  {
    name: 'seeany_get_generation',
    description: 'Get the latest status, progress, and output URLs for a SeeAny generation task.',
    inputSchema: {
      type: 'object',
      properties: { job_id: { type: 'string' } },
      required: ['job_id'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  },
  {
    name: 'seeany_wait_generation',
    description: 'Poll a SeeAny generation task until it reaches a terminal state or the timeout expires.',
    inputSchema: {
      type: 'object',
      properties: { job_id: { type: 'string' }, timeout_seconds: { type: 'integer', minimum: 1, maximum: 120, default: 30 } },
      required: ['job_id'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  },
  {
    name: 'seeany_download_assets',
    description: 'Download completed SeeAny output images into a local directory and return their file paths.',
    inputSchema: {
      type: 'object',
      properties: { job_id: { type: 'string' }, output_dir: { type: 'string' } },
      required: ['job_id', 'output_dir'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorld: false },
  },
]

function jsonResult(value: unknown, summary: string, isError = false) {
  return {
    content: [{ type: 'text', text: `${summary}\n${JSON.stringify(value, null, 2)}` }],
    isError,
  }
}

function errorResult(message: string) {
  return jsonResult({ error: message }, `SeeAny MCP error: ${message}`, true)
}

function now() {
  return new Date().toISOString()
}

function parseArgs(request: any): Record<string, any> {
  return (request.params?.arguments || {}) as Record<string, any>
}

function getModel(modelId: string) {
  return modelCatalog.find((model) => model.id === modelId)
}

function ratioDimensions(ratio: string): [number, number] {
  const dimensions: Record<string, [number, number]> = {
    '1:1': [1024, 1024], '4:3': [1200, 900], '3:4': [900, 1200],
    '16:9': [1280, 720], '9:16': [720, 1280], '4:5': [819, 1024],
  }
  return dimensions[ratio] || dimensions['1:1']
}

function sourcePathForFixture(fileName: string) {
  return path.join(repoRoot, 'public', 'images', 'products', fileName)
}

function outputUrlForFixture(fileName: string) {
  return `${demoBaseUrl}/images/products/${fileName}`
}

function apiHeaders(extra?: HeadersInit) {
  const headers = new Headers(extra)
  if (apiKey) headers.set('Authorization', `Bearer ${apiKey}`)
  headers.set('User-Agent', apiUserAgent)
  return headers
}

async function apiRequest(endpoint: string, init: RequestInit = {}) {
  if (!apiKey) throw new Error('SEEANY_API_KEY is required for live API mode')
  const response = await fetch(`${apiBaseUrl}${endpoint}`, { ...init, headers: apiHeaders(init.headers) })
  const text = await response.text()
  let body: any
  try { body = text ? JSON.parse(text) : {} } catch { body = { raw: text } }
  if (!response.ok) throw new Error(`SeeAny API HTTP ${response.status}: ${body?.msg || text || response.statusText}`)
  if (typeof body?.code === 'number' && body.code !== 0 && body.code !== 200) {
    throw new Error(`SeeAny API ${body.code}: ${body.msg || 'request failed'}`)
  }
  return body
}

function apiModelFor(modelId: string) {
  const model = getModel(modelId)
  if (!model) throw new Error(`Unsupported model: ${modelId}`)
  return model.api_mode
}

function apiResolution(resolution: string) {
  return String(resolution || '1k').toUpperCase()
}

function estimatePrice(modelId: string, resolution: string, count: number) {
  if (modelId === 'seeany-fast') return Number((0.1 * count).toFixed(2))
  const unit = resolution === '4k' ? 0.4 : resolution === '2k' ? 0.3 : 0.2
  return Number((unit * count).toFixed(2))
}

function normalizeApiStatus(status: string): JobStatus {
  if (status === 'partial_failed') return 'partial_failed'
  if (status === 'succeeded' || status === 'failed' || status === 'running') return status
  return 'queued'
}

function extensionForUrl(url: string) {
  const ext = path.extname(new URL(url).pathname).toLowerCase()
  return ['.jpg', '.jpeg', '.webp', '.png'].includes(ext) ? ext : '.png'
}

function outputsFromApi(data: any): OutputAsset[] {
  const outputs: OutputAsset[] = []
  for (const asset of Array.isArray(data?.assets) ? data.assets : []) {
    for (const image of Array.isArray(asset?.images) ? asset.images : []) {
      if (!image?.url) continue
      const index = outputs.length + 1
      outputs.push({
        asset_id: asset.work_uuid || `asset_${index}`,
        file_name: `${String(index).padStart(2, '0')}-seeany${extensionForUrl(image.url)}`,
        mime_type: `image/${extensionForUrl(image.url).slice(1)}`,
        width: Number(image.width || 0),
        height: Number(image.height || 0),
        download_url: image.url,
      })
    }
  }
  return outputs
}

async function refreshLiveJob(job: GenerationJob) {
  if (job.mode !== 'live') return job
  const taskUuid = job.task_uuid || job.id
  const response = await apiRequest(`/api/developer/task/status?task_uuid=${encodeURIComponent(taskUuid)}`)
  const data = response.data || {}
  job.status = normalizeApiStatus(String(data.status || job.status))
  job.updated_at = now()
  job.outputs = outputsFromApi(data)
  if (data.error_message) job.error = String(data.error_message)
  jobs.set(job.id, job)
  return job
}

function makeDemoJob(args: Record<string, any>): GenerationJob {
  const modelId = String(args.model || 'seeany-quality')
  const model = getModel(modelId)
  if (!model) throw new Error(`Unsupported model: ${modelId}`)
  const prompt = String(args.prompt || '').trim()
  if (!prompt) throw new Error('prompt is required')
  if (prompt.length > 2000) throw new Error('prompt must be 2000 characters or fewer')
  const count = Math.min(Math.max(Number(args.count || 1), 1), 4)
  const ratio = String(args.aspect_ratio || '1:1')
  const [width, height] = ratioDimensions(ratio)
  const id = `job_demo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const createdAt = now()
  const outputs: OutputAsset[] = Array.from({ length: count }, (_, index) => {
    const fixture = fixtureImages[index % fixtureImages.length]
    return { asset_id: `asset_demo_${id}_${index + 1}`, file_name: `${String(index + 1).padStart(2, '0')}-${fixture}`, mime_type: 'image/png', width, height, download_url: outputUrlForFixture(fixture) }
  })
  const job: GenerationJob = { id, mode: 'demo', status: 'queued', prompt, model: modelId, count, created_at: createdAt, updated_at: createdAt, estimated_credits: model.demo_price_per_image * count, outputs }
  jobs.set(id, job)
  setTimeout(() => { const current = jobs.get(id); if (current) { current.status = 'running'; current.updated_at = now() } }, 250)
  setTimeout(() => { const current = jobs.get(id); if (current) { current.status = 'succeeded'; current.updated_at = now() } }, 900)
  return job
}

async function makeLiveJob(args: Record<string, any>): Promise<GenerationJob> {
  const modelId = String(args.model || 'seeany-quality')
  const prompt = String(args.prompt || '').trim()
  if (!prompt) throw new Error('prompt is required')
  if (prompt.length > 2000) throw new Error('prompt must be 2000 characters or fewer')
  const count = Math.min(Math.max(Number(args.count || 1), 1), 4)
  const referenceIds = Array.isArray(args.reference_asset_ids) ? args.reference_asset_ids.map(String) : []
  const inputImgs = referenceIds.map((id: string) => {
    const asset = assets.get(id)
    if (!asset?.remote_url) throw new Error(`Asset ${id} is not uploaded to SeeAny yet`)
    return asset.remote_url
  })
  const resolution = String(args.resolution || '1k').toLowerCase()
  const payload: Record<string, unknown> = {
    aiTypeId: 113,
    aiType: 'smartImg',
    prompt,
    inputImgs,
    imgNum: count,
    imgRatio: String(args.aspect_ratio || '1:1'),
    mode: apiModelFor(modelId),
  }
  if (apiModelFor(modelId) !== 'nano-banana') payload.size = apiResolution(resolution)
  const response = await apiRequest('/api/ai/smarttask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
  const taskUuid = String(response?.data?.task_uuid || '')
  if (!taskUuid) throw new Error('SeeAny API did not return data.task_uuid')
  const createdAt = now()
  const job: GenerationJob = { id: taskUuid, task_uuid: taskUuid, mode: 'live', status: 'queued', prompt, model: modelId, count, created_at: createdAt, updated_at: createdAt, estimated_price_cny: estimatePrice(modelId, resolution, count), outputs: [] }
  jobs.set(job.id, job)
  return job
}

async function uploadAsset(filePath: string) {
  const resolved = path.resolve(process.cwd(), filePath)
  const stat = await fs.stat(resolved)
  if (!stat.isFile()) throw new Error('file_path must point to a file')
  if (stat.size > 40 * 1024 * 1024) throw new Error('upload limit is 40 MB')
  const data = await fs.readFile(resolved)
  const sha256 = createHash('sha256').update(data).digest('hex')
  const ext = path.extname(resolved).toLowerCase()
  const mime = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.webp' ? 'image/webp' : 'application/octet-stream'
  const id = `asset_${sha256.slice(0, 16)}`
  const asset: UploadedAsset = { id, file_name: path.basename(resolved), mime_type: mime, size_bytes: stat.size, sha256, source_path: resolved }
  if (runMode === 'live') {
    const form = new FormData()
    form.append('file', new Blob([data], { type: mime }), path.basename(resolved))
    const response = await apiRequest('/api/upload/image', { method: 'POST', body: form })
    asset.remote_url = String(response?.data?.url || '')
    if (!asset.remote_url) throw new Error('SeeAny API upload did not return data.url')
  }
  assets.set(id, asset)
  return asset
}

async function downloadJob(job: GenerationJob, outputDir: string) {
  if (job.mode === 'live') await refreshLiveJob(job)
  if (job.status !== 'succeeded' && job.status !== 'partial_failed') throw new Error(`job is not complete: ${job.status}`)
  if (!job.outputs.length) throw new Error('job has no downloadable outputs')
  const resolvedDir = path.resolve(process.cwd(), outputDir)
  await fs.mkdir(resolvedDir, { recursive: true })
  const downloaded: Array<{ asset_id: string; file_path: string }> = []
  for (const output of job.outputs) {
    const target = path.join(resolvedDir, output.file_name)
    if (job.mode === 'demo') {
      const fixtureName = output.download_url.split('/').pop() || ''
      try { await fs.copyFile(sourcePathForFixture(fixtureName), target) } catch { await fs.writeFile(target, demoFallbackPng) }
    } else {
      const response = await fetch(output.download_url)
      if (!response.ok) throw new Error(`failed to download ${output.download_url}: HTTP ${response.status}`)
      await fs.writeFile(target, Buffer.from(await response.arrayBuffer()))
    }
    downloaded.push({ asset_id: output.asset_id, file_path: target })
  }
  return { job_id: job.id, output_dir: resolvedDir, files: downloaded, demo_mode: job.mode === 'demo' }
}

async function refinePrompt(args: Record<string, any>) {
  const prompt = String(args.prompt || '').trim()
  if (!prompt) throw new Error('prompt is required')
  const referenceIds = Array.isArray(args.reference_asset_ids) ? args.reference_asset_ids.map(String) : []
  const images = referenceIds.map((id: string) => assets.get(id)?.remote_url).filter(Boolean)
  if (runMode === 'live') {
    const response = await apiRequest('/api/prompt-tools/ai-refine', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, images, action: args.action, extra_context: args.extra_context }) })
    return { mode: 'live', prompt: response?.data?.prompt || prompt, estimated_price_cny: 0.02 }
  }
  return { mode: 'demo', prompt: `${prompt}${args.extra_context ? `; ${args.extra_context}` : ''}`, note: 'Demo mode does not call the paid prompt-refinement API.' }
}

function prepareProductVisualPrompt(request: string, useCase: ProductVisualPlan['use_case']) {
  const guidance: Record<ProductVisualPlan['use_case'], string> = {
    white_background: 'Create a clean ecommerce hero image on a pure white background with a centered product, controlled studio lighting, crisp edges, and a natural grounding shadow.',
    scene: 'Place the product in a commercially usable lifestyle or studio scene with coherent perspective, realistic contact shadows, and lighting that supports the requested mood.',
    detail: 'Create a close product detail image that clearly shows the requested material, construction, texture, or selling point with accurate surface rendering.',
  }
  return `${request.trim()}\n\nProduction constraints: ${guidance[useCase]} Preserve the product identity, proportions, materials, distinctive features, and visible branding from reference images. Do not invent extra products, labels, or unsupported claims.`
}

async function validateReferenceFiles(filePaths: string[]) {
  const validated: Array<{ file_path: string; size_bytes: number }> = []
  for (const filePath of filePaths) {
    const resolved = path.resolve(process.cwd(), filePath)
    const stat = await fs.stat(resolved)
    if (!stat.isFile()) throw new Error(`Reference path is not a file: ${filePath}`)
    if (stat.size > 40 * 1024 * 1024) throw new Error(`Reference file exceeds the 40 MB upload limit: ${filePath}`)
    validated.push({ file_path: resolved, size_bytes: stat.size })
  }
  return validated
}

async function createProductVisualPlan(args: Record<string, any>) {
  const request = String(args.request || '').trim()
  if (!request) throw new Error('request is required')
  if (request.length > 2000) throw new Error('request must be 2000 characters or fewer')

  const model = String(args.model || 'seeany-quality')
  const selectedModel = getModel(model)
  if (!selectedModel) throw new Error(`Unsupported model: ${model}`)

  const useCase = String(args.use_case || 'scene') as ProductVisualPlan['use_case']
  if (!supportedUseCases.includes(useCase)) throw new Error(`Unsupported use_case: ${useCase}`)

  const aspectRatio = String(args.aspect_ratio || '1:1')
  if (!(supportedRatios as readonly string[]).includes(aspectRatio)) throw new Error(`Unsupported aspect_ratio: ${aspectRatio}`)

  const resolution = String(args.resolution || '1k').toLowerCase()
  if (!selectedModel.resolutions.includes(resolution as never)) throw new Error(`${model} does not support ${resolution} resolution`)

  const count = Number(args.count || 1)
  if (!Number.isInteger(count) || count < 1 || count > 4) throw new Error('count must be an integer from 1 to 4')

  const referenceFilePaths = Array.isArray(args.reference_file_paths) ? args.reference_file_paths.map(String) : []
  if (referenceFilePaths.length > 6) throw new Error('reference_file_paths supports at most 6 files')
  const validatedReferences = await validateReferenceFiles(referenceFilePaths)

  const id = `plan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const plan: ProductVisualPlan = {
    id,
    mode: runMode,
    status: 'planned',
    request,
    production_prompt: prepareProductVisualPrompt(request, useCase),
    reference_file_paths: validatedReferences.map((item) => item.file_path),
    reference_asset_ids: [],
    model,
    use_case: useCase,
    aspect_ratio: aspectRatio,
    resolution,
    count,
    output_dir: String(args.output_dir || './seeany-output'),
    created_at: now(),
  }
  if (runMode === 'live') plan.estimated_price_cny = estimatePrice(model, resolution, count)
  else plan.estimated_credits = selectedModel.demo_price_per_image * count
  productVisualPlans.set(id, plan)
  return {
    ...plan,
    reference_files: validatedReferences,
    creates_generation_task: false,
    real_charge: false,
    requires_cost_confirmation: runMode === 'live',
    next_step: `Review this plan, then call seeany_create_product_visual with plan_id=${id} and confirm_cost=true to execute it.`,
  }
}

async function waitForGenerationJob(jobId: string, timeoutSeconds: number) {
  const timeoutMs = Math.min(Math.max(timeoutSeconds, 1), 120) * 1000
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const job = jobs.get(jobId)
    if (!job) throw new Error(`Unknown job_id: ${jobId}`)
    const refreshed = await refreshLiveJob(job)
    if (['succeeded', 'partial_failed', 'failed'].includes(refreshed.status)) return { job: refreshed, timed_out: false }
    await new Promise((resolve) => setTimeout(resolve, refreshed.mode === 'live' ? 2000 : 100))
  }
  const job = jobs.get(jobId)
  if (!job) throw new Error(`Unknown job_id: ${jobId}`)
  return { job: await refreshLiveJob(job), timed_out: true }
}

async function executeProductVisualPlan(args: Record<string, any>) {
  const planId = String(args.plan_id || '')
  const plan = productVisualPlans.get(planId)
  if (!plan) throw new Error(`Unknown or expired plan_id: ${planId}`)
  if (plan.mode === 'live' && args.confirm_cost !== true) {
    throw new Error(`Live generation requires confirm_cost=true for the quoted estimate of CNY ${plan.estimated_price_cny}`)
  }
  if (plan.downloaded_files?.length) {
    return { ...plan, reused_existing_job: true, real_charge: plan.mode === 'live', note: 'This plan was already completed; no new generation task was created.' }
  }

  if (args.output_dir) plan.output_dir = String(args.output_dir)
  const reusedExistingJob = Boolean(plan.job_id)
  try {
    plan.status = 'running'
    plan.error = undefined

    for (let index = plan.reference_asset_ids.length; index < plan.reference_file_paths.length; index += 1) {
      const asset = await uploadAsset(plan.reference_file_paths[index])
      plan.reference_asset_ids.push(asset.id)
    }

    if (!plan.job_id) {
      const jobArgs = {
        prompt: plan.production_prompt,
        reference_asset_ids: plan.reference_asset_ids,
        model: plan.model,
        use_case: plan.use_case,
        aspect_ratio: plan.aspect_ratio,
        resolution: plan.resolution,
        count: plan.count,
      }
      const job = plan.mode === 'live' ? await makeLiveJob(jobArgs) : makeDemoJob(jobArgs)
      plan.job_id = job.id
      productVisualPlans.set(plan.id, plan)
    }

    const result = await waitForGenerationJob(plan.job_id, Number(args.timeout_seconds || 120))
    plan.status = result.job.status === 'queued' ? 'running' : result.job.status
    if (result.timed_out) {
      return {
        ...plan,
        timed_out: true,
        reused_existing_job: reusedExistingJob,
        real_charge: plan.mode === 'live',
        next_step: `Call seeany_create_product_visual again with the same plan_id=${plan.id}; it will resume job ${plan.job_id} without creating a duplicate.`,
      }
    }
    if (result.job.status === 'failed') {
      plan.error = result.job.error || 'Generation failed'
      return { ...plan, real_charge: plan.mode === 'live' }
    }

    const downloaded = await downloadJob(result.job, plan.output_dir)
    plan.downloaded_files = downloaded.files
    productVisualPlans.set(plan.id, plan)
    return { ...plan, timed_out: false, reused_existing_job: reusedExistingJob, real_charge: plan.mode === 'live' }
  } catch (error) {
    plan.status = 'failed'
    plan.error = error instanceof Error ? error.message : String(error)
    productVisualPlans.set(plan.id, plan)
    throw error
  }
}

async function handleTool(name: string, args: Record<string, any>) {
  switch (name) {
    case 'seeany_plan_product_visual':
      return jsonResult(await createProductVisualPlan(args), 'SeeAny product visual plan (no generation task created)')
    case 'seeany_create_product_visual':
      return jsonResult(await executeProductVisualPlan(args), 'SeeAny product visual execution result')
    case 'seeany_get_capabilities':
      return jsonResult({ mode: runMode, api_base_url: runMode === 'live' ? apiBaseUrl : null, models: modelCatalog, supported_ratios: supportedRatios, recommended_tools: ['seeany_plan_product_visual', 'seeany_create_product_visual'], core_api_features: ['image upload', 'smart product image', 'task status polling', 'prompt refinement'] }, 'SeeAny capabilities')
    case 'seeany_get_account':
      return jsonResult(runMode === 'live' ? { mode: 'live', authenticated: true, api_base_url: apiBaseUrl, note: 'Balance and billing are managed in the SeeAny developer console.' } : { mode: 'demo', authenticated: false, demo_credits: 17255, note: 'No real API call or charge is made.' }, 'SeeAny account')
    case 'seeany_upload_asset': {
      const asset = await uploadAsset(String(args.file_path || ''))
      return jsonResult({ ...asset, mode: runMode }, `Uploaded SeeAny asset ${asset.id}`)
    }
    case 'seeany_quote_generation': {
      const model = getModel(String(args.model || ''))
      if (!model) throw new Error(`Unsupported model: ${args.model}`)
      const count = Number(args.count || 1)
      if (!Number.isInteger(count) || count < 1 || count > 4) throw new Error('count must be an integer from 1 to 4')
      const resolution = String(args.resolution || '1k').toLowerCase()
      return jsonResult(runMode === 'live' ? { mode: 'live', model: model.id, api_mode: model.api_mode, use_case: args.use_case, count, resolution, estimated_price_cny: estimatePrice(model.id, resolution, count), note: 'Estimate only; final billing follows the account pricing configuration.' } : { mode: 'demo', model: model.id, use_case: args.use_case, count, estimated_credits: model.demo_price_per_image * count, real_charge: false }, 'SeeAny generation quote')
    }
    case 'seeany_refine_prompt':
      return jsonResult(await refinePrompt(args), 'SeeAny prompt refinement result')
    case 'seeany_generate_product_image': {
      const job = runMode === 'live' ? await makeLiveJob(args) : makeDemoJob(args)
      return jsonResult({ job_id: job.id, status: job.status, mode: job.mode, estimated_credits: job.estimated_credits, estimated_price_cny: job.estimated_price_cny, real_charge: job.mode === 'live', next_step: `Call seeany_wait_generation with job_id=${job.id}` }, `Created SeeAny ${job.mode} generation job ${job.id}`)
    }
    case 'seeany_get_generation': {
      const job = jobs.get(String(args.job_id || ''))
      if (!job) throw new Error(`Unknown job_id: ${args.job_id}`)
      const refreshed = await refreshLiveJob(job)
      return jsonResult(refreshed, `SeeAny job ${refreshed.id}: ${refreshed.status}`)
    }
    case 'seeany_wait_generation': {
      const jobId = String(args.job_id || '')
      const result = await waitForGenerationJob(jobId, Number(args.timeout_seconds || 30))
      return jsonResult({ ...result.job, timed_out: result.timed_out }, result.timed_out ? `SeeAny job ${result.job.id} is still ${result.job.status}` : `SeeAny job ${result.job.id}: ${result.job.status}`)
    }
    case 'seeany_download_assets': {
      const job = jobs.get(String(args.job_id || ''))
      if (!job) throw new Error(`Unknown job_id: ${args.job_id}`)
      const result = await downloadJob(job, String(args.output_dir || ''))
      return jsonResult(result, `Downloaded ${result.files.length} SeeAny asset(s)`)
    }
    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}

const server = new Server(
  { name: 'seeany-product-visuals-mcp', version: serverVersion },
  { capabilities: { tools: {} }, instructions: 'Prefer seeany_plan_product_visual followed by seeany_create_product_visual for ordinary requests. Planning does not create a paid generation task. In live mode, execute only after showing the quote and receiving explicit cost confirmation. Reuse the same plan_id after a timeout to avoid duplicate jobs. Advanced callers may use the lower-level tools directly.' },
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: toolDefinitions }))
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try { return await handleTool(request.params.name, parseArgs(request)) } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return errorResult(message)
  }
})

const transport = new StdioServerTransport()
await server.connect(transport)
console.error(`SeeAny MCP running on stdio (${runMode} mode)`)
