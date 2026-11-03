# I miei dati di allenamento

Repo **privato** con il piano e le attività. Il codice sta in [my-strava](https://github.com/ama-eddy/my-strava).

| File | Contenuto |
|---|---|
| `data/piano.json` | Il piano di allenamento: si modifica con l'editor di my-strava |
| `data/attivita_manuali.csv` | Attività non registrate su Strava, scritte a mano |
| `data/strava_attivita.jsonl`, `data/strava_attivita.csv` | Attività scaricate da Strava, scritte dal sync: non si modificano a mano |
| `data/attivita.json` | Tutte le attività insieme, per le pagine: si rigenera a ogni sync |

- **Sync Strava** gira ogni lunedì, o a mano da *Actions → Sync Strava → Run workflow*.
- **Check Piano** controlla i dati a ogni push.
