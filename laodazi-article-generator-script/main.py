# coding: utf-8

"""
历史文章生成器 - 3步流水线

第1步：研究 → 拆解标题 + 搜索原典/史料/评点（一次 Google Search grounding 调用）
第2步：综合素材，选定意象 + 生成大纲
第3步：写正文（基于研究阶段的真实素材），生成即终稿，不再自查
"""

import os
import random
import re
import time
from google import genai
from google.genai import types
from google.cloud import storage
from flask import jsonify

# ========== 配置区 ==========

PROJECT_ID = os.environ.get("PROJECT_ID", "inbound-vim-496014-e4")
# LOCATION = os.environ.get("LOCATION", "us-central1")
LOCATION = os.environ.get("LOCATION", "global")

MODEL_NAME = os.environ.get("MODEL_NAME", "gemini-3.5-flash")
GCS_BUCKET = os.environ.get("GCS_BUCKET", "history-articles-2026")

client = genai.Client(vertexai=True, project=PROJECT_ID, location=LOCATION)


# ========== 工具函数 ==========

def call_gemini(prompt, use_grounding=False, thinking_budget=10000):
    """
    调用 Gemini。
    - 研究阶段（step 1）用 Google Search grounding 搜真实素材
    - 分析/创作阶段（step 2-3）用 thinking 提升质量
    """
    config_kwargs = {}

    if use_grounding:
        config_kwargs['tools'] = [types.Tool(google_search=types.GoogleSearch())]
    else:
        config_kwargs['thinking_config'] = types.ThinkingConfig(
            thinking_budget=thinking_budget
        )

    response = client.models.generate_content(
        model=MODEL_NAME,
        contents=prompt,
        config=types.GenerateContentConfig(**config_kwargs)
    )

    if not response.text:
        raise RuntimeError("Gemini 返回为空，可能被安全过滤")

    grounding_meta = None
    if use_grounding and response.candidates:
        try:
            grounding_meta = response.candidates[0].grounding_metadata
        except (AttributeError, IndexError):
            pass

    return response.text, grounding_meta


def count_metrics(text):
    """统计文本质量指标"""
    chinese_chars = len(re.findall(r'[\u4e00-\u9fff]', text))

    forbidden = [
        '首先', '其次', '然后', '最后', '其一', '其二','第一', '第二',
        '第一层', '第二层', '颇具', '颇为',
        '不可忽视', '值得一提的是',
        '综上所述', '总而言之',
    ]
    found = [(w, text.count(w)) for w in forbidden if w in text]

    return {
        'chinese_chars': chinese_chars,
        'forbidden_words': found,
        'passed': len(found) == 0 and 3000 <= chinese_chars <= 4000,
    }


# ========== Prompt 模板 ==========

# ----- 第1步：研究（拆解 + 三层素材搜索） -----
RESEARCH_PROMPT_TEMPLATE = """你是一位历史研究专家，同时精通历史文献、典章制度和古典文学评点。
请围绕以下选题，先做拆解规划，再用搜索一次性搜集三层素材。

选题：{topic}

---

## 第一部分：拆解（简要，不超过200字）
把标题关键词拆成3个维度，每个维度一句话说明核心问题和搜索方向。

## 第二部分：搜索三层素材

### 第一层：原典原文
- 找人物出场的具体描写、环境描写、关键角色的介绍词、其他角色的爆料
- 必须标注具体回目/章节
- 引用原文（不是转述）

### 第二层：制度史料 + 旁证材料
- 搜索正史中相关制度的原文（如《明史·职官志》《明实录》具体卷数）
- 搜制度的品级、形制、管理规定，制度细节只能从正史来，标注具体出处
- 同时搜索同时代笔记中的旁证材料（如《万历野获编》《五杂俎》《日知录》等等）

### 第三层：名家评点
- 搜索权威评点家的相关批语
- 引用批语原文，标注来源
- 选择与主题最相关的批语，不是随便凑数

## 总体要求
- 不查自媒体，不查演义小说，只查原典和权威史料
- 三层素材之间不要重复

## 输出格式

### 拆解
| 素材线 | 核心问题 | 搜索方向 |
|---|---|---|
| ... | ... | ... |

### 原典素材
1. [书名] 第X回 — "[原文引用]"
   用途：...

### 制度史料
1. [《XX》卷X] — "[原文引用]"
   用途：...

### 旁证材料
1. [《XX》] — "[原文引用]"
   用途：...

### 名家评点
1. [批语来源] — "[批语原文]"
   解读：这条批语对文章的价值是...
"""

