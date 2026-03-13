[English](./README.md) | [简体中文](./README.zh-CN.md)

# ChatGPT Voyager

`ChatGPT Voyager` 是一个面向 `chatgpt.com` 的 Chrome 扩展，围绕三个高频需求工作：

- 在 ChatGPT 原生左侧栏里用多层文件夹整理历史对话
- 在长对话页面右侧用点状目录做预览和定位
- 把当前对话或批量历史导出为 Markdown / ZIP

这些能力都建立在扩展自己的本地组织层之上，不会修改 ChatGPT 服务端数据。

## 当前能力

### 左栏整理

- 在 ChatGPT 左侧栏加入 `Folders` 分组
- 支持多层文件夹
- 支持在左栏内联创建、重命名、删除文件夹
- 支持把对话拖进任意层级文件夹，或拖回 `Your chats`
- 本地缓存已见过的会话标题与归属关系，减轻对原生历史 DOM 的依赖

### 对话阅读

- 在会话页右侧提供可收起的目录入口
- 用小圆点预览助手回答，再决定是否跳转
- 从助手回答中的 Markdown 标题里提取小节

### 导出与发布

- 导出当前对话为 Markdown
- 批量导出已选历史为 ZIP
- 提供发布自动化脚本和 GitHub Actions 发版流程

## 安装

1. 打开 `chrome://extensions`
2. 打开右上角 `开发者模式`
3. 点击 `加载已解压的扩展程序`
4. 选择仓库里的 [extension/](./extension) 目录
5. 打开 `https://chatgpt.com` 并登录
6. 刷新页面，确认左侧栏出现 `Folders`
7. 需要导出时，再打开扩展侧边栏 `ChatGPT Voyager`

## 如何使用

### 1. 用左侧文件夹整理历史

1. 在 ChatGPT 左侧栏找到 `Folders`
2. 点击 `New folder` 创建顶层文件夹
3. 点击文件夹右侧 `...` 可以：
   - `Rename`
   - `Delete`
   - `New subfolder`
4. 直接把历史对话拖进目标文件夹
5. 也可以把一个文件夹拖进另一个文件夹，形成多层结构

说明：

- 文件夹是扩展的本地组织层，不会同步到 ChatGPT 账号
- 删除父文件夹时，不会删除对话；子文件夹会提升到上一层
- 已缓存过的会话，即使原生历史列表暂时没加载出来，也能在文件夹里继续显示

### 2. 用右侧目录预览长对话

1. 打开任意一个 ChatGPT 会话页（`/c/<id>`）
2. 在正文右侧点击 `目录`
3. 点击小圆点，先预览对应 assistant 回答
4. 在预览卡片里查看：
   - 上一条用户输入的开头摘要
   - 当前回答的简短预览
   - 该回答里的 Markdown 小节
5. 点击 `跳到这里` 或具体小节标题，再跳到目标位置

说明：

- 小圆点默认是预览入口，不会直接把页面滚走
- 目录默认收起
- 长预览卡片和长圆点轨道都支持独立滚动
- 目录只提取助手回答里的 Markdown 标题，不会混入壳层标题

### 3. 导出当前对话

1. 在 ChatGPT 打开一个具体对话页面（`/c/<id>`）
2. 打开扩展侧边栏
3. 点击 `Export Current Conversation`
4. 浏览器会下载一个 `.md` 文件

### 4. 批量导出历史

1. 打开扩展侧边栏
2. 点击 `Load History Links`
3. 通过搜索、分页浏览并勾选要导出的会话
4. 点击 `Export Selected (ZIP)`
5. 浏览器会下载一个 `.zip`，其中每个会话对应一个 `.md`

## 项目结构

- [extension/](./extension)：Chrome 扩展主体
- [tests/](./tests)：无构建自测脚本
- [scripts/](./scripts)：release 与打包脚本

## 当前版本

- `v0.3.0`

## Release 自动化

项目已经带有自动化 release 流程，但完整步骤更偏向维护者文档。

- 主页只保留概览
- 具体发布流程由本地 release 脚本和 GitHub Actions workflow 负责

## 调试（可选，chrome-devtools-mcp）

如果你要做自动化调试或运行 `npm run test:cdp`：

1. 启动专用 Chrome：
   ```bash
   mkdir -p /tmp/chrome-mcp-chatgpt
   open -na "Google Chrome" --args \
     --remote-debugging-port=9222 \
     --user-data-dir=/tmp/chrome-mcp-chatgpt
   ```
2. 在这个窗口登录 `https://chatgpt.com`
3. 验证调试端口：
   ```bash
   curl -s http://127.0.0.1:9222/json/version
   curl -s http://127.0.0.1:9222/json/list
   ```
4. 连接 MCP：
   ```bash
   codex mcp remove chrome-devtools
   codex mcp add chrome-devtools -- \
     npx -y chrome-devtools-mcp@latest \
     --browser-url=http://127.0.0.1:9222
   codex mcp list
   ```
5. 运行：
   ```bash
   npm run test:cdp
   ```

## 开发与贡献

1. Fork 本仓库并 clone 到本地
2. 安装依赖：`npm install`
3. 在 `chrome://extensions` 中加载 [extension/](./extension)
4. 修改后至少运行：
   - `npm run test:content-dom`
   - `npm run test:toc`
   - `npm run test:folders`
   - `npm run test:markdown`
   - `npm run test:zip`
5. 如果需要，再补跑 `npm run test:cdp`
6. 提交 PR 时说明：
   - 改了什么
   - 为什么改
   - 怎么验证的
