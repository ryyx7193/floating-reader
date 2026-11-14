'use strict';
/* 文本解码：本地 txt 与书源页面的乱码，根源都是「猜错编码」。
   这里把判断集中成一处，覆盖真实会遇到的两种情况：
     ① 带 BOM 的文件（Windows 记事本另存的 UTF-8 / UTF-16）—— BOM 是明牌，照它解就行；
     ② 没有 BOM 的老文本：先用 TextDecoder 的 **fatal 严格模式**验 UTF-8
        （比数 \uFFFD 可靠：GBK 文本被当 UTF-8 解往往产出的是别的字而不是替换符），
        不通过再在 GB18030 与 Big5 之间用「高频常用字命中数」投票 ——
        GB18030 几乎不会解出替换符（它是四字节编码，字节面很宽），
        所以「谁解出的常用字多」比「谁的替换符少」更能分辨简体/繁体老文本。
   为什么不引 jschardet：本项目运行时依赖只有 cheerio + iconv-lite（加依赖要先问用户），
   而中文场景真正会遇到的编码收敛得很快，判断力够用。 */
let iconv = null;
try { iconv = require('iconv-lite'); } catch (e) { iconv = null; }

const SAMPLE = 16384;   // 只采样前 16KB 投票，避免大文件被反复整体解码
// 高频常用字 + 中文标点：哪个候选能把它们解出来，就更可能是对的编码
const COMMON = '的一是不了在人有我他这个们中来上大为和国地到以说时要就出会可也你对生能而子那得于着下自之年过发后作里用道行所然家种事成方多经么去法学如都同现当没动面起看定天分还进好小部其些主样理心她本前开但因只从想实日军者意无力它与长把机十民第公此已工使情明性知全三又关点正业外将两高间由问很最重并物手应战向头文体政美相见被利什二等产或新己制身果加西斯月话合回特代内信表化老给世位次度门任常先海通教儿原东声提立及比员解水名真论处走义各入几口认条平系气题活尔更别打女变四神总何电数安少报才结反受目太量再感建务做接必场件计管期市直德资命山金指克许统区保至队形社便空决治展马科司五基眼书非则听白却界达光放强即像难且权思王象完设式色路记南品住告类求据程北边死张该交规万取拉格望觉术领共确传师观清今切院让识候带导争运笑飞风步改收根干造言联持组每济车亲极林服快办议往元英士证近失转夫令准布始怎呢存未远叫台单影具罗字爱击流备兵连调深商算质团集百需价花党华城石级整府离况亚请技际约示复病息究线似官火断精满支视消越器容照须九增研写称企八功吗包片史委乎查轻易早曾除农找装广显吧阿李标谈吃图念六引历首医局突专费号尽另周较注语仅考落青随选列武红响虽推势参希古众构房半节土投某案黑维革划敌致陈律足态护七兴派孩验责营星够章音跟志底站严巴例防族供效续施留讲型料终答紧黄绝奇察母京段依批群项故按河米围江织害斗双境客纪采举杀攻父苏密低朝友诉止细愿千值仍男钱破网热助倒育属坐帝限船脸职速刻乐否刚威毛状率甚独球般普怕弹校苦创假久错承印晚兰试股拿脑预谁益阳若哪微尼继送急血惊伤素药适波夜省初喜卫源食险待述陆习置居劳财环排福纳欢雷警获模充负云停木游龙树疑层冷洲冲射略范竟句室异激汉村哈策演简卡罪判担州静退既衣您宗积余痛检差富灵协角占配征修皮挥胜降阶审沉坚善妈刘读啊超免压银买皇养伊怀执副乱抗犯追帮宣佛岁航优怪香著田铁控税左右份穿艺背阵草脚概恶块顿敢守酒岛托央户烈洋哥索胡款靠评版宝座释景顾弟登货互付伯慢欧换闻危忙核暗姐介坏讨丽良序升监临亮露永呼味野架域沙掉括舰鱼杂误湾吉减编楚肯测败屋跑梦散温困剑渐封救贵枪缺楼县尚毫移娘朋画班智亦耳恩短掌恐遗固席松秘谢鲁遇康虑幸均销钟诗藏赶剧票损忽巨炮旧端探湖录叶春乡附吸予礼港雨呀板庭妇归睛饭额含顺输摇招婚脱补谓督毒油疗旅泽材灭逐莫笔亡鲜词圣择寻厂睡博勒烟授诺伦岸奥唐卖俄炸载洛健堂旁宫喝借君禁阴园谋宋避抓荣姑孙逃牙束跳顶玉镇雪午练迫爷篇肉嘴馆遍凡础洞卷坦牛宁纸诸训私庄祖丝翻暴森塔默握戏隐熟骨访弱蒙歌店鬼软典欲萨伙遭盘爸扩盖弄雄稳忘亿刺拥徒姆杨齐赛趣曲刀床迎冰虚玩析窗醒妻透购替塞努休虎扬途侵刑绿兄迅套贸毕唯谷轮库迹尤竞街促延震弃甲伟麻川申缓潜闪售灯针哲络抵朱埃抱鼓植纯夏忍页杰筑折郑贝尊吴秀混臣雅振染盛怒舞圆搞狂措姓残秋培迷诚宽宇猛摆梅毁伸摩盟末乃悲拍丁赵坚竭译候娃淡添汤摄乌颜乳矩苍绕辈乌漏杜鹰熊徐厉'
  + '，。！？、；：“”‘’（）《》';

