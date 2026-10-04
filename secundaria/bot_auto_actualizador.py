"""
bot_auto_actualizador.py
Bot autónomo que comprueba las fuentes oficiales de Conselleria y sindicatos
para detectar si se ha publicado una nueva adjudicación o listado de puestos de Secundaria y Otros Cuerpos.
Si detecta un nuevo PDF, lo descarga y ejecuta la actualización automáticamente.
"""
import os
import sys
import re
import urllib.request
import urllib.error
import urllib.parse
import json
import subprocess
from actualizar_secundaria import run_actualizacion, download_pdf_if_url

if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

SOURCES_TO_CHECK = [
    {
        "name": "Portal de Resoluciones Oficiales GVA",
        "url": "https://ceice.gva.es/es/web/rrhh-educacion/resolucion",
        "patterns": [
            r'href="([^"]*lis_sec[^"]*\.pdf)"',
            r'href="([^"]*pue_(?:prov|def)[^"]*\.pdf)"'
        ]
    },
    {
        "name": "Portal Adjudicaciones Continuas GVA",
        "url": "https://ceice.gva.es/es/web/rrhh-educacion/adjudicaciones-continuas",
        "patterns": [
            r'href="([^"]*lis_sec[^"]*\.pdf)"',
            r'href="([^"]*pue_(?:prov|def)[^"]*\.pdf)"'
        ]
    },
    {
        "name": "STEPV Sindicato Docente (Guía Adjudicaciones)",
        "url": "https://stepv.intersindical.org/guies/adjudicacions",
        "patterns": [
            r'href="([^"]*(?:lis_sec|adj_int_sec)[^"]*\.pdf)"',
            r'href="([^"]*pue_(?:prov|def)[^"]*\.pdf)"'
        ]
    },
    {
        "name": "ANPE Sindicato Docente (Interinos)",
        "url": "https://anpecomunidadvalenciana.es/interinos",
        "patterns": [
            r'href="([^"]*(?:openFile\.php\?link=.*lis_sec|lis_sec)[^"]*\.pdf)"'
        ]
    }
]

LAST_PDF_FILE = "data/last_processed_pdf.txt"

def get_last_processed_info():
    if os.path.exists(LAST_PDF_FILE):
        try:
            with open(LAST_PDF_FILE, "r", encoding="utf-8") as f:
                return f.read().strip()
        except Exception:
            return ""
    return ""

def save_last_processed_info(info):
    os.makedirs(os.path.dirname(LAST_PDF_FILE), exist_ok=True)
    with open(LAST_PDF_FILE, "w", encoding="utf-8") as f:
        f.write(info)

def extract_date_tag(url_or_path):
    if not url_or_path:
        return "000000"
    m = re.search(r'(\d{6})', url_or_path)
    if m:
        return m.group(1)
    return "000000"

def search_for_new_pdf():
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
    found_urls = []

    for src in SOURCES_TO_CHECK:
        try:
            req = urllib.request.Request(src["url"], headers=headers)
            with urllib.request.urlopen(req, timeout=20) as resp:
                html = resp.read().decode('utf-8', errors='ignore')
                for pat in src["patterns"]:
                    matches = re.findall(pat, html, re.IGNORECASE)
                    for m in matches:
                        full_url = urllib.parse.urljoin(src["url"], m)
                        found_urls.append((src["name"], full_url))
        except Exception as e:
            print(f"[-] Aviso al consultar {src['name']}: {e}")
            continue

    return found_urls

def push_to_github():
    print("[*] Sincronizando cambios con GitHub...")
    # Buscar git en tools local o PATH
    git_cmd = "git"
    portable_git = os.path.abspath(r"..\interinos\tools\git\cmd\git.exe")
    if os.path.exists(portable_git):
        git_cmd = portable_git

    try:
        subprocess.run([git_cmd, "add", "data/", "index.html", "destinos.html"], check=True)
        res = subprocess.run([git_cmd, "diff", "--staged", "--quiet"])
        if res.returncode == 0:
            print("[i] No hay cambios pendientes que subir a GitHub.")
            return True
        subprocess.run([git_cmd, "commit", "-m", "Auto-update: Datos de Secundaria actualizados [skip ci]"], check=True)
        subprocess.run([git_cmd, "push"], check=True)
        print("[OK] Cambios subidos exitosamente a GitHub.")
        return True
    except Exception as e:
        print(f"[-] No se pudo sincronizar automáticamente con git: {e}")
        return False

def check_and_update():
    print("=" * 64)
    print(" 🤖 BOT AUTÓNOMO DE COMPROBACIÓN - SECUNDARIA GVA")
    print("=" * 64)

    last_pdf = get_last_processed_info()
    last_tag = extract_date_tag(last_pdf)
    print(f"[*] Último archivo registrado: {last_pdf or 'Ninguno'} (Fecha: {last_tag})")
    print("[*] Rastreando fuentes oficiales y sindicatos...")

    found = search_for_new_pdf()
    if not found:
        print("[i] No se han detectado nuevos enlaces en esta pasada.")
        return False

    unique_candidates = {}
    for src_name, pdf_url in found:
        if pdf_url not in unique_candidates:
            unique_candidates[pdf_url] = src_name

    sorted_candidates = sorted(
        unique_candidates.items(),
        key=lambda x: extract_date_tag(x[0]),
        reverse=True
    )

    for pdf_url, src_name in sorted_candidates:
        cand_tag = extract_date_tag(pdf_url)
        print(f"[*] Candidato detectado ({cand_tag}) en {src_name}: {pdf_url}")
        if pdf_url == last_pdf:
            print("[i] El archivo más reciente ya fue procesado. Todo al día.")
            return False
        if cand_tag < last_tag:
            continue

        print(f"[!] ¡NUEVO ARCHIVO DETECTADO ({cand_tag})! Descargando...")
        try:
            local_target = f"secundaria_{cand_tag}.pdf"
            download_pdf_if_url(pdf_url, local_target)
            run_actualizacion(local_target)
            save_last_processed_info(pdf_url)
            push_to_github()
            return True
        except Exception as e:
            print(f"[-] Error al procesar {pdf_url}: {e}")
            continue

    return False

if __name__ == "__main__":
    check_and_update()
