@echo off
chcp 65001 > nul
echo =======================================================
echo    LANZANDO SERVIDOR LOCAL PARA PRUEBAS (MADRID)
echo =======================================================
echo.
echo Abriendo en el navegador: http://localhost:8080/madrid/
echo Para detener el servidor, pulsa Ctrl + C en esta ventana.
echo.
start http://localhost:8080/madrid/
python -m http.server 8080
