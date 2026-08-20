# SkillHub 发布与迁移说明

## 推荐名称

SeeAny 商品视觉创作

Skill 标识建议保持为：`seeany-product-visuals`。

## 一句话介绍

让 WorkBuddy 等 AI Agent 调用 SeeAny MCP，先规划和询价，再生成商品白底图、场景图与细节图并下载结果。

## 详情页介绍

SeeAny 商品视觉创作是一套面向电商商品图的 Agent 工作流。它指导 WorkBuddy、Codex、Claude Code、Cursor 等 Agent 选择商品图用途、模型、比例和分辨率，并通过 SeeAny Product Visuals MCP 完成参考图上传、费用预估、生成任务、状态追踪和结果下载。

普通任务采用两阶段流程：

1. `seeany_plan_product_visual` 整理需求并返回方案与预计费用，不创建付费任务。
2. 用户确认后，`seeany_create_product_visual` 创建或恢复任务，等待完成并下载图片。

适合电商白底主图、商品场景图、材质细节图、广告创意测试和开发项目视觉素材。

## 安装前提

Skill 提供商品视觉方法和安全工作流，本身不直接拼接 SeeAny API 请求。使用前需要连接 `seeany-product-visuals-mcp`：

```text
npx --yes seeany-product-visuals-mcp@latest
```

WorkBuddy 用户可参考仓库中的 `docs/workbuddy.md`。不配置 `SEEANY_API_KEY` 时进入 Demo 模式；Demo 不产生费用，但返回的是模拟结果。真实生成需要在本机环境中配置 Key。

## 从 seeany-smart-creation 迁移

更新旧 SkillHub Skill 时建议：

- 保留商品视觉策划、提示词组织、平台比例和结果验收等创作知识。
- 删除由 Agent 自行拼接 HTTP 请求、鉴权 Header、任务轮询和文件下载的说明。
- 把普通流程改为 `seeany_plan_product_visual` → 展示费用 → 用户确认 → `seeany_create_product_visual`。
- 把单步上传、AI 润色、询价、任务查询和下载工具保留为高级用法。
- 不要要求用户把 `SEEANY_API_KEY` 粘贴到聊天、Skill 文件或命令参数中。
- MCP 不可用时引导用户安装，不要静默回退到未受控的直接 API 调用。

仓库中可直接发布的 Skill 源文件位于 `skills/seeany-product-visuals/SKILL.md`。

## 推荐示例指令

```text
用这张商品参考图做一张 1:1 白底主图。先规划并展示预计费用，等我确认后再生成，最后下载到 ./outputs。
```

```text
把这瓶香水放进高级黑金摄影棚，强调玻璃材质和轮廓光。用快速模型先规划一张 4:5 测试图，不要直接生成。
```

## 标签建议

`WorkBuddy`、`MCP`、`电商`、`商品图`、`图片生成`、`SeeAny`、`AI Agent`
