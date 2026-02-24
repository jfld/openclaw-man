from ast import main
import json
import asyncio
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import List, Optional

try:
    from .config import get_config
except ImportError:
    from openclaw_man_server.config import get_config

class ChatHistoryService:
    def __init__(self):
        self.config = get_config()
        self.chat_dir = self._get_chat_directory()
        self.lock = asyncio.Lock()
        self.max_records = 100
    
    def _get_chat_directory(self) -> Path:
        """获取聊天记录存储目录"""
        chat_config = self.config.get("chat_history", {})
        chat_dir = chat_config.get("directory", "./chat_history")
        
        if not Path(chat_dir).is_absolute():
            current_dir = Path(__file__).parent.parent.parent
            chat_dir = current_dir / chat_dir
        
        chat_dir.mkdir(parents=True, exist_ok=True)
        return chat_dir
    
    def _get_user_chat_file(self, user_id: str) -> Path:
        """获取用户的聊天记录文件路径"""
        return self.chat_dir / f"user_{user_id}.json"
    
    async def save_message(
        self, 
        user_id: str, 
        sender: str,  # "user" 或 "robot"
        text: str,
        media_url: Optional[str] = None,
        robot_id: Optional[str] = None,
        conversation_id: Optional[str] = None,
        message_id: Optional[str] = None
    ):
        """保存单条聊天记录"""
        async with self.lock:
            try:
                file_path = self._get_user_chat_file(user_id)
                
                # 读取现有记录
                messages = await self._read_messages(file_path)
                
                # 创建新消息
                new_message = {
                    "id": message_id or f"msg_{int(datetime.now().timestamp())}",
                    "timestamp": int(datetime.now().timestamp()),
                    "sender": sender,  # "user" 或 "robot"
                    "text": text,
                    "robot_id": robot_id,
                    "conversation_id": conversation_id or "default"
                }
                
                # 添加新消息
                messages.append(new_message)
                
                # 只保留最近的100条记录
                if len(messages) > self.max_records:
                    messages = messages[-self.max_records:]
                
                # 写回文件
                with open(file_path, "w", encoding="utf-8") as f:
                    json.dump(messages, f, ensure_ascii=False, indent=2)
                    
            except Exception as e:
                # 记录错误但不中断主流程
                print(f"保存聊天记录失败: {e}")
    
    async def _read_messages(self, file_path: Path) -> List[dict]:
        """读取聊天记录"""
        if not file_path.exists():
            return []
        
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                content = f.read().strip()
                if not content:
                    return []
                return json.loads(content)
        except (json.JSONDecodeError, FileNotFoundError):
            return []
    
    async def get_history(
        self, 
        user_id: str, 
        limit: Optional[int] = None,
        offset: int = 0,
        conversation_id: Optional[str] = None
    ) -> List[dict]:
        """获取用户聊天记录"""
        file_path = self._get_user_chat_file(user_id)
        messages = await self._read_messages(file_path)
        
        # 如果指定了 conversation_id，过滤出该对话的记录
        if conversation_id:
            messages = [m for m in messages if m.get("conversation_id") == conversation_id]
        
        # 应用分页
        limit = limit or self.max_records
        return messages[offset:offset + limit]
    
    async def clear_history(self, user_id: str):
        """清空用户聊天记录"""
        file_path = self._get_user_chat_file(user_id)
        if file_path.exists():
            file_path.unlink()

# 单例实例
_chat_history_service = None

def get_chat_history_service() -> ChatHistoryService:
    global _chat_history_service
    if _chat_history_service is None:
        _chat_history_service = ChatHistoryService()
    return _chat_history_service
