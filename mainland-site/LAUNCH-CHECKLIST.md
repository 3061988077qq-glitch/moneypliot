# MoneyPilot 国内上线检查清单

用于把 `mainland-site` 发布到中国大陆用户可访问的个人网站。

## 1. 生成发布包

在项目根目录运行：

```bash
npm run package:mainland
```

生成文件：

```text
dist/moneypilot-mainland-site.zip
```

把压缩包上传到国内服务器或对象存储后解压。

## 2. 线上路径

推荐线上路径：

```text
https://你的域名.com/moneypilot/
```

介绍页：

```text
https://你的域名.com/moneypilot/index.html
```

App 入口：

```text
https://你的域名.com/moneypilot/app/index.html
```

## 3. 服务器要求

- 域名已备案，且中国大陆网络可访问。
- HTTPS 证书有效。
- `index.html`、`.js`、`.css`、`.webmanifest`、`.png`、`.svg` 能直接访问。
- `service-worker.js` 不要长期缓存，建议加 `Cache-Control: no-cache`。
- `/moneypilot/app/` 下的 Service Worker 作用域只覆盖 MoneyPilot App。

## 4. iPhone 安装测试

用一台没有访问过 GitHub Pages 的 iPhone 测试：

1. 打开 Safari。
2. 访问 `https://你的域名.com/moneypilot/`。
3. 点击“打开 / 安装 MoneyPilot”。
4. 确认进入 `https://你的域名.com/moneypilot/app/index.html`。
5. 点 Safari 分享按钮。
6. 选择“添加到主屏幕”。
7. 从主屏幕打开 MoneyPilot。
8. 新增一笔账单，关闭后重新打开，确认数据仍在。

## 5. 常见问题

### Safari 没有“添加到主屏幕”

确认使用的是 Safari，不是微信内置浏览器、QQ 浏览器或其他内嵌 WebView。必要时先选择“在 Safari 中打开”。

### App 打开后仍像网页

确认是从主屏幕图标打开，而不是从 Safari 标签页打开。

### 离线不可用

先在线打开一次 `app/index.html`，等待缓存完成。服务器也要允许访问 `service-worker.js`。

### 更新后手机仍是旧版

主 App 更新后运行：

```bash
npm run package:mainland
```

重新上传并覆盖线上文件。MoneyPilot 的 App 版本号更新后，手机端会收到新缓存。
