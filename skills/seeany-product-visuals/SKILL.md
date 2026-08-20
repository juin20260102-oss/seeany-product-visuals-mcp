---
name: seeany-product-visuals
description: Plan and create ecommerce product visuals with the SeeAny MCP, including white-background hero images, scenes, details, references, cost confirmation, and local downloads. Use for product-image requests when the SeeAny MCP is available.
---

# SeeAny Product Visuals

Turn a product-image request into a quoted, traceable generation plan and downloaded files. Prefer the two-stage tools for ordinary requests; use the lower-level tools only when the user needs control over an individual step.

## Standard workflow

1. Identify the product, use case, visual direction, aspect ratio, resolution, model, count, reference files, and output directory from the request.
   - Default to one image at `1k`.
   - Use `seeany-fast` for a low-cost test and `seeany-quality` when quality is the priority.
   - Choose `1:1` for marketplace hero images, `3:4` or `4:5` for product/editorial layouts, and `9:16` for vertical social content only when the user has not specified a ratio and the intended placement makes the choice clear.

2. Call `seeany_plan_product_visual`.
   - Pass local reference paths directly in `reference_file_paths`; the planning tool validates them but does not upload them or create a generation task.
   - Present the returned prompt, model, ratio, resolution, count, output directory, and estimated price or Demo credits.
   - Make it explicit that planning created no paid generation task.

3. Obtain confirmation before Live execution.
   - Ask for confirmation when the user has not already authorized the shown parameters and estimated cost.
   - Demo mode has no real charge; tell the user that its output is simulated and cannot be used to judge model quality.

4. Call `seeany_create_product_visual` with the returned `plan_id`.
   - Set `confirm_cost=true` only after the user has authorized the Live estimate. The field may be `false` in Demo mode.
   - The tool uploads references, creates or resumes the generation job, waits for completion, and downloads successful results.
   - Return the `plan_id`, `job_id`, final status, and concrete local file paths.

5. Resume instead of duplicating.
   - If execution times out, call `seeany_create_product_visual` again with the same `plan_id`.
   - Never create a new plan merely because polling timed out. Reusing the plan resumes its stored `job_id` and avoids another paid task.
   - A server restart clears in-memory plan mappings. If the MCP reports an unknown plan after restart, explain the limitation before considering a new paid task.

## Prompt refinement and advanced control

The planning tool adds deterministic ecommerce constraints without calling the paid AI refinement endpoint. Use `seeany_refine_prompt` only when the user asks for AI refinement or the creative direction genuinely needs it; disclose that Live refinement may incur a small charge.

Use the lower-level tools when the user explicitly needs to upload assets separately, compare quotes, submit without the high-level workflow, inspect a known job, or control the download step:

| Goal | Tool |
| --- | --- |
| Plan and quote an ordinary request | `seeany_plan_product_visual` |
| Confirm, execute, wait, and download | `seeany_create_product_visual` |
| Discover models and ratios | `seeany_get_capabilities` |
| Check Demo/Live mode | `seeany_get_account` |
| Upload one local reference | `seeany_upload_asset` |
| Use AI prompt refinement | `seeany_refine_prompt` |
| Estimate a low-level task | `seeany_quote_generation` |
| Create a low-level task | `seeany_generate_product_image` |
| Read or wait for job status | `seeany_get_generation` / `seeany_wait_generation` |
| Download a completed job | `seeany_download_assets` |

## Product fidelity

- Preserve product identity, proportions, materials, distinctive features, and visible branding when references are supplied.
- State the intended placement, composition, background, lighting, material fidelity, and important negative constraints.
- Do not promise exact text or logo reproduction unless the selected model and references make it realistic.
- Report partial failures item by item rather than hiding successful outputs.

## Guardrails

- Never request, print, store, or transmit `SEEANY_API_KEY` or npm/GitHub tokens.
- Never start a Live generation without authorization for the shown estimate.
- Never replace an existing `plan_id` or `job_id` after a timeout just to retry faster.
- Do not claim video, virtual try-on, background replacement, local inpainting, or precise image-text editing until corresponding MCP tools exist.
- If the MCP is unavailable, explain how to start `npx --yes seeany-product-visuals-mcp@latest` and stop rather than fabricating a result.
