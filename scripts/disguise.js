// 老板模式（伪装层）—— 把主窗内容整体盖成一屏「看起来在工作」的画面。
// 三种皮肤：word（办公文档）/ code（代码编辑器）/ sheet（数据表格）。
// 这里只负责「画」和「擦」；开关状态、快捷键、设置面板由 app.js 统一管。
// 内容全是写死的假数据，不含任何用户真实数据。
/* 🆕 V4.3.41：内容大扩充 —— 目标是「短时间内划不完」：
   · word：整季 13 份周报汇编（~1.3 万字、数十屏），文首带汇总表与目录，字数/页数实算；
   · code：6 个模块 ~700 行「运维自动化工具」源码，行号 / 状态栏 Ln 实算；
   · sheet：整季 13 周的工时流水 260 行，公式区间 / 求和 / 均值 / 计数全部实算（数字必须对得上）。
   所有内容都是**确定性生成**（固定种子、无随机）：刷新后内容一致，才不会穿帮。 */
(function () {
    const SKINS = ['word', 'code', 'sheet'];

    function esc(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    /* V4.3.97：原 `det()` 确定性伪随机函数已 0 调用并删除。
       当前伪装素材走「素材池 + 确定性轮转」，同样不用 Math.random —— 内容稳定不穿帮。 */

    /* 极简上色：只求「看着像代码」。
       🟥 V4.3.33b 修：占位符方案（先 mark 后还原），避免关键字 `class` 把高亮标签再包一层。 */
    function hl(src) {
        const parts = [];
        const mark = (html) => { parts.push(html); return '\u0001' + String.fromCharCode(0xE000 + parts.length - 1) + '\u0001'; };
        let s = esc(src);
        s = s.replace(/('[^']*'|"[^"]*"|`[^`]*`)/g, m => mark('<i class="dg-s">' + m + '</i>'));
        s = s.replace(/(\/\/[^\n]*)/g, m => mark('<i class="dg-c">' + m + '</i>'));
        s = s.replace(/\b(const|let|var|function|return|if|else|await|async|require|new|for|of|try|catch|throw|class|this)\b/g, m => mark('<i class="dg-k">' + m + '</i>'));
        s = s.replace(/\b(\d+)\b/g, m => mark('<i class="dg-n">' + m + '</i>'));
        s = s.replace(/\b([a-zA-Z_$][\w$]*)(\()/g, (m, a) => mark('<i class="dg-f">' + a + '</i>') + '(');
        return s.replace(/\u0001([\uE000-\uF8FF])\u0001/g, (m, c) => parts[c.charCodeAt(0) - 0xE000] || '');
    }

    /* 纯文本长度（去标签）—— word 状态栏的「字数」实算用。 */
    function textLen(html) {
        return html.replace(/<[^>]+>/g, '').replace(/\s+/g, '').length;
    }

    // ================== 皮肤一：办公文档 ==================
    // 2026 Q3（6/29 ~ 9/27）共 13 周的周报汇编。素材池 + 确定性轮转，每周内容不同。
    const WEEKS = 13;
    const WEEK_MON = [];                       // 每周周一日期（6/29 起）
    (function () {
        const base = new Date(2026, 5, 29);    // 2026-06-29 周一
        for (let w = 0; w <= WEEKS; w++) {     // 🛡 V4.3.41：多生成一项 —— 最后一份周报的「结束日」要用第 14 周的周一
            const d = new Date(base.getTime() + w * 7 * 86400000);
            WEEK_MON.push((d.getMonth() + 1) + '月' + d.getDate() + '日');
        }
    })();

    const P_POOL = [                           // 「本周工作进展」素材池
        '完成生产环境数据库巡检，慢查询数量较上周继续下降，未发现阻塞性会话。',
        '配合业务部门完成「客户信息管理系统」需求评审，输出评审纪要与待确认项清单。',
        '处理运维工单若干件（含紧急工单），全部在承诺时限内闭环。',
        '完成本月安全基线核查，对中风险项逐项落实整改责任人。',
        '更新《日常巡检记录表》与《变更台账》，补齐历史遗漏记录。',
        '完成备份作业抽查恢复演练，恢复点目标（RPO）与恢复时间目标（RTO）均满足要求。',
        '对核心交换机进行固件升级，升级窗口内业务无感知。',
        '梳理账号权限清单，回收离职转岗账号，关闭长期未使用的高权限入口。',
        '完成虚拟化平台容量评估，输出扩容建议与预算估算。',
        '跟进等级保护测评整改项，完成技术部分材料编写。',
        '优化日志采集管道，磁盘占用下降明显，检索延迟明显改善。',
        '组织一次故障复盘会，输出改进项并全部指派到人、明确时限。'
    ];
    const R_POOL = [                           // 「存在的问题与风险」素材池
        '备份策略仍为每日全量，存储占用增长较快，建议调整为「每周全量 + 每日增量」。',
        '部分历史系统缺少监控覆盖，故障发现依赖人工上报，存在响应延迟风险。',
        '跨部门流程仍以邮件流转为主，建议统一到工单系统，便于留痕与统计。',
        '部分老旧服务器备件停产，故障后修复周期不可控，需纳入更换计划。',
        '文档与实际配置存在滞后，建议将配置变更与文档更新纳入同一变更单。',
        '关键岗位技能集中度偏高，需安排交叉培训降低单点风险。',
        '机房动环告警仍有少量误报，影响值班判断，需与厂商核对阈值。',
        '外包驻场人员流动带来的交接成本较高，建议建立标准化交接清单。'
    ];
    const N_POOL = [                           // 「下周工作计划」素材池
        '完成备份策略调整方案并提交技术评审。',
        '推进监控补齐工作，覆盖历史系统，按计划分批实施。',
        '跟进安全基线剩余项复测，输出复测报告。',
        '整理阶段运维数据，形成汇总材料。',
        '开展一次桌面运维专项，清理长期未重启终端。',
        '与厂商确认备件采购清单与到货周期。',
        '组织交叉培训第一讲，覆盖值班常用操作。',
        '核对工单系统与邮件流转的并行情况，拟定迁移方案初稿。'
    ];
    const TICKET = ['18', '21', '17', '24', '19', '23', '20', '22', '18', '25', '21', '19', '23'];
    const HOURS = ['42.5', '45.0', '40.0', '46.5', '43.5', '44.0', '41.5', '45.5', '42.0', '47.0', '43.0', '42.5', '44.5'];
    const RATE = ['100%', '100%', '96%', '100%', '100%', '95%', '100%', '100%', '97%', '100%', '100%', '96%', '100%'];

    function buildWord() {
        let html = ''
            + '<div class="dg-ribbon">'
            + '<span class="dg-logo">W</span>'
            + '<span>文件</span><span>开始</span><span>插入</span><span>布局</span><span>引用</span><span>审阅</span><span>视图</span>'
            + '<span class="dg-docname">2026年第三季度系统运维工作周报（汇编）.docx</span>'
            + '</div>'
            + '<div class="dg-page">';
        html += '<h1>2026 年第三季度系统运维工作周报</h1>'
            + '<div class="dg-meta">填报部门：信息技术部　｜　填报人：＿＿＿　｜　周期：2026-06-29 至 2026-09-27（共 ' + WEEKS + ' 周）</div>';
        // 季度概览表（数字与各周条目自洽：工单数 / 工时 / 完成率取同一数组）
        html += '<h2>季度概览</h2>'
            + '<table class="dg-tbl"><thead><tr><th>周次</th><th>周期（周一）</th><th>工单（件）</th><th>投入工时</th><th>闭环率</th></tr></thead><tbody>';
        for (let w = 0; w < WEEKS; w++) {
            html += '<tr><td>第 ' + (w + 1) + ' 周</td><td>' + WEEK_MON[w] + '</td><td class="c">' + TICKET[w] + '</td><td class="c">' + HOURS[w] + '</td><td class="c">' + RATE[w] + '</td></tr>';
        }
        let sumT = 0; TICKET.forEach(v => { sumT += Number(v); });
        let sumH = 0; HOURS.forEach(v => { sumH += Number(v); });
        html += '<tr><td colspan="2"><b>合计</b></td><td class="c"><b>' + sumT + '</b></td><td class="c"><b>' + sumH.toFixed(1) + '</b></td><td class="c">—</td></tr>'
            + '</tbody></table>';
        html += '<h2>目录</h2><ol class="dg-toc">';
        for (let w = 0; w < WEEKS; w++) html += '<li>第 ' + (w + 1) + ' 周周报（' + WEEK_MON[w] + ' 起）</li>';
        html += '</ol>';
        // 13 份周报正文
        for (let w = 0; w < WEEKS; w++) {
            const p1 = P_POOL[(w * 3) % P_POOL.length], p2 = P_POOL[(w * 3 + 1) % P_POOL.length], p3 = P_POOL[(w * 3 + 5) % P_POOL.length];
            const r1 = R_POOL[(w * 2) % R_POOL.length], r2 = R_POOL[(w * 2 + 3) % R_POOL.length];
            const n1 = N_POOL[(w * 2) % N_POOL.length], n2 = N_POOL[(w * 2 + 1) % N_POOL.length], n3 = N_POOL[(w * 2 + 5) % N_POOL.length];
            const day = new Date(new Date(2026, 5, 29).getTime() + (w * 7 + 4) * 86400000);
            const signDate = (day.getMonth() + 1) + ' 月 ' + day.getDate() + ' 日';
            html += '<h1 class="dg-w2">第 ' + (w + 1) + ' 周工作周报（' + WEEK_MON[w] + ' — ' + WEEK_MON[w + 1] + '）</h1>'
                + '<div class="dg-meta">填报部门：信息技术部　｜　填报人：＿＿＿　｜　填报日期：' + signDate + '</div>'
                + '<h2>一、本周工作进展</h2><ol>'
                + '<li>' + p1 + '</li>'
                + '<li>处理运维工单 ' + TICKET[w] + ' 件（其中紧急 ' + (1 + w % 3) + ' 件），平均响应时长 ' + (8 + w % 7) + ' 分钟，全部闭环。</li>'
                + '<li>' + p2 + '</li>'
                + '<li>' + p3 + '</li>'
                + '<li>组织组内例会 1 次，同步变更计划与值班安排，会议纪要已归档。</li>'
                + '<li>完成机房例行巡查，温湿度与 UPS 状态均在正常区间。</li>'
                + '<li>本周投入工时合计 ' + HOURS[w] + ' 小时，人员出勤正常，无加班超时情况。</li>'
                + '</ol>'
                + '<h2>二、本周关键指标</h2>'
                + '<table class="dg-tbl"><thead><tr><th>指标</th><th>本周</th><th>上周</th><th>环比</th></tr></thead><tbody>'
                + '<tr><td>工单总量（件）</td><td class="c">' + TICKET[w] + '</td><td class="c">' + TICKET[(w + WEEKS - 1) % WEEKS] + '</td><td class="c">' + (Number(TICKET[w]) >= Number(TICKET[(w + WEEKS - 1) % WEEKS]) ? '↑' : '↓') + '</td></tr>'
                + '<tr><td>投入工时（小时）</td><td class="c">' + HOURS[w] + '</td><td class="c">' + HOURS[(w + WEEKS - 1) % WEEKS] + '</td><td class="c">' + (Number(HOURS[w]) >= Number(HOURS[(w + WEEKS - 1) % WEEKS]) ? '↑' : '↓') + '</td></tr>'
                + '<tr><td>工单闭环率</td><td class="c">' + RATE[w] + '</td><td class="c">' + RATE[(w + WEEKS - 1) % WEEKS] + '</td><td class="c">—</td></tr>'
                + '<tr><td>系统健康分</td><td class="c">' + (97 - w % 5) + '</td><td class="c">' + (96 - (w + WEEKS - 1) % 5) + '</td><td class="c">—</td></tr>'
                + '</tbody></table>'
                + '<h2>三、存在的问题与风险</h2><ol>'
                + '<li>' + r1 + '</li>'
                + '<li>' + r2 + '</li>'
                + '<li>值班交接记录中发现 ' + (1 + w % 3) + ' 处描述不一致，已当面核对并更新台账。</li>'
                + '</ol>'
                + '<h2>四、下周工作计划</h2><ol>'
                + '<li>' + n1 + '</li>'
                + '<li>' + n2 + '</li>'
                + '<li>' + n3 + '</li>'
                + '<li>整理本周巡检截图与告警记录，归档到共享盘对应目录。</li>'
                + '</ol>'
                + '<h2>五、备注</h2><p>' + (w % 2 === 0
                    ? '本周例行工作均按计划推进，无需要上级协调的事项。备份作业与监控告警均正常，明细数据见共享盘《运维周数据》目录。'
                    : '本周有 ' + (1 + w % 2) + ' 次计划内变更，均在申报窗口内完成；无计划外停机。工单系统与邮件并行流转的迁移方案已在拟定，初稿下周评审。') + '</p>'
                + '<p class="dg-sign">汇报人：＿＿＿＿　　日期：' + signDate + '</p>';
        }
        html += '</div>';
        // 状态栏：字数 / 页数实算（A4 每页按 ~520 中文字估）
        const chars = textLen(html);
        const pages = Math.max(1, Math.ceil(chars / 520));
        html += '<div class="dg-status">'
            + '<span>第 1 页，共 ' + pages + ' 页</span><span>字数：' + String(chars).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '</span><span>中文(中国)</span>'
            + '<span class="dg-sp">100%</span>'
            + '</div>';
        return html;
    }

    // ================== 皮肤二：代码编辑器 ==================
    // 「运维自动化工具」6 个模块 ~700 行。tab 与状态栏的 Ln 实算。
    const CODE_FILES = [
        ['config.js', [
            '// 运维自动化工具 · 全局配置（与部署环境一一对应，改这里就够）',
            '"use strict";',
            '',
            'const path = require("path");',
            '',
            'const ENV = process.env.NODE_ENV === "prod" ? "prod" : "staging";',
            '',
            'const CONF = {',
            '    staging: {',
            '        dataRoot: path.join(__dirname, "..", "data"),',
            '        logLevel: "debug",',
            '        db: { host: "127.0.0.1", port: 5432, name: "ops_stg", pool: 8 },',
            '        alert: { webhook: "", quietHours: [[23, 0], [7, 30]] },',
            '        scan: { intervalMs: 300000, timeoutMs: 8000, concurrency: 4 }',
            '    },',
            '    prod: {',
            '        dataRoot: "/var/lib/ops-tools",',
            '        logLevel: "info",',
            '        db: { host: "10.20.0.11", port: 5432, name: "ops_prod", pool: 16 },',
            '        alert: { webhook: "https://hooks.example.com/xxx", quietHours: [[0, 0], [6, 30]] },',
            '        scan: { intervalMs: 600000, timeoutMs: 5000, concurrency: 8 }',
            '    }',
            '}[ENV];',
            '',
            'CONF.env = ENV;',
            'CONF.version = require("./package.json").version;',
            '',
            '/* 巡检项定义：name 唯一；weight 用于汇总健康分（0~10）。',
            '   增减巡检项只需要动这张表，采集器按注册顺序执行。 */',
            'CONF.checks = [',
            '    { name: "disk",        weight: 3, warn: 0.80, crit: 0.92 },',
            '    { name: "memory",      weight: 2, warn: 0.85, crit: 0.95 },',
            '    { name: "cpu-load",    weight: 2, warn: 0.75, crit: 0.90 },',
            '    { name: "slow-query",  weight: 2, warn: 20,   crit: 60   },',
            '    { name: "backup-age",  weight: 3, warn: 26,   crit: 50   },',
            '    { name: "cert-expire", weight: 2, warn: 30,   crit: 14   },',
            '    { name: "queue-depth", weight: 1, warn: 500,  crit: 2000 }',
            '];',
            '',
            'module.exports = CONF;',
            ''
        ]],
        ['logger.js', [
            '// 轻量日志：文件 + 控制台双写；主进程禁止 console，这里统一走 stderr。',
            '"use strict";',
            '',
            'const fs = require("fs");',
            'const path = require("path");',
            'const CONF = require("./config");',
            '',
            'const LOG_DIR = path.join(CONF.dataRoot, "logs");',
            'const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };',
            'let curFile = null;',
            'let curDate = "";',
            '',
            'function ensureFile() {',
            '    const d = new Date();',
            '    const key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");',
            '    if (key === curDate && curFile) return curFile;',
            '    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });',
            '    curDate = key;',
            '    curFile = path.join(LOG_DIR, "ops-" + key + ".log");',
            '    return curFile;',
            '}',
            '',
            'function write(level, tag, msg) {',
            '    if (LEVELS[level] < LEVELS[CONF.logLevel]) return;',
            '    const line = new Date().toISOString() + " [" + level.toUpperCase() + "] [" + tag + "] " + msg;',
            '    try {',
            '        fs.appendFileSync(ensureFile(), line + "\\n");',
            '    } catch (e) { /* 日志失败不能拖垮业务 */ }',
            '    if (level === "error" || level === "warn") process.stderr.write(line + "\\n");',
            '}',
            '',
            'module.exports = {',
            '    debug: (tag, msg) => write("debug", tag, msg),',
            '    info:  (tag, msg) => write("info",  tag, msg),',
            '    warn:  (tag, msg) => write("warn",  tag, msg),',
            '    error: (tag, msg) => write("error", tag, msg),',
            '    tail: function (n) {',
            '        const f = ensureFile();',
            '        if (!fs.existsSync(f)) return [];',
            '        const lines = fs.readFileSync(f, "utf8").trim().split("\\n");',
            '        return lines.slice(Math.max(0, lines.length - n));',
            '    }',
            '};',
            ''
        ]],
        ['monitors.js', [
            '// 采集器：按 config.checks 注册顺序逐项巡检，输出统一结构 { name, ok, level, value }。',
            '"use strict";',
            '',
            'const { execFile } = require("child_process");',
            'const fs = require("fs");',
            'const CONF = require("./config");',
            'const log = require("./logger");',
            '',
            'const TAG = "monitors";',
            '',
            'function run(cmd, args, timeoutMs) {',
            '    return new Promise(resolve => {',
            '        execFile(cmd, args, { timeout: timeoutMs || 5000, windowsHide: true }, (err, stdout) => {',
            '            resolve(err ? "" : String(stdout || ""));',
            '        });',
            '    });',
            '}',
            '',
            '/* disk：取各挂载点使用率的最大值。Windows 下用 wmic，Linux 下用 df。 */',
            'async function checkDisk() {',
            '    let ratio = 0;',
            '    if (process.platform === "win32") {',
            '        const out = await run("wmic", ["logicaldisk", "get", "size,freespace"], 6000);',
            '        const rows = out.trim().split("\\n").slice(1);',
            '        for (const row of rows) {',
            '            const m = row.trim().split(/\\s+/);',
            '            if (m.length < 2) continue;',
            '            const total = Number(m[0]), free = Number(m[1]);',
            '            if (total > 0) ratio = Math.max(ratio, 1 - free / total);',
            '        }',
            '    } else {',
            '        const out = await run("df", ["-P", "-k"], 4000);',
            '        for (const line of out.trim().split("\\n").slice(1)) {',
            '            const m = line.trim().split(/\\s+/);',
            '            if (m.length < 6 || !m[5].startsWith("/")) continue;',
            '            const total = Number(m[1]), used = Number(m[2]);',
            '            if (total > 0) ratio = Math.max(ratio, used / total);',
            '        }',
            '    }',
            '    return { name: "disk", value: ratio };',
            '}',
            '',
            '/* memory：读 /proc/meminfo（Linux）；Windows 用系统统计接口。 */',
            'async function checkMemory() {',
            '    let ratio = 0;',
            '    if (process.platform !== "win32") {',
            '        const txt = fs.readFileSync("/proc/meminfo", "utf8");',
            '        const get = k => { const m = new RegExp(k + ":\\\\s+(\\\\d+)").exec(txt); return m ? Number(m[1]) : 0; };',
            '        const total = get("MemTotal"), avail = get("MemAvailable");',
            '        if (total > 0) ratio = 1 - avail / total;',
            '    }',
            '    return { name: "memory", value: ratio };',
            '}',
            '',
            '/* slow-query：从监控接口拉最近 5 分钟慢查询条数。 */',
            'async function checkSlowQuery() {',
            '    const out = await run("curl", ["-sf", "http://127.0.0.1:9100/metrics/slow-query"], 4000);',
            '    const m = /(\\d+)\\s*$/.exec(out.trim());',
            '    return { name: "slow-query", value: m ? Number(m[1]) : 0 };',
            '}',
            '',
            '/* backup-age：最新备份距现在的小时数。 */',
            'async function checkBackupAge() {',
            '    const dir = CONF.dataRoot + "/backup";',
            '    let latest = 0;',
            '    try {',
            '        for (const f of fs.readdirSync(dir)) {',
            '            const st = fs.statSync(dir + "/" + f);',
            '            if (st.mtimeMs > latest) latest = st.mtimeMs;',
            '        }',
            '    } catch (e) { log.warn(TAG, "backup dir missing"); }',
            '    const hours = latest ? (Date.now() - latest) / 3600000 : 999;',
            '    return { name: "backup-age", value: hours };',
            '}',
            '',
            'const REGISTRY = { disk: checkDisk, memory: checkMemory, "slow-query": checkSlowQuery, "backup-age": checkBackupAge };',
            '',
            '/* 入口：并行跑全部注册项，按阈值给 level（ok / warn / crit）。 */',
            'async function runAll() {',
            '    const jobs = CONF.checks.map(async c => {',
            '        const fn = REGISTRY[c.name];',
            '        if (!fn) return { name: c.name, ok: true, level: "skip", value: null };',
            '        try {',
            '            const r = await fn();',
            '            const v = r.value;',
            '            let level = "ok";',
            '            if (c.crit !== undefined && v >= c.crit) level = "crit";',
            '            else if (c.warn !== undefined && v >= c.warn) level = "warn";',
            '            return { name: r.name, value: v, level, ok: level === "ok" };',
            '        } catch (e) {',
            '            log.error(TAG, c.name + " failed: " + (e && e.message));',
            '            return { name: c.name, ok: false, level: "crit", value: null };',
            '        }',
            '    });',
            '    return Promise.all(jobs);',
            '}',
            '',
            'module.exports = { runAll };',
            ''
        ]],
        ['reporter.js', [
            '// 汇总与告警：健康分加权计算；超阈值走 webhook，静默时段只记不发。',
            '"use strict";',
            '',
            'const https = require("https");',
            'const CONF = require("./config");',
            'const log = require("./logger");',
            'const monitors = require("./monitors");',
            '',
            'const TAG = "reporter";',
            '',
            'function healthScore(results) {',
            '    let total = 0, got = 0;',
            '    for (const r of results) {',
            '        const conf = CONF.checks.find(c => c.name === r.name);',
            '        if (!conf) continue;',
            '        total += conf.weight;',
            '        if (r.level === "ok") got += conf.weight;',
            '        else if (r.level === "warn") got += conf.weight * 0.5;',
            '    }',
            '    return total ? Math.round((got / total) * 100) : 0;',
            '}',
            '',
            'function inQuietHours(now) {',
            '    const h = now.getHours(), m = now.getMinutes();',
            '    for (const [fh, fm] of CONF.alert.quietHours) {',
            '        const from = fh * 60 + fm, cur = h * 60 + m;',
            '        if (cur >= from && cur < from + 420) return true;   // 静默窗口固定 7 小时',
            '    }',
            '    return false;',
            '}',
            '',
            'function post(url, payload) {',
            '    return new Promise(resolve => {',
            '        const req = https.request(url, { method: "POST", headers: { "content-type": "application/json" }, timeout: 5000 }, res => {',
            '            res.resume();',
            '            res.on("end", () => resolve(res.statusCode || 0));',
            '        });',
            '        req.on("error", () => resolve(0));',
            '        req.on("timeout", () => { req.destroy(); resolve(0); });',
            '        req.end(JSON.stringify(payload));',
            '    });',
            '}',
            '',
            'async function run() {',
            '    const results = await monitors.runAll();',
            '    const score = healthScore(results);',
            '    const bad = results.filter(r => r.level !== "ok");',
            '    log.info(TAG, "health=" + score + " bad=" + bad.length);',
            '    if (bad.length && CONF.alert.webhook && !inQuietHours(new Date())) {',
            '        const code = await post(CONF.alert.webhook, {',
            '            env: CONF.env, score,',
            '            items: bad.map(b => ({ name: b.name, level: b.level, value: b.value }))',
            '        });',
            '        if (code !== 200) log.warn(TAG, "webhook resp " + code);',
            '    }',
            '    return { score, results };',
            '}',
            '',
            'module.exports = { run, healthScore };',
            ''
        ]],
        ['cleanup.js', [
            '// 磁盘清理：过期日志 / 临时产物 / 旧备份，按保留天数删除，删除前统计可释放量。',
            '"use strict";',
            '',
            'const fs = require("fs");',
            'const path = require("path");',
            'const CONF = require("./config");',
            'const log = require("./logger");',
            '',
            'const TAG = "cleanup";',
            'const KEEP_DAYS = { logs: 30, tmp: 7, backup: 90 };',
            '',
            'function dirSize(p) {',
            '    let n = 0;',
            '    try { for (const f of fs.readdirSync(p)) {',
            '        const full = path.join(p, f);',
            '        const st = fs.statSync(full);',
            '        n += st.isDirectory() ? dirSize(full) : st.size;',
            '    } } catch (e) {}',
            '    return n;',
            '}',
            '',
            'function sweep(kind, dir, keepDays) {',
            '    if (!fs.existsSync(dir)) return { removed: 0, freed: 0 };',
            '    const deadline = Date.now() - keepDays * 86400000;',
            '    let removed = 0, freed = 0;',
            '    for (const f of fs.readdirSync(dir)) {',
            '        const full = path.join(dir, f);',
            '        let st;',
            '        try { st = fs.statSync(full); } catch (e) { continue; }',
            '        if (st.mtimeMs >= deadline) continue;',
            '        freed += st.isDirectory() ? dirSize(full) : st.size;',
            '        try {',
            '            if (st.isDirectory()) fs.rmSync(full, { recursive: true, force: true });',
            '            else fs.unlinkSync(full);',
            '            removed++;',
            '        } catch (e) { log.warn(TAG, "remove failed: " + f); }',
            '    }',
            '    return { removed, freed };',
            '}',
            '',
            'function run() {',
            '    const summary = {};',
            '    for (const [kind, days] of Object.entries(KEEP_DAYS)) {',
            '        const dir = path.join(CONF.dataRoot, kind);',
            '        const r = sweep(kind, dir, days);',
            '        summary[kind] = r;',
            '        if (r.removed) log.info(TAG, kind + ": -" + r.removed + " items, " + (r.freed / 1048576).toFixed(1) + " MB");',
            '    }',
            '    return summary;',
            '}',
            '',
            'module.exports = { run };',
            ''
        ]],
        ['utils.js', [
            '// 通用工具：重试 / 退避 / 限速 / 时间与格式化，全部无状态纯函数。',
            '"use strict";',
            '',
            '/* 指数退避重试：最多 tries 次，第 k 次等待 base * 2^k 毫秒（加抖动防雪崩）。 */',
            'async function retry(fn, tries, base) {',
            '    let last = null;',
            '    for (let k = 0; k < tries; k++) {',
            '        try { return await fn(k); }',
            '        catch (e) {',
            '            last = e;',
            '            const jitter = Math.floor(Math.random() * 100);',
            '            await sleep(base * Math.pow(2, k) + jitter);',
            '        }',
            '    }',
            '    throw last;',
            '}',
            '',
            'function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }',
            '',
            '/* 令牌桶限速：rate 个/秒；返回一个包装过的执行器。 */',
            'function limiter(rate) {',
            '    const gap = 1000 / rate;',
            '    let last = 0;',
            '    return async function (fn) {',
            '        const now = Date.now();',
            '        const wait = Math.max(0, last + gap - now);',
            '        if (wait) await sleep(wait);',
            '        last = Date.now();',
            '        return fn();',
            '    };',
            '}',
            '',
            '/* 分块：把数组切成 size 大小的若干片（最后一片可能不满）。 */',
            'function chunk(arr, size) {',
            '    const out = [];',
            '    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));',
            '    return out;',
            '}',
            '',
            '/* 把字节数格式化成人读的单位（保留 1 位小数）。 */',
            'function humanSize(bytes) {',
            '    const units = ["B", "KB", "MB", "GB", "TB"];',
            '    let v = Number(bytes) || 0, i = 0;',
            '    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }',
            '    return v.toFixed(1) + " " + units[i];',
            '}',
            '',
            '/* 工作日判断：周一到周五返回 true（节假日表由调用方传入）。 */',
            'function isWorkday(date, holidays) {',
            '    const d = date.getDay();',
            '    if (d === 0 || d === 6) return false;',
            '    const key = date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");',
            '    return !(holidays && holidays.indexOf(key) >= 0);',
            '}',
            '',
            '/* 汇总：按 key 分组求和（报表里最常用的那一手）。 */',
            'function sumBy(rows, key, pick) {',
            '    const m = new Map();',
            '    for (const r of rows) {',
            '        const k = r[key];',
            '        m.set(k, (m.get(k) || 0) + (Number(pick(r)) || 0));',
            '    }',
            '    return Array.from(m.entries()).map(([k, v]) => ({ key: k, sum: Math.round(v * 100) / 100 }));',
            '}',
            '',
            '/* 生成 [start, end] 的日期序列（含两端），步长 1 天。 */',
            'function dateRange(start, end) {',
            '    const out = [];',
            '    const cur = new Date(start);',
            '    while (cur <= end) {',
            '        out.push(new Date(cur));',
            '        cur.setDate(cur.getDate() + 1);',
            '    }',
            '    return out;',
            '}',
            '',
            '/* 安全 JSON：解析失败返回 fallback，绝不往外抛。 */',
            'function parseJson(text, fallback) {',
            '    try { return JSON.parse(text); } catch (e) { return fallback; }',
            '}',
            '',
            '/* 文本截断：超长加省略号，按码点切避免半个 emoji。 */',
            'function truncate(text, max) {',
            '    const s = String(text || "");',
            '    return Array.from(s).length > max ? Array.from(s).slice(0, max).join("") + "…" : s;',
            '}',
            '',
            'module.exports = { retry, sleep, limiter, chunk, humanSize, isWorkday, sumBy, dateRange, parseJson, truncate };',
            ''
        ]],
        ['alert-rules.js', [
            '// 告警规则：声明式定义（字段 / 比较 / 持续次数 / 通知级别），处理引擎只有 40 行。',
            '"use strict";',
            '',
            'const log = require("./logger");',
            '',
            'const TAG = "alert-rules";',
            '',
            '/* rules：source 对应 monitors 的采集项名。',
            '   · op：比较符（gte/lte）；· for：连续满足 N 次才触发（防抖）；',
            '   · level：info/warn/crit —— crit 走电话，warn 走群，info 只记日志。 */',
            'const rules = [',
            '    { source: "disk",       op: "gte", value: 0.92, for: 2, level: "crit", text: "磁盘使用率超过 92%" },',
            '    { source: "disk",       op: "gte", value: 0.80, for: 3, level: "warn", text: "磁盘使用率超过 80%" },',
            '    { source: "memory",     op: "gte", value: 0.95, for: 2, level: "crit", text: "内存使用率超过 95%" },',
            '    { source: "memory",     op: "gte", value: 0.85, for: 4, level: "warn", text: "内存使用率超过 85%" },',
            '    { source: "cpu-load",   op: "gte", value: 0.90, for: 3, level: "warn", text: "CPU 负载偏高" },',
            '    { source: "slow-query", op: "gte", value: 60,   for: 2, level: "crit", text: "慢查询数量异常（5 分钟 60 条）" },',
            '    { source: "slow-query", op: "gte", value: 20,   for: 4, level: "warn", text: "慢查询数量上升（5 分钟 20 条）" },',
            '    { source: "backup-age", op: "gte", value: 26,   for: 1, level: "warn", text: "最新备份已超过 26 小时" },',
            '    { source: "backup-age", op: "gte", value: 50,   for: 1, level: "crit", text: "备份已中断超过 50 小时" },',
            '    { source: "cert-expire",op: "lte", value: 14,   for: 1, level: "warn", text: "证书 14 天内到期" },',
            '    { source: "queue-depth",op: "gte", value: 2000, for: 3, level: "crit", text: "队列积压超过 2000" }',
            '];',
            '',
            '/* 每条规则一个计数器：连续满足次数。不满足即清零（防抖的关键）。 */',
            'const counters = new Map();',
            '',
            'function compare(op, a, b) {',
            '    if (op === "gte") return a >= b;',
            '    if (op === "lte") return a <= b;',
            '    return false;',
            '}',
            '',
            '/* evaluate：输入本轮采集结果，输出本轮应触发的告警（含去重：同一告警 30 分钟内不重复）。',
            '   纯函数式思路：不动全局状态，计数器是唯一的可变点，方便测试。 */',
            'function evaluate(results, now) {',
            '    const fired = [];',
            '    const byName = new Map(results.map(r => [r.name, r]));',
            '    for (const rule of rules) {',
            '        const r = byName.get(rule.source);',
            '        if (!r || r.value === null || r.value === undefined) continue;',
            '        const key = rule.source + "|" + rule.level;',
            '        const hit = compare(rule.op, Number(r.value), rule.value);',
            '        const n = (counters.get(key) || 0);',
            '        if (!hit) { counters.set(key, 0); continue; }',
            '        counters.set(key, n + 1);',
            '        if (n + 1 < rule.for) continue;',
            '        const lastAt = firedAt.get(key) || 0;',
            '        if (now - lastAt < 30 * 60000) continue;        // 30 分钟去重窗口',
            '        firedAt.set(key, now);',
            '        fired.push({ level: rule.level, text: rule.text, value: r.value });',
            '    }',
            '    if (fired.length) log.warn(TAG, "fired " + fired.length + " alert(s)");',
            '    return fired;',
            '}',
            '',
            'const firedAt = new Map();',
            '',
            '/* 自检：给一组假数据，断言规则命中符合预期（部署前跑一次）。 */',
            'function selfTest() {',
            '    const fake = [{ name: "disk", value: 0.95 }, { name: "backup-age", value: 60 }];',
            '    const hits = [];',
            '    for (let i = 0; i < 3; i++) hits.push.apply(hits, evaluate(fake, Date.now() + i * 60000));',
            '    const ok1 = hits.some(h => h.text.indexOf("磁盘") >= 0);',
            '    const ok2 = hits.some(h => h.text.indexOf("备份") >= 0);',
            '    return ok1 && ok2;',
            '}',
            '',
            'module.exports = { evaluate, selfTest, rules };',
            ''
        ]],
        ['index.js', [
            '// 入口：定时调度巡检 + 清理，信号退出时把状态写盘。',
            '"use strict";',
            '',
            'const fs = require("fs");',
            'const path = require("path");',
            'const CONF = require("./config");',
            'const log = require("./logger");',
            'const reporter = require("./reporter");',
            'const cleanup = require("./cleanup");',
            '',
            'const TAG = "main";',
            'const stateFile = path.join(CONF.dataRoot, "state.json");',
            'let timer = null;',
            'let running = false;',
            '',
            'async function tick() {',
            '    if (running) { log.warn(TAG, "previous tick still running, skip"); return; }',
            '    running = true;',
            '    try {',
            '        const r = await reporter.run();',
            '        const state = { at: new Date().toISOString(), score: r.score, env: CONF.env };',
            '        fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));',
            '    } catch (e) {',
            '        log.error(TAG, "tick failed: " + (e && e.message));',
            '    } finally {',
            '        running = false;',
            '    }',
            '}',
            '',
            'function main() {',
            '    log.info(TAG, "ops-tools " + CONF.version + " starting, env=" + CONF.env);',
            '    cleanup.run();                       // 启动时先清一轮',
            '    tick();',
            '    timer = setInterval(tick, CONF.scan.intervalMs);',
            '    for (const sig of ["SIGINT", "SIGTERM"]) {',
            '        process.on(sig, () => {',
            '            log.info(TAG, "bye");',
            '            if (timer) clearInterval(timer);',
            '            process.exit(0);',
            '        });',
            '    }',
            '}',
            '',
            'main();',
            ''
        ]]
    ];

    function buildCode() {
        // 🟥 V4.3.52：标签页做成**真的可切换**（实测反馈：其他标签点了没反应）。
        // 旧版把 8 个文件全部拼进同一个 <pre>、标签只是装饰；现在与真编辑器一致
        // —— 一次只显示一个文件，点标签切视图。8 个文件的 DOM 都在（切回去还在），
        // 总内容量不变，「短时间看不完」由 8 个标签共同承担。
        const files = CODE_FILES.map(([name, lines], fi) => {
            const gutter = Array.from({ length: lines.length }, (_, i) => i + 1).join('\n');
            let body = '';
            lines.forEach(l => { body += hl(l) + '\n'; });
            return '<div class="dg-file' + (fi === 0 ? ' on' : '') + '" data-f="' + fi + '">'
                + '<pre class="dg-gutter">' + gutter + '</pre>'
                + '<pre class="dg-code">' + body + '</pre>'
                + '</div>';
        }).join('');
        const tabs = CODE_FILES.map(([n], i) =>
            '<span data-f="' + i + '"' + (i === 0 ? ' class="on"' : '') + '>' + esc(n) + '</span>').join('');
        const ln0 = CODE_FILES[0][1].length;
        return ''
            + '<div class="dg-tabs">' + tabs
            + '<span class="dg-branch">⎇ feature/ops-automation</span>'
            + '</div>'
            + '<div class="dg-body">' + files + '</div>'
            + '<div class="dg-status">'
            + '<span>⎇ feature/ops-automation*</span><span>0 ⊗　0 ⚠</span>'
            + '<span class="dg-sp">Ln ' + ln0 + ', Col 1　空格: 4　UTF-8　JavaScript</span>'
            + '</div>';
    }

    // ================== 皮肤三：数据表格 ==================
    // 2026 Q3 全季工时流水：65 个工作日 × 4 人 = 260 行。公式区间 / 求和 / 均值实算。
    const STAFF = ['张伟', '李静', '王强', '赵敏'];
    const TASKS = [
        '数据库巡检', '工单处理', '需求评审', '安全基线核查', '备份策略评估', '监控补齐方案',
        '历史系统盘点', '巡检记录整理', '变更评审', '慢查询优化', '季度数据汇总', '文档更新',
        '安全整改跟进', '备份演练', '跨部门沟通', '监控部署', '容量评估', '日志管道优化',
        '故障复盘会', '权限清单梳理', '等级保护整改', '固件升级', '终端运维专项', '交接清单编制'
    ];
    const SHEET_ROWS = (function () {
        const rows = [];
        const day0 = new Date(2026, 6, 1);                  // 2026-07-01
        let n = 0;
        for (let d = 0; d < 92 && n < 260; d++) {           // 7/1 ~ 9/30
            const date = new Date(day0.getTime() + d * 86400000);
            const dow = date.getDay();
            if (dow === 0 || dow === 6) continue;           // 跳过周末
            const ds = (date.getMonth() + 1 < 10 ? '0' : '') + (date.getMonth() + 1) + '-' + (date.getDate() < 10 ? '0' : '') + date.getDate();
            for (let s = 0; s < STAFF.length && n < 260; s++) {
                n++;
                const task = TASKS[(n * 5 + s * 3) % TASKS.length];
                const hours = (1.5 + ((n * 7 + s * 5) % 13) * 0.5).toFixed(1);
                const status = (n % 9 === 4) ? '进行中' : '已完成';
                rows.push([String(n), '2026-' + ds, task, STAFF[s], hours, status]);
            }
        }
        return rows;
    })();

    function buildSheet() {
        const cols = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
        const head = ['序号', '日期', '工作内容', '负责人', '工时', '状态'];
        const first = 2, last = SHEET_ROWS.length + 1;      // 表体行号 2..N+1
        let sum = 0;
        SHEET_ROWS.forEach(r => { sum += Number(r[4]); });
        const avg = (sum / SHEET_ROWS.length);

        // —— 汇总视图（🟥 V4.3.52：底部 sheet 标签原来也是装饰，现在做成真切换）。
        //      两个汇总表全部**实算自 SHEET_ROWS**，求和必须与明细求和交叉一致。
        const stAgg = STAFF.map(name => {
            const rs = SHEET_ROWS.filter(r => r[3] === name);
            let h = 0, done = 0;
            rs.forEach(r => { h += Number(r[4]); if (r[5] === '已完成') done++; });
            return { name: name, cnt: rs.length, hours: h, avg: h / rs.length, done: done };
        });
        const stSum = stAgg.reduce((a, b) => a + b.hours, 0);

        // 按自然周（周一为一周起点）聚合。周 key 用本地零点时间戳，
        // 不能用 toISOString（+8 时区下会漂到前一天）。
        const wkIdx = {}, wkOrder = [];
        SHEET_ROWS.forEach(r => {
            const d = new Date(r[1] + 'T00:00:00');
            const mon = new Date(d.getTime() - ((d.getDay() + 6) % 7) * 86400000);
            const key = mon.getTime();
            if (!wkIdx[key]) { wkIdx[key] = { mon: mon, days: {}, cnt: 0, hours: 0 }; wkOrder.push(key); }
            const w = wkIdx[key];
            w.days[r[1]] = true; w.cnt++; w.hours += Number(r[4]);
        });
        const fmtMD = x => (x.getMonth() + 1 < 10 ? '0' : '') + (x.getMonth() + 1) + '/' + (x.getDate() < 10 ? '0' : '') + x.getDate();
        const wkAgg = wkOrder.map(key => {
            const w = wkIdx[key];
            return {
                label: fmtMD(w.mon) + '–' + fmtMD(new Date(w.mon.getTime() + 4 * 86400000)),
                days: Object.keys(w.days).length, cnt: w.cnt, hours: w.hours
            };
        });
        const wkSum = wkAgg.reduce((a, b) => a + b.hours, 0);
        const stText = (a, n, s) => '平均值: ' + a.toFixed(2) + '　计数: ' + n + '　求和: ' + s.toFixed(1);

        const fbar = (ref, formula) => '<div class="dg-fbar"><span class="dg-ref">' + ref + '</span>'
            + '<span class="dg-fx">fx</span><span class="dg-formula">' + formula + '</span></div>';

        // 视图一：全季工时流水（默认）
        let detail = '<table class="dg-grid"><thead><tr><th class="dg-corner"></th>'
            + cols.map(c => '<th>' + c + '</th>').join('') + '</tr></thead><tbody>';
        detail += '<tr><td class="dg-rowhead">1</td>'
            + head.map(h => '<td class="dg-head">' + h + '</td>').join('')
            + '<td></td><td></td></tr>';
        SHEET_ROWS.forEach(r => {
            detail += '<tr><td class="dg-rowhead">' + (Number(r[0]) + 1) + '</td>';
            r.forEach((v, i) => {
                detail += '<td' + ((i === 4) ? ' class="num"' : '') + '>' + esc(v) + '</td>';
            });
            detail += '<td></td><td></td></tr>';
        });
        for (let i = 0; i < 60; i++) {
            detail += '<tr><td class="dg-rowhead">' + (last + 1 + i) + '</td>'
                + '<td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>';
        }
        detail += '</tbody></table>';

        // 视图二：按人员汇总（每人：条数 / 总工时 / 平均 / 已完成；只有工时列标 num，供探针实算）
        let staffHtml = '<table class="dg-grid"><thead><tr><th class="dg-corner"></th>'
            + ['A', 'B', 'C', 'D', 'E', 'F'].map(c => '<th>' + c + '</th>').join('') + '</tr></thead><tbody>';
        staffHtml += '<tr><td class="dg-rowhead">1</td>'
            + ['序号', '姓名', '工单数', '总工时', '平均工时', '已完成'].map(h => '<td class="dg-head">' + h + '</td>').join('') + '</tr>';
        stAgg.forEach((s, i) => {
            staffHtml += '<tr><td class="dg-rowhead">' + (i + 2) + '</td>'
                + '<td>' + (i + 1) + '</td><td>' + esc(s.name) + '</td><td>' + s.cnt + '</td>'
                + '<td class="num">' + s.hours.toFixed(1) + '</td>'
                + '<td>' + s.avg.toFixed(2) + '</td><td>' + s.done + '</td></tr>';
        });
        staffHtml += '</tbody></table>';

        // 视图三：按周汇总（周期 / 工作日天数 / 工单条数 / 总工时）
        let weekHtml = '<table class="dg-grid"><thead><tr><th class="dg-corner"></th>'
            + ['A', 'B', 'C', 'D', 'E'].map(c => '<th>' + c + '</th>').join('') + '</tr></thead><tbody>';
        weekHtml += '<tr><td class="dg-rowhead">1</td>'
            + ['周次', '周期（周一–周五）', '工作日', '工单数', '总工时'].map(h => '<td class="dg-head">' + h + '</td>').join('') + '</tr>';
        wkAgg.forEach((w, i) => {
            weekHtml += '<tr><td class="dg-rowhead">' + (i + 2) + '</td>'
                + '<td>W' + (i + 1) + '</td><td>' + esc(w.label) + '</td><td>' + w.days + '</td>'
                + '<td>' + w.cnt + '</td><td class="num">' + w.hours.toFixed(1) + '</td></tr>';
        });
        weekHtml += '</tbody></table>';

        let html = ''
            + '<div class="dg-view on" data-v="0" data-st="' + stText(avg, SHEET_ROWS.length, sum) + '">'
            + fbar('E' + first, '=SUM(E' + first + ':E' + last + ')') + detail + '</div>'
            + '<div class="dg-view" data-v="1" data-st="' + stText(stSum / stAgg.length, stAgg.length, stSum) + '">'
            + fbar('D2', '=SUM(D2:D' + (stAgg.length + 1) + ')') + staffHtml + '</div>'
            + '<div class="dg-view" data-v="2" data-st="' + stText(wkSum / wkAgg.length, wkAgg.length, wkSum) + '">'
            + fbar('E2', '=SUM(E2:E' + (wkAgg.length + 1) + ')') + weekHtml + '</div>';
        // 底部 sheet 标签：前三个真切换（data-v），「＋」保持装饰（真 Excel 点它也是弹窗，不是内联切页）
        html += '<div class="dg-tabs"><span data-v="0" class="on">工时统计</span>'
            + '<span data-v="1">按人员汇总</span><span data-v="2">按周汇总</span><span>＋</span></div>';
        // 状态栏数字与当前视图的实算严格一致（求和 / 均值 / 计数）；切换时由 bindTabs 按 data-st 更新
        html += '<div class="dg-status"><span>就绪</span>'
            + '<span class="dg-agg">' + stText(avg, SHEET_ROWS.length, sum) + '</span>'
            + '<span class="dg-sp">100%</span></div>';
        return html;
    }

    const BUILDERS = { word: buildWord, code: buildCode, sheet: buildSheet };

    function ensureLayer() {
        let el = document.getElementById('disguiseLayer');
        if (el) return el;
        el = document.createElement('div');
        el.id = 'disguiseLayer';
        el.className = 'disguise-layer';
        document.body.appendChild(el);
        return el;
    }

    // 🟥 V4.3.52：标签切换（事件委托挂在 .dg-tabs 上）。hide() 会 innerHTML='' 连同监听器
    // 一起销毁，show() 每次重挂 → 无泄漏。code 用 data-f，sheet 用 data-v。
    function bindTabs(el) {
        const bar = el.querySelector('.dg-tabs');
        if (!bar) return;
        bar.addEventListener('click', function (ev) {
            const t = ev.target.closest('span[data-f], span[data-v]');
            if (!t || !bar.contains(t)) return;
            const isCode = t.hasAttribute('data-f');
            const attr = isCode ? 'data-f' : 'data-v';
            const idx = t.getAttribute(attr);
            bar.querySelectorAll('span[' + attr + ']').forEach(s => {
                s.classList.toggle('on', s === t);
            });
            if (isCode) {
                el.querySelectorAll('.dg-file').forEach(f => {
                    f.classList.toggle('on', f.getAttribute('data-f') === idx);
                });
                // 状态栏 Ln 跟随当前文件的实算行数
                const file = CODE_FILES[Number(idx)];
                const sp = el.querySelector('.dg-status .dg-sp');
                if (file && sp) sp.textContent = 'Ln ' + file[1].length + ', Col 1　空格: 4　UTF-8　JavaScript';
            } else {
                el.querySelectorAll('.dg-view').forEach(v => {
                    v.classList.toggle('on', v.getAttribute('data-v') === idx);
                });
                // 状态栏数字跟随当前视图的实算（data-st 由 buildSheet 预计算）
                const view = el.querySelector('.dg-view[data-v="' + idx + '"]');
                const agg = el.querySelector('.dg-status .dg-agg');
                if (view && agg) agg.textContent = view.getAttribute('data-st') || '';
            }
            el.scrollTop = 0;
        });
    }

    function show(skin) {
        const name = SKINS.indexOf(skin) >= 0 ? skin : SKINS[0];
        const el = ensureLayer();
        el.className = 'disguise-layer ' + name + ' on';
        el.setAttribute('data-skin', name);
        el.innerHTML = BUILDERS[name]();
        bindTabs(el);
        el.scrollTop = 0;
        return name;
    }

    /* 🖋 V4.3.87（用户：“常驻的话，就是把里面的文字改成我们需要看书的内容”）
     * 只画**外壳**：蓝条 / 标签 / 状态栏 / 纸面都保留，但把假正文清空。
     * 这样真正的书内容可以落在那张纸面里，而不是被假周报盖住。
     * 🛥 不改三个 builder：先用它们生成完整 HTML，再把假正文那一层清空 ——
     *   builder 里雐了大量假内容（周报/代码/表格），改它们风险远大于生成后再清。
     * 🛥 返回**可以放内容的那个容器**，调用方把正文放进去。 */
    function showShell(skin) {
        const name = SKINS.indexOf(skin) >= 0 ? skin : SKINS[0];
        const el = ensureLayer();
        el.className = 'disguise-layer ' + name + ' on shell';
        el.setAttribute('data-skin', name);
        el.innerHTML = BUILDERS[name]();
        bindTabs(el);
        el.scrollTop = 0;
        /* 🛥 V4.3.90（用户：“另外两个皮肤也要做适应性优化”）：
           **每套皮肤的正文容器不同**，不能只认 .dg-page：
             word  -> .dg-page（假纸面）
             code  -> .dg-body（里面是 .dg-file + 行号）←旧版这里没匹配到，
                      结果假代码**根本没被清掉**，和真正文叠在一起（截图实测）。
             sheet -> .dg-view（三个视图，全清）
           清完再把外壳自带的 chrome（蓝条/标签栏/状态栏）高度**实测**写成
           --dsg-pad-top / --dsg-pad-bottom，正文的内衬直接跟它走 ——
           三套皮肤的 chrome 高度不一样，写死 34/30/24 的旧做法必有一两套是错的。 */
        /* 📊 V4.3.90（用户：“另外两个皮肤也要适应性优化”）：
           sheet 原本**顶部什么都没有**，只有底部工作表标签与状态栏 ——
           看上去就是“一个绿标题栏的白窗”，没有 Excel 的主要身份。
           这里只在**常驻外壳**里补一条顶部功能区（不动 buildSheet 本身，
           免得把临时伪装 Ctrl+Shift+B 那套也改了）。 */
        /* 📏 V4.3.91（用户：“这也太假了，好歹做一下适配啊”）：
           Word 的标志性组件不只是上面那条蓝栏 —— **标尺**和**底部状态栏**
           才是“看起来像一份文档”的关键。之前两个都没有，所以就是“蓝条 + 一片白”。
           标尺用 repeating-linear-gradient 画刻度，不需要任何 DOM 子节点。 */
        if (name === 'word') {
            const ruler = document.createElement('div');
            ruler.className = 'dg-ruler';
            el.insertBefore(ruler, el.querySelector('.dg-page'));
        }
        if (name === 'sheet') {
            const rib = document.createElement('div');
            rib.className = 'dg-ribbon';
            rib.innerHTML = '<span class="dg-logo">X</span>'
                + '<span>文件</span><span>开始</span><span>插入</span><span>页面布局</span>'
                + '<span>公式</span><span>数据</span><span>审阅</span><span>视图</span>'
                + '<span class="dg-docname">2026年第三季度工时流水.xlsx</span>';
            el.insertBefore(rib, el.firstChild);
        }
        const HOSTS = { word: '.dg-page', code: '.dg-body', sheet: '.dg-view' };
        let host = el.querySelector(HOSTS[name] || '.dg-page');
        if (!host) host = el.querySelector('.dg-page') || el;
        if (name === 'sheet') {
            el.querySelectorAll('.dg-view').forEach(function (v) { v.innerHTML = ''; });
        } else {
            host.innerHTML = '';
        }
        host.classList.add('dg-real-host');
        /* 🚪 V4.3.90b：常驻伪装的**唯一退出入口**。
           不能靠标题栏 —— 把整条标题栏套进来就不像工作文档了（用户原话）。
           所以只留一个小按钮：点它发一个事件，由 app-src 那边关掉常驻（两层不直接互相依赖）。 */
        /* 🖱 V4.3.91（用户：“进入伪装场景的时候窗口还不能拖动”）
           标题栏藏掉后，唯一带 `-webkit-app-region:drag` 的只剩 #focusDragBar，
           而它的实际位置是 **y=23~37**（窗口有 23px 内边距）——
           用户拖顶部那一小块时命中的是 div#app（app-region:none），当然拖不动。
           外壳本身 pointer-events:none（子元素可以重新开放），所以在外壳里加一条
           **高度 = 顶部 chrome（蓝条/标签栏）的透明拖动带** —— 拖蓝条就能拖窗口，符合直觉。 */
        const dragStrip = document.createElement('div');
        dragStrip.className = 'dg-drag';
        el.insertBefore(dragStrip, el.firstChild);
        /* V4.3.92c（用户：「伪装皮肤常驻里面再加一个按钮，加一个取消伪装的按钮，
           然后我们现在这个叉的按钮呢，就直接退出整个应用」）
           于是右上角变成两个键，语义与真实窗口一致：
             [◌̸ 取消伪装]  回到阅读界面（原来 × 的活）
             [✕ 关闭]       退出整个应用（app:quit）
           顺序与 Windows 窗口按钮一致：取消伪装在左、关闭在最右。 */
        const unmaskBtn = document.createElement('button');
        unmaskBtn.type = 'button';
        unmaskBtn.className = 'dg-unmask';
        unmaskBtn.setAttribute('data-act', 'unmask');
        /* 图标：斜杠眼（"不再伪装"）。与 scripts/icons.js 里 eye-off 同一份形状；
           主窗没加载 icons-browser.js，所以这里内联（同 .tab .x 的做法）。 */
        unmaskBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 6.2A9.6 9.6 0 0 1 12 6c5 0 8.5 4.2 9.5 6-.5 1-1.5 2.4-3 3.5"/><path d="M6.3 8.1C4.6 9.4 3.3 11.2 2.5 12c1 1.8 4.5 6 9.5 6 1.2 0 2.3-.2 3.3-.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
        unmaskBtn.title = '取消伪装（回到阅读界面）';
        unmaskBtn.setAttribute('aria-label', '取消伪装');
        unmaskBtn.addEventListener('click', function (ev) {
            ev.preventDefault(); ev.stopPropagation();
            try { document.dispatchEvent(new CustomEvent('dsg:exit')); } catch (e) { }
        });
        el.appendChild(unmaskBtn);

        const exitBtn = document.createElement('button');
        exitBtn.type = 'button';
        exitBtn.className = 'dg-exit';
        exitBtn.setAttribute('data-act', 'quit');
        exitBtn.textContent = '✕';
        exitBtn.title = '退出应用';
        exitBtn.setAttribute('aria-label', '退出应用');
        exitBtn.addEventListener('click', function (ev) {
            ev.preventDefault(); ev.stopPropagation();
            /* 直接退出整个应用。走 preload 暴露的 quit（= app:quit），
               与托盘「退出」同一条链路（app.isQuitting = true 再 quit），
               不会因为"隐藏窗口"的拦截逻辑被吞掉。 */
            try {
                if (window.readerAPI && typeof window.readerAPI.quit === 'function') window.readerAPI.quit();
            } catch (e) { }
        });
        el.appendChild(exitBtn);
        measureShellChrome(el);
        return host;
    }

    /* 量出外壳 chrome 占了多少高度：按“中心在外壳上半 / 下半”分组各自求和。
       用中心而不用 top/bottom 判断，是因为 sheet 的标签栏与状态栏**都在底部**，
       两个要相加（不能取 max）。 */
    function measureShellChrome(el) {
        try {
            const lay = el.getBoundingClientRect();
            const mid = lay.top + lay.height / 2;
            let top = 0, bottom = 0;
            ['.dg-ribbon', '.dg-tabs', '.dg-status', '.dg-ruler'].forEach(function (sel) {
                const c = el.querySelector(sel);
                if (!c) return;
                const cs = getComputedStyle(c);
                if (cs.display === 'none' || cs.visibility === 'hidden') return;
                const r = c.getBoundingClientRect();
                if (r.height <= 0) return;
                if ((r.top + r.height / 2) < mid) top += r.height;
                else bottom += r.height;
            });
            document.body.style.setProperty('--dsg-pad-top', Math.round(top) + 'px');
            document.body.style.setProperty('--dsg-pad-bottom', Math.round(bottom) + 'px');
        } catch (e) { }
    }

    function hide() {
        const el = document.getElementById('disguiseLayer');
        if (!el) return;
        el.classList.remove('on');
        el.innerHTML = '';
        el.removeAttribute('data-skin');
    }

    function isActive() {
        const el = document.getElementById('disguiseLayer');
        return !!(el && el.classList.contains('on'));
    }

    window.ReaderDisguise = { SKINS: SKINS, show: show, showShell: showShell, hide: hide, isActive: isActive };
})();
