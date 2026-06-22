#!/bin/bash

# 中文引号修正脚本
#
# 使用方法：
# - 读取模式：./scripts/fix-quotes.sh read <文件路径>
# - 写入模式：./scripts/fix-quotes.sh write <文件路径>

if [ $# -lt 2 ]; then
    echo "使用方法："
    echo "  读取模式：./scripts/fix-quotes.sh read <文件路径>"
    echo "  写入模式：./scripts/fix-quotes.sh write <文件路径>"
    exit 1
fi

MODE="$1"
FILE_PATH="$2"

if [ "$MODE" = "read" ]; then
    # 读取模式 - 替换并显示
    sed 's/"/"/g' "$FILE_PATH" | sed "s/'/'/g"
elif [ "$MODE" = "write" ]; then
    # 写入模式 - 直接替换
    sed -i '' 's/"/"/g' "$FILE_PATH"
    sed -i '' "s/'/'/g" "$FILE_PATH"
    echo "✅ 已修正引号：$FILE_PATH"
else
    echo "❌ 未知模式：$MODE"
    echo "支持的模式：read、write"
    exit 1
fi
