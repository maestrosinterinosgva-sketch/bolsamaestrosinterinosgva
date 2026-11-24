import os
import sys
import time
from playwright.sync_api import sync_playwright

PROFILE_DIR = os.path.join(os.path.expanduser("~"), ".whatsapp_automation_profile")
TARGET_GROUP = "Compis Molones 2026-2027"
MESSAGE_TEXT = "¡Ya han salido las listas de adjudicaciones de hoy en Conselleria! 🚀 Podéis consultar las listas actualizadas y posiciones aquí: https://bolsamaestrosinterinosgva.es/"

def log_print(msg):
    print(msg, flush=True)

def kill_profile_chrome():
    """Cierra cualquier proceso previo de Chrome usando el perfil de automatización para evitar bloqueos"""
    import subprocess
    try:
        cmd = 'Get-CimInstance Win32_Process -Filter "Name = \'chrome.exe\'" | Where-Object { $_.CommandLine -like "*whatsapp_automation_profile*" } | Stop-Process -Force'
        subprocess.run(["powershell", "-NoProfile", "-Command", cmd], capture_output=True)
        time.sleep(1)
    except Exception:
        pass

def send_whatsapp_message(group_name=TARGET_GROUP, message=MESSAGE_TEXT, interactive_login=False):
    os.makedirs(PROFILE_DIR, exist_ok=True)
    kill_profile_chrome()
    with sync_playwright() as p:
        # Launch Chrome with persistent profile
        context = p.chromium.launch_persistent_context(
            user_data_dir=PROFILE_DIR,
            channel="chrome",
            headless=False,
            args=["--start-maximized"]
        )
        page = context.pages[0] if context.pages else context.new_page()
        log_print("[*] Abriendo WhatsApp Web en Chrome...")
        page.goto("https://web.whatsapp.com")

        if interactive_login:
            log_print("[i] MODO VINCULACIÓN: Escanea el código QR en la ventana de Chrome si no lo has hecho...")
            # Wait for search box or chat list indicating user is logged in
            try:
                page.wait_for_selector('div[contenteditable="true"][data-tab="3"], div[aria-label="Cuadro de texto de búsqueda"], div[aria-label="Search"]', timeout=180000)
                log_print("[OK] ¡Sesión iniciada con éxito! La sesión queda guardada.")
            except Exception as e:
                log_print(f"[-] Tiempo de espera agotado para el inicio de sesión: {e}")
            finally:
                context.close()
            return

        log_print("[*] Esperando carga de chats de WhatsApp...")
        try:
            # Selector for search box in WhatsApp Web
            search_box = page.wait_for_selector('div[contenteditable="true"][data-tab="3"], div[aria-label="Cuadro de texto de búsqueda"], div[aria-label="Search"]', timeout=45000)
        except Exception:
            log_print("[-] No se detectó sesión iniciada en WhatsApp Web. Es necesario escanear el QR.")
            context.close()
            return False

        log_print(f"[*] Buscando grupo '{group_name}'...")
        search_box.click()
        search_box.fill("")
        search_box.type(group_name, delay=100)
        time.sleep(2)

        # Look for group in results
        try:
            group_element = page.wait_for_selector(f'span[title="{group_name}"]', timeout=15000)
            group_element.click()
            time.sleep(1)
        except Exception:
            log_print(f"[-] No se encontró el grupo '{group_name}'. Intentando pulsar Enter en el primer resultado...")
            page.keyboard.press("Enter")
            time.sleep(1)

        log_print("[*] Escribiendo y enviando mensaje...")
        # Main message input box is data-tab="10" or aria-label="Escribe un mensaje"
        message_box = page.wait_for_selector('div[contenteditable="true"][data-tab="10"], div[aria-label="Escribe un mensaje"], div[aria-label="Type a message"]', timeout=10000)
        message_box.click()
        message_box.fill("")
        # Type message
        message_box.type(message, delay=20)
        time.sleep(0.5)
        page.keyboard.press("Enter")
        log_print("[OK] Mensaje enviado a WhatsApp.")
        time.sleep(3) # Wait for send transmission
        context.close()
        return True

if __name__ == "__main__":
    is_setup = "--setup" in sys.argv
    send_whatsapp_message(interactive_login=is_setup)
