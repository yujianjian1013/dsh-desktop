'use strict';
// 用 png-to-ico 把 icon.png 转成多尺寸 icon.ico（供 exe / 任务栏使用）。
const pngToIco = require('png-to-ico');
const fs = require('fs');
const path = require('path');

(async () => {
  const png = path.join(__dirname, '..', 'build', 'icon.png');
  const ico = path.join(__dirname, '..', 'build', 'icon.ico');
  const buf = await pngToIco(png);
  fs.writeFileSync(ico, buf);
  console.log('wrote ' + ico + ' (' + buf.length + ' bytes)');
})().catch((e) => { console.error(e); process.exit(1); });
