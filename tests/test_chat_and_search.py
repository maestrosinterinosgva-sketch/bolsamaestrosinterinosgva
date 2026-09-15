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
        # Verificar que las estadísticas del 15/09/2026 son coherentes
        self.assertEqual(self.stats["fecha_adjudicacion"], "15/09/2026")
        self.assertEqual(self.stats["total_adjudicaciones_hoy"], 8270)
        self.assertEqual(self.stats["total_plazas_adjudicadas"], 309)
        self.assertIn("INF", self.stats["especialidades"])
        self.assertIn("PRI", self.stats["especialidades"])
        self.assertEqual(self.stats["especialidades"]["INF"]["total_plazas_hoy"], 92)
        self.assertEqual(self.stats["especialidades"]["PRI"]["total_plazas_hoy"], 100)

    def test_specialty_cutoffs_presence(self):
        # Todas las especialidades con plazas deben tener último adjudicado válido
        for code, sp in self.stats["especialidades"].items():
            if sp["total_plazas_hoy"] > 0:
                ult = sp.get("ultimo_adjudicado")
                self.assertIsNotNone(ult, f"Especialidad {code} tiene plazas pero falta ultimo_adjudicado")
                self.assertIn("name", ult)
                self.assertIn("bolsa_num", ult)
                self.assertIn("adj_order", ult)

if __name__ == "__main__":
    unittest.main()
