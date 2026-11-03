// Controlla che l'editor (sito/editor/piano.js) dia sul piano gli stessi risultati di
// scripts/piano.py: stessi campi ricavati, byte per byte, e stessi errori e avvisi.
// Usa data/piano.json della cartella da cui si lancia, o il percorso in STRAVA_DATI.
//   node scripts/confronta_editor.mjs
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { controlla, espandi, serializza } from "../sito/editor/piano.js";

const radice = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = path.resolve(process.env.STRAVA_DATI ?? "data", "piano.json");
const testo = readFileSync(file, "utf-8");

const codice = `
import json, sys
sys.path.insert(0, ${JSON.stringify(path.join(radice, "scripts"))})
import piano as P
p = json.load(sys.stdin)
errori, avvisi = P.controlla(p)
print(json.dumps({"errori": errori, "avvisi": avvisi}, ensure_ascii=False))`;
const py = JSON.parse(execFileSync("python3", ["-c", codice], { input: testo }));
const js = controlla(JSON.parse(testo));

const problemi = [];
if (serializza(espandi(JSON.parse(testo))) !== testo) problemi.push("piano.js ricalcola i campi ricavati in modo diverso da come sono nel file");
if (JSON.stringify(js.errori) !== JSON.stringify(py.errori.filter((e) => !e.startsWith("campi ricavati")))) problemi.push(`errori diversi: piano.js ${JSON.stringify(js.errori)}, piano.py ${JSON.stringify(py.errori)}`);
if (JSON.stringify(js.avvisi) !== JSON.stringify(py.avvisi)) problemi.push(`avvisi diversi: piano.js ${JSON.stringify(js.avvisi)}, piano.py ${JSON.stringify(py.avvisi)}`);

for (const p of problemi) console.log(`ERRORE  ${p}`);
console.log(problemi.length ? `${file}: l'editor non coincide con piano.py` : `${file}: l'editor coincide con piano.py`);
process.exit(problemi.length ? 1 : 0);
