import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "src"))

from openclaw_man_server.chat_history import get_chat_history_service

async def test_get_history():
    """测试获取聊天记录"""
    chat_service = get_chat_history_service()
    
    # 获取用户123的聊天记录
    history = await chat_service.get_history(
        user_id="123",
        limit=100,
        offset=0,
        conversation_id=None
    )
    
    print("=" * 60)
    print("📜 用户123的聊天记录查询结果")
    print("=" * 60)
    print(f"总记录数: {len(history)}")
    print()
    
    for msg in history:
        sender_label = "👤 用户" if msg["sender"] == "user" else "🤖 机器人"
        timestamp = msg["timestamp"]
        # 将时间戳转换为可读格式
        from datetime import datetime
        time_str = datetime.fromtimestamp(timestamp).strftime("%H:%M:%S")
        
        print(f"[{time_str}] {sender_label}")
        print(f"  {msg['text']}")
        print()
    
    # 测试按对话ID过滤
    print("=" * 60)
    print("🔍 测试按对话ID过滤 (conversation_id=test_conv_001)")
    print("=" * 60)
    filtered_history = await chat_service.get_history(
        user_id="123",
        limit=100,
        offset=0,
        conversation_id="test_conv_001"
    )
    print(f"过滤后记录数: {len(filtered_history)}")
    print()
    
    # 测试分页
    print("=" * 60)
    print("📄 测试分页 (limit=2, offset=0)")
    print("=" * 60)
    page_history = await chat_service.get_history(
        user_id="123",
        limit=2,
        offset=0
    )
    print(f"分页记录数: {len(page_history)}")
    for msg in page_history:
        print(f"  - {msg['sender']}: {msg['text']}")

if __name__ == "__main__":
    asyncio.run(test_get_history())
