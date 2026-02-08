from fastapi import FastAPI, Depends, HTTPException, status, APIRouter
from sqlalchemy.orm import Session
from sqlalchemy import inspect, text
from typing import List
from contextlib import asynccontextmanager
from jose import jwt, JWTError

from . import crud, models, schemas, auth
from .database import SessionLocal, engine, create_database_if_not_exists

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
    create_database_if_not_exists()
    models.Base.metadata.create_all(bind=engine)
    
    # 执行自动 Schema 更新
    check_and_update_schema(engine)
    
    print("数据库初始化完成。")
    yield
    # 关闭时 (如果需要)

app = FastAPI(
    title="OpenClaw ManServer API",
    description="机器人管理接口 (支持微信小程序登录)",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/ocms/docs",
    redoc_url="/ocms/redoc",
    openapi_url="/ocms/openapi.json"
)

router = APIRouter()

# 依赖项
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# --- Auth Endpoints ---

@router.post("/auth/weapp/token", response_model=schemas.Token, summary="微信小程序登录换取令牌")
async def login_weapp(request: schemas.WeappLoginRequest, db: Session = Depends(get_db)):
    # 1. 调用微信接口换取 openid
    # 注意: 实际部署时应从配置读取 appid 和 secret
    # 这里为了演示，假设 auth 模块有默认值或从环境变量读取
    # 如果 request 中提供了 appid，也可以使用
    appid = request.appid or auth.WECHAT_APPID
    secret = auth.WECHAT_SECRET
    
    # 模拟模式 (如果未配置真实 appid)
    if appid == "your-app-id":
         # 模拟返回
         print("Warning: Using Mock Login for testing")
         openid = f"mock_openid_{request.code}"
         session_key = "mock_session_key"
    else:
        wx_data = await auth.jscode2session(appid, secret, request.code)
        openid = wx_data.get("openid")
        session_key = wx_data.get("session_key")
        
    if not openid:
        raise HTTPException(status_code=400, detail="Failed to get openid from WeChat")
        
    # 2. 查找或创建用户
    user = crud.get_user_by_openid(db, openid=openid)
    if not user:
        user_create = schemas.UserCreate(openid=openid, nickname="微信用户")
        user = crud.create_user(db, user_create)
    
    # 3. 颁发令牌
    access_token = auth.create_access_token(data={"sub": str(user.id)})
    refresh_token = auth.create_refresh_token(data={"sub": str(user.id)})
    
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "expires_in": auth.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        "scope": "profile robots"
    }

