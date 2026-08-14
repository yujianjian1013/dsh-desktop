'use strict';
// 用 Electron 离屏渲染 SVG → 高分辨率透明 PNG（无额外依赖）。
// 用法: electron scripts/render-svg.js <input.svg> <output.png> [size]
const { app, BrowserWindow, nativeTheme } = require('electron');
const fs = require('fs');
const path = require('path');

const svgPath = path.resolve(process.argv[2] || path.join(__dirname, '..', 'build', 'favicon.svg'));
const outPath = path.resolve(process.argv[3] || path.join(__dirname, '..', 'build', 'icon.png'));
const SIZE = Number(process.argv[4]) || 512;

app.whenReady().then(async () => {
  nativeTheme.themeSource = 'light'; // 亮色主题 → path 默认黑色填充 → 黑色鲸鱼
  const win = new BrowserWindow({
    width: SIZE,
    height: SIZE,
    show: false,
    frame: false,
    transparent: true,
    webPreferences: { offscreen: true },
  });
  const svg = fs.readFileSync(svgPath, 'utf8');
  const html = `<!doctype html><html><head><style>
    html,body{margin:0;padding:0;background:transparent;width:${SIZE}px;height:${SIZE}px;overflow:hidden}
    svg{width:${SIZE}px;height:${SIZE}px;display:block}
  </style></head><body>${svg}</body></html>`;
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  await new Promise((r) => setTimeout(r, 400));
  const img = await win.webContents.capturePage();
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, img.toPNG());
  console.log('rendered ' + outPath + ' (' + img.getSize().width + 'x' + img.getSize().height + ')');
  app.exit(0);
});
