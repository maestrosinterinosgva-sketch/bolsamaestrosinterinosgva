"""
parse_secundaria_bolsa.py
Procesa la bolsa inicial de Secundaria y Otros Cuerpos (ini_2026_par_def_int_lis_sec.pdf)
y el PDF semanal de adjudicaciones de Secundaria (261001_lis_sec.pdf u otro).
Genera los datasets optimizados:
  - data/interinos_data.json / data/interinos_data.js
  - data/stats_summary.json / data/stats_summary.js
"""
import os
import sys
import json
import re
import unicodedata
import time
import pymupdf

if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

def normalize_text(text):
    if not text:
        return ""
    t = unicodedata.normalize('NFKD', text)
    t = "".join([c for c in t if not unicodedata.combining(c)])
    return re.sub(r'\s+', ' ', t).strip().upper()

def clean_tokens(name):
    if not name:
        return []
    t = unicodedata.normalize('NFKD', name)
    t = "".join([c for c in t if not unicodedata.combining(c)])
    t = re.sub(r'[^A-Z\s]', ' ', t.upper())
    t = re.sub(r'\b(AMB|SENSE)\s+SERVEIS\b', '', t)
    return [w for w in t.split() if len(w) > 1]

def parse_initial_bolsa(pdf_path="ini_2026_par_def_int_lis_sec.pdf"):
    print(f"[*] Analizando bolsa general inicial de Secundaria: {pdf_path}")
    doc = pymupdf.open(pdf_path)
    total_pages = len(doc)
    
    specialties_meta = {}
    participants_by_spec = {}
    
    current_cuerpo = "PROFESSORS D'ENSENYAMENT SECUNDARI"
    current_spec_code = None
    current_spec_name = ""
    
    for pno in range(total_pages):
        text = doc[pno].get_text()
        lines = [l.strip() for l in text.splitlines() if l.strip()]
        if len(lines) < 6:
            continue
            
        for l in lines[:8]:
            if 'PROFESSORS' in l or 'MESTRES DE TALLER' in l or 'CATEDR' in l:
                current_cuerpo = l
            m = re.search(r'\(([0-9A-Za-z]{3})\)\s*(.+)', l)
            if m:
                c = m.group(1).upper()
                n = m.group(2).strip()
                if c != current_spec_code:
                    current_spec_code = c
                    current_spec_name = n
                    if current_spec_code not in specialties_meta:
                        specialties_meta[current_spec_code] = {
                            "code": current_spec_code,
                            "name": current_spec_name,
                            "cuerpo": current_cuerpo
                        }
                        participants_by_spec[current_spec_code] = []
                break
                
        if not current_spec_code:
            continue
            
        i = 0
        while i < len(lines):
            l = lines[i]
            if re.match(r'^\d+$', l):
                order = int(l)
                i += 1
                if i < len(lines):
                    name = lines[i]
                    i += 1
                    serv = "AMB SERVEIS"
                    deact = False
                    if i < len(lines) and lines[i] in ["AMB SERVEIS", "SENSE SERVEIS"]:
                        serv = lines[i]
                        i += 1
                    if i < len(lines) and lines[i] == "(*)":
                        deact = True
                        i += 1
                    participants_by_spec[current_spec_code].append({
                        "spec_code": current_spec_code,
                        "spec_name": current_spec_name,
                        "cuerpo": current_cuerpo,
                        "bolsa_num": order,
                        "name": name,
                        "services": serv,
                        "deactivated_initial": deact,
                        "norm_name": normalize_text(name),
                        "tokens": clean_tokens(name)
                    })
            else:
                i += 1
                
    total_ini = sum(len(v) for v in participants_by_spec.values())
    print(f"[OK] Bolsa inicial procesada: {len(specialties_meta)} especialidades, {total_ini} aspirantes.")
    return specialties_meta, participants_by_spec