function countHits(s){
  let hits = 0;
  const lim = Math.min(s.length, 4000);
  for (let i = 0; i < lim; i++) if (COMMON.indexOf(s[i]) >= 0) hits++;
  return hits;
}

// UTF-8 严格校验：失败（含 GBK 文本）返回 null，成功直接给出解码结果
function strictUtf8(buf){
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) { return null; }
}

/* 无 BOM 的 UTF-16 判定：不能看「奇数字节是不是 0」——那套只对英文成立，
   中文码位（如 U+8FD9）高字节根本不是 0，实测直接把中文 UTF-16 文本漏判。
   改用「按 UTF-16 解开后，有多大比例落在正常字符区」（ASCII / 汉字 / 中文标点 / 假名 / 谚文）。
   UTF-16 文本能到 ~100%；而 GBK、Big5 的字节被硬当 UTF-16 解，会散到私用区、控制区，
   实测合法率只有四成左右 —— 0.9 的门槛两边都留足了余量。 */
function isLegitCp(cp){
  if (cp === 0x09 || cp === 0x0A || cp === 0x0D) return true;   // 制表 / 换行
  if (cp >= 0x20 && cp <= 0x7E) return true;                   // 可打印 ASCII
  if (cp >= 0x4E00 && cp <= 0x9FFF) return true;               // CJK 统一汉字
  if (cp >= 0x3000 && cp <= 0x303F) return true;               // 中文标点
  if (cp >= 0xFF00 && cp <= 0xFFEF) return true;               // 全角字符
  if (cp >= 0x2000 && cp <= 0x206F) return true;               // 通用标点
  if (cp >= 0x3040 && cp <= 0x30FF) return true;               // 日文假名
  if (cp >= 0xAC00 && cp <= 0xD7AF) return true;               // 谚文
  if (cp >= 0xD800 && cp <= 0xDFFF) return true;               // 代理对（成对性交给解码器）
  return false;
}

function utf16LegitRatio(buf, little){
  const n = Math.min(buf.length, SAMPLE) & ~1;   // 只取偶数长度，避免末尾半个码元
  if (n < 4) return 0;
  let ok = 0, total = 0;
  for (let i = 0; i + 1 < n; i += 2) {
    const cp = little ? (buf[i] | (buf[i + 1] << 8)) : ((buf[i] << 8) | buf[i + 1]);
    total++;
    if (isLegitCp(cp)) ok++;
  }
  return total ? ok / total : 0;
}

function looksUtf16(buf, little){
  return utf16LegitRatio(buf, little) > 0.9;
}

