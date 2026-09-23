"""
parse_data.py
Procesa la bolsa general inicial (ini_2026_par_pro_int_lis_mae.pdf)
y el PDF semanal de adjudicaciones (adjudicaciones309.pdf u otro).
"""
import os
import json
import re
import unicodedata
import pymupdf

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

SPECIALTY_NAMES = {
    "INF": "Educación Infantil",
    "PRI": "Educación Primaria",
    "PT": "Pedagogía Terapéutica",
    "AL": "Audición y Lenguaje",
    "EF": "Educación Física",
    "MUS": "Música",
    "ING": "Lengua Extranjera: Inglés",
    "FRA": "Lengua Extranjera: Francés"
}

SPEC_CODE_TO_ACRONYM = {
    "120": "INF",
    "121": "ING",
    "122": "FRA",
    "123": "EF",
    "124": "MUS",
    "126": "AL",
    "127": "PT",
    "128": "PRI",
    "151": "AL",
    "152": "PT",
    "153": "PRI",
    "216": "MUS",
    "217": "EF",
    "256": "VAL"
}

def parse_participants(pdf_path="ini_2026_par_pro_int_lis_mae.pdf"):
    print(f"[*] Analizando lista general de interinos inicial: {pdf_path}")
    doc = pymupdf.open(pdf_path)
    total_pages = len(doc)
    
    valid_specialties = {"INF", "PRI", "ING", "FRA", "EF", "AL", "PT", "MUS", "ALE", "VAL"}
    participants = []
    current_entry = None
    
    for pno in range(total_pages):
        text = doc[pno].get_text()
        lines = [l.strip() for l in text.splitlines() if l.strip()]
        
        i = 0
        while i < len(lines):
            l = lines[i]
            if "Bolsa del cuerpo de maestros" in l or "Listado Provisional" in l or "Habilitaci" in l:
                i += 1
                continue
            
            m_combined = re.match(r'^(\d+)\s+([A-ZÁÉÍÓÚÑÇ\s,\.\'-]+)$', l)
            m_num_only = re.match(r'^(\d+)$', l)
            
            if m_combined:
                if current_entry:
                    participants.append(current_entry)
                num = int(m_combined.group(1))
                name = m_combined.group(2).strip()
                i += 1
                serv = ""
                specs = []
                specs_desactivadas = []
                while i < len(lines):
                    nxt = lines[i]
                    if nxt in ["AMB SERVEIS", "SENSE SERVEIS"]:
                        serv = nxt
                        i += 1
                    elif nxt in valid_specialties:
                        specs.append(nxt)
                        i += 1
                    elif nxt.endswith("*") and nxt[:-1] in valid_specialties:
                        clean_sp = nxt[:-1]
                        specs.append(clean_sp)
                        specs_desactivadas.append(clean_sp)
                        i += 1
                    elif re.match(r'^\d+', nxt):
                        break
                    elif "Bolsa del cuerpo" in nxt or "Listado Provisional" in nxt or "Habilitaci" in nxt:
                        i += 1
                    else:
                        break
                current_entry = {
                    "bolsa_num": num,
                    "name": name,
                    "services": serv,
                    "specialties": specs,
                    "specialties_deactivated": specs_desactivadas
                }
            elif m_num_only:
                if current_entry:
                    participants.append(current_entry)
                num = int(m_num_only.group(1))
                i += 1
                name = ""
                if i < len(lines):
                    name = lines[i]
                    i += 1
                serv = ""
                specs = []
                specs_desactivadas = []
                while i < len(lines):
                    nxt = lines[i]
                    if nxt in ["AMB SERVEIS", "SENSE SERVEIS"]:
                        serv = nxt
                        i += 1
                    elif nxt in valid_specialties:
                        specs.append(nxt)
                        i += 1
                    elif nxt.endswith("*") and nxt[:-1] in valid_specialties:
                        clean_sp = nxt[:-1]
                        specs.append(clean_sp)
                        specs_desactivadas.append(clean_sp)
                        i += 1
                    elif re.match(r'^\d+', nxt):
                        break
                    elif "Bolsa del cuerpo" in nxt or "Listado Provisional" in nxt or "Habilitaci" in nxt:
                        i += 1
                    else:
                        if not serv and not specs:
                            name += " " + nxt
                            i += 1
                        else:
                            break
                current_entry = {
                    "bolsa_num": num,
                    "name": name,
                    "services": serv,
                    "specialties": specs,
                    "specialties_deactivated": specs_desactivadas
                }
            else:
                i += 1
                
    if current_entry:
        participants.append(current_entry)
        
    print(f"[OK] Participantes iniciales en bolsa: {len(participants)}")
    return participants

