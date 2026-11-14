// SMOKE6：本地文档加载管线（txt / epub / pdf）+ 扩展名单点化
// 为什么要这一套：PDF/EPUB 管线此前**零测试覆盖**，EPUB 更是悄悄坏了好几个版本没人发现
// （缺 JSZip + 用错 epub.js API），所以这里用真实 fixture 走完整 loadFiles 链路，不再靠肉眼。
// fixture：../\_fixtures/ 下的 鲸鱼测试本.epub（3 章，带真实 toc）与 鲸鱼测试本.pdf（1 页）
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

app.setPath('userData', path.join(__dirname, '..', '_smoke6_userdata'));

// 节点侧真值：扩展名单点化后，主进程 require 与渲染层全局必须是同一份
const NODE_EXTS = require('./scripts/exts.js');

const problems = [];
function expect(name, cond, detail) {
  if (!cond) problems.push(name + (detail !== undefined ? ' -> ' + detail : ''));
}

const FIX = path.join(__dirname, '..', '_fixtures');
const EPUB_B64 = fs.readFileSync(path.join(FIX, '鲸鱼测试本.epub')).toString('base64');
const PDF_B64 = fs.readFileSync(path.join(FIX, '鲸鱼测试本.pdf')).toString('base64');

function mkFileSnippet(varName) {
  // 把 base64 还原成浏览器里的 File 对象（构造代码复用，避免在三处各写一遍）
  return 'function b64ToFile(b64, name, type){' +
    'const bin=atob(b64); const arr=new Uint8Array(bin.length);' +
    'for(let i=0;i<bin.length;i++)arr[i]=bin.charCodeAt(i);' +
    'return new File([arr], name, {type:type});}' +
    'const ' + varName + ' = b64ToFile(B64, NAME, TYPE);';
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false, width: 900, height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false, contextIsolation: true, backgroundThrottling: false
    }
  });
  win.webContents.on('console-message', (e, level, msg) => {
    if (level < 2) return;
    const m = String(msg);
    if (m.indexOf('Electron Security Warning') >= 0) return;
    problems.push('CONSOLE: ' + m.slice(0, 200));
  });

  try {
    await win.loadFile(path.join(__dirname, 'index.html'));
    await new Promise(r => setTimeout(r, 2500));

    const run = async (b64, name, type) => {
      const code = '(async()=>{\n' +
        'const B64=' + JSON.stringify(b64) + ';\n' +
        'const NAME=' + JSON.stringify(name) + ';\n' +
        'const TYPE=' + JSON.stringify(type) + ';\n' +
        mkFileSnippet('F') + '\n' +
        'const R=window.__reader;\n' +
        'await R.loadFiles([F]);\n' +
        'const chs=(R.state.chapters||[]).map(function(c){return {t:c.title,len:(c.content||"").length,head:String(c.content||"").slice(0,24),img:!!c.img,imgHead:String(c.img||"").slice(0,22)};});\n' +
        'return {count:chs.length, chapters:chs, status:(document.getElementById("statusText")||{}).textContent||""};\n' +
        '})()';
      return await Promise.race([
        win.webContents.executeJavaScript(code),
        new Promise(r => setTimeout(() => r({ __timeout: true }), 30000))
      ]);
    };

    const o = {};
    o.extsInPage = await win.webContents.executeJavaScript(
      '(function(){return (window.READER_EXTS||[]).slice();})()');

    o.txt = await run(Buffer.from('第一章 测试\n这是 smoke6 的纯文本夹具正文。', 'utf8').toString('base64'), 'smoke6.txt', 'text/plain');
    o.epub = await run(EPUB_B64, '鲸鱼测试本.epub', 'application/epub+zip');
    o.pdf = await run(PDF_B64, '鲸鱼测试本.pdf', 'application/pdf');

    console.log('RESULT ' + JSON.stringify(o));

    // 1) 扩展名单点：渲染层拿到的必须是同一份（此前 app.js/main.js 三处口径不一致）
    expect('渲染层读不到 READER_EXTS', Array.isArray(o.extsInPage) && o.extsInPage.length > 0, JSON.stringify(o.extsInPage).slice(0, 80));
    expect('扩展名单点失效（渲染层 ≠ exts.js）', JSON.stringify(o.extsInPage) === JSON.stringify(NODE_EXTS),
      o.extsInPage.length + ' vs ' + NODE_EXTS.length);

    // 2) 纯文本
    expect('TXT 未解析出章节', o.txt && o.txt.count === 1, JSON.stringify(o.txt));
    expect('TXT 正文为空', o.txt && o.txt.chapters[0] && o.txt.chapters[0].len > 10, JSON.stringify(o.txt));

    // 3) EPUB：三章 + 真实目录名（不能是写死的「第N章」）+ 无解析失败
    expect('EPUB 超时（多半是 book.ready 又挂住了）', !(o.epub && o.epub.__timeout), JSON.stringify(o.epub));
    expect('EPUB 章节数不是 3', o.epub && o.epub.count === 3, JSON.stringify(o.epub));
    const titles = (o.epub && o.epub.chapters || []).map(c => c.t);
    ['第一章 潮汐之下', '第二章 深蓝回声', '第三章 跃出水面'].forEach(function (t) {
      expect('EPUB 未拿到真实章节名: ' + t, titles.indexOf(t) >= 0, JSON.stringify(titles));
    });
    expect('EPUB 出现「解析失败」', JSON.stringify(titles).indexOf('解析失败') < 0, JSON.stringify(titles));
    expect('EPUB 正文为空', (o.epub && o.epub.chapters || []).every(c => c.len > 10), JSON.stringify(o.epub));

    // 4) PDF：一页 = 一章，产出位图（不是文本重排）
    expect('PDF 超时', !(o.pdf && o.pdf.__timeout), JSON.stringify(o.pdf));
    expect('PDF 页数不是 1', o.pdf && o.pdf.count === 1, JSON.stringify(o.pdf));
    expect('PDF 未产出位图', o.pdf && o.pdf.chapters[0] && o.pdf.chapters[0].img === true, JSON.stringify(o.pdf));
    expect('PDF 位图不是 jpeg dataURL', o.pdf && String(o.pdf.chapters[0].imgHead).indexOf('data:image/jpeg') === 0, JSON.stringify(o.pdf));
  } catch (e) {
    problems.push('EXCEPTION: ' + ((e && e.stack) || e));
  }

  if (problems.length) {
    console.log('PROBLEMS:\n' + problems.join('\n'));
    app.exit(1);
  } else {
    console.log('SMOKE6 PASS');
    app.exit(0);
  }
});

setTimeout(() => { console.log('TIMEOUT'); app.exit(2); }, 90000);
