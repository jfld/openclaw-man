#!/bin/bash
set -e

# -----------------------------------------------------------------------------
# 插件打包脚本 (cloud-bot-channel)
# 
# 功能：
# 1. 编译项目 (npm run build)
# 2. 创建临时目录 cloud-bot-channel
# 3. 复制构建产物和配置到临时目录
# 4. 安装生产依赖
# 5. 打包 cloud-bot-channel 目录
# -----------------------------------------------------------------------------

# 配置
PLUGIN_NAME="cloud-bot-channel"
OUTPUT_DIR="channel"
OUTPUT_FILENAME="${PLUGIN_NAME}.zip"
TEMP_BUILD_DIR="build_temp"

# 计算绝对路径
PROJECT_ROOT="$(pwd)"
ABS_OUTPUT_DIR="$PROJECT_ROOT/$OUTPUT_DIR"
ABS_OUTPUT_PATH="$ABS_OUTPUT_DIR/$OUTPUT_FILENAME"
ABS_TEMP_BUILD_DIR="$PROJECT_ROOT/$TEMP_BUILD_DIR"

# 0. 编译项目
echo "🔨 正在编译项目..."
if command -v npm &> /dev/null; then
    npm run build
else
    echo "❌ 错误: 未找到 npm 命令，无法编译。"
    exit 1
fi

# 1. 准备输出目录
mkdir -p "$ABS_OUTPUT_DIR"

# 2. 准备临时构建目录
echo "🔧 准备构建目录..."
rm -rf "$ABS_TEMP_BUILD_DIR"
mkdir -p "$ABS_TEMP_BUILD_DIR/$PLUGIN_NAME"

# 3. 复制文件到临时目录
# 使用 rsync 排除不必要的文件
echo "📂 复制文件..."
if command -v rsync &> /dev/null; then
    rsync -av \
        --exclude "$OUTPUT_DIR" \
        --exclude "$TEMP_BUILD_DIR" \
        --exclude ".git" \
        --exclude ".gitignore" \
        --exclude ".DS_Store" \
        --exclude "node_modules" \
        --exclude "*.zip" \
        --exclude "test" \
        --exclude "src" \
        --exclude "*.ts" \
        --include "dist" \
        --include "package.json" \
        --include "openclaw.plugin.json" \
        "$PROJECT_ROOT/" "$ABS_TEMP_BUILD_DIR/$PLUGIN_NAME/"
else
    # Fallback if rsync is missing
    echo "⚠️ rsync 未找到，使用 cp..."
    # 这里的 cp 策略比较简单，可能需要根据实际情况调整
    cp -r "$PROJECT_ROOT/dist" "$ABS_TEMP_BUILD_DIR/$PLUGIN_NAME/"
    cp "$PROJECT_ROOT/package.json" "$ABS_TEMP_BUILD_DIR/$PLUGIN_NAME/"
    cp "$PROJECT_ROOT/openclaw.plugin.json" "$ABS_TEMP_BUILD_DIR/$PLUGIN_NAME/"
    # 如果有其他必要文件，需在此添加
fi

# 4. 安装依赖
cd "$ABS_TEMP_BUILD_DIR/$PLUGIN_NAME"
echo "📦 正在安装生产依赖..."
if command -v npm &> /dev/null; then
    npm install --production
else
    echo "⚠️ 警告: 系统未找到 npm 命令。"
fi

# 5. 删除旧的 ZIP 文件
if [ -f "$ABS_OUTPUT_PATH" ]; then
    echo "🗑️  清理旧文件..."
    rm "$ABS_OUTPUT_PATH"
fi

# 6. 执行 zip 打包
echo "📦 开始打包到: $ABS_OUTPUT_PATH"
cd "$ABS_TEMP_BUILD_DIR"
# 打包 plugin 目录本身
zip -r "$ABS_OUTPUT_PATH" "$PLUGIN_NAME" \
    -x "*.DS_Store" \
    -x ".git*" \
    -x "*.log"

# 7. 清理临时目录
cd "$PROJECT_ROOT"
rm -rf "$ABS_TEMP_BUILD_DIR"

# 8. 验证结果
if [ -f "$ABS_OUTPUT_PATH" ]; then
    echo "✅ 打包成功！"
    echo "---------------------------------------------------"
    echo "ZIP 内容预览 (前 15 行):"
    unzip -l "$ABS_OUTPUT_PATH" | head -n 15
    echo "---------------------------------------------------"
else
    echo "❌ 打包失败。"
    exit 1
fi
