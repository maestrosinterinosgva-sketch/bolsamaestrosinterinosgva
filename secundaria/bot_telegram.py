"""
bot_telegram.py
Bot de Telegram para la Bolsa y Destinos de Secundaria y Otros Cuerpos GVA.
Permite al usuario reenviar o subir un PDF de adjudicaciones o puestos desde su smartphone.
El bot descarga el archivo, ejecuta la actualización completa de Secundaria,
sincroniza con GitHub y notifica al usuario el resultado.
"""
import os
import sys
import json
import urllib.request
import urllib.parse
from actualizar_secundaria import run_actualizacion, detect_pdf_type
from bot_auto_actualizador import push_to_github

if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

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
        print("[i] No hay TELEGRAM_BOT_TOKEN configurado. Omitiendo comprobación.")
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
        req = urllib.request.Request(url, headers={"User-Agent": "SecundariaBot/1.0"})
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
        if text.startswith("/start") or text.startswith("/ayuda"):
            send_telegram_message(
                token, chat_id,
                "👋 <b>¡Hola! Soy el Bot de Secundaria y Otros Cuerpos GVA</b>\n\n"
                "Para actualizar la web desde tu móvil:\n"
                "1️⃣ <b>Reenvía o sube cualquier PDF</b> de Adjudicaciones (<code>lis_sec</code>) o Puestos (<code>pue_</code>).\n"
                "2️⃣ Procesaré los cortes y puestos al instante.\n"
                "3️⃣ Sincronizaré la web automáticamente y te responderé con el resumen.\n\n"
                "Comandos útiles:\n"
                "/estado - Ver fecha y estadísticas actuales\n"
                "/web - Enlace a la web en directo"
            )
            continue

        if text.startswith("/estado"):
            stats_file = "data/stats_summary.json"
            if os.path.exists(stats_file):
                with open(stats_file, "r", encoding="utf-8") as f:
                    st = json.load(f)
                fec = st.get("fecha_adjudicacion", "Desc")
                tot_p = st.get("total_plazas_adjudicadas", 0)
                tot_c = st.get("total_adjudicaciones_hoy", 0)
                send_telegram_message(
                    token, chat_id,
                    f"📊 <b>Estado Actual - Secundaria GVA</b>\n"
                    f"📅 Última adjudicación: <b>{fec}</b>\n"
                    f"👥 Aspirantes convocados: <b>{tot_c:,}</b>\n"
                    f"🎓 Plazas adjudicadas: <b>{tot_p:,}</b>\n\n"
                    f"🌐 Web: https://bolsamaestrosinterinosgva.es/secundaria/"
                )
            else:
                send_telegram_message(token, chat_id, "ℹ️ Todavía no hay datos procesados.")
            continue

        if text.startswith("/web"):
            send_telegram_message(
                token, chat_id,
                "🌐 <b>Acceso a la plataforma:</b>\n"
                "• 🎯 Localizador Secundaria: https://bolsamaestrosinterinosgva.es/secundaria/\n"
                "• 🗺️ Destinos e Institutos: https://bolsamaestrosinterinosgva.es/secundaria/destinos.html\n"
                "• 🏫 Primaria: https://bolsamaestrosinterinosgva.es/"
            )
            continue

        # Procesar PDF subido
        if doc and (doc.get("mime_type") == "application/pdf" or (doc.get("file_name", "").endswith(".pdf"))):
            file_id = doc.get("file_id")
            orig_name = doc.get("file_name", "documento.pdf")
            print(f"[*] PDF recibido por Telegram: {orig_name}")

            send_telegram_message(
                token, chat_id,
                f"📥 <b>PDF recibido:</b> <code>{orig_name}</code>\n"
                f"⚙️ Descargando y procesando Secundaria... Un momento por favor."
            )

            # Obtener enlace de descarga de Telegram
            get_file_url = f"https://api.telegram.org/bot{token}/getFile?file_id={file_id}"
            try:
                with urllib.request.urlopen(get_file_url, timeout=15) as fresp:
                    fmeta = json.loads(fresp.read().decode("utf-8"))
                    file_path = fmeta.get("result", {}).get("file_path")

                if file_path:
                    download_url = f"https://api.telegram.org/file/bot{token}/{file_path}"
                    local_name = f"telegram_{orig_name}"
                    urllib.request.urlretrieve(download_url, local_name)
                    print(f"[OK] Archivo guardado localmente: {local_name}")

                    # Ejecutar actualización
                    stats = run_actualizacion(local_name)

                    # Subir a GitHub
                    push_to_github()

                    tipo = detect_pdf_type(local_name)
                    if tipo == "adjudicacion":
                        fec = stats.get("fecha_adjudicacion", "Hoy")
                        plz = stats.get("total_plazas_adjudicadas", 0)
                        tot_conv = stats.get("total_adjudicaciones_hoy", 0)
                        send_telegram_message(
                            token, chat_id,
                            f"🎉 <b>¡Secundaria actualizada con éxito!</b>\n\n"
                            f"📅 <b>Fecha adjudicación:</b> {fec}\n"
                            f"🎓 <b>Plazas asignadas:</b> {plz}\n"
                            f"👥 <b>Convocados:</b> {tot_conv:,}\n\n"
                            f"🌐 Consulta la web: https://bolsamaestrosinterinosgva.es/secundaria/"
                        )
                    else:
                        fec = stats.get("fecha_adjudicacion", "Hoy")
                        tot_plz = stats.get("total_plazas", 0)
                        sec_plz = stats.get("total_secundaria", 0)
                        send_telegram_message(
                            token, chat_id,
                            f"🗺️ <b>¡Destinos de Secundaria actualizados!</b>\n\n"
                            f"📅 <b>Fecha:</b> {fec}\n"
                            f"📍 <b>Plazas ofertadas:</b> {tot_plz} ({sec_plz} Secundaria/FP)\n\n"
                            f"🌐 Consulta el mapa: https://bolsamaestrosinterinosgva.es/secundaria/destinos.html"
                        )
                    new_pdf_processed = True
            except Exception as e:
                print(f"[-] Error al procesar documento de Telegram: {e}")
                send_telegram_message(
                    token, chat_id,
                    f"❌ <b>Error al procesar el archivo:</b> {e}"
                )

    # Guardar último offset
    with open(offset_file, "w") as f:
        f.write(str(offset))

    return new_pdf_processed

if __name__ == "__main__":
    check_telegram_updates()
