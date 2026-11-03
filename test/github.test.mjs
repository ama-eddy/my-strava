// Test di sito/comune/github.js con un fetch finto: niente rete, niente token veri.
import { test } from "node:test";
import assert from "node:assert/strict";
import { base64, leggi, scrivi, testo } from "../sito/comune/github.js";

const c = { repo: "utente/dati", token: "segreto" };

function finto(risposte) {
  const chiamate = [];
  globalThis.fetch = async (url, opzioni) => {
    chiamate.push({ url, ...opzioni });
    const [stato, corpo, grezzo] = risposte.shift();
    return { ok: stato < 300, status: stato, json: async () => corpo, text: async () => grezzo };
  };
  return chiamate;
}

test("base64 di testi con accenti e simboli, andata e ritorno", () => {
  const t = "Qualità · 5 × 1000 m — più veloce ✓\n";
  assert.equal(testo(base64(t)), t);
  assert.equal(base64("è"), Buffer.from("è").toString("base64"));
});

test("leggi: contenuto e sha, con il token nell'intestazione", async () => {
  const chiamate = finto([[200, { encoding: "base64", content: base64('{"a":"città"}'), sha: "abc" }]]);
  assert.deepEqual(await leggi(c, "data/piano.json"), { testo: '{"a":"città"}', sha: "abc" });
  assert.equal(chiamate[0].url, "https://api.github.com/repos/utente/dati/contents/data/piano.json");
  assert.equal(chiamate[0].headers.Authorization, "Bearer segreto");
});

test("leggi: sopra 1 MB chiede il file grezzo", async () => {
  const chiamate = finto([[200, { encoding: "none", content: "", sha: "big" }], [200, null, "[1,2,3]"]]);
  assert.deepEqual(await leggi(c, "data/attivita.json"), { testo: "[1,2,3]", sha: "big" });
  assert.equal(chiamate[1].headers.Accept, "application/vnd.github.raw+json");
});

test("scrivi: PUT con sha, messaggio e contenuto in base64; restituisce il nuovo sha", async () => {
  const chiamate = finto([[200, { content: { sha: "nuovo" } }]]);
  assert.equal(await scrivi(c, "data/piano.json", "ciao è\n", "vecchio", "Piano: prova"), "nuovo");
  assert.equal(chiamate[0].method, "PUT");
  assert.deepEqual(JSON.parse(chiamate[0].body), { message: "Piano: prova", content: base64("ciao è\n"), sha: "vecchio" });
});

test("errori spiegati: token scaduto, file mancante, conflitto", async () => {
  for (const [stato, parola] of [[401, "scaduto"], [404, "non c'è"], [409, "cambiato su GitHub"], [403, "permessi"]]) {
    finto([[stato, {}]]);
    await assert.rejects(leggi(c, "data/piano.json"), (e) => e.stato === stato && e.message.includes(parola));
  }
});
