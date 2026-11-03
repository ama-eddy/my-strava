// Da dove arriva e dove va il piano. È l'unico file che sa dove stanno i dati.
//
// Per ora:
// - lettura: con ?esempio i dati di esempio del sito, altrimenti dati/piano.json accanto
//   alla pagina (copia locale, ignorata da git), oppure un file scelto a mano;
// - scrittura: scarica piano.json, da copiare in data/ del proprio repo di dati.

import { serializza } from "./piano.js";

const CARTELLA = new URLSearchParams(location.search).has("esempio") ? "../esempio" : "dati";

/** Il piano dei dati di esempio o di dati/piano.json, o null se non c'è. */
export async function caricaPiano() {
  try {
    const r = await fetch(`${CARTELLA}/piano.json`, { cache: "no-store" });
    if (!r.ok) return null;
    return { testo: await r.text(), origine: `${CARTELLA}/piano.json` };
  } catch {
    return null;
  }
}

/** Il piano da un file scelto a mano. */
export async function leggiFile(file) {
  return { testo: await file.text(), origine: file.name };
}

/** Salva il piano; restituisce il testo salvato. */
export async function salvaPiano(piano) {
  const testo = serializza(piano);
  const url = URL.createObjectURL(new Blob([testo], { type: "application/json" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: "piano.json" });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return testo;
}
