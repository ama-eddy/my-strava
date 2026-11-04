// Da dove arrivano i dati. È l'unico file che sa dove stanno.
//
// - Con ?esempio: i dati di esempio del sito.
// - Con un repo di dati collegato (pagina collega/): data/piano.json e data/attivita.json
//   del repo, letti con l'API di GitHub.
// - Altrimenti dati/piano.json e dati/attivita.json accanto alla pagina (copia locale,
//   ignorata da git), oppure i due file scelti a mano.

import { collegamento, leggi } from "../comune/github.js";

const NOMI = ["piano.json", "attivita.json"];
const esempio = new URLSearchParams(location.search).has("esempio");

async function locale(url) {
  try {
    const r = await fetch(url, { cache: "no-store" });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

/** {piano, attivita, origine}, o null se manca uno dei due. Se il repo di dati non risponde lancia l'errore. */
export async function caricaDati() {
  const c = esempio ? null : collegamento();
  if (c) {
    const [piano, attivita] = await Promise.all(NOMI.map(async (n) => JSON.parse((await leggi(c, `data/${n}`)).testo)));
    return { piano, attivita, origine: c.repo };
  }
  const cartella = esempio ? "../esempio" : "dati";
  const [piano, attivita] = await Promise.all(NOMI.map((n) => locale(`${cartella}/${n}`)));
  return piano && attivita ? { piano, attivita, origine: esempio ? "dati di esempio" : "copia locale" } : null;
}

/** {piano, attivita} dai file scelti a mano, riconosciuti dal contenuto. */
export async function leggiFile(files) {
  const dati = {};
  for (const f of files) {
    const x = JSON.parse(await f.text());
    if (Array.isArray(x)) dati.attivita = x;
    else if (x && x.sedute) dati.piano = x;
  }
  if (!dati.piano || !dati.attivita) throw new Error("Servono piano.json e attivita.json");
  return { ...dati, origine: "file scelti a mano" };
}
