# ChatGPT Conversation Archive

把 `chatgpt.com` 对话导出为 Markdown，支持单条导出和批量 ZIP 导出。

## 安装（Chrome）

1. 打开 `chrome://extensions`
2. 打开右上角 `开发者模式`
3. 点击 `加载已解压的扩展程序`
4. 选择本项目里的 `extension/` 目录
5. 打开 `https://chatgpt.com` 并登录账号
6. 打开插件侧边栏 `Conversation Archive`

## 怎么用

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

1. `Select Page` 只会选中当前页。
2. 你勾选的会话会在当前浏览器会话内保留（关闭侧边栏再打开还在）。
3. 如果历史列表不全，先在 ChatGPT 左侧历史栏向下滚动，再点一次 `Load History Links`。

## 当前版本

- `v0.1.0`

