// Da dove arrivano i dati. È l'unico file che sa dove stanno.
//
// Per ora: con ?esempio i dati di esempio del sito, altrimenti dati/piano.json e
// dati/attivita.json accanto alla pagina (copia locale, ignorata da git), oppure i due
// file scelti a mano.

const NOMI = ["piano.json", "attivita.json"];
const CARTELLA = new URLSearchParams(location.search).has("esempio") ? "../esempio" : "dati";

async function leggi(nome) {
  try {
    const r = await fetch(`${CARTELLA}/${nome}`, { cache: "no-store" });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

/** {piano, attivita} dagli esempi o da dati/, o null se manca uno dei due. */
export async function caricaDati() {
  const [piano, attivita] = await Promise.all(NOMI.map(leggi));
  return piano && attivita ? { piano, attivita } : null;
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
  return dati;
}
