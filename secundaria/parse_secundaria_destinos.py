"""
parse_secundaria_destinos.py
Extractor de alta precisión para los listados oficiales de puestos ofertados (PDF)
de Secundaria y Otros Cuerpos de la Conselleria de Educación de la Generalitat Valenciana.
Cruza cada plaza con las coordenadas GPS oficiales de los institutos y centros de la CV.
"""
import sys
import os
import re
import json
import pymupdf

if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

def load_geo_database(base_dir="."):
    centros_path = os.path.join(base_dir, "data", "centros_geo.json")
    municipios_path = os.path.join(base_dir, "data", "municipios_coords.json")
    jornadas_path = os.path.join(base_dir, "data", "centros_jornadas.json")
    
    centros_geo = {}
    municipios_geo = {}
    centros_jornadas = {}
    
    if os.path.exists(centros_path):
        try:
            with open(centros_path, "r", encoding="utf-8") as f:
                centros_geo = json.load(f)
        except Exception as e:
            print(f"[!] Aviso al cargar centros_geo: {e}")
            
    if os.path.exists(municipios_path):
        try:
            with open(municipios_path, "r", encoding="utf-8") as f:
                mun_list = json.load(f)
                for m in mun_list:
                    municipios_geo[m["nombre"].upper()] = m
        except Exception as e:
            print(f"[!] Aviso al cargar municipios_coords: {e}")

    if os.path.exists(jornadas_path):
        try:
            with open(jornadas_path, "r", encoding="utf-8") as f:
                centros_jornadas = json.load(f)
        except Exception as e:
            print(f"[!] Aviso al cargar centros_jornadas: {e}")

    return centros_geo, municipios_geo, centros_jornadas

