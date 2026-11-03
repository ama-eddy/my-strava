"""Unisce le attività di Strava e quelle manuali in data/attivita.json.

- Legge data/strava_attivita.jsonl (scritto da strava_sync.py) e data/attivita_manuali.csv.
- Scrive data/attivita.json: una lista di attività ordinate per data, con numeri e non testi
  (durate in secondi, distanze in metri, ritmo in secondi al km).
- Il piano non viene letto: l'unico legame è numero_piano, preso dal titolo ("10/153" -> 10).
"""

import csv
import json
import os
import re
import sys
from pathlib import Path

# Cartella dei dati: data/ nella cartella da cui si lancia lo script, o il percorso in STRAVA_DATI.
DATA = Path(os.environ.get("STRAVA_DATI", "data")).resolve()
JSONL = DATA / "strava_attivita.jsonl"
MANUALI = DATA / "attivita_manuali.csv"
OUT = DATA / "attivita.json"

SPORT_A_PIEDI = {"Run", "TrailRun", "VirtualRun", "Walk", "Hike"}
NUMERO_PIANO = re.compile(r"^\s*(\d+)/\d+\b")


def numero_piano(nome):
    match = NUMERO_PIANO.match(nome or "")
    return int(match.group(1)) if match else None


def secondi(hms):
    """'1:02:03' o '27:00' -> secondi; vuoto -> None."""
    if not hms:
        return None
    total = 0
    for part in hms.split(":"):
        total = total * 60 + int(part)
    return total


def numero(value, cast=float):
    return cast(value) if value not in (None, "") else None


def ritmo(sport, distanza_m, tempo_s):
    if sport not in SPORT_A_PIEDI or not distanza_m or not tempo_s:
        return None
    return round(tempo_s / (distanza_m / 1000))


def attivita(origine, id, data, ora, nome, sport, distanza_m, tempo_movimento_s, tempo_totale_s,
             dislivello_m, fc_media, fc_max):
    return {
        "id": id,
        "origine": origine,
        "data": data,
        "ora": ora,
        "nome": nome,
        "numero_piano": numero_piano(nome),
        "sport": sport,
        "distanza_m": round(distanza_m) if distanza_m is not None else None,
        "tempo_movimento_s": tempo_movimento_s,
        "tempo_totale_s": tempo_totale_s,
        "ritmo_s_km": ritmo(sport, distanza_m, tempo_movimento_s),
        "dislivello_m": round(dislivello_m) if dislivello_m is not None else None,
        "fc_media": round(fc_media) if fc_media is not None else None,
        "fc_max": round(fc_max) if fc_max is not None else None,
    }


def da_strava():
    with JSONL.open(encoding="utf-8") as f:
        for a in (json.loads(line) for line in f if line.strip()):
            local = a["start_date_local"]  # ora locale, anche se finisce con "Z"
            yield attivita(
                "strava", a["id"], local[:10], local[11:16], a.get("name", ""), a.get("sport_type"),
                a.get("distance"), a.get("moving_time"), a.get("elapsed_time"),
                a.get("total_elevation_gain"), a.get("average_heartrate"), a.get("max_heartrate"),
            )


def da_manuali():
    if not MANUALI.exists():
        return
    with MANUALI.open(encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            km = numero(row["distanza_km"])
            yield attivita(
                "manual", numero(row["id"], int), row["data"], row["ora"] or None, row["nome"],
                row["sport"], km * 1000 if km is not None else None,
                secondi(row["tempo_movimento"]), secondi(row["tempo_totale"]),
                numero(row["dislivello_m"]), numero(row["fc_media"]), numero(row["fc_max"]),
            )


def main():
    tutte = list(da_strava()) + list(da_manuali())
    tutte.sort(key=lambda a: (a["data"], a["ora"] or ""))
    with OUT.open("w", encoding="utf-8", newline="\n") as f:
        json.dump(tutte, f, ensure_ascii=False, indent=2)
        f.write("\n")
    manuali = sum(a["origine"] == "manual" for a in tutte)
    print(f"Attività in {OUT}: {len(tutte)} ({len(tutte) - manuali} Strava, {manuali} manuali)")


if __name__ == "__main__":
    sys.exit(main())
