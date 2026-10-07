"""
actualizar_multiportal.py
Script unificado maestro para la actualización de todas las plataformas docentes GVA:
1. Maestros Primaria (Bolsa e Interinos)
2. Secundaria y Otros Cuerpos (Bolsa e Interinos)
3. Destinos Secundaria (Centros e Institutos)
4. Destinos Primaria (Centros de Maestros en repositorio destinosinterinosgva)

Compatible con:
- Google Colab (nube 100%, móvil/Chromebook/PC)
- GitHub Actions (ejecución periódica o manual)
- Telegram Bot (descarga automática de documentos recibidos)
- Ejecución local (Windows / Linux / macOS)
"""

import os
import sys
import re
import json
import glob
import shutil
import urllib.request
import urllib.parse
import subprocess

if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

def get_destinos_dir(custom_path=None):
    if custom_path and os.path.exists(custom_path):
        return os.path.abspath(custom_path)
    # Priorizar la carpeta interna unificada 'destinos/'
    candidates = [
        os.path.join(BASE_DIR, "destinos"),
        os.path.join(BASE_DIR, "..", "destinos"),
        os.path.join(os.getcwd(), "destinos"),
    ]
    for c in candidates:
        if os.path.exists(c) and os.path.exists(os.path.join(c, "actualizar_puestos.py")):
            return os.path.abspath(c)
    return None

def detect_pdf_category(filename_or_path):
    """
    Detecta si un PDF corresponde a:
    - 'maestros_adj': Listado de adjudicación de maestros (lis_mae)
    - 'secundaria_adj': Listado de adjudicación de secundaria (lis_sec)
    - 'puestos': Relación de puestos ofertados (pue_prov / pue_def)
    """
    name = os.path.basename(filename_or_path).lower()
    
    # Comprobar por nombre
    if "pue_prov" in name or "pue_def" in name or "llocs_oferits" in name or "puestos" in name:
        return "puestos"
    if "lis_sec" in name or "adj_int_sec" in name or "secundaria" in name:
        return "secundaria_adj"
    if "lis_mae" in name or "adj_int_mae" in name or "maestros" in name:
        return "maestros_adj"

    # Si el nombre no es concluyente, inspeccionar el texto de la primera página
    try:
        import pymupdf
        doc = pymupdf.open(filename_or_path)
        first_text = doc[0].get_text().upper()
        if "LLOCS OFERTATS" in first_text or "PUESTOS OFERTADOS" in first_text:
            return "puestos"
        if "SECUND" in first_text or "0590" in first_text:
            return "secundaria_adj"
        if "MESTRES" in first_text or "MAESTROS" in first_text or "0597" in first_text:
            return "maestros_adj"
    except Exception:
        pass

    return "maestros_adj"

