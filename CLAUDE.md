# my-strava: istruzioni per Claude

Piano di allenamento per la corsa, attività di Strava e due pagine, report ed editor, per confrontarli. Lo stato e i prossimi passi sono nella [ROADMAP](ROADMAP.md) e nell'[issue #5](https://github.com/ama-eddy/my-strava/issues/5): leggili prima di cominciare.

## I repo

| Repo | Cosa contiene |
|---|---|
| `ama-eddy/my-strava` (pubblico) | Tutto il codice: script, pagine, workflow riutilizzabili, dati di esempio e test. Il sito è pubblicato con GitHub Pages su <https://ama-eddy.github.io/my-strava/> |
| `ama-eddy/strava-database` (privato) | I dati veri dell'utente: `data/piano.json`, le attività, i secret di Strava. Contiene solo `data/` e i due workflow di `modello/`, che richiamano quelli di qui |
| `training-plan-editor`, `training-report` | Vecchi repo, il cui codice ora è qui. Vanno archiviati con l'issue #5 |

- **In my-strava non entrano mai dati personali:** né il piano vero, né le attività, né coordinate o nomi. Si lavora sui dati finti di `sito/esempio/`.
- **Le modifiche fatte qui arrivano subito al sync vero e a Check Piano**, perché strava-database richiama i workflow di `main`. Prima di unire una PR che tocca `scripts/` o `.github/workflows/`, provala su una copia dei dati veri, fuori da questo repo.
- **Nei testi di my-strava** (codice, commit, PR, issue) non vanno date, nomi o numeri delle attività vere: i dettagli del repo di dati si scrivono solo lì.

## Come si lavora

- **Tutto in italiano**: nomi nel codice, commenti, documentazione, interfaccia, commit, PR e issue.
- **Un passo della ROADMAP, una PR.** Si apre la PR, l'utente la rivede e chiede il merge. Dopo il merge si aggiorna la ROADMAP con lo stato e il link alla PR.
- **Le decisioni dell'utente** si chiedono una alla volta, con risposte a scelta multipla e un'opzione consigliata.
- **GitHub dal proxy di questa sessione:**
  - si usa solo l'API REST (`gh api ...`), perché GraphQL non è disponibile;
  - il proxy blocca l'eliminazione dei branch e le impostazioni del repo, come GitHub Pages: le fa l'utente a mano;
  - `github.io` non si raggiunge: il sito pubblicato lo controlla l'utente.

## Il codice

- **Le pagine (`sito/`)** sono HTML e JavaScript con moduli ES, senza build e senza librerie. I grafici sono SVG fatti a mano (`sito/report/grafici.js`).
- **Da dove arrivano i dati** lo sa solo `fonte.js` di ogni pagina. Il codice che parla con GitHub sta in `sito/comune/github.js`.
- **La logica del piano esiste in due copie**, `scripts/piano.py` e `sito/editor/piano.js`, che devono dare risultati identici:
  - stessi campi ricavati, nello stesso ordine e byte per byte;
  - stessi errori e avvisi, con gli stessi testi.

  Se ne cambi una, cambia anche l'altra. Lo controllano `test/piano.test.mjs` e, sul piano vero, `scripts/confronta_editor.mjs` in Check Piano.
- **`espandi` aggiunge un campo facoltativo**, come `ritmo` di una seduta, solo se c'è. Così i piani che non lo usano restano identici.
- **Gli script** lavorano su `data/` della cartella da cui si lanciano, oppure sul percorso in `STRAVA_DATI`. Usano solo la libreria standard di Python.
- **I dati di esempio** si rigenerano con `python3 scripts/crea_esempio.py`, e il workflow Test controlla che siano aggiornati. Il "giorno di oggi" dell'esempio è il 17 marzo 2027 (`?esempio&oggi=2027-03-17`).
- **Il report, nei grafici:**
  - il fatto è blu (`--fatto`), il previsto è grigio;
  - gli stati hanno sempre un'icona e un'etichetta, non solo il colore;
  - va bene in tema chiaro e scuro e sul telefono, dove le tabelle diventano schede.

## Decisioni già prese

- **Le corse si collegano al piano** con il titolo `N/totale` su Strava, cioè `numero_piano`.
- **Le altre sedute si collegano con lo sport di Strava**, prima lo stesso giorno, poi nella stessa settimana:
  - Volleyball → gioco di squadra;
  - Workout → forza, e anche WeightTraining;
  - Yoga → mobilità;
  - Walk → camminata;
  - Hike → trekking.
- **Una seduta non fatta resta "saltata".** Se si recupera, si rinomina l'attività con il numero della corsa, oppure si sposta la seduta nell'editor.
- **Facili e lunghi** si confrontano con la fascia `facile_lungo` della fase, senza tolleranza.
- **Qualità e test** mostrano il ritmo obiettivo senza esito, perché il ritmo medio include riscaldamento e recuperi.
- **Il tempo del test** viene dai giri consecutivi più veloci che fanno la distanza del test.
- **La previsione e i ritmi suggeriti** sono stime con regole pratiche: la formula di Riegel e scarti fissi dal ritmo dei 5 km. Il report le segnala e basta: il piano lo cambia l'utente.
- **Nell'editor un id nuovo** è il primo libero della forma `w{settimana}s{k}`.

## Test

```bash
python3 -m unittest discover -s tests
```

```bash
node --test
```

Per provare le pagine: `cd sito && python3 -m http.server`, poi `?esempio&oggi=2027-03-17`. Prima di aprire una PR che tocca le pagine, controllale nel browser con Playwright, al computer e al telefono.
