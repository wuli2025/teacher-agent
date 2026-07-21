@echo off
REM 一键更新（Windows）：拉取最新代码并重装依赖、重新构建
setlocal
cd /d "%~dp0"

echo ==^> 拉取最新代码 (git pull)...
git pull --ff-only origin main
if errorlevel 1 goto :err

echo ==^> 安装依赖 (npm install)...
call npm install
if errorlevel 1 goto :err

echo ==^> 构建前端 (npm run build)...
call npm run build
if errorlevel 1 goto :err

echo.
echo [OK] 更新完成。开发预览: npm run dev  ^|  桌面构建: npm run tauri:build
goto :eof

:err
echo.
echo [FAILED] 更新失败，请检查上面的错误信息。
exit /b 1