# ----- 题型与贯穿手法池 -----
# 题型：模型自判，也可由请求参数 topic_type 指定。题型只决定视角侧重，不提供现成骨架。
TOPIC_TYPES = ["人物祛魅", "事件重述", "制度解读", "翻案祛谣", "风俗异域"]

# 贯穿手法：原来每篇强制"一个意象首尾呼应"，本身成了模板。扩成五选一，
# 未指定时随机抽取（机制同开头/结尾切法池）。
THREAD_DEVICES = {
    "意象": "一件具体物件/场景贯穿全文（一块匾、一座城、一口钟），关键节点反复回到它",
    "算账": "全文围绕一笔具体的账展开（钱粮、兵力、天数、里程），把账越算越清就是推进",
    "追问": "一个反复回来的问题当钩子，每一节都把答案往前推一步，最后一节才给全",
    "时间线": "一条明确的倒计时/进度线（围城第X天、距事发还有X年），用时间的压迫感推进",
    "双线对照": "两个人物/两个地点/两种选择平行推进，靠对照出张力，最后交汇",
}

# ----- 第2步：立论 + 现场设计大纲 -----
SYNTHESIZE_PROMPT_TEMPLATE = """我是历史类自媒体博主（笔名老达子）。
现在要根据前面搜集的所有素材，先立论，再为这一篇现场设计大纲——不套任何现成结构。

选题：{topic}

## 所有已搜集的素材：
{all_research}

---

## 第一步：确认主角
不要想当然地认定主角，先根据素材确认标题中的关键说法到底指向谁。
如果发现主角与直觉不同，必须标注出来并说明理由。

## 第二步：定题型
{topic_type_block}
题型只决定视角侧重（祛魅重拆门面、制度重算账、翻案重对质），不提供现成结构——结构必须从本篇素材里长出来。

## 第三步：立论
从素材里提出 2-3 个候选立论。立论是一句可以被反驳的判断（"XX 不是……而是……""XX 的关键不在 A，在 B"），不是主题概括。
用两个测验淘汰：
- 大路货测验：随便一个读过中学历史的人都会这么说的，弃掉。
- 支撑测验：手头素材撑不起来的，弃掉。
最后选定一个，全文所有小节都为它服务。

## 第四步：贯穿手法
本篇指定用【{thread_device_name}】：{thread_device_desc}。
从素材里挑出承载它的具体载体（哪件物、哪笔账、哪个问题），要有画面感，能承载主题的戏剧冲突。

## 第五步：现场设计结构（不给骨架，从素材里长）
把素材摊开，找出几个张力点——反差最狠的地方、时间对不上的地方、账算不平的地方、史料突然沉默的地方——用它们搭小节，排出一条为立论服务的推进线。
节数由立论需要决定，不定死：4 节能把立论钉死就 4 节收工，素材撑得起再多开。**宁可少一节，不硬凑一节**——凑出来的小节撑不住移植测验，也稀释全文密度。
前言制造冲击、引出主线（具体开头切法由写作阶段指定，这里只列要点）。
每个小标题要有画面感，必须含本篇专属的人名/地名/物件/引文，不要用"关于XX的分析"这种学术腔。

## 第六步：移植测验（硬性自查）
逐个检查小标题：把它抄到另一个选题下面还通顺的，重写。
再检查整个大纲：把选题换掉，这个大纲还能用，说明结构是套出来的不是设计出来的——推倒重来。
测验全部通过才输出。

## 输出格式

### 主角确认
主角：XXX
确认依据：...

### 题型
XX型（一句话说明为什么）

### 立论
候选：...（附淘汰理由）
选定：XXX

### 贯穿手法
【{thread_device_name}】载体：XXX
选择理由：...

### 文章结构
前言（约XXX字）
   - 本篇最强的反差点/冲击点
   - 引用素材：[标注来自哪一层素材]
1. 【小标题】（约XXX字）
   - 张力点：...
   - 史实要点：...
   - 引用素材：[标注来自哪一层素材]
2. 【小标题】（约XXX字）
   - 张力点：...
   - 史实要点：...
   - 引用素材：[标注来自哪一层素材]
...
老达子说（约XXX字）— 收束（具体收法由写作阶段指定）
总字数控制在3000字左右。

### 移植测验
逐条：小标题X — 通过 / 已重写
"""

