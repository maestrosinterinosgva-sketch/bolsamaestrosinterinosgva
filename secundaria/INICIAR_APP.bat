@echo off
chcp 65001 > nul
title Localizador y Destinos Secundaria GVA
echo =======================================================
echo    🎓 INICIANDO APLICACIÓN SECUNDARIA GVA
echo =======================================================
echo.
echo Abriendo en tu navegador...
start http://localhost:8000/
python -m http.server 8000
pause
