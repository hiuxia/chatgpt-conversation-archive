[English](./README.md) | [简体中文](./README.zh-CN.md)

# ChatGPT Voyager

把 ChatGPT 变成一个更可整理、可回看、可导出的工作空间。

`ChatGPT Voyager` 是一个面向 `chatgpt.com` 的 Chrome 扩展，主要解决三件事：

- 在原生左侧栏里用多层文件夹整理历史对话
- 在长对话页面右侧先预览回答，再决定是否跳转
- 把重要对话导出成 Markdown 或 ZIP

它是一个本地优先的增强层，不会同步到 ChatGPT 服务端，也不会修改 ChatGPT 服务端数据。

## 为什么有人会用它

### 让历史对话不再失控

当你把 ChatGPT 用在研究、编程、写作或长期项目里时，默认历史列表很快就会失去条理。Voyager 直接在 ChatGPT 左侧栏里加入多层文件夹，让历史记录更像工作区，而不是堆在一起的聊天列表。

### 让长回答更容易阅读

长回答有价值，但很难快速定位。Voyager 在右侧提供一个轻量目录，你可以先看回答预览，再决定是否跳到那一段。

### 让有价值的内容留到 ChatGPT 之外

有些对话值得保留、整理和复用。Voyager 支持把当前对话导出成 Markdown，也支持批量导出成 ZIP，方便你放进自己的知识库或工作流。

## 适合谁

- 需要长期整理 ChatGPT 历史的研究者
- 用 ChatGPT 做调试、规划或代码讨论的开发者
- 想把对话沉淀成笔记素材的写作者
- 已经觉得左侧历史栏越来越乱的人

## 你会得到什么

### 左栏整理

- 在 ChatGPT 原生左侧栏加入 `Folders` 分组
- 支持多层文件夹
- 支持直接拖拽对话到文件夹中
- 用本地会话缓存减轻对原生历史 DOM 的依赖

### 对话阅读

- 在会话页右侧显示可收起的目录入口
- 用小圆点预览助手回答，再决定是否跳转
- 从助手回答中的 Markdown 标题提取小节

### 导出

- 导出当前对话为 Markdown
- 批量导出已选历史为 ZIP

## 安装

1. 打开 `chrome://extensions`
2. 打开右上角 `开发者模式`
3. 点击 `加载已解压的扩展程序`
4. 选择仓库里的 [extension/](./extension) 目录
5. 打开 `https://chatgpt.com` 并登录
6. 刷新页面，确认左侧栏出现 `Folders`
7. 需要导出时，再打开扩展侧边栏 `ChatGPT Voyager`

## 怎么使用

### 用左侧文件夹整理历史

1. 在 ChatGPT 左侧栏找到 `Folders`
2. 点击 `New folder` 创建顶层文件夹
3. 点击文件夹右侧 `...` 可以重命名、删除或新建子文件夹
4. 直接把对话拖进文件夹
5. 也可以把一个文件夹拖进另一个文件夹，形成多层结构

说明：

- 文件夹是扩展自己的本地组织层，不会同步到 ChatGPT 账号
- 删除父文件夹时，不会删除对话；子文件夹会提升到上一层
- 已缓存过的会话，即使原生历史列表暂时没完全加载出来，也能继续显示

### 用右侧目录预览长对话

1. 打开任意一个 ChatGPT 会话页（`/c/<id>`）
2. 在正文右侧点击 `TOC`
3. 点击小圆点，先预览对应 assistant 回答
4. 在预览卡片里查看：
   - 上一条用户输入的开头摘要
   - 当前回答的简短预览
   - 该回答里的 Markdown 小节
5. 点击 `Jump here` 或具体小节标题，再跳到目标位置

说明：

- 小圆点默认是预览入口，不会直接把页面滚走
- 目录默认收起
- 长预览卡片和长圆点轨道都支持独立滚动
- 目录只提取助手回答里的 Markdown 标题，不会混入壳层标题

### 导出对话

当前对话：

1. 在 ChatGPT 打开一个具体对话页面（`/c/<id>`）
2. 打开扩展侧边栏
3. 点击 `Export Current Conversation`

批量导出：

1. 打开扩展侧边栏
2. 点击 `Load History Links`
3. 通过搜索、分页浏览并勾选要导出的会话
4. 点击 `Export Selected (ZIP)`

## 项目结构

- [extension/](./extension)：Chrome 扩展主体
- [tests/](./tests)：无构建自测脚本
- [scripts/](./scripts)：release 与打包脚本

## 当前版本

- `v0.3.0`

## Release 自动化

项目已经带有自动化 release 流程，但详细步骤更偏向维护者。

- 本地 release 脚本会同步版本号和 changelog
- GitHub Actions 会自动发布打了 tag 的版本

## 调试

如果你要运行 `npm run test:cdp`，需要先启动带远程调试端口的 Chrome，并登录 `chatgpt.com`。更完整的 MCP 调试命令可以从仓库历史里找到，适合本地自动化使用。

## 开发与贡献

1. Fork 并 clone 本仓库
2. 运行 `npm install`
3. 在 `chrome://extensions` 中加载 [extension/](./extension)
4. 提交 PR 前至少运行：
   - `npm run test:toc`
   - `npm run test:release`
   - 如果需要验证真实 ChatGPT 会话提取，再运行 `npm run test:cdp`
5. 在 PR 中说明：
   - 改了什么
   - 为什么改
   - 怎么验证的
