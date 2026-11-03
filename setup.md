# Setup

Come creare il proprio repo di dati e collegarlo a Strava. Il codice resta in my-strava: il repo di dati contiene solo `data/` e due workflow di poche righe che richiamano quelli di my-strava.

## 0. Creare il repo di dati (una volta sola)

1. Crea su GitHub un repo **privato**, per esempio `allenamento-dati`.
2. Copia dentro il contenuto della cartella [`modello/`](modello), compresa `.github/`.
3. Come punto di partenza per il piano copia [`sito/esempio/piano.json`](sito/esempio/piano.json) in `data/piano.json`. Poi lo modifichi con l'editor.

## Cosa fa

- `scripts/strava_sync.py` scarica le attività dall'API personale di Strava (gratuita) e aggiorna:
  - `data/strava_attivita.jsonl`: una riga JSON per attività, dati completi tranne la traccia GPS. È la fonte principale.
  - `data/strava_attivita.csv`: tabella leggibile (data, nome, sport, distanza, tempi, ritmo, dislivello, FC).
- A ogni lancio riscarica anche le ultime 2 settimane, così prende titoli e dati modificati dopo.
- Usa solo la libreria standard di Python 3: niente da installare.

## 1. Creare l'app Strava (una volta sola)

1. Vai su <https://www.strava.com/settings/api> e crea un'applicazione.
2. Come **Authorization Callback Domain** metti: `localhost`.
3. Annota **Client ID** e **Client Secret**.

## 2. Ottenere il refresh token (una volta sola)

Su Windows, dalla cartella di questo repo:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\strava_auth.ps1
```

1. Inserisci Client ID e Client Secret.
2. Nel browser premi **Autorizza**. La pagina `localhost` non carica: è normale.
3. Copia dall'indirizzo il valore tra `code=` e `&scope` e incollalo.
4. Lo script stampa `STRAVA_REFRESH_TOKEN`: salvalo.

Il permesso richiesto è `activity:read_all` (include le attività private).

## 3. Variabili d'ambiente

Le credenziali **non stanno nei file del repo**. Vanno impostate come secret del repo di dati su GitHub (*Settings → Secrets and variables → Actions → New repository secret*):

| Secret | Valore |
|---|---|
| `STRAVA_CLIENT_ID` | Client ID dell'app |
| `STRAVA_CLIENT_SECRET` | Client Secret dell'app |
| `STRAVA_REFRESH_TOKEN` | token stampato da `strava_auth.ps1` |

Per provare in locale si può usare un file `.env` (è già in `.gitignore`), oppure:

```bash
export STRAVA_CLIENT_ID=...
export STRAVA_CLIENT_SECRET=...
export STRAVA_REFRESH_TOKEN=...
python3 ../my-strava/scripts/strava_sync.py   # dalla radice del repo di dati
```

## 4. Sync settimanale

Ogni **lunedì alle 07:03 UTC** (08:03 d'inverno, 09:03 d'estate) il workflow **Sync Strava** del repo di dati richiama quello di my-strava, che:

1. lancia `strava_sync.py`;
2. lancia `build_dati.py`;
3. controlla il collegamento con il piano con `piano.py collega`;
4. se `data/` è cambiata, fa commit con messaggio `Strava: sync AAAA-MM-GG` e push su `main` del repo di dati.

Si può lanciare anche a mano: *Actions → Sync Strava → Run workflow*. Se un passaggio fallisce, non fa commit e GitHub manda un'email.

A ogni push che tocca `data/`, **Check Piano** controlla:

- il piano;
- il collegamento con le attività;
- che l'editor dia sul piano gli stessi risultati di `piano.py`.

I due workflow usano il codice di `main` di my-strava. Per fissare una versione si cambia `@main` nel file del repo di dati, oppure si passa `ref`.

## 5. Leggere i dati

Prima di leggere i dati in locale:

```bash
git pull
```

## Problemi comuni

| Messaggio | Cosa fare |
|---|---|
| `Manca la variabile d'ambiente ...` | Aggiungere il secret mancante nel repo. |
| `Errore Strava 401` | Token scaduto o revocato: rifare il passo 2 e aggiornare il secret `STRAVA_REFRESH_TOKEN`. |
| `ATTENZIONE: Strava ha emesso un nuovo refresh token` | Rifare il passo 2 e aggiornare il secret `STRAVA_REFRESH_TOKEN`. |
| `ERRORE  numero N usato due volte` o `non è una corsa del piano` | Correggere il titolo dell'attività su Strava e rilanciare il workflow. |
| `Errore Strava 429` | Troppe richieste: riprovare più tardi. |
