# 豆包网页版驱动指南（Chrome DevTools MCP）

驱动 doubao.com 完成一轮史实校验：新开对话 → 发指令+文章 → 等生成完 → 抓回复。
选择器会随豆包改版变化，本文给的是**定位策略**而非写死的选择器；首次实测跑通后，把当轮真实可用的选择器/uid 特征追加到本文末尾的"实测记录"里，供下次直接复用。

## 前置：连接已登录的真实 Chrome

豆包需要登录态，必须复用用户日常 Chrome 的 profile（参考 laodazi-post-to-x 的做法）：

1. 检查 9222 端口是否已有 Chrome 调试实例：`curl -s http://127.0.0.1:9222/json/version`。
2. 没有则提示用户完全退出 Chrome 后，以调试模式启动：

```bash
open -a "Google Chrome" --args --remote-debugging-port=9222
```

3. chrome-devtools MCP 工具即可接管。用 `list_pages` 查看现有页面，`new_page` 或 `navigate_page` 打开 `https://www.doubao.com/chat/`。
4. 页面加载后 `take_snapshot`，确认处于已登录状态（能看到输入框/历史对话侧栏）。看到登录弹窗则视为登录态失效 → 计一次失败，提示用户手动登录后重试；连续 2 次失败走 manual 兜底。

## 每轮流程

### 1. 新开对话

- snapshot 中找"新对话 / 新建对话"按钮（侧栏顶部，通常带 ➕ 图标）并 click；
- 找不到就直接 `navigate_page` 到 `https://www.doubao.com/chat/`（默认落在新对话）。
- 验证：输入框为空、页面无历史消息。

### 2. 输入指令 + 文章

**优先：整体粘贴**（指令和文章合并成一条消息发送）。

- 输入框大概率是 contenteditable div 而不是 textarea，`fill` 可能无效。定位到输入框后优先用 `evaluate_script` 模拟真实输入：

```js
// el = 输入框元素
el.focus();
document.execCommand('insertText', false, FULL_TEXT);
```

- 若 execCommand 不生效，退而求其次：设置 `el.textContent`（或 textarea 的 `el.value`）后手动派发 `new InputEvent('input', {bubbles: true})`，再 snapshot 确认发送按钮已激活（前端框架需要 input 事件才会更新状态）。
- 不要用 `type_text` 逐字敲全文——几千字太慢且易触发风控。
- FULL_TEXT 从磁盘文件读入后经 JS 字符串安全转义传入（evaluate_script 传参数，不要字符串拼接进脚本源码）。

**超限降级：文件上传**。粘贴后 snapshot 发现文本被截断（对比末尾几十个字符），或页面提示超长：

1. 清空输入框；
2. 找输入框旁的附件/上传按钮，用 `upload_file` 传当前版本的 `.md` 文件（豆包支持 md/txt）；
3. 输入框里只发校验指令（去掉末尾"文章如下："改为"文章见附件。"）。

### 3. 发送并等待生成完成

- click 发送按钮（或 `press_key` Enter，注意豆包可能是 Enter 发送 / Shift+Enter 换行）。
- 联网搜索 + 深度思考可能耗时 1~3 分钟。轮询策略：
  - 每 10~15 秒 `evaluate_script` 读取最后一条 AI 消息的文本长度；
  - 判定完成 = 连续 2 次轮询长度不变 **且** 页面上"停止生成/停止响应"按钮消失（或重新出现发送按钮）；
  - 单轮总超时 5 分钟，超时计一次失败。
- 轮询等待用 `wait_for` 或后台 sleep 循环，不要高频刷。

### 4. 抓取回复全文

- `evaluate_script` 取最后一条 AI 消息容器的 `innerText`（比 snapshot 更完整，不会被折叠截断）。
- 定位策略：消息列表里最后一个 AI 角色的消息节点；找不到稳定选择器时，取正文区所有消息节点的最后一个、且内容包含"史实错误"或"未发现"关键词的节点。
- 校验有效性：回复应包含【史实错误】/【文学化演绎】/"未发现史实错误"三者之一；都没有说明抓错了节点或豆包没按格式答——原样带回，交主会话人工判断，不要在子代理里猜。
- 写入 `过程稿/豆包校验-第N轮.md`。

## 失败与降级

| 情况 | 处置 |
|------|------|
| 9222 连不上且用户未配合重启 Chrome | 走 manual 兜底 |
| 登录弹窗 / 页面结构完全对不上 | 计 1 次失败，重试 1 次后走 manual |
| 生成超时（>5min） | 计 1 次失败；重试时刷新页面重发 |
| 回复抓取内容为空或明显残缺 | 重抓 1 次；仍失败则整轮重试 |

