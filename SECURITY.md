# 安全设计

这个程序会读本地文件、会起常驻子进程、会调用系统 API。下面是它为此做的约束，
以及你如何自己验证这些约束确实生效。

## 威胁模型

主要假设的滥用场景是**渲染层被攻陷**——即页面里被注入脚本（恶意书源规则、
被篡改的 EPUB 内容、第三方 CSS 主题）。在这种情况下，攻击者能拿到的是渲染进程的
JavaScript 执行权，不应该能进一步拿到文件系统、进程控制或凭据。

## 渲染层隔离

| 约束 | 取值 | 原因 |
|------|------|------|
| `contextIsolation` | 恒 `true` | 网页与 preload 上下文分离，注入脚本拿不到 preload 的闭包 |
| `nodeIntegration` | 恒 `false` | 渲染进程不能 `require`，断掉直接触达文件系统的路径 |
| `webSecurity` | 恒 `true` | 不关闭同源策略 |
| `allowRunningInsecureContent` | 恒 `false` | 不允许混合内容降级 |
| `enableRemoteModule` | 恒 `false` | 已废弃且危险 |
| 权限请求 | 一律拒绝 | 不弹摄像头 / 麦克风 / 通知授权 |

渲染层能做的事只有 `preload.js` 通过 `contextBridge` 显式暴露的那些方法，
没有别的通道。

## IPC 权限收口

所有能**读日志、读密钥、写文件、起常驻进程、改系统设置、退出应用**的通道，
都校验调用来源，口径是「主窗口 + 已在册的面板窗口」，其余一律拒绝：

```
log:tail · log:export · log:copyDiagnostics · feedback:export
backup:save · backup:list · backup:load
crypto:get-key · shell:associate · shell:openDefaultApps
file:open-text · file:save-text
shortcut:set · fgwatch:set · companion:set · content:protect
panel:open · panel:close · panel:close-all · panel:close-top · panel:toggle
app:quit
```

只放行主窗是不够的——书架面板会开目录面板、设置面板会读日志，
一刀切会把正常功能砸掉。所以口径必须是「主窗 + 已登记面板」而不是「只有主窗」。

文件对话框的默认路径走白名单校验：只允许落在 `userData` / 用户主目录 / 桌面 / 文档 / 下载
这几个根之内，用 `path.relative` 判越界（`startsWith` 在 Windows 上会被大小写绕过），
拒绝 `..` 与 UNC 路径，相对路径只允许纯文件名。

## 外部资源与导航

- `shell.openExternal` 只放行 `http` / `https`；`ms-settings:` 收敛成封闭枚举（语音 / 默认应用两页），
  不是整个命名空间
- 页面导航只允许本应用自己的 `index.html` / `panel.html`，判定条件是
  「`file:` + hostname 为空 + 绝对路径的目录等于应用目录 + 文件名精确匹配」。
  只按文件名后缀放行是不够的——`file://evilhost/index.html` 和
  `C:\Windows\System32\index.html` 都会通过后缀判定
- CSP 的 `img-src` 只放行 `'self' data: blob:`。这个应用没有任何远程图片消费点
  （搜索结果用 `textContent`，书架封面是导入时生成的 dataURL），
  放行 http 只是历史遗留的攻击面

## 日志脱敏

日志会被「复制诊断」「导出反馈包」带到外部，所以在**写盘入口**统一脱敏，
而不是依赖每个调用点自觉：

- URL 查询串整体打码（任意 scheme，不只 http）
- `token / key / secret / sig / session / password / api_key` 等键值对打码
- `Authorization: Bearer <token>` 打码
- 单条超长内容截断，避免畸形日志拖住主进程

> 这一处踩过真实的坑：早期版本用一条跨词的正则做脱敏，对长无空格串呈 O(n²) 回溯，
> 实测 4 万字符耗时 3.5 秒；而日志上报通道没有长度上限，等于可以被反复用来卡死主进程。
> 现在改成按空白切 token 的线性状态机，20 万字符实测 0 毫秒。

## 静态扫描基线

`tests/security-scan.js` 在打包前扫描自研代码与页面内联脚本，
以下模式**命中即阻断发布**：

| 模式 | 原因 |
|------|------|
| `eval(` / `new Function(` / 裸 `Function(…)` | 任意代码执行面，零例外禁用 |
| 间接 eval：`(0,eval)(…)` / `window.eval(…)` | 同上，旧规则只认直接调用 |
| `nodeIntegration: true` | 渲染进程可直接 require |
| `contextIsolation: false` | 网页与 Node 上下文打通，XSS 可升级为 RCE |
| `webSecurity: false` | 关闭同源策略 |
| `allowRunningInsecureContent: true` | 允许混合内容降级 |
| `enableRemoteModule: true` | 已废弃的远程模块 |
| 放行权限请求 | 与「拒绝一切权限」基线相悖 |

判定方式是对**整份文件文本**判定一次再定位行号——逐行 `test` 会把
`eval` 与 `(` 拆到两行就绕过。纯注释行的命中降级为提示，避免告警疲劳。

中危模式（`exec(`、`shell: true`、未转义的 `innerHTML` 拼接、`openExternal(` 等）仅告警不阻断。

## 自己验证

```bash
node tests/security-scan.js      # 静态扫描，期望「高危命中: 0」
npx electron tests/live-sweep.js # 实机巡检 67 项，真启动、真点按钮、抓控制台错误
```

`live-sweep` 会用一个隔离的临时 `userData` 目录，不碰你的真实阅读数据。

## 已知的非目标

- **不防本地攻击者**：能读你用户目录的人就能读到书库文件。章节内容用 AES-GCM 加密，
  但密钥绑定本机，目的是防止「文件被单独拷走就能读」，不是防止本机提权
- **不做网络匿名**：书源抓取走系统代理设置，不做额外混淆
- **未做代码签名**：Windows SmartScreen 会提示未知发布者。签名需要付费证书，
  本项目目前没有

## 报告问题

发现安全问题请开 issue，或在 issue 里说明需要私密沟通。请附上版本号、
复现步骤与影响范围。涉及利用细节的，先不要公开贴出。
