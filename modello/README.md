# I miei dati di allenamento

Repo **privato** con il piano e le attività. Il codice sta in [my-strava](https://github.com/ama-eddy/my-strava).

| File | Contenuto |
|---|---|
| `data/piano.json` | Il piano di allenamento: si modifica con l'editor di my-strava |
| `data/strava_attivita.jsonl`, `data/strava_attivita.csv` | Attività scaricate da Strava, scritte dal sync: non si modificano a mano |
| `data/attivita.json` | Tutte le attività insieme, per le pagine: si rigenera a ogni sync |

- **Sync Strava** gira ogni mattina, o a mano da *Actions → Sync Strava → Run workflow*.
  Per un'attività inserita su Strava con più di due settimane di ritardo, si lancia a mano con **completo** spuntato.
- **Check Piano** controlla i dati a ogni push.
- I workflow usano la versione `v2` di my-strava: per aggiornarla vedi *Versioni* in [setup.md](https://github.com/ama-eddy/my-strava/blob/main/setup.md#versioni).
