@echo off
chcp 65001 > nul
title Bolsa Maestros Interinos GVA - Actualizador Autonomo
echo ================================================================
echo  COMPROBANDO NUEVAS ADJUDICACIONES EN CONSELLERIA GVA
echo ================================================================
echo.
set PYTHON_BIN="C:\Users\herri\AppData\Local\Programs\Python\Python312\python.exe"
if not exist %PYTHON_BIN% set PYTHON_BIN=python

if "%~1"=="" (
    %PYTHON_BIN% bot_auto_actualizador.py
) else (
    %PYTHON_BIN% actualizar_adjudicacion.py "%~1"
    %PYTHON_BIN% -c "from bot_auto_actualizador import push_to_github; push_to_github()"
)
echo.
echo ================================================================
echo  PROCESO FINALIZADO
echo ================================================================
pause
