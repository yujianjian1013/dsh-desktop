'use strict';

const { app, BrowserWindow, Menu, Tray, nativeImage, shell } = require('electron');
const { spawn, execFile } = require('child_process');
const net = require('net');
const path = require('path');
const fs = require('fs');

const DEFAULT_URL = 'http://127.0.0.1:3080';
const APP_URL = process.env.DSH_URL || DEFAULT_URL;
const ICON_PNG = path.join(__dirname, 'build', 'icon.png');

let mainWindow = null;
let tray = null;
let quitting = false;

// ---- 自动拉起 dsh web 服务的状态 ----
let spawnedServer = null;   // 我们启动的子进程
let serverState = { checked: false };

// 兼容 dsh web 0.1.2+ 的一次性 token 认证：进程启动时打印的启动 URL 带有
// `?token=...`，裸 URL 会被 401 拒绝。这里保存从服务 stdout 解析出的完整 URL。
let serverTokenUrl = null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- 单实例：重复启动时聚焦已有窗口 ----
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// ---- 端口探测 ----
function isPortOpen(host, port, timeout = 800) {
  return new Promise((resolve) => {
    const s = net.connect({ host, port });
    const done = (ok) => { try { s.destroy(); } catch (_) {} resolve(ok); };
    s.once('connect', () => done(true));
    s.once('error', () => done(false));
    s.setTimeout(timeout, () => done(false));
  });
}

// ---- 解析 dsh 服务入口（本地全局安装，或 PATH 上的 dsh 命令） ----
function resolveServerEntry() {
  const candidates = [
    process.env.DSH_SERVER_PATH,                                 // 测试/自定义覆盖
    path.join(process.env.APPDATA || '', 'npm', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'),
  ];
  return candidates.find((f) => f && fs.existsSync(f)) || null;
}

// 回退：用户自定义了 Node 安装位置等场景下，dsh 可能在 PATH 上
function findDshCommand() {
  return new Promise((resolve) => {
    execFile('where.exe', ['dsh'], { windowsHide: true }, (err, stdout) => {
      if (err) return resolve(null);
      const line = (stdout || '').split(/\r?\n/).map((l) => l.trim())
        .find((l) => l && l.toLowerCase().endsWith('.cmd'));
      resolve(line || null);
    });
  });
}

// ---- 服务未启动时自动拉起 `dsh --profile web --port <port>` ----
async function ensureServer() {
  try {
    const u = new URL(APP_URL);
    const port = u.port || 80;
    if (await isPortOpen(u.hostname, port)) return { started: false }; // 已在运行
    if (process.env.DSH_NO_AUTOSTART === '1') return { started: false };

    const logFile = fs.createWriteStream(path.join(app.getPath('userData'), 'dsh-server.log'), { flags: 'a' });
    let proc;
    const binJs = resolveServerEntry();
    if (binJs) {
      proc = spawn(process.env.DSH_NODE_PATH || 'node', [binJs, '--profile', 'web', '--port', String(port)], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } else {
      const dshCmd = await findDshCommand();
      if (!dshCmd) return { started: false, reason: 'no-dsh' }; // 本机没有 dsh → 显示安装指引
      proc = spawn(dshCmd, ['--profile', 'web', '--port', String(port)], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true,
      });
    }
    proc.stdout.pipe(logFile);
    proc.stderr.pipe(logFile);
    // 解析 dsh web 启动时打印的带 token 的 URL（形如 `dsh web: http://.../?token=...`），
    // 供主窗口以正确的一次性 token 认证加载，规避新版裸 URL 401 黑屏。
    proc.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      const m = text.match(/dsh web: (\S+)/);
      if (m && m[1]) serverTokenUrl = m[1];
    });
    proc.on('error', (e) => { console.error('[dsh-desktop] spawn failed: ' + e.message); spawnedServer = null; });
    proc.on('exit', () => { spawnedServer = null; });
    spawnedServer = proc;
    console.log(`[dsh-desktop] auto-started dsh web (pid ${proc.pid}) on port ${port}`);
    return { started: true };
  } catch (e) {
    console.error('[dsh-desktop] ensureServer error: ' + e.message);
    return { started: false };
  }
}

