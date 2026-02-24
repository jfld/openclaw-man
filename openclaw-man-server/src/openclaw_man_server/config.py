import yaml
import os
from pathlib import Path

def load_config(config_path: str = None) -> dict:
    """
    从 YAML 文件加载配置。
    
    如果未提供 config_path，则尝试查找相对于项目根目录的 config/settings.yaml。
    """
    if config_path:
        path = Path(config_path)
    else:
        # 假设当前文件在 src/openclaw_man_server/config.py
        # 项目根目录是 ../.. /
        current_dir = Path(__file__).parent
        project_root = current_dir.parent.parent
        path = project_root / "config" / "settings.yaml"
    
    if not path.exists():
        raise FileNotFoundError(f"未在 {path} 找到配置文件")
        
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)

# 单例模式访问配置
_config = None

def get_config() -> dict:
    global _config
    if _config is None:
        _config = load_config()
    return _config

def get_upload_config() -> dict:
    """
    获取上传配置，如果没有配置则返回默认配置
    """
    config = get_config()
    upload_config = config.get("upload", {})
    
    default_config = {
        "enabled": True,
        "directory": "./uploads",
        "max_file_size": 10 * 1024 * 1024,  # 10MB
        "allowed_extensions": [".jpg", ".jpeg", ".png", ".gif", ".pdf", ".doc", ".docx", ".txt", ".mp4", ".mov"]
    }
    
    # 合并配置
    for key in default_config:
        if key not in upload_config:
            upload_config[key] = default_config[key]
    
    return upload_config

def ensure_upload_directory(user_id: str = None) -> Path:
    """
    确保上传目录存在，返回目录路径
    如果提供了 user_id，则返回该用户的子目录
    """
    upload_config = get_upload_config()
    upload_dir = Path(upload_config["directory"])
    
    if not upload_dir.is_absolute():
        # 如果是相对路径，相对于项目根目录
        current_dir = Path(__file__).parent
        project_root = current_dir.parent.parent
        upload_dir = project_root / upload_config["directory"]
    
    if user_id:
        upload_dir = upload_dir / str(user_id)
    
    upload_dir.mkdir(parents=True, exist_ok=True)
    return upload_dir
