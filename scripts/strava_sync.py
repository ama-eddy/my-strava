"""Scarica le attività di Strava e aggiorna il database in data/.

Usa l'API personale di Strava. Servono le variabili d'ambiente
STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET e STRAVA_REFRESH_TOKEN
(refresh token con permesso activity:read_all, vedi scripts/strava_auth.ps1).

- data/strava_attivita.jsonl: una riga JSON per attività, i dati di Strava completi
  (tranne la traccia GPS). È la fonte principale. Le corse hanno anche i giri (lap) in
  "laps": servono a trovare il tratto veloce di test e qualità.
- data/strava_attivita.csv: tabella leggibile ricavata dal file JSONL, con origine=strava.
  Le attività non registrate su Strava stanno a parte in data/attivita_manuali.csv
  (stesse colonne, origine=manual), che questo script non tocca.
"""

import csv
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path

# Cartella dei dati: data/ nella cartella da cui si lancia lo script, o il percorso in STRAVA_DATI.
DATA = Path(os.environ.get("STRAVA_DATI", "data")).resolve()
JSONL = DATA / "strava_attivita.jsonl"
CSV = DATA / "strava_attivita.csv"

# Riscarica sempre le ultime due settimane, così prende anche titoli e dati modificati dopo.
OVERLAP = timedelta(days=14)
SPORT_A_PIEDI = {"Run", "TrailRun", "VirtualRun", "Walk", "Hike"}
SPORT_CORSA = {"Run", "TrailRun", "VirtualRun"}
# Ogni sync scarica i giri delle corse nuove o cambiate, e al massimo questo numero di corse
# vecchie che non li hanno ancora: così lo storico si completa in poche settimane senza
# superare i limiti dell'API di Strava (200 richieste ogni 15 minuti).
GIRI_ARRETRATI = 60
# Dei giri si tengono solo questi campi.
CAMPI_GIRO = ("lap_index", "name", "distance", "moving_time", "elapsed_time", "average_speed",
              "max_speed", "total_elevation_gain", "average_heartrate", "max_heartrate", "split")


def env(name):
    value = os.environ.get(name)
    if not value:
        sys.exit(f"Manca la variabile d'ambiente {name}")
    return value


