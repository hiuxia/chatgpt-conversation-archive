# ChatGPT Voyager

`ChatGPT Voyager` 是一个面向 `chatgpt.com` 的 Chrome 扩展，支持两类核心能力：

- 在 ChatGPT 左侧历史栏里创建本地文件夹，用拖拽整理对话
- 把当前对话或批量历史对话导出为 Markdown / ZIP

文件夹功能是扩展自己的本地组织层，不会修改 ChatGPT 服务端数据。

## 主要功能

- 左侧栏 `Folders` 区域
- 一级文件夹创建、重命名、删除
- 直接把对话拖进文件夹，或拖回 `Your chats`
- 文件夹展开 / 收起
- 文件夹状态本地持久化
- 当前对话导出为 Markdown
- 批量历史导出为 ZIP

## 安装（Chrome）

1. 打开 `chrome://extensions`
2. 打开右上角 `开发者模式`
3. 点击 `加载已解压的扩展程序`
4. 选择本项目里的 `extension/` 目录
5. 打开 `https://chatgpt.com` 并登录账号
6. 刷新 ChatGPT 页面，确认左侧栏出现 `Folders`
7. 需要导出时，再打开插件侧边栏 `ChatGPT Voyager`

## 怎么用

### 使用左侧文件夹整理对话

1. 在 ChatGPT 左侧栏找到 `Folders`
2. 点击 `New folder`，直接在左栏内输入文件夹名
3. 把历史对话拖进目标文件夹
4. 点击文件夹行可展开 / 收起
5. 点击右侧 `...` 可在左栏内完成 `Rename` 和 `Delete`

说明：

- 当前只支持一级文件夹
- 删除文件夹不会删除对话，只会把对话移回 `Your chats`
- 文件夹关系保存在本地浏览器里

### 导出当前对话（单条）

1. 在 ChatGPT 打开一个具体对话页面（`/c/<id>`）
2. 点击 `Export Current Conversation`
3. 浏览器会下载一个 `.md` 文件

### 批量导出（ZIP）

1. 点击 `Load History Links` 加载历史会话
2. 通过搜索、分页浏览，勾选想导出的会话
3. 点击 `Export Selected (ZIP)`
4. 浏览器会下载一个 `.zip`，里面每个会话对应一个 `.md`

## 小提示

1. `Folders` 和导出能力是分开的，两者可以独立使用。
2. `Select Page` 只会选中当前页。
3. 你勾选的会话会在当前浏览器会话内保留（关闭侧边栏再打开还在）。
4. 如果历史列表不全，先在 ChatGPT 左侧历史栏向下滚动，再点一次 `Load History Links`。

## 当前版本

- `v0.1.0`

## 调试（可选，chrome-devtools-mcp）

如果你要做自动化调试或跑 `npm run test:cdp`，按下面步骤：

1. 启动专用 Chrome（9222 端口）：
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
5. 跑 CDP 测试：
   ```bash
   npm run test:cdp
   ```

## 贡献上手

欢迎提 Issue 或 PR，一般按下面流程即可：

1. Fork 本仓库并 clone 到本地
2. 安装依赖：
   - `npm install`
3. 本地加载扩展：
   - 打开 `chrome://extensions`
   - 开启开发者模式
   - 加载 `extension/` 目录
4. 修改后做基本验证：
   - `npm run test:content-dom`
   - `npm run test:folders`
   - `npm run test:markdown`
   - `npm run test:zip`
   - `npm run test:cdp`（需要你本地开了 9222 调试端口并已登录 ChatGPT）
5. 提交分支并发起 PR，说明：
   - 改了什么
   - 为什么改
   - 怎么验证的
