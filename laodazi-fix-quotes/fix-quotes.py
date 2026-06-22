#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
中文引号修正脚本
功能：
1. 将所有英文双引号 " " 替换为中文双引号 ""
2. 将所有英文单引号 ' ' 替换为中文单引号 ''

使用方法：
- 读取模式：python3 scripts/fix-quotes.py read <文件路径>
- 写入模式：python3 scripts/fix-quotes.py write <文件路径>
"""

import sys

# 定义中文引号的Unicode编码
LEFT_DOUBLE = '\u201c'   # 中文左双引号 "
RIGHT_DOUBLE = '\u201d'  # 中文右双引号 "
LEFT_SINGLE = '\u2018'   # 中文左单引号 '
RIGHT_SINGLE = '\u2019'  # 中文右单引号 '

def fix_quotes(text):
    """修正文本中的引号"""
    result = []
    double_open = False

    for char in text:
        if char == '"':  # ASCII双引号
            if double_open:
                result.append(RIGHT_DOUBLE)
                double_open = False
            else:
                result.append(LEFT_DOUBLE)
                double_open = True
        elif char == "'":  # ASCII单引号
            # 简单处理：所有英文单引号替换为中文左单引号
            result.append(LEFT_SINGLE)
        else:
            result.append(char)

    return ''.join(result)

def main():
    if len(sys.argv) < 3:
        print("使用方法：")
        print("  读取模式：python3 scripts/fix-quotes.py read <文件路径>")
        print("  写入模式：python3 scripts/fix-quotes.py write <文件路径>")
        sys.exit(1)

    mode = sys.argv[1]
    file_path = sys.argv[2]

    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()

        fixed_content = fix_quotes(content)

        if mode == 'read':
            print(fixed_content)
        elif mode == 'write':
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(fixed_content)
            double_count = content.count('"')
            single_count = content.count("'")
            print(f"✅ 已修正引号：{file_path}")
            print(f"   英文双引号: {double_count} 个 → 中文双引号")
            print(f"   英文单引号: {single_count} 个 → 中文单引号")
        else:
            print(f"❌ 未知模式：{mode}")
            print("支持的模式：read、write")
            sys.exit(1)

    except FileNotFoundError:
        print(f"❌ 文件不存在：{file_path}")
        sys.exit(1)
    except Exception as e:
        print(f"❌ 错误：{e}")
        sys.exit(1)

if __name__ == '__main__':
    main()
