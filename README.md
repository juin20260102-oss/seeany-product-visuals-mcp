# SeeAny Sun MCP

让 Codex、Claude Code、Cursor 等支持 MCP 的编程 Agent，直接调用 SeeAny 的电商商品图生成能力。

Agent 可以通过这个 MCP 完成一条可追踪的商品图工作流：识别当前模型能力、上传商品参考图、润色提示词、预估费用、创建出图任务、等待任务完成，并把结果下载到本地。使用者不需要在对话中复制 API 请求、轮询任务状态或手动下载图片。

## 这个 MCP 能做什么

- **商品白底主图**：基于文字或商品参考图生成干净、聚焦主体的电商主图。
- **商品场景图**：把商品放入摄影棚、家居、户外、节日营销等视觉场景。
- **材质与细节图**：生成突出纹理、结构、工艺和卖点的商品特写。
- **参考图驱动生成**：上传本地商品图，并在后续任务中通过 `asset_id` 使用它。
- **AI 提示词润色**：把简单需求整理成包含构图、光线、材质、背景和约束的生产级提示词。
- **费用预估**：在真实生成前，根据模型、分辨率和数量返回估算费用；询价不会预扣费用。
- **异步任务管理**：创建任务后查询或等待状态，避免 Agent 因超时而重复提交付费任务。
- **结果落盘**：把完成的图片下载到指定本地目录，并返回可继续用于代码或设计工作的文件路径。

## 适合哪些场景

- 电商独立站、Amazon、Shopify、Temu 等商品主图和详情页素材
- 新品概念图、广告创意图、社交媒体商品视觉
- 同一商品的不同背景、构图、比例和视觉方向测试
- 在开发流程中让 Agent 自动生成占位图、演示图或真实营销素材
- 将 SeeAny 出图能力接入自动化脚本、IDE Agent 或内部内容生产流程

下面这些能力**尚未作为独立 MCP 工具开放**：视频生成、虚拟试穿、局部重绘、背景移除/替换和图片文字精确编辑。Agent 不应把商品图生成工具描述成这些专用能力。

## 工作方式

```text
Agent
  └─ 查询能力与运行模式
      └─ 上传参考图（可选）
          └─ 润色提示词（可选）
              └─ 询价
                  └─ 创建生成任务
                      └─ 等待/查询任务
                          └─ 下载结果
```

推荐 Agent 先调用 `seeany_get_capabilities`，再按实际需求选择最短完整流程。没有参考图时可以直接从提示词开始；已经有明确提示词时也可以跳过润色。

## 9 个 MCP 工具

| MCP 工具 | 作用 | 主要结果 | 是否可能产生费用 |
| --- | --- | --- | --- |
| `seeany_get_capabilities` | 查询模型、比例、分辨率和当前运行模式 | 模型与能力列表 | 否 |
| `seeany_get_account` | 判断 MCP 当前处于 Demo 还是 Live 模式 | 鉴权与模式信息 | 否 |
| `seeany_upload_asset` | 上传本地商品参考图 | `asset_id`、图片 URL | 通常否 |
| `seeany_refine_prompt` | 用 AI 润色商品图提示词 | 优化后的提示词 | Live 模式可能收费 |
| `seeany_quote_generation` | 生成前估算费用 | 预计价格或 Demo 积分 | 否，不预扣费用 |
| `seeany_generate_product_image` | 创建商品图异步任务 | `job_id`、初始状态 | Live 模式会产生费用 |
| `seeany_get_generation` | 查询单个任务的最新状态 | 状态、输出 URL、错误信息 | 否 |
| `seeany_wait_generation` | 轮询任务直到完成或超时 | 最终状态和输出列表 | 否 |
| `seeany_download_assets` | 下载任务生成的图片 | 本地文件路径 | 否 |

当前图片任务支持：

- 用途：`white_background`、`scene`、`detail`
- 模型：`seeany-quality`、`seeany-fast`
- 数量：每个任务 1–4 张
- 比例：自动、1:1、3:4、4:5、9:16、2:3、16:9、4:3、5:4、3:2、21:9
- 分辨率：1K、2K、4K，具体可用范围以 `seeany_get_capabilities` 返回结果为准

## Demo 与 Live 模式

### Demo 模式

未设置 `SEEANY_API_KEY` 时自动启用：

- 不访问 SeeAny 付费 API
- 不产生真实费用
- 返回模拟任务、状态和示例输出，用于验证 MCP 安装与 Agent 调用链
- Demo 结果不是模型真实生成结果，不能用于评价实际出图质量

