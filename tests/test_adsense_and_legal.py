import unittest
import os
import zipfile

class TestAdSenseAndLegalCompliance(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    def test_ads_txt_exists_and_valid(self):
        """Verificar que ads.txt existe y contiene directivas de Google"""
        path = os.path.join(self.base_dir, "ads.txt")
        self.assertTrue(os.path.exists(path), "ads.txt debe existir en la raíz")
        with open(path, "r", encoding="utf-8") as f:
            content = f.read()
        self.assertIn("google.com", content)
        self.assertIn("pub-7842650272336816", content)
        self.assertIn("DIRECT", content)
        self.assertIn("f08c47fec0942fa0", content)

    def test_privacidad_page_exists_and_compliant(self):
        """Verificar que la página de Política de Privacidad y Cookies existe y cumple con RGPD y AdSense"""
        path = os.path.join(self.base_dir, "privacidad.html")
        self.assertTrue(os.path.exists(path), "privacidad.html debe existir")
        with open(path, "r", encoding="utf-8") as f:
            content = f.read()
        self.assertIn("Aviso Legal", content)
        self.assertIn("Google AdSense", content)
        self.assertIn("Política de Cookies", content)
        self.assertIn("RGPD", content)

    def test_index_html_has_ads_and_cookie_banner(self):
        """Verificar que index.html tiene los slots publicitarios y el banner de cookies"""
        path = os.path.join(self.base_dir, "index.html")
        with open(path, "r", encoding="utf-8") as f:
            content = f.read()
        self.assertIn("ca-pub-7842650272336816", content)
        self.assertIn("adsbygoogle", content)
        self.assertIn("adTopBanner", content)
        self.assertIn("adMiddleBanner", content)
        self.assertIn("adBottomBanner", content)
        self.assertIn("cookieBanner", content)
        self.assertIn("privacidad.html", content)

    def test_zip_contains_adsense_files(self):
        """Verificar que el paquete comprimido de distribución incluye ads.txt y privacidad.html"""
        path = os.path.join(self.base_dir, "interinos_web.zip")
        self.assertTrue(os.path.exists(path))
        with zipfile.ZipFile(path, "r") as z:
            names = z.namelist()
            self.assertIn("ads.txt", names)
            self.assertIn("privacidad.html", names)
            self.assertIn("index.html", names)

    def test_google_analytics_configured(self):
        """Verificar que Google Analytics 4 (G-SM4D94ZE4M) está configurado en index.html y privacidad.html"""
        with open(os.path.join(self.base_dir, "index.html"), "r", encoding="utf-8") as f:
            index_content = f.read()
        self.assertIn("G-SM4D94ZE4M", index_content)
        self.assertIn("googletagmanager.com/gtag/js?id=G-SM4D94ZE4M", index_content)

        with open(os.path.join(self.base_dir, "privacidad.html"), "r", encoding="utf-8") as f:
            priv_content = f.read()
        self.assertIn("G-SM4D94ZE4M", priv_content)
        self.assertIn("Google Analytics 4", priv_content)

if __name__ == "__main__":
    unittest.main()
