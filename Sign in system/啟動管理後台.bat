@echo off
chcp 65001 >nul
title 簽到系統 - 管理後台伺服器

echo.
echo  ╔══════════════════════════════════╗
echo  ║   照顧服務員術科培訓研討會        ║
echo  ║   簽到管理後台 啟動中...         ║
echo  ╚══════════════════════════════════╝
echo.

:: 啟動 Python 伺服器（背景執行）
start "" /B python -m http.server 8766 --directory "%~dp0"

:: 等待 1 秒讓伺服器啟動
timeout /t 1 /nobreak >nul

:: 自動開啟瀏覽器
echo  ✓ 伺服器啟動成功！正在開啟瀏覽器...
echo  ✓ 網址：http://localhost:8766/admin.html
echo.
echo  ★ 關閉此視窗會停止伺服器
echo  ★ 使用完畢請直接關閉此視窗
echo.

start "" "http://localhost:8766/admin.html"

:: 保持視窗開啟（伺服器持續運作）
python -m http.server 8766 --directory "%~dp0" 2>nul

pause
