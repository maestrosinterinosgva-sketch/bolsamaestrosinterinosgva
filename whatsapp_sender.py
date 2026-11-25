import argparse
import os
import subprocess
import sys
import time
from playwright.sync_api import sync_playwright

PROFILE_DIR = os.path.join(os.path.expanduser("~"), ".whatsapp_automation_profile")
TARGET_GROUP = "Compis Molones 2026-2027"
MESSAGE_TEXT = (
    "¡Ya han salido las listas de adjudicaciones de hoy en Conselleria! 🚀 "
    "Podéis consultar las listas actualizadas y posiciones aquí: https://bolsamaestrosinterinosgva.es/"
)
CLEAN_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)
SEARCH_BOX_SELECTOR = (
    'input[data-tab="3"], '
    '[data-tab="3"][role="textbox"], '
    'div[contenteditable="true"][data-tab="3"], '
    'input[aria-label="Buscar un chat o iniciar uno nuevo"], '
    'div[aria-label="Cuadro de texto de búsqueda"], '
    'div[aria-label="Search input textbox"]'
)
MESSAGE_BOX_SELECTOR = (
    'footer div[contenteditable="true"][data-tab="10"], '
    'div[contenteditable="true"][data-tab="10"][role="textbox"], '
    'div[aria-label="Escribe un mensaje"], '
    'div[aria-label="Type a message"]'
)


def log_print(msg):
    print(msg, flush=True)


def kill_profile_chrome():
    """Cierra cualquier proceso previo de Chrome usando el perfil de automatización para evitar bloqueos."""
    try:
        cmd = (
            'Get-CimInstance Win32_Process -Filter "Name = \'chrome.exe\'" '
            '| Where-Object { $_.CommandLine -like "*whatsapp_automation_profile*" } '
            '| Stop-Process -Force'
        )
        subprocess.run(["powershell", "-NoProfile", "-Command", cmd], capture_output=True)
        time.sleep(1)
    except Exception:
        pass


def send_whatsapp_message(
    group_name=TARGET_GROUP,
    message=MESSAGE_TEXT,
    interactive_login=False,
    check_only=False,
):
    os.makedirs(PROFILE_DIR, exist_ok=True)
    kill_profile_chrome()

    use_headless = not interactive_login
    with sync_playwright() as p:
        context = p.chromium.launch_persistent_context(
            user_data_dir=PROFILE_DIR,
            channel="chrome",
            headless=use_headless,
            user_agent=CLEAN_USER_AGENT,
            viewport={"width": 1280, "height": 800},
            args=["--start-maximized"] if not use_headless else [],
        )
        try:
            page = context.pages[0] if context.pages else context.new_page()
            log_print(f"[*] Abriendo WhatsApp Web en Chrome ({'visible' if not use_headless else 'headless'})...")
            page.goto("https://web.whatsapp.com", wait_until="domcontentloaded")

            if interactive_login:
                log_print("[i] MODO VINCULACIÓN: Escanea el código QR en la ventana de Chrome...")
                try:
                    page.wait_for_selector(SEARCH_BOX_SELECTOR, timeout=300000)
                    log_print("[OK] ¡Sesión iniciada con éxito! Esperando 5s a que termine de sincronizar...")
                    time.sleep(5)
                    log_print("[OK] Sesión guardada permanentemente en ~/.whatsapp_automation_profile.")
                    return True
                except Exception as e:
                    log_print(f"[-] Tiempo de espera agotado para el inicio de sesión: {e}")
                    return False

            log_print("[*] Esperando carga de chats de WhatsApp...")
            try:
                search_box = page.wait_for_selector(SEARCH_BOX_SELECTOR, timeout=60000)
            except Exception:
                log_print("[-] No se detectó sesión iniciada en WhatsApp Web. Ejecuta 'python whatsapp_sender.py --setup' desde tu terminal.")
                return False

            if check_only:
                log_print("[OK] Sesión de WhatsApp Web activa y lista para envíos automáticos en modo headless.")
                return True

            log_print(f"[*] Buscando chat/grupo '{group_name}'...")
            search_box.click()
            search_box.fill(group_name)
            time.sleep(2.5)

            group_element = page.wait_for_selector(f'span[title="{group_name}"]', timeout=15000)
            group_element.click()
            time.sleep(1.5)

            log_print("[*] Verificando chat abierto y preparando mensaje...")
            message_box = page.wait_for_selector(MESSAGE_BOX_SELECTOR, timeout=10000)
            aria_label = (message_box.get_attribute("aria-label") or "").lower()
            headers_text = " ".join(
                (h.inner_text() or "") for h in page.query_selector_all("header")
            ).lower()
            if group_name.lower() not in aria_label and group_name.lower() not in headers_text:
                log_print(f"[-] Abortando: no se pudo confirmar que el chat abierto sea '{group_name}'.")
                return False

            log_print("[*] Escribiendo y enviando mensaje...")
            message_box.click()
            page.keyboard.press("Control+A")
            page.keyboard.press("Backspace")
            page.keyboard.insert_text(message)
            time.sleep(1.5)

            # Buscar y pulsar el botón Enviar explícito
            try:
                send_btn = page.wait_for_selector('button[aria-label="Enviar"], button[data-tab="11"]', timeout=5000)
                send_btn.click()
            except Exception:
                page.keyboard.press("Enter")

            # Esperar a que el mensaje obtenga el check de entrega en el servidor de WhatsApp
            log_print("[*] Esperando confirmación de entrega (check) en el servidor de WhatsApp...")
            delivered = False
            for _ in range(12):
                time.sleep(2)
                last_icon = page.evaluate('''() => {
                    const outMsgs = document.querySelectorAll('.message-out, [data-id*="true_"]');
                    if (outMsgs.length === 0) return 'none';
                    const last = outMsgs[outMsgs.length - 1];
                    const icon = last.querySelector('[data-icon]');
                    return icon ? icon.getAttribute('data-icon') : 'none';
                }''')
                if 'check' in last_icon:
                    delivered = True
                    break
                # Si falló inmediatamente con alerta roja, salir
                if 'alert' in last_icon:
                    break

            log_print(f"[OK] Mensaje enviado a '{group_name}' (entregado: {delivered}).")
            time.sleep(2)
            return True
        except Exception as e:
            log_print(f"[-] Error en automatización de WhatsApp: {e}")
            return False
        finally:
            context.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Automatización de envío a WhatsApp Web")
    parser.add_argument("--setup", action="store_true", help="Abrir Chrome visible para vincular el QR una vez")
    parser.add_argument("--check", action="store_true", help="Comprobar si la sesión está activa en modo headless sin enviar")
    parser.add_argument("--group", default=TARGET_GROUP, help="Nombre exacto del grupo o chat")
    parser.add_argument("--message", default=MESSAGE_TEXT, help="Mensaje a enviar")
    args = parser.parse_args()

    ok = send_whatsapp_message(
        group_name=args.group,
        message=args.message,
        interactive_login=args.setup,
        check_only=args.check,
    )
    sys.exit(0 if ok else 1)