# ----- 开头/结尾切法池 -----
# 模板化的根源：无状态模型每次面对相同 prompt，会稳定收敛到同一种开头和结尾。
# 解法：每次生成时由代码随机抽一种切法注入 prompt（调用方也可通过请求参数指定），
# 模型每次只看到一种切法，无从收敛。

OPENING_STYLES = {
    "画面切入": """直接把人扔进最炸的瞬间，画面、动作、物件顶在最前，年份后置或隐掉。适合有强场景的标题。
范例：
> 荥阳城东门外，一堆冲天的火。火里绑着一个穿天子衮服的人。围着火的楚军欢呼雀跃，以为烧的是汉王刘邦。可火里这个人，偏偏不是刘邦——他叫纪信，是替刘邦去死的。（“公元前204年”放后文交代。）""",
    "时间地点直切": """从地点、一个不起眼的人或一个具体细节平铺开场，年份别甩在最前。适合事件型/制度型选题。
范例：
> 汴京城的雪下了整整一个月。守城的兵丁早断了粮，城外的金军却越围越厚。这是北宋的最后一年——只是城里的天子，当时还没意识到自己即将成为亡国之君。（“靖康二年/1127”后置。）""",
    "名将反衬": """先列同时代耀眼人物，再“但今天要讲的不是他们”，抛矛盾，最后点名主角。适合群星里的冷门人。
范例：
> 元末明初，群雄逐鹿，猛将如云，徐达有勇有谋，常遇春骁勇善战，将星璀璨，很耀眼——但今天要讲的不是他们，而是一个很冷门的武将。此人身材高大，面色如铁，大字不识一个，却让无数读书人心甘情愿为之效力；他战功赫赫，让敌军闻风丧胆，最后却死在了自己人的手里。这个人，就是胡大海。""",
    "反差问题": """用一个“您可能不信”或“说句扫兴的”把读者勾住，再戳穿谣言或常识。适合祛魅类选题。
范例：
> 您要是看多了野史，多半相信萧皇后这辈子被六个男人轮番霸占，从隋炀帝一直转手到唐太宗。可这事儿，正史里查无所考，多半是后人编的。""",
    "物件切入": """从一件出土物、一件器物或一个具体细节起笔。适合有实物可依的选题。
范例：
> 首里城正殿的梁上，挂着一口青铜大钟，钟身铸着四个字——“万国津梁”。铸它的，是太平洋上一个没有强大水师的小岛国：琉球。可就是这么个小地方，曾把自家港口借给半个东亚做生意。（“1458年/尚泰久王”后置。）""",
}

