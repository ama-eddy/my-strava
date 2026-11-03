// Da dove arriva e dove va il piano. È l'unico file che sa dove stanno i dati.
//
// - Con ?esempio: i dati di esempio del sito; salvare scarica il file.
// - Con un repo di dati collegato (pagina collega/): data/piano.json del repo, letto e
//   salvato con un commit tramite l'API di GitHub.
// - Altrimenti dati/piano.json accanto alla pagina (copia locale, ignorata da git), o un
//   file scelto a mano; salvare scarica il file, da copiare in data/ del repo di dati.

import { serializza } from "./piano.js";
import { collegamento, leggi, scrivi } from "../comune/github.js";

const FILE = "data/piano.json";
const esempio = new URLSearchParams(location.search).has("esempio");
let remoto = null; // {c, sha} quando il piano viene dal repo di dati

async function locale(url, origine) {
  try {
    const r = await fetch(url, { cache: "no-store" });
    return r.ok ? { testo: await r.text(), origine } : null;
  } catch {
    return null;
  }
}

/** Il piano, {testo, origine}, o null se non c'è. Se il repo di dati non risponde lancia l'errore. */
export async function caricaPiano() {
  if (esempio) return locale("../esempio/piano.json", "dati di esempio");
  const c = collegamento();
  if (!c) return locale("dati/piano.json", "copia locale");
  const { testo, sha } = await leggi(c, FILE);
  remoto = { c, sha };
  return { testo, origine: c.repo };
}

/** Il piano da un file scelto a mano: si salverà scaricandolo. */
export async function leggiFile(file) {
  remoto = null;
  return { testo: await file.text(), origine: file.name };
}

/** Il repo in cui si salva, o null se salvare scarica il file. */
export const salvaIn = () => remoto?.c.repo ?? null;

/** Salva il piano; restituisce il testo salvato. */
export async function salvaPiano(piano) {
  const testo = serializza(piano);
  if (remoto) {
    remoto.sha = await scrivi(remoto.c, FILE, testo, remoto.sha, "Piano: modifiche dall'editor");
    return testo;
  }
  const url = URL.createObjectURL(new Blob([testo], { type: "application/json" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: "piano.json" });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return testo;
}
