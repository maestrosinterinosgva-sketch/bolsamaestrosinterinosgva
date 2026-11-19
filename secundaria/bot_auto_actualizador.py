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
        "name": "Portal Convocatoria Telemática GVA (Castellano)",
        "url": "https://ceice.gva.es/es/web/rrhh-educacion/convocatoria-y-peticion-telematica",
        "patterns": [
            r'href="([^"]*lis_sec[^"]*\.pdf)"',
            r'href="([^"]*pue_(?:prov|def)[^"]*\.pdf)"'
        ]
    },
    {
        "name": "Portal Convocatòria Telemàtica GVA (Valencià)",
        "url": "https://ceice.gva.es/va/web/rrhh-educacion/convocatoria-y-peticion-telematica",
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

SEC_DIR = os.path.dirname(os.path.abspath(__file__))
LAST_PDF_FILE = os.path.join(SEC_DIR, "data", "last_processed_pdf.txt")
LAST_HISTORY_FILE = os.path.join(SEC_DIR, "data", "processed_history.json")

def get_last_processed_info():
    if os.path.exists(LAST_PDF_FILE):
        try:
            with open(LAST_PDF_FILE, "r", encoding="utf-8") as f:
                return f.read().strip()
        except Exception:
            return ""
    return ""

def get_history():
    if os.path.exists(LAST_HISTORY_FILE):
        try:
            with open(LAST_HISTORY_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    old_info = get_last_processed_info()
    return {"adjudicacion": old_info, "destinos": ""}

def save_history(history):
    os.makedirs(os.path.dirname(LAST_HISTORY_FILE), exist_ok=True)
    with open(LAST_HISTORY_FILE, "w", encoding="utf-8") as f:
        json.dump(history, f, indent=2)
    # Mantener compatibilidad con archivo legado
    with open(LAST_PDF_FILE, "w", encoding="utf-8") as f:
        f.write(history.get("adjudicacion") or history.get("destinos") or "")

def extract_date_tag(url_or_path):
    if not url_or_path:
        return "000000"
    filename = os.path.basename(urllib.parse.urlparse(url_or_path).path)
    m = re.search(r'(\d{6})', filename)
    if m:
        return m.group(1)
    return "000000"

def get_pdf_category(url_or_path):
    name = os.path.basename(urllib.parse.urlparse(url_or_path).path).lower()
    if "pue_" in name or "plazas" in name or "puestos" in name:
        return "destinos"
    return "adjudicacion"

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
        subprocess.run([git_cmd, "config", "user.name", "Bot Destinos Colab"], check=False)
        subprocess.run([git_cmd, "config", "user.email", "bot@interinos.valencia"], check=False)
        subprocess.run([git_cmd, "add", "data/", "index.html", "destinos.html"], check=True)
        res = subprocess.run([git_cmd, "diff", "--staged", "--quiet"])
        if res.returncode == 0:
            print("[i] No hay cambios pendientes que subir a GitHub.")
            return True
        subprocess.run([git_cmd, "commit", "-m", "Auto-update: Datos de Secundaria actualizados [skip ci]"], check=True)
        subprocess.run([git_cmd, "push", "origin", "main"], check=False)
        print("[OK] Cambios subidos exitosamente a GitHub.")
        return True
    except Exception as e:
        print(f"[-] No se pudo sincronizar automáticamente con git: {e}")
        return False

def is_dificil_cobertura_pdf(pdf_path):
    """Devuelve True si el PDF corresponde a puestos de difícil cobertura y no a adjudicación continua ordinaria."""
    try:
        import pymupdf
        doc = pymupdf.open(pdf_path)
        if len(doc) > 0:
            txt = doc[0].get_text().upper()
            if "DIFÍCIL COBERTURA" in txt or "DIFICIL COBERTURA" in txt:
                return True
    except Exception:
        pass
    return False

def check_and_update():
    print("=" * 64)
    print(" 🤖 BOT AUTÓNOMO DE COMPROBACIÓN - SECUNDARIA Y DESTINOS GVA")
    print("=" * 64)

    history = get_history()
    print(f"[*] Registros previos -> Adjudicación: {history.get('adjudicacion') or 'Ninguno'} | Destinos: {history.get('destinos') or 'Ninguno'}")
    print("[*] Rastreando fuentes oficiales y sindicatos...")

    found = search_for_new_pdf()
    if not found:
        print("[i] No se han detectado nuevos enlaces en esta pasada.")
        return False

    # Ordenar candidatos por categoría (adjudicacion vs destinos) de más reciente a más antiguo
    grouped = {"adjudicacion": [], "destinos": []}
    seen_urls = set()

    for src_name, pdf_url in found:
        if pdf_url in seen_urls:
            continue
        seen_urls.add(pdf_url)
        cat = get_pdf_category(pdf_url)
        cand_tag = extract_date_tag(pdf_url)
        is_def = 1 if "pue_def" in pdf_url.lower() else 0
        # Priorizar fuentes oficiales ceice sobre espejos y pue_def sobre pue_prov
        is_official = 1 if "ceice.gva.es" in pdf_url.lower() and "416898822" not in pdf_url else 0
        grouped[cat].append(((cand_tag, is_def, is_official), pdf_url, src_name, cand_tag))

    for cat in grouped:
        grouped[cat].sort(key=lambda x: x[0], reverse=True)

    any_updated = False

    for cat in ["destinos", "adjudicacion"]:
        cands = grouped[cat]
        if not cands:
            continue

        last_url = history.get(cat, "")
        last_tag = extract_date_tag(last_url)
        cat_title = "DESTINOS / PUESTOS" if cat == "destinos" else "ADJUDICACIÓN DE INTERINOS"

        for _, pdf_url, src_name, cand_tag in cands:
            print(f"\n[*] Comprobando {cat_title}:")
            print(f"    - Candidato detectado ({cand_tag}) en {src_name}: {pdf_url}")

            if pdf_url == last_url:
                print(f"    [i] {cat_title} ya está al día.")
                break
            if cand_tag < last_tag:
                print(f"    [i] El archivo detectado es más antiguo ({cand_tag} < {last_tag}). Omitiendo.")
                break

            print(f"    [!] ¡NUEVO ARCHIVO DE {cat_title} DETECTADO ({cand_tag})! Descargando...")
            try:
                local_target = f"secundaria_{cat}_{cand_tag}.pdf"
                download_pdf_if_url(pdf_url, local_target)
                if cat == "destinos" and is_dificil_cobertura_pdf(local_target):
                    print(f"    [i] '{os.path.basename(pdf_url)}' es de Difícil Cobertura (formato distinto). Omitiendo...")
                    continue
                run_actualizacion(local_target)
                history[cat] = pdf_url
                any_updated = True
                print(f"    [OK] {cat_title} procesado exitosamente.")
                break
            except Exception as e:
                print(f"    [-] Error al procesar {pdf_url}: {e}")

    if any_updated:
        save_history(history)
        push_to_github()
        return True
    else:
        print("\n[i] Todos los documentos (Destinos y Adjudicaciones) están al día.")
        return False

if __name__ == "__main__":
    check_and_update()