ENDING_STYLES = {
    "比喻收住": "把大命题比作一个具体事物（一扇门、一杆秤），一句比喻自然收住，不再展开。",
    "引名言落地": "引一句贴题的名言或古人原话，最后落回本篇主角/事件本身，不拔高。如引沈家本“力求情法两尽”，落到“于情于法，已然两尽了”。",
    "配诗感慨": "配一首合适的旧诗或自拟七绝，再一两句感慨收束。注意：素材里实在没有贴题的诗、也拟不出好的，就退而用一句比喻收住，绝不硬凑。",
    "意象一锤": "抓住全篇贯穿意象层层递进，最后一锤收在意象上（如全篇是“火”，收到“真正烧不掉的，从来不是一张像不像皇帝的脸”）。不配诗。",
    "以古鉴今": "提炼一条规律，点到即止，不强行拔高煽情，不对读者喊话。",
    "戛然而止": "不收口。收在一个具体物件、一阵静默、一句引文（不点评）、一个没说完的画面或一个戛然而止的动作上，不把话说圆。",
}


# ----- 第3步：写正文 -----
ARTICLE_PROMPT_TEMPLATE = """我叫老达子，是一位经验丰富的历史事件解说评论专家。
请根据以下研究素材和大纲，生成一篇可在公众号发表的文章。

## 研究素材（基于实际搜索结果，引用时请标注来源）：
{research}

## 文章大纲：
{outline}

---
## 要求： 
1、确保新生成的内容与整体主题相关，绝对不允许杜撰或虚构，注意不要查询自媒体的文章，不要查询《三国演义》等演义小说，要找有权威的史料、古书等，可引用史料记录的原文。
2、开头的前言不超过300字，具体写法按下文"本篇开头切法"执行，末句自然带出主角/主线。
3、输出文案要通俗易懂，不要有AI语言的生硬感，要像《知乎》大V一样讲历史。
4、避免使用机械化的连接词（如“首先”“其次”“然后”），改用更具连贯性的自然过渡；句子忽长忽短，以短句为主，偶用长句蓄势，避免过于整齐的句式。在叙述数据或结论时补充背景信息，并通过问题引导或自然承接实现段落切换，避免生硬跳转。
5、请记住，你的回答必须基于事实，不能编造。并且不能照搬别人的话，需要用自己的语言重新描述一遍。（除了引用，引用要遵循MLA格式）写作风格界于书面学术写作和口语描述之间。保证所有的句子都要有主语，不要用复杂的长难句，尽量用短句输出。替换掉所有的非日常词汇。将所有的句子过度词和连接词替换为最基础最常用的词语。尽量使用简单、直接的表达方式避免使用复杂或生僻的词汇。确保句子之间的逻辑关系清晰。
6、文章要发布在公众号平台的，内容要符合自媒体平台的规则，对于敏感词、限制词要进行规避或者用拼音、emoj表情代替
7、注意把那些“顶层设计”、“闭环”之类的词换成更符合历史语境的表达，并加入一些只有深入读过原典（如《明实录》具体卷数）才能发现的冷门细节。
8、要有深度和独特的个人见解，尽量少用大家，你等等词语，焦点在客观的解读历史本身，但是一定要保持客观公正，不要过度解读、不要过分夸张。
9、字数要求3000字左右。
10、文章要生成几个小标题。
12、部分词汇替换：“起初”提换成“刚开始”、“并非如此”替换成“并不是这样”，“皆言”替换成“都说”，“极大”替换成“非常大”，“无人知晓”替换成“没人知道”，“更要命的是”替换成“更关键的是”，“仅仅因为”替换成“就因为”，“数倍”换成“好几倍”，“其核心”替换成“它的核心”，“所有诏令皆由她出”改成“所有诏令都是由她出的”，“仅限于在最后盖个章”替换成“也就是在最后盖个章”
13、AI味的表达：汉文帝刘恒的皇位，来得颇具戏剧性，修改之后：“汉文帝刘恒的皇位，来得很有戏剧性”
14、【全局频率限制】无论采用哪种策略，正文部分（不含前言和"老达子说"）的现代映射总计不超过3次。每次出现后，至少间隔300字才可出现下一次。映射是调味料，不是主菜——用多了读者会腻，历史本身的质感也会被稀释。
15、不要写成"总结三条经验"或"教你几招"的列表体。不列点、不编号、不用"第一……第二……第三……"的结构。映射应该是一段连贯的、有画面感的文字，让读者自己去对号入座。好的收束映射像一面镜子——你把它放在那里，读者自己照。坏的收束映射像一张处方——你告诉读者该吃什么药。**
- 禁止使用任何显性编号、分层标记（如'第一层/第二层'、'其一/其二'、'首先/其次/最后'），逻辑关系通过句子本身的连接词和段落顺序体现。

## 四、本篇开头与结尾（已为本篇指定，照做，不要自选其他切法）

先看这篇的脊梁（反差点/主线/意象）是什么，再把指定的切法用出只属于这篇的味道。

### 本篇开头切法：【{opening_style_name}】（前言不超过300字）
{opening_style_desc}

**开头铁律**：
- 别用日期戳起手——不管是“公元/公元前X年”，还是“至正/天宝/崇祯X年”这类年号（哪怕后面跟个“也就是公元X年”也不行）。具体年份/年号一律后置到第二三段交代，除非这年本身就是本篇的爆点（如“公元536年，史家公认人类最可怕的一年”）。
- 范例只示范切法，真写时按第1步查到的真实史料和本篇脊梁来定，别照抄范例的人名和场景。
- 末句自然带出主角/主线。

### 本篇结尾收法：【{ending_style_name}】
{ending_style_desc}

**结尾铁律**：
- ❌ 对仗金句收：“X 可以死，Y 可以活”“活得滋润，代价是交了命”这种工整升华句。
- ❌ 回响/升华收：“那声脆响，到今天还在响”“这，或许就是历史给我们的交代”“种子长成它原本的模样”——把话说圆、把意升华的收法。
- ❌ “下次你/以后你…”对读者喊话说教收尾。
- ✅ 不必把话说圆：允许收在一个具体物件、一阵静默、一句引文（不点评）、一个没说完的画面上。

## 输出文案案例：
文｜老达子
> 本文共3023字，阅读时长大约6分钟

# 前言
按照上面指定的本篇开头切法写

# 被按住的刹车片
关于大革命的失败，教科书里通常会提到陈独秀的右倾投降主义。给人的印象是：蒋介石都要杀人了，陈独秀还软弱退让，把刀递给了对手。
早在1926年，当国民党右派开始在各地限制工农运动时，陈独秀就已经嗅到了危险。他不止一次向共产国际提议：中共应该退出国民党，独立发展，自己搞武装，哪怕去当反对党也好过当童养媳。
在莫斯科看来，那时的中共太弱小，必须寄生在国民党这个躯壳里。
于是，我们看到了荒诞的一幕：
当前线的革命者被屠杀时，陈独秀拿着共产国际代表罗易带来的最高指示《共产国际执行委员会第七次扩大全会关于中国问题的决议》。这份决议勒令中共：不准退出国民党，要在大海里学会游泳，要去驯服国民党。
陈独秀成了那个背锅的人。但实事求是地讲，那一次的右，不是因为我们想投降，而是因为我们太听话。那是中国革命交的第一笔昂贵学费。

# 从一个极端到另一个极端
1930年之后，随着那批被称为“二十八个半布尔什维克”的留苏学生掌权，一种更可怕的教条主义笼罩了红军。
这帮年轻人的逻辑很简单，苏联是老大哥，苏联的十月革命是先在城市暴动，然后夺取政权的。既然苏联这么干成功了，我们中国照抄作业还能错吗？
谁敢说中国情况特殊，谁就是狭隘经验主义，就是山沟沟里的土包子。
这里不得不提那个拿着地图搞微操的德国顾问李德。
在李德的回忆录《中国纪事》里，他依然觉得自己很委屈。但他可能永远无法理解，为什么他在欧洲军事学院里学的正规战，到了中国江西的山沟里会变成灾难。
李德来了之后，红军不打游击了。他要求红军搞正规化，要挖碉堡，要打阵地战，提出了所谓的短促突击。
想象一下这个画面：装备极差、子弹都金贵的红军战士，被命令去和全副美式、德式装备的国民党中央军拼消耗、拼阵地。
这就是第五次反围剿。
在博古和李德的指挥下，红军不再穿插迂回，而是搞“御敌于国门之外”。结果呢？《中国共产党历史》里记载的数据触目惊心：红军主力从8万6千人，一路打，一路死，长征出发没多久，湘江一战，血染江水，队伍锐减到3万多人。
当时在中央苏区，连盐都吃不上了，可上海的临时中央还在发文件，指责山里的同志右倾，命令他们去攻打长沙、攻打武汉这些中心城市。

# 那个切断电话线的夜晚
1935年1月，遵义会议。
这次会议之所以伟大，不仅仅是因为它确立了毛泽东的领导地位，更重要的是，它在事实上完成了一次断奶。
有一个非常有意思的历史细节：在长征初期，红军的大功率电台因为战斗损坏（也有说法是密码本和联络问题），导致中共中央和共产国际的无线电联系中断了。
在很长一段时间里，莫斯科的指示发不过来，我们也汇报不上去。
这在当时看起来是天大的灾难，但事后看，这简直是天佑中华。
没有了那个喋喋不休的远程指挥，没有了那些脱离实际的最高指示，此时此刻，这支只剩下3万人的残兵败将，必须自己决定自己的命运了。
“鞋子合不合脚，只有脚知道。”
博古当时很痛苦，他在最后交权的时候，看着满地的伤兵，不得不承认：李德的那一套洋战法，在中国的山沟里行不通。
重新掌握指挥权的毛泽#东，没有那些花里胡哨的军事术语。他的战法土得掉渣，但实用得可怕：打得赢就打，打不赢就走。
于是有了四渡赤水。
这在正规军校毕业生李德看来，简直是瞎胡闹，部队在赤水河两岸来回穿插，看似毫无章法，今天东明天西。但就是这种走出来的战机，把蒋介石的几十万大军拖得晕头转向，硬生生地从死局里盘活了一条生路。
这一刻，中国革命才真正成年了。
我们不再是谁的支部，不再是谁的棋子。我们开始用中国人的脑子，思考中国的问题。

# 老达子说
按照上面指定的本篇结尾收法写

"""

