# 教师助手

面向教学场景的桌面 AI 工作台：Tauri 2 + Vue 3 前端 / Rust 多 crate 后端（12 crate workspace，
桌面 / 服务端双壳共用同一份引擎源码）。

从 [Polaris](https://github.com/wuli2025/polaris_coworker) fork 而来（经由 GEO 分支），
作为**独立产品**发布、独立自动更新，与上游及同源分支在应用标识、数据目录、构建产物、
容器命名上**完全隔离**。

## 隔离边界（同源项目并存的真源）

同一台机器上可以并存、同时运行，互不干扰。改下表任何一项前，先确认不会与邻居撞车：

| 维度 | polaris-app（上游） | GEO | **本项目 教师助手** |
|---|---|---|---|
| 应用标识 | `com.polaris.app` | `com.polaris.geo` | **`com.polaris.teacher`** |
| 产品名 / 窗口标题 | Polaris / 北极星 · Polaris | Polaris GEO | **教师助手** |
| 数据目录 | `~/Polaris` | `~/PolarisGEO` | **`~/PolarisTeacher`** |
| 自动更新源 | llmwiki.cloud + polaris_coworker | github.com/wuli2025/GEO | **github.com/wuli2025/teacher-agent**（独立签名密钥） |
| 前端 dev 端口 | 1421 | — | **1422** |
| Cargo 包 / 桌面 bin | `polaris-app` | — | **`polaris-teacher`** |
| Rust lib | `polaris_app_lib` | — | **`polaris_teacher_lib`** |
| 服务端 bin | `polaris-server` | — | **`teacher-server`** |
| Docker 容器 | polaris-web / -gitea / -relay | — | **teacher-web / teacher-gitea / teacher-relay** |
| Docker 镜像 / 卷 | polaris-server / polaris-data… | — | **teacher-server / teacher-data、teacher-claude、teacher-gitea-data** |
| Web 宿主端口 | 8080 | — | **8081**（容器内仍是 8080，`TEACHER_WEB_PORT` 可改） |

两个已知的例外，都是有意为之：

- **`polaris-forge`**（forge 引擎 CLI）沿用原名 —— 它由 Rust 代码按名字拉起（`polaris-fable/src/fable/agent.rs`），
  改名有运行时风险。它只落在各自的 `src-tauri/target/` 里，不会跨项目串。
- **`POLARIS_*` 环境变量**（`POLARIS_AUTH_TOKEN` 等）沿用原名 —— 那是后端代码读取的变量名，
  且各项目 `.env` 本就独立，不构成冲突。容器编排层的新变量走 `TEACHER_*` 前缀。

## 技能

- 自媒体运营：`wechat-pipeline`、`xiaohongshu-pipeline`、`xhs-mao-pipeline`、`hot-topic-radar`、
  `content-analytics-report`、`community-engagement`、`wechat-md-typesetter`、
  `gz-wechat-article-writer`、`gz-notion-infographic`、`media-publisher`
- 生成类：`polaris-web-studio`（网页）、`polaris-deck-studio`（讲义/PPT）、`polaris-story-video`（讲解视频）

`llmwiki/` 目录内置了一份 RAG 知识库分块。

> 注：技能集仍是 GEO 时期的自媒体阵容，尚未按教学场景重排。

## 开发运行

```powershell
# 需要 Rust (cargo) + Node 20+ 在 PATH
npm install
npm run tauri:dev      # 桌面开发实例（窗口标题带 "(Dev x.y.z)"）
```

- 发桌面安装包：`npm run tauri:build`（Win NSIS / macOS dmg）
- server / Docker 形态：`cargo build -p polaris-cli --bin teacher-server`（不拉 Tauri，详见 `DOCKER.md`）
- 板块边界自检：`npm run check:boundaries`

> ⚠ 构建前置：`audiopus_sys`（forge codec 板块的 Opus 编码）的 build script 需要 autotools。
> Linux/WSL 上先 `apt install autoconf automake libtool`，否则编译会停在 “Failed to autogen Opus”。

## 首次运行

数据目录 `~/PolarisTeacher` 与其它同源项目完全隔离，属**全新实例**：首次进入需在设置里
配置一个 AI 供应商（接 Claude Code 的账号/模型），对话才能跑起来。

## 部署

| 文档 | 用途 |
|---|---|
| `DOCKER.md` | 容器版架构、双壳共用源码的原理、特性存活矩阵 |
| `DEPLOY-CLOUD.md` | Linux 云服务器一键上云（含备份 / 升级 / 构建排错） |
| `DEPLOY-SYNOLOGY.md` | 群晖 NAS 部署（注：文中引用的 `docker-compose.synology.yml` 未随 fork 带过来，仓库里没有） |

## 目录

```
教师助手/
├── src/                # Vue 3 前端（三栏布局，Pinia）
├── src-tauri/          # Rust workspace（12 crate）+ 双壳(desktop/server)
│   ├── src/            # 组装壳：lib.rs 命令注册 / wiring.rs 引擎注入 / server.rs axum
│   ├── crates/         # polaris-kernel(主底座) / polaris-forge(生成引擎) / fable / wiki / collab …
│   └── tauri.conf.json # productName / identifier / updater 均为教师助手专属
├── llmwiki/            # 内置 RAG 知识库分块
└── docker/ · Dockerfile · docker-compose.yml
```

> 本仓库从上游 `polaris_coworker` 剥离改造而来，非上游官方分发。