def parse_adjudicaciones(pdf_path="adjudicaciones309.pdf"):
    print(f"[*] Analizando documento de adjudicaciones: {pdf_path}")
    doc = pymupdf.open(pdf_path)
    total_pages = len(doc)
    
    all_lines = []
    for pno in range(total_pages):
        text = doc[pno].get_text()
        for l in text.splitlines():
            l = l.strip()
            if l and not re.match(r'^\d{2}/\d{2}/\d{4}', l) and "ADJUDICACI" not in l and "Mestres / Maestros" not in l and l != "MESTRES":
                all_lines.append(l)

    parsed_entries = []
    i = 0
    while i < len(all_lines):
        line = all_lines[i]
        m = re.match(r'^(\d+)\s*(.*)$', line)
        if not m:
            i += 1
            continue
            
        num = int(m.group(1))
        rest = m.group(2).strip()
        
        if rest and i + 1 < len(all_lines) and all_lines[i+1] in ["Desactivat", "No ha participat", "Ha participat", "No adjudicat"]:
            name = rest
            status = all_lines[i+1]
            parsed_entries.append({
                "adj_order": num,
                "name": name,
                "status": status,
                "plaza": None
            })
            i += 2
            continue
        elif not rest and i + 2 < len(all_lines) and all_lines[i+2] in ["Desactivat", "No ha participat", "Ha participat", "No adjudicat"]:
            name = all_lines[i+1]
            status = all_lines[i+2]
            parsed_entries.append({
                "adj_order": num,
                "name": name,
                "status": status,
                "plaza": None
            })
            i += 3
            continue
        else:
            found = False
            for offset in range(1, 18):
                if i + offset >= len(all_lines):
                    break
                chk = all_lines[i+offset]
                if chk == "Adjudicat":
                    block = all_lines[i:i+offset+1]
                    pet_idx = -1
                    for bi, bl in enumerate(block):
                        if "Petici" in bl or bl in ["Voluntaria", "Obligatoria"]:
                            pet_idx = bi
                            break
                    
                    name = block[pet_idx - 1] if pet_idx > 0 else ""
                    
                    spec_code = ""
                    spec_name = ""
                    for bl in block:
                        m_sp = re.match(r'^([0-9A-Za-z]{3})\s*/\s*(.+)$', bl)
                        if m_sp:
                            spec_code = m_sp.group(1)
                            spec_name = m_sp.group(2).strip()
                            break
                            
                    code_plaza = ""
                    for bl in block:
                        if re.match(r'^\d{6}$', bl):
                            code_plaza = bl
                            break
                            
                    vac_type = "VACANT"
                    for bl in block:
                        if "SUBSTITUCI" in bl:
                            vac_type = "SUBSTITUCIÓ"
                            break
                    
                    jornada = ""
                    for bl in block:
                        if "Jornada" in bl or "horas" in bl or "Itinerant" in bl:
                            jornada = bl
                            break
                            
                    center = ""
                    for bl in block:
                        if "(" in bl and ")" in bl and not bl.startswith("03/"):
                            center = bl
                            break

                    parsed_entries.append({
                        "adj_order": num,
                        "name": name,
                        "status": "Adjudicat",
                        "plaza": {
                            "type": vac_type,
                            "center": center,
                            "spec_code": spec_code,
                            "spec_name": spec_name,
                            "code": code_plaza,
                            "jornada": jornada,
                            "spec_acronym": SPEC_CODE_TO_ACRONYM.get(spec_code, spec_code)
                        }
                    })
                    i = i + offset + 1
                    found = True
                    break
                elif chk in ["Desactivat", "No ha participat", "Ha participat", "No adjudicat"]:
                    name_parts = [rest] if rest else []
                    for p in range(1, offset):
                        name_parts.append(all_lines[i+p])
                    name = " ".join([p for p in name_parts if p]).strip()
                    status = chk
                    parsed_entries.append({
                        "adj_order": num,
                        "name": name,
                        "status": status,
                        "plaza": None
                    })
                    i = i + offset + 1
                    found = True
                    break
            if not found:
                i += 1

    print(f"[OK] Entradas de adjudicación en {pdf_path}: {len(parsed_entries)}")
    return parsed_entries

