"""Test di scripts/piano.py e scripts/build_dati.py.

Usano i dati di esempio in sito/esempio/ (si rigenerano con scripts/crea_esempio.py).
"""

import copy
import json
import sys
import unittest
from pathlib import Path

RADICE = Path(__file__).resolve().parent.parent
ESEMPIO = RADICE / "sito" / "esempio"
sys.path.insert(0, str(RADICE / "scripts"))

import build_dati as B  # noqa: E402
import piano as P  # noqa: E402


class PianoTest(unittest.TestCase):
    def setUp(self):
        self.piano = P.carica(ESEMPIO / "piano.json")

    def test_piano_valido(self):
        self.assertEqual(P.controlla(self.piano), ([], []))

    def test_espandi(self):
        x = P.espandi(self.piano)
        self.assertEqual(x["totale_corse"], 36)
        self.assertEqual(len(x["settimane"]), 12)
        km = {w["settimana"]: w["distanza_m"] for w in x["settimane"]}
        self.assertEqual((km[1], km[5], km[9], km[12]), (14000, 20000, 23000, 19000))
        s = next(s for s in x["sedute"] if s["id"] == "w9s3")
        self.assertEqual((s["giorno"], s["fase"], s["numero_piano"]), ("Gio", 2, 26))

    def test_corsa_tolta_le_successive_scalano(self):
        p = copy.deepcopy(self.piano)
        p["sedute"] = [s for s in p["sedute"] if s["id"] != "w1s3"]  # corsa 2
        x = P.espandi(p)
        self.assertEqual(x["totale_corse"], 35)
        self.assertEqual(next(s for s in x["sedute"] if s["id"] == "w2s1")["numero_piano"], 3)

    def _errori(self, modifica):
        p = copy.deepcopy(self.piano)
        modifica(p)
        return P.controlla(p)[0]

    def test_campi_ricavati_non_aggiornati(self):
        # sposto una seduta senza ricalcolare: il giorno resta quello vecchio
        errori = self._errori(lambda p: p["sedute"][0].update(data="2027-01-05"))
        self.assertTrue(any("non aggiornati" in e for e in errori))

    def test_aggiornato_e_stabile(self):
        self.assertEqual(P.espandi(self.piano), self.piano)

    def test_id_duplicato(self):
        self.assertTrue(self._errori(lambda p: p["sedute"][1].update(id=p["sedute"][0]["id"])))

    def test_corsa_senza_distanza(self):
        self.assertTrue(self._errori(lambda p: p["sedute"][0].update(distanza_m=None)))

    def test_tipo_sconosciuto(self):
        self.assertTrue(self._errori(lambda p: p["sedute"][0].update(tipo="nuoto")))

    def test_ritmo_invertito(self):
        self.assertTrue(self._errori(lambda p: p["fasi"][0]["ritmi"]["facile_lungo"].update(min="7:30")))

    def _seduta(self, p, id):
        return next(s for s in p["sedute"] if s["id"] == id)

    def test_ritmo_resta_e_solo_dove_c_e(self):
        x = P.espandi(self.piano)
        self.assertEqual(self._seduta(x, "w7s3")["ritmo"], "ripetute")
        self.assertNotIn("ritmo", self._seduta(x, "w6s3"))  # qualità senza ritmo

    def test_ritmo_non_valido(self):
        errori = self._errori(lambda p: self._seduta(p, "w5s3").update(ritmo="facile_lungo"))
        self.assertEqual(errori, ["w5s3: ritmo 'facile_lungo' non valido"])

    def test_ritmo_su_una_corsa_facile(self):
        errori = self._errori(lambda p: self._seduta(p, "w5s1").update(ritmo="soglia"))
        self.assertEqual(errori, ["w5s1: solo qualità, test e gara hanno un ritmo"])

    def test_ritmo_che_la_fase_non_ha(self):
        # w10s3 è in fase 3, che non ha le ripetute; w2s3 in fase 1, che non ha la soglia
        errori = self._errori(lambda p: (self._seduta(p, "w10s3").update(ritmo="ripetute"),
                                         self._seduta(p, "w2s3").update(tipo="qualita", ritmo="soglia")))
        self.assertEqual(errori, ["w2s3: la fase 1 non ha il ritmo soglia", "w10s3: la fase 3 non ha il ritmo ripetute"])

    def test_buco_tra_fasi(self):
        self.assertTrue(self._errori(lambda p: p["fasi"][1].update(settimane=[6, 9])))

    def _avvisi(self, id, data):
        p = copy.deepcopy(self.piano)
        next(s for s in p["sedute"] if s["id"] == id)["data"] = data
        errori, avvisi = P.controlla(P.espandi(p))
        self.assertEqual(errori, [])
        return avvisi

    def test_qualita_dopo_gioco_di_squadra(self):
        # w5s3 è la qualità di giovedì 4 febbraio: sposto il gioco di squadra a mercoledì
        self.assertEqual(len(self._avvisi("w5s2", "2027-02-03")), 1)

    def test_qualita_attaccata_al_lungo(self):
        # sposto la qualità a sabato, il giorno prima del lungo
        self.assertEqual(len(self._avvisi("w5s3", "2027-02-06")), 1)


def attivita(data, nome, km=5):
    return {"data": data, "nome": nome, "numero_piano": B.numero_piano(nome),
            "distanza_m": km * 1000, "origine": "strava"}


class CollegaTest(unittest.TestCase):
    def setUp(self):
        self.piano = P.carica(ESEMPIO / "piano.json")

    def test_collega_su_numero_piano(self):
        a = [attivita("2027-01-04", "1/36"), attivita("2027-01-05", "Gioco di squadra"),
             attivita("2027-01-15", "5/36")]  # corsa del giovedì fatta venerdì: stessa settimana
        coppie, errori, avvisi = P.collega(self.piano, a)
        self.assertEqual([(s["numero_piano"], s["data"], x["data"]) for s, x in coppie],
                         [(1, "2027-01-04", "2027-01-04"), (5, "2027-01-14", "2027-01-15")])
        self.assertEqual(errori, [])
        self.assertEqual(len(avvisi), 3)  # corse 2, 3 e 4 senza attività

    def test_numero_doppio_o_fuori_piano(self):
        a = [attivita("2027-01-04", "1/36"), attivita("2027-01-05", "1/36"),
             attivita("2027-03-20", "37/36")]
        _, errori, _ = P.collega(self.piano, a)
        self.assertEqual(len(errori), 2)

    def test_fuori_settimana(self):
        _, _, avvisi = P.collega(self.piano, [attivita("2027-01-12", "1/36")])
        self.assertTrue(any("fuori dalla settimana" in x for x in avvisi))

    def test_esempio(self):
        with (ESEMPIO / "attivita.json").open(encoding="utf-8") as f:
            coppie, errori, avvisi = P.collega(self.piano, json.load(f))
        self.assertEqual((len(coppie), errori, len(avvisi)), (15, [], 1))


class BuildDatiTest(unittest.TestCase):
    def test_numero_piano_dal_titolo(self):
        self.assertEqual(B.numero_piano("10/36 lungo"), 10)
        self.assertIsNone(B.numero_piano("Corsa del mattino"))

    def test_secondi(self):
        self.assertEqual((B.secondi("1:02:03"), B.secondi("27:00"), B.secondi("")), (3723, 1620, None))


if __name__ == "__main__":
    unittest.main()