def parse_adjudicaciones(pdf_path="261001_lis_sec.pdf"):
    print(f"[*] Analizando adjudicaciones de Secundaria: {pdf_path}")
    doc = pymupdf.open(pdf_path)
    total_pages = len(doc)
    
    fecha_adj = "01/10/2026"
    try:
        p0_text = doc[0].get_text()
        m_fecha = re.search(r'(\d{2}/\d{2}/\d{4})', p0_text)
        if m_fecha:
            fecha_adj = m_fecha.group(1)
    except Exception:
        pass
        
    adj_by_spec = {}
    
    for pno in range(total_pages):
        page = doc[pno]
        text = page.get_text()
        lines = [l.strip() for l in text.splitlines() if l.strip()]
        if len(lines) < 7:
            continue
            
        cuerpo = lines[4]
        spec_nom = lines[5]
        spec_cod = lines[6].upper()
        
        if spec_cod not in adj_by_spec:
            adj_by_spec[spec_cod] = {
                "code": spec_cod,
                "name": spec_nom,
                "cuerpo": cuerpo,
                "entries": []
            }
            
        i = 7
        while i < len(lines):
            l = lines[i]
            if "nn / mm->" in l or "ADJUDICACI" in l or "Altres Cossos" in l:
                i += 1
                continue
                
            # Formato estándar con estado en la siguiente línea
            m = re.match(r'^(\d+)(?:/(\d+))?\s+(.+)$', l)
            if m:
                num = int(m.group(1))
                active_num = int(m.group(2)) if m.group(2) else None
                name = m.group(3).strip()
                if i + 1 < len(lines) and lines[i+1] in ['Desactivat', 'Ha participat', 'No ha participat', 'No adjudicat']:
                    status = lines[i+1]
                    adj_by_spec[spec_cod]["entries"].append({
                        "adj_order": num,
                        "active_order": active_num,
                        "name": name,
                        "norm_name": normalize_text(name),
                        "tokens": clean_tokens(name),
                        "status": status,
                        "plaza": None
                    })
                    i += 2
                    continue
                    
            # Formato Adjudicat
            m_num = re.match(r'^(\d+)(?:/(\d+))?$', l)
            if m_num:
                num = int(m_num.group(1))
                active_num = int(m_num.group(2)) if m_num.group(2) else None
                found_adj = False
                for offset in range(1, 15):
                    if i + offset >= len(lines):
                        break
                    if lines[i+offset] == 'Adjudicat':
                        block = lines[i:i+offset+1]
                        tipo_vac = "VACANTE"
                        centro = ""
                        cod_plaza = ""
                        jornada = "Jornada completa"
                        person_name = ""
                        for bi, bl in enumerate(block):
                            if "SUBSTITUCI" in bl:
                                tipo_vac = "SUBSTITUCIÓ"
                            elif "VACANT" in bl:
                                tipo_vac = "VACANTE"
                            if "(" in bl and ")" in bl and not re.match(r'^\d{2}/\d{2}', bl):
                                centro = bl
                            if re.match(r'^\d{6}$', bl):
                                cod_plaza = bl
                            if "horas" in bl or "Jornada" in bl:
                                jornada = bl
                            if "Petici" in bl or bl in ["Voluntaria", "Obligatoria"]:
                                if bi > 0 and not person_name:
                                    person_name = block[bi-1]
                                    
                        if not person_name:
                            for bl in block:
                                if "," in bl and not bl.startswith("("):
                                    person_name = bl
                                    break
                                    
                        adj_by_spec[spec_cod]["entries"].append({
                            "adj_order": num,
                            "active_order": active_num,
                            "name": person_name,
                            "norm_name": normalize_text(person_name),
                            "tokens": clean_tokens(person_name),
                            "status": "Adjudicat",
                            "plaza": {
                                "type": tipo_vac,
                                "center": centro,
                                "code": cod_plaza,
                                "jornada": jornada,
                                "spec_code": spec_cod,
                                "spec_name": spec_nom
                            }
                        })
                        i = i + offset + 1
                        found_adj = True
                        break
                if found_adj:
                    continue
                    
            i += 1

    total_adj = sum(len(v["entries"]) for v in adj_by_spec.values())
    total_plazas = sum(sum(1 for e in v["entries"] if e["status"] == "Adjudicat") for v in adj_by_spec.values())
    print(f"[OK] Adjudicaciones procesadas: {len(adj_by_spec)} especialidades, {total_adj} convocados, {total_plazas} plazas asignadas.")
    return fecha_adj, adj_by_spec

