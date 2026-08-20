---
name: seeany-product-visuals
description: Create ecommerce product images with the SeeAny MCP, including clean hero images, studio scenes, product details, and prompt refinement. Use when a user asks to generate, visualize, stage, or improve product artwork and a SeeAny MCP server is available.
---

# SeeAny Product Visuals

Use the SeeAny MCP to turn a product-image request into a traceable generation job and downloadable files. Prefer the smallest complete workflow and preserve the user's product identity when reference images are provided.

## Workflow

1. Clarify the output before calling a paid tool.
   - Identify the product, intended placement (hero, scene, detail), visual direction, aspect ratio, resolution, model, and image count.
   - Use `1:1`, `3:4`, or `9:16` only when the user has not specified a ratio and the use case makes the choice obvious.
   - Default to one image and `1k`; use `seeany-fast` for a low-cost first test and `seeany-quality` when quality is the priority.

2. Upload references when needed.
   - Call `seeany_upload_asset` for each local product or model image.
   - Keep the returned `asset_id`; pass asset ids, not local paths, to later tools.
   - Do not expose API keys or embed them in URLs, prompts, files, or logs.

3. Prepare the prompt.
   - Call `seeany_refine_prompt` when the request is vague, lacks ecommerce constraints, or needs a more premium/creative direction.
   - Write prompts that state subject identity, composition, background, lighting, material fidelity, negative constraints, and intended platform.
   - Do not promise exact text or logos unless the model and reference are likely to preserve them.

4. Quote and confirm live work.
   - Call `seeany_quote_generation` with the selected model, count, use case, and resolution.
   - In live mode, treat the returned CNY amount as an estimate. Confirm the estimate before starting a paid task unless the user already authorized the generation and parameters.
   - Demo mode has no real charge; tell the user when a result is simulated.

5. Create the task.
   - Call `seeany_generate_product_image` with the prompt, `reference_asset_ids`, model, aspect ratio, resolution, and count.
   - Record the returned `job_id` and tell the user whether the task is demo or live.

6. Wait for completion.
   - Call `seeany_wait_generation` with the job id and a timeout up to 120 seconds.
   - If it times out, call `seeany_get_generation` and report the current status rather than creating a duplicate task.
   - Treat `succeeded` as complete, `partial_failed` as mixed output, and `failed` as an error requiring explanation.

7. Download and report.
   - After success, call `seeany_download_assets` with a user-provided output directory.
   - Return the job id, final status, generated image URLs when useful, and concrete local file paths.
   - For partial failures, report successful files and each failed item separately.

## Tool mapping

| Goal | Tool |
| --- | --- |
| Discover available models and ratios | `seeany_get_capabilities` |
| Check demo/live mode | `seeany_get_account` |
| Upload a local reference | `seeany_upload_asset` |
| Improve a rough prompt | `seeany_refine_prompt` |
| Estimate cost | `seeany_quote_generation` |
| Start generation | `seeany_generate_product_image` |
| Read status | `seeany_get_generation` |
| Wait for status | `seeany_wait_generation` |
| Save result locally | `seeany_download_assets` |

## Guardrails

- Never request, print, store, or transmit `SEEANY_API_KEY` or any npm/GitHub token.
- Never start a live generation without the user's authorization for the estimated cost.
- Do not retry a submitted job by creating another job unless the original is definitively failed or the user explicitly requests a new variation.
- Do not claim that unsupported operations such as video, try-on, background replacement, or image editing are available through this skill until corresponding MCP tools are installed.
- If the MCP is unavailable, explain how to start `seeany-product-visuals-mcp` and stop rather than fabricating a result.
