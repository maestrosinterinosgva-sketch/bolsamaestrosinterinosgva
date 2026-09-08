@echo off
chcp 65001 > nul
setlocal enabledelayedexpansion
title Bot Actualizador Automático - Conselleria GVA
echo =======================================================
echo    🤖 Buscador y Actualizador Automático de Listas
echo =======================================================
echo.
cd /d "%~dp0"

:: Buscar ejecutable de Python
set PYTHON_EXE=
if exist "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" (
    set "PYTHON_EXE=%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
) else (
    where python >nul 2>nul
    if %errorlevel% equ 0 (
        set "PYTHON_EXE=python"
    ) else (
        where py >nul 2>nul
        if %errorlevel% equ 0 (
            set "PYTHON_EXE=py"
        )
    )
)

if "%PYTHON_EXE%"=="" (
    echo [ERROR] No se ha encontrado Python instalado en el sistema.
    pause
    exit /b 1
)

"%PYTHON_EXE%" bot_auto_actualizador.py

echo.
echo Presiona cualquier tecla para salir...
pause > nul
