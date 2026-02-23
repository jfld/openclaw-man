import asyncio
import json
import urllib.parse
import websockets
import hashlib
from datetime import datetime
from jose import jwt, JWTError
from websockets.server import serve
import os
from ..config import get_config
from ..logger import get_logger
from ..api_server.database import SessionLocal
from ..api_server import models, auth
from ..chat_history import get_chat_history_service

logger = get_logger("server")

class ManServerServer:
    def __init__(self):
        self.config = get_config()
        self.port = int(os.getenv("WS_PORT", "8812"))
        self.host = "0.0.0.0"
        
        # 连接存储
        # robot_connections: robot_id -> WebSocket 的映射
        self.robot_connections = {}
        # user_connections: 用户ID -> WebSocket 的映射
        self.user_connections = {}
        # user_active_robot: 用户ID -> 当前正在对话的 Robot ID
        self.user_active_robot = {}
        
        # 聊天记录服务
        self.chat_service = get_chat_history_service()

    def validate_api_key(self, api_key: str) -> str | None:
        """
        验证 API Key
        返回 robot_id (如果成功) 或 None
        """
        if not api_key:
            return None
            
        hashed_key = hashlib.md5(api_key.encode()).hexdigest()
        
        db = SessionLocal()
        try:
            # 查询是否存在该哈希值的机器人
            robot = db.query(models.Robot).filter(models.Robot.api_key == hashed_key).first()
            if robot:
                logger.info(f"API Key 验证成功: 机器人 {robot.name} ({robot.robot_id}) Hash: {hashed_key}")
                return robot.robot_id
            else:
                logger.warning(f"API Key 验证失败: {api_key[:10]}... (Hash: {hashed_key})")
                return None
        except Exception as e:
            logger.error(f"数据库验证出错: {e}")
            return None
        finally:
            db.close()

    def verify_token(self, token: str) -> int | None:
        """验证 JWT Token 并返回 user_id"""
        try:
            payload = jwt.decode(token, auth.SECRET_KEY, algorithms=[auth.ALGORITHM])
            user_id: str = payload.get("sub")
            if user_id:
                return int(user_id)
        except JWTError:
            pass
        return None

    async def start(self):
        """启动 WebSocket 服务器。"""
        async with serve(self.handler, self.host, self.port):
            logger.info(f"ManServer 模拟服务器运行在 ws://{self.host}:{self.port}")
            logger.info(f"OpenClaw 应连接到: ws://127.0.0.1:{self.port}/ocms/v1/stream?apiKey=YOUR_KEY")
            await asyncio.Future()  # 永久运行

    async def handler(self, websocket):
        """处理传入的 WebSocket 连接。"""
        # FastAPI WebSocket: websocket.url
        # websockets lib: websocket.path
        if hasattr(websocket, 'path'):
            path = websocket.path
            query = urllib.parse.urlparse(path).query
        else:
            # FastAPI
            url = websocket.url
            path = url.path
            query = url.query
        
        params = urllib.parse.parse_qs(query)
        
        # 规范化路径
        url_path = path
        
        if url_path == "/ocms/v1/stream":
            await self.handle_stream_connection(websocket, params)
        else:
            logger.warning(f"未知路径: {url_path}")
            await websocket.close()

    def is_fastapi_websocket(self, websocket):
        """检测是否为 FastAPI WebSocket"""
        return not hasattr(websocket, 'path')

    async def ws_receive(self, websocket):
        """统一的消息接收方法"""
        if self.is_fastapi_websocket(websocket):
            return await websocket.receive_text()
        else:
            async for msg in websocket:
                return msg

    async def ws_send(self, websocket, data):
        """统一的消息发送方法"""
        if self.is_fastapi_websocket(websocket):
            await websocket.send_text(data)
        else:
            await websocket.send(data)

    async def handle_stream_connection(self, websocket, params):
        # FastAPI WebSocket 使用 client_side 属性
        # 需要从 scope 获取 headers
        headers = {}
        if hasattr(websocket, 'scope') and 'headers' in websocket.scope:
            headers = {k.decode(): v.decode() for k, v in websocket.scope.get('headers', [])}
        
        # 1. 尝试识别 OpenClaw (API Key)
        api_key = params.get("apiKey", [None])[0]
        if not api_key:
            api_key = headers.get("x-api-key") or headers.get("apiKey")

        # 2. 尝试识别用户 (Token)
        token = params.get("token", [None])[0]
        # 如果 Token 不在 query params 中，尝试从 headers 中获取 Authorization
        if not token:
            auth_header = headers.get("authorization")
            if auth_header and auth_header.startswith("Bearer "):
                token = auth_header.split(" ")[1]

        # 用户还需要指定 robotId
        target_robot_id = params.get("robotId", [None])[0]
        # 对话 ID (可选)
        conversation_id = params.get("conversationId", [None])[0]

        if api_key:#机器人连接
            robot_id = api_key #self.validate_api_key(api_key)
            if robot_id:
                await self.handle_openclaw_connection(websocket, robot_id)
            else:
                logger.warning("连接被拒绝: API Key 无效")
                await websocket.close(1008, "无效的 API Key")
        elif token:#用户连接
            user_id = token #self.verify_token(token)
            if user_id:
                if not target_robot_id:
                    logger.warning("连接被拒绝: 用户未指定 robotId")
                    await websocket.close(1008, "缺少 robotId 参数")
                    return
                await self.handle_user_connection(websocket, user_id, target_robot_id, conversation_id)
            else:
                logger.warning("连接被拒绝: Token 无效")
                await websocket.close(1008, "无效的 Token")
        else:
            logger.warning("连接被拒绝: 缺少身份凭证")
            await websocket.close(1008, "缺少身份信息")

    async def handle_openclaw_connection(self, websocket, robot_id):
        logger.info(f"OpenClaw 机器人已连接! ID: {robot_id}")
        self.robot_connections[robot_id] = websocket
        try:
            while True:
                try:
                    message = await self.ws_receive(websocket)
                except Exception:
                    break
                    
                try:
                    data = json.loads(message)
                    logger.info(f"[Robot {robot_id} -> Server] {data}")
                    
                    # OpenClaw 发送回复给用户
                    if data.get("type") == "message":
                        msg_data = data.get("data", {})
                        target_user_id = msg_data.get("recipientId") or msg_data.get("to")
                        # 尝试转换 user_id 为 int (因为数据库 ID 是 int，但 json 可能是 str)
                        try:
                            target_user_id = int(target_user_id)
                        except (ValueError, TypeError):
                            pass
                            
                        text = msg_data.get("text")
                        media_url = msg_data.get("mediaUrl")
                        conversation_id = msg_data.get("conversationId")
                        
                        if target_user_id and (text or media_url):
                            if target_user_id in self.user_connections:
                                user_ws = self.user_connections[target_user_id]
                                await self.ws_send(user_ws, json.dumps({
                                    "sender": "Robot",
                                    "robotId": robot_id,
                                    "text": text,
                                    "mediaUrl": media_url,
                                    "conversationId": conversation_id
                                }))
                                logger.info(f"[Server -> User {target_user_id}] 已转发回复")
                                
                                # 保存机器人的回复到聊天记录
                                asyncio.create_task(
                                    self.chat_service.save_message(
                                        user_id=str(target_user_id),
                                        sender="robot",
                                        text=text,
                                        media_url=media_url,
                                        robot_id=robot_id,
                                        conversation_id=conversation_id,
                                        message_id=f"msg_{datetime.now().timestamp()}"
                                    )
                                )
                            else:
                                logger.warning(f"目标用户 {target_user_id} 未连接")
                                
                except json.JSONDecodeError:
                    logger.error("来自 OpenClaw 的 JSON 无效")
        except websockets.exceptions.ConnectionClosed:
            logger.info(f"OpenClaw 机器人 {robot_id} 已断开连接")
        finally:
            if self.robot_connections.get(robot_id) == websocket:
                del self.robot_connections[robot_id]

    async def handle_user_connection(self, websocket, user_id, robot_id, url_conversation_id=None):
        logger.info(f"用户 {user_id} 已连接 (目标机器人: {robot_id}, 会话: {url_conversation_id})")
        self.user_connections[user_id] = websocket
        self.user_active_robot[user_id] = robot_id
        
        try:
            while True:
                try:
                    message = await self.ws_receive(websocket)
                except Exception:
                    break
                    
                logger.info(f"[User {user_id} -> Server] {message}")

                # 尝试解析消息
                msg_obj = None
                try:
                    msg_obj = json.loads(message)
                except json.JSONDecodeError:
                    pass

                # 处理 Ping 消息 (心跳)
                # 即使机器人不在线，也应该回复 Pong
                if msg_obj and msg_obj.get("type") == "ping":
                    await self.ws_send(websocket, json.dumps({"type": "pong"}))
                    continue
                
                # 检查目标机器人是否在线
                robot_ws = self.robot_connections.get(robot_id)
                if robot_ws:
                    # 解析用户消息
                    # 期望格式: JSON {"text": "...", "conversationId": "...", "filePath": "...", "mediaType": "..."}
                    # 如果不是 JSON，则作为纯文本
                    if msg_obj:
                        text = msg_obj.get("text")
                        file_path = msg_obj.get("filePath")
                        media_type = msg_obj.get("mediaType")
                        # 优先级: 消息体中的 conversationId > URL 参数中的 conversationId > "default"
                        conversation_id = msg_obj.get("conversationId") or url_conversation_id or "default"
                    else:
                        text = message
                        file_path = None
                        media_type = None
                        conversation_id = url_conversation_id or "default"

                    if not text and not file_path:
                        continue

                    payload = {
                        "type": "message",
                        "data": {
                            "userId": str(user_id), # 转换为字符串以兼容
                            "text": text,
                            "conversationId": conversation_id,
                            "id": f"msg_{asyncio.get_event_loop().time()}"
                        }
                    }
                    
                    # 添加文件信息（如果有）
                    if file_path:
                        payload["data"]["filePath"] = file_path
                    if media_type:
                        payload["data"]["mediaType"] = media_type
                    
                    await self.ws_send(robot_ws, json.dumps(payload))
                    logger.info(f"[Server -> Robot {robot_id}] 已转发来自 {user_id} 的消息")
                    
                    # 保存用户消息到聊天记录
                    asyncio.create_task(
                        self.chat_service.save_message(
                            user_id=str(user_id),
                            sender="user",
                            text=text,
                            robot_id=robot_id,
                            conversation_id=conversation_id,
                            message_id=payload["data"]["id"]
                        )
                    )
                else:
                        online_robots = list(self.robot_connections.keys())
                        logger.warning(f"目标机器人 {robot_id} 不在线。当前在线机器人: {online_robots}")
                        await self.ws_send(websocket, json.dumps({
                            "sender": "系统",
                            "text": f"错误: 目标机器人 {robot_id} 不在线。当前在线: {online_robots}",
                            "error": "robot_offline"
                        }))
                    
        except Exception as e:
            logger.info(f"用户 {user_id} 已断开连接: {e}")
        finally:
            if self.user_connections.get(user_id) == websocket:
                del self.user_connections[user_id]
            if self.user_active_robot.get(user_id) == robot_id:
                del self.user_active_robot[user_id]
