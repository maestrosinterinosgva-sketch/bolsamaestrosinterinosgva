@echo off
chcp 65001 > nul
setlocal enabledelayedexpansion
title Actualizar Adjudicaciones - Interinos Maestros
echo =======================================================
echo    Actualizador de Adjudicaciones Semanales
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
    echo Por favor, instala Python para poder procesar los nuevos PDFs.
    pause
    exit /b 1
)

:: Si se ha arrastrado un archivo PDF o un enlace encima del .bat
if not "%~1"=="" (
    echo [!] Archivo o enlace recibido: "%~1"
    "%PYTHON_EXE%" actualizar_adjudicacion.py "%~1"
) else (
    echo [OPCIÓN A] Pulsa [ENTER] directamente para usar el PDF más reciente de la carpeta.
    echo [OPCIÓN B] O pega aquí directamente el enlace web (URL) del PDF de Conselleria:
    echo.
    set /p "USER_INPUT=👉 Introduce el enlace (o pulsa Enter para automático): "
    if not "!USER_INPUT!"=="" (
        "%PYTHON_EXE%" actualizar_adjudicacion.py "!USER_INPUT!"
    ) else (
        "%PYTHON_EXE%" actualizar_adjudicacion.py
    )
)

echo.
echo Presiona cualquier tecla para salir...
pause > nul
