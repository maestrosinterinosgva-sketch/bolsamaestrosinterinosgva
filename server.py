"""
server.py
Servidor local en Python con soporte multidispositivo (PC, móvil, tablet).
Detecta la IP local de la red Wi-Fi para que puedas abrir la app en tu teléfono o tablet.
"""
import http.server
import socketserver
import webbrowser
import os
import sys
import socket

# Asegurar codificación utf-8 para salida en consola Windows
if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

PORT = 8000

def get_local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
    except Exception:
        ip = '127.0.0.1'
    finally:
        s.close()
    return ip

class CustomHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

def run_server():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(base_dir)

    port = PORT
    max_attempts = 10
    httpd = None

    for attempt in range(max_attempts):
        try:
            httpd = socketserver.TCPServer(("", port), CustomHandler)
            break
        except OSError:
            port += 1

    if not httpd:
        print("[-] No se pudo encontrar un puerto libre.")
        sys.exit(1)

    local_ip = get_local_ip()
    local_url = f"http://localhost:{port}"
    wifi_url = f"http://{local_ip}:{port}"

    # Guardar network_info.js para la UI web
    os.makedirs("data", exist_ok=True)
    with open("data/network_info.js", "w", encoding="utf-8") as f:
        f.write(f'window.NETWORK_INFO = {{ local_ip: "{local_ip}", port: {port}, wifi_url: "{wifi_url}" }};\n')

    print("=" * 64)
    print(" 🎯 APP LOCALIZADOR DE INTERINOS - MULTIDISPOSITIVO")
    print("=" * 64)
    print(f" 💻 EN ESTE ORDENADOR:")
    print(f"    👉 {local_url}")
    print()
    print(f" 📱 EN CUALQUIER MÓVIL, TABLET O iPAD (Misma red Wi-Fi):")
    print(f"    👉 {wifi_url}")
    print()
    print(" 💡 CONSEJO MÓVIL:")
    print("    Abre ese enlace en Safari (iPhone) o Chrome (Android) y pulsa")
    print("    'Añadir a pantalla de inicio' para tenerla como App nativa.")
    print("=" * 64)
    print(" Pulsa Ctrl + C para detener el servidor.")

    try:
        webbrowser.open(local_url)
    except Exception:
        pass

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[OK] Servidor detenido.")
        httpd.server_close()

if __name__ == "__main__":
    run_server()