def sync_html_fallbacks(destinos_dir=None):
    """
    Sincroniza automáticamente fechas y estadísticas estáticas en los HTML
    a partir de los archivos JSON generados.
    """
    # 1. Maestros Primaria
    try:
        stats_path = os.path.join(BASE_DIR, "data", "stats_summary.json")
        html_path = os.path.join(BASE_DIR, "index.html")
        if os.path.exists(stats_path) and os.path.exists(html_path):
            with open(stats_path, "r", encoding="utf-8") as f:
                st = json.load(f)
            with open(html_path, "r", encoding="utf-8") as f:
                content = f.read()

            fec = st.get("fecha_adjudicacion", "")
            if fec:
                content = re.sub(
                    r'(<span id="headerAdjDate">Adjudicaci&oacute;n )[^<]+(&bull; Maestros Generalitat Valenciana</span>)',
                    rf'\g<1>{fec} \g<2>',
                    content
                )
                content = re.sub(
                    r'(<h2>📊 Resumen de Adjudicación del )[^<]+(</h2>)',
                    rf'\g<1>{fec}\g<2>',
                    content
                )
                content = re.sub(
                    r'(<span class="status-dot"></span> Datos oficiales del )[^<]+',
                    rf'\g<1>{fec}',
                    content
                )
                tot_bolsa = f"{st.get('total_participantes_bolsa', 0):,}".replace(",", ".")
                tot_adj = f"{st.get('total_adjudicaciones_hoy', 0):,}".replace(",", ".")
                tot_plz = f"{st.get('total_plazas_adjudicadas', 0):,}".replace(",", ".")

                content = re.sub(r'(id="globTotalBolsa">)[^<]+(<)', rf'\g<1>{tot_bolsa}\g<2>', content)
                content = re.sub(r'(id="globTotalAdj">)[^<]+(<)', rf'\g<1>{tot_adj}\g<2>', content)
                content = re.sub(r'(id="globTotalPlazas"[^>]*>)[^<]+(<)', rf'\g<1>{tot_plz}\g<2>', content)

                with open(html_path, "w", encoding="utf-8") as f:
                    f.write(content)
    except Exception as e:
        print(f"[-] Aviso al sincronizar index.html de Maestros: {e}")

    # 2. Secundaria
    try:
        sec_stats_path = os.path.join(BASE_DIR, "secundaria", "data", "stats_summary.json")
        sec_html_path = os.path.join(BASE_DIR, "secundaria", "index.html")
        if os.path.exists(sec_stats_path) and os.path.exists(sec_html_path):
            with open(sec_stats_path, "r", encoding="utf-8") as f:
                st = json.load(f)
            with open(sec_html_path, "r", encoding="utf-8") as f:
                content = f.read()

            fec = st.get("fecha_adjudicacion", "")
            if fec:
                content = re.sub(
                    r'(<span id="headerAdjDate">Adjudicación )[^<]+(&bull; Secundaria y Otros Cuerpos GVA</span>)',
                    rf'\g<1>{fec} \g<2>',
                    content
                )
                tot_bolsa = f"{st.get('total_participantes_bolsa', 0):,}".replace(",", ".")
                tot_adj = f"{st.get('total_adjudicaciones_hoy', 0):,}".replace(",", ".")
                tot_plz = f"{st.get('total_plazas_adjudicadas', 0):,}".replace(",", ".")

                content = re.sub(r'(id="globTotalBolsa">)[^<]+(<)', rf'\g<1>{tot_bolsa}\g<2>', content)
                content = re.sub(r'(id="globTotalAdj">)[^<]+(<)', rf'\g<1>{tot_adj}\g<2>', content)
                content = re.sub(r'(id="globTotalPlazas"[^>]*>)[^<]+(<)', rf'\g<1>{tot_plz}\g<2>', content)

                with open(sec_html_path, "w", encoding="utf-8") as f:
                    f.write(content)
    except Exception as e:
        print(f"[-] Aviso al sincronizar index.html de Secundaria: {e}")

    # 3. Destinos Secundaria
    try:
        sec_dest_stats = os.path.join(BASE_DIR, "secundaria", "data", "destinos_stats.json")
        sec_dest_html = os.path.join(BASE_DIR, "secundaria", "destinos.html")
        if os.path.exists(sec_dest_stats) and os.path.exists(sec_dest_html):
            with open(sec_dest_stats, "r", encoding="utf-8") as f:
                st = json.load(f)
            with open(sec_dest_html, "r", encoding="utf-8") as f:
                content = f.read()
            fec = st.get("fecha_adjudicacion", "")
            if fec:
                content = re.sub(
                    r'(id="navAdjudicacionDate">\s*📅 Adjudicación:\s*)[^\s<]+',
                    rf'\g<1>{fec}',
                    content
                )
                with open(sec_dest_html, "w", encoding="utf-8") as f:
                    f.write(content)
    except Exception as e:
        print(f"[-] Aviso al sincronizar destinos.html de Secundaria: {e}")

    # 4. Destinos Primaria (si existe la carpeta destinos)
    if destinos_dir and os.path.exists(destinos_dir):
        try:
            dest_stats_path = os.path.join(destinos_dir, "data", "stats_summary.json")
            dest_html_path = os.path.join(destinos_dir, "index.html")
            if os.path.exists(dest_stats_path) and os.path.exists(dest_html_path):
                with open(dest_stats_path, "r", encoding="utf-8") as f:
                    st = json.load(f)
                with open(dest_html_path, "r", encoding="utf-8") as f:
                    content = f.read()
                fec = st.get("fecha_adjudicacion", "")
                if fec:
                    content = re.sub(
                        r'(id="navAdjudicacionDate">\s*📅 Adjudicación:\s*)[^\s<]+',
                        rf'\g<1>{fec}',
                        content
                    )
                    with open(dest_html_path, "w", encoding="utf-8") as f:
                        f.write(content)
        except Exception as e:
            print(f"[-] Aviso al sincronizar index.html de Destinos Primaria: {e}")