manual 兜底流程见 SKILL.md ②的降级规则。

## 实测记录（跑通后追加）

> 首次实测后在此记录：输入框选择器、发送按钮特征、新对话按钮位置、消息节点选择器、Enter 行为、附件按钮位置。后续执行优先按记录直取，失效再回退到上面的通用定位策略。

### 2026-07-03 实测（改用 CDP 脚本，非 chrome-devtools MCP）

**关键背景**：本机 chrome-devtools MCP 未连接；且 Chrome 149/150 用**默认 profile** 时 `--remote-debugging-port` 会被安全策略拒绝绑定（进程带参数但端口不监听）。解决：复用 `laodazi-post-to-baijiahao/scripts/shared/cdp.ts`，用**独立 `--user-data-dir`** 启动 Chrome。

- **运行时**：`bun`（node v23 自带 WebSocket/fetch）。cdp.ts 里 `launchChrome(url, profileDir)` 直接可用。
- **独立 profile**：`~/.local/share/doubao-verify-profile` —— 端口能正常绑定，且**登录态存磁盘，登一次永久复用**，与用户日常 Chrome 完全隔离（无需退出日常 Chrome）。
- **登录检测**：URL 落在 `doubao.com/chat/`、页面出现输入框、body 不含"扫码"即视为已登录。首次会先跳 `doubao-region-ban` 再跳 chat。
- **输入框**：`textarea.semi-input-textarea`（Semi Design，placeholder「发消息...」），是**真 textarea 不是 contenteditable**。写值必须用原生 setter 触发 React：
  ```js
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set;
  setter.call(el, TEXT); el.dispatchEvent(new Event('input',{bubbles:true}));
  ```
- **发送**：CDP 派发 **Enter 键**（keyDown+keyUp Enter）即发送，textarea 随即清空；实测 Enter 一次就发整段（含换行），无需找发送按钮。发送失败再回退点按钮。
- **抓回复的坑（重要）**：校验指令本身就含【史实错误】【文学化演绎】未发现史实错误 三个标记，**用户自己的消息气泡会命中全部标记**。提取时必须**排除含指令指纹「我接下来发你一段」的子树**，再在剩余含标记元素里取 **innerText 最长** 的（即 AI 消息 wrapper；其父节点会含用户消息故被排除）。
- **完成判定**：轮询该 AI 消息 innerText，连续 2 次（间隔 6s）长度不变且 >40 字即定稿。单轮回复约 1276 字。
- **落盘脚本**（本次临时放 scratchpad，可提升进 skill 复用）：`doubao-probe.ts`（探测+等登录）、`doubao-verify.ts`（`<port> <inputFile> <outputFile> [--new] [--read-only]`）。`--read-only` 用于「消息已发出、只抓回复」的断点续跑。
- **多轮/断点**：脚本每轮 launch→用完不 kill（`chrome.unref`），profile Chrome 常驻；下一轮从 `ps` 抓其随机调试端口 `grep remote-debugging-port`，`getBrowserWsUrl` 重连即可，无需重启。
- **同会话多轮（用户偏好，见记忆 feedback_doubao-same-conversation）**：round≥2 **不要 `--new`**（`--new` 的 Page.navigate 会与豆包 SPA 初始化抢跑、导致空发不回复）；直接在当前会话 fill+send，跟进语用固定指纹开头"这是根据你上面意见修订后的版本…"。抓回复必须用 **baseline-delta**：send 前先抓当前所有含标记(【史实错误】/【文学化演绎】/未发现)且不含用户指纹的文本块存 baseline，回复取"新出现(exact 不在 baseline)+非指纹+最长"的块。**exact 匹配**排除，不能用 substring(校验报告跨轮措辞高度重合，substring 会把新回复也误排)。持久化 baseline 到 `<out>.baseline.json` 供 `--read-only` 断点续抓。
- **模式切换（专家 vs 快速，关键，见记忆 feedback_doubao-expert-mode）**：输入框旁有 button，文本即"快速"/"专家"。切换脚本 `doubao-set-expert.ts`：找该 button→click 弹菜单→找文本 exact"专家"的最小可见元素→click→复查 button 文本变"专家"。**史实校验默认切专家**（快速漏真错+误报假错）。专家模式思考久（~200-450s），单轮 `MAX_MS` 放到 8 分钟；发送前确认仍是"专家"（可能被误点回快速）。
- **诊断脚本**：`doubao-dump.ts <port>`（dump url/textarea/markers/bodyTail）、`doubao-grab-last.ts <port> <out>`（按 rect.bottom 取最新消息、climb 到最大无指纹祖先，用于 baseline-delta 失灵时兜底）。