# ----- revise 模式独立 prompt -----
REVISE_PROMPT_TEMPLATE = """你是老达子，一位经验丰富的历史事件解说评论专家。

以下是原文章：

{article}

以下是史实校验的修改意见：

{feedback}

请根据以上修改意见，对文章进行改写。要求：
1. 严格按照修改意见修正史实错误，不要遗漏任何一条。
2. 保持原文的写作风格和格式不变（通俗口语化，短句为主，设问过渡）。
3. 保持原文的贯穿线索、开头切法和结尾收法不变。
4. 只改需要改的地方，没被提及的部分保持原样。
5. 改写后仍然保持3000字左右的篇幅。
6. 如果修改意见指出某处引用有误，请替换为正确引用。
7. 改写后的内容仍然要符合公众号发布规范，规避敏感词。
8. 继续遵循：不用"首先其次然后"、不用"大家""你"、不列点不编号、现代映射不超过3次且间隔300字。
"""


# ========== 核心函数（3步） ==========

def step1_research(topic):
    """第1步：研究 → 拆解 + 搜索原典/史料/评点（一次 Google Search grounding 调用）"""
    prompt = RESEARCH_PROMPT_TEMPLATE.format(topic=topic)
    return call_gemini(prompt, use_grounding=True)


def step2_synthesize(topic, all_research, topic_type=None, thread_device="意象"):
    """第2步：立论 + 现场设计大纲。题型未指定时由模型自判，贯穿手法由调用方传入"""
    if topic_type:
        topic_type_block = f"本篇题型已指定为【{topic_type}】。"
    else:
        topic_type_block = (
            "先自判本篇属于哪种题型：人物祛魅 / 事件重述 / 制度解读 / 翻案祛谣 / 风俗异域"
            "（都不贴就自命名一个），并在输出里标注。"
        )
    prompt = SYNTHESIZE_PROMPT_TEMPLATE.format(
        topic=topic,
        all_research=all_research,
        topic_type_block=topic_type_block,
        thread_device_name=thread_device,
        thread_device_desc=THREAD_DEVICES[thread_device],
    )
    return call_gemini(prompt, thinking_budget=10000)