def process_pdf_file(pdf_path, destinos_dir=None):
    """
    Procesa un PDF local según su tipología y actualiza las webs correspondientes.
    """
    cat = detect_pdf_category(pdf_path)
    print(f"\n[*] Procesando archivo: {os.path.basename(pdf_path)} (Categoría detectada: {cat})")
    
    updated_maestros = False
    updated_secundaria = False
    updated_destinos = False

    if cat == "maestros_adj":
        print("[+] Actualizando Bolsa de Maestros (Primaria)...")
        from actualizar_adjudicacion import main as run_mae
        run_mae(pdf_path)
        updated_maestros = True

    elif cat == "secundaria_adj":
        print("[+] Actualizando Bolsa de Secundaria y FP...")
        sys.path.insert(0, os.path.join(BASE_DIR, "secundaria"))
        from actualizar_secundaria import run_actualizacion as run_sec
        run_sec(pdf_path)
        updated_secundaria = True

    elif cat == "puestos":
        print("[+] Documento de PUESTOS OFERTADOS detectado.")
        
        # 1. Actualizar Secundaria Destinos
        print("[+] Actualizando Destinos de Secundaria y FP...")
        sys.path.insert(0, os.path.join(BASE_DIR, "secundaria"))
        from actualizar_secundaria import run_actualizacion as run_sec_puestos
        run_sec_puestos(pdf_path)
        updated_secundaria = True

        # 2. Actualizar Primaria Destinos (en repositorio destinosinterinosgva)
        if destinos_dir and os.path.exists(destinos_dir):
            print(f"[+] Actualizando Destinos de Maestros Primaria en '{destinos_dir}'...")
            old_cwd = os.getcwd()
            try:
                sys.path.insert(0, destinos_dir)
                from actualizar_puestos import main as run_dest_puestos
                run_dest_puestos(pdf_path)
                updated_destinos = True
            finally:
                os.chdir(old_cwd)
        else:
            print("[!] Aviso: Carpeta 'destinos' no encontrada. Se ha actualizado Secundaria Destinos, pero no Primaria Destinos.")

    os.chdir(BASE_DIR)
    sync_html_fallbacks(destinos_dir)
    return {
        "maestros": updated_maestros,
        "secundaria": updated_secundaria,
        "destinos": updated_destinos
    }

