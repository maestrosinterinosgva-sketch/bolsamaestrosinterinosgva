@echo off
chcp 65001 > nul
title Actualizador Multiportal GVA (Maestros, Secundaria y Destinos)
cd /d "%~dp0"

echo ====================================================================
echo  🚀 ACTUALIZADOR DOCENTE GVA (MAESTROS, SECUNDARIA Y DESTINOS)
echo ====================================================================
echo.
echo [*] Comprobando fuentes oficiales de Conselleria GVA y sindicatos...
echo [*] Portales incluidos:
echo     1. Bolsa Maestros (Infantil y Primaria)
echo     2. Bolsa Secundaria y FP
echo     3. Destinos Secundaria (Institutos IES / CIPFP)
echo     4. Destinos Maestros (Colegios CEIP)
echo.

if exist "tools\python\python.exe" (
    set "PYTHON_EXE=tools\python\python.exe"
) else (
    set "PYTHON_EXE=python"
)

%PYTHON_EXE% actualizar_multiportal.py --auto %*

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [-] Se detecto un aviso o incidencia durante el proceso.
) else (
    echo.
    echo [OK] Proceso multiportal completado con exito.
)

echo.
pause
