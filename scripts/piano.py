"""Controllo del piano di allenamento e collegamento con le attività.

- data/piano.json è l'unica fonte del piano. Contiene i dati di base (sedute, settimane, fasi,
  gara, settimana tipo, regole) e i campi ricavati: giorno, settimana e fase di ogni seduta,
  date e km delle settimane, numero_piano delle corse e totale_corse.
- I campi ricavati si ricalcolano con `aggiorna` dopo ogni modifica; `controlla` dà errore se
  non sono aggiornati.
- numero_piano si conta sull'ordine delle corse: togliendo una corsa le successive scalano di uno.
  È la chiave che collega il piano a data/attivita.json.

Uso:
    python3 scripts/piano.py controlla   # valida il piano, esce con 1 se ci sono errori
    python3 scripts/piano.py aggiorna    # ricalcola i campi ricavati e riscrive data/piano.json
    python3 scripts/piano.py collega     # confronta le corse del piano con data/attivita.json
    python3 scripts/piano.py riepilogo   # km per fase e per settimana
"""

import datetime as dt
import json
import os
import re
import sys
from collections import Counter
from pathlib import Path

# Cartella dei dati: data/ nella cartella da cui si lancia lo script, o il percorso in STRAVA_DATI.
DATA = Path(os.environ.get("STRAVA_DATI", "data")).resolve()
PIANO = DATA / "piano.json"
ATTIVITA = DATA / "attivita.json"

TIPI_CORSA = {"facile", "qualita", "lungo", "test", "gara"}
TIPI_ALTRI = {"volley", "forza", "mobilita", "camminata", "trekking"}
TIPI_SEDUTA = TIPI_CORSA | TIPI_ALTRI
TIPI_SETTIMANA = {None, "scarico", "test", "gara"}
RITMI = ("facile_lungo", "soglia", "ripetute", "gara")
# Il campo facoltativo `ritmo` di una seduta: quale ritmo della fase vale per qualità, test e gara.
RITMI_SEDUTA = ("soglia", "ripetute", "gara")
TIPI_CON_RITMO = {"qualita", "test", "gara"}
GIORNI = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"]
RITMO = re.compile(r"^\d{1,2}:[0-5]\d$")


def carica(path=PIANO):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def secondi_km(ritmo):
    m, s = ritmo.split(":")
    return int(m) * 60 + int(s)


def _data(s):
    return dt.date.fromisoformat(s)


def settimana_di(piano, data):
    return (_data(data) - _data(piano["inizio"])).days // 7 + 1


def fase_di(piano, settimana):
    for f in piano["fasi"]:
        a, b = f["settimane"]
        if a <= settimana <= b:
            return f["fase"]
    return None


def salva(piano, path=PIANO):
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(piano, f, ensure_ascii=False, indent=2)
        f.write("\n")


def espandi(piano):
    """Il piano con i campi ricavati ricalcolati dai dati di base."""
    tipo_settimana = {w["settimana"]: w["tipo"] for w in piano["settimane"]}
    sedute = []
    numero = 0
    for s in sorted(piano["sedute"], key=lambda s: s["data"]):
        n = settimana_di(piano, s["data"])
        corsa = s["tipo"] in TIPI_CORSA
        if corsa:
            numero += 1
        seduta = {
            "id": s["id"],
            "data": s["data"],
            "giorno": GIORNI[_data(s["data"]).weekday()],
            "settimana": n,
            "fase": fase_di(piano, n),
            "tipo_settimana": tipo_settimana.get(n),
            "tipo": s["tipo"],
            "descrizione": s["descrizione"],
            "corsa": corsa,
            "numero_piano": numero if corsa else None,
            "distanza_m": s.get("distanza_m"),
        }
        if s.get("ritmo") is not None:  # solo se c'è, così i piani senza ritmo non cambiano
            seduta["ritmo"] = s["ritmo"]
        sedute.append(seduta)
    settimane = []
    for w in piano["settimane"]:
        n = w["settimana"]
        dal = _data(piano["inizio"]) + dt.timedelta(weeks=n - 1)
        settimane.append({
            "settimana": n,
            "fase": fase_di(piano, n),
            "tipo": w["tipo"],
            "dal": dal.isoformat(),
            "al": (dal + dt.timedelta(days=6)).isoformat(),
            "distanza_m": sum(s["distanza_m"] for s in sedute if s["corsa"] and s["settimana"] == n),
            "nota": w["nota"],
        })
    return {
        "versione": piano.get("versione", 1),
        "inizio": piano["inizio"],
        "gara": piano["gara"],
        "totale_corse": numero,
        "fasi": piano["fasi"],
        "settimane": settimane,
        "sedute": sedute,
        "settimana_tipo": piano.get("settimana_tipo", []),
        "regole": piano.get("regole", []),
    }


