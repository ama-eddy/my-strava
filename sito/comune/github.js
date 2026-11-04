// Lettura e scrittura dei file del repo di dati con l'API di GitHub.
// Il repo e il token stanno solo nel browser (localStorage), mai nel sito o nel codice.

const CHIAVE = "my-strava:github";
const API = "https://api.github.com";

/** Il collegamento salvato in questo browser, {repo: "utente/nome", token}, o null. */
export function collegamento() {
  try {
    const c = JSON.parse(localStorage.getItem(CHIAVE));
    return c?.repo && c?.token ? c : null;
  } catch {
    return null;
  }
}

export function salvaCollegamento(c) {
  localStorage.setItem(CHIAVE, JSON.stringify({ repo: c.repo.trim(), token: c.token.trim() }));
}

export function scollega() {
  localStorage.removeItem(CHIAVE);
}

export class ErroreGitHub extends Error {
  constructor(stato, messaggio) {
    super(messaggio);
    this.stato = stato;
  }
}

function spiega(stato, c, file) {
  if (stato === 401) return "Il token non è valido o è scaduto: creane uno nuovo e ricollega il repo.";
  if (stato === 403) return `Il token non ha i permessi necessari su ${c.repo}: serve Contents in lettura e scrittura.`;
  if (stato === 404) return `${file ? `${file} non c'è in ${c.repo}` : `${c.repo} non esiste`}, oppure il token non può leggerlo.`;
  if (stato === 409 || stato === 422) return `${file} è cambiato su GitHub dopo che l'hai aperto. Ricarica la pagina: le tue modifiche restano nella bozza.`;
  return `GitHub ha risposto con l'errore ${stato}.`;
}

async function chiama(c, percorso, opzioni = {}, file) {
  let r;
  try {
    r = await fetch(`${API}/repos/${c.repo}${percorso}`, {
      cache: "no-store",
      ...opzioni,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${c.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...opzioni.headers,
      },
    });
  } catch {
    throw new ErroreGitHub(0, "GitHub non risponde: controlla la connessione.");
  }
  if (!r.ok) throw new ErroreGitHub(r.status, spiega(r.status, c, file));
  return r;
}

// Base64 di un testo UTF-8, e ritorno.
export function base64(testo) {
  const byte = new TextEncoder().encode(testo);
  let s = "";
  for (let i = 0; i < byte.length; i += 0x8000) s += String.fromCharCode(...byte.subarray(i, i + 0x8000));
  return btoa(s);
}
export function testo(b64) {
  return new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, "")), (x) => x.charCodeAt(0)));
}

const percorsoFile = (file) => `/contents/${file.split("/").map(encodeURIComponent).join("/")}`;

/** Le informazioni del repo: serve a controllare repo e token. */
export async function leggiRepo(c) {
  return (await chiama(c, "")).json();
}

/** Il file del repo, {testo, sha}. Sopra 1 MB l'API non dà il contenuto: lo si chiede grezzo. */
export async function leggi(c, file) {
  const x = await (await chiama(c, percorsoFile(file), {}, file)).json();
  if (x.encoding === "base64" && x.content) return { testo: testo(x.content), sha: x.sha };
  const grezzo = await chiama(c, percorsoFile(file), { headers: { Accept: "application/vnd.github.raw+json" } }, file);
  return { testo: await grezzo.text(), sha: x.sha };
}

/** Scrive il file con un commit sul branch principale; sha è quello della versione letta. Restituisce il nuovo sha. */
export async function scrivi(c, file, contenuto, sha, messaggio) {
  const r = await chiama(c, percorsoFile(file), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: messaggio, content: base64(contenuto), sha }),
  }, file);
  return (await r.json()).content.sha;
}