def run_auto_crawler(destinos_dir=None):
    """
    Rastrea las fuentes oficiales de Conselleria y sindicatos
    para Maestros, Secundaria y Puestos, y procesa cualquier novedad detectada.
    """
    print("=" * 64)
    print(" 🔍 RASTREO MULTIPORTAL DE FUENTES OFICIALES CONSELLERIA GVA")
    print("=" * 64)

    results = {"maestros": False, "secundaria": False, "destinos": False}

    # 1. Rastreador de Maestros
    print("\n[1/3] Rastreando Adjudicaciones de Maestros (Primaria)...")
    try:
        import bot_auto_actualizador as bot_mae
        if bot_mae.check_and_update():
            results["maestros"] = True
    except Exception as e:
        print(f"[-] Error en rastreo de Maestros: {e}")

    # 2. Rastreador de Secundaria y Destinos Secundaria
    print("\n[2/3] Rastreando Secundaria y FP (Bolsa y Destinos)...")
    try:
        sys.path.insert(0, os.path.join(BASE_DIR, "secundaria"))
        import secundaria.bot_auto_actualizador as bot_sec
        if bot_sec.check_and_update():
            results["secundaria"] = True
    except Exception as e:
        print(f"[-] Error en rastreo de Secundaria: {e}")

    # 3. Rastreador de Puestos (Primaria Destinos)
    if destinos_dir and os.path.exists(destinos_dir):
        print("\n[3/3] Rastreando Puestos de Primaria (Destinos)...")
        try:
            sys.path.insert(0, destinos_dir)
            import bot_auto_actualizador as bot_dest
            # Ejecutar con cwd en destinos para consistencia
            old_cwd = os.getcwd()
            os.chdir(destinos_dir)
            if bot_dest.check_and_update():
                results["destinos"] = True
            os.chdir(old_cwd)
        except Exception as e:
            print(f"[-] Error en rastreo de Destinos Primaria: {e}")
    else:
        print("\n[3/3] Carpeta 'destinos' no encontrada; omitiendo rastreo de Primaria Destinos.")

    sync_html_fallbacks(destinos_dir)
    return results

def process_telegram_updates(destinos_dir=None):
    """
    Comprueba si el usuario envió archivos PDF al bot de Telegram.
    Descarga los archivos y los procesa automáticamente.
    """
    print("=" * 64)
    print(" 🤖 COMPROBANDO ARCHIVOS ENVIADOS A TELEGRAM BOT")
    print("=" * 64)

    config_file = os.path.join(BASE_DIR, "data", "telegram_config.json")
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
    chat_id = os.environ.get("TELEGRAM_CHAT_ID", "").strip()

    if os.path.exists(config_file):
        try:
            with open(config_file, "r", encoding="utf-8") as f:
                saved = json.load(f)
                if not token: token = saved.get("token", "")
                if not chat_id: chat_id = saved.get("chat_id", "")
        except Exception:
            pass

    if not token:
        print("[-] Error: No hay TELEGRAM_BOT_TOKEN configurado.")
        return False

    offset_file = os.path.join(BASE_DIR, "data", "telegram_last_offset.txt")
    offset = 0
    if os.path.exists(offset_file):
        try:
            with open(offset_file, "r") as f:
                offset = int(f.read().strip())
        except Exception:
            offset = 0

    url = f"https://api.telegram.org/bot{token}/getUpdates?offset={offset + 1}&timeout=5"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "InterinosBot/1.0"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        print(f"[-] Error al conectar con Telegram: {e}")
        return False

    if not data.get("ok") or not data.get("result"):
        print("[i] No hay mensajes pendientes en el bot de Telegram.")
        return False

    updates = data["result"]
    processed_count = 0

    for upd in updates:
        upd_id = upd.get("update_id", offset)
        if upd_id > offset:
            offset = upd_id

        msg = upd.get("message", {})
        doc = msg.get("document")
        msg_chat_id = msg.get("chat", {}).get("id") or chat_id

        if doc:
            file_name = doc.get("file_name", "adjudicacion.pdf")
            file_id = doc.get("file_id")
            print(f"[!] Documento recibido desde Telegram: {file_name}")

            # 1. Obtener ruta del archivo en Telegram
            file_info_url = f"https://api.telegram.org/bot{token}/getFile?file_id={file_id}"
            try:
                with urllib.request.urlopen(file_info_url, timeout=15) as fi_resp:
                    fi_data = json.loads(fi_resp.read().decode("utf-8"))
                    file_path = fi_data["result"]["file_path"]
                    download_url = f"https://api.telegram.org/file/bot{token}/{file_path}"
            except Exception as e:
                print(f"[-] Error al obtener ruta en Telegram: {e}")
                continue

            # 2. Descargar archivo
            local_pdf = os.path.join(BASE_DIR, f"telegram_{file_name}")
            try:
                with urllib.request.urlopen(download_url, timeout=60) as dl_resp, open(local_pdf, "wb") as f_out:
                    f_out.write(dl_resp.read())
                print(f"[OK] PDF descargado: {local_pdf}")
            except Exception as e:
                print(f"[-] Error descargando archivo: {e}")
                continue

            # 3. Procesar documento
            res = process_pdf_file(local_pdf, destinos_dir)
            processed_count += 1

            # 4. Responder por Telegram
            if msg_chat_id:
                reply = (
                    f"🎉 <b>¡Documento procesado con éxito!</b>\n"
                    f"📄 Archivo: <code>{file_name}</code>\n\n"
                    f"🌐 <b>Webs actualizadas:</b>\n"
                    f"• Maestros: https://bolsamaestrosinterinosgva.es/\n"
                    f"• Secundaria: https://bolsamaestrosinterinosgva.es/secundaria/\n"
                    f"• Destinos: https://destinos.bolsamaestrosinterinosgva.es/\n"
                )
                try:
                    send_url = f"https://api.telegram.org/bot{token}/sendMessage"
                    payload = {"chat_id": msg_chat_id, "text": reply, "parse_mode": "HTML"}
                    req_send = urllib.request.Request(
                        send_url,
                        data=json.dumps(payload).encode("utf-8"),
                        headers={"Content-Type": "application/json"}
                    )
                    urllib.request.urlopen(req_send, timeout=10)
                except Exception as e:
                    print(f"[-] Aviso al enviar respuesta a Telegram: {e}")

    # Guardar offset actualizado
    with open(offset_file, "w") as f:
        f.write(str(offset))

    print(f"[OK] Total de documentos de Telegram procesados: {processed_count}")
    return processed_count > 0