def request_json(url, data=None, headers=None):
    req = urllib.request.Request(url, data=data, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as err:
        sys.exit(f"Errore Strava {err.code} su {url.split('?')[0]}: {err.read().decode(errors='replace')}")


def access_token():
    refresh_token = env("STRAVA_REFRESH_TOKEN")
    body = urllib.parse.urlencode({
        "client_id": env("STRAVA_CLIENT_ID"),
        "client_secret": env("STRAVA_CLIENT_SECRET"),
        "grant_type": "refresh_token",
        "refresh_token": refresh_token,
    }).encode()
    token = request_json("https://www.strava.com/oauth/token", data=body)
    if token.get("refresh_token") and token["refresh_token"] != refresh_token:
        prefisso = "::warning::" if os.environ.get("GITHUB_ACTIONS") else ""
        print(prefisso + "ATTENZIONE: Strava ha emesso un nuovo refresh token. "
              "Rigenera il token con scripts/strava_auth.ps1 e aggiorna STRAVA_REFRESH_TOKEN.",
              file=sys.stderr)
    return token["access_token"]


def fetch_activities(token, after):
    activities = []
    page = 1
    while True:
        query = urllib.parse.urlencode({"after": int(after), "per_page": 200, "page": page})
        batch = request_json(f"https://www.strava.com/api/v3/athlete/activities?{query}",
                             headers={"Authorization": f"Bearer {token}"})
        if not batch:
            return activities
        activities.extend(batch)
        page += 1


def fetch_laps(token, activity_id):
    laps = request_json(f"https://www.strava.com/api/v3/activities/{activity_id}/laps",
                        headers={"Authorization": f"Bearer {token}"})
    return [{k: lap[k] for k in CAMPI_GIRO if k in lap} for lap in laps]


def aggiungi_giri(db, cambiate, token, scarica=fetch_laps, arretrati=GIRI_ARRETRATI):
    """Mette i giri ("laps") nelle corse: in tutte quelle di `cambiate` e in al massimo
    `arretrati` corse del database che non li hanno ancora, le più recenti prima.
    Restituisce il numero di corse completate."""
    corse = lambda a: a.get("sport_type") in SPORT_CORSA
    da_fare = [a for a in cambiate if corse(a)]
    ids = {a["id"] for a in da_fare}
    vecchie = sorted((a for a in db.values() if corse(a) and "laps" not in a and a["id"] not in ids),
                     key=lambda a: a["start_date"], reverse=True)
    for a in da_fare + vecchie[:arretrati]:
        a["laps"] = scarica(token, a["id"])
    return len(da_fare) + len(vecchie[:arretrati])


def parse_date(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def load_db():
    if not JSONL.exists():
        return {}
    with JSONL.open(encoding="utf-8") as f:
        return {a["id"]: a for a in (json.loads(line) for line in f if line.strip())}


def hms(seconds):
    if not seconds:
        return ""
    h, rest = divmod(int(seconds), 3600)
    m, s = divmod(rest, 60)
    return f"{h}:{m:02d}:{s:02d}"


def pace(activity):
    km = (activity.get("distance") or 0) / 1000
    if activity.get("sport_type") not in SPORT_A_PIEDI or km <= 0:
        return ""
    m, s = divmod(round(activity["moving_time"] / km), 60)
    return f"{m}:{s:02d}"


def csv_row(a):
    local = a.get("start_date_local", "")
    return {
        "id": a["id"],
        "data": local[:10],
        "ora": local[11:16],
        "nome": a.get("name", ""),
        "sport": a.get("sport_type", ""),
        "distanza_km": f"{(a.get('distance') or 0) / 1000:.2f}",
        "tempo_movimento": hms(a.get("moving_time")),
        "tempo_totale": hms(a.get("elapsed_time")),
        "ritmo_min_km": pace(a),
        "dislivello_m": round(a.get("total_elevation_gain") or 0),
        "fc_media": round(a["average_heartrate"]) if a.get("average_heartrate") else "",
        "fc_max": round(a["max_heartrate"]) if a.get("max_heartrate") else "",
    }


def save_db(db):
    DATA.mkdir(exist_ok=True)
    activities = sorted(db.values(), key=lambda a: a["start_date"])
    with JSONL.open("w", encoding="utf-8", newline="\n") as f:
        for a in activities:
            f.write(json.dumps(a, ensure_ascii=False, sort_keys=True) + "\n")
    rows = [dict(csv_row(a), origine="strava") for a in activities]
    with CSV.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(csv_row({"id": 0}).keys()) + ["origine"])
        writer.writeheader()
        writer.writerows(rows)


def main():
    db = load_db()
    after = 0
    if db:
        last = max(parse_date(a["start_date"]) for a in db.values())
        after = (last - OVERLAP).timestamp()

    token = access_token()
    fetched = fetch_activities(token, after)
    new = updated = 0
    cambiate = []
    for a in fetched:
        a.pop("map", None)  # traccia GPS: non serve e rivela da dove parti
        vecchia = db.get(a["id"])
        if vecchia is not None and "laps" in vecchia:
            a["laps"] = vecchia["laps"]  # i giri si riscaricano solo se l'attività è cambiata
        if vecchia is None:
            new += 1
            cambiate.append(a)
        elif vecchia != a:
            updated += 1
            cambiate.append(a)
        db[a["id"]] = a

    con_giri = aggiungi_giri(db, cambiate, token)
    save_db(db)
    print(f"Attività nuove: {new}, aggiornate: {updated}, giri scaricati per {con_giri} corse, "
          f"totale nel database: {len(db)}")


if __name__ == "__main__":
    main()
