# 对话管理接口文档

本文档描述了 OpenClaw ManServer 提供的对话 (Conversation) 管理接口。这些接口允许用户创建、查询、更新和删除与机器人的对话记录。

## 鉴权

所有接口均需要鉴权。请在请求头中携带 Bearer Token：

```http
Authorization: Bearer <your_access_token>
```

## 数据模型

**Conversation 对象**

| 字段 | 类型 | 说明 |
| :--- | :--- | :--- |
| `id` | string (UUID) | 对话的唯一标识符 |
| `robot_id` | string (UUID) | 关联的机器人 ID |
| `title` | string | 对话主题或标题 |
| `creator_id` | int | 创建该对话的用户 ID |
| `created_at` | datetime | 创建时间 |

## 接口列表

### 1. 创建对话

创建一个新的对话上下文。

*   **URL**: `/conversations/`
*   **Method**: `POST`

**请求体 (JSON):**

```json
{
  "robot_id": "c54896b14e317d18a36d43565c620516", // 必填，目标机器人ID
  "title": "关于订单的咨询" // 选填，对话标题
}
```

**响应 (200 OK):**

```json
{
  "id": "a1b2c3d4e5f6...",
  "robot_id": "c54896b14e317d18a36d43565c620516",
  "title": "关于订单的咨询",
  "creator_id": 101,
  "created_at": "2023-10-27T10:00:00Z"
}
```

### 2. 获取对话列表

获取当前用户创建的所有对话。

*   **URL**: `/conversations/`
*   **Method**: `GET`
*   **Query Parameters**:
    *   `robot_id` (可选): 按机器人 ID 筛选
    *   `skip` (可选): 分页偏移量，默认 0
    *   `limit` (可选): 分页数量，默认 100

**请求示例:**
`GET /conversations/?robot_id=c54896b14e317d18a36d43565c620516`

**响应 (200 OK):**

```json
[
  {
    "id": "a1b2c3d4e5f6...",
    "robot_id": "c54896b14e317d18a36d43565c620516",
    "title": "关于订单的咨询",
    "creator_id": 101,
    "created_at": "2023-10-27T10:00:00Z"
  },
  {
    "id": "f9e8d7c6b5a4...",
    "robot_id": "c54896b14e317d18a36d43565c620516",
    "title": "新对话",
    "creator_id": 101,
    "created_at": "2023-10-28T11:00:00Z"
  }
]
```

### 3. 获取单个对话详情

*   **URL**: `/conversations/{conversation_id}`
*   **Method**: `GET`

**响应 (200 OK):**

```json
{
  "id": "a1b2c3d4e5f6...",
  "robot_id": "c54896b14e317d18a36d43565c620516",
  "title": "关于订单的咨询",
  "creator_id": 101,
  "created_at": "2023-10-27T10:00:00Z"
}
```

### 4. 更新对话信息

目前支持更新对话标题。

*   **URL**: `/conversations/{conversation_id}`
*   **Method**: `PUT`

**请求体 (JSON):**

```json
{
  "title": "更新后的标题"
}
```

**响应 (200 OK):**

```json
{
  "id": "a1b2c3d4e5f6...",
  ...
  "title": "更新后的标题",
  ...
}
```

### 5. 删除对话

*   **URL**: `/conversations/{conversation_id}`
*   **Method**: `DELETE`

**响应 (200 OK):**

```json
{
  "ok": true
}
```
