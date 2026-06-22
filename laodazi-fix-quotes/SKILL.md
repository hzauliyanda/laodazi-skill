# 中文引号修正 Skill

自动将文章中的英文引号（""、''）替换为中文引号（""、''）。

## 功能说明

### 主要功能
1. 将所有英文双引号 `""` 替换为中文双引号 `""`
2. 将所有英文单引号 `''` 替换为中文单引号 `''`
3. 智能判断左右引号，自动匹配成对
4. 正确处理UTF-8编码的中文文件

### 使用场景
- AI生成的文章引号格式不规范
- 从其他工具复制的内容包含英文引号
- 需要符合中文出版规范的文章
- 公众号、自媒体文章发布前的格式修正

## 使用方法

### 在Claude Code中使用
当AI生成文章后，可以直接调用：

```
请修正这个文件的中文引号：/path/to/article.md
```

或者明确指定：

```
使用laodazi-fix-quotes skill修正：/path/to/article.md
```

### 命令行直接使用

```bash
# 写入模式（直接修正文件）
python3 ~/.claude/skills/laodazi-fix-quotes/fix-quotes.py write /path/to/file.md

# 读取模式（查看修正后的内容，不修改原文件）
python3 ~/.claude/skills/laodazi-fix-quotes/fix-quotes.py read /path/to/file.md
```

### 示例

```bash
# 修正历史文章
python3 ~/.claude/skills/laodazi-fix-quotes/fix-quotes.py write "/Users/liyanda/Documents/SynologyDrive/01-自媒体/内容创作/待润色/文章.md"
```

**输出示例**：
```
✅ 已修正引号：/path/to/file.md
   英文双引号: 36 个 → 中文双引号
   英文单引号: 0 个 → 中文单引号
```

## 技术细节

### Unicode编码
- 左双引号 `"`：`\u201c` (U+201C)
- 右双引号 `"`：`\u201d` (U+201D)
- 左单引号 `'`：`\u2018` (U+2018)
- 右单引号 `'`：`\u2019` (U+2019)

### 智能匹配算法
脚本通过状态变量跟踪引号的开闭状态，自动判断左右引号：
- 第1个英文双引号 → 左双引号
- 第2个英文双引号 → 右双引号
- 第3个英文双引号 → 左双引号
- 以此类推...

### UTF-8编码保证
- 明确指定 `encoding='utf-8'` 参数
- 确保读写文件时正确处理中文内容
- 使用Unicode转义序列避免编码问题

## 验证方法

### 方法1：直接查看
```bash
head -20 file.md | grep '"'
```

### 方法2：检查字节编码
```bash
head -15 file.md | sed -n '12p' | hexdump -C
```

正确的中文双引号应该显示为：
- 左双引号：`e2 80 9c`
- 右双引号：`e2 80 9d`

错误的英文双引号会显示为：
- `22` (ASCII)

## 批量处理

如需处理多个文件，可以编写循环脚本：

```bash
for file in /path/to/articles/*.md; do
    python3 ~/.claude/skills/laodazi-fix-quotes/fix-quotes.py write "$file"
done
```

## 注意事项

1. **备份文件**：重要文件建议先备份再处理
2. **写入权限**：确保对目标文件有写入权限
3. **UTF-8编码**：文件必须是UTF-8编码格式
4. **成对检查**：修正后建议检查引号是否成对匹配

## 相关文档

- 技术文档：`/Users/liyanda/Documents/SynologyDrive/01-自媒体/技术文档/中文引号问题排查与解决.md`
- Python脚本：`~/.claude/skills/laodazi-fix-quotes/fix-quotes.py`

---

**版本**：v1.0  
**最后更新**：2026-05-20  
**状态**：已验证可用
