<div align="center">

# 🀄 Cursor 一键汉化工具

**让你的 Cursor 编辑器说中文 —— 一键翻译，一键还原，零副作用。**

[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D16-green?logo=node.js)](https://nodejs.org)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS-blue)](#)
[![License](https://img.shields.io/badge/License-MIT-yellow)](./LICENSE)

</div>

---

## ✨ 功能亮点

- 🚀 **一键汉化** — 运行即翻译，300+ 条 UI 文案全覆盖
- ⏪ **一键还原** — 随时恢复英文原版，干净无残留
- 🛡️ **安装不损坏** — 自动重算文件校验值，消除「安装已损坏」警告
- 🍎 **macOS 适配** — 自动处理 Gatekeeper 签名，免手动 `xattr`
- 🔒 **智能提权** — 权限不足时自动请求管理员权限，无需手动右键
- 💾 **自动备份** — 首次运行自动备份原文件，确保可逆
- 📦 **可打包分发** — 支持 `pkg` 打包为独立可执行文件，无需安装 Node.js

## 📸 效果预览

```
  ┌──────────────────────────────────────┐
  │ ♥ ♠ ♦ ♣ Cursor 一键汉化工具 ♣ ♦ ♠ ♥  │
  │      周四学习钉钉联系我 v1.0.0       │
  │           作者: 不辞水               │
  │     🂡 All in 完美汉化，梭哈！🂡       │
  └──────────────────────────────────────┘

  📂 已定位 Cursor: C:\Users\xxx\AppData\Local\Programs\cursor\resources\app

? 请选择你的策略：
> 🚀  一键汉化 ———— 拿你价值
  ⏪ 恢复英文 ————— 我要验牌
  ──────────────
  ❌ 下周四再见 ———— 小瘪三
```

## 📋 环境要求

| 依赖 | 版本 | 说明 |
|------|------|------|
| **Node.js** | ≥ 16（推荐 18+） | [下载地址](https://nodejs.org/zh-cn) |
| **npm** | 随 Node.js 自带 | 用于安装项目依赖 |
| **Git** | 任意版本 | 用于克隆仓库（也可直接下载 ZIP） |

> 💡 **检查版本**：终端运行 `node -v` 和 `npm -v` 确认已安装。

## 🚀 快速开始

```bash
# 1. 克隆仓库
git clone https://github.com/Wuyf5275/cursor-.git
cd cursor-

# 2. 安装依赖
npm install

# 3. 启动（交互式菜单）
node index.js
```

### 命令行静默模式

```bash
# 直接汉化（跳过交互菜单，适合脚本调用）
node index.js --action=translate

# 恢复英文
node index.js --action=restore
```

## 🏗️ 项目结构

```
cursor-i18n-tool/
├── index.js              # 入口文件：交互菜单 + 提权逻辑
├── src/
│   ├── i18n-core.js      # 核心引擎：正则替换 + Hash 修复 + Gatekeeper
│   ├── dict.js           # 翻译字典：300+ 条 UI 文案映射
│   └── platform.js       # 平台适配：路径探测 + 权限检测 + 提权
├── package.json
└── README.md
```

## 🔧 技术原理

### 三级正则匹配引擎

工具采用分层正则策略，精准替换 UI 文案而不破坏代码逻辑：

| 层级 | 策略 | 目标 |
|------|------|------|
| **L1** 顽固词条 | `trickyReplacements` 逐条硬替换 | 含特殊转义、模板字符串的复杂词条 |
| **L2** 安全长句 | `safeMegaRegex` 单次大正则 | 被引号包裹的长句（按长度降序匹配） |
| **L3** 裸文本长句 | `longMegaRegex` 兜底匹配 | ≥20 字符的裸文本（不与代码变量冲突） |
| **L4** 危险短词 | `riskyRegexes` 上下文感知 | 短词仅在 `children:`、`title:` 等 UI 属性中替换 |

### 文件完整性修复

Cursor 启动时会校验核心文件的哈希值，修改后会弹出「安装已损坏」警告。本工具会：

1. 读取修改后的 `workbench.desktop.main.js`
2. 重新计算哈希值（自动检测 MD5/SHA256/SHA512）
3. 更新 `product.json` 中对应的校验值

### macOS Gatekeeper 处理

在 macOS 上修改 `.app` 包内文件会破坏签名，导致 Gatekeeper 阻止启动。工具会自动：

1. 清除隔离属性 (`xattr -cr`)
2. 本地重签名 (`codesign --force --deep --sign -`)

## 📦 打包构建

```bash
# 安装打包工具
npm install

# 构建全平台
npm run build

# 仅构建 Windows
npm run build:win

# 仅构建 macOS
npm run build:mac
```

产物输出到 `dist/` 目录。

## 🤝 贡献指南

### 添加新的翻译词条

编辑 `src/dict.js`，在对应字典中添加条目：

```javascript
// 安全长句（≥3 个单词或含特殊字符的句子）→ safeGlobalDict
"Your english text here": "你的中文翻译",

// 危险短词（1-2 个单词，可能与代码变量冲突）→ riskyShortWords
"Settings": "设置",
```

**选择字典的原则：**

- 长度 ≥ 20 字符 或 含 3 个以上单词 → `safeGlobalDict`
- 短词（可能与代码中的变量名冲突）→ `riskyShortWords`（仅在 UI 属性上下文中替换）

### 处理特殊格式的词条

如果词条包含模板字符串（如 `${variable}`）、转义字符、或其他需要特殊处理的格式，请添加到 `i18n-core.js` 的 `trickyReplacements` 数组中。

## ⚠️ 注意事项

- 每次 Cursor **更新后**需要重新运行汉化（更新会覆盖修改过的文件）
- 工具会自动备份原文件（`.backup` 后缀），可随时还原
- 部分由服务器动态下发的文案无法通过本工具翻译
- 建议在汉化前关闭 Cursor 编辑器

## 📄 开源许可

[MIT License](./LICENSE) — 随便用，开心就好。

## 🙏 致谢

- 感谢所有为翻译词条做出贡献的小伙伴 —— 海洋饼干、诺导、发发、苗苗、蓉蓉、木木文、蜗牛、杨书记
- 灵感来源于社区对 Cursor 中文化的呼声

---

<div align="center">

**如果这个工具帮到了你，请给个 ⭐ Star 支持一下！**

*Made with ❤️ by 不辞水*

</div>
