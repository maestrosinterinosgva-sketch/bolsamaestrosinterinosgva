@echo off
chcp 65001 > nul
setlocal enabledelayedexpansion
title Conectar y Subir Secundaria a GitHub
echo =======================================================
echo    🚀 CONECTAR SECUNDARIA CON GITHUB PAGES
echo =======================================================
echo.
cd /d "%~dp0"

set "GIT_EXE=git"
if exist "..\interinos\tools\git\cmd\git.exe" (
    set "GIT_EXE=%~dp0..\interinos\tools\git\cmd\git.exe"
)

echo Introduce el enlace del repositorio de GitHub:
echo (Ejemplo: https://github.com/maestrosinterinosgva-sketch/secundariainterinosgva.git)
echo.
set /p "REPO_URL=👉 Enlace del repositorio: "
if "!REPO_URL!"=="" (
    echo [!] No has introducido ningún enlace.
    pause
    exit /b 1
)

echo.
echo Introduce tu GitHub Personal Access Token (o Enter si ya tienes credenciales):
set /p "GITHUB_TOKEN=👉 Token (ghp_...): "

set "FINAL_URL=!REPO_URL!"
if not "!GITHUB_TOKEN!"=="" (
    set "CLEAN_URL=!REPO_URL:https://=!"
    set "FINAL_URL=https://!GITHUB_TOKEN!@!CLEAN_URL!"
)

echo.
echo [*] Conectando con GitHub...
"%GIT_EXE%" init >nul 2>nul
"%GIT_EXE%" remote remove origin >nul 2>nul
"%GIT_EXE%" remote add origin !FINAL_URL!
"%GIT_EXE%" branch -M main

echo [*] Subiendo archivos...
"%GIT_EXE%" add .
"%GIT_EXE%" commit -m "Publicación de Secundaria y Destinos GVA" >nul 2>nul
"%GIT_EXE%" push -u origin main --force

if %errorlevel% equ 0 (
    echo.
    echo =======================================================
    echo  🎉 ¡PROYECTO SUBIDO A GITHUB CON ÉXITO!
    echo =======================================================
) else (
    echo.
    echo [-] Hubo un problema al subir a GitHub. Revisa el enlace o el token.
)

echo.
pause