def step3_write_article(outline, all_research, opening_style, ending_style):
    """第3步：写正文（基于研究阶段的真实素材），生成即终稿。开头/结尾切法由调用方指定"""
    prompt = ARTICLE_PROMPT_TEMPLATE.format(
        research=all_research,
        outline=outline,
        opening_style_name=opening_style,
        opening_style_desc=OPENING_STYLES[opening_style],
        ending_style_name=ending_style,
        ending_style_desc=ENDING_STYLES[ending_style],
    )
    return call_gemini(prompt, thinking_budget=10000)


def revise_article(article, feedback):
    """根据用户反馈改写文章"""
    prompt = REVISE_PROMPT_TEMPLATE.format(article=article, feedback=feedback)
    return call_gemini(prompt, thinking_budget=10000)


def save_to_gcs(content, filename):
    """保存到 Google Cloud Storage"""
    storage_client = storage.Client(project=PROJECT_ID)
    bucket = storage_client.bucket(GCS_BUCKET)

    from datetime import datetime
    date_str = datetime.now().strftime("%Y-%m-%d")
    blob_name = f"articles/{date_str}/{filename}"

    blob = bucket.blob(blob_name)
    blob.upload_from_string(content, content_type="text/markdown; charset=utf-8")

    return f"gs://{GCS_BUCKET}/{blob_name}"