def controlla(piano):
    """Restituisce (errori, avvisi). Gli errori rendono il piano inutilizzabile,
    gli avvisi segnalano violazioni delle regole del piano stesso."""
    errori, avvisi = [], []
    err = errori.append

    for campo in ("inizio", "gara", "fasi", "settimane", "sedute"):
        if campo not in piano:
            err(f"manca il campo '{campo}'")
    if errori:
        return errori, avvisi

    try:
        inizio, gara = _data(piano["inizio"]), _data(piano["gara"]["data"])
    except (ValueError, KeyError) as e:
        return [f"date di inizio o gara non valide: {e}"], avvisi
    if inizio.weekday() != 0:
        err(f"inizio {piano['inizio']} non è un lunedì")
    if gara <= inizio:
        err("la gara è prima dell'inizio")
    r = piano["gara"].get("obiettivo_ritmo")
    if r is not None and not RITMO.match(r):
        err(f"gara.obiettivo_ritmo '{r}' non è nel formato m:ss")
    n_settimane = settimana_di(piano, piano["gara"]["data"])

    # Fasi: contigue e a copertura di tutte le settimane
    attesa = 1
    for i, f in enumerate(piano["fasi"], 1):
        if f.get("fase") != i:
            err(f"fase in posizione {i} ha numero {f.get('fase')}")
        a, b = f["settimane"]
        if a != attesa or b < a:
            err(f"fase {i}: settimane {a}–{b}, attesa partenza da {attesa}")
        attesa = b + 1
        for k in RITMI:
            r = f.get("ritmi", {}).get(k)
            if r is None:
                continue
            if not (RITMO.match(r.get("min", "")) and RITMO.match(r.get("max", ""))):
                err(f"fase {i}: ritmo {k} non nel formato m:ss")
            elif secondi_km(r["min"]) > secondi_km(r["max"]):
                err(f"fase {i}: ritmo {k} con min più lento di max")
    if attesa - 1 != n_settimane:
        err(f"le fasi coprono {attesa - 1} settimane, il piano ne ha {n_settimane}")

    # Settimane: una per ogni numero, in ordine
    if [w["settimana"] for w in piano["settimane"]] != list(range(1, n_settimane + 1)):
        err(f"le settimane devono essere 1..{n_settimane} in ordine")
    for w in piano["settimane"]:
        if w.get("tipo") not in TIPI_SETTIMANA:
            err(f"settimana {w['settimana']}: tipo '{w.get('tipo')}' non valido")

    # Sedute
    for i, n in Counter(s.get("id") for s in piano["sedute"]).items():
        if n > 1:
            err(f"id seduta duplicato: {i}")
    prec = ""
    for s in piano["sedute"]:
        sid = s.get("id", "?")
        try:
            d = _data(s["data"])
        except (ValueError, KeyError):
            err(f"{sid}: data non valida")
            continue
        if not inizio <= d <= gara:
            err(f"{sid}: data {s['data']} fuori dal piano")
        if s["data"] < prec:
            err(f"{sid}: sedute non in ordine di data")
        prec = s["data"]
        if s.get("tipo") not in TIPI_SEDUTA:
            err(f"{sid}: tipo '{s.get('tipo')}' non valido")
        if not s.get("descrizione"):
            err(f"{sid}: descrizione vuota")
        km = s.get("distanza_m")
        if s.get("tipo") in TIPI_CORSA:
            if not isinstance(km, int) or km <= 0:
                err(f"{sid}: una corsa deve avere distanza_m intera positiva")
        elif km is not None:
            err(f"{sid}: solo le corse hanno distanza_m")
        r = s.get("ritmo")
        if r is not None:
            n = fase_di(piano, settimana_di(piano, s["data"]))
            fase = next((f for f in piano["fasi"] if f.get("fase") == n), None)
            if s.get("tipo") not in TIPI_CON_RITMO:
                err(f"{sid}: solo qualità, test e gara hanno un ritmo")
            elif r not in RITMI_SEDUTA:
                err(f"{sid}: ritmo '{r}' non valido")
            elif fase is not None and not fase.get("ritmi", {}).get(r):
                err(f"{sid}: la fase {n} non ha il ritmo {r}")

    if not any(s["tipo"] == "gara" and s["data"] == piano["gara"]["data"] for s in piano["sedute"]):
        err(f"nessuna seduta di tipo gara il {piano['gara']['data']}")
    if errori:
        return errori, avvisi

    # Regole del piano: qualità mai il giorno dopo il gioco di squadra,
    # almeno un giorno tra la qualità e il lungo (o test/gara).
    per_data = {}
    for s in piano["sedute"]:
        per_data.setdefault(_data(s["data"]), set()).add(s["tipo"])
    uno = dt.timedelta(days=1)
    for d, tipi in sorted(per_data.items()):
        if "qualita" not in tipi:
            continue
        if "volley" in per_data.get(d - uno, ()):
            avvisi.append(f"{d}: qualità il giorno dopo il gioco di squadra")
        for altro in (d - uno, d + uno):
            if per_data.get(altro, set()) & {"lungo", "test", "gara"}:
                avvisi.append(f"{d}: qualità attaccata al lungo/test/gara del {altro}")

    if espandi(piano) != piano:
        err("campi ricavati non aggiornati: lancia `python3 scripts/piano.py aggiorna`")
    return errori, avvisi


