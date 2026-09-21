"""
bot_auto_actualizador.py
Bot autónomo que comprueba las fuentes oficiales de Conselleria y sindicatos
para detectar si se ha publicado una nueva adjudicación de maestros.
Si detecta un nuevo PDF, lo descarga y ejecuta la actualización automáticamente.
"""
import os
import sys
import re
import urllib.request
import urllib.error
import urllib.parse
import json
from actualizar_adjudicacion import main as run_actualizacion, download_pdf_if_url

if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

# Palabras clave que indican que es un listado de puestos/plazas y NO de adjudicaciones
DISALLOWED_KEYWORDS = ["pue_prov", "pue_def", "puesto", "ofert", "llocs_oferits", "convocatoria", "vacante", "provisional"]

def is_valid_adjudicacion_candidate(url_or_path):
    name = os.path.basename(url_or_path).lower()
    # Descartar taxativamente si es un documento de plazas u oferta
    if any(bad in name for bad in DISALLOWED_KEYWORDS):
        return False
    # Debe ser expresamente un listado de adjudicación de maestros
    return ("lis_mae" in name or "adj_int_mae" in name)

# Fuentes públicas donde se anuncian las adjudicaciones continuas de maestros
SOURCES_TO_CHECK = [
    {
        "name": "Portal de Resoluciones Oficiales GVA",
        "url": "https://ceice.gva.es/es/web/rrhh-educacion/resolucion",
        "patterns": [r'href="([^"]*lis_mae[^"]*\.pdf)"']
    },
    {
        "name": "Portal de Resolucions GVA (Valencià)",
        "url": "https://ceice.gva.es/ca/web/rrhh-educacion/resolucion",
        "patterns": [r'href="([^"]*lis_mae[^"]*\.pdf)"']
    },
    {
        "name": "Portal Adjudicaciones Continuas GVA",
        "url": "https://ceice.gva.es/es/web/rrhh-educacion/adjudicaciones-continuas",
        "patterns": [r'href="([^"]*lis_mae[^"]*\.pdf)"']
    },
    {
        "name": "ANPE Sindicato Docente (Espejo alternativo)",
        "url": "https://anpecomunidadvalenciana.es/interinos",
        "patterns": [r'href="([^"]*(?:openFile\.php\?link=.*lis_mae|lis_mae)[^"]*\.pdf)"']
    },
    {
        "name": "STEPV Sindicato Docente (Espejo alternativo)",
        "url": "https://stepv.intersindical.org/guies/adjudicacions",
        "patterns": [r'href="([^"]*(?:lis_mae|adj_int_mae)[^"]*\.pdf)"']
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

def search_for_new_pdf():
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
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
                        if is_valid_adjudicacion_candidate(full_url):
                            found_urls.append((src["name"], full_url))
        except Exception as e:
            print(f"[-] Aviso al consultar {src['name']}: {e}")
            continue

    return found_urls

def extract_date_tag(url_or_path):
    if not url_or_path:
        return "000000"
    m = re.search(r'(\d{6})_lis_mae', url_or_path)
    if m:
        return m.group(1)
    m2 = re.search(r'(\d{6})', url_or_path)
    if m2:
        return m2.group(1)
    return "000000"

def check_and_update():
    print("=" * 64)
    print(" 🤖 BOT AUTÓNOMO DE COMPROBACIÓN DE ADJUDICACIONES")
    print("=" * 64)
    
    last_pdf = get_last_processed_info()
    last_tag = extract_date_tag(last_pdf)
    print(f"[*] Último archivo registrado: {last_pdf or 'Ninguno'} (Fecha: {last_tag})")
    print("[*] Rastreando fuentes oficiales y espejos...")

    found = search_for_new_pdf()
    if not found:
        print("[i] No se han detectado nuevos enlaces directos en esta pasada.")
        print("    (Conselleria suele publicar los martes y jueves a mediodía)")
        return False

    # Eliminar duplicados y ordenar por fecha más reciente primero (descendente)
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
            print("[i] El PDF más reciente ya ha sido procesado. La web está al día.")
            return False
        if cand_tag < last_tag:
            print(f"[i] El archivo es más antiguo ({cand_tag} < {last_tag}). Omitiendo.")
            continue

        print(f"[!] ¡NUEVA ADJUDICACIÓN DETECTADA ({cand_tag})! Descargando...")
        try:
            local_pdf = download_pdf_if_url(pdf_url)
            # Ejecutar actualización completa
            sys.argv = ["actualizar_adjudicacion.py", local_pdf]
            run_actualizacion()
            save_last_processed_info(pdf_url)
            print("[OK] ¡Proceso autónomo completado con éxito!")
            push_to_github()
            
            # Notificar por Telegram si está configurado
            try:
                from bot_telegram import get_telegram_config, send_telegram_message
                cfg = get_telegram_config()
                if cfg.get("token") and cfg.get("chat_id"):
                    stats_file = "data/stats_summary.json"
                    fecha = "Reciente"
                    convocados, plazas = 0, 0
                    if os.path.exists(stats_file):
                        with open(stats_file, "r", encoding="utf-8") as sf:
                            st = json.load(sf)
                            fecha = st.get("fecha_adjudicacion", fecha)
                            convocados = st.get("total_adjudicaciones_hoy", 0)
                            plazas = st.get("total_plazas_adjudicadas", 0)
                    web_url = os.environ.get("WEB_URL", "https://maestrosinterinosgva-sketch.github.io/bolsamaestrosinterinosgva/")
                    msg = (
                        f"🤖 <b>¡Nueva Adjudicación detectada y publicada!</b>\n\n"
                        f"📅 <b>Fecha:</b> {fecha}\n"
                        f"👥 <b>Convocados:</b> {convocados:,}\n"
                        f"🏫 <b>Plazas adjudicadas:</b> {plazas:,}\n\n"
                        f"🌐 <b>Ver web:</b>\n"
                        f"{web_url}"
                    )
                    send_telegram_message(cfg["token"], cfg["chat_id"], msg)
            except Exception as e_tg:
                print(f"[i] Telegram info: {e_tg}")

            return True
        except Exception as e:
            print(f"[-] Error al procesar {pdf_url}: {e}")

    return False

def push_to_github():
    if os.environ.get("GITLAB_CI"):
        print("[*] Ejecutándose dentro de GitLab CI; el pipeline gestionará el commit y push al finalizar.")
        return True

    print("[*] Publicando cambios automáticamente...")
    import subprocess
    git_cmd = r"tools\git\cmd\git.exe"
    if not os.path.exists(git_cmd):
        git_cmd = "git"
    
    try:
        subprocess.run([git_cmd, "config", "user.name", "Bot Adjudicaciones"], check=False)
        subprocess.run([git_cmd, "config", "user.email", "bot@interinos.valencia"], check=False)
        subprocess.run([git_cmd, "add", "index.html", "data/", "interinos_web.zip"], check=True)
        subprocess.run([git_cmd, "commit", "-m", "Auto-update: Nueva adjudicación publicada por Conselleria GVA"], check=True)
        subprocess.run([git_cmd, "push", "gitlab", "main"], check=False)
        subprocess.run([git_cmd, "push", "origin", "main"], check=False)
        print("[OK] ¡Cambios subidos con éxito! Estará visible online en ~30 segundos.")
        return True
    except Exception as e:
        print(f"[-] Error al subir cambios: {e}")
        return False

if __name__ == "__main__":
    import time
    if "--continuous" in sys.argv:
        duration_minutes = 15
        print(f"[*] Modo continuo activado: supervisando la web de Conselleria cada 60 segundos...")
        start_time = time.time()
        updated = False
        while time.time() - start_time < duration_minutes * 60:
            if check_and_update():
                updated = True
                break
            print("[*] Esperando 60 segundos antes de la siguiente comprobación...")
            time.sleep(60)
        if not updated:
            print("[i] Fin del ciclo de supervisión continua sin novedades.")
    else:
        check_and_update()
