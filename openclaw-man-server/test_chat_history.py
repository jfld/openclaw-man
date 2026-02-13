import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "src"))

from openclaw_man_server.chat_history import get_chat_history_service

async def create_test_history():
    """创建测试聊天记录"""
    chat_service = get_chat_history_service()
    
    test_messages = [
        {"sender": "user", "text": "你好，我想咨询一些问题", "robot_id": "robot_001"},
        {"sender": "robot", "text": "你好！很高兴为您服务，请问有什么可以帮助您的？", "robot_id": "robot_001"},
        {"sender": "user", "text": "这个服务是怎么收费的？", "robot_id": "robot_001"},
        {"sender": "robot", "text": "我们提供按月付费和按年付费两种方案，月付99元，年付999元。", "robot_id": "robot_001"},
        {"sender": "user", "text": "好的，我再考虑一下", "robot_id": "robot_001"},
        {"sender": "robot", "text": "好的，有任何问题随时联系我。", "robot_id": "robot_001"},
    ]
    
    for msg in test_messages:
        await chat_service.save_message(
            user_id="123",
            sender=msg["sender"],
            text=msg["text"],
            robot_id=msg["robot_id"],
            conversation_id="test_conv_001"
        )
        print(f"✓ 保存: {msg['sender']} - {msg['text'][:20]}...")
    
    print("\n✅ 测试聊天记录创建完成！")

if __name__ == "__main__":
    asyncio.run(create_test_history())
