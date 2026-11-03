// Confronta sito/editor/piano.js con scripts/piano.py sui dati di esempio:
// le due copie della logica del piano devono dare gli stessi risultati.
//   node --test
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { controlla, espandi, serializza } from "../sito/editor/piano.js";

const radice = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const testo = readFileSync(path.join(radice, "sito", "esempio", "piano.json"), "utf-8");

// Esegue espandi e controlla di piano.py sul piano dato.
function python(piano) {
  const codice = `
import json, sys
sys.path.insert(0, ${JSON.stringify(path.join(radice, "scripts"))})
import piano as P
p = json.load(sys.stdin)
errori, avvisi = P.controlla(p)
errori = [e for e in errori if not e.startswith("campi ricavati")]
print(json.dumps({"espanso": P.espandi(p) if not errori else None, "errori": errori, "avvisi": avvisi}, ensure_ascii=False))`;
  return JSON.parse(execFileSync("python3", ["-c", codice], { input: JSON.stringify(piano) }));
}

test("il piano torna identico, byte per byte", () => {
  assert.equal(serializza(espandi(JSON.parse(testo))), testo);
});

const sposta = (id, data) => (p) => (p.sedute.find((s) => s.id === id).data = data);
const modifiche = {
  "nessuna": () => {},
  "corsa tolta": (p) => (p.sedute = p.sedute.filter((s) => s.id !== "w1s3")),
  "qualità il giorno dopo il gioco di squadra": sposta("w5s2", "2027-02-03"),
  "qualità attaccata al lungo": sposta("w5s3", "2027-02-06"),
  "id duplicato e corsa senza km": (p) => {
    p.sedute[1].id = p.sedute[0].id;
    p.sedute[0].distanza_m = null;
  },
  "fasi con un buco": (p) => (p.fasi[1].settimane = [6, 9]),
  "ritmo non valido": (p) => (p.fasi[0].ritmi.facile_lungo.min = "7"),
  "seduta fuori dal piano e fuori ordine": (p) => (p.sedute[3].data = "2026-01-01"),
  "forza con distanza": (p) => (p.sedute.find((s) => s.tipo === "forza").distanza_m = 1000),
  "senza gara": (p) => (p.sedute = p.sedute.filter((s) => s.tipo !== "gara")),
  "ritmo tolto e aggiunto": (p) => {
    delete p.sedute.find((s) => s.id === "w7s3").ritmo;
    p.sedute.find((s) => s.id === "w6s5").ritmo = "soglia"; // il test della settimana 6
  },
  "ritmi non validi": (p) => {
    p.sedute.find((s) => s.id === "w5s1").ritmo = "soglia"; // corsa facile
    p.sedute.find((s) => s.id === "w5s3").ritmo = "medio";
    p.sedute.find((s) => s.id === "w10s3").ritmo = "ripetute"; // la fase 3 non le ha
    p.sedute.find((s) => s.id === "w3s3").ritmo = "gara"; // facile in fase 1
  },
};

for (const [nome, cambia] of Object.entries(modifiche)) {
  test(`stesso esito di piano.py: ${nome}`, () => {
    const p = JSON.parse(testo);
    cambia(p);
    const atteso = python(p);
    const { errori, avvisi } = controlla(p);
    assert.deepEqual({ errori, avvisi }, { errori: atteso.errori, avvisi: atteso.avvisi });
    if (!errori.length) assert.deepEqual(espandi(p), atteso.espanso);
  });
}
