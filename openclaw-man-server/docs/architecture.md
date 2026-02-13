# OpenClaw-ManServer 系统架构

## 1. 系统架构图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              客户端                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│  微信小程序                                                            OpenClaw │
│  ┌──────────────┐                                                    ┌──────────────┐ │
│  │   WebSocket │ ◄─────────────────────────────► │   WebSocket    │ │
│  │   客户端     │                                    │   (API Key)   │ │
│  └──────────────┘                                    └──────────────┘ │
│        │                                                    │              │
│        │ HTTP/WebSocket                                    │              │
│        ▼                                                    ▼              │
└────────┼────────────────────────────────────────────────────┼──────────────┘
         │                                                    │
         │                    ┌──────────────────────────────┐ │
         │                    │     OpenClaw-ManServer       │ │
         │                    │         :8811               │ │
         │                    │  ┌─────────────────────────┐│ │
         │                    │  │    FastAPI + Uvicorn    ││ │
         │                    │  │                         ││ │
         │                    │  │  ┌───────────────────┐ ││ │
         │                    │  │  │   API Endpoints   │ ││ │
         │                    │  │  │   /ocms/...       │ ││ │
         │                    │  │  └───────────────────┘ ││ │
         │                    │  │  ┌───────────────────┐ ││ │
         │                    │  │  │ WebSocket Handler │ ││ │
         │                    │  │  │ /ocms/v1/stream   │ ││ │
         │                    │  │  └───────────────────┘ ││ │
         │                    │  └─────────────────────────┘│ │
         │                    │              │               │ │
         │                    │              ▼               │ │
         │                    │  ┌─────────────────────────┐│ │
         │                    │  │    Bridge Service     ││ │
         │                    │  │  - 用户连接管理        ││ │
         │                    │  │  - 机器人连接管理      ││ │
         │                    │  │  - 消息转发            ││ │
         │                    │  │  - 聊天记录存储        ││ │
         │                    │  └─────────────────────────┘│ │
         │                    └──────────────────────────────┘ │
         │                              │                        │
         │              ┌───────────────┼───────────────┐       │
         │              ▼               ▼               ▼       │
│        │     ┌─────────────┐  ┌───────────┐  ┌───────────┐ │
│        │     │  聊天记录   │  │  文件上传  │  │  数据库   │ │
│        │     │  (JSON)    │  │  (Uploads)│  │ (MySQL)   │ │
│        │     │chat_history │  │           │  │           │ │
│        │     │user_123.json│  │           │  │  robots   │ │
│        │     └─────────────┘  └───────────┘  │  users   │ │
│        │                                     │conversations│ │
└────────┴─────────────────────────────────────┴───────────┘─┘
```

## 2. 核心模块说明

### 2.1 API Server (FastAPI)
| 模块 | 文件 | 功能 |
|------|------|------|
| api.py | `api_server/api.py` | REST API 路由处理 |
| auth.py | `api_server/auth.py` | JWT 认证、微信登录 |
| crud.py | `api_server/crud.py` | 数据库增删改查 |
| models.py | `api_server/models.py` | SQLAlchemy 数据模型 |
| schemas.py | `api_server/schemas.py` | Pydantic 数据验证 |
| database.py | `api_server/database.py` | 数据库连接 |

### 2.2 WebSocket Server
| 模块 | 文件 | 功能 |
|------|------|------|
| bridge.py | `ws_server/bridge.py` | WebSocket 消息桥接、连接管理 |

### 2.3 核心服务
| 模块 | 文件 | 功能 |
|------|------|------|
| main.py | `main.py` | 服务入口、启动配置 |
| config.py | `config.py` | 配置管理 |
| logger.py | `logger.py` | 日志管理 |
| chat_history.py | `chat_history.py` | 聊天记录存储服务 |

## 3. 数据流

### 3.1 用户发送消息流程
```
用户 WebSocket → Bridge → 验证 Token → 保存聊天记录 → 转发到机器人
```

### 3.2 机器人回复流程
```
机器人 WebSocket → Bridge → 转发到用户 → 保存聊天记录
```

## 4. 端口配置

| 端口 | 服务 | 协议 |
|------|------|------|
| 8811 | API + WebSocket | HTTP + WebSocket |

## 5. 目录结构

```
openclaw-man-server/
├── config/
│   └── settings.yaml          # 配置文件
├── src/
│   └── openclaw_man_server/
│       ├── api_server/        # REST API
│       │   ├── api.py
│       │   ├── auth.py
│       │   ├── crud.py
│       │   ├── database.py
│       │   ├── models.py
│       │   └── schemas.py
│       ├── ws_server/         # WebSocket 服务
│       │   └── bridge.py
│       ├── chat_history.py    # 聊天记录服务
│       ├── config.py          # 配置管理
│       ├── logger.py          # 日志
│       └── main.py             # 入口
├── chat_history/              # 聊天记录存储
│   └── user_{user_id}.json
├── uploads/                   # 上传文件存储
├── pyproject.toml
└── README.md
```
