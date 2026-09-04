# DSH Desktop

DSH Web GUI 的桌面客户端壳（Electron）。

## 使用

- 直接双击 `dist\DSH Desktop-win32-x64\DSH Desktop.exe`（或桌面上的 "DSH Desktop" 快捷方式）。
- **无需先开终端**：应用启动时会检测 `http://127.0.0.1:3080`，若服务未运行，会自动拉起 `dsh --profile web` 并等待就绪后进入界面。
- 应用退出时会自动关掉它自己拉起的服务；如果你本来就开着终端版服务，则不会动它。
- 托盘图标可显示/隐藏窗口；右键托盘可退出。
- 未检测到 dsh 时（例如新用户电脑），会显示安装指引页：装 Node.js 18+ → `npm install -g @deepseek-ai/dsh` → 点重试。

## 环境变量（可选）

| 变量 | 作用 |
| --- | --- |
| `DSH_URL` | 覆盖目标地址，默认 `http://127.0.0.1:3080`（端口变化时自动把该端口传给 `dsh web`） |
| `DSH_NO_AUTOSTART=1` | 禁用自动拉起服务 |
| `DSH_SERVER_PATH` | 自定义服务入口脚本（默认为 npm 全局 `@deepseek-ai/dsh` 的 `lib/bin.js`，找不到时回退到 PATH 上的 `dsh` 命令） |
| `DSH_NODE_PATH` | 自定义 node 路径，默认用 PATH 里的 `node` |

## 发布（给其他用户）

前置：其他用户需自装 Node.js 18+ 和 `npm install -g @deepseek-ai/dsh`（应用内有指引页）。

```bash
npm install            # 首次安装依赖（如遇 electron 下载慢，先执行：
                       #   $env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
                       # 再 npm install）
npm run pack:release   # 打包到 release-build/ 并生成 release/DSH-Desktop-v<版本>-win32-x64.zip
```

发布流程（GitHub）：
1. 在 GitHub 建仓库（如 `dsh-desktop`），把本目录源码推上去（`dist/`、`release/`、`node_modules/` 已被 .gitignore 排除）。
2. 在仓库页面点 **Releases → Create a new release**，填 tag（如 `v1.1.0`）。
3. 把 `release/` 里的 zip 作为附件上传，写清"使用说明：先装 Node + dsh"。
4. 用户到 Releases 页面下载 zip，解压双击 `DSH Desktop.exe`（SmartScreen 提示点"更多信息 → 仍要运行"，未签名应用属正常）。

进阶（可选）：
- **GitHub Actions 自动构建**：加一个 `.github/workflows/release.yml`，push tag 时在 windows-latest 上跑 `npm ci && npm run pack:release` 并上传 zip。
- **代码签名**：买证书（如 DigiCert）后可消除 SmartScreen 警告。
- **安装程序/自动更新**：换 electron-builder 的 NSIS + electron-updater。

## 常用命令（开发）

```bash
npm start              # 开发模式启动
npm run icon           # 重新生成 build/icon.png 与 build/icon.ico
npm run render-icon    # 用 Electron 离屏渲染 SVG 图标（scripts/render-svg.js）
npm run pack           # 打包到 dist/（本机自用）
npm run pack:release   # 打包 + 打 zip 到 release/（对外发布）
```

## 说明

- 主进程：`main.js`（窗口、托盘、单实例、自动拉起服务、安装指引/离线页、站外链接交给系统浏览器）。
- 页面由 Electron 内置 Chromium 渲染，与浏览器里访问 `http://127.0.0.1:3080` 完全一致。
- 换端口：启动前设置环境变量 `DSH_URL`。

## 更新记录

### v1.1.2（2026-09-04）

- **修复 dsh web 0.1.2+ token 加载竞态导致的 401 黑屏**：v1.1.1 在服务端口就绪后立即用 `resolvedAppUrl()` 加载页面，但带一次性 token 的 URL 是 dsh web 启动后**异步打印到 stdout** 才被解析的——端口先通、token 行后到，于是仍会加载裸 URL 被 401 拒绝（黑屏）。
  - `handleServerDown` 在端口就绪后先**等待 token URL 解析**（最多 10 秒，每 200ms 轮询 `serverTokenUrl`），解析到后才加载带 token 的地址完成一次性认证；
  - 认证成功后 dsh web 会种下会话 cookie（约 30 天有效），此后正常使用与旧版一致；
  - 对旧版 dsh web（无 token）行为不变：10 秒内解析不到 token 即回退加载裸 `APP_URL`。

### v1.1.1（2026-09-04）

- **兼容 dsh web 0.1.2+ 的一次性 token 认证**：新版 `dsh web`（0.1.2-rc.1 起）在启动时打印带 `?token=...` 的一次性 URL，直接访问裸 `http://127.0.0.1:3080` 会被 401 拒绝。本版本在拉起服务后解析该 token URL 并用其加载主窗口，规避由此导致的黑屏。
  - 新增 `serverTokenUrl`，监听 dsh web 的 stdout 解析 `dsh web: <url>` 中带 token 的完整 URL；
  - 增加 `resolvedAppUrl()`，能拿到 token 时用之，否则回退裸 `APP_URL`（兼容旧版服务）；
  - 主窗口初次加载与服务就绪后的加载均改用该函数。
