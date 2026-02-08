import logging
import logging.config
import os
from typing import Optional

def setup_logging(config: dict) -> None:
    """
    使用 dictConfig 设置日志配置。
    """
    logging_config = config.get("logging", {})
    if logging_config:
        # 确保存储日志的目录存在
        handlers = logging_config.get("handlers", {})
        for handler in handlers.values():
            if "filename" in handler:
                log_file = handler["filename"]
                log_dir = os.path.dirname(log_file)
                if log_dir and not os.path.exists(log_dir):
                    os.makedirs(log_dir)
                    
        logging.config.dictConfig(logging_config)
    else:
        logging.basicConfig(level=logging.INFO)

def get_logger(name: Optional[str] = None) -> logging.Logger:
    """
    获取日志记录器实例。
    """
    return logging.getLogger(name or "openclaw_man_server")