也可以显式设置 `SEEANY_MCP_MODE=demo` 强制使用 Demo 模式。

### Live 模式

设置 `SEEANY_API_KEY` 后，MCP 会调用 `https://api.seeany.com`：

```bash
SEEANY_API_KEY=sk-sa-xxxxxxxx
```

Live 模式支持真实上传、提示词润色、商品图生成、任务轮询和下载。生成任务及部分 AI 能力会按 SeeAny 账户配置计费；实际账单以 SeeAny 开发者后台为准。

不要把真实 Key 写入 Git、前端代码、截图或聊天消息。Key 必须位于启动 MCP 进程的本机环境中。

## 快速开始

要求 Node.js 20 或更高版本。

直接启动：

```bash
npx --yes seeany-sun-mcp@latest
```

连接 Codex：

```bash
codex mcp add seeany-sun-mcp -- npx --yes seeany-sun-mcp@latest
```

其他 MCP Client 可使用等价配置：

```json
{
  "mcpServers": {
    "seeany-sun-mcp": {
      "command": "npx",
      "args": ["--yes", "seeany-sun-mcp@latest"],
      "env": {
        "SEEANY_API_KEY": "由本机安全环境提供，不要提交到仓库"
      }
    }
  }
}
```

只想体验调用流程时，删除 `env` 中的 Key 即可进入 Demo 模式。

## 安装为 Codex 插件（MCP + Skill）

插件安装后会同时提供 SeeAny MCP 工具和 `seeany-product-visuals` 商品视觉工作流 Skill。Skill 会指导 Agent 遵循“上传参考图 → 润色 → 询价 → 生成 → 等待 → 下载”的安全流程。

```bash
codex plugin marketplace add juin20260102-oss/seeany-sun-mcp --sparse .agents/plugins
codex plugin add seeany-sun-mcp@seeany
```

安装或升级后请新开一个 Codex 对话，使最新工具和 Skill 生效。真实出图仍需在本机设置 `SEEANY_API_KEY`。

## 可以怎样向 Agent 提需求

```text
用这张商品图生成一张 1:1 的白底电商主图。先询价，确认后再生成并下载到 ./outputs。
```

```text
把这款香水放进高级黑金摄影棚场景，强调玻璃瓶材质和轮廓光，生成 2 张 4:5 图片。
```

```text
先把我的简单描述润色成适合电商详情页的提示词，然后用快速模型做一张低成本测试图。
```

在 Live 模式中，Agent 应在创建付费任务前展示估算费用；如果任务等待超时，应继续查询原 `job_id`，而不是直接创建重复任务。

## 本地开发与测试

```bash
cd mcp-server
npm install
npm run build
npm run smoke
```

`npm run smoke` 强制使用 Demo 模式，不产生真实费用。

执行真实 API 链路验收：

```bash
npm run live-smoke
```

该命令会调用主站 API 并可能产生账户费用。调试 MCP 协议时可运行：

```bash
npm run inspect
```

## SeeAny API 映射

| MCP 工具 | SeeAny API |
| --- | --- |
| `seeany_upload_asset` | `POST /api/upload/image` |
| `seeany_refine_prompt` | `POST /api/prompt-tools/ai-refine` |
| `seeany_generate_product_image` | `POST /api/ai/smarttask`，`aiTypeId=113`，`aiType=smartImg` |
| `seeany_get_generation` / `seeany_wait_generation` | `GET /api/developer/task/status` |

任务默认采用异步模式。MCP 内存中保存本次进程创建的 `asset_id` 和 `job_id` 映射；重启 MCP 后，旧的本地映射不会自动恢复。

## 自动测试与发布

GitHub Actions 会在 `main` 分支 Push 和 Pull Request 时，使用 Node.js 20、22、24 执行插件校验、MCP Smoke Test 和 npm 打包检查。

推送与包版本一致的 Git Tag 后，`release.yml` 会验证版本、执行完整测试、发布 npm 包并创建 GitHub Release。当前发布使用仓库加密 Secret `NPM_TOKEN`；后续可迁移到 npm OIDC Trusted Publishing。

## 链接

- SeeAny 开发者文档：https://www.seeany.com/developer
- npm：https://www.npmjs.com/package/seeany-sun-mcp
- GitHub：https://github.com/juin20260102-oss/seeany-sun-mcp
- License：MIT
