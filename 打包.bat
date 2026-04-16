@echo off
chcp 65001 >nul 2>&1
title Package Builder

echo ========================================
echo   Packaging portable version...
echo ========================================

set PYTHON_VER=3.11.9
set PYTHON_URL=https://npmmirror.com/mirrors/python/%PYTHON_VER%/python-%PYTHON_VER%-embed-amd64.zip
set GETPIP_URL=https://bootstrap.pypa.io/get-pip.py
set DEST=%~dp0dist\kesu_tool
set PYTHON_DIR=%DEST%\python

if exist "%DEST%" rmdir /s /q "%DEST%"
mkdir "%DEST%"
mkdir "%PYTHON_DIR%"

echo [1/4] Downloading Python %PYTHON_VER%...
powershell -Command "Invoke-WebRequest -Uri '%PYTHON_URL%' -OutFile '%TEMP%\python-embed.zip'"
if %errorlevel% neq 0 (
    echo [ERROR] Download failed
    goto :end
)

echo [2/4] Extracting Python...
powershell -Command "Expand-Archive -Path '%TEMP%\python-embed.zip' -DestinationPath '%PYTHON_DIR%' -Force"

for %%f in ("%PYTHON_DIR%\python*._pth") do (
    echo import site>> "%%f"
)

echo [3/4] Installing pip and dependencies...
powershell -Command "Invoke-WebRequest -Uri '%GETPIP_URL%' -OutFile '%TEMP%\get-pip.py'"
"%PYTHON_DIR%\python.exe" "%TEMP%\get-pip.py" --quiet
"%PYTHON_DIR%\python.exe" -m pip install -r "%~dp0requirements.txt" -i https://pypi.tuna.tsinghua.edu.cn/simple --quiet
if %errorlevel% neq 0 (
    echo [ERROR] Install failed
    goto :end
)

echo [4/4] Copying project files...
mkdir "%DEST%\config" >nul 2>&1
mkdir "%DEST%\core" >nul 2>&1
mkdir "%DEST%\static" >nul 2>&1
mkdir "%DEST%\templates" >nul 2>&1
copy "%~dp0app.py" "%DEST%\" >nul
copy "%~dp0requirements.txt" "%DEST%\" >nul
copy "%~dp0config\rules.json" "%DEST%\config\" >nul
copy "%~dp0config\stopwords.txt" "%DEST%\config\" >nul
copy "%~dp0core\*.py" "%DEST%\core\" >nul
copy "%~dp0static\*.*" "%DEST%\static\" >nul
copy "%~dp0templates\*.*" "%DEST%\templates\" >nul

echo @echo off> "%DEST%\启动.bat"
echo chcp 65001 ^>nul 2^>^&1>> "%DEST%\启动.bat"
echo title KesuAnalyzer>> "%DEST%\启动.bat"
echo echo Starting...>> "%DEST%\启动.bat"
echo start http://127.0.0.1:5000>> "%DEST%\启动.bat"
echo "%%~dp0python\python.exe" "%%~dp0app.py">> "%DEST%\启动.bat"
echo pause>> "%DEST%\启动.bat"

echo.
echo ========================================
echo   Done! Output: %DEST%
echo ========================================
echo.
echo Send the whole folder to your team.
echo They just double-click the bat file to run.

:end
echo.
pause