def git_commit_and_push(repo_dir, commit_msg, token=None):
    """
    Sincroniza un repositorio git local con GitHub.
    """
    if not os.path.exists(os.path.join(repo_dir, ".git")):
        print(f"[i] '{repo_dir}' no es un repositorio git. Omitiendo push.")
        return False

    old_dir = os.getcwd()
    os.chdir(repo_dir)

    git_bin = "git"
    portable = os.path.join(BASE_DIR, "tools", "git", "cmd", "git.exe")
    if os.path.exists(portable):
        git_bin = portable

    try:
        subprocess.run([git_bin, "config", "user.name", "Bot Docente GVA"], check=False)
        subprocess.run([git_bin, "config", "user.email", "bot@interinos.valencia"], check=False)
        
        # Si se proporciona token, configurar remote seguro
        if token:
            rem_res = subprocess.run([git_bin, "remote", "get-url", "origin"], capture_output=True, text=True)
            if rem_res.returncode == 0:
                current_remote = rem_res.stdout.strip()
                if "github.com" in current_remote and "@" not in current_remote:
                    auth_remote = current_remote.replace("https://", f"https://{token}@")
                    subprocess.run([git_bin, "remote", "set-url", "origin", auth_remote], check=False)

        subprocess.run([git_bin, "add", "-A"], check=True)
        diff_res = subprocess.run([git_bin, "diff", "--staged", "--quiet"])
        if diff_res.returncode == 0:
            print(f"[i] No hay cambios pendientes en '{os.path.basename(repo_dir)}'.")
            os.chdir(old_dir)
            return True

        subprocess.run([git_bin, "commit", "-m", commit_msg], check=True)
        push_res = subprocess.run([git_bin, "push", "origin", "main"], check=False)
        if push_res.returncode == 0:
            print(f"[OK] Repositorio '{os.path.basename(repo_dir)}' subido exitosamente a GitHub.")
        else:
            print(f"[-] Aviso al hacer git push en '{os.path.basename(repo_dir)}'.")
        os.chdir(old_dir)
        return push_res.returncode == 0
    except Exception as e:
        print(f"[-] Error en git para '{repo_dir}': {e}")
        os.chdir(old_dir)
        return False

