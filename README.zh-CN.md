[English](./README.md) | [简体中文](./README.zh-CN.md)

# ChatGPT Voyager

把 ChatGPT 变成一个可整理、可跳读、可导出的工作空间。

![ChatGPT Voyager 总览](./assets/readme/overview.png)

ChatGPT Voyager 是一个面向 `chatgpt.com` 的本地优先 Chrome 扩展。它会给 ChatGPT 加上：

- 原生左侧栏里的多层文件夹
- 长回答页面右侧的目录导航
- 当前对话 Markdown 导出和多选 ZIP 导出

扩展的整理数据保存在你的浏览器本地。它不会把文件夹同步到 ChatGPT 服务器，也不会修改 ChatGPT 服务端数据。

## 为什么需要它

当 ChatGPT 历史里混着研究、编程、写作、复盘和长期项目时，默认列表很快会变成一条很长的平铺记录。Voyager 给这条历史加上一层工作区结构：

- 把相关对话放进文件夹和子文件夹
- 在长回答里先预览，再决定跳到哪里
- 把有价值的对话导出成文件，方便归档或复用

## 从源码安装

![安装流程](./assets/readme/install-flow.png)

1. Clone 或下载本仓库。
2. 打开 `chrome://extensions`。
3. 打开 `开发者模式`。
4. 点击 `加载已解压的扩展程序`。
5. 选择本仓库里的 `extension/` 目录。
6. 打开或刷新 `https://chatgpt.com`。
7. 确认 ChatGPT 左侧栏出现 `Folders`。

## 左侧文件夹

![左侧文件夹](./assets/readme/sidebar-folders.png)

当 ChatGPT 历史开始变成一堆平铺条目时，可以用文件夹整理它。

1. 打开 `https://chatgpt.com`。
2. 在左侧栏找到 `Folders`。
3. 点击 `New folder` 创建顶层文件夹。
4. 用文件夹右侧 `...` 菜单重命名、删除或创建子文件夹。
5. 直接把对话拖进文件夹，或者打开 ChatGPT 原生对话 `...` 菜单并选择 `Move to folders`。
6. 把一个文件夹拖进另一个文件夹，可以形成多层结构。

说明：

- 文件夹是扩展自己的本地组织层。
- 删除文件夹只会删除本地文件夹树，不会删除 ChatGPT 对话。
- 已缓存过的会话，即使 ChatGPT 原生历史还没完全加载出来，也可以继续显示在文件夹里。

## 右侧目录

![右侧目录](./assets/readme/conversation-toc.png)

右侧目录适合用来阅读很长的 assistant 回答，先看结构，再决定跳转。

1. 打开任意 ChatGPT 对话页，例如 `/c/<id>`。
2. 点击页面右侧的 `TOC`。
3. 点击小圆点，预览对应的 assistant 回答。
4. 在预览卡片里查看：上一条用户输入、回答摘要，以及 Markdown 标题小节。
5. 确认目标后，点击 `Jump here` 或某个小节标题跳转。

说明：

- 小圆点默认先预览，不会立刻滚动页面。
- 目录默认收起。
- 目录只提取 assistant 回答里的 Markdown 标题。

## 导出对话

![导出侧边栏](./assets/readme/export-sidepanel.png)

当你想把对话保存到 ChatGPT 之外时，打开 ChatGPT Voyager 的扩展侧边栏。

导出当前对话：

1. 打开一个具体的 ChatGPT 对话页。
2. 打开扩展侧边栏。
3. 点击 `Export Current Conversation`。

批量导出：

1. 打开扩展侧边栏。
2. 点击 `Load History Links`。
3. 通过搜索、分页和勾选选择要导出的对话。
4. 点击 `Export Selected (ZIP)`。

## 项目结构

- `extension/`：Chrome 扩展主体
- `assets/readme/`：README 截图和安装示意图
- `scripts/`：release、打包和文档图片生成脚本
- `tests/`：无需构建的 DOM 自测和 release 自测

## 开发

安装依赖：

```bash
npm install
```

运行常用检查：

```bash
npm run test:toc
npm run test:extract
npm run test:folders
npm run test:release
```

重新生成 README 截图：

```bash
node scripts/generate-readme-assets.mjs
```

真实 ChatGPT 提取冒烟测试：

```bash
npm run test:cdp
```

`test:cdp` 需要先启动带远程调试端口的 Chrome，并在 `127.0.0.1:9222` 提供调试端点，同时需要已经登录 ChatGPT。

## 当前版本

- `v0.4.1`
