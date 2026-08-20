# 在 WorkBuddy 中使用 SeeAny Product Visuals

SeeAny Product Visuals 为 WorkBuddy 提供可直接调用的商品视觉工具。连接后，可以用自然语言让 WorkBuddy 规划并生成商品白底图、场景图和材质细节图。

## 1. 准备环境

- 安装 Node.js 20 或更高版本。
- 确认终端可以执行 `npx --version`。
- 只体验调用流程时不需要 SeeAny API Key；此时 MCP 自动进入 Demo 模式。
- 生成真实图片时，在启动 WorkBuddy 前把 `SEEANY_API_KEY` 设置为当前用户的系统环境变量，然后重新启动 WorkBuddy。

不要把真实 Key 写进项目文件、聊天消息、截图或 Git 仓库。

## 2. 添加 MCP Server

WorkBuddy 支持用户级和项目级 MCP 配置：

- 用户级：`~/.workbuddy/mcp.json`，配置一次后所有项目可用。
- 项目级：`<项目目录>/.workbuddy/mcp.json`，只对当前项目生效。

也可以在 WorkBuddy 侧边栏进入“插件 → MCP 服务器 → 配置 MCP”，粘贴下面的配置：

```json
{
  "mcpServers": {
    "seeany-product-visuals": {
      "command": "npx",
      "args": ["--yes", "seeany-product-visuals-mcp@latest"]
    }
  }
}
```

保存后确认 `seeany-product-visuals` 状态为绿色。首次启动时，`npx` 需要下载 npm 包，可能比后续启动稍慢。

## 3. 第一次测试

先在 Demo 模式输入：

```text
请使用 SeeAny 规划一张 1:1 的白底商品主图，先给我看方案和费用，不要直接生成。
```

WorkBuddy 应调用 `seeany_plan_product_visual` 并返回 `plan_id`。确认方案后再说：

```text
确认执行刚才的 SeeAny 方案，生成完成后下载到 ./seeany-output。
```

WorkBuddy 应调用 `seeany_create_product_visual`。Demo 模式不会请求真实 SeeAny 生成 API，返回的示例图片不能用于判断真实画质。

## 4. 生成真实图片

设置 `SEEANY_API_KEY` 并重启 WorkBuddy 后，MCP 会自动进入 Live 模式。推荐这样提需求：

```text
使用这张商品参考图生成一张 4:5 高级摄影棚场景图。先规划、展示预计费用并等我确认；确认后再生成，最后下载到 ./outputs。
```

规划工具不会创建付费任务。只有在你明确确认费用后，执行工具才会创建 Live 生成任务。

如果等待超时，让 WorkBuddy 使用原来的 `plan_id` 继续执行。不要重新规划并创建另一条任务；相同 `plan_id` 会恢复原来的 `job_id`，避免重复提交。

## MCP 与 Skill 怎么配合

- MCP 负责上传、报价、生成、轮询和下载，保证参数与返回结果稳定。
- `seeany-product-visuals` Skill 负责理解商品图场景、选择模型、组织提示词并检查费用确认。

只安装 MCP 也能调用工具；同时安装 Skill 后，Agent 更容易选择正确工作流。Skill 不应自行拼接 SeeAny API 请求，也不应读取或输出 `SEEANY_API_KEY`。

## 常见问题

### 状态显示红色

先在系统终端执行：

```bash
node --version
npx --version
npx --yes seeany-product-visuals-mcp@latest
```

Node.js 版本需要不低于 20。最后一条命令正常启动后会等待 MCP 客户端通过 stdio 发送请求，终端没有继续输出并不代表卡死，可以按 `Ctrl+C` 结束测试。

### 配置了 Key 仍然是 Demo 模式

WorkBuddy 只能读取启动时已有的环境变量。设置 `SEEANY_API_KEY` 后完全退出并重新打开 WorkBuddy，再让它调用 `seeany_get_account` 检查模式。

### 任务等待超时

继续调用 `seeany_create_product_visual` 并传入原 `plan_id`。MCP 会恢复已有任务，不会因为轮询超时自动创建第二个付费任务。

## 相关链接

- GitHub：https://github.com/juin20260102-oss/seeany-product-visuals-mcp
- npm：https://www.npmjs.com/package/seeany-product-visuals-mcp
- SeeAny 开发者文档：https://www.seeany.com/developer
- WorkBuddy MCP 官方说明：https://www.codebuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/MCP-Guide
