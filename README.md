# MoneyPilot Web

MoneyPilot Web 是独立的 Safari 可安装 PWA 版本，保留核心记账能力：手动记账、账单导入、分类校准、月度账单、交易编辑、单笔/多选删除、本地导出和完整备份恢复。

它不是 iOS 侧载 App，不需要临时开发者证书，所以不会有 7 天签名过期问题。部署到 HTTPS 后，iPhone 不需要 Mac 端服务器一直开着；第一次成功加载后，应用外壳会被缓存，后续可从主屏幕离线打开，账本数据保存在 iPhone 本机浏览器存储中。应用不会把账本上传到服务器，建议定期在“更多”里导出完整备份到 iPhone“文件”App。

## 目录

- `index.html`：Web App 入口。
- `manifest.webmanifest`：PWA 安装声明。
- `service-worker.js`：离线缓存应用外壳。
- `assets/`：应用图标，包括 iOS 主屏幕需要的 PNG 图标。
- `src/`：页面、样式、核心记账逻辑、导入器和本地存储。
- `scripts/dev-server.mjs`：本地开发服务器。
- `scripts/generate-icons.mjs`：生成 PWA / iOS 安装图标。
- `scripts/pwa-check.mjs`：检查 PWA 必需文件、manifest 和离线缓存清单。
- `netlify.toml` / `vercel.json`：静态 HTTPS 部署配置。
- `.github/workflows/pages.yml`：GitHub Pages 自动部署配置。
- `package.json`：运行脚本。

## 运行

```bash
npm run dev
```

打开 `http://127.0.0.1:4173`。

在 iPhone Safari 中访问部署后的 HTTPS 地址，点分享按钮，选择“添加到主屏幕”，即可像本地 App 一样启动。

## 手机本地数据

- 流水、分类、学习规则和设置默认保存在 iPhone 本机浏览器存储中。
- App 使用 `localStorage` 做快速启动缓存，并同步写入 IndexedDB 作为更适合手机端的本地持久账本。
- “更多 > 导出完整备份”会生成可恢复的 JSON 备份文件。
- “更多 > 恢复完整备份”可把 JSON 备份恢复回本机账本。
- “更多 > 本地安装 > 检查更新”可让主屏幕 PWA 主动检查并切换到新版本。
- 如果用户手动清除 Safari 网站数据或系统迁移失败，本地浏览器数据可能被移除；完整备份用于避免丢账。

## PWA 检查

```bash
npm run icons
npm run check:pwa
```

`check:pwa` 会检查 iPhone 图标、manifest、离线缓存、IndexedDB 本地账本、完整备份恢复、应用版本一致性和部署配置。

部署到 HTTPS 后，运行：

```bash
npm run check:deploy-url -- https://你的域名/
```

它会检查线上网址是否真的满足 iPhone PWA 安装、离线缓存和 Service Worker 更新要求。

## 部署到网址

推荐部署到 Cloudflare Pages、Netlify、Vercel 或 GitHub Pages。

托管平台设置：

- Project root: `money-pilot-web`
- Build command: `npm run icons && npm run check:pwa`
- Output directory: `.`
- Framework preset: static site / other

部署完成后，在 iPhone Safari 打开 HTTPS 地址：

1. 等页面完整加载一次。
2. 点 Safari 分享按钮。
3. 选择“添加到主屏幕”。
4. 从桌面 MoneyPilot 图标启动。

更多细节见 [DEPLOYMENT.md](./DEPLOYMENT.md)。