def build_combined_dataset(participants, adjudicaciones, fecha_adj="03/09/2026", output_dir="data"):
    print(f"Total participants (ini_2026): {len(participants)}")
    print(f"Total adjudicaciones: {len(adjudicaciones)}")

    p_idx = 0
    matched_adj = 0

    for a in adjudicaciones:
        a_tokens = clean_tokens(a["name"])
        found_p = None
        
        for offset in range(160):
            curr = p_idx + offset
            if curr >= len(participants):
                break
            p = participants[curr]
            p_tokens = clean_tokens(p["name"])
            
            if len(a_tokens) >= 2 and len(p_tokens) >= 2:
                if a_tokens[0] == p_tokens[0] and (a_tokens[1] == p_tokens[1] or a_tokens[1].startswith(p_tokens[1][:4]) or p_tokens[1].startswith(a_tokens[1][:4])):
                    found_p = p
                    p_idx = curr + 1
                    break
            elif len(a_tokens) >= 1 and len(p_tokens) >= 1:
                if a_tokens[0] == p_tokens[0]:
                    found_p = p
                    p_idx = curr + 1
                    break
                    
        if found_p:
            matched_adj += 1
            found_p["in_adjudicacion"] = True
            found_p["adj_order"] = a["adj_order"]
            found_p["status"] = a["status"]
            found_p["plaza"] = a["plaza"]
            if a["plaza"] and a["plaza"].get("spec_acronym"):
                acr = a["plaza"]["spec_acronym"]
                if acr not in found_p["specialties"]:
                    found_p["specialties"].append(acr)
        else:
            norm_a = normalize_text(a["name"])
            direct_p = next((p for p in participants if normalize_text(p["name"]) == norm_a and not p.get("in_adjudicacion")), None)
            if direct_p:
                matched_adj += 1
                direct_p["in_adjudicacion"] = True
                direct_p["adj_order"] = a["adj_order"]
                direct_p["status"] = a["status"]
                direct_p["plaza"] = a["plaza"]
            else:
                new_p = {
                    "bolsa_num": None,
                    "name": a["name"],
                    "services": "AMB SERVEIS",
                    "specialties": [a["plaza"]["spec_acronym"]] if a.get("plaza") and a["plaza"].get("spec_acronym") else [],
                    "specialties_deactivated": [],
                    "in_adjudicacion": True,
                    "adj_order": a["adj_order"],
                    "status": a["status"],
                    "plaza": a["plaza"]
                }
                participants.append(new_p)

    # Cargar mapa oficial de acreditaciones de idiomas (B2, C1, C2)
    acred_map_file = os.path.join(output_dir, "acreditaciones_map.json")
    if not os.path.exists(acred_map_file):
        acred_map_file = os.path.join(os.path.dirname(__file__), "data", "acreditaciones_map.json")
    acred_map = {}
    if os.path.exists(acred_map_file):
        try:
            with open(acred_map_file, "r", encoding="utf-8") as f:
                acred_map = json.load(f)
        except Exception as e:
            print(f"[!] Error al cargar acreditaciones_map.json: {e}")

    for p in participants:
        if "in_adjudicacion" not in p:
            p["in_adjudicacion"] = False
            p["adj_order"] = None
            p["status"] = "No convocat"
            p["plaza"] = None
        p["norm_name"] = normalize_text(p["name"])
        p["num"] = p["adj_order"] if p["adj_order"] is not None else (p.get("bolsa_num") or 99999)
        if p["name"] in acred_map:
            p["idiomas"] = acred_map[p["name"]]["idiomas"]
            p["idiomas_str"] = acred_map[p["name"]].get("idiomas_str", "")

    print(f"Total consolidated: {len(participants)} (Matched in adjudicaciones: {matched_adj})")

    adj_only = [p for p in participants if p["in_adjudicacion"]]
    adj_only.sort(key=lambda x: x["adj_order"] or 99999)

    valid_specialties = ["INF", "PRI", "PT", "AL", "EF", "MUS", "ING", "FRA"]
    specs_stats = {}

    for sp in valid_specialties:
        sp_members_all = [p for p in participants if sp in p["specialties"]]
        sp_members_adj = [p for p in adj_only if sp in p["specialties"]]
        
        adjudicados_en_esta_sp = [c for c in sp_members_adj if c["status"] == "Adjudicat" and c.get("plaza") and c["plaza"].get("spec_acronym") == sp]
        ultimo_adj = adjudicados_en_esta_sp[-1] if adjudicados_en_esta_sp else None
        
        desactivados_total = sum(1 for c in sp_members_adj if c["status"] == "Desactivat" or (c.get("specialties_deactivated") and sp in c["specialties_deactivated"]))
        no_participat_total = sum(1 for c in sp_members_adj if c["status"] == "No ha participat")
        adjudicados_total = sum(1 for c in sp_members_adj if c["status"] == "Adjudicat")
        activos_total = sum(1 for c in sp_members_adj if c["status"] in ["Ha participat", "No adjudicat"])
        
        specs_stats[sp] = {
            "name": SPECIALTY_NAMES.get(sp, sp),
            "total_bolsa_inicial": len(sp_members_all),
            "total_convocados_adj": len(sp_members_adj),
            "total_bolsa": len(sp_members_all),
            "total_plazas_hoy": len(adjudicados_en_esta_sp),
            "total_adjudicados_general": adjudicados_total,
            "total_desactivados": desactivados_total,
            "total_no_participat": no_participat_total,
            "total_activos_espera": activos_total,
            "ultimo_adjudicado": {
                "name": ultimo_adj["name"] if ultimo_adj else None,
                "adj_order": ultimo_adj["adj_order"] if ultimo_adj else None,
                "bolsa_num": ultimo_adj["bolsa_num"] if ultimo_adj else None,
                "centro": ultimo_adj["plaza"]["center"] if ultimo_adj and ultimo_adj.get("plaza") else None
            } if ultimo_adj else None
        }

    total_plazas = sum(sp["total_plazas_hoy"] for sp in specs_stats.values())

    stats_dict = {
        "fecha_adjudicacion": fecha_adj,
        "total_participantes_bolsa": len(participants),
        "total_participantes_bolsa_inicial": len(participants),
        "total_adjudicaciones_hoy": len(adjudicaciones),
        "total_plazas_adjudicadas": total_plazas,
        "especialidades": specs_stats
    }

    os.makedirs(output_dir, exist_ok=True)
    with open(os.path.join(output_dir, "interinos_data.json"), "w", encoding="utf-8") as f:
        json.dump(participants, f, ensure_ascii=False)

    with open(os.path.join(output_dir, "interinos_data.js"), "w", encoding="utf-8") as f:
        f.write("window.ALL_INTERINOS = " + json.dumps(participants, ensure_ascii=False) + ";\n")

    with open(os.path.join(output_dir, "stats_summary.json"), "w", encoding="utf-8") as f:
        json.dump(stats_dict, f, ensure_ascii=False, indent=2)

    with open(os.path.join(output_dir, "stats_summary.js"), "w", encoding="utf-8") as f:
        f.write("window.STATS_SUMMARY = " + json.dumps(stats_dict, ensure_ascii=False) + ";\n")

    print(f"[OK] Archivos generados con éxito en '{output_dir}'.")
    return participants, stats_dict

if __name__ == "__main__":
    p = parse_participants()
    a = parse_adjudicaciones()
    build_combined_dataset(p, a)
