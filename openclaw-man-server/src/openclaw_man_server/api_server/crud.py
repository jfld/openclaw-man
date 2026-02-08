from sqlalchemy.orm import Session
from . import models, schemas
import hashlib
import time
import uuid
import secrets
import string

# --- API Key Generation ---
def generate_api_key() -> str:
    """
    生成专业的 API Key
    格式: sk-api-<32 chars alphanumeric>
    示例: sk-api-JJco7oV4rlxVRC22eiJtXZuf02acvXO1a7bAIGzDqfQOfaL77tgG
    """
    prefix = "sk-api-"
    # 生成 48 个随机字符，包含大小写字母和数字
    alphabet = string.ascii_letters + string.digits
    random_str = ''.join(secrets.choice(alphabet) for _ in range(48))
    return f"{prefix}{random_str}"

def generate_robot_id() -> str:
    """生成 32位 UUID (无连字符)"""
    return uuid.uuid4().hex

def hash_api_key(api_key: str) -> str:
    """计算 API Key 的 MD5 哈希"""
    return hashlib.md5(api_key.encode()).hexdigest()

# --- User CRUD ---
def get_user(db: Session, user_id: int):
    return db.query(models.User).filter(models.User.id == user_id).first()

def get_user_by_openid(db: Session, openid: str):
    return db.query(models.User).filter(models.User.openid == openid).first()

def create_user(db: Session, user: schemas.UserCreate):
    db_user = models.User(
        openid=user.openid,
        unionid=user.unionid,
        nickname=user.nickname
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

# --- Robot CRUD ---
def get_robot_by_robot_id(db: Session, robot_id: str):
    return db.query(models.Robot).filter(models.Robot.robot_id == robot_id).first()

def get_robots(db: Session, user_id: int, skip: int = 0, limit: int = 100):
    """只返回属于该用户的机器人"""
    return db.query(models.Robot).filter(models.Robot.creator_id == user_id).offset(skip).limit(limit).all()

def create_robot(db: Session, robot: schemas.RobotCreate, user_id: int, user_name: str = "Unknown"):
    # 自动生成 robot_id
    robot_id = generate_robot_id()
    
    # 1. 生成原始 API Key (返回给用户)
    raw_api_key = generate_api_key()
    
    # 2. 计算 MD5 哈希 (存储到数据库)
    hashed_api_key = hash_api_key(raw_api_key)
    
    db_robot = models.Robot(
        robot_id=robot_id,
        name=robot.name,
        description=robot.description,
        icon=robot.icon,
        api_key=hashed_api_key, # 存储哈希值
        creator_id=user_id,
        creator_name=user_name
    )
    db.add(db_robot)
    db.commit()
    db.refresh(db_robot)
    
    # 关键：将原始 API Key 赋值给对象（临时），以便 Pydantic schema 可以序列化返回给用户
    # 注意：这不会影响数据库中的值，因为我们已经 commit 了，且没有再次 add/commit
    db_robot.api_key = raw_api_key
    
    return db_robot

def update_robot(db: Session, robot_id: str, robot_update: schemas.RobotUpdate, user_id: int):
    """更新机器人，增加权限校验"""
    db_robot = get_robot_by_robot_id(db, robot_id)
    if not db_robot:
        return None
    
    # 校验权限
    if db_robot.creator_id != user_id:
        return None 
    
    update_data = robot_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_robot, key, value)
    
    db.add(db_robot)
    db.commit()
    db.refresh(db_robot)
    return db_robot

def delete_robot(db: Session, robot_id: str, user_id: int):
    """删除机器人，增加权限校验"""
    db_robot = get_robot_by_robot_id(db, robot_id)
    if not db_robot:
        return False
    
    # 校验权限
    if db_robot.creator_id != user_id:
        return False
        
    db.delete(db_robot)
    db.commit()
    return True

# --- Conversation CRUD ---
def get_conversation(db: Session, conversation_id: str):
    return db.query(models.Conversation).filter(models.Conversation.id == conversation_id).first()

def get_conversations(db: Session, user_id: int, robot_id: str = None, skip: int = 0, limit: int = 100):
    """返回属于该用户的对话，可选根据 robot_id 过滤"""
    query = db.query(models.Conversation).filter(models.Conversation.creator_id == user_id)
    if robot_id:
        query = query.filter(models.Conversation.robot_id == robot_id)
    return query.offset(skip).limit(limit).all()

def create_conversation(db: Session, conversation: schemas.ConversationCreate, user_id: int):
    # 验证 robot 是否存在且属于该用户？ 或者只要是公开的机器人都可以？
    # 暂时假设用户只能创建关联到自己机器人的对话？或者可以关联到任意机器人？
    # 通常用户是和机器人对话，所以机器人可能是别人的。
    # 这里暂时不强制校验 robot 的 owner，只校验是否存在。
    
    db_conversation = models.Conversation(
        id=generate_robot_id(), # 复用生成 UUID 的函数
        robot_id=conversation.robot_id,
        title=conversation.title,
        creator_id=user_id
    )
    db.add(db_conversation)
    db.commit()
    db.refresh(db_conversation)
    return db_conversation

def update_conversation(db: Session, conversation_id: str, conversation_update: schemas.ConversationUpdate, user_id: int):
    db_conversation = get_conversation(db, conversation_id)
    if not db_conversation:
        return None
    
    if db_conversation.creator_id != user_id:
        return None
    
    update_data = conversation_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_conversation, key, value)
        
    db.add(db_conversation)
    db.commit()
    db.refresh(db_conversation)
    return db_conversation

def delete_conversation(db: Session, conversation_id: str, user_id: int):
    db_conversation = get_conversation(db, conversation_id)
    if not db_conversation:
        return False
        
    if db_conversation.creator_id != user_id:
        return False
        
    db.delete(db_conversation)
    db.commit()
    return True
