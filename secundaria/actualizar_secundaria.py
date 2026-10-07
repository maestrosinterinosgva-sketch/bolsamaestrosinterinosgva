"""
actualizar_secundaria.py
Actualizador unificado para la Bolsa y Destinos de Secundaria GVA.
Permite actualizar con un archivo PDF local o descargando una URL oficial.
Detecta automáticamente si el documento es de Adjudicaciones (lis_sec) o de Puestos Ofertados (pue_).
"""
import os
import sys
import re
import urllib.request
import urllib.parse
from parse_secundaria_bolsa import main as parse_bolsa
from parse_secundaria_destinos import parse_puestos_pdf

if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

def download_pdf_if_url(url_or_path, target_filename="secundaria_descargado_auto.pdf"):
    if url_or_path.startswith("http://") or url_or_path.startswith("https://"):
        print(f"[*] Descargando PDF desde URL: {url_or_path}")
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
        req = urllib.request.Request(url_or_path, headers=headers)
        with urllib.request.urlopen(req, timeout=30) as response, open(target_filename, 'wb') as out_file:
            data = response.read()
            out_file.write(data)
            print(f"[OK] Descargado {len(data):,} bytes -> {target_filename}")
        return target_filename
    return url_or_path

def detect_pdf_type(pdf_path):
    name = os.path.basename(pdf_path).lower()
    if "lis_sec" in name or "adj" in name:
        return "adjudicacion"
    if "pue_" in name or "plazas" in name or "puestos" in name:
        return "puestos"
        
    # Inspeccionar primeras páginas
    try:
        import pymupdf
        doc = pymupdf.open(pdf_path)
        first_text = doc[0].get_text().upper()
        if "LLOCS OFERTATS" in first_text or "PUESTOS OFERTADOS" in first_text:
            return "puestos"
        if "ADJUDICACI" in first_text:
            return "adjudicacion"
    except Exception:
        pass
    return "adjudicacion"

def run_actualizacion(pdf_arg=None):
    print("=" * 64)
    print(" 🚀 ACTUALIZADOR DE SECUNDARIA Y OTROS CUERPOS GVA")
    print("=" * 64)

    if not pdf_arg:
        # Buscar el archivo más reciente en la carpeta
        candidates = [f for f in os.listdir(".") if f.endswith(".pdf") and ("lis_sec" in f.lower() or "pue_" in f.lower())]
        if candidates:
            candidates.sort(key=lambda x: os.path.getmtime(x), reverse=True)
            pdf_arg = candidates[0]
            print(f"[*] Archivo detectado automáticamente: {pdf_arg}")
        else:
            print("[-] No se especificó ningún archivo ni se encontró ningún PDF de secundaria reciente.")
            return False

    local_path = download_pdf_if_url(pdf_arg)
    tipo = detect_pdf_type(local_path)

    sec_dir = os.path.dirname(os.path.abspath(__file__))

    if tipo == "adjudicacion":
        print(f"[*] Tipo detectado: LISTADO DE ADJUDICACIÓN DE INTERINOS ({local_path})")
        ini_file = os.path.join(sec_dir, "ini_2026_par_def_int_lis_sec.pdf")
        if not os.path.exists(ini_file):
            print(f"[-] Falta el archivo base {ini_file}. Descargándolo de respaldo...")
            url_ini = "https://intersindical.org/stepv/docs/ini_2026_par_def_int_lis_sec.pdf"
            download_pdf_if_url(url_ini, ini_file)
        stats = parse_bolsa(ini_file, local_path, sec_dir)
        print("[OK] Bolsa de Secundaria actualizada exitosamente.")
        return stats
    else:
        print(f"[*] Tipo detectado: LISTADO DE PUESTOS OFERTADOS ({local_path})")
        plazas, stats = parse_puestos_pdf(local_path, sec_dir)
        print("[OK] Puestos y Destinos de Secundaria actualizados exitosamente.")
        return stats

if __name__ == "__main__":
    arg = sys.argv[1] if len(sys.argv) > 1 else None
    run_actualizacion(arg)
