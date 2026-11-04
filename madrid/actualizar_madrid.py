"""
actualizar_madrid.py
Descarga y procesa automáticamente los listados oficiales de interinos de la Comunidad de Madrid (Maestros 0597 y Bilingües).
"""

import os
import re
import json
import urllib.request
import pymupdf

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PDF_DIR = os.path.join(BASE_DIR, "pdf")
DATA_DIR = os.path.join(BASE_DIR, "data")

os.makedirs(PDF_DIR, exist_ok=True)
os.makedirs(DATA_DIR, exist_ok=True)

# Mapeo oficial de especialidades de Maestros en Sede Electrónica Comunidad de Madrid
ESPECIALIDADES_MAESTROS = {
    "597eipdf": {"codigo": "031", "nombre": "Educación Infantil", "cuerpo": "0597-MAESTROS"},
    "597pripdf": {"codigo": "038", "nombre": "Educación Primaria", "cuerpo": "0597-MAESTROS"},
    "597fipdf": {"codigo": "032", "nombre": "Lengua Extranjera: Inglés", "cuerpo": "0597-MAESTROS"},
    "597efpdf": {"codigo": "034", "nombre": "Educación Física", "cuerpo": "0597-MAESTROS"},
    "597mupdf": {"codigo": "035", "nombre": "Música", "cuerpo": "0597-MAESTROS"},
    "597ptpdf": {"codigo": "036", "nombre": "Pedagogía Terapéutica", "cuerpo": "0597-MAESTROS"},
    "597alpdf": {"codigo": "037", "nombre": "Audición y Lenguaje", "cuerpo": "0597-MAESTROS"},
    "597frpdf": {"codigo": "033", "nombre": "Lengua Extranjera: Francés", "cuerpo": "0597-MAESTROS"},
    "597fapdf": {"codigo": "039", "nombre": "Lengua Extranjera: Alemán", "cuerpo": "0597-MAESTROS"}
}

BILINGUE_KEY = "597bipdf"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}


def descargar_pdf(url_id, out_name):
    url = f"https://sede.comunidad.madrid/medias/{url_id}/download"
    dest = os.path.join(PDF_DIR, out_name)
    if os.path.exists(dest) and os.path.getsize(dest) > 1000:
        print(f"  [OK] Fichero ya existe: {out_name} ({os.path.getsize(dest):,} bytes)")
        return dest
    print(f"  [>] Descargando {out_name} desde {url}...")
    try:
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=30) as resp, open(dest, 'wb') as f:
            f.write(resp.read())
        print(f"  [OK] Descargado: {out_name} ({os.path.getsize(dest):,} bytes)")
        return dest
    except Exception as e:
        print(f"  [!] Error descargando {url_id}: {e}")
        return None


def parsear_lista_bilingue(pdf_path):
    """Extrae el conjunto de DNIs habilitados en bolsa bilingüe."""
    if not pdf_path or not os.path.exists(pdf_path):
        return set()
    print("  [>] Procesando lista bilingüe...")
    doc = pymupdf.open(pdf_path)
    bilingues_dni = set()
    for page in doc:
        blocks = page.get_text("blocks")
        for b in blocks:
            text = b[4].strip()
            # Los bloques de DNI tienen formato ****1234*
            dnis = re.findall(r'(\*{3,4}\d{3,4}\*?)', text)
            for d in dnis:
                bilingues_dni.add(d.strip())
    print(f"  [OK] Total aspirantes bilingues registrados: {len(bilingues_dni)}")
    return bilingues_dni


