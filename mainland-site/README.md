# MoneyPilot 个人网页发布包

这个文件夹用于把 MoneyPilot 发布到自己的个人网站，避免中国大陆用户访问 GitHub Pages。

## 目录结构

```text
mainland-site/
  LAUNCH-CHECKLIST.md
  index.html          # 个人介绍页
  styles.css          # 介绍页样式
  nginx-moneypilot.conf
  app/                # MoneyPilot PWA 应用本体
```

用户访问介绍页后，点击“打开 MoneyPilot”会进入 `./app/index.html`。iPhone 用户用 Safari 打开后，可以通过“分享 -> 添加到主屏幕”安装到主屏幕。

## 推荐线上地址

推荐把整个 `mainland-site` 文件夹上传到个人域名下：

```text
https://你的域名.com/moneypilot/
```

上传后页面入口是：

```text
https://你的域名.com/moneypilot/
```

App 入口是：

```text
https://你的域名.com/moneypilot/app/
```

兼容性更稳的 App 入口是：

```text
https://你的域名.com/moneypilot/app/index.html
```

## 必须满足

- 网站必须使用 HTTPS。
- 服务器要能直接访问静态文件。
- 上传时要保留 `app/assets/` 和 `app/src/` 目录。
- 更新 App 时，重新覆盖 `app/` 目录即可。

## 更新发布包

每次主 App 更新后，在项目根目录运行：

```bash
npm run build:mainland
```

这个命令会把当前 MoneyPilot App 重新同步到：

```text
mainland-site/app/
```

然后上传整个 `mainland-site` 目录内容即可。

如果想生成可上传的压缩包，运行：

```bash
npm run package:mainland
```

生成文件：

```text
dist/moneypilot-mainland-site.zip
```

上线前按 `LAUNCH-CHECKLIST.md` 检查一遍。

## 国内托管建议

- 个人服务器或宝塔面板：把 `mainland-site` 中的所有内容上传到网站目录下的 `moneypilot` 文件夹。
- 阿里云 OSS：开启静态网站托管，绑定备案域名和 HTTPS/CDN。
- 腾讯云 COS：开启静态网站托管，绑定备案域名和 HTTPS/CDN。

## Nginx 示例

如果上传到 `/www/wwwroot/example.com/moneypilot/`，可以使用类似配置：

```nginx
location /moneypilot/ {
  try_files $uri $uri/ /moneypilot/index.html;
}

location /moneypilot/app/ {
  try_files $uri $uri/ /moneypilot/app/index.html;
}
```

Service Worker 会在 `/moneypilot/app/` 范围内缓存 MoneyPilot，不会影响网站其他页面。

也可以直接参考本目录下的：

```text
nginx-moneypilot.conf
```
