"""
bot_telegram.py
Bot de Telegram para la Bolsa de Maestros Interinos GVA.
Permite al usuario reenviar o subir un PDF de adjudicaciones desde su smartphone.
El bot descarga el archivo desde los servidores de Telegram, ejecuta la actualización
de la bolsa, sube los cambios a GitHub Pages y notifica al usuario el resultado.
"""
import os
import sys
import json
import urllib.request
import urllib.parse
from actualizar_adjudicacion import main as run_actualizacion
from bot_auto_actualizador import push_to_github

TELEGRAM_CONFIG_FILE = "data/telegram_config.json"

def get_telegram_config():
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
    chat_id = os.environ.get("TELEGRAM_CHAT_ID", "").strip()
    
    if os.path.exists(TELEGRAM_CONFIG_FILE):
        try:
            with open(TELEGRAM_CONFIG_FILE, "r", encoding="utf-8") as f:
                saved = json.load(f)
                if not token:
                    token = saved.get("token", "")
                if not chat_id:
                    chat_id = saved.get("chat_id", "")
        except Exception:
            pass
            
    return {"token": token, "chat_id": chat_id}

def save_telegram_config(token=None, chat_id=None):
    os.makedirs(os.path.dirname(TELEGRAM_CONFIG_FILE), exist_ok=True)
    cfg = {}
    if os.path.exists(TELEGRAM_CONFIG_FILE):
        try:
            with open(TELEGRAM_CONFIG_FILE, "r", encoding="utf-8") as f:
                cfg = json.load(f)
        except Exception:
            cfg = {}
    if token:
        cfg["token"] = token
    if chat_id:
        cfg["chat_id"] = str(chat_id)
    with open(TELEGRAM_CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2)

def send_telegram_message(token, chat_id, text):
    if not token or not chat_id:
        return False
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML",
        "disable_web_page_preview": False
    }
    try:
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            return resp.status == 200
    except Exception as e:
        print(f"[-] Error al enviar mensaje por Telegram: {e}")
        return False

