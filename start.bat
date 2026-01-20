@echo off
chcp 65001 > nul

rem --- 自动解压 Python 环境 ---
if exist "%~dp0python\python.exe" goto :SKIP_UNZIP
if not exist "%~dp0python.zip" goto :SKIP_UNZIP

echo ==========================================
echo [INFO] 检测到未解压的 Python 包
echo.
echo [1] 自动解压 (脚本自动处理，推荐)
echo [2] 手动解压 (您可以自己解压，适合高级用户，比自动处理快)
echo.
set /p choice=请输入选项 [1/2] (默认1): 
if "%choice%"=="2" goto :MANUAL_UNZIP

:AUTO_UNZIP
echo [INFO] 开始自动解压...
mkdir "%~dp0python" 2>nul
rem 检查是否有 tar 命令
tar --version >nul 2>&1
if errorlevel 1 goto :USE_POWERSHELL

:USE_TAR
echo [INFO] 使用快速解压 (tar)...
tar -xf "%~dp0python.zip" -C "%~dp0python"
if errorlevel 0 goto :UNZIP_DONE
echo [WARNING] tar 解压失败，尝试使用 PowerShell...

:USE_POWERSHELL
echo [INFO] 使用标准解压 (PowerShell)...
powershell -Command "Expand-Archive -Path '%~dp0python.zip' -DestinationPath '%~dp0python' -Force"
goto :UNZIP_DONE

:MANUAL_UNZIP
echo ==========================================
echo 请手动将 python.zip 解压到 python 文件夹。
echo 确保解压后的路径为: python\python.exe
echo ==========================================
echo 完成后请按任意键继续...
pause
if exist "%~dp0python\python.exe" goto :UNZIP_DONE
echo [ERROR] 未检测到 python.exe！请检查解压路径。
echo 请修正后按任意键重试...
pause
goto :MANUAL_UNZIP

:UNZIP_DONE
echo [INFO] Python 环境准备就绪。

:SKIP_UNZIP

echo ==========================================
echo       VideoSync 一键启动器
echo ==========================================
echo ooooooooooooo  o8o                        oooooooooo.                                    
echo 8'   888   `8  `^"'                        `888'   `Y8b                                   
echo      888      oooo   .oooo.   ooo. .oo.    888      888  .ooooo.  ooo. .oo.    .oooooooo 
echo      888      `888  `P  )88b  `888P"Y88b   888      888 d88' `88b `888P"Y88b  888' `88b  
echo      888       888   .oP"888   888   888   888      888 888   888  888   888  888   888  
echo      888       888  d8(  888   888   888   888     d88' 888   888  888   888  `88bod8P'  
echo     o888o     o888o `Y888""8o o888o o888o o888bood8P'   `Y8bod8P' o888o o888o `8oooooo.  
echo                                                                              d"     YD  
echo                                                                              ^"Y88888P'  
echo 天冬AI制作：https://space.bilibili.com/32275117
echo ==========================================
echo                                                                                                                                        
echo ==========================================

set PATH=%~dp0python;%PATH%
cd ui

if not exist "node_modules" (
    echo [INFO] 检测到依赖缺失，正在安装...
    call npm install
)

echo [INFO] 正在启动开发服务器...
set RETRY_COUNT=0

:START_DEV
call npm run dev
if errorlevel 1 goto :CHECK_ERROR
goto :END

:CHECK_ERROR
if "%RETRY_COUNT%"=="1" goto :END

echo [WARNING] 服务器启动异常，正在尝试自动修复...
echo [INFO] 正在重新安装依赖 (npm install)...
call npm install
set RETRY_COUNT=1
echo [INFO] 正在重试启动...
goto :START_DEV

:END
pause
