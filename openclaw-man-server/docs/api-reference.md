# OpenClaw-ManServer API 接口文档

## 基础信息

| 项目 | 值 |
|------|-----|
| 基础 URL | `http://localhost:8811/ocms` |
| WebSocket | `ws://localhost:8811/ocms/v1/stream` |
| API 文档 | `http://localhost:8811/ocms/docs` |

---

## 1. 认证接口

### 1.1 微信小程序登录

```http
POST /ocms/auth/weapp/token
Content-Type: application/json

{
  "grant_type": "weapp_code",
  "code": "微信授权码",
  "appid": "微信AppID(可选)"
}
```

**响应:**
```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "token_type": "bearer",
  "expires_in": 86400,
  "scope": "profile robots"
}
```

### 1.2 刷新 Token

```http
POST /ocms/auth/refresh
Content-Type: application/json

{
  "refresh_token": "eyJ..."
}
```

---

## 2. 机器人管理接口

### 2.1 创建机器人

```http
POST /ocms/robots/
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "name": "机器人名称",
  "description": "描述",
  "icon": "base64图标(可选)"
}
```

### 2.2 获取机器人列表

```http
GET /ocms/robots/
Authorization: Bearer <access_token>
```

### 2.3 获取单个机器人

```http
GET /ocms/robots/{robot_id}
Authorization: Bearer <access_token>
```

### 2.4 更新机器人

```http
PUT /ocms/robots/{robot_id}
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "name": "新名称",
  "description": "新描述"
}
```

### 2.5 删除机器人

```http
DELETE /ocms/robots/{robot_id}
Authorization: Bearer <access_token>
```

---

## 3. 对话管理接口

### 3.1 创建对话

```http
POST /ocms/conversations/
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "robot_id": "robot_123",
  "title": "对话标题(可选)"
}
```

### 3.2 获取对话列表

```http
GET /ocms/conversations/?robot_id=robot_123
Authorization: Bearer <access_token>
```

### 3.3 获取单个对话

```http
GET /ocms/conversations/{conversation_id}
Authorization: Bearer <access_token>
```

### 3.4 更新对话

```http
PUT /ocms/conversations/{conversation_id}
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "title": "新标题"
}
```

### 3.5 删除对话

```http
DELETE /ocms/conversations/{conversation_id}
Authorization: Bearer <access_token>
```

---

## 4. 文件上传接口

### 4.1 上传文件

```http
POST /ocms/upload/file
Content-Type: multipart/form-data

file: <文件数据>
```

**响应:**
```json
{
  "success": true,
  "file_path": "d:/path/to/uploads/image_20240213_143022.jpg",
  "file_name": "image_20240213_143022.jpg",
  "file_size": 102400,
  "content_type": "image/jpeg",
  "message": "文件上传成功"
}
```

---

## 5. 聊天记录接口

### 5.1 获取聊天记录

```http
GET /ocms/chat/history/{user_id}?limit=100&offset=0&conversation_id=xxx
```

**参数:**
| 参数 | 类型 | 说明 |
|------|------|------|
| user_id | string | 用户 ID |
| limit | int | 返回记录数(默认100,最大500) |
| offset | int | 偏移量(默认0) |
| conversation_id | string | 按对话ID过滤(可选) |

**响应:**
```json
{
  "user_id": "123",
  "total": 6,
  "limit": 100,
  "offset": 0,
  "messages": [
    {
      "id": "msg_1707821234567",
      "timestamp": 1707821234567,
      "sender": "user",
      "text": "你好",
      "robot_id": "robot_001",
      "conversation_id": "default"
    },
    {
      "id": "msg_1707821234568",
      "timestamp": 1707821234568,
      "sender": "robot",
      "text": "你好！有什么可以帮助？",
      "robot_id": "robot_001",
      "conversation_id": "default"
    }
  ]
}
```

### 5.2 清空聊天记录

```http
DELETE /ocms/chat/history/{user_id}
```

**响应:**
```json
{
  "success": true,
  "message": "用户 123 的聊天记录已清空"
}
```

---

## 6. WebSocket 接口

### 6.1 连接地址

```
ws://localhost:8811/ocms/v1/stream?token=<token>&robotId=<robot_id>&conversationId=<conversation_id>
```

### 6.2 连接参数

| 参数 | 必填 | 说明 |
|------|------|------|
| token | 是 | JWT access_token |
| robot_id | 是 | 目标机器人 ID |
| conversation_id | 否 | 对话 ID |

### 6.3 客户端发送消息

```json
{
  "text": "你好",
  "conversationId": "conv_001"
}
```

### 6.4 服务端推送消息

```json
{
  "sender": "Robot",
  "robotId": "robot_001",
  "text": "你好！有什么可以帮助？",
  "conversationId": "conv_001"
}
```

### 6.5 心跳

客户端发送:
```json
{
  "type": "ping"
}
```

服务端回复:
```json
{
  "type": "pong"
}
```

---

## 7. 错误码

| 状态码 | 说明 |
|--------|------|
| 200 | 成功 |
| 400 | 请求参数错误 |
| 401 | 未授权 |
| 403 | 禁止访问 |
| 404 | 资源不存在 |
| 413 | 文件太大 |
| 500 | 服务器内部错误 |
