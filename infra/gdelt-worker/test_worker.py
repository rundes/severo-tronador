"""Tests puros del worker de GDELT. Correr: python infra/gdelt-worker/test_worker.py"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))

from worker import build_query, build_url, parse_seendate, to_rows  # noqa: E402


class BuildQueryTests(unittest.TestCase):
    def test_paridad_con_gdelt_ts(self):
        # Mismo formato que lib/connectors/gdelt.ts: frases entre comillas,
        # paréntesis si hay más de un término, sourcelang:spa para AR.
        q = build_query(["Transporte", "islas de ibicuy", "Entre Rios"], "Ibicuy", "AR")
        self.assertEqual(q, '(Transporte OR "islas de ibicuy" OR "Entre Rios") sourcelang:spa')

    def test_un_solo_termino_sin_parentesis(self):
        self.assertEqual(build_query(["Ibicuy"], None, "UY"), "Ibicuy")

    def test_cae_a_zona_sin_keywords(self):
        self.assertEqual(build_query([], "Maipú", "AR"), "Maipú sourcelang:spa")

    def test_sin_terminos_devuelve_none(self):
        self.assertIsNone(build_query([], "", "AR"))
        self.assertIsNone(build_query(["  "], None, None))

    def test_url_incluye_sourcecountry(self):
        url = build_url("Ibicuy", "AR")
        self.assertIn("sourcecountry=ar", url)
        self.assertIn("timespan=24h", url)
        self.assertIn("format=json", url)


class RowsTests(unittest.TestCase):
    def test_parse_seendate(self):
        self.assertEqual(parse_seendate("20260824T120000Z"), "2026-08-24T12:00:00+00:00")
        self.assertIsNone(parse_seendate("garbage"))
        self.assertIsNone(parse_seendate(None))

    def test_to_rows_dedupe_y_shape(self):
        arts = [
            {"title": "Crecida", "url": "https://d/1", "domain": "d.ar", "seendate": "20260824T120000Z"},
            {"title": "Crecida bis", "url": "https://d/1", "domain": "d.ar"},
            {"title": "", "url": "https://d/2", "domain": "d.ar"},
            {"title": "Sin url", "url": "", "domain": "d.ar"},
        ]
        rows = to_rows("p1", arts)
        self.assertEqual(len(rows), 1)
        self.assertEqual(
            rows[0],
            {
                "project_id": "p1",
                "connector_id": "gdelt",
                "source": "d.ar",
                "text": "Crecida",
                "url": "https://d/1",
                "published_at": "2026-08-24T12:00:00+00:00",
                "author": "d.ar",
                "kind": "post",
            },
        )


if __name__ == "__main__":
    unittest.main()
