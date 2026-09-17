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

    # 4. Especialidades
    for sp in p.get("specialties", []):
        if q in normalize_text(sp):
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
        # Buscar por nombre de centro escolar adjudicado
        results = [p for p in self.interinos if matches_table_search(p, "BRACAL")]
        self.assertGreater(len(results), 0)
        for r in results:
            self.assertIsNotNone(r.get("plaza"))
            self.assertIn("BRACAL", r["plaza"]["center"].upper())

    def test_search_by_school_code(self):
        # Buscar por código oficial de centro (ej. 03006621)
        results = [p for p in self.interinos if matches_table_search(p, "03006621")]
        self.assertGreater(len(results), 0)
        self.assertIn("03006621", results[0]["plaza"]["center"])

    def test_search_by_locality(self):
        # Buscar por municipio/localidad (ej. MURO DE ALCOY o TEULADA)
        results = [p for p in self.interinos if matches_table_search(p, "TEULADA")]
        self.assertGreater(len(results), 0)
        for r in results:
            self.assertIn("TEULADA", r["plaza"]["center"].upper())

    def test_search_by_vacancy_type(self):
        # Buscar por tipo de plaza (sustitucion)
        results = [p for p in self.interinos if matches_table_search(p, "SUBSTITUCIO")]
        self.assertGreater(len(results), 0)

    def test_stats_summary_data_integrity(self):
        # Verificar que las estadísticas del 17/09/2026 son coherentes
        self.assertEqual(self.stats["fecha_adjudicacion"], "17/09/2026")
        self.assertEqual(self.stats["total_adjudicaciones_hoy"], 7959)
        self.assertEqual(self.stats["total_plazas_adjudicadas"], 253)
        self.assertIn("INF", self.stats["especialidades"])
        self.assertIn("PRI", self.stats["especialidades"])
        self.assertEqual(self.stats["especialidades"]["INF"]["total_plazas_hoy"], 55)
        self.assertEqual(self.stats["especialidades"]["PRI"]["total_plazas_hoy"], 80)

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
        # 'torreta' en 17/09/2026 adjudica la plaza de PT en el IES LA TORRETA de Elda
        matches_torreta = [p for p in self.interinos if p.get("plaza") and "TORRETA" in p["plaza"]["center"].upper()]
        self.assertEqual(len(matches_torreta), 1)
        self.assertIn("GARCIA CATALAN, ANA PILAR", matches_torreta[0]["name"])
        self.assertEqual(matches_torreta[0]["plaza"]["spec_acronym"], "PT")
        self.assertEqual(matches_torreta[0]["adj_order"], 1234)
        self.assertEqual(matches_torreta[0]["bolsa_num"], 5668)

        # 'elda' debe encontrar los centros de Elda
        matches_elda = [p for p in self.interinos if p.get("plaza") and "ELDA" in p["plaza"]["center"].upper()]
        self.assertGreater(len(matches_elda), 0)

    def test_compare_persons_metrics(self):
        # Comparar ANA PILAR GARCIA CATALAN (La Torreta) con PABLO HERNANDEZ RIZO
        p_anapilar = next(p for p in self.interinos if "GARCIA CATALAN, ANA PILAR" in p["name"])
        p_pablo = next(p for p in self.interinos if "HERNANDEZ RIZO, PABLO" in p["name"])
        
        diff_conv = abs(p_pablo["adj_order"] - p_anapilar["adj_order"])
        diff_bolsa = abs(p_pablo["bolsa_num"] - p_anapilar["bolsa_num"])
        self.assertEqual(diff_conv, 2292)
        self.assertEqual(diff_bolsa, 6600)

        # Aspirantes y plazas de PT en medio
        min_ord = min(p_anapilar["adj_order"], p_pablo["adj_order"])
        max_ord = max(p_anapilar["adj_order"], p_pablo["adj_order"])
        between = [p for p in self.interinos if p.get("adj_order") and min_ord < p["adj_order"] < max_ord and "PT" in (p.get("specialties") or [])]
        plazas_between = [p for p in between if p.get("plaza") and p["plaza"].get("spec_acronym") == "PT"]
        
        self.assertEqual(len(between), 676)
        self.assertEqual(len(plazas_between), 37)

if __name__ == "__main__":
    unittest.main()


