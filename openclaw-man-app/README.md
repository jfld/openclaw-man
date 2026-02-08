# OpenClaw-Man App

这是一个基于微信小程序的 AI 机器人聊天应用，旨在为用户提供便捷的多 AI 助手沟通体验。用户可以通过微信登录，添加自定义的 AI 机器人（配置服务地址和 API Key），并与它们进行类似微信风格的对话。

## ✨ 核心功能

- **多机器人管理**：支持添加、查看和管理多个 AI 机器人。
- **即时通讯**：与 AI 机器人进行实时文本对话，体验类似微信聊天。
- **本地存储**：聊天记录和机器人配置存储在本地，支持历史消息查看。
- **微信集成**：支持微信授权登录，无缝接入微信生态。

## 🛠 技术栈

- **前端框架**：微信小程序原生开发
- **UI 组件库**：WeUI for 小程序
- **依赖管理**：NPM
- **主要依赖**：
  - `@miniprogram-component-plus/*`: 微信小程序扩展组件
  - `miniprogram-barrage`: 弹幕组件
  - `miniprogram-recycle-view`: 长列表优化组件
  - `wxml-to-canvas`: WXML 转 Canvas 组件

## 📂 目录结构

```
openclaw-man-app/
├── docs/               # 项目文档 (PRD, 技术架构等)
├── miniprogram/        # 小程序源码
│   ├── api/            # API 接口封装
│   ├── common/         # 公共资源 (样式, 模板等)
│   ├── image/          # 图片资源
│   ├── page/           # 页面文件
│   │   ├── chat/       # 聊天页面
│   │   ├── index/      # 消息列表页
│   │   ├── robot/      # 机器人管理页
│   │   └── ...
│   ├── app.js          # 小程序入口逻辑
│   ├── app.json        # 全局配置
│   └── package.json    # 项目依赖
└── README.md           # 项目说明
```

## 🚀 快速开始

### 1. 环境准备
- 下载并安装 [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)。
- 确保已安装 Node.js。

### 2. 安装依赖
进入 `miniprogram` 目录并安装依赖：

```bash
cd miniprogram
npm install
```

### 3. 构建 NPM
1. 打开微信开发者工具，导入项目根目录。
2. 在开发者工具菜单栏中选择 `工具` -> `构建 npm`。
3. 等待构建完成。

### 4. 运行
- 确保开发者工具中的 `详情` -> `本地设置` -> `使用 npm 模块` 已勾选。
- 点击 `编译` 即可预览小程序。

## 📖 文档

更多详细设计文档请参考 `docs/` 目录：
- [产品需求文档 (PRD)](docs/prd.md)
- [技术架构 (Tech Arch)](docs/tech_arch.md)

## 📄 开源协议

ISC License
