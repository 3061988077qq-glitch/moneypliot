# 无自有域名发布方案

如果暂时无法注册个人域名，可以先使用国内云厂商提供的默认 HTTPS 域名发布 MoneyPilot。

## 推荐方案：腾讯云 CloudBase 静态网站托管

CloudBase 静态网站托管适合这个项目，因为 MoneyPilot 是纯静态 PWA：

- 只需要上传 HTML、CSS、JS、图片和 manifest。
- CloudBase 静态网站托管内置 HTTPS。
- 可以使用平台分配的默认域名，不需要自己注册域名。
- 中国大陆用户通常比访问 GitHub Pages 更稳定。

## 发布步骤

1. 在腾讯云开通 CloudBase 环境。
2. 进入 CloudBase 的静态网站托管。
3. 上传 `dist/moneypilot-mainland-site.zip` 解压后的 `mainland-site` 内容。
4. 确认默认域名可以访问介绍页。
5. App 入口应为：

```text
https://你的CloudBase默认域名/app/index.html
```

6. 运行线上检查：

```bash
npm run check:mainland-url -- https://你的CloudBase默认域名/
```

7. 用 iPhone Safari 打开默认域名，点击“打开 / 安装 MoneyPilot”，再通过“分享 -> 添加到主屏幕”安装。

## 目录上传方式

建议把 `mainland-site` 里面的内容上传到托管根目录，而不是上传外层文件夹本身。

上传后的线上结构应类似：

```text
/
  index.html
  styles.css
  app/
    index.html
    manifest.webmanifest
    service-worker.js
    assets/
    src/
```

这样介绍页地址是：

```text
https://你的CloudBase默认域名/
```

App 地址是：

```text
https://你的CloudBase默认域名/app/index.html
```

## 注意事项

- 不要用 GitHub Pages 地址给中国大陆用户分发。
- 不要用普通 HTTP 地址，iPhone PWA 安装和离线缓存需要 HTTPS。
- 不要用自签名证书，iPhone 会认为不可信。
- 如果默认域名后续访问量变大或需要正式品牌展示，再考虑备案域名和自有域名。

## 其他可选方案

- 借用已有备案域名：让朋友或公司已有域名开一个 `/moneypilot/` 子路径。
- 迁移成微信小程序：适合大范围中国大陆用户，但需要重新开发和走小程序审核。
- 上架 App Store：最正规，但需要 Apple Developer 账号、签名、审核和原生/PWA 包装方案。
