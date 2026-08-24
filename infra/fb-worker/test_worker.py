"""Tests de limpieza de texto del worker. Correr: python -m pytest infra/fb-worker
(o python infra/fb-worker/test_worker.py). No requiere red ni Playwright."""
import os
import sys
import types
import unittest

# worker.py lee env y importa httpx/playwright al cargar; acá se stubbean para
# testear las funciones puras sin instalar el browser.
os.environ.setdefault("SUPABASE_URL", "http://x")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "k")
for name in ("httpx", "playwright", "playwright.sync_api"):
    sys.modules.setdefault(name, types.ModuleType(name))
sys.modules["playwright.sync_api"].TimeoutError = Exception
sys.modules["playwright.sync_api"].sync_playwright = None
sys.path.insert(0, os.path.dirname(__file__))

from worker import _is_deferred_href, clean_text  # noqa: E402


class DeferredHrefTests(unittest.TestCase):
    def test_tracking_only_query_is_deferred(self):
        self.assertTrue(_is_deferred_href("?__cft__[0]=AZbT&__tn__=%2CO%2CP-R#?jfb"))
        self.assertTrue(_is_deferred_href(""))
        self.assertTrue(_is_deferred_href("#"))

    def test_real_permalinks_are_not_deferred(self):
        self.assertFalse(_is_deferred_href("/municipalidad.ibicuyof/posts/pfbid0abc"))
        self.assertFalse(_is_deferred_href("https://www.facebook.com/photo/?fbid=1&set=a.2"))
        self.assertFalse(_is_deferred_href("/friends/"))


class CleanTextTests(unittest.TestCase):
    def test_strips_ui_tail_followed_by_reaction_count(self):
        self.assertEqual(
            clean_text("Gabino: historia viva de nuestro pueblo!!!! 1w Like Reply See translation 5"),
            "Gabino: historia viva de nuestro pueblo!!!!",
        )

    def test_strips_year_timestamp(self):
        self.assertEqual(
            clean_text("Muy lindo quedo 2y Like Reply See translation 1"),
            "Muy lindo quedo",
        )

    def test_strips_see_more_before_tail(self):
        self.assertEqual(
            clean_text("tengo fotos pero en la cabeza y fam… See more 2w Like Reply See translation 1"),
            "tengo fotos pero en la cabeza y fam…",
        )

    def test_keeps_legit_trailing_number(self):
        self.assertEqual(clean_text("Gran fiesta 2026"), "Gran fiesta 2026")
        self.assertEqual(clean_text("Faltan 12"), "Faltan 12")

    def test_spanish_ui_tail(self):
        self.assertEqual(
            clean_text("Excelente gestión 3 sem Me gusta Responder Ver traducción 12"),
            "Excelente gestión",
        )


if __name__ == "__main__":
    unittest.main()
