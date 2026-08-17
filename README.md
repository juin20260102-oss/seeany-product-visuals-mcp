# SeeAny Sun MCP

本目录提供一个可被 Codex、Claude Desktop、Cursor 等 MCP Client 调用的本地 stdio MCP Server。

它支持两种模式：

- `demo`：不需要密钥，使用仓库内的商品图片做离线模拟，不调用付费 API。
- `live`：设置 `SEEANY_API_KEY` 后调用主站 `https://api.seeany.com`，支持图片上传、智能创作、任务轮询、下载和 AI 润色。

## 鉴权环境变量

统一使用：

```bash
SEEANY_API_KEY=sk-sa-xxxxxxxx
```

不要把真实 Key 写入 Git、浏览器代码或聊天消息。复制 `.env.example` 到本机环境后填写即可。没有 Key 时服务自动进入 Demo 模式；也可以用 `SEEANY_MCP_MODE=demo` 强制离线模式。

## 本地安装与测试

```bash
cd mcp-server
npm install
npm run build
npm run smoke
```

Smoke test 会强制使用 Demo 模式，不会产生真实费用。

如需执行一次真实链路验收（会产生主站账户费用），确认已设置新 Key 后运行：

```bash
npm run live-smoke
```

## 连接 Codex

```bash
codex mcp add seeany-sun-mcp -- npx --yes seeany-sun-mcp
```

如果使用真实 API，请在启动 MCP 的同一环境中设置 `SEEANY_API_KEY`。连接后建议先调用 `seeany_get_capabilities`，再按以下顺序调用：

1. `seeany_upload_asset`（有参考图时）
2. `seeany_refine_prompt`（可选）
3. `seeany_generate_product_image`
4. `seeany_wait_generation`
5. `seeany_download_assets`

## MCP Inspector

```bash
npm run inspect
```

## 当前真实 API 映射

| MCP 工具 | SeeAny API |
| --- | --- |
| `seeany_upload_asset` | `POST /api/upload/image` |
| `seeany_refine_prompt` | `POST /api/prompt-tools/ai-refine` |
| `seeany_generate_product_image` | `POST /api/ai/smarttask`，`aiTypeId=113`，`aiType=smartImg` |
| `seeany_get_generation` / `seeany_wait_generation` | `GET /api/developer/task/status` |

任务默认采用异步模式。主站 API 的图片/视频任务按账户配置计费；`seeany_quote_generation` 只返回估算值，不会预扣费用。

## npm 包名

当前包名定为 `seeany-sun-mcp`，适合先发布一个公开的无作用域包。正式发布前需要在 npm 上确认名称可用；如果 SeeAny 已建立 npm scope，也可以迁移为 `@seeany/sun-mcp`。

发布后的最简调用方式：

```bash
npx --yes seeany-sun-mcp
```

发布前检查包内容：

```bash
npm run pack:check
```
