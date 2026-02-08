from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from .database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True, comment="用户ID")
    openid = Column(String(64), unique=True, index=True, nullable=False, comment="微信OpenID")
    unionid = Column(String(64), unique=True, index=True, nullable=True, comment="微信UnionID")
    nickname = Column(String(100), nullable=True, comment="用户昵称")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), comment="创建时间")
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), comment="最后修改时间")
    
    # 关联机器人
    robots = relationship("Robot", back_populates="creator")
    conversations = relationship("Conversation", back_populates="creator")

class Robot(Base):
    __tablename__ = "robots"

    # 移除自增主键，使用 robot_id 作为主键
    robot_id = Column(String(50), primary_key=True, index=True, nullable=False, comment="机器人ID (UUID)")
    name = Column(String(100), nullable=False, comment="机器人名称")
    description = Column(Text, nullable=True, comment="机器人描述")
    icon = Column(Text, nullable=True, comment="机器人图标(Base64)")
    # 存储 API Key 的 MD5 哈希值 (32字符)
    api_key = Column(String(32), nullable=False, comment="机器人API-KEY (MD5 Hash)")
    
    # 关联用户
    creator_id = Column(Integer, ForeignKey("users.id"), nullable=False, comment="创建人ID(关联User表)")
    creator_name = Column(String(100), nullable=False, comment="创建人名称(冗余字段)")
    
    created_at = Column(DateTime(timezone=True), server_default=func.now(), comment="创建时间")
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), comment="最后修改时间")

    creator = relationship("User", back_populates="robots")
    conversations = relationship("Conversation", back_populates="robot")

class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(String(32), primary_key=True, index=True, comment="对话ID (UUID)")
    robot_id = Column(String(50), ForeignKey("robots.robot_id"), nullable=False, comment="所属机器人ID")
    title = Column(String(255), nullable=True, comment="对话主题")
    creator_id = Column(Integer, ForeignKey("users.id"), nullable=False, comment="创建人ID")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), comment="创建时间")

    robot = relationship("Robot", back_populates="conversations")
    creator = relationship("User", back_populates="conversations")
