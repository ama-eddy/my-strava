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
            "distanza_m": km * 1000}


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
        self.assertEqual((len(coppie), errori, len(avvisi)), (30, [], 1))


class BuildDatiTest(unittest.TestCase):
    def test_numero_piano_dal_titolo(self):
        self.assertEqual(B.numero_piano("10/36 lungo"), 10)
        self.assertIsNone(B.numero_piano("Corsa del mattino"))

    def test_giri(self):
        laps = [{"distance": 1000.4, "moving_time": 330}, {"distance": 500, "moving_time": 170}]
        self.assertEqual(B.giri(laps), [{"distanza_m": 1000, "tempo_s": 330, "ritmo_s_km": 330},
                                        {"distanza_m": 500, "tempo_s": 170, "ritmo_s_km": 340}])
        self.assertIsNone(B.giri(laps[:1]))  # un giro solo non dice niente di più
        self.assertIsNone(B.giri(None))

    def test_attivita_senza_giri_non_cambia(self):
        a = B.attivita(1, "2027-01-04", "18:00", "1/36", "Run", 5000, 2000, 2050, 10, None, None)
        self.assertNotIn("giri", a)


class SyncGiriTest(unittest.TestCase):
    def test_giri_delle_corse_cambiate_e_arretrati(self):
        import strava_sync as S
        corsa = lambda id, giorno, **x: {"id": id, "sport_type": "Run", "start_date": f"2027-01-{giorno:02d}T07:00:00Z", **x}
        db = {1: corsa(1, 1), 2: corsa(2, 2), 3: corsa(3, 3, laps=[]), 4: {**corsa(4, 4), "sport_type": "Volleyball"},
              5: corsa(5, 5)}
        chiesti = []
        n = S.aggiungi_giri(db, [db[5], db[4]], "token", scarica=lambda t, id: chiesti.append(id) or [{"lap_index": 1}],
                            arretrati=1)
        # la corsa cambiata (5) e la più recente senza giri (2); non il volley, non quella che li ha già
        self.assertEqual((n, chiesti), (2, [5, 2]))
        self.assertNotIn("laps", db[1])


class SyncCompletoTest(unittest.TestCase):
    def setUp(self):
        import strava_sync as S
        self.S = S
        self.corsa = lambda id, giorno, **x: {"id": id, "sport_type": "Run", "name": f"{id}/36",
                                              "start_date": f"2027-01-{giorno:02d}T07:00:00Z", **x}

    def test_inizio_sync(self):
        db = {1: self.corsa(1, 1), 2: self.corsa(2, 20)}
        self.assertEqual(self.S.inizio_sync({}), 0)
        self.assertEqual(self.S.inizio_sync(db, completo=True), 0)
        # due settimane prima dell'ultima attività (20 gennaio)
        self.assertEqual(self.S.inizio_sync(db), self.S.parse_date("2027-01-06T07:00:00Z").timestamp())

    def test_completo_non_riscarica_i_giri_vecchi(self):
        db = {1: self.corsa(1, 1, laps=[{"lap_index": 1}]), 2: self.corsa(2, 2), 3: self.corsa(3, 20, laps=[])}
        scaricate = [self.corsa(1, 1, kudos_count=3), self.corsa(2, 2, kudos_count=1),
                     self.corsa(3, 20, kudos_count=2), {**self.corsa(4, 3), "map": {"polyline": "x"}}]
        finestra = self.S.inizio_sync(db)
        new, updated, cambiate = self.S.unisci(db, scaricate, finestra)
        # la 1 è vecchia e ha già i giri: si aggiorna ma non li riscarica; la 2 non li ha;
        # la 3 è nelle due settimane; la 4, inserita in ritardo, è nuova e senza traccia GPS
        self.assertEqual((new, updated, [a["id"] for a in cambiate]), (1, 3, [2, 3, 4]))
        self.assertEqual((db[1]["kudos_count"], db[1]["laps"]), (3, [{"lap_index": 1}]))
        self.assertNotIn("map", db[4])


if __name__ == "__main__":
    unittest.main()
