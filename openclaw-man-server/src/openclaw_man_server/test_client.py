import asyncio
import websockets
import json
import sys
from jose import jwt
from datetime import datetime, timedelta

# 配置 (与服务端保持一致)
SECRET_KEY = "your-secret-key-keep-it-secret"
ALGORITHM = "HS256"

# 目标机器人 ID (用户提供的)
TARGET_ROBOT_ID = "a5fec859066f42b3a3072a49f5322260"

def create_test_token(user_id=101):
    """生成测试用的 JWT Token"""
    expire = datetime.utcnow() + timedelta(hours=1)
    to_encode = {
        "sub": str(user_id),
        "type": "access",
        "exp": expire
    }
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def client():
    # 1. 准备连接参数
    user_id = 999  # 测试用户 ID
    token = create_test_token(user_id)
    robot_id = TARGET_ROBOT_ID
    conversation_id = f"conv_{int(asyncio.get_event_loop().time())}"
    
    # 2. 构建 WebSocket URL
    # 注意: 参数 token 和 robotId, 还有 conversationId
    uri = f"ws://127.0.0.1:8811/ocms/v1/stream?token={token}&robotId={robot_id}&conversationId={conversation_id}"
    
    print(f"--- 用户测试客户端 ---")
    print(f"用户 ID: {user_id}")
    print(f"目标机器人 ID: {robot_id}")
    print(f"对话 ID: {conversation_id}")
    print(f"正在连接到: {uri} ...")
    
    try:
        async with websockets.connect(uri) as websocket:
            print(f"✅ 连接成功! 现在可以与机器人对话了。")
            
            async def receive():
                try:
                    async for message in websocket:
                        try:
                            data = json.loads(message)
                            sender = data.get("sender", "未知")
                            text = data.get("text", "")
                            
                            # 打印接收到的消息
                            print(f"\n[{sender}] {text}")
                            print("> ", end="", flush=True)
                        except json.JSONDecodeError:
                            print(f"\n[原始数据] {message}")
                            print("> ", end="", flush=True)
                except websockets.exceptions.ConnectionClosed as e:
                    print(f"\n连接断开: {e.code} {e.reason}")

            async def send():
                loop = asyncio.get_event_loop()
                print("> ", end="", flush=True)
                while True:
                    # 读取控制台输入
                    msg = await loop.run_in_executor(None, sys.stdin.readline)
                    if not msg:
                        break
                    msg = msg.strip()
                    if msg:
                        # 构造消息负载 (这里不再需要在消息体中携带 conversationId，因为 URL 已经有了)
                        # 当然，如果消息体里带了，会覆盖 URL 的
                        payload = {
                            "text": msg
                        }
                        # 发送 JSON 字符串
                        await websocket.send(json.dumps(payload))
                    print("> ", end="", flush=True)

            # 并发运行接收和发送任务
            try:
                await asyncio.gather(receive(), send())
            except Exception as e:
                # 忽略连接关闭错误
                pass
            
    except Exception as e:
        print(f"❌ 连接失败: {e}")

if __name__ == "__main__":
    try:
        asyncio.run(client())
    except KeyboardInterrupt:
        print("\n正在退出...")
