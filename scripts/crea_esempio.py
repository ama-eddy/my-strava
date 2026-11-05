"""Crea i dati di esempio in sito/esempio/: un piano finto di 12 settimane per una 10 km
e le attività fino a metà della settimana 11, con qualche seduta spostata, saltata o in più.
Le corse hanno i giri di Strava (uno per km); i due test sui 5 km hanno riscaldamento e
defaticamento, così il report deve trovare il tratto del test.

Servono per provare le pagine senza dati propri e come base dei test. Si rigenerano con:
    python3 scripts/crea_esempio.py
"""

import datetime as dt
import json
import random
import sys
from pathlib import Path

QUI = Path(__file__).resolve().parent
sys.path.insert(0, str(QUI))
import build_dati as B  # noqa: E402
import piano as P  # noqa: E402

OUT = QUI.parent / "sito" / "esempio"
INIZIO = dt.date(2027, 1, 4)  # lunedì
OGGI = dt.date(2027, 3, 17)  # il giorno in cui si guarda l'esempio: mercoledì della settimana 11

FASI = [
    {"fase": 1, "nome": "Fase 1 · La base", "periodo": "gennaio", "settimane": [1, 4],
     "obiettivo": "Tre uscite a settimana, tutte lente. Il lungo arriva a 8 km.",
     "ritmi": {"facile_lungo": {"min": "6:40", "max": "7:10"}, "soglia": None, "ripetute": None, "gara": None}},
    {"fase": 2, "nome": "Fase 2 · Cambi di ritmo", "periodo": "febbraio", "settimane": [5, 9],
     "obiettivo": "Il giovedì arrivano soglia e ripetute. A metà fase un test sui 5 km.",
     "ritmi": {"facile_lungo": {"min": "6:30", "max": "7:00"},
               "soglia": {"min": "5:50", "max": "6:00", "nota": "medio"},
               "ripetute": {"min": "5:25", "max": "5:35", "nota": "1000 m"}, "gara": None}},
    {"fase": 3, "nome": "Fase 3 · Verso la gara", "periodo": "marzo", "settimane": [10, 12],
     "obiettivo": "Meno volume e più ritmo gara. L'ultima settimana è di scarico.",
     "ritmi": {"facile_lungo": {"min": "6:30", "max": "7:00"},
               "soglia": {"min": "5:50", "max": "6:00", "nota": "medio"}, "ripetute": None,
               "gara": {"min": "5:40", "max": "5:45"}}},
]
TIPO = {4: "scarico", 6: "test", 8: "scarico", 10: "test", 12: "gara"}
NOTA = {1: "Ritmo da conversazione, anche se ti sembra lentissimo.",
        6: "Domenica il test: 5 km a tutta, dopo 2 km di riscaldamento.",
        10: "Domenica il secondo test sui 5 km: si vede quanto sei migliorato."}
# km di lunedì (facile), giovedì (facile o qualità) e domenica (lungo, test o gara)
KM = {1: (4, 4, 6), 2: (4, 4.5, 7), 3: (4.5, 5, 8), 4: (4, 4, 6), 5: (5, 6, 9), 6: (5, 5, 5),
      7: (5, 6, 10), 8: (4, 5, 7), 9: (5, 7, 11), 10: (5, 7, 5), 11: (5, 6, 12), 12: (4, 5, 10)}
# qualità del giovedì: descrizione e ritmo della fase che vale (None: nessuno)
QUALITA = {5: ("6 km con 3 km a ritmo medio", "soglia"), 6: ("5 km con 5 allunghi", None),
           7: ("6 km con 5 × 1000 m", "ripetute"), 8: ("5 km con 2 km a ritmo medio", "soglia"),
           9: ("7 km con 6 × 1000 m", "ripetute"), 10: ("7 km con 4 km a ritmo gara", "gara"),
           11: ("6 km con 3 km a ritmo gara", "gara"), 12: ("5 km con 2 km a ritmo gara", "gara")}


def km(x):
    return f"{x:g}".replace(".", ",")