def show_status(destinos_dir=None):
    """
    Muestra un resumen del estado actual de las 4 webs.
    """
    print("\n" + "=" * 68)
    print(" 📊 ESTADO ACTUAL DE LAS WEBS Y ÚLTIMAS ADJUDICACIONES")
    print("=" * 68)

    # 1. Maestros Bolsa
    mae_stats = os.path.join(BASE_DIR, "data", "stats_summary.json")
    if os.path.exists(mae_stats):
        with open(mae_stats, "r", encoding="utf-8") as f:
            st = json.load(f)
        print(f"🎒 MAESTROS (PRIMARIA E INFANTIL):")
        print(f"   • Fecha oficial:  {st.get('fecha_adjudicacion')}")
        print(f"   • Total en bolsa: {st.get('total_participantes_bolsa', 0):,}")
        print(f"   • Convocados:     {st.get('total_adjudicaciones_hoy', 0):,}")
        print(f"   • Plazas dadas:   {st.get('total_plazas_adjudicadas', 0):,}")
        print(f"   • Enlace:         https://bolsamaestrosinterinosgva.es/\n")

    # 2. Secundaria Bolsa
    sec_stats = os.path.join(BASE_DIR, "secundaria", "data", "stats_summary.json")
    if os.path.exists(sec_stats):
        with open(sec_stats, "r", encoding="utf-8") as f:
            st = json.load(f)
        print(f"🎓 SECUNDARIA Y OTROS CUERPOS:")
        print(f"   • Fecha oficial:  {st.get('fecha_adjudicacion')}")
        print(f"   • Total en bolsa: {st.get('total_participantes_bolsa', 0):,}")
        print(f"   • Convocados:     {st.get('total_adjudicaciones_hoy', 0):,}")
        print(f"   • Plazas dadas:   {st.get('total_plazas_adjudicadas', 0):,}")
        print(f"   • Enlace:         https://bolsamaestrosinterinosgva.es/secundaria/\n")

    # 3. Destinos Secundaria
    sec_dest_stats = os.path.join(BASE_DIR, "secundaria", "data", "destinos_stats.json")
    if os.path.exists(sec_dest_stats):
        with open(sec_dest_stats, "r", encoding="utf-8") as f:
            st = json.load(f)
        print(f"🏛️ DESTINOS SECUNDARIA:")
        print(f"   • Fecha oficial:  {st.get('fecha_adjudicacion')}")
        print(f"   • Plazas Secund.: {st.get('total_secundaria', 0):,}")
        print(f"   • Total Plazas:   {st.get('total_plazas', 0):,}")
        print(f"   • Enlace:         https://bolsamaestrosinterinosgva.es/secundaria/destinos.html\n")

    # 4. Destinos Primaria
    dest_dir = get_destinos_dir(destinos_dir)
    if dest_dir:
        dest_stats = os.path.join(dest_dir, "data", "stats_summary.json")
        if os.path.exists(dest_stats):
            with open(dest_stats, "r", encoding="utf-8") as f:
                st = json.load(f)
            print(f"🎯 DESTINOS PRIMARIA (MAESTROS):")
            print(f"   • Fecha oficial:  {st.get('fecha_adjudicacion')}")
            print(f"   • Plazas Maestros:{st.get('total_maestros', 0):,}")
            print(f"   • Total Plazas:   {st.get('total_plazas', 0):,}")
            print(f"   • Enlace:         https://destinos.bolsamaestrosinterinosgva.es/\n")

    print("=" * 68 + "\n")