function stripBom(s){ return s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s; }

/* UTF-16BE 解码（没装 iconv 时用 swap16 兜底）。
   两处要注意：① 不能原地 swap16 —— 那会改掉调用方传进来的 buf；
   ② 奇数长度会让 swap16 直接抛，而本模块承诺「永不抛」，所以先裁掉尾部那个孤字节。 */
function decodeUtf16be(buf){
  if (iconv) return iconv.decode(buf, 'utf16be');
  const b = Buffer.from(buf.length & 1 ? buf.subarray(0, buf.length - 1) : buf);
  return b.swap16().toString('utf16le');
}

/* 「中文反证」—— UTF-16 的合法率会对纯中文的老编码文本误报（V4.3.33 修的真缺陷）：
   GBK/Big5 的中文双字节只要高字节落在 0xAC~0xDF，被当 UTF-16BE 解出的码位就正好
   落在谚文区（AC00~D7AF）或代理对区（D800~DFFF）—— 而这两段在 isLegitCp 里都算「合法」。
   于是「整篇纯中文、一个 ASCII 都没有」的 GBK 文本，BE 合法率能冲到 0.9 以上被判成 UTF-16BE，
   整篇解出韩文（实测：27 字 GBK 句子 BE 合法率 0.926，常用字命中 26 → 0）。
   真 UTF-16 文本不会出现「UTF-16 解出的常用字几乎为零、老编码却能解出一堆」的反差，
   所以用常用字命中数一票否决：老编码解得更像中文，就不认 UTF-16。
   （要求 legacy >= 3 是避免误伤英文/韩文这类本来就没有常用汉字的真 UTF-16 文本。） */
function legacyFitsBetter(buf, decoded16){
  if (!iconv) return false;   // 无从反证，保持原行为
  const sample = buf.slice(0, Math.min(buf.length, SAMPLE));
  const h16 = countHits(decoded16);
  const legacy = Math.max(countHits(iconv.decode(sample, 'gb18030')), countHits(iconv.decode(sample, 'big5')));
  return legacy >= 3 && legacy > h16;
}

/* 主入口：把一个 Buffer 解成文本。永远返回字符串（最坏情况也是尽力而为的结果，不抛）。 */
function decodeBuffer(buf){
  if (!Buffer.isBuffer(buf)) buf = Buffer.from(buf || '');
  if (!buf.length) return '';
  // ① BOM 是明牌
  if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) return stripBom(buf.slice(3).toString('utf8'));
  if (buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xFE) return stripBom(buf.slice(2).toString('utf16le'));
  if (buf.length >= 2 && buf[0] === 0xFE && buf[1] === 0xFF) {
    return stripBom(decodeUtf16be(buf.subarray(2)));
  }
  // ② 无 BOM：先看像不像 UTF-16（但要过「中文反证」），再做严格 UTF-8
  if (looksUtf16(buf, true)) {
    const dec = stripBom(buf.toString('utf16le'));
    if (!legacyFitsBetter(buf, dec)) return dec;
  }
  if (looksUtf16(buf, false)) {
    const dec = stripBom(decodeUtf16be(buf));
    if (!legacyFitsBetter(buf, dec)) return dec;
  }
  const utf8 = strictUtf8(buf);
  if (utf8 !== null) return stripBom(utf8);
  // ③ 中文老编码二选一：GB18030 / Big5 用采样命中率投票（简体优先，票数相同也走 GB18030）
  if (!iconv) return buf.toString('utf8');   // 没装 iconv 只能尽力而为
  const sample = buf.slice(0, Math.min(buf.length, SAMPLE));
  const b5 = countHits(iconv.decode(sample, 'big5'));
  const gb = countHits(iconv.decode(sample, 'gb18030'));
  return iconv.decode(buf, b5 > gb ? 'big5' : 'gb18030');
}

module.exports = { decodeBuffer, looksUtf16, utf16LegitRatio, isLegitCp, strictUtf8, countHits, decodeUtf16be, legacyFitsBetter };