# ========== Cloud Functions 入口 ==========

def generate(request):
    """
    Cloud Functions HTTP 入口

    请求格式（POST JSON）：
    {
        "topic": "选题标题",
        "mode": "full" | "outline" | "revise",
        "article": "原文（revise 模式需要）",
        "feedback": "修改意见（revise 模式需要）",
        "opening_style": "可选，开头切法名（不传则随机抽取）",
        "ending_style": "可选，结尾收法名（不传则随机抽取）",
        "topic_type": "可选，题型（不传则模型自判）",
        "thread_device": "可选，贯穿手法名（不传则随机抽取）"
    }

    mode 说明：
    - full:    完整3步流水线（研究 → 大纲 → 正文）
    - outline: 研究到大纲（1→2），2步
    - revise:  根据用户反馈改写，1步
    """
    try:
        request_json = request.get_json(silent=True)
        if not request_json:
            return jsonify({"error": "请传入 JSON 数据"}), 400

        topic = request_json.get("topic", "").strip()
        mode = request_json.get("mode", "full").strip()

        if not topic:
            return jsonify({"error": "缺少 topic 参数"}), 400

        # 开头/结尾切法：可由调用方指定（批量生成时由调用方排班轮换），未指定时随机抽取
        opening_style = (request_json.get("opening_style") or "").strip() or None
        ending_style = (request_json.get("ending_style") or "").strip() or None

        if opening_style and opening_style not in OPENING_STYLES:
            return jsonify({"error": f"opening_style 无效，可选：{'、'.join(OPENING_STYLES)}"}), 400
        if ending_style and ending_style not in ENDING_STYLES:
            return jsonify({"error": f"ending_style 无效，可选：{'、'.join(ENDING_STYLES)}"}), 400

        # 题型与贯穿手法：题型不传则模型自判，贯穿手法不传则随机抽取
        topic_type = (request_json.get("topic_type") or "").strip() or None
        thread_device = (request_json.get("thread_device") or "").strip() or None

        if topic_type and topic_type not in TOPIC_TYPES:
            return jsonify({"error": f"topic_type 无效，可选：{'、'.join(TOPIC_TYPES)}"}), 400
        if thread_device and thread_device not in THREAD_DEVICES:
            return jsonify({"error": f"thread_device 无效，可选：{'、'.join(THREAD_DEVICES)}"}), 400

        # ---------- revise 模式（独立流程）----------
        if mode == "revise":
            article = request_json.get("article", "").strip()
            feedback = request_json.get("feedback", "").strip()

            if not article or not feedback:
                return jsonify({"error": "revise 模式需要 article 和 feedback 参数"}), 400

            t0 = time.time()
            revised, _ = revise_article(article, feedback)
            t1 = time.time()
            gcs_url = save_to_gcs(revised, f"{topic}.md")

            return jsonify({
                "status": "success",
                "mode": "revise",
                "topic": topic,
                "timings": {"revise": round(t1 - t0, 1)},
                "article": revised,
                "saved_to": gcs_url,
            })

        # ===== 以下为 full/outline 共用流水线 =====

        # 第1步：研究（拆解 + 三层素材搜索）
        t0 = time.time()
        all_research, _ = step1_research(topic)
        t1 = time.time()
        print(f"  Step 1 研究 {t1 - t0:.1f}s")

        # 第2步：立论 + 现场设计大纲
        if thread_device is None:
            thread_device = random.choice(list(THREAD_DEVICES))
        print(f"  题型【{topic_type or '模型自判'}】 贯穿【{thread_device}】")

        outline, _ = step2_synthesize(topic, all_research, topic_type, thread_device)
        t2 = time.time()
        print(f"  Step 2 综合大纲 {t2 - t1:.1f}s")
        outline_url = save_to_gcs(outline, f"{topic}_大纲.md")

        # ---------- outline 模式：到第2步为止 ----------
        if mode == "outline":
            return jsonify({
                "status": "success",
                "mode": "outline",
                "topic": topic,
                "styles": {"topic_type": topic_type or "模型自判", "thread": thread_device},
                "timings": {
                    "step1_research": round(t1 - t0, 1),
                    "step2_synthesize": round(t2 - t1, 1),
                    "total": round(t2 - t0, 1),
                },
                "research": all_research,
                "outline": outline,
                "saved_to": outline_url,
            })

        # 第3步：写正文（终稿，不再自查）
        # 未指定切法时随机抽取——破除"每次相同 prompt → 收敛到同一种开头/结尾"的模板化
        if opening_style is None:
            opening_style = random.choice(list(OPENING_STYLES))
        if ending_style is None:
            # 贯穿手法不是"意象"时，没有可锤的意象，把"意象一锤"从随机池里剔掉
            ending_pool = [e for e in ENDING_STYLES if e != "意象一锤" or thread_device == "意象"]
            ending_style = random.choice(ending_pool)
        print(f"  切法：开头【{opening_style}】 结尾【{ending_style}】")

        article, _ = step3_write_article(outline, all_research, opening_style, ending_style)
        t3 = time.time()
        print(f"  Step 3 写正文 {t3 - t2:.1f}s")

        article_url = save_to_gcs(article, f"{topic}.md")
        metrics = count_metrics(article)

        return jsonify({
            "status": "success",
            "mode": "full",
            "topic": topic,
            "styles": {
                "opening": opening_style,
                "ending": ending_style,
                "thread": thread_device,
                "topic_type": topic_type or "模型自判",
            },
            "timings": {
                "step1_research": round(t1 - t0, 1),
                "step2_synthesize": round(t2 - t1, 1),
                "step3_article": round(t3 - t2, 1),
                "total": round(t3 - t0, 1),
            },
            "research": all_research,
            "outline": outline,
            "article": article,
            "metrics": metrics,
            "outline_saved_to": outline_url,
            "article_saved_to": article_url,
        })

    except Exception as e:
        print(f"错误: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
