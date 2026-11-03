# Roadmap

my-strava mette a confronto un piano di allenamento con le attività di Strava. Qui c'è solo il codice. Il piano e le attività stanno nel repo privato di dati di ognuno.

## Architettura

```
REPO DI DATI (privato)                     MY-STRAVA (pubblico)

Sync Strava, ogni lunedì ────────────────► sync.yml: strava_sync.py ► build_dati.py ► piano.py collega
  commit di data/ ◄──────────────────────┘

Check Piano, a ogni push di data/ ───────► piano.yml: piano.py controlla e collega, confronto con l'editor

data/piano.json, data/attivita.json ◄────► sito/ su GitHub Pages: report ed editor
                                           (con un token, solo nel browser di chi li usa)
```

- **Tutta l'automazione gira su GitHub Actions.** Il sync e i controlli sono lavori meccanici: devono andare sempre allo stesso modo e mostrare l'esito su GitHub.
  - Se un passaggio fallisce, il workflow si ferma senza commit e GitHub manda un'email.
  - I secret di Strava stanno nel repo di dati.
- **Il piano è solo `data/piano.json`.** Contiene solo il previsto; il fatto si ricava da `attivita.json`.
  - I campi ricavati li ricalcolano `piano.py aggiorna` e l'editor.
  - `piano.py` e `sito/editor/piano.js` devono dare gli stessi risultati. Lo controllano i test di qui e Check Piano sul piano vero.
- **La chiave tra piano e attività è il numero progressivo delle corse.** Il titolo `N/totale` su Strava (per esempio `10/36`) dà `numero_piano`.
  - Una corsa prevista che non si fa esce dal piano, e le successive scalano di uno.
- **Niente database.** Sono circa 150 corse all'anno: un file JSON basta.

## Passi

| | Passo | Stato |
|---|---|---|
| 1 | **Un repo pubblico con tutto il codice**: script, pagine, dati di esempio e test, compreso il confronto tra `piano.js` e `piano.py` | Fatto ([#1]) |
| 2 | **Workflow riutilizzabili** Sync Strava e Check Piano, `modello/` per un repo di dati, sito pubblicato con GitHub Pages | Fatto ([#2]) |
| 3 | **Lettura e scrittura diretta nel repo di dati** con un token GitHub fine-grained, salvato solo nel browser: il report legge, l'editor salva con un commit. Cambia `sito/*/fonte.js` più una schermata per repo e token | Da fare |
| 4 | **Collegare il primo repo di dati** (strava-database): i workflow diventano i due file di `modello/`, il codice esce da lì | Da fare |
| 5 | **Ritmo obiettivo per qualità, test e gare intermedie**: un campo facoltativo `ritmo` (`soglia`, `ripetute` o `gara`) sulle sedute di `piano.json`. È controllato da `piano.py` e `piano.js` e si sceglie nel dialogo dell'editor. Il report lo mostra per qualità e test senza esito, perché il ritmo medio di Strava include riscaldamento e recuperi | Fatto ([#4]) |
| 6 | **Andamento dei test, con il suggerimento di ricalibrare i ritmi** della fase dopo ogni test. La tabella dei test nel report c'è già; il suggerimento manca | Da fare |
| 7 | **Giri (lap) di Strava nel sync**, per dare un esito vero al ritmo di qualità e test | Più avanti |

[#1]: https://github.com/ama-eddy/my-strava/pull/1
[#2]: https://github.com/ama-eddy/my-strava/pull/2
[#4]: https://github.com/ama-eddy/my-strava/pull/4

## Fatto finora nel report e nell'editor

- **Report**:
  - corse abbinate alle sedute con `numero_piano`; le altre sedute con lo sport di Strava, prima lo stesso giorno e poi nella stessa settimana;
  - stato di ogni seduta (fatta, spostata, saltata, da fare) e attività in più;
  - giorni alla gara e km corsi su km previsti;
  - settimana corrente, con previsto e fatto affiancati;
  - volume settimanale, crescita del lungo e ritmo di facili e lunghi rispetto alla fascia della fase;
  - tabella dei test e delle gare.
- **Editor**:
  - piano per fase e per settimana; sedute da spostare trascinandole, da aggiungere, modificare ed eliminare;
  - tipo e nota delle settimane;
  - gli stessi controlli di `piano.py`;
  - annulla e ripeti, bozza nel browser.

## Decisioni

- **Tutte le attività passano da Strava**, così arrivano col sync come le corse.
  - Con l'orologio quando si può.
  - Altrimenti come attività manuale su Strava (app: *+* → *Aggiungi attività manuale*), con data, ora d'inizio e durata.
- **I titoli seguono i nomi del piano**: **Gioco di squadra**, **Forza**, **Mobilità**, **Camminata**, **Trekking**. Le corse hanno il titolo `N/totale`.
- **Lo sport su Strava**:
  - Gioco di squadra → Volleyball;
  - Forza → Weight Training;
  - Mobilità → Yoga;
  - Camminata → Walk;
  - Trekking → Hike.
- **Le attività vanno su Strava entro due settimane.** Il sync riscarica solo gli ultimi 14 giorni: quelle inserite più tardi con una data vecchia non arrivano.
- **`attivita_manuali.csv` resta solo per le eccezioni**: attività con dati stimati o inserite su Strava troppo tardi.
- **Facili e lunghi si confrontano con la fascia `facile_lungo` della fase, senza tolleranza.** La gara del piano si confronta con `gara.obiettivo_ritmo`.
- **Una seduta non fatta si mostra come saltata.** Se la recuperi, rinomini l'attività con il numero della corsa, oppure sposti la seduta nell'editor.