def check_telegram_updates():
    cfg = get_telegram_config()
    token = cfg["token"]
    if not token:
        print("[i] No hay TELEGRAM_BOT_TOKEN configurado. Omitiendo comprobación de Telegram.")
        return False

    offset_file = "data/telegram_last_offset.txt"
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
        print(f"[-] Error al consultar getUpdates de Telegram: {e}")
        return False

    if not data.get("ok") or not data.get("result"):
        return False

    updates = data["result"]
    new_pdf_processed = False

    for upd in updates:
        upd_id = upd.get("update_id", offset)
        if upd_id > offset:
            offset = upd_id

        msg = upd.get("message", {})
        chat = msg.get("chat", {})
        chat_id = chat.get("id")
        text = msg.get("text", "")
        doc = msg.get("document")

        if chat_id and not cfg["chat_id"]:
            save_telegram_config(chat_id=chat_id)
            cfg["chat_id"] = str(chat_id)

        # Manejo de comandos
        if text.startswith("/start"):
            welcome = (
                "👋 <b>¡Hola! Soy tu bot de la Bolsa de Maestros Interinos GVA.</b>\n\n"
                "📱 <b>¿Cómo usarme?</b>\n"
                "Cada vez que Conselleria publique adjudicaciones, simplemente <b>reenvíame o súbeme el archivo PDF</b> aquí.\n\n"
                "⚡ Lo procesaré en la nube y actualizaré tu web automáticamente en 30 segundos."
            )
            send_telegram_message(token, chat_id, welcome)
            continue

        web_url = os.environ.get("WEB_URL") or cfg.get("web_url") or "https://maestrosinterinosgva-sketch.github.io/bolsamaestrosinterinosgva/"

        if text.startswith("/status") or text.startswith("/web"):
            status_msg = (
                "🌐 <b>Estado de la Web:</b>\n"
                f"• Enlace oficial: {web_url}\n"
                "• Puedes enviarme un nuevo PDF en cualquier momento para actualizar."
            )
            send_telegram_message(token, chat_id, status_msg)
            continue

        # Si el usuario envió un archivo PDF
        if doc:
            file_name = doc.get("file_name", "adjudicacion.pdf")
            mime_type = doc.get("mime_type", "")
            file_id = doc.get("file_id")

            if file_name.lower().endswith(".pdf") or "pdf" in mime_type.lower():
                fn_lower = file_name.lower()
                
                print(f"[!] PDF recibido desde Telegram: {file_name} (ID: {file_id})")
                send_telegram_message(
                    token, chat_id,
                    f"⏳ <b>Documento recibido:</b> <code>{file_name}</code>\n"
                    f"Descargando y detectando especialidad/cuerpo..."
                )

                # 1. Obtener ruta del archivo en Telegram
                file_info_url = f"https://api.telegram.org/bot{token}/getFile?file_id={file_id}"
                try:
                    with urllib.request.urlopen(file_info_url, timeout=15) as fi_resp:
                        fi_data = json.loads(fi_resp.read().decode("utf-8"))
                        file_path = fi_data["result"]["file_path"]
                        download_url = f"https://api.telegram.org/file/bot{token}/{file_path}"
                except Exception as e:
                    send_telegram_message(token, chat_id, f"❌ Error al obtener ruta del archivo: {e}")
                    continue

                # 2. Descargar PDF localmente
                local_pdf = os.path.join(os.getcwd(), f"telegram_{file_name}")
                try:
                    with urllib.request.urlopen(download_url, timeout=45) as dl_resp, open(local_pdf, "wb") as f_out:
                        f_out.write(dl_resp.read())
                    print(f"[OK] Archivo descargado con éxito: {local_pdf}")
                except Exception as e:
                    send_telegram_message(token, chat_id, f"❌ Error al descargar el PDF desde Telegram: {e}")
                    continue

                # 3. Determinar tipo de documento (Secundaria vs Primaria vs Puestos)
                is_secundaria = ("lis_sec" in fn_lower or "secundaria" in fn_lower)
                is_puestos = any(k in fn_lower for k in ["pue_prov", "pue_def", "puesto", "ofert", "llocs_oferits"])
                
                # Comprobación de contenido si el nombre es ambiguo
                if not is_secundaria and not is_puestos and not ("lis_mae" in fn_lower):
                    try:
                        import pymupdf
                        tchk = pymupdf.open(local_pdf)[0].get_text().upper()
                        if "LLOCS OFERTATS" in tchk or "PUESTOS OFERTADOS" in tchk:
                            is_puestos = True
                        elif "ALTRES COSSOS" in tchk or "SECUNDARI" in tchk:
                            is_secundaria = True
                    except Exception:
                        pass

                try:
                    if is_secundaria:
                        print("[*] Procesando actualización de Secundaria...")
                        import subprocess
                        # Ejecutar en carpeta secundaria
                        sub_pdf = os.path.join(os.getcwd(), "secundaria", f"telegram_{file_name}")
                        try:
                            import shutil
                            shutil.copy2(local_pdf, sub_pdf)
                        except Exception:
                            pass
                        subprocess.run([sys.executable, "actualizar_secundaria.py", f"telegram_{file_name}"], cwd="secundaria", check=True)
                        push_to_github()

                        stats_file = "secundaria/data/stats_summary.json"
                        fec = "Reciente"
                        plz = 0
                        if os.path.exists(stats_file):
                            with open(stats_file, "r", encoding="utf-8") as sf:
                                st = json.load(sf)
                                fec = st.get("fecha_adjudicacion", fec)
                                plz = st.get("total_plazas_adjudicadas", 0)

                        send_telegram_message(
                            token, chat_id,
                            f"🎓 <b>¡Bolsa de Secundaria actualizada con éxito!</b>\n\n"
                            f"📅 <b>Fecha:</b> {fec}\n"
                            f"🏫 <b>Plazas asignadas:</b> {plz}\n\n"
                            f"🌐 <b>Ver online:</b>\n"
                            f"https://bolsamaestrosinterinosgva.es/secundaria/"
                        )
                    elif is_puestos:
                        print("[*] Procesando puestos ofertados...")
                        import subprocess
                        sub_pdf = os.path.join(os.getcwd(), "secundaria", f"telegram_{file_name}")
                        try:
                            import shutil
                            shutil.copy2(local_pdf, sub_pdf)
                        except Exception:
                            pass
                        subprocess.run([sys.executable, "actualizar_secundaria.py", f"telegram_{file_name}"], cwd="secundaria", check=True)
                        push_to_github()

                        send_telegram_message(
                            token, chat_id,
                            f"🗺️ <b>¡Destinos y Puestos actualizados con éxito!</b>\n\n"
                            f"🌐 <b>Ver mapa de institutos:</b>\n"
                            f"https://bolsamaestrosinterinosgva.es/secundaria/destinos.html"
                        )
                    else:
                        print("[*] Procesando adjudicación de Maestros (Primaria)...")
                        sys.argv = ["actualizar_adjudicacion.py", local_pdf]
                        run_actualizacion()
                        push_to_github()

                        stats_file = "data/stats_summary.json"
                        fec = "Reciente"
                        plz = 0
                        conv = 0
                        if os.path.exists(stats_file):
                            with open(stats_file, "r", encoding="utf-8") as sf:
                                st = json.load(sf)
                                fec = st.get("fecha_adjudicacion", fec)
                                plz = st.get("total_plazas_adjudicadas", 0)
                                conv = st.get("total_adjudicaciones_hoy", 0)

                        send_telegram_message(
                            token, chat_id,
                            f"🎒 <b>¡Bolsa de Maestros Primaria actualizada con éxito!</b>\n\n"
                            f"📅 <b>Fecha:</b> {fec}\n"
                            f"👥 <b>Convocados:</b> {conv:,}\n"
                            f"🏫 <b>Plazas adjudicadas:</b> {plz:,}\n\n"
                            f"🌐 <b>Ver online:</b>\n"
                            f"https://bolsamaestrosinterinosgva.es/"
                        )

                    new_pdf_processed = True
                except Exception as e:
                    print(f"[-] Error al procesar documento: {e}")
                    send_telegram_message(token, chat_id, f"❌ Error al procesar el archivo: {e}")


    # Guardar nuevo offset para no repetir mensajes
    with open(offset_file, "w") as f:
        f.write(str(offset))

    # Confirmar a los servidores de Telegram que estos mensajes ya han sido procesados
    if offset > 0:
        try:
            ack_url = f"https://api.telegram.org/bot{token}/getUpdates?offset={offset + 1}&limit=1"
            with urllib.request.urlopen(ack_url, timeout=10) as ack_resp:
                pass
        except Exception:
            pass

    return new_pdf_processed

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--notify":
        # Enviar notificación informativa
        msg = " ".join(sys.argv[2:]) if len(sys.argv) > 2 else "Actualización completada."
        cfg = get_telegram_config()
        send_telegram_message(cfg["token"], cfg["chat_id"], msg)
    else:
        check_telegram_updates()
