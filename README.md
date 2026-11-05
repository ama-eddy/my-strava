# my-strava

Un piano di allenamento per la corsa, le attività di Strava e due pagine per confrontarli: un **report** e un **editor del piano**.

Qui c'è solo il codice. I dati di ognuno (piano e attività) stanno nel suo repo **privato di dati**, che questo codice legge e aggiorna.

## Cosa c'è

| Percorso | Contenuto |
|---|---|
| `scripts/strava_sync.py` | Scarica le attività nuove da Strava, e di nuovo quelle delle ultime due settimane, in `data/strava_attivita.jsonl` e `data/strava_attivita.csv`. Toglie la traccia GPS. Delle corse scarica anche i giri (lap); lo storico senza giri si completa fino a 60 corse per sync. Con `STRAVA_COMPLETO=1` riscarica tutte le attività |
| `scripts/build_dati.py` | Prepara le attività di Strava per le pagine in `data/attivita.json`, con numeri e non testi, e `numero_piano` preso dal titolo (`10/36` → 10). Le corse con più di un giro hanno anche `giri` |
| `scripts/piano.py` | Valida `data/piano.json` (`controlla`), ricalcola i campi ricavati (`aggiorna`), confronta le corse del piano con le attività (`collega`), stampa i km per fase e settimana (`riepilogo`) |
| `scripts/strava_auth.ps1` | Genera il refresh token di Strava; si lancia a mano, una volta sola, vedi [setup.md](setup.md) |
| `scripts/crea_esempio.py` | Rigenera i dati di esempio |
| `sito/` | Le pagine: `report/`, `editor/`, `collega/` per il repo di dati e una pagina iniziale. HTML e JavaScript senza build e senza librerie |
| `sito/esempio/` | Un piano finto di 12 settimane per una 10 km e le attività fino alla settimana 11, con i giri e due test sui 5 km: servono per provare le pagine e per i test |
| `scripts/confronta_editor.mjs` | Controlla che l'editor dia su un piano gli stessi risultati di `piano.py` |
| `modello/` | Il punto di partenza di un repo di dati: i due workflow che richiamano quelli di qui |
| `.github/workflows/` | **Sync Strava** e **Check Piano**, da richiamare dal repo di dati; **Test**; **Pages**, che pubblica `sito/` |
| `tests/`, `test/` | Test di `scripts/` (Python) e delle pagine (Node) |

Per creare il proprio repo di dati e collegarlo a Strava: [setup.md](setup.md). I prossimi passi sono nella [ROADMAP](ROADMAP.md).

Gli script lavorano sulla cartella `data/` della cartella da cui si lanciano, cioè la radice del repo di dati, oppure sul percorso in `STRAVA_DATI`.

## Le pagine

- **Report**:
  - settimana corrente seduta per seduta: fatta, spostata, saltata o da fare;
  - volume settimanale e lungo, previsti e fatti;
  - ritmo di facili e lunghi rispetto alla fascia della fase;
  - test e gare: il tempo del test preso dai giri, il confronto con il test precedente, la previsione sulla gara e i ritmi delle fasi rimaste da ricalibrare;
  - settimane passate.
- **Editor**:
  - piano per fase e per settimana;
  - le sedute si spostano trascinandole e si modificano cliccandole;
  - ricalcola i campi ricavati e fa gli stessi controlli di `piano.py controlla`, quindi con errori non si salva;
  - annulla e ripeti, bozza salvata nel browser.

Il sito è pubblicato con GitHub Pages su <https://ama-eddy.github.io/my-strava/>. Contiene solo le pagine e i dati di esempio.

Per provarle in locale:

```bash
cd sito && python3 -m http.server
```

Poi apri <http://localhost:8000>. Ci sono due modi per vederle con dei dati:

- con `?esempio`, le pagine usano i dati di esempio;
- senza, chiedono di scegliere i file del proprio repo di dati.

`?oggi=2027-03-17` mostra le pagine come in un altro giorno.

### Collegare il repo di dati

Nella pagina **Collega** (`sito/collega/`) si inseriscono il nome del repo di dati e un token GitHub *fine-grained* con un solo permesso: *Contents: Read and write* sul solo repo di dati. La pagina spiega come crearlo.

- **Il report** legge `data/piano.json` e `data/attivita.json` dal repo.
- **L'editor** legge `data/piano.json` e lo salva con un commit, *Piano: modifiche dall'editor*. Il commit fa partire Check Piano nel repo di dati.
- **Se il piano è cambiato su GitHub dopo che l'hai aperto**, il salvataggio si ferma. Ricaricando la pagina, la bozza viene riproposta.
- **Il token resta solo nel browser** (`localStorage`): non va sul sito né in nessun repo. Il collegamento si fa una volta per dispositivo.

Senza collegamento le pagine usano una copia locale in `dati/`, i file scelti a mano o i dati di esempio. In quel caso l'editor salva scaricando `piano.json`. Tutto questo sta in `sito/*/fonte.js` e `sito/comune/github.js`.

## Il piano e le attività

- `data/piano.json` è l'unica fonte del piano:
  - **dati di base**: sedute, settimane, fasi con i ritmi, gara, settimana tipo e regole;
  - **campi ricavati**: giorno, settimana e fase di ogni seduta, km settimanali, `numero_piano` delle corse.
- Le corse sono numerate in ordine di data: togliendone una, le successive scalano di uno.
- **Il ritmo obiettivo.** Una seduta di qualità, test o gara può avere un campo `ritmo` facoltativo: `soglia`, `ripetute` o `gara`, cioè quale ritmo della sua fase vale. Si sceglie nel dialogo dell'editor.
  - **Controlli:** `piano.py` e l'editor danno errore se la seduta non è di qualità, test o gara, oppure se la fase non ha quel ritmo.
  - **Nel report**, per qualità e test il ritmo si vede ma senza esito, perché il ritmo medio di Strava include riscaldamento e recuperi.
  - **Le gare intermedie** hanno un esito: si confrontano con quel ritmo, oppure con il ritmo gara della fase.
- **Il collegamento tra piano e attività**:
  - **le corse** si collegano sul numero nel titolo dell'attività su Strava: `10/36` è la decima corsa del piano;
  - **le altre sedute** si collegano sullo sport di Strava: `Volleyball` → gioco di squadra, `Workout` (o `WeightTraining`) → forza, `Yoga` → mobilità, `Walk` → camminata, `Hike` → trekking. Si cerca prima un'attività lo stesso giorno, poi nella stessa settimana.
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