def build_combined_database(specialties_meta, participants_by_spec, fecha_adj, adj_by_spec, output_dir="data"):
    print("[*] Cruzando datos y calculando métricas de posición depurada y cortes...")
    os.makedirs(output_dir, exist_ok=True)
    
    # 1. Preparar lookup index por tokens para la bolsa inicial
    ini_lookup = {} # spec_code -> list of dicts
    for spec, plist in participants_by_spec.items():
        ini_lookup[spec] = {}
        for p in plist:
            toks = tuple(p["tokens"][:3])
            if toks not in ini_lookup[spec]:
                ini_lookup[spec][toks] = p
            # fallback por dos primeros tokens
            if len(toks) >= 2:
                two = tuple(toks[:2])
                if two not in ini_lookup[spec]:
                    ini_lookup[spec][two] = p
                    
    combined_participants = []
    stats_specs = {}
    
    # Todas las especialidades conocidas
    all_spec_codes = sorted(list(set(list(specialties_meta.keys()) + list(adj_by_spec.keys()))))
    
    total_plazas_general = 0
    total_convocados_general = 0
    
    for spec_code in all_spec_codes:
        meta = specialties_meta.get(spec_code) or adj_by_spec.get(spec_code)
        spec_name = meta["name"]
        cuerpo = meta.get("cuerpo", "Secundària")
        
        ini_list = participants_by_spec.get(spec_code, [])
        adj_info = adj_by_spec.get(spec_code, {"entries": []})
        adj_entries = adj_info["entries"]
        
        total_convocados_general += len(adj_entries)
        
        # Mapear cada entrada de adjudicacion
        matched_ini_ids = set()
        adj_entries_processed = []
        
        # Especialidad stats
        plazas_hoy = 0
        desactivados_hoy = 0
        no_part_hoy = 0
        activos_espera_hoy = 0
        ultimo_adjudicado = None
        max_adj_order_with_plaza = 0
        
        for a in adj_entries:
            st = a["status"]
            if st == "Adjudicat":
                plazas_hoy += 1
                total_plazas_general += 1
                if a["adj_order"] > max_adj_order_with_plaza:
                    max_adj_order_with_plaza = a["adj_order"]
                    ultimo_adjudicado = {
                        "name": a["name"],
                        "adj_order": a["adj_order"],
                        "bolsa_num": a["adj_order"],
                        "centro": a["plaza"]["center"] if a["plaza"] else ""
                    }
            elif st == "Desactivat":
                desactivados_hoy += 1
            elif st == "No ha participat":
                no_part_hoy += 1
            else:
                activos_espera_hoy += 1
                
            # Intentar asociar con un registro de ini
            toks = tuple(a["tokens"][:3])
            matched_p = None
            if spec_code in ini_lookup:
                if toks in ini_lookup[spec_code]:
                    matched_p = ini_lookup[spec_code][toks]
                elif len(toks) >= 2 and tuple(toks[:2]) in ini_lookup[spec_code]:
                    matched_p = ini_lookup[spec_code][tuple(toks[:2])]
                    
            bolsa_num = matched_p["bolsa_num"] if matched_p else a["adj_order"]
            serv = matched_p["services"] if matched_p else "AMB SERVEIS"
            
            entry = {
                "name": a["name"],
                "norm_name": a["norm_name"],
                "specialty": spec_code,
                "bolsa_num": bolsa_num,
                "adj_order": a["adj_order"],
                "active_order": a["active_order"],
                "services": serv,
                "status": st,
                "plaza": a["plaza"],
                "in_adjudicacion": True
            }
            if matched_p:
                matched_ini_ids.add(matched_p["bolsa_num"])
            adj_entries_processed.append(entry)
            
        # Añadir también los de la bolsa inicial que no fueron convocados hoy
        for p in ini_list:
            if p["bolsa_num"] not in matched_ini_ids:
                entry = {
                    "name": p["name"],
                    "norm_name": p["norm_name"],
                    "specialty": spec_code,
                    "bolsa_num": p["bolsa_num"],
                    "adj_order": None,
                    "active_order": None,
                    "services": p["services"],
                    "status": "Desactivat" if p["deactivated_initial"] else "No convocat",
                    "plaza": None,
                    "in_adjudicacion": False
                }
                adj_entries_processed.append(entry)
                
        # Ordenar por número de bolsa
        adj_entries_processed.sort(key=lambda x: (x["bolsa_num"] if x["bolsa_num"] is not None else 999999))
        
        # Calcular posición depurada acumulativa
        active_counter = 0
        for p in adj_entries_processed:
            if p["status"] in ["Ha participat", "No adjudicat"]:
                active_counter += 1
                p["posicion_depurada"] = active_counter
            elif p["status"] == "Adjudicat":
                p["posicion_depurada"] = "Adjudicado"
            elif p["status"] == "Desactivat":
                p["posicion_depurada"] = "Desactivado"
            elif p["status"] == "No ha participat":
                p["posicion_depurada"] = "No participó"
            else:
                p["posicion_depurada"] = "-"
                
        combined_participants.extend(adj_entries_processed)
        
        stats_specs[spec_code] = {
            "code": spec_code,
            "name": spec_name,
            "cuerpo": cuerpo,
            "total_bolsa_inicial": len(ini_list),
            "total_convocados_adj": len(adj_entries),
            "total_plazas_hoy": plazas_hoy,
            "total_desactivados": desactivados_hoy,
            "total_no_participat": no_part_hoy,
            "total_activos_espera": activos_espera_hoy,
            "corte_bolsa_num": max_adj_order_with_plaza,
            "ultimo_adjudicado": ultimo_adjudicado
        }
        
    stats_data = {
        "fecha_adjudicacion": fecha_adj,
        "total_participantes_bolsa": len(combined_participants),
        "total_adjudicaciones_hoy": total_convocados_general,
        "total_plazas_adjudicadas": total_plazas_general,
        "total_especialidades": len(stats_specs),
        "especialidades": stats_specs
    }
    
    # Guardar stats_summary.json y stats_summary.js
    with open(os.path.join(output_dir, "stats_summary.json"), "w", encoding="utf-8") as f:
        json.dump(stats_data, f, ensure_ascii=False, indent=2)
    with open(os.path.join(output_dir, "stats_summary.js"), "w", encoding="utf-8") as f:
        f.write("window.STATS_SUMMARY = " + json.dumps(stats_data, ensure_ascii=False) + ";\n")
        
    # Guardar interinos_data.json y interinos_data.js
    print(f"[*] Guardando {len(combined_participants)} registros en {output_dir}...")
    with open(os.path.join(output_dir, "interinos_data.json"), "w", encoding="utf-8") as f:
        json.dump(combined_participants, f, ensure_ascii=False)
    with open(os.path.join(output_dir, "interinos_data.js"), "w", encoding="utf-8") as f:
        f.write("window.INTERINOS_DATA = " + json.dumps(combined_participants, ensure_ascii=False) + ";\n")
        
    print("[OK] Generación de base de datos de Secundaria completada con éxito.")
    return stats_data

def main(pdf_ini="ini_2026_par_def_int_lis_sec.pdf", pdf_adj="261001_lis_sec.pdf", output_dir="data"):
    t0 = time.time()
    specialties_meta, participants_by_spec = parse_initial_bolsa(pdf_ini)
    fecha_adj, adj_by_spec = parse_adjudicaciones(pdf_adj)
    stats = build_combined_database(specialties_meta, participants_by_spec, fecha_adj, adj_by_spec, output_dir)
    print(f"[OK] Proceso completado en {time.time()-t0:.2f}s.")
    return stats

if __name__ == "__main__":
    ini_file = sys.argv[1] if len(sys.argv) > 1 else "ini_2026_par_def_int_lis_sec.pdf"
    adj_file = sys.argv[2] if len(sys.argv) > 2 else "261001_lis_sec.pdf"
    main(ini_file, adj_file)