def piano():
    sedute = []
    for n in range(1, 13):
        lun = INIZIO + dt.timedelta(weeks=n - 1)
        f, q, d = KM[n]
        giorni = [
            (0, "facile", f"{km(f)} km facili", f),
            (1, "volley", "Gioco di squadra", None),
            (3, "qualita" if n in QUALITA else "facile", QUALITA.get(n, (f"{km(q)} km facili con allunghi",))[0], q),
            (4, "forza", "Forza, 45 minuti" if n not in TIPO else "Forza leggera, 30 minuti", None),
            (6, *{6: ("test", "Test 5 km"), 10: ("test", "Test 5 km"), 12: ("gara", "Gara di 10 km")}.get(n, ("lungo", f"Lungo di {km(d)} km")), d),
        ]
        if n == 12:  # niente forza a due giorni dalla gara: mobilità
            giorni[3] = (4, "mobilita", "Mobilità, 20 minuti", None)
        for k, (g, tipo, descrizione, distanza) in enumerate(giorni, 1):
            seduta = {"id": f"w{n}s{k}", "data": (lun + dt.timedelta(days=g)).isoformat(), "tipo": tipo,
                      "descrizione": descrizione, "distanza_m": round(distanza * 1000) if distanza else None}
            if tipo == "qualita" and QUALITA[n][1]:
                seduta["ritmo"] = QUALITA[n][1]
            sedute.append(seduta)
    base = {
        "versione": 1,
        "inizio": INIZIO.isoformat(),
        "gara": {"nome": "Gara di 10 km", "data": "2027-03-28", "distanza_m": 10000,
                 "obiettivo_tempo": "57:00", "obiettivo_ritmo": "5:42"},
        "fasi": FASI,
        "settimane": [{"settimana": n, "tipo": TIPO.get(n), "nota": NOTA.get(n)} for n in range(1, 13)],
        "sedute": sedute,
        "settimana_tipo": [
            {"giorno": "Lun", "attivita": "Corsa facile", "nota": "Recupero dal lungo"},
            {"giorno": "Mar", "attivita": "Gioco di squadra", "nota": "La sera"},
            {"giorno": "Mer", "attivita": "Riposo", "nota": None},
            {"giorno": "Gio", "attivita": "Qualità", "nota": "In fase 1: corsa facile con allunghi"},
            {"giorno": "Ven", "attivita": "Forza", "nota": "45 minuti"},
            {"giorno": "Sab", "attivita": "Riposo", "nota": None},
            {"giorno": "Dom", "attivita": "Lungo", "nota": "Oppure test o gara"},
        ],
        "regole": [
            {"titolo": "Facile vuol dire che parli", "testo": "Se non riesci a dire una frase intera, rallenta."},
            {"titolo": "Una seduta saltata non si recupera", "testo": "Riparti dalla successiva."},
        ],
    }
    return P.espandi(base)


def attivita(p):
    caso = random.Random(7)
    sport = {"volley": "Volleyball", "forza": "Workout", "mobilita": "Yoga"}
    fatte = []
    for s in p["sedute"]:
        d = dt.date.fromisoformat(s["data"])
        if d >= OGGI:
            continue
        if s["id"] in {"w5s5", "w5s2"}:  # settimana 5: lungo e gioco di squadra saltati
            continue
        if s["id"] == "w3s3":  # corsa del giovedì fatta venerdì
            d += dt.timedelta(days=1)
        if s["corsa"]:
            nome, tipo = f"{s['numero_piano']}/{p['totale_corse']}", "Run"
            if s["tipo"] == "test":  # 2 km di riscaldamento, il test, 1 km di defaticamento
                ritmo_test = TEST[s["id"]]
                tratti = [(2000, 415), (s["distanza_m"], ritmo_test), (1000, 425)]
            else:
                ritmo = {"qualita": 372}.get(s["tipo"], 410) + caso.randint(-25, 15)
                tratti = [(s["distanza_m"] + caso.randint(-150, 250), ritmo)]
            giri = [g for m, r in tratti for g in giri_di(m, r, caso)]
        else:
            nome, tipo, giri = s["descrizione"], sport[s["tipo"]], None
        fatte.append((d, nome, tipo, giri))
    fatte.append((dt.date(2027, 1, 30), "Passeggiata", "Walk", [{"distance": 5200, "moving_time": 3588}]))  # in più
    out = []
    for i, (d, nome, tipo, giri) in enumerate(sorted(fatte, key=lambda x: x[0]), 1):
        if giri:
            distanza = sum(g["distance"] for g in giri)
            tempo = sum(g["moving_time"] for g in giri)
        else:
            distanza, tempo = None, 3600 if tipo == "Volleyball" else 2700
        a = B.attivita(1000 + i, d.isoformat(), "18:30", nome, tipo, distanza, tempo,
                       tempo + 60, 20 if distanza else None, None, None, giri if tipo == "Run" else None)
        out.append(a)
    return out


# Ritmo dei due test sui 5 km, in secondi al km: il secondo è più veloce.
TEST = {"w6s5": 332, "w10s5": 320}


def giri_di(metri, ritmo, caso):
    """Giri da 1 km (l'ultimo è il resto) al ritmo dato, con qualche secondo di variazione."""
    giri = []
    while metri > 0:
        m = min(1000, metri)
        if m >= 100:
            giri.append({"distance": m, "moving_time": round(m / 1000 * (ritmo + caso.randint(-4, 4)))})
        metri -= m
    return giri


def scrivi(nome, dati):
    with (OUT / nome).open("w", encoding="utf-8", newline="\n") as f:
        json.dump(dati, f, ensure_ascii=False, indent=2)
        f.write("\n")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    p = piano()
    errori, avvisi = P.controlla(p)
    if errori or avvisi:
        sys.exit(f"Piano di esempio non valido: {errori + avvisi}")
    scrivi("piano.json", p)
    scrivi("attivita.json", attivita(p))
    print(f"Esempio in {OUT}: {len(p['sedute'])} sedute, {p['totale_corse']} corse")


if __name__ == "__main__":
    main()