// ---- 轮询端口直到服务可用，然后加载主页面 ----
async function waitUntilUp(host, port, timeoutMs = 60000) {
  const start = Date.now();
  for (;;) {
    if (await isPortOpen(host, port)) return true;
    if (Date.now() - start > timeoutMs) return false;
    await sleep(1200);
  }
}

// ---- 决定实际加载的 URL ----
// dsh web 0.1.2+ 要求带一次性 token 的启动 URL；解析到了就用它，
// 否则回退到配置的裸 APP_URL（兼容旧版服务）。
function resolvedAppUrl() {
  return serverTokenUrl || APP_URL;
}

// ---- 服务未启动时的离线提示页（手动重试） ----
function offlinePage(url) {
  const html = `<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>DSH Desktop</title>
<style>
  html,body{height:100%;margin:0;background:#0b0f19;color:#e2e8f0;
    font-family:"Segoe UI","Microsoft YaHei",sans-serif;display:flex;
    align-items:center;justify-content:center;}
  .box{text-align:center;max-width:480px;padding:24px;}
  .dot{width:64px;height:64px;border-radius:50%;margin:0 auto 20px;
    background:radial-gradient(circle at 35% 35%, #22d3ee, #0369a1);}
  h1{font-size:20px;margin:0 0 10px;color:#f1f5f9;}
  p{color:#94a3b8;font-size:14px;line-height:1.7;margin:0 0 22px;}
  code{background:#1e293b;padding:2px 6px;border-radius:4px;color:#7dd3fc;}
  button{background:#0ea5e9;border:0;color:#fff;font-size:14px;
    padding:10px 26px;border-radius:8px;cursor:pointer;}
  button:hover{background:#0284c7;}
</style></head>
<body><div class="box"><div class="dot"></div>
<h1>无法连接到 DSH 服务</h1>
<p>自动启动失败或服务未运行。请手动执行 <code>dsh web</code> 后再重试。</p>
<button onclick="location.href='${url}'">重试连接</button>
</div></body></html>`;
  return 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
}

// ---- 服务启动中提示页 ----
function startingPage() {
  const html = `<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>DSH Desktop</title>
<style>
  html,body{height:100%;margin:0;background:#0b0f19;color:#e2e8f0;
    font-family:"Segoe UI","Microsoft YaHei",sans-serif;display:flex;
    align-items:center;justify-content:center;}
  .box{text-align:center;}
  .spinner{width:44px;height:44px;margin:0 auto 18px;border-radius:50%;
    border:4px solid #1e293b;border-top-color:#22d3ee;
    animation:spin 1s linear infinite;}
  @keyframes spin{to{transform:rotate(360deg);}}
  p{color:#94a3b8;font-size:14px;}
</style></head>
<body><div class="box"><div class="spinner"></div>
<p>正在启动 DSH 服务，请稍候…</p>
</div></body></html>`;
  return 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
}

// ---- 未检测到 dsh 时的安装指引页 ----
function installHelpPage() {
  const html = `<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>DSH Desktop</title>
<style>
  html,body{height:100%;margin:0;background:#0b0f19;color:#e2e8f0;
    font-family:"Segoe UI","Microsoft YaHei",sans-serif;display:flex;
    align-items:center;justify-content:center;}
  .box{text-align:left;max-width:560px;padding:28px;}
  h1{font-size:20px;margin:0 0 12px;color:#f1f5f9;}
  p,li{color:#94a3b8;font-size:14px;line-height:1.8;}
  ol{margin:8px 0 20px;padding-left:22px;}
  code{background:#1e293b;padding:2px 8px;border-radius:4px;color:#7dd3fc;font-size:13px;}
  button{background:#0ea5e9;border:0;color:#fff;font-size:14px;
    padding:10px 26px;border-radius:8px;cursor:pointer;margin-top:4px;}
  button:hover{background:#0284c7;}
</style></head>
<body><div class="box">
<h1>需要先安装 DSH 运行环境</h1>
<p>本应用依赖 DeepSeek Harness（DSH）提供后台服务，未检测到 <code>dsh</code> 命令。请按以下步骤操作（一次性）：</p>
<ol>
  <li>安装 <b>Node.js 18+</b>（推荐 LTS）：<code>https://nodejs.org</code></li>
  <li>打开 <b>命令提示符</b>（cmd）或 PowerShell，执行：<br>
      <code>npm install -g @deepseek-ai/dsh</code></li>
  <li>装完后回到本应用，点击下方按钮重试。</li>
</ol>
<button onclick="location.href='${APP_URL}'">我已安装，重试连接</button>
</div></body></html>`;
  return 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
}

