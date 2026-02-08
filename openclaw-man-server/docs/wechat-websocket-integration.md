# 微信小程序 WebSocket 对接指南

本文档描述了微信小程序如何连接到 OpenClaw ManServer 的实时消息通道。

## 1. 连接地址

* **URL**: `ws://<your-server-ip>:8812/v1/stream`

* **协议**: WebSocket

* **连接参数**: 需要在URL中携带 `robotId` 和可选的 `conversationId`

### 连接URL格式

```
ws://127.0.0.1:8812/v1/stream?robotId=<机器人ID>&conversationId=<会话ID>
```

**参数说明:**

* `robotId` (必需): 机器人在系统中的唯一标识

* `conversationId` (可选): 会话ID，用于保持对话上下文。如果不提供，系统会自动创建新的会话

**示例:**

```
ws://127.0.0.1:8812/v1/stream?robotId=robot_123&conversationId=conv_456
```

## 2. 鉴权机制

为了安全起见，所有连接必须经过身份验证。

### 用户Token认证 (推荐)

用户使用Token进行身份验证，Token应通过登录接口获取。

### 方式 A: 通过 URL 参数 (推荐用于开发调试)

在 WebSocket URL 后直接拼接 `token` 参数。

```
ws://127.0.0.1:8812/v1/stream?robotId=robot_123&token=user_token_abc123
```

### 方式 B: 通过请求头 (推荐用于生产环境)

由于微信小程序 `wx.connectSocket` 支持自定义 header，建议将用户Token放在 header 中，避免 URL 泄露。

**Header Key**: `Authorization` 或 `token`

**小程序代码示例:**

```javascript
const userToken = 'user_token_abc123';
const robotId = 'robot_123';
const conversationId = 'conv_456'; // 可选

wx.connectSocket({
  url: `ws://127.0.0.1:8812/v1/stream?robotId=${robotId}&conversationId=${conversationId}`,
  header: {
    'Authorization': `Bearer ${userToken}`
  },
  success: () => {
    console.log('WebSocket 连接请求发送成功');
  }
});
```

> **重要说明**:
>
> 1. **API Key仅用于机器人服务端**，不应用于最终用户的身份验证
> 2. 用户应使用通过登录获取的Token进行身份验证
> 3. 服务器会验证用户Token的有效性，确保用户有权限访问指定的机器人

## 3. 消息协议

### 3.1 发送消息 (小程序 -> 服务器)

连接建立后，直接发送 JSON 字符串。

**格式:**

```json
{
  "type": "message",
  "text": "你好，机器人"
}
```

> **注意**: 由于 `conversationId` 已在URL参数中提供，消息体内不再需要包含会话标识

### 3.2 接收消息 (服务器 -> 小程序)

服务器推送的消息也是 JSON 格式。

**格式:**

```json
{
  "type": "message",
  "sender": "robot", // 消息发送者
  "text": "收到你的消息了",
  "timestamp": 1704700000
}
```

## 4. 心跳保活

建议小程序端每隔 30 秒发送一次心跳包，防止连接因长时间空闲被断开。

```javascript
// 心跳示例
setInterval(() => {
  wx.sendSocketMessage({
    data: JSON.stringify({ type: "ping" })
  });
}, 30000);
```

