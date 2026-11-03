# my-strava

Un piano di allenamento per la corsa, le attività di Strava e due pagine per confrontarli: un **report** e un **editor del piano**.

Qui c'è solo il codice. I dati di ognuno (piano e attività) stanno nel suo repo **privato di dati**, che questo codice legge e aggiorna.

## Cosa c'è

| Percorso | Contenuto |
|---|---|
| `scripts/strava_sync.py` | Scarica le attività nuove da Strava, e di nuovo quelle delle ultime due settimane, in `data/strava_attivita.jsonl` e `data/strava_attivita.csv`. Toglie la traccia GPS |
| `scripts/build_dati.py` | Unisce le attività di Strava e quelle scritte a mano (`data/attivita_manuali.csv`) in `data/attivita.json`, con numeri e non testi, e `numero_piano` preso dal titolo (`10/36` → 10) |
| `scripts/piano.py` | Valida `data/piano.json` (`controlla`), ricalcola i campi ricavati (`aggiorna`), confronta le corse del piano con le attività (`collega`), stampa i km per fase e settimana (`riepilogo`) |
| `scripts/strava_auth.ps1` | Genera il refresh token di Strava; si lancia a mano, una volta sola, vedi [setup.md](setup.md) |
| `scripts/crea_esempio.py` | Rigenera i dati di esempio |
| `sito/` | Le pagine: `report/`, `editor/` e una pagina iniziale. HTML e JavaScript senza build e senza librerie |
| `sito/esempio/` | Un piano finto di 12 settimane per una 10 km e le attività delle prime sei: servono per provare le pagine e per i test |
| `tests/`, `test/` | Test di `scripts/` (Python) e delle pagine (Node) |

Gli script lavorano sulla cartella `data/` della cartella da cui si lanciano, cioè la radice del repo di dati, oppure sul percorso in `STRAVA_DATI`.

## Le pagine

- **Report**:
  - settimana corrente seduta per seduta: fatta, spostata, saltata o da fare;
  - volume settimanale e lungo, previsti e fatti;
  - ritmo di facili e lunghi rispetto alla fascia della fase;
  - test e gare, settimane passate.
- **Editor**:
  - piano per fase e per settimana;
  - le sedute si spostano trascinandole e si modificano cliccandole;
  - ricalcola i campi ricavati e fa gli stessi controlli di `piano.py controlla`, quindi con errori non si salva;
  - annulla e ripeti, bozza salvata nel browser.

Per provarle in locale:

```bash
cd sito && python3 -m http.server
```

Poi apri <http://localhost:8000>. Ci sono due modi per vederle con dei dati:

- con `?esempio`, le pagine usano i dati di esempio;
- senza, chiedono di scegliere i file del proprio repo di dati.

`?oggi=2027-02-11` mostra le pagine come in un altro giorno.

Per ora l'editor salva scaricando `piano.json`, da copiare in `data/` del repo di dati. La lettura e la scrittura diretta nel repo di dati arriveranno con un token GitHub. Il codice da cambiare sta in `sito/*/fonte.js`.

## Il piano e le attività

- `data/piano.json` è l'unica fonte del piano:
  - **dati di base**: sedute, settimane, fasi con i ritmi, gara, settimana tipo e regole;
  - **campi ricavati**: giorno, settimana e fase di ogni seduta, km settimanali, `numero_piano` delle corse.
- Le corse sono numerate in ordine di data: togliendone una, le successive scalano di uno.
- **Il collegamento tra piano e attività**:
  - **le corse** si collegano sul numero nel titolo dell'attività su Strava: `10/36` è la decima corsa del piano;
  - **le altre sedute** si collegano sullo sport di Strava: `Volleyball` → gioco di squadra, `WeightTraining` → forza, `Yoga` → mobilità, `Walk` → camminata, `Hike` → trekking. Si cerca prima un'attività lo stesso giorno, poi nella stessa settimana.
- La logica del piano esiste in due copie: `scripts/piano.py` e `sito/editor/piano.js`. Se ne cambi una, cambia anche l'altra: `test/piano.test.mjs` le confronta.

## Test

```bash
python3 -m unittest discover -s tests
```

```bash
node --test
```

Il workflow **Test** li lancia a ogni push e controlla anche che i dati di esempio siano aggiornati.

## Licenza

MIT, vedi [LICENSE](LICENSE).