async function handleServerDown() {
  const res = await ensureServer();
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (!res.started) {
    mainWindow.loadURL(res.reason === 'no-dsh' ? installHelpPage() : offlinePage(APP_URL));
    return;
  }
  mainWindow.loadURL(startingPage());
  const u = new URL(APP_URL);
  const up = await waitUntilUp(u.hostname, u.port || 80);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.loadURL(up ? resolvedAppUrl() : offlinePage(APP_URL));
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    title: 'DSH Desktop',
    backgroundColor: '#0b0f19',
    autoHideMenuBar: true,
    show: false,
    icon: fs.existsSync(ICON_PNG) ? ICON_PNG : undefined,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  // 站内新窗口在当前窗口打开；外部链接交给系统浏览器
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://127.0.0.1') || url.startsWith('http://localhost')) {
      mainWindow.loadURL(url);
    } else {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // 主框架加载失败（服务未启动）→ 自动拉起服务
  mainWindow.webContents.on('did-fail-load', (_e, code, _desc, _url, isMainFrame) => {
    if (!isMainFrame || code === -3 /* ERR_ABORTED */) return;
    if (!serverState.checked) {
      serverState.checked = true;
      handleServerDown();
    } else if (!mainWindow.isDestroyed()) {
      mainWindow.loadURL(offlinePage(APP_URL));
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });

  mainWindow.loadURL(resolvedAppUrl());

  // ---- 验证模式：`electron . --screenshot` 加载后截图退出 ----
  if (process.argv.includes('--screenshot')) {
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        try {
          const img = await mainWindow.webContents.capturePage();
          const out = process.env.DSH_SCREENSHOT_PATH || path.join(process.cwd(), 'screenshot.png');
          fs.writeFileSync(out, img.toPNG());
          console.log('[dsh-desktop] screenshot saved: ' + out);
        } catch (err) {
          console.error('[dsh-desktop] screenshot failed: ' + err.message);
        }
        app.quit(); // 走正常退出流程，验证自动拉起服务的清理
      }, 6000);
    });
  }
}

function setupTray() {
  try {
    if (!fs.existsSync(ICON_PNG)) return;
    const img = nativeImage.createFromPath(ICON_PNG).resize({ width: 16, height: 16 });
    tray = new Tray(img);
    tray.setToolTip('DSH Desktop');
    const showOrCreate = () => {
      if (!mainWindow) createWindow();
      else { mainWindow.show(); mainWindow.focus(); }
    };
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: '显示主窗口', click: showOrCreate },
      { type: 'separator' },
      { label: '退出', click: () => { quitting = true; app.quit(); } },
    ]));
    tray.on('click', showOrCreate);
  } catch (err) {
    console.warn('[dsh-desktop] tray unavailable: ' + err.message);
  }
}

app.setAppUserModelId('com.deepseek.dsh-desktop');

app.whenReady().then(() => {
  createWindow();
  setupTray();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// 退出时清理自动拉起的服务进程树
app.on('before-quit', () => {
  if (spawnedServer && spawnedServer.pid) {
    execFile('taskkill', ['/pid', String(spawnedServer.pid), '/T', '/F'], () => {});
  }
});

app.on('window-all-closed', () => {
  // 有托盘时驻留后台；无托盘（或主动退出）时退出
  if (!tray || quitting) app.quit();
});
