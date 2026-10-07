#!/usr/bin/env bash
# actualizar.sh
# Script de actualización directa para Linux / Chromebook (Crostini) / macOS

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "===================================================================="
echo " 🚀 ACTUALIZADOR DOCENTE GVA (CHROMEBOOK / LINUX)"
echo "===================================================================="

# 1. Asegurar repositorio actualizado
echo "[*] Sincronizando repositorio local..."
git pull --quiet origin main || true

# 2. Si existe la carpeta hermana destinos, sincronizarla también
if [ -d "../destinos" ]; then
    echo "[*] Sincronizando repositorio de destinos..."
    (cd ../destinos && git pull --quiet origin main || true)
fi

# 3. Ejecutar el actualizador multiportal de Python
if [ $# -eq 0 ]; then
    # Por defecto rastrea automáticamente y comprueba Telegram
    python3 actualizar_multiportal.py --auto
else
    python3 actualizar_multiportal.py "$@"
fi
