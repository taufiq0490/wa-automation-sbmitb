@echo off
title MBA ITB Jakarta - WhatsApp Reminder Automation
color 0B

echo ================================================================
echo    MBA ITB Jakarta Academic Operations
echo    WhatsApp Weekly Lecture Reminder Automation System
echo ================================================================
echo.

cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
    echo [INFO] Menyiapkan environment Python pertama kali...
    if exist "%LOCALAPPDATA%\Programs\Anki\uv.exe" (
        "%LOCALAPPDATA%\Programs\Anki\uv.exe" venv .venv
        "%LOCALAPPDATA%\Programs\Anki\uv.exe" pip install flask requests openpyxl
    ) else (
        python -m venv .venv
        .venv\Scripts\pip install flask requests openpyxl
    )
)

echo [INFO] Menjalankan server aplikasi...
start http://127.0.0.1:5000

.venv\Scripts\python.exe app.py

pause
