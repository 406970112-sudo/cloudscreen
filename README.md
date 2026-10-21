# 云播

基于 Vue 3 + TypeScript + Vite + Pinia + Capacitor 8 的 Android 优先在线播放器 MVP。

当前版本只处理**用户有权访问的媒体直链和夸克分享链接**，并明确拒绝以下做法：

- 不抓取未经授权、没有公开 API 的网盘分享页；
- 不绕过登录、会员、限速或 DRM；
- 不把 App 做成任意 URL 的开放代理；
- 不把临时签名播放地址写入长期资源库。

## 已实现

- 分享文案中的链接和提取码识别；
- 老二搜索资源检索：搜索夸克资源并选择结果，自动回填到分享链接输入框；
- 夸克分享链接直连：分享令牌 → 目录浏览/选集 → 临时播放地址，**不调用转存接口**；
- 夸克登录：需要权限时在 App 内打开登录 WebView，Cookie 保存到系统安全存储；登录成功后自动重试并直接播放，游客小文件可直接播放；
- 媒体直链适配器：MP4、WebM、MOV、MKV、AVI、TS、FLV、HLS、DASH；
- 播放前 Range/Content-Type 探测以及 401/403/HTML 页面识别；
- Capacitor 原生全屏播放器，支持请求头、PiP 配置和恢复播放位置；
- 资源详情、收藏、播放历史、播放进度和资源清空；
- Android 使用 SQLite 持久化，Web 调试回退 `localStorage`；
- 未接入的网盘会显示明确状态，不伪造成功结果。

## 本地开发

```bash
npm install
npm run dev
```

浏览器模式用于 UI 和业务逻辑调试。Web 播放使用 `<video>`，Android/iOS 使用原生播放器。

## 检查

```bash
npm test
npm run build
npx cap sync android
```

## Android

Android 工程位于 `android/`，应用 ID 为 `com.videoplay.app`。

需要本机安装 Android Studio/Android SDK 与 JDK 21：

```bash
npm run build
npx cap sync android
npx cap open android
```

已为 `MainActivity` 开启 `supportsPictureInPicture` 以及播放器要求的 `singleTask`/`configChanges` 配置。

本机构建命令：

```bash
export ANDROID_HOME="$HOME/Library/Android/sdk"
cd android
./gradlew assembleDebug
```

已生成调试 APK：

`artifacts/cloudplay-v0.2.0-debug.apk`

## 目录

```text
src/
  providers/       网盘/媒体适配器与注册表
  services/        分享文案解析、播放探测、原生播放器封装
  repositories/    SQLite / localStorage 仓储实现
  stores/          Pinia 资源库与临时播放会话
  views/           导入、详情、播放、资源库、设置
android/           Capacitor Android 工程
```

## 接入真实网盘适配器

实现 `src/providers/CloudProvider.ts` 中的 `CloudProvider` 并注册到 `src/providers/registry.ts`。适配器必须来自以下任一合法渠道：

1. 平台官方 API/SDK 与合规 OAuth 授权；
2. 获得明确许可、可用于当前用途的接口；
3. 你提供的合法测试资源、账号授权方式和接口文档。

接入前需要验证：分享链接解析、目录读取、播放源获取、5 秒/50%/90% Seek、地址过期刷新，以及 401/403/无权限/提取码错误等状态。

## 当前限制

- 目前只接入夸克分享直连；阿里云盘、百度网盘、123 云盘等仍待按“可直连、不转存”标准逐个接入；
- 夸克分享协议不是公开稳定 SDK，平台改版或风控调整可能导致接口失效，需要持续回归；
- 夸克分享令牌、目录读取和游客大小限制已用真实分享链接验证；登录后的播放地址、原生播放和 Seek 仍需 Android 真机验收；
- 搜索仅接入老二搜索且只展示夸克结果；该第三方接口可能调整或限流，换链失败时会保留手动输入流程；
- 未实现自动导入、流量代理、离线缓存、投屏和 iOS 工程；
- 浏览器媒体探测可能被 CORS 限制，此时会如实显示“未知”并允许尝试播放；
- Android Debug APK 已成功编译，但当前没有连接 Android 真机或模拟器，因此原生登录与播放尚未实机验收。
