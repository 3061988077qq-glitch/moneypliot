# MoneyPilot iOS 测试站点

这个文件夹只用于让其他 iOS 用户临时测试 MoneyPilot，不再包含正式国内域名、备案、Nginx 或云厂商部署方案。

## 目录结构

```text
ios-test-site/
  index.html          # 测试介绍页
  styles.css          # 测试介绍页样式
  app/                # MoneyPilot PWA 应用本体
```

用户访问测试介绍页后，点击“打开 / 安装 MoneyPilot”会进入 `./app/index.html`。

## 生成测试包

每次主 App 更新后，在项目根目录运行：

```bash
npm run package:ios-test
```

生成文件：

```text
dist/moneypilot-ios-test-site.zip
```

这个 zip 里包含测试介绍页和 App 本体，可以发给测试者，也可以上传到临时 HTTPS 静态空间。

## 让其他 iOS 用户测试

### 方式 A：HTTPS 测试链接

如果你有任意临时 HTTPS 静态空间，把 `ios-test-site` 里面的内容上传过去。测试者用 iPhone Safari 打开测试链接后，可以：

1. 点击“打开 / 安装 MoneyPilot”。
2. 进入 App 页面。
3. 使用 Safari 分享按钮。
4. 选择“添加到主屏幕”。

这是唯一能完整测试 PWA 安装和离线缓存的方式。

### 方式 B：同一 Wi-Fi 临时打开

如果只是想让身边的 iPhone 用户快速体验功能，可以在电脑上运行本地服务，再让对方用同一 Wi-Fi 打开电脑的局域网地址。

这种方式适合测试界面和功能，但普通 HTTP 局域网地址不保证能“添加到主屏幕”或启用离线缓存。

## 测试边界

- 这不是 App Store 下载。
- 这不是 `.ipa` 安装包。
- 没有 HTTPS 测试链接时，只能做网页功能体验，不能完整验证 iOS PWA 安装。
- 数据保存在测试者自己的 iPhone 浏览器本地，不会同步到你的设备。