def main():
    import argparse
    parser = argparse.ArgumentParser(description="Actualizador Multiportal GVA (Bolsa y Destinos)")
    parser.add_argument("--auto", action="store_true", help="Rastrear automáticamente las fuentes de Conselleria")
    parser.add_argument("--pdf", type=str, default="", help="Ruta o URL del PDF a procesar")
    parser.add_argument("--telegram", action="store_true", help="Comprobar y procesar PDFs recibidos en Telegram")
    parser.add_argument("--destinos-dir", type=str, default="", help="Directorio del repositorio de destinos")
    parser.add_argument("--token", type=str, default="", help="Token de autenticación de GitHub")
    parser.add_argument("--no-push", action="store_true", help="No realizar git commit y git push")
    parser.add_argument("--status", action="store_true", help="Mostrar resumen de estado de las webs")

    args = parser.parse_args()
    destinos_dir = get_destinos_dir(args.destinos_dir)

    if args.status:
        show_status(destinos_dir)
        return

    had_changes = False

    if args.pdf:
        process_pdf_file(args.pdf, destinos_dir)
        had_changes = True

    elif args.telegram:
        had_changes = process_telegram_updates(destinos_dir)

    elif args.auto:
        res = run_auto_crawler(destinos_dir)
        had_changes = any(res.values())

    else:
        # Por defecto si no se pasa argumento: comprobar Telegram y luego rastreo automático
        print("[*] Modo por defecto: comprobando Telegram y rastreo oficial...")
        tg_res = process_telegram_updates(destinos_dir)
        auto_res = run_auto_crawler(destinos_dir)
        had_changes = tg_res or any(auto_res.values())

    # Asegurar que el directorio de trabajo es el directorio base
    os.chdir(BASE_DIR)

    # Validar pruebas unitarias si estamos en bolsa
    print("\n[*] Ejecutando pruebas unitarias de validación...")
    try:
        import unittest
        loader = unittest.TestLoader()
        suite = loader.discover(os.path.join(BASE_DIR, "tests"))
        runner = unittest.TextTestRunner(verbosity=1)
        test_result = runner.run(suite)
        if not test_result.wasSuccessful():
            print("[-] ¡Aviso! Algunas pruebas no pasaron.")
    except Exception as e:
        print(f"[-] Aviso en ejecución de tests: {e}")

    # Sincronizar con GitHub si no se deshabilitó
    if not args.no_push:
        print("\n[*] Sincronizando repositorios con GitHub...")
        token = args.token or os.environ.get("GITHUB_TOKEN", "")
        msg = "Actualización automática de adjudicaciones y destinos [skip ci]"
        
        # 1. Repositorio Principal Monorepo (Maestros + Secundaria + Destinos)
        git_commit_and_push(BASE_DIR, msg, token)
        
        # 2. Espejo automático hacia repositorio hermano externo ../destinos (si existe)
        ext_destinos = os.path.abspath(os.path.join(BASE_DIR, "..", "destinos"))
        if os.path.exists(ext_destinos) and os.path.exists(os.path.join(ext_destinos, ".git")):
            try:
                for f in ['index.html', 'destinos_web.zip']:
                    s = os.path.join(BASE_DIR, 'destinos', f)
                    d = os.path.join(ext_destinos, f)
                    if os.path.exists(s): shutil.copy2(s, d)
                s_data = os.path.join(BASE_DIR, 'destinos', 'data')
                d_data = os.path.join(ext_destinos, 'data')
                if os.path.exists(s_data) and os.path.exists(d_data):
                    for df in os.listdir(s_data):
                        shutil.copy2(os.path.join(s_data, df), os.path.join(d_data, df))
                git_commit_and_push(ext_destinos, msg, token)
            except Exception as e:
                print(f"[-] Aviso al espejar hacia '../destinos': {e}")
        elif destinos_dir and destinos_dir != os.path.join(BASE_DIR, "destinos"):
            git_commit_and_push(destinos_dir, msg, token)

    show_status(destinos_dir)

if __name__ == "__main__":
    main()
