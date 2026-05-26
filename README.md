# Caradance

Caradance 是一个面向 B 站视频页的扒舞浏览器插件仓库，参考了 `BilibiliDanceMonkey` 的项目组织方式，并补齐了可构建、可打包的扩展结构。

## 当前能力

- 视频控制：播放、暂停、倍速调节
- 打点拆舞：记录关键帧、跳转上一个点、跳转下一个点
- A/B 点练习：设置 A 点、设置 B 点、从 A 点回放
- 循环练习：优先循环 A/B 区间；未设置 A/B 时，循环当前打点片段
- 历史片段：保存 A/B 片段到当前视频历史，支持快速回放和删除
- 页面浮层：在 B 站视频页内显示侧边控制面板
- 插件弹窗：在浏览器扩展弹窗中直接操作当前视频

## 仓库结构

```text
kara_dance/
├── package.json
├── scripts/
│   ├── build.js
│   └── build-zip.js
├── src/
│   ├── background.js
│   ├── manifest.json
│   ├── content-script/
│   │   └── content-script.js
│   └── popup/
│       ├── popup.css
│       ├── popup.html
│       └── popup.js
└── dist/
```

## 本地使用

1. 安装依赖

```bash
npm install
```

2. 构建扩展目录

```bash
npm run build
```

3. 打包 zip

```bash
npm run build-zip
```

4. 在 Chrome 中加载

```text
扩展程序 -> 打开开发者模式 -> 加载已解压的扩展程序 -> 选择 dist 目录
```

## 说明

- 当前版本以 B 站扒舞为主，匹配范围是 `*.bilibili.com`
- 数据保存在浏览器 `chrome.storage.local`
- 打点和历史片段按视频维度分别保存
