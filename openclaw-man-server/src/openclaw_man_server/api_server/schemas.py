from pydantic import BaseModel
from typing import Optional
from datetime import datetime

# Token Schemas
class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str
    expires_in: int
    scope: Optional[str] = None

class TokenData(BaseModel):
    user_id: Optional[int] = None

class RefreshTokenRequest(BaseModel):
    refresh_token: str

class WeappLoginRequest(BaseModel):
    grant_type: str = "weapp_code"
    code: str
    appid: Optional[str] = None

# User Schemas
class UserBase(BaseModel):
    nickname: Optional[str] = None

class UserCreate(UserBase):
    openid: str
    unionid: Optional[str] = None

class User(UserBase):
    id: int
    openid: str
    created_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True

# Robot Schemas
class RobotBase(BaseModel):
    name: str
    description: Optional[str] = None
    icon: Optional[str] = None
    # creator_id 和 creator_name 不再需要从前端传入，后端自动填充

# Properties to receive on creation
class RobotCreate(RobotBase):
    pass

# Properties to receive on update
class RobotUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None

# Properties to return to client (Standard Read - No API Key)
class Robot(RobotBase):
    robot_id: str
    creator_id: int
    creator_name: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

# Properties to return to client (On Creation - With API Key)
class RobotCreated(Robot):
    api_key: str

    class Config:
        from_attributes = True

# Conversation Schemas
class ConversationBase(BaseModel):
    title: Optional[str] = None
    robot_id: str

class ConversationCreate(ConversationBase):
    pass

class ConversationUpdate(BaseModel):
    title: Optional[str] = None

class Conversation(ConversationBase):
    id: str
    creator_id: int
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True

# Upload Schemas
class UploadResponse(BaseModel):
    success: bool
    file_path: str
    file_name: str
    file_size: int
    content_type: str
    message: Optional[str] = None
