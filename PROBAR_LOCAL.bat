@echo off
chcp 65001 > nul
title Servidor Local - Portales Interinos GVA
cd /d "%~dp0"

if exist "tools\python\python.exe" (
    set "PYTHON_EXE=tools\python\python.exe"
) else (
    set "PYTHON_EXE=python"
)

%PYTHON_EXE% server.py
pause
