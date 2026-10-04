@echo off
chcp 65001 > nul
title Actualizar Secundaria GVA con nuevo PDF
echo =======================================================
echo    🎓 ACTUALIZAR SECUNDARIA GVA (BOLSA O DESTINOS)
echo =======================================================
echo.
echo Arrastra un archivo PDF sobre esta ventana o pega la URL oficial,
echo y luego pulsa ENTER:
echo.

set /p "PDF_PATH=👉 Archivo o Enlace PDF: "
if "%PDF_PATH%"=="" (
    echo [!] No has indicado ningún archivo.
    pause
    exit /b 1
)

python actualizar_secundaria.py %PDF_PATH%

echo.
echo =======================================================
echo  🎉 ¡ACTUALIZACIÓN COMPLETADA!
echo =======================================================
pause
