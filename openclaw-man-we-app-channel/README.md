# OpenClaw cloud-bot-channel Channel Plugin

这是一个 OpenClaw 的 cloud-bot-channel 渠道集成插件。

## 🛠 开发指南

### 前置条件
- Node.js (推荐 v18+)
- npm

### 安装依赖
```bash
npm install
```

### 编译项目
```bash
npm run build
```
编译后的文件位于 `dist/` 目录。

### 运行单元测试
```bash
npm test
```

### 打包插件
使用提供的脚本将插件打包为 zip 文件，以便在 OpenClaw 中安装。
```bash
chmod +x package_plugin.sh
./package_plugin.sh
```
打包成功后，生成的插件包位于 `channel/cloud-bot-channel.zip`。

## 🚀 运行说明

本项目是一个 OpenClaw 插件，不能独立运行。请按照以下步骤在 OpenClaw 中安装并运行插件：

1. **安装插件**
   ```bash
   openclaw plugins install channel/cloud-bot-channel.zip
   ```

2. **配置 OpenClaw**
   在微信小程序添加机器人后，将复制的内容添加到用户目录下的 `.openclaw/openclaw.json` 文件中。
   
   配置示例：
   ```json
   ,
   "plugins": {
     "entries": {
       "cloud-bot-channel": {
         "enabled": true,
         "config": {
           "apiKey": "sk-api-xxxxxxx",
           "apiEndpoint": "www.xxxxxx.top/ocms",
           "useTls": true
         }
       }
     }
   }
   ```

3. **重新运行 OpenClaw**
   ```bash
   openclaw
   ```

4. **验证安装**
   看到连接正常日志，说明安装成功：
   ```text
   🦞 OpenClaw  2026.1.30 (76b5208) — Chat APIs that don't require a Senate hearing.
   
   11:28:13 [canvas] host mounted at http://127.0.0.1:18789/__openclaw__/canvas/ (root C:\Users\admin\.openclaw\canvas)
   11:28:13 [heartbeat] started
   11:28:13 [gateway] agent model: minimax/MiniMax-M2.1
   11:28:13 [gateway] listening on ws://127.0.0.1:18789 (PID 9264)
   11:28:13 [gateway] listening on ws://[::1]:18789
   11:28:13 [gateway] log file: \tmp\openclaw\openclaw-2026-02-08.log
   11:28:13 [browser/service] Browser control service ready (profiles=2)
   11:28:13 [cloud-bot-channel] 正在连接到 wss://www.xxxxxx.top/ocms/v1/stream?apiKey=sk-api-xxxxxxx...
   11:28:13 [cloud-bot-channel] 已连接！
   11:28:56 [ws] webchat connected conn=46afc5d5-a994-4bad-b758-20962c0c5f7d remote=127.0.0.1 client=openclaw-control-ui webchat vdev
   ```

## 🧪 测试运行 (Integration Test)

`test/` 目录下包含一个模拟客户端脚本，用于测试与 OpenClaw 服务的 WebSocket 连接和消息交互。

### 运行测试客户端

使用 `run-client.sh` 脚本启动测试客户端。你需要提供一个有效的 `API_KEY`。

```bash
chmod +x test/run-client.sh
# 用法: ./test/run-client.sh <API_KEY>
./test/run-client.sh YOUR_API_KEY_HERE
```

### 环境变量配置

测试客户端支持通过环境变量进行自定义配置：

- `API_KEY`: (必须) OpenClaw 提供的 API Key。
- `API_ENDPOINT`: (可选) OpenClaw 服务地址，默认为 `127.0.0.1:8080/ocms`。
- `USE_TLS`: (可选) 是否使用 TLS (wss)，设置为 `true` 开启，默认为 `false`。

### 手动运行示例

如果你想自定义 endpoint 或使用 TLS，可以直接运行 node 命令：

```bash
# 连接到远程服务器并使用 TLS
export API_KEY="your_api_key"
export API_ENDPOINT="your.server.com/ocms"
export USE_TLS="true"

node test/test-client.js
```

### 客户端行为
- 连接成功后，客户端会监听 WebSocket 消息。
- 当收到 `type: 'message'` 的消息时，会自动回复一条确认消息 (Echo)。
- 支持断线自动重连。
