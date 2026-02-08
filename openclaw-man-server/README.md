# OpenClaw Man Server

OpenClaw Man Server 是一个基于 Python 的后端服务，旨在为 ManServer 提供自定义的 OpenClaw 通道集成。它集成了 REST API 和 WebSocket 服务，用于处理即时通讯和数据交互。

## 🛠 技术栈

- **语言**: Python 3.11+
- **Web 框架**: FastAPI
- **WebSocket**: websockets
- **数据库 ORM**: SQLAlchemy (配合 PyMySQL)
- **依赖管理**: uv
- **认证**: python-jose (JWT), passlib
- **容器化**: Docker

## 📂 项目结构

```
openclaw-man-server/
├── config/                 # 配置文件
│   └── settings.yaml       # 应用配置文件
├── docs/                   # 项目文档
├── src/
│   └── openclaw_man_server/
│       ├── api_server/     # REST API 模块 (Models, Schemas, CRUD, API路由)
│       ├── ws_server/      # WebSocket 服务模块
│       ├── config.py       # 配置加载逻辑
│       ├── database.py     # 数据库连接与会话管理
│       └── main.py         # 程序主入口
├── tests/                  # 测试用例
├── docker-compose.yml      # Docker 服务编排
├── Dockerfile              # Docker 镜像构建文件
└── pyproject.toml          # 项目依赖与元数据
```

## ⚙️ 配置说明

基础配置位于 `config/settings.yaml`。在运行时，可以通过环境变量进行覆盖（尤其是在 Docker 环境中）。

### 关键环境变量

| 环境变量 | 默认值/示例 | 说明 |
| --- | --- | --- |
| `API_PORT` | `8811` | HTTP API 服务监听端口 |
| `WS_PORT` | `8812` | WebSocket 服务监听端口 |
| `DB_HOST` | `openclaw-man-mysql` | MySQL 数据库主机地址 |
| `DB_PORT` | `3306` | MySQL 端口 |
| `DB_USER` | `root` | 数据库用户名 |
| `DB_PASSWORD` | `Xiaomi@123123` | 数据库密码 |
| `DB_NAME` | `openclaw_man` | 数据库名称 |

## 🚀 本地开发

### 1. 环境准备

确保已安装以下工具：
- [Python](https://www.python.org/) (>= 3.11)
- [uv](https://github.com/astral-sh/uv) (推荐的 Python 包管理器)
- MySQL (>= 8.0)

### 2. 安装依赖

使用 `uv` 同步项目依赖：

```bash
uv sync
```

### 3. 本地运行

确保本地或远程 MySQL 数据库可用，并配置好环境变量（或修改 `config/settings.yaml`）。

```bash
# 运行服务
uv run python3 -m openclaw_man_server.main
```

服务启动后：
- API 服务地址: `http://localhost:8811`
- WebSocket 服务地址: `ws://localhost:8812`

## 🐳 Docker 部署

项目包含完整的 `Dockerfile` 和 `docker-compose.yml`，支持一键部署。

### 1. 构建镜像

```bash
docker build -t openclaw-man-server:0.1.0 .
# 或者使用提供的脚本（如果有）
# ./build.sh
```

### 2. 启动服务

使用 Docker Compose 启动应用和数据库服务：

```bash
docker-compose up -d
```

此命令将启动两个容器：
1. **openclaw-man-server**: 应用主服务
2. **openclaw-man-mysql**: MySQL 8.0 数据库服务

### 3. 常用命令

```bash
# 查看服务日志
docker-compose logs -f

# 停止服务
docker-compose down

# 重启服务
docker-compose restart
```

## 📚 文档

更多开发细节请参考 `docs/` 目录下的文档：
- [API 对话接口说明](docs/api-conversations.md)
- [微信集成协议](docs/we-xcx-protocol.md)
- [微信 WebSocket 集成](docs/wechat-websocket-integration.md)
