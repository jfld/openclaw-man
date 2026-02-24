from fastapi import FastAPI, Depends, HTTPException, status, APIRouter, UploadFile, File, Query, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import inspect, text
from typing import List, Optional
from contextlib import asynccontextmanager
from jose import jwt, JWTError
from datetime import datetime
import os
import uuid
from pathlib import Path

from . import crud, models, schemas, auth
from .database import SessionLocal, engine, create_database_if_not_exists
from ..config import get_upload_config, ensure_upload_directory
from ..chat_history import get_chat_history_service
from ..ws_server.bridge import ManServerServer

def check_and_update_schema(engine):
    """
    简单的 Schema 迁移检查
    在启动时检查 robots 表是否包含 icon 字段，如果没有则自动添加
    """
    try:
        inspector = inspect(engine)
        if inspector.has_table("robots"):
            columns = [col['name'] for col in inspector.get_columns("robots")]
            if "icon" not in columns:
                print("检测到 'robots' 表缺少 'icon' 字段，正在自动添加...")
                with engine.connect() as conn:
                    conn.execute(text("ALTER TABLE robots ADD COLUMN icon LONGTEXT COMMENT '机器人图标(Base64)'"))
                    conn.commit()
                print("'icon' 字段添加成功。")
    except Exception as e:
        print(f"Schema 检查/更新失败: {e}")

# 生命周期管理
@asynccontextmanager
async def lifespan(app: FastAPI):
    # 启动时
    print("正在初始化数据库...")
    # create_database_if_not_exists()
    # models.Base.metadata.create_all(bind=engine)
    
    # # 执行自动 Schema 更新
    # check_and_update_schema(engine)
    
    print("数据库初始化完成。")
    yield
    # 关闭时 (如果需要)

app = FastAPI(
    title="OpenClaw ManServer API",
    description="机器人管理接口",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/ocms/docs",
    redoc_url="/ocms/redoc",
    openapi_url="/ocms/openapi.json"
)

router = APIRouter()


# --- Upload Endpoints (Protected) ---

@router.post("/upload/file", response_model=schemas.UploadResponse, summary="上传文件")
async def upload_file(
    user_id: str = Query(..., description="用户ID"),
    file: UploadFile = File(...)
):
    """
    上传单个文件到服务器
    
    - 使用时间戳 + UUID 保证文件名唯一性
    - 返回文件的完整路径（相对于服务器）
    - 支持图片、文档、视频等常见格式
    - 文件将保存在以 user_id 命名的子目录中
    """
    upload_config = get_upload_config()
    
    if not upload_config.get("enabled", True):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="文件上传功能已禁用"
        )
    
    original_filename = file.filename
    file_ext = Path(original_filename).suffix.lower()
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    unique_filename = f"{Path(original_filename).stem}_{timestamp}{file_ext}"
    
    upload_dir = ensure_upload_directory(user_id)
    file_path = upload_dir / unique_filename
    
    try:
        content = await file.read()
        
        max_size = upload_config.get("max_file_size", 10 * 1024 * 1024)
        if len(content) > max_size:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"文件大小超过限制，最大允许 {max_size // (1024*1024)} MB"
            )
        
        with open(file_path, "wb") as f:
            f.write(content)
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"文件保存失败: {str(e)}"
        )
    
    full_path = str(file_path).replace("\\", "/")
    
    return schemas.UploadResponse(
        success=True,
        file_name=unique_filename,
        file_size=len(content),
        message="文件上传成功"
    )

@router.get("/download/file", summary="下载文件")
async def download_file(
    user_id: str = Query(..., description="用户ID"),
    file_name: str = Query(..., description="文件名")
):
    """
    根据文件名下载用户目录下的文件
    
    - 文件必须位于以 user_id 命名的子目录中
    - 返回文件内容
    """
    if not file_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="必须提供文件名"
        )
    
    upload_dir = ensure_upload_directory(user_id)
    target_path = upload_dir / file_name
    
    if not target_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"文件不存在: {file_name}"
        )
    
    if not target_path.is_file():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"路径不是文件: {file_name}"
        )
    
    filename = target_path.name
    
    return FileResponse(
        path=str(target_path),
        filename=filename,
        media_type="application/octet-stream"
    )

# --- Chat History Endpoints ---

@router.get("/chat/history/{user_id}", summary="获取用户聊天记录")
async def get_chat_history(
    user_id: str,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    conversation_id: Optional[str] = Query(default=None)
):
    """
    获取指定用户的聊天记录
    
    - 支持分页（limit, offset）
    - 支持按对话 ID 过滤
    - 最多返回 100 条（可通过 limit 参数调整，最大 500）
    """
    chat_service = get_chat_history_service()
    history = await chat_service.get_history(
        user_id=user_id,
        limit=limit,
        offset=offset,
        conversation_id=conversation_id
    )
    
    return {
        "user_id": user_id,
        "total": len(history),
        "limit": limit,
        "offset": offset,
        "messages": history
    }

@router.delete("/chat/history/{user_id}", summary="清空用户聊天记录")
async def clear_chat_history(user_id: str):
    """
    清空指定用户的聊天记录
    """
    chat_service = get_chat_history_service()
    await chat_service.clear_history(user_id=user_id)
    
    return {
        "success": True,
        "message": f"用户 {user_id} 的聊天记录已清空"
    }

# --- WebSocket Endpoint ---
ws_server = ManServerServer()

@router.websocket("/v1/stream")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket 端点，与 API 共用同一端口"""
    await websocket.accept()
    await ws_server.handler(websocket)

app.include_router(router, prefix="/ocms")