def parse_puestos_pdf(pdf_path, base_dir="."):
    if not os.path.exists(pdf_path):
        raise FileNotFoundError(f"No existe el archivo {pdf_path}")

    centros_geo, municipios_geo, centros_jornadas = load_geo_database(base_dir)

    doc = pymupdf.open(pdf_path)
    total_pages = len(doc)
    print(f"[*] Abriendo '{pdf_path}' ({total_pages} páginas)...")

    fecha_adjudicacion = "01/10/2026"
    fecha_publicacion = ""
    try:
        p0_text = doc[0].get_text("text")
        m_fecha = re.search(r'ADJUDICACI[ÓO]N DE PERSONAL DOCENTE INTERINO D[ÍI]A\s*(\d{2}/\d{2}/\d{4})', p0_text, re.IGNORECASE)
        if m_fecha:
            fecha_adjudicacion = m_fecha.group(1)
        m_pub = re.search(r'(\d{2}/\d{2}/\d{4})\s*\n\s*Avgda\.Campanar', p0_text)
        if m_pub:
            fecha_publicacion = m_pub.group(1)
        elif not fecha_publicacion:
            m_alt = re.findall(r'(\d{2}/\d{2}/\d{4})', p0_text)
            if len(m_alt) > 1:
                fecha_publicacion = m_alt[0]
    except Exception as e:
        print(f"[!] Error al extraer fecha: {e}")

    current_cuerpo = ""
    current_especialidad = ""
    current_provincia = ""

    plazas = []
    re_num = re.compile(r'^\d+$')
    re_centro = re.compile(r'^(.+?)\s*-\s*(\d{8})\s*-\s*(.+)$')
    re_shared = re.compile(r'(\d{8}):\s*(.+?)\s*\((.+?)\)\s*([0-9.,]+)\s*hores?\s*(.*)', re.IGNORECASE)

    for pno in range(total_pages):
        page = doc[pno]
        full_text = page.get_text("text")

        # Detectar CUERPO
        m_c = re.search(r'CUERPO/COS:\s*(.*?)(?=\nESPECIALIDAD|\nPROVINCIA|\nLOCALIDAD|$)', full_text)
        if m_c:
            val = m_c.group(1).strip().replace('\n', ' ')
            if val:
                current_cuerpo = val

        # Detectar ESPECIALIDAD
        m_e = re.search(r'ESPECIALIDAD/ESPECIALITAT:\s*(.*?)(?=\nPROVINCIA|\nLOCALIDAD|$)', full_text)
        if m_e:
            val = m_e.group(1).strip().replace('\n', ' ')
            if val:
                current_especialidad = val

        # Extraer palabras ordenadas
        words = page.get_text("words")
        content_words = [w for w in words if 165 <= w[1] <= 555]

        lines = []
        for w in sorted(content_words, key=lambda x: (x[1], x[0])):
            assigned = False
            for line in lines:
                avg_y = sum(item[1] for item in line) / len(line)
                if abs(w[1] - avg_y) <= 3.5:
                    line.append(w)
                    assigned = True
                    break
            if not assigned:
                lines.append([w])

        for line in lines:
            line.sort(key=lambda w: w[0])
        lines.sort(key=lambda line: line[0][1])

        for line in lines:
            line_text = " ".join([w[4] for w in line]).strip()

            if "PROVINCIA/PROVINCIA:" in line_text or line_text in ["Alacant", "Castelló", "València"]:
                for prov in ["Alacant", "Castelló", "València"]:
                    if prov.lower() in line_text.lower():
                        current_provincia = prov
                continue

            if "LOCALIDAD / LOCALITAT" in line_text or "TIPUS/TIPO" in line_text:
                continue

            # Línea de centro compartido
            m_sh = re_shared.search(line_text)
            if m_sh:
                if plazas:
                    sh_cod = m_sh.group(1)
                    sh_nom = m_sh.group(2).strip()
                    sh_loc = m_sh.group(3).strip()
                    sh_horas = m_sh.group(4).replace(',', '.')
                    sh_mat = m_sh.group(5).strip()

                    sh_lat = None
                    sh_lng = None
                    if sh_cod in centros_geo:
                        sh_lat = centros_geo[sh_cod]["lat"]
                        sh_lng = centros_geo[sh_cod]["lng"]
                    elif sh_loc.upper() in municipios_geo:
                        sh_lat = municipios_geo[sh_loc.upper()]["lat"]
                        sh_lng = municipios_geo[sh_loc.upper()]["lng"]

                    sh_entry = {
                        "codigo_centro": sh_cod,
                        "nombre_centro": sh_nom,
                        "localidad": sh_loc,
                        "horas": sh_horas,
                        "materia": sh_mat,
                        "lat": sh_lat,
                        "lng": sh_lng
                    }
                    plazas[-1]["centros_compartidos"].append(sh_entry)
                continue

            m_c_line = re_centro.search(line_text)
            if m_c_line:
                first_part = m_c_line.group(1).strip()
                tokens = first_part.split()
                num_plz = None
                tipo_vacante = ""
                localidad = ""

                idx = 0
                if tokens and re_num.match(tokens[0]):
                    num_plz = int(tokens[0])
                    idx += 1

                for t_idx in range(idx, len(tokens)):
                    sub = " ".join(tokens[t_idx:]).upper()
                    if "SUSTITUCIÓN DETERMINADA" in sub or "SUBSTITUCIÓ DETERMINADA" in sub:
                        tipo_vacante = "SUSTITUCIÓN DETERMINADA"
                        localidad = " ".join(tokens[idx:t_idx])
                        break
                    elif "SUSTITUCIÓN INDETERMINADA" in sub or "SUBSTITUCIÓ INDETERMINADA" in sub:
                        tipo_vacante = "SUSTITUCIÓN INDETERMINADA"
                        localidad = " ".join(tokens[idx:t_idx])
                        break
                    elif "VACANTE" in sub or "VACANT" in sub:
                        tipo_vacante = "VACANTE"
                        localidad = " ".join(tokens[idx:t_idx])
                        break

                if not tipo_vacante and tokens:
                    localidad = " ".join(tokens[idx:])

                cod_centro = m_c_line.group(2).strip()
                nom_centro = m_c_line.group(3).strip()

                if not num_plz:
                    num_plz = len(plazas) + 1

                cod_esp = ""
                nom_esp = current_especialidad
                m_esp_parts = re.match(r'^([0-9A-Za-z]{3})\s*-\s*(.+)$', current_especialidad)
                if m_esp_parts:
                    cod_esp = m_esp_parts.group(1)
                    nom_esp = m_esp_parts.group(2).strip()

                # Datos geográficos
                geo_info = centros_geo.get(cod_centro, {})
                lat = geo_info.get("lat")
                lng = geo_info.get("lng")
                direccion = geo_info.get("direccion", "")
                cp = geo_info.get("cp", "")
                comarca = geo_info.get("comarca", "")

                if (lat is None or lng is None) and localidad.upper() in municipios_geo:
                    mun = municipios_geo[localidad.upper()]
                    lat = mun.get("lat")
                    lng = mun.get("lng")
                    if not comarca:
                        comarca = mun.get("comarca", "")

                jornada_code = centros_jornadas.get(cod_centro, "CONTINUA")
                jornada_desc = "Jornada Continua (9:00 a 14:00)" if jornada_code == "CONTINUA" else "Jornada Partida (9:00 a 17:00)"
                jornada_corta = "Continua 9h-14h" if jornada_code == "CONTINUA" else "Partida 9h-17h"

                plaza_dict = {
                    "numero": num_plz,
                    "cuerpo": current_cuerpo,
                    "especialidad_completa": current_especialidad,
                    "codigo_especialidad": cod_esp,
                    "especialidad": nom_esp,
                    "provincia": current_provincia,
                    "localidad": localidad,
                    "codigo_centro": cod_centro,
                    "nombre_centro": nom_centro,
                    "jornada": jornada_code,
                    "jornada_desc": jornada_desc,
                    "jornada_corta": jornada_corta,
                    "direccion": direccion,
                    "cp": cp,
                    "comarca": comarca,
                    "lat": lat,
                    "lng": lng,
                    "lloc": "",
                    "horas": "COMPLETA",
                    "horas_num": 18.0 if "SECUND" in current_cuerpo else 23.0,
                    "es_completa": True,
                    "req_ling": "",
                    "itinerante": "NO",
                    "observaciones": "",
                    "tipo": tipo_vacante,
                    "centros_compartidos": []
                }
                plazas.append(plaza_dict)
                continue

            # Detalles de la última plaza (código lloc, horas, observaciones)
            if plazas:
                m_lloc = re.search(r'\b(\d{6})\b', line_text)
                if m_lloc:
                    plazas[-1]["lloc"] = m_lloc.group(1)

                m_h = re.search(r'\b([0-9.,]+)\s*hores?\b', line_text, re.IGNORECASE)
                if m_h:
                    plazas[-1]["horas"] = m_h.group(1)
                    try:
                        plazas[-1]["horas_num"] = float(m_h.group(1).replace(',', '.'))
                        plazas[-1]["es_completa"] = False
                    except Exception:
                        pass
                elif re.search(r'\b(parcial|mitja jornada)\b', line_text, re.IGNORECASE):
                    plazas[-1]["es_completa"] = False

                if re.search(r'\b(itinerant|itinerante)\b', line_text, re.IGNORECASE):
                    plazas[-1]["itinerante"] = "SÍ"

                if "SUSTITUCIÓN DETERMINADA" in line_text.upper():
                    plazas[-1]["tipo"] = "SUSTITUCIÓN DETERMINADA"
                elif "SUSTITUCIÓN INDETERMINADA" in line_text.upper():
                    plazas[-1]["tipo"] = "SUSTITUCIÓN INDETERMINADA"
                elif "VACANTE" in line_text.upper():
                    plazas[-1]["tipo"] = "VACANTE"

    # Estadísticas
    secundaria_plazas = [p for p in plazas if "SECUND" in p.get("cuerpo", "") or "PROFESOR" in p.get("cuerpo", "")]
    stats = {
        "fecha_adjudicacion": fecha_adjudicacion,
        "fecha_publicacion": fecha_publicacion or fecha_adjudicacion,
        "total_plazas": len(plazas),
        "total_secundaria": len(secundaria_plazas),
        "total_vacantes": sum(1 for p in plazas if "VACANTE" in p.get("tipo", "")),
        "total_sustituciones_indet": sum(1 for p in plazas if "INDETERMINADA" in p.get("tipo", "")),
        "total_sustituciones_det": sum(1 for p in plazas if "DETERMINADA" in p.get("tipo", "")),
        "total_itinerantes": sum(1 for p in plazas if p.get("itinerante") == "SÍ"),
        "total_jornada_parcial": sum(1 for p in plazas if not p.get("es_completa")),
        "cuerpos": {}
    }
    for p in plazas:
        c = p.get("cuerpo", "General")
        stats["cuerpos"][c] = stats["cuerpos"].get(c, 0) + 1

    out_dir = os.path.join(base_dir, "data")
    os.makedirs(out_dir, exist_ok=True)

    with open(os.path.join(out_dir, "puestos_data.json"), "w", encoding="utf-8") as f:
        json.dump(plazas, f, ensure_ascii=False, indent=2)

    with open(os.path.join(out_dir, "puestos_data.js"), "w", encoding="utf-8") as f:
        f.write("window.PUESTOS_DATA = " + json.dumps(plazas, ensure_ascii=False) + ";\n")

    with open(os.path.join(out_dir, "destinos_stats.json"), "w", encoding="utf-8") as f:
        json.dump(stats, f, ensure_ascii=False, indent=2)

    with open(os.path.join(out_dir, "destinos_stats.js"), "w", encoding="utf-8") as f:
        f.write("window.DESTINOS_STATS = " + json.dumps(stats, ensure_ascii=False) + ";\n")

    print(f"[OK] Total plazas extraídas: {len(plazas)} ({len(secundaria_plazas)} de Secundaria/FP).")
    return plazas, stats

def main(pdf_path="261001_pue_def.pdf", base_dir="."):
    return parse_puestos_pdf(pdf_path, base_dir)

if __name__ == "__main__":
    p_file = sys.argv[1] if len(sys.argv) > 1 else "261001_pue_def.pdf"
    main(p_file)