@router.post("/auth/refresh", response_model=schemas.Token, summary="刷新令牌")
async def refresh_token(request: schemas.RefreshTokenRequest, db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(request.refresh_token, auth.SECRET_KEY, algorithms=[auth.ALGORITHM])
        user_id: str = payload.get("sub")
        token_type: str = payload.get("type")
        if user_id is None or token_type != "refresh":
            raise credentials_exception
    except JWTError:
        raise credentials_exception
        
    # 检查用户是否存在
    user = crud.get_user(db, user_id=int(user_id))
    if user is None:
        raise credentials_exception
        
    # 颁发新令牌 (包括新的 refresh token，实现轮换)
    access_token = auth.create_access_token(data={"sub": str(user.id)})
    new_refresh_token = auth.create_refresh_token(data={"sub": str(user.id)})
    
    return {
        "access_token": access_token,
        "refresh_token": new_refresh_token,
        "token_type": "bearer",
        "expires_in": auth.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        "scope": "profile robots"
    }

# --- Robot Endpoints (Protected) ---

@router.post("/robots/", response_model=schemas.RobotCreated, summary="创建机器人")
def create_robot(
    robot: schemas.RobotCreate, 
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    return crud.create_robot(
        db=db, 
        robot=robot, 
        user_id=current_user.id,
        user_name=current_user.nickname or "WeChat User"
    )

@router.get("/robots/", response_model=List[schemas.Robot], summary="获取我的机器人列表")
def read_robots(
    skip: int = 0, 
    limit: int = 100, 
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    # 只返回当前用户的机器人
    robots = crud.get_robots(db, user_id=current_user.id, skip=skip, limit=limit)
    return robots

@router.get("/robots/{robot_id}", response_model=schemas.Robot, summary="获取单个机器人信息")
def read_robot(
    robot_id: str, 
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    db_robot = crud.get_robot_by_robot_id(db, robot_id=robot_id)
    if db_robot is None:
        raise HTTPException(status_code=404, detail="Robot not found")
    
    # 权限检查
    if db_robot.creator_id != current_user.id:
         raise HTTPException(status_code=403, detail="Not authorized to access this robot")
         
    return db_robot

@router.put("/robots/{robot_id}", response_model=schemas.Robot, summary="更新机器人信息")
def update_robot(
    robot_id: str, 
    robot: schemas.RobotUpdate, 
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    db_robot = crud.update_robot(db, robot_id=robot_id, robot_update=robot, user_id=current_user.id)
    if db_robot is None:
        # 可能是没找到，也可能是权限不足，crud 返回 None
        # 这里为了区分，可以先查一下
        existing = crud.get_robot_by_robot_id(db, robot_id=robot_id)
        if existing and existing.creator_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not authorized to update this robot")
        raise HTTPException(status_code=404, detail="Robot not found")
    return db_robot

@router.delete("/robots/{robot_id}", summary="删除机器人")
def delete_robot(
    robot_id: str, 
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    success = crud.delete_robot(db, robot_id=robot_id, user_id=current_user.id)
    if not success:
        existing = crud.get_robot_by_robot_id(db, robot_id=robot_id)
        if existing and existing.creator_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not authorized to delete this robot")
        raise HTTPException(status_code=404, detail="Robot not found")
    return {"ok": True}

# --- Conversation Endpoints (Protected) ---

@router.post("/conversations/", response_model=schemas.Conversation, summary="创建对话")
def create_conversation(
    conversation: schemas.ConversationCreate, 
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    # 校验机器人是否存在
    robot = crud.get_robot_by_robot_id(db, robot_id=conversation.robot_id)
    if not robot:
        raise HTTPException(status_code=404, detail="Robot not found")
        
    return crud.create_conversation(db, conversation, user_id=current_user.id)

@router.get("/conversations/", response_model=List[schemas.Conversation], summary="获取对话列表")
def read_conversations(
    robot_id: str = None,
    skip: int = 0, 
    limit: int = 100, 
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    return crud.get_conversations(db, user_id=current_user.id, robot_id=robot_id, skip=skip, limit=limit)

@router.get("/conversations/{conversation_id}", response_model=schemas.Conversation, summary="获取单个对话")
def read_conversation(
    conversation_id: str, 
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    conversation = crud.get_conversation(db, conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
        
    if conversation.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to access this conversation")
        
    return conversation

@router.put("/conversations/{conversation_id}", response_model=schemas.Conversation, summary="更新对话信息")
def update_conversation(
    conversation_id: str, 
    conversation: schemas.ConversationUpdate, 
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    db_conversation = crud.update_conversation(db, conversation_id, conversation, user_id=current_user.id)
    if not db_conversation:
        existing = crud.get_conversation(db, conversation_id)
        if existing and existing.creator_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not authorized to update this conversation")
        raise HTTPException(status_code=404, detail="Conversation not found")
    return db_conversation

@router.delete("/conversations/{conversation_id}", summary="删除对话")
def delete_conversation(
    conversation_id: str, 
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    success = crud.delete_conversation(db, conversation_id, user_id=current_user.id)
    if not success:
        existing = crud.get_conversation(db, conversation_id)
        if existing and existing.creator_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not authorized to delete this conversation")
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"ok": True}

app.include_router(router, prefix="/ocms")
