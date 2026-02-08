# 微信小程序对接指南

本文档详细描述了 OpenClaw ManServer 为微信小程序提供的 API 接口，包括用户登录鉴权、令牌刷新以及机器人的增删改查功能。

## 1. 认证与鉴权

本系统采用标准的 OAuth2 Bearer Token 机制进行鉴权。

### 1.1 核心流程

1.  **登录**：小程序端调用 `wx.login` 获取 `code`，发送给后端换取 `access_token` 和 `refresh_token`。
2.  **请求**：后续所有业务接口（如机器人管理）均需在请求头携带 `Authorization: Bearer <access_token>`。
3.  **刷新**：当 `access_token` 过期时，使用 `refresh_token` 换取新的令牌对。

### 1.2 接口详情

#### A. 登录换取令牌

*   **接口地址**: `POST /auth/weapp/token`
*   **功能**: 使用微信 code 换取登录凭证。

**请求体 (JSON):**

```json
{
  "grant_type": "weapp_code",  // 固定值
  "code": "091xxxxxx",         // wx.login 获取的 code
  "appid": "wx1234567890"      // (可选) 小程序 AppID
}
```

**响应体 (JSON):**

```json
{
  "access_token": "eyJhbGciOiJIUzI1Ni...",
  "refresh_token": "eyJhbGciOiJIUzI1Ni...",
  "token_type": "bearer",
  "expires_in": 7200,          // 访问令牌有效期 (秒)
  "scope": "profile robots"
}
```

#### B. 刷新令牌

*   **接口地址**: `POST /auth/refresh`
*   **功能**: 刷新过期的访问令牌（建议在 401 错误或令牌即将过期时调用）。

**请求体 (JSON):**

```json
{
  "refresh_token": "eyJhbGciOiJIUzI1Ni..." // 上次登录或刷新获取的 refresh_token
}
```

**响应体 (JSON):**

*   注意：会返回**新**的 `refresh_token`，旧的将失效（令牌轮换机制）。

```json
{
  "access_token": "new_access_token_...",
  "refresh_token": "new_refresh_token_...",
  "token_type": "bearer",
  "expires_in": 7200
}
```

---

## 2. 机器人管理

所有机器人接口均需要鉴权。只能操作当前用户创建的机器人。

**公共请求头:**
```http
Authorization: Bearer <your_access_token>
```

### 2.1 获取机器人列表

*   **接口地址**: `GET /robots/`
*   **参数**:
    *   `skip` (query, int): 跳过数量，默认 0
    *   `limit` (query, int): 返回数量，默认 100

**响应示例:**

```json
[
  {
    "id": 1,
    "robot_id": "c54896b14e317d18a36d43565c620516",
    "name": "我的客服机器人",
    "description": "用于回答常见问题",
    "creator_id": 101,
    "creator_name": "微信用户",
    "created_at": "2023-10-27T10:00:00Z",
    "updated_at": "2023-10-27T10:00:00Z"
  }
]
```

### 2.2 创建机器人

*   **接口地址**: `POST /robots/`
*   **注意**: 只有在创建成功时，才会返回 API Key。请务必妥善保存。

**请求体 (JSON):**

```json
{
  "name": "新机器人",
  "description": "测试用"
}
```

**响应示例:**

```json
{
  "id": 2,
  "robot_id": "a1b2c3d4e5f6...",
  "name": "新机器人",
  "description": "测试用",
  "api_key": "sk-api-JJco7oV4rlxVRC22eiJtXZuf02acvXO1a7bAIGzDqfQOfaL77tgG", // 重要！
  "creator_id": 101,
  "created_at": "..."
}
```

### 2.3 获取单个机器人详情

*   **接口地址**: `GET /robots/{robot_id}`
*   **说明**: 响应内容不包含 api_key。

### 2.4 更新机器人信息

*   **接口地址**: `PUT /robots/{robot_id}`

**请求体 (JSON):**

```json
{
  "name": "更新后的名称",
  "description": "更新后的描述"
}
```

### 2.5 删除机器人

*   **接口地址**: `DELETE /robots/{robot_id}`

**响应:** `200 OK`

---

## 3. 小程序端对接示例 (参考代码)

建议封装一个 `request.js` 模块来处理自动鉴权和刷新。

```javascript
// auth.js
const API_BASE = "https://your-api.com";

export async function loginAndGetToken() {
  // 1. 微信登录
  const { code } = await wx.login();

  // 2. 换取令牌
  const res = await wx.request({
    url: `${API_BASE}/auth/weapp/token`,
    method: 'POST',
    data: {
      grant_type: 'weapp_code',
      code
    }
  });

  if (res.statusCode === 200) {
    const { access_token, refresh_token, expires_in } = res.data;
    wx.setStorageSync('access_token', access_token);
    wx.setStorageSync('refresh_token', refresh_token);
    // 提前 60 秒视为过期
    wx.setStorageSync('token_expires_at', Date.now() + (expires_in - 60) * 1000);
    return access_token;
  } else {
    throw new Error("Login failed");
  }
}

// request.js
import { loginAndGetToken } from './auth';

async function ensureToken() {
  let token = wx.getStorageSync('access_token');
  const expiresAt = wx.getStorageSync('token_expires_at') || 0;

  // 令牌不存在或已过期
  if (!token || Date.now() > expiresAt) {
    const refreshToken = wx.getStorageSync('refresh_token');
    
    // 尝试刷新
    if (refreshToken) {
      try {
        const res = await wx.request({
          url: `${API_BASE}/auth/refresh`,
          method: 'POST',
          data: { refresh_token: refreshToken }
        });
        
        if (res.statusCode === 200) {
          const { access_token, refresh_token, expires_in } = res.data;
          wx.setStorageSync('access_token', access_token);
          wx.setStorageSync('refresh_token', refresh_token);
          wx.setStorageSync('token_expires_at', Date.now() + (expires_in - 60) * 1000);
          return access_token;
        }
      } catch (e) {
        console.error("Token refresh failed", e);
      }
    }
    
    // 刷新失败或无 refresh token，重新登录
    token = await loginAndGetToken();
  }
  return token;
}

export async function request({ url, method = 'GET', data }) {
  const token = await ensureToken();
  
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE}${url}`,
      method,
      data,
      header: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      success: (res) => {
        if (res.statusCode === 401) {
          // 极端情况：token 失效，可在此处触发重试逻辑
          // 清除缓存并重试...
        }
        resolve(res.data);
      },
      fail: reject
    });
  });
}
```
