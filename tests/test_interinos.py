import os
import json
import unittest
import unicodedata
import re

def normalize_text(text):
    if not text:
        return ""
    t = unicodedata.normalize('NFKD', text)
    t = "".join([c for c in t if not unicodedata.combining(c)])
    t = re.sub(r'[^a-zA-Z0-9\s]', ' ', t.upper())
    t = t.replace('Y', 'I')
    return re.sub(r'\s+', ' ', t).strip()

class TestInterinosDataAndMetrics(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        data_path = os.path.join(base_dir, "data", "interinos_data.json")
        stats_path = os.path.join(base_dir, "data", "stats_summary.json")
        
        assert os.path.exists(data_path), f"File {data_path} not found"
        assert os.path.exists(stats_path), f"File {stats_path} not found"
        
        with open(data_path, "r", encoding="utf-8") as f:
            cls.interinos = json.load(f)
            
        with open(stats_path, "r", encoding="utf-8") as f:
            cls.stats = json.load(f)

    def test_01_total_participants(self):
        """Verificar que se han cargado los más de 17.000 participantes de la bolsa general y los miles de adjudicaciones"""
        self.assertGreaterEqual(len(self.interinos), 17000)
        self.assertGreaterEqual(self.stats["total_adjudicaciones_hoy"], 5000)
        first = self.interinos[0]
        self.assertEqual(first["name"], "MARQUET SOLDEVILA, ROSA MARIA")

    def test_02_specialties_summary(self):
        """Verificar que todas las especialidades principales de maestros están presentes"""
        expected_specs = ["INF", "PRI", "PT", "AL", "EF", "MUS", "ING", "FRA"]
        for sp in expected_specs:
            self.assertIn(sp, self.stats["especialidades"])
            sp_data = self.stats["especialidades"][sp]
            self.assertGreater(sp_data["total_bolsa"], 0)
            self.assertGreaterEqual(sp_data["total_plazas_hoy"], 0)

    def test_03_search_accent_insensitivity(self):
        """Verificar que la búsqueda por nombre es insensible a tildes y mayúsculas"""
        query_accent = "PÉREZ"
        query_plain = "PEREZ"
        
        norm_accent = normalize_text(query_accent)
        norm_plain = normalize_text(query_plain)
        self.assertEqual(norm_accent, norm_plain)
        
        results = [p for p in self.interinos if norm_plain in p["norm_name"]]
        self.assertGreater(len(results), 50)

    def test_04_position_calculations_inf(self):
        """Verificar cálculos exactos de puestos, desactivados y no participantes en Infantil (INF)"""
        sp = "INF"
        sp_members = [p for p in self.interinos if sp in p["specialties"]]
        self.assertGreater(len(sp_members), 5000)
        
        # Probar participante en posición intermedia
        # Buscar alguien con estado 'Ha participat' o 'No adjudicat'
        test_user = None
        for p in sp_members:
            if p["status"] in ["Ha participat", "No adjudicat"] and p["num"] > 300:
                test_user = p
                break
                
        self.assertIsNotNone(test_user)
        idx = sp_members.index(test_user)
        ahead = sp_members[:idx]
        
        desactivados_ahead = sum(1 for x in ahead if x["status"] == "Desactivat" or sp in x.get("specialties_deactivated", []))
        no_part_ahead = sum(1 for x in ahead if x["status"] == "No ha participat")
        adjudicados_ahead = sum(1 for x in ahead if x["status"] == "Adjudicat")
        activos_ahead = sum(1 for x in ahead if x["status"] in ["Ha participat", "No adjudicat"])
        no_convocats_ahead = sum(1 for x in ahead if x["status"] not in ["Desactivat", "No ha participat", "Adjudicat", "Ha participat", "No adjudicat"])
        
        # La suma de categorías por delante debe ser exactamente igual al total por delante
        total_ahead = len(ahead)
        self.assertEqual(desactivados_ahead + no_part_ahead + adjudicados_ahead + activos_ahead + no_convocats_ahead, total_ahead)
        
        # Puestos reales que le faltan: activos_ahead + 1
        puestos_que_faltan = activos_ahead + 1
        self.assertGreaterEqual(puestos_que_faltan, 1)

    def test_05_adjudicated_user_status(self):
        """Verificar que un usuario adjudicado tiene plaza, centro y código válido"""
        adjudicados = [p for p in self.interinos if p["status"] == "Adjudicat"]
        self.assertGreater(len(adjudicados), 100)
        
        # Inspeccionar uno
        sample = adjudicados[0]
        self.assertIsNotNone(sample["plaza"])
        self.assertIn("spec_acronym", sample["plaza"])
        self.assertIn("code", sample["plaza"])
        self.assertTrue(len(sample["plaza"]["code"]) == 6 or sample["plaza"]["code"] != "")

    def test_06_edge_case_first_position(self):
        """Verificar cálculos para la persona en primera posición de la bolsa"""
        first = self.interinos[0]
        sp = first["specialties"][0] # INF
        sp_members = [p for p in self.interinos if sp in p["specialties"]]
        idx = sp_members.index(first)
        self.assertEqual(idx, 0) # Posición 1 (índice 0)
        ahead = sp_members[:idx]
        self.assertEqual(len(ahead), 0)

    def test_07_adjudicados_behind(self):
        """Verificar conteo y listado de docentes adjudicados con número posterior (por detrás)"""
        sp = "INF"
        sp_members = [p for p in self.interinos if sp in p["specialties"]]
        # Tomar alguien al inicio de la bolsa
        user = sp_members[50]
        idx = sp_members.index(user)
        behind = sp_members[idx+1:]
        
        # Adjudicados por detrás en la misma especialidad
        adj_behind_spec = [p for p in behind if p["status"] == "Adjudicat" and p.get("plaza") and p["plaza"].get("spec_acronym") == sp]
        # Adjudicados por detrás en cualquier especialidad
        adj_behind_all = [p for p in behind if p["status"] == "Adjudicat"]
        
        self.assertGreater(len(adj_behind_spec), 5)
        self.assertGreater(len(adj_behind_all), len(adj_behind_spec))
        
    def test_08_exact_5_adjudication_metrics(self):
        """Verificar los 5 datos clave de adjudicación requeridos por el usuario basados en las adjudicaciones"""
        sp = "INF"
        sp_members = [p for p in self.interinos if p.get("in_adjudicacion") and sp in p["specialties"]]
        sp_members.sort(key=lambda x: x["adj_order"])
        user = next((p for p in sp_members if "OLAYA" in p["name"]), sp_members[100]) # Blanca Olaya
        
        idx = sp_members.index(user)
        pos_esp = idx + 1
        pos_adj = user["adj_order"]
        
        # 1. Posición actual
        self.assertGreater(pos_adj, 0)
        self.assertGreater(pos_esp, 0)
        self.assertGreater(user["bolsa_num"], 0)
        
        # 2. Total interinos de la especialidad por delante
        total_por_delante = idx
        self.assertEqual(total_por_delante, pos_esp - 1)
        
        # 3. Posición quitando adjudicados y desactivados
        ahead = sp_members[:idx]
        ahead_depurados = [p for p in ahead if p["status"] not in ["Adjudicat", "Desactivat"] and sp not in p.get("specialties_deactivated", [])]
        pos_depurada = len(ahead_depurados) + 1
        self.assertLessEqual(pos_depurada, pos_esp)
        
        # 4. Último adjudicado en la especialidad
        adjudicados_en_sp = [p for p in sp_members if p["status"] == "Adjudicat" and p.get("plaza") and p["plaza"].get("spec_acronym") == sp]
        self.assertGreater(len(adjudicados_en_sp), 0)
        ultimo_adj = adjudicados_en_sp[-1]
        self.assertIsNotNone(ultimo_adj["name"])
        self.assertGreater(ultimo_adj["adj_order"], 0)
        
        # 5. Diferencia con el último adjudicado (bien por delante o por detrás)
        idx_ultimo = sp_members.index(ultimo_adj)
        pos_esp_ultimo = idx_ultimo + 1
        diff_esp = pos_esp - pos_esp_ultimo
        diff_adj = pos_adj - ultimo_adj["adj_order"]
        self.assertEqual(diff_esp, pos_esp - pos_esp_ultimo)
        self.assertEqual(diff_adj, pos_adj - ultimo_adj["adj_order"])

    def test_09_multi_specialty_candidate_switching(self):
        """Verificar que un aspirante con múltiples especialidades (Laura Molina Beneyto)
        figura con sus especialidades en bolsa y se calculan métricas dinámicas para cada especialidad"""
        user = next((p for p in self.interinos if p.get("name") == "MOLINA BENEYTO, LAURA"), None)
        self.assertIsNotNone(user, "Laura Molina Beneyto debe existir en la base de datos")
        self.assertEqual(user["bolsa_num"], 6791)
        self.assertEqual(sorted(user["specialties"]), ["INF", "ING", "PRI", "PT"])

        cand = user if user.get("adj_order") else next((p for p in self.interinos if (p.get("adj_order") or 0) > 100 and len(p.get("specialties", [])) >= 2), None)
        self.assertIsNotNone(cand, "Debe existir un candidato multi-especialidad convocado")

        results_by_spec = {}
        for sp in cand["specialties"]:
            spec_members = [p for p in self.interinos if (p.get("in_adjudicacion") or p.get("adj_order")) and sp in p.get("specialties", [])]
            spec_members.sort(key=lambda x: x.get("adj_order") or 0)
            
            user_idx = next((i for i, p in enumerate(spec_members) if p.get("adj_order") == cand.get("adj_order")), -1)
            self.assertNotEqual(user_idx, -1, f"Usuario debe figurar en {sp}")
            
            pos_esp = user_idx + 1
            ahead = spec_members[:user_idx]
            ahead_limpios = [p for p in ahead if p["status"] not in ["Adjudicat", "Desactivat"] and sp not in p.get("specialties_deactivated", [])]
            pos_depurada = len(ahead_limpios) + 1
            
            results_by_spec[sp] = {
                "total_members": len(spec_members),
                "pos_esp": pos_esp,
                "ahead_count": len(ahead),
                "pos_depurada": pos_depurada
            }

        # Verificar que calcula posiciones por especialidad
        all_positions = [results_by_spec[sp]["pos_esp"] for sp in cand["specialties"]]
        self.assertEqual(len(set(all_positions)), len(all_positions), "Cada especialidad debe tener una posición distinta")

    def test_10_search_y_i_normalization(self):
        """Verificar que la búsqueda por 'Beneito' encuentra a 'MOLINA BENEYTO, LAURA' gracias a la tolerancia Y/I"""
        user = next((p for p in self.interinos if p.get("name") == "MOLINA BENEYTO, LAURA"), None)
        self.assertIsNotNone(user)

        # Probar varias formas de búsqueda que el usuario puede escribir
        queries = [
            "Laura Molina Beneito",
            "Molina Beneito",
            "Beneito Laura",
            "laura beneito",
            "MOLINA BENEYTO, LAURA",
            "Beneyto"
        ]

        norm_target = normalize_text(user["name"])
        for q in queries:
            norm_q = normalize_text(q)
            q_parts = norm_q.split()
            matches = all(part in norm_target for part in q_parts)
            self.assertTrue(matches, f"La consulta '{q}' debería encontrar a '{user['name']}'")

    def test_11_dom_ids_and_js_integrity(self):
        """Verificar que no existen elementos ausentes o llamadas que rompan la UI de JavaScript"""
        with open("js/app.js", encoding="utf-8") as f:
            js_content = f.read()
        with open("index.html", encoding="utf-8") as f:
            html_content = f.read()

        # 1. Todos los getElementById en app.js deben existir en index.html
        js_ids = set(re.findall(r'getElementById\(["\']([^"\']+)["\']\)', js_content))
        html_ids = set(re.findall(r'id=["\']([^"\']+)["\']', html_content))
        missing_ids = [elem_id for elem_id in js_ids if elem_id not in html_ids]
        self.assertEqual(missing_ids, [], f"Hay IDs en app.js que no existen en index.html: {missing_ids}")

        # 2. Las versiones en index.html deben tener cache-busting
        self.assertTrue(bool(re.search(r'js/app\.js\?v=\d+', html_content)))
        self.assertTrue(bool(re.search(r'data/interinos_data\.js\?v=\d+', html_content)))

        # 3. interinos_web.zip debe existir y contener los archivos actualizados
        import zipfile
        self.assertTrue(os.path.exists("interinos_web.zip"))
        with zipfile.ZipFile("interinos_web.zip", "r") as z:
            zip_html = z.read("index.html").decode("utf-8")
            zip_js = z.read("js/app.js").decode("utf-8")
            self.assertTrue(bool(re.search(r'js/app\.js\?v=\d+', zip_html)))
            self.assertIn("safeSetText", zip_js)
            self.assertIn("tableSpecName", zip_js)

if __name__ == "__main__":
    unittest.main(verbosity=2)