def collega(piano, attivita):
    """Confronta le corse del piano con le attività su numero_piano.
    Restituisce (coppie, errori, avvisi); ogni coppia è (seduta del piano, attività)."""
    errori, avvisi = [], []
    corse = {s["numero_piano"]: s for s in piano["sedute"] if s["corsa"]}
    viste, coppie = {}, []
    for a in attivita:
        n = a.get("numero_piano")
        if n is None:
            continue
        nome = f"{a['data']} '{a['nome']}'"
        if n in viste:
            errori.append(f"numero {n} usato due volte: {viste[n]} e {nome}")
            continue
        viste[n] = nome
        if n not in corse:
            errori.append(f"{nome}: il numero {n} non è una corsa del piano")
            continue
        s = corse[n]
        coppie.append((s, a))
        if settimana_di(piano, a["data"]) != s["settimana"]:
            avvisi.append(f"{nome}: fatta fuori dalla settimana prevista ({s['data']}, sett. {s['settimana']})")
    coppie.sort(key=lambda c: c[0]["numero_piano"])
    fatte = {s["numero_piano"] for s, _ in coppie}
    ultima = max(fatte, default=0)
    for n in range(1, ultima):
        if n not in fatte:
            avvisi.append(f"corsa {n} ({corse[n]['data']}) senza attività")
    return coppie, errori, avvisi


def _km(m):
    return f"{m / 1000:g}".replace(".", ",")


def riepilogo(piano):
    x = espandi(piano)
    righe = [f"{x['totale_corse']} corse in {len(x['settimane'])} settimane, "
             f"{_km(sum(w['distanza_m'] for w in x['settimane']))} km totali"]
    for f in x["fasi"]:
        a, b = f["settimane"]
        ws = [w for w in x["settimane"] if a <= w["settimana"] <= b]
        righe.append(f"\n{f['nome']} ({f['periodo']}): {_km(sum(w['distanza_m'] for w in ws))} km")
        for w in ws:
            lungo = max((s["distanza_m"] for s in x["sedute"]
                         if s["settimana"] == w["settimana"] and s["tipo"] in {"lungo", "test", "gara"}),
                        default=0)
            tag = f" [{w['tipo']}]" if w["tipo"] else ""
            righe.append(f"  sett. {w['settimana']:>2}  {w['dal']}  {_km(w['distanza_m']):>5} km"
                         f"  lungo {_km(lungo):>4}{tag}")
    return "\n".join(righe)


def _stampa(errori, avvisi):
    for e in errori:
        print(f"ERRORE  {e}")
    for a in avvisi:
        print(f"AVVISO  {a}")


def main(argv):
    comando = argv[1] if len(argv) > 1 else "controlla"
    piano = carica()
    if comando == "aggiorna":
        piano = espandi(piano)
        salva(piano)
    if comando in ("controlla", "aggiorna"):
        errori, avvisi = controlla(piano)
        _stampa(errori, avvisi)
        if errori:
            return 1
        print(f"{len(piano['sedute'])} sedute, {piano['totale_corse']} corse, "
              f"{len(piano['settimane'])} settimane, {len(avvisi)} avvisi")
        return 0
    if comando == "collega":
        if not ATTIVITA.exists():
            print(f"{ATTIVITA} non c'è ancora: nessuna attività da collegare")
            return 0
        with ATTIVITA.open(encoding="utf-8") as f:
            attivita = json.load(f)
        coppie, errori, avvisi = collega(piano, attivita)
        for s, a in coppie:
            print(f"{s['numero_piano']:>3}  previsto {s['data']} {_km(s['distanza_m']):>4} km"
                  f"  fatto {a['data']} {_km(a['distanza_m'] or 0):>5} km  {a['origine']}")
        _stampa(errori, avvisi)
        print(f"{len(coppie)} corse collegate su {piano['totale_corse']}, {len(errori)} errori, {len(avvisi)} avvisi")
        return 1 if errori else 0
    if comando == "riepilogo":
        print(riepilogo(piano))
        return 0
    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
