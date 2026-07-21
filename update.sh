#!/usr/bin/env bash
# 一键更新（macOS / Linux）：拉取最新代码并重装依赖、重新构建
set -euo pipefail
cd "$(dirname "$0")"

echo "==> 拉取最新代码 (git pull)…"
git pull --ff-only origin main

echo "==> 安装依赖 (npm install)…"
npm install

echo "==> 构建前端 (npm run build)…"
npm run build

echo "✅ 更新完成。开发预览: npm run dev  |  桌面构建: npm run tauri:build"
