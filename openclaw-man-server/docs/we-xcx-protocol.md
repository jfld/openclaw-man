# WE XCX 通道插件功能与协议说明

本文档基于 `index.ts` 源码，详细说明 WE XCX (微信小程序) 通道插件的功能、WebSocket 连接方式以及消息收发协议格式。

## 1. 插件功能概述

`openclaw-man-we-app-channel` 是一个 OpenClaw 的通道插件 (Channel Plugin)，其核心功能包括：

*   **双向通信**: 通过 WebSocket 全双工协议连接到外部聊天服务 (WE XCX Service)。
*   **消息接收**: 监听 WebSocket 消息，将来自外部服务的用户消息转换为 OpenClaw 内部格式，并分发给智能体 (Agent) 处理。
*   **消息回复**: 接收智能体生成的回复，将其封装为特定 JSON 格式，通过 WebSocket 发送回外部服务。
*   **配置管理**: 支持配置 API Key、API Endpoint 以及是否使用 TLS/SSL。

## 2. WebSocket 连接

插件启动时会根据配置建立 WebSocket 连接。

### 连接参数
*   **Protocol**: `wss://` (当 `useTls` 为 `true` 时) 或 `ws://` (当 `useTls` 为 `false` 时)。
*   **Endpoint**: 由配置项 `apiEndpoint` 指定 (例如 `www.xxxxxx.top`)。插件会自动处理并移除 URL 前缀的协议头。
*   **Path**: `/v1/stream`
*   **Query Parameters**:
    *   `apiKey`: 由配置项 `apiKey` 提供，用于身份验证。

### 完整连接 URL 示例
```
wss://www.xxxxxx.top/v1/stream?apiKey=YOUR_API_KEY
```

### 连接生命周期
*   **连接建立**: 插件启动 (`startAccount`) 时自动连接。
*   **断线重连**: 目前代码中主要处理了 `close` 和 `error` 事件的日志记录，未显式实现自动重连逻辑（依赖宿主或重启）。
*   **消息队列**: 在连接建立前发送的消息会被暂存到 `messageQueues` 中，连接成功后自动发送。

## 3. 消息协议格式

通信双方通过 JSON 格式交换数据。

### 3.1 接收消息 (Inbound)

当插件从 WebSocket 收到消息时，期望的数据格式如下：

```json
{
  "type": "message",
  "data": {
    "text": "用户发送的文本内容",
    "userId": "用户的唯一标识ID",
    "conversationId": "对话唯一标识ID (可选，用于串联上下文)",
    "id": "消息ID (可选，默认自动生成)"
  }
}
```

**字段说明**:
*   `type`: 固定为 `"message"`，用于标识消息类型。
*   `data`: 消息载荷对象。
    *   `text`: 必填。用户发送的实际文本内容。
    *   `userId`: 必填。发送消息的微信用户 ID (OpenID 或其他唯一标识)。插件将其映射为 OpenClaw 的 `From` 和 `SenderId`。
    *   `conversationId`: 选填。对话的唯一标识 ID。如果提供，将在回复消息中原样返回。插件将其用作 OpenClaw 的 `ConversationLabel`。
    *   `id`: 选填。消息的唯一 ID。如果未提供，插件将生成格式为 `we-xcx-{timestamp}` 的 ID。

**处理逻辑**:
1.  插件解析 JSON。
2.  提取 `text`, `userId`, `conversationId`, `id`。
3.  构建 OpenClaw 上下文 (`ctxPayload`)，其中 `From` 被设置为 `we-xcx:{userId}`，`ConversationLabel` 被设置为 `conversationId` (若未提供则默认为 "default")。
4.  调用 `core.channel.reply.dispatchReplyFromConfig` 将消息路由给配置的 Agent。

### 3.2 发送消息 (Outbound)

当 Agent 生成回复后，插件会将其封装为以下格式通过 WebSocket 发送：

```json
{
  "type": "message",
  "data": {
    "text": "Agent 回复的文本内容",
    "recipientId": "接收消息的用户ID",
    "conversationId": "原消息中的对话ID"
  }
}
```

**字段说明**:
*   `type`: 固定为 `"message"`。
*   `data`: 消息载荷对象。
    *   `text`: Agent 生成的回复文本。
    *   `recipientId`: 对应接收消息时的 `userId`，确保消息回复给正确的用户。
    *   `conversationId`: 对应接收消息时的 `conversationId`，用于客户端匹配对话上下文。

## 4. 配置项说明

在 `openclaw.plugin.json` 中定义的配置项：

| 配置项 | 类型 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `apiKey` | string | - | **必填**。用于 WebSocket 连接鉴权的 API Key。 |
| `apiEndpoint` | string | `www.xxxxxx.top` | WebSocket 服务地址 (域名或 IP:Port)。 |
| `useTls` | boolean | `true` | 是否使用 SSL/TLS 加密连接 (wss)。 |

## 5. 错误处理

*   **JSON 解析失败**: 如果收到非 JSON 格式的消息，插件会记录警告日志并忽略该消息。
*   **缺少必要字段**: 如果消息缺少 `data` 或 `text`，插件会记录警告并忽略。
*   **连接错误**: `ws` 客户端的错误事件会被捕获并记录到日志中。
