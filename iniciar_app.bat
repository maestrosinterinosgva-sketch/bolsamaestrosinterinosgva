@echo off
chcp 65001 > nul
title Localizador de Interinos - Generalitat Valenciana
echo =======================================================
echo    Iniciando App de Interinos y Adjudicaciones...
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
    echo Por favor, instala Python desde https://www.python.org o Microsoft Store.
    pause
    exit /b 1
)

echo Usando Python: %PYTHON_EXE%
echo.

:: Verificar si los datos existen, si no, generarlos
if not exist "data\interinos_data.json" (
    echo [!] Primera ejecucin detectada: Procesando documentos PDF...
    "%PYTHON_EXE%" parse_data.py
    echo.
)

:: Iniciar servidor y abrir navegador
"%PYTHON_EXE%" server.py

pause
