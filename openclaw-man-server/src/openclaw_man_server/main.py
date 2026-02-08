import asyncio
import sys
import os
from dotenv import load_dotenv

# 在导入其他应用模块之前加载 .env 文件，确保环境变量生效
load_dotenv()

import uvicorn
from .config import get_config
from .logger import setup_logging, get_logger
from .ws_server.bridge import ManServerServer
from .api_server.api import app as api_app

def main():
    # 加载配置
    try:
        config = get_config()
    except Exception as e:
        print(f"无法加载配置: {e}")
        # 如果配置失败，使用空字典继续
        config = {}

    # 设置日志
    setup_logging(config)
    logger = get_logger("main")
    
    logger.info("正在启动 ManServer 服务...")
    
    # 初始化 WebSocket 服务器
    ws_server = ManServerServer()
    
    # 准备 API 服务器配置
    # API 默认运行在 8811 端口，可通过环境变量 API_PORT 修改
    api_port = int(os.getenv("API_PORT", "8811"))
    api_config = uvicorn.Config(api_app, host="0.0.0.0", port=api_port, log_level="info")
    api_server = uvicorn.Server(api_config)

    async def run_services():
        # 同时运行 WS Server 和 API Server
        logger.info(f"正在启动 API Server (端口 {api_port}) 和 WebSocket Server (端口 {ws_server.port})...")
        try:
            await asyncio.gather(
                ws_server.start(),
                api_server.serve()
            )
        except asyncio.CancelledError:
            logger.info("服务任务已取消")

    try:
        asyncio.run(run_services())
    except KeyboardInterrupt:
        logger.info("正在停止服务器...")
    except Exception as e:
        logger.critical(f"致命错误: {e}", exc_info=True)
        sys.exit(1)

if __name__ == "__main__":
    main()
