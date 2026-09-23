"""
tests/test_chat_and_search.py
Pruebas unitarias para:
1. Filtrado multicriterio en la tabla de adjudicaciones (persona, centro, código, localidad, puesto).
2. Motor analítico del Chat de la Bolsa (cortes, plazas, centros, desactivados).
"""
import unittest
import json
import os
import re
import unicodedata

def normalize_text(text):
    if not text:
        return ""
    t = unicodedata.normalize("NFD", text)
    t = "".join([c for c in t if not unicodedata.combining(c)])
    t = re.sub(r'[^a-zA-Z0-9\s]', ' ', t).upper()
    t = t.replace('Y', 'I')
    return re.sub(r'\s+', ' ', t).strip()

def classify_jornada(plaza):
    if not plaza or not plaza.get("jornada"):
        return "DESCONOCIDA"
    j = plaza["jornada"].lower().strip()
    if 'parcial' in j or '11,5' in j or '11.5' in j or '7,5' in j or '7.5' in j or '7,667' in j or '7.667' in j or '9 hora' in j or ('hora' in j and '23' not in j):
        return "PARCIAL"
    return "ENTERA"

def matches_table_search(p, query):
    if not query:
        return True
    q = normalize_text(query)
    
    # 1. Nombre y números
    if p.get("norm_name") and q in p["norm_name"]:
        return True
    if p.get("name") and q in normalize_text(p["name"]):
        return True
    if q in str(p.get("adj_order") or p.get("num") or ""):
        return True
    if q in str(p.get("bolsa_num") or ""):
        return True

    # 2. Estado
    if p.get("status") and q in normalize_text(p["status"]):
        return True

    # 3. Puesto y Centro adjudicado
    plaza = p.get("plaza")
    if plaza:
        if plaza.get("center") and q in normalize_text(plaza["center"]):
            return True
        if plaza.get("spec_name") and q in normalize_text(plaza["spec_name"]):
            return True
        if plaza.get("spec_acronym") and q in normalize_text(plaza["spec_acronym"]):
            return True
        if plaza.get("tipo_vacante") and q in normalize_text(plaza["tipo_vacante"]):
            return True
        if plaza.get("type") and q in normalize_text(plaza["type"]):
            return True
        if plaza.get("jornada") and q in normalize_text(plaza["jornada"]):
            return True
        if plaza.get("code") and q in str(plaza["code"]):
            return True
        if plaza.get("cod_plaza") and q in str(plaza["cod_plaza"]):
            return True
        
        j_type = classify_jornada(plaza)
        if j_type == "PARCIAL" and ("PARCIAL" in q or q in "PARCIAL"):
            return True
        if j_type == "ENTERA" and ("ENTERA" in q or "COMPLETA" in q or q in "ENTERA" or q in "COMPLETA"):
            return True

    # 4. Especialidades
    for sp in p.get("specialties", []):
        if q in normalize_text(sp):
            return True

    # 5. Idiomas acreditados
    if p.get("idiomas_str") and q in normalize_text(p["idiomas_str"]):
        return True
    if p.get("idiomas"):
        for lang, lvl in p["idiomas"].items():
            if q in normalize_text(lvl) or q in normalize_text(lang):
                return True

    return False

