@echo off
chcp 65001 >nul 2>&1
title KesuAnalyzer

where python >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python not found
    goto :end
)

python --version

python -c "import flask" >nul 2>&1
if %errorlevel% neq 0 (
    echo Installing dependencies...
    python -m pip install -r "%~dp0requirements.txt" -i https://pypi.tuna.tsinghua.edu.cn/simple
    if %errorlevel% neq 0 (
        echo [ERROR] Install failed
        goto :end
    )
)

echo Starting... Opening browser...
start http://127.0.0.1:5000
python "%~dp0app.py"

:end
pause
