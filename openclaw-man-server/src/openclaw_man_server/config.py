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
        # 项目根目录是 ../../
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