class TestChatAndSearch(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data_path = os.path.join(os.path.dirname(__file__), "..", "data", "interinos_data.json")
        cls.stats_path = os.path.join(os.path.dirname(__file__), "..", "data", "stats_summary.json")
        with open(cls.data_path, "r", encoding="utf-8") as f:
            cls.interinos = json.load(f)
        with open(cls.stats_path, "r", encoding="utf-8") as f:
            cls.stats = json.load(f)

    def test_search_by_person_name(self):
        # Buscar por nombre existente
        results = [p for p in self.interinos if matches_table_search(p, "OLAYA")]
        self.assertGreater(len(results), 0)
        self.assertTrue(any("OLAYA" in p["name"].upper() for p in results))

    def test_search_by_school_name(self):
        # Buscar por nombre de centro escolar adjudicado de forma dinámica
        plazas = [p for p in self.interinos if p.get("plaza") and p["plaza"].get("center")]
        self.assertGreater(len(plazas), 0)
        sample = plazas[0]
        words = [w for w in re.findall(r'[A-Za-zÁÉÍÓÚáéíóúÀÈÒàèò]+', sample["plaza"]["center"]) if len(w) > 4 and w.upper() not in ["CEIP", "IES", "SECCIO", "COLEGIO", "INSTITUTO"]]
        query = words[0] if words else "CEIP"
        results = [p for p in self.interinos if matches_table_search(p, query)]
        self.assertGreater(len(results), 0)
        self.assertTrue(any(query.upper() in r["plaza"]["center"].upper() for r in results))

    def test_search_by_school_code(self):
        # Buscar por código oficial de centro adjudicado
        plazas = [p for p in self.interinos if p.get("plaza") and p["plaza"].get("center")]
        self.assertGreater(len(plazas), 0)
        sample = plazas[0]
        code_m = re.search(r'(\d{8})', sample["plaza"]["center"])
        self.assertIsNotNone(code_m)
        code = code_m.group(1)
        results = [p for p in self.interinos if matches_table_search(p, code)]
        self.assertGreater(len(results), 0)
        self.assertIn(code, results[0]["plaza"]["center"])

    def test_search_by_locality(self):
        # Buscar por municipio/localidad (ej. ALACANT, VALENCIA o CASTELLO)
        plazas = [p for p in self.interinos if p.get("plaza") and p["plaza"].get("center")]
        self.assertGreater(len(plazas), 0)
        # Extraer municipio del primer centro
        m_loc = re.match(r'^([^(\n\r]+)', plazas[0]["plaza"]["center"])
        loc = m_loc.group(1).strip() if m_loc else "VALENCIA"
        results = [p for p in self.interinos if matches_table_search(p, loc)]
        self.assertGreater(len(results), 0)

    def test_search_by_vacancy_type(self):
        # Buscar por tipo de plaza (sustitucion o vacante)
        results = [p for p in self.interinos if matches_table_search(p, "SUBSTITUCIO") or matches_table_search(p, "VACANT")]
        self.assertGreater(len(results), 0)

    def test_stats_summary_data_integrity(self):
        # Verificar que las estadísticas de la adjudicación son coherentes
        self.assertRegex(self.stats["fecha_adjudicacion"], r'^\d{2}/\d{2}/\d{4}$')
        self.assertGreater(self.stats["total_adjudicaciones_hoy"], 5000)
        self.assertGreater(self.stats["total_plazas_adjudicadas"], 100)
        self.assertIn("INF", self.stats["especialidades"])
        self.assertIn("PRI", self.stats["especialidades"])
        self.assertGreater(self.stats["especialidades"]["INF"]["total_plazas_hoy"], 0)
        self.assertGreater(self.stats["especialidades"]["PRI"]["total_plazas_hoy"], 0)

    def test_chat_target_extraction(self):
        # Verificar que extractCenterOrPlazaTarget limpia prefijos conversacionales
        def extract_target(raw):
            t = unicodedata.normalize("NFD", raw)
            t = "".join([c for c in t if not unicodedata.combining(c)])
            q = re.sub(r'[^a-zA-Z0-9\s]', ' ', t).lower()
            q = re.sub(r'\s+', ' ', q).strip()
            patterns = [
                r'\b(dime|sabes|sabrias decirme|quiero saber|puedes decirme|consultar|ver|mostrar|por favor)\b',
                r'\b(a\s+quien|quien|quienes)\s+(se\s+)?(ha|han|fue)?\s*(llevado|quedado|adjudicado|dado|cogido|entrado|asignado|tocado|obtenido|ganado)\b',
                r'\b(a\s+quien|quien|quienes)\s+(tiene|esta|consiguio|gano|cogio|lleva|obtuvo)\b',
                r'\b(que|cuantas|cuantos)\s+(plazas?|puestos?)\s+(hay|se\s+han\s+dado|han\s+dado|se\s+han\s+repartido|quedan|tenemos|dieron|asignaron)\b',
                r'\b(hay|habido|habia|dieron|asignaron)\s+(plazas?|puestos?)\b',
                r'\b(que\s+se\s+ha\s+dado|que\s+han\s+dado|que\s+se\s+dio)\b',
                r'\b(la\s+plaza\s+de|el\s+puesto\s+de|las\s+plazas\s+de|los\s+puestos\s+de)\b',
                r'\b(la\s+plaza\s+en|el\s+puesto\s+en|las\s+plazas\s+en|los\s+puestos\s+en)\b',
                r'\b(la\s+plaza|el\s+puesto|las\s+plazas|los\s+puestos|plaza|plazas|puesto|puestos)\b',
                r'\b(colegios?|centros?|institutos?|pueblos?|municipios?|ciudades)\b',
                r'\b(en\s+el|en\s+la|en\s+los|en\s+las|del?|de\s+la|de\s+el|de\s+los|de\s+las|en)\b',
                r'\b(el|la|los|las|un|una|unos|unas)\b'
            ]
            for p in patterns:
                q = re.sub(p, ' ', q)
            return re.sub(r'\s+', ' ', q).strip()

        self.assertEqual(extract_target("quién se ha llevado la plaza de la torreta?"), "torreta")
        self.assertEqual(extract_target("quién se ha llevado la plaza de les arrels?"), "les arrels")
        self.assertEqual(extract_target("qué plazas hay en torrevieja?"), "torrevieja")
        self.assertEqual(extract_target("a quién han dado la plaza de elda?"), "elda")

    def test_search_plazas_in_interinos_data(self):
        # Comprobar adjudicados y centros
        adjudicados = [p for p in self.interinos if p.get("plaza") and p["plaza"].get("center")]
        self.assertGreater(len(adjudicados), 50)
        for a in adjudicados[:10]:
            self.assertIsNotNone(a["plaza"].get("center"))
            self.assertIsNotNone(a["plaza"].get("spec_acronym"))

    def test_compare_persons_metrics(self):
        # Comparar ANA PILAR GARCIA CATALAN con PABLO HERNANDEZ RIZO
        p_anapilar = next(p for p in self.interinos if "GARCIA CATALAN, ANA PILAR" in p["name"])
        p_pablo = next(p for p in self.interinos if "HERNANDEZ RIZO, PABLO" in p["name"])
        
        diff_bolsa = abs(p_pablo["bolsa_num"] - p_anapilar["bolsa_num"])
        self.assertEqual(diff_bolsa, 6600)
        self.assertEqual(p_anapilar["bolsa_num"], 5668)
        self.assertEqual(p_pablo["bolsa_num"], 12268)

        if p_anapilar.get("adj_order") and p_pablo.get("adj_order"):
            diff_conv = abs(p_pablo["adj_order"] - p_anapilar["adj_order"])
            self.assertGreater(diff_conv, 0)

    def test_jornada_classification_and_search(self):
        plazas = [p["plaza"] for p in self.interinos if p.get("plaza")]
        self.assertGreater(len(plazas), 0)
        enteras = [pl for pl in plazas if classify_jornada(pl) == "ENTERA"]
        parciales = [pl for pl in plazas if classify_jornada(pl) == "PARCIAL"]
        self.assertEqual(len(enteras) + len(parciales), len(plazas))
        self.assertGreater(len(enteras), 0)

        # Buscar por "parcial" en la tabla devuelve exactamente aspirantes con plaza a tiempo parcial
        search_parcial = [p for p in self.interinos if matches_table_search(p, "parcial")]
        self.assertEqual(len(search_parcial), len(parciales))
        for p in search_parcial:
            self.assertEqual(classify_jornada(p["plaza"]), "PARCIAL")

        # Buscar por "entera" devuelve aspirantes con jornada completa
        search_entera = [p for p in self.interinos if matches_table_search(p, "entera")]
        self.assertEqual(len(search_entera), len(enteras))

    def test_language_accreditation_and_search(self):
        acred = [p for p in self.interinos if p.get("idiomas")]
        self.assertEqual(len(acred), 490)

        c1_aspirantes = [p for p in self.interinos if p.get("idiomas", {}).get("ingles") == "C1"]
        b2_aspirantes = [p for p in self.interinos if p.get("idiomas", {}).get("ingles") == "B2"]
        self.assertEqual(len(c1_aspirantes), 68)
        self.assertEqual(len(b2_aspirantes), 415)

        # Búsqueda por "c1" en la tabla
        res_c1 = [p for p in self.interinos if matches_table_search(p, "c1")]
        self.assertGreaterEqual(len(res_c1), 68)
        for p in c1_aspirantes:
            self.assertTrue(matches_table_search(p, "c1"))

        # Búsqueda por "b2" en la tabla
        res_b2 = [p for p in self.interinos if matches_table_search(p, "b2")]
        self.assertGreaterEqual(len(res_b2), 415)
        for p in b2_aspirantes:
            self.assertTrue(matches_table_search(p, "b2"))

        # Búsqueda por "ingles"
        res_ing = [p for p in self.interinos if matches_table_search(p, "ingles")]
        self.assertGreaterEqual(len(res_ing), 486)

    def test_position_with_english_requirement(self):
        # 1. Comprobar especialidad PT
        sp = "PT"
        members = [p for p in self.interinos if (p.get("in_adjudicacion") or p.get("adj_order")) and sp in (p.get("specialties") or [])]
        members.sort(key=lambda x: x.get("adj_order") or 0)
        
        limpios = [p for p in members if p.get("status") not in ["Adjudicat", "Desactivat"] and sp not in (p.get("specialties_deactivated") or [])]
        self.assertGreater(len(limpios), 300)

        # 2. Filtrando con requisito de inglés (acreditación oficial B2/C1)
        limpios_ingles_acred = [p for p in limpios if p.get("idiomas", {}).get("ingles")]
        self.assertGreater(len(limpios_ingles_acred), 10)
        self.assertLess(len(limpios_ingles_acred), len(limpios))

        # 3. Comprobar que cualquier aspirante limpio en PT calcula su posición
        if limpios:
            primer_limpio = limpios[0]
            self.assertIsNotNone(primer_limpio.get("adj_order"))

        # 4. Comprobar aspirante acreditada en PT (Begoña Berto Fuster, con C1)
        begona = next((p for p in members if "BERTO FUSTER" in p["name"]), None)
        if begona:
            self.assertEqual(begona.get("idiomas", {}).get("ingles"), "C1")

    def test_chat_query_ahead_with_english_for_pablo(self):
        # Simular la consulta exacta del usuario:
        # "cuántos Pt tienen el requisito de inglés por delante de Pablo Hernández Rizo? esto no lo contesta"
        raw_query = "cuántos Pt tienen el requisito de inglés por delante de Pablo Hernández Rizo? esto no lo contesta"
        
        # 1. Extracción de persona
        stop_words = {
            "cuantos", "cuantas", "quien", "quienes", "tienen", "tiene", "hay", "van", "va",
            "el", "la", "los", "las", "un", "una", "unos", "unas", "de", "del", "en", "por", "con", "sin", "para",
            "delante", "detras", "antes", "despues", "puesto", "puestos", "posicion", "posiciones", "requisito", "requisitos",
            "ingles", "idioma", "idiomas", "acreditacion", "acreditaciones", "b2", "c1", "c2", "nivel",
            "pt", "pri", "inf", "al", "ef", "mus", "fra", "primaria", "infantil", "pedagogia", "terapeutica",
            "esto", "no", "lo", "contesta"
        }
        
        m = re.search(r'(?:por\s+delante\s+de|delante\s+de|detras\s+de|de\s+)([^?.,!;]+)', raw_query, re.I)
        self.assertIsNotNone(m)
        cand_str = m.group(1).strip()
        cand_norm = normalize_text(cand_str).lower()
        cand_tokens = [w for w in cand_norm.split() if w not in stop_words and len(w) >= 2]
        
        # Buscar en la lista de interinos
        matches = [p for p in self.interinos if all(t in (p.get("norm_name") or "").lower() for t in cand_tokens)]
        self.assertGreaterEqual(len(matches), 1)
        pablo = matches[0]
        self.assertIn("HERNANDEZ RIZO", pablo["name"])
        
        # 2. Detección de especialidad
        spec = "PT"
        self.assertIn(spec, raw_query.upper())
        
        # 3. Filtrar candidatos de PT por delante en lista limpia/disponible
        spec_members = [p for p in self.interinos if (p.get("in_adjudicacion") or p.get("adj_order")) and spec in (p.get("specialties") or [])]
        spec_members.sort(key=lambda x: x.get("adj_order") or 0)
        
        p_idx = next(i for i, p in enumerate(spec_members) if p["name"] == pablo["name"])
        ahead_all = spec_members[:p_idx]
        ahead_clean = [p for p in ahead_all if p.get("status") not in ["Adjudicat", "Desactivat"] and spec not in (p.get("specialties_deactivated") or [])]
        
        # Con B2/C1 oficial
        ahead_b2c1 = [p for p in ahead_clean if p.get("idiomas", {}).get("ingles")]
        # Con requisito amplio (B2/C1 o especialidad ING)
        has_any_ing = lambda p: bool(p.get("idiomas", {}).get("ingles") or ("ING" in (p.get("specialties") or []) and spec != "ING"))
        ahead_any_ing = [p for p in ahead_clean if has_any_ing(p)]
        
        self.assertGreater(len(ahead_clean), 300)
        self.assertGreater(len(ahead_b2c1), 10)
        self.assertGreater(len(ahead_any_ing), len(ahead_b2c1))
        
        # Posición teórica con B2/C1 y con requisito
        self.assertGreater(len(ahead_b2c1) + 1, 10)
        self.assertGreater(len(ahead_any_ing) + 1, len(ahead_b2c1) + 1)
        
        # Aspirantes con C1 por delante
        c1_ahead = [p for p in ahead_b2c1 if p.get("idiomas", {}).get("ingles") == "C1"]
        self.assertGreater(len(c1_ahead), 0)
        c1_names = [p["name"] for p in c1_ahead]
        self.assertTrue(any("BERTO FUSTER" in n for n in c1_names) or any("NIETO SIGNES" in n for n in c1_names))

if __name__ == "__main__":
    unittest.main()