def parsear_pdf_especialidad(pdf_path, esp_meta, bilingues_set):
    """Parsea una lista ordinaria de una especialidad de la CAM."""
    doc = pymupdf.open(pdf_path)
    aspirantes = []
    
    for page in doc:
        blocks = page.get_text("blocks")
        order_block = None
        dni_block = None
        name_block = None
        total_scores = []
        
        for b in blocks:
            x0, y0, text = b[0], b[1], b[4].strip()
            if "CUERPO:" in text or "Anexo" in text or "Fecha:" in text:
                continue
            if "ORDEN" in text and "DNI" in text:
                continue
                
            # Bloque de DNIs
            if re.search(r'\*{3,4}\d{3,4}\*?', text):
                lines = [line.strip() for line in text.split("\n") if line.strip()]
                if lines:
                    dni_block = lines
            # Bloque de Orden (columna x aprox 20 a 35)
            elif 20 <= x0 <= 35 and y0 > 150:
                lines = [l.strip() for l in text.split("\n") if l.strip().isdigit()]
                if lines:
                    order_block = [int(l) for l in lines]
            # Bloque de Nombres (columna x aprox 90 a 125)
            elif 90 <= x0 <= 125 and y0 > 150:
                lines = [line.strip() for line in text.split("\n") if line.strip() and not line.strip().isdigit()]
                if lines:
                    name_block = lines
            # Puntuaciones totales (columna x aprox 300 a 330)
            elif 300 <= x0 <= 330 and y0 > 150:
                scores = [line.strip() for line in text.split("\n") if re.match(r'^\d+,\d+$', line.strip())]
                total_scores.extend(scores)
                
        if order_block and dni_block and name_block:
            limit = min(len(order_block), len(dni_block), len(name_block))
            for i in range(limit):
                dni_val = dni_block[i]
                score_val = total_scores[i] if i < len(total_scores) else "0,0000"
                es_bilingue = dni_val in bilingues_set
                
                aspirantes.append({
                    "n": order_block[i],
                    "d": dni_val,
                    "nom": name_block[i],
                    "p": score_val,
                    "b": 1 if es_bilingue else 0
                })
                
    return aspirantes


def main():
    print("==================================================")
    print("      ACTUALIZADOR INTERINOS COMUNIDAD DE MADRID  ")
    print("==================================================")
    
    # 1. Descargar y procesar bilingüe
    bilingue_pdf = descargar_pdf(BILINGUE_KEY, "597_bilingue.pdf")
    bilingues_set = parsear_lista_bilingue(bilingue_pdf)
    
    resumen = []
    
    # 2. Descargar y procesar cada especialidad de Maestros
    for key, meta in ESPECIALIDADES_MAESTROS.items():
        print(f"\n--- Especialidad: {meta['nombre']} ({meta['codigo']}) ---")
        pdf_name = f"597_{meta['codigo']}.pdf"
        pdf_path = descargar_pdf(key, pdf_name)
        if not pdf_path:
            continue
            
        aspirantes = parsear_pdf_especialidad(pdf_path, meta, bilingues_set)
        print(f"  [OK] Extraidos {len(aspirantes)} aspirantes.")
        
        # Guardar JSON de la especialidad
        out_json_path = os.path.join(DATA_DIR, f"maestros_{meta['codigo']}.json")
        data_payload = {
            "cuerpo": meta["cuerpo"],
            "especialidad_codigo": meta["codigo"],
            "especialidad_nombre": meta["nombre"],
            "total": len(aspirantes),
            "curso": "2026-2027",
            "aspirantes": aspirantes
        }
        with open(out_json_path, "w", encoding="utf-8") as f:
            json.dump(data_payload, f, ensure_ascii=False, indent=None)
            
        resumen.append({
            "codigo": meta["codigo"],
            "nombre": meta["nombre"],
            "total": len(aspirantes),
            "bilingues": sum(1 for a in aspirantes if a["b"] == 1),
            "file": f"maestros_{meta['codigo']}.json"
        })
        
    # Guardar índice maestro de especialidades
    indice_path = os.path.join(DATA_DIR, "especialidades.json")
    with open(indice_path, "w", encoding="utf-8") as f:
        json.dump({
            "curso": "2026-2027",
            "cuerpo": "0597 - Maestros",
            "especialidades": resumen
        }, f, ensure_ascii=False, indent=2)
        
    print("\n==================================================")
    print("PROCESO COMPLETADO EXITOSAMENTE:")
    for r in resumen:
        print(f"  • {r['codigo']} - {r['nombre']}: {r['total']} aspirantes ({r['bilingues']} bilingües)")
    print("==================================================")


if __name__ == "__main__":
    main()
