import unittest
import urllib.request
import threading
import time
import os
import socketserver
import http.server

class TestServerAndEndpoints(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        os.chdir(base_dir)
        
        cls.port = 8899
        handler = http.server.SimpleHTTPRequestHandler
        cls.httpd = socketserver.TCPServer(("", cls.port), handler)
        cls.server_thread = threading.Thread(target=cls.httpd.serve_forever)
        cls.server_thread.daemon = True
        cls.server_thread.start()
        time.sleep(0.3)

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()

    def test_get_index(self):
        url = f"http://localhost:{self.port}/index.html"
        with urllib.request.urlopen(url) as response:
            self.assertEqual(response.status, 200)
            content = response.read().decode('utf-8')
            self.assertIn("Localizador de Interinos", content)
            self.assertIn("searchInput", content)

    def test_get_stats_summary(self):
        url = f"http://localhost:{self.port}/data/stats_summary.json"
        with urllib.request.urlopen(url) as response:
            self.assertEqual(response.status, 200)
            content = response.read().decode('utf-8')
            self.assertIn("Educación Infantil", content)
            self.assertIn("Educación Primaria", content)

    def test_get_js_and_css(self):
        for path in ["/css/style.css", "/js/app.js"]:
            url = f"http://localhost:{self.port}{path}"
            with urllib.request.urlopen(url) as response:
                self.assertEqual(response.status, 200)
                self.assertGreater(len(response.read()), 100)

if __name__ == "__main__":
    unittest.main(verbosity=2)
