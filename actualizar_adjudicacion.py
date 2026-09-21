"""
actualizar_adjudicacion.py
Actualiza automáticamente la aplicación con un nuevo PDF semanal de adjudicaciones.
"""
import sys
import os
import glob
import re
import zipfile
import pymupdf
from parse_data import parse_participants, parse_adjudicaciones, build_combined_dataset

def get_latest_adjudicacion_pdf(current_dir="."):
    pdfs = glob.glob(os.path.join(current_dir, "*.pdf"))
    adj_pdfs = [p for p in pdfs if "ini_2026" not in os.path.basename(p).lower()]
    if not adj_pdfs:
        return None
    adj_pdfs.sort(key=lambda x: os.path.getmtime(x), reverse=True)
    return os.path.basename(adj_pdfs[0])

def extract_date_from_pdf(pdf_path):
    try:
        doc = pymupdf.open(pdf_path)
        first_page = doc[0].get_text()
        m = re.search(r'(\d{2}/\d{2}/\d{4})', first_page)
        if m:
            return m.group(1)
    except Exception:
        pass
    return "Semanal"

def download_pdf_if_url(target):
    if not target or not (target.startswith("http://") or target.startswith("https://")):
        return target
    import urllib.request
    print(f"[*] Descargando nuevo PDF desde URL:\n    {target}")
    local_filename = "adjudicacion_descargada_auto.pdf"
    req = urllib.request.Request(target, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
    with urllib.request.urlopen(req, timeout=45) as response, open(local_filename, 'wb') as out_file:
        out_file.write(response.read())
    print(f"[OK] Archivo descargado con éxito: {local_filename}")
    return local_filename

def update_zip_package(output_zip="interinos_web.zip"):
    files_to_pack = [
        'index.html',
        'privacidad.html',
        'ads.txt',
        'manifest.json',
        'css/style.css',
        'js/app.js',
        'js/chat-analytics.js',
        'data/interinos_data.js',
        'data/stats_summary.js',
        'data/network_info.js',
        'data/interinos_data.json',
        'data/stats_summary.json',
        'icons/icon.svg',
        'icons/icon-192.png',
        'icons/icon-512.png',
        'icons/apple-touch-icon.png'
    ]
    with zipfile.ZipFile(output_zip, 'w', zipfile.ZIP_DEFLATED) as z:
        for rel_path in files_to_pack:
            if os.path.exists(rel_path):
                z.write(rel_path, rel_path)
    print(f"[OK] Paquete web para publicar actualizado: {output_zip} ({os.path.getsize(output_zip)/1024/1024:.2f} MB)")

def main():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(base_dir)

    participants_pdf = "ini_2026_par_pro_int_lis_mae.pdf"
    adjudicaciones_pdf = None

    if len(sys.argv) > 1:
        adjudicaciones_pdf = sys.argv[1].strip().strip('"').strip("'")
        if adjudicaciones_pdf.startswith("http://") or adjudicaciones_pdf.startswith("https://"):
            try:
                adjudicaciones_pdf = download_pdf_if_url(adjudicaciones_pdf)
            except Exception as e:
                print(f"[-] Error al descargar el PDF desde la URL: {e}")
                return
    else:
        adjudicaciones_pdf = get_latest_adjudicacion_pdf(base_dir)

    if not os.path.exists(participants_pdf):
        print(f"[-] Error: No se encuentra el archivo de la bolsa inicial '{participants_pdf}'.")
        return

    if not adjudicaciones_pdf or not os.path.exists(adjudicaciones_pdf):
        print("[-] Error: No se ha encontrado ningún archivo PDF de adjudicaciones en la carpeta.")
        return

    print("=" * 64)
    print(" ACTUALIZACION SEMANAL DE ADJUDICACIONES")
    print("=" * 64)
    print(f" Bolsa Inicial:  {participants_pdf}")
    print(f" Adjudicaciones: {adjudicaciones_pdf}")
    
    fecha = extract_date_from_pdf(adjudicaciones_pdf)
    print(f" Fecha detectada: {fecha}")
    print("=" * 64)

    # 1. Parsear bolsa inicial
    participants = parse_participants(participants_pdf)
    
    # 2. Parsear nuevo PDF de adjudicaciones
    adjudicaciones = parse_adjudicaciones(adjudicaciones_pdf)
    if not adjudicaciones or len(adjudicaciones) < 50:
        raise ValueError(
            f"El archivo '{adjudicaciones_pdf}' contiene solo {len(adjudicaciones) if adjudicaciones else 0} registros de adjudicación. "
            f"No es un listado de adjudicación válido (lis_mae) o se trata de un documento de plazas ofertadas. "
            f"Se cancela la actualización para proteger la base de datos de la web."
        )
    
    # 3. Construir dataset combinado y estadísticas
    combined, stats = build_combined_dataset(participants, adjudicaciones, fecha_adj=fecha)

    if stats.get('total_plazas_adjudicadas', 0) == 0:
        raise ValueError(
            "El archivo procesado arroja 0 plazas adjudicadas. Se cancela la actualización para proteger la base de datos de la web."
        )

    # 4. Actualizar automáticamente el archivo ZIP para Netlify / Web
    update_zip_package()

    print()
    print("=" * 64)
    print(" ACTUALIZACION COMPLETADA CON EXITO!")
    print("=" * 64)
    print(f" • Convocados en esta adjudicacion: {len(adjudicaciones):,}")
    print(f" • Plazas analizadas hoy: {stats.get('total_plazas_adjudicadas', 0):,}")
    print()
    print(" EN TU ORDENADOR O MOVIL (Local/Wi-Fi):")
    print("   Solo recarga la pagina en tu navegador (pulsa F5).")
    print()
    print(" SI TIENES LA WEB EN NETLIFY:")
    print("   Arrastra el nuevo archivo 'interinos_web.zip' a:")
    print("   https://app.netlify.com/drop para actualizarla online al instante.")
    print("=" * 64)

if __name__ == "__main__":
    main()
