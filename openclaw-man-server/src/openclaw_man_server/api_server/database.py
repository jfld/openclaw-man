import os
from urllib.parse import quote_plus
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import pymysql

# 数据库连接配置 (优先从环境变量读取)
DB_HOST = os.getenv("DB_HOST", "10.16.24.100")
DB_PORT = int(os.getenv("DB_PORT", "3399"))
DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "verysecret")
DB_NAME = os.getenv("DB_NAME", "openclaw_man")

# 构建连接字符串
# 对用户名和密码进行 URL 编码，防止特殊字符（如 @）导致解析错误
encoded_user = quote_plus(DB_USER)
encoded_password = quote_plus(DB_PASSWORD)
SQLALCHEMY_DATABASE_URL = f"mysql+pymysql://{encoded_user}:{encoded_password}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, 
    pool_pre_ping=True,
    pool_recycle=3600
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def create_database_if_not_exists():
    """如果数据库不存在，则创建它"""
    try:
        # 连接到默认的 mysql 数据库来检查/创建我们的目标数据库
        temp_conn = pymysql.connect(
            host=DB_HOST,
            port=DB_PORT,
            user=DB_USER,
            password=DB_PASSWORD,
            charset='utf8mb4'
        )
        try:
            with temp_conn.cursor() as cursor:
                cursor.execute(f"CREATE DATABASE IF NOT EXISTS {DB_NAME} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
                temp_conn.commit()
                print(f"检查数据库 '{DB_NAME}': 完成")
        finally:
            temp_conn.close()
    except Exception as e:
        print(f"创建数据库失败: {e}")
        # 这里不抛出异常，让后续的 SQLAlchemy 连接尝试去处理（如果是因为连接问题）
