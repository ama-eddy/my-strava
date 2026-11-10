// Test del tratto del test, della previsione e dei ritmi suggeriti (sito/report/analisi.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { analizza, distanzaTest, obiettivoTratto, riegel, ritmiSuggeriti, trattiFatti, trattoTest } from "../sito/report/analisi.js";

const giri = (...x) => x.map(([m, s]) => ({ distanza_m: m, tempo_s: s, ritmo_s_km: Math.round(s / (m / 1000)) }));

test("tratto del test: i giri consecutivi più veloci sulla distanza del test", () => {
  // 2 km di riscaldamento, 5 × 1 km di test, 1 km di defaticamento
  const a = { distanza_m: 8000, tempo_movimento_s: 2900, giri: giri([1000, 415], [1000, 415], [1000, 330], [1000, 332], [1000, 328], [1000, 330], [1000, 330], [1000, 425]) };
  assert.deepEqual(trattoTest(a, 5000), { da_giri: true, distanza_m: 5000, tempo_s: 1650, ritmo_s_km: 330 });
});

test("tratto del test: un giro solo per il test, premuto a mano", () => {
  const a = { distanza_m: 7500, tempo_movimento_s: 2800, giri: giri([1500, 640], [5010, 1660], [990, 420]) };
  assert.deepEqual(trattoTest(a, 5000), { da_giri: true, distanza_m: 5010, tempo_s: 1660, ritmo_s_km: 331 });
});

test("tratto del test senza giri: l'attività intera solo se è lunga quanto il test", () => {
  assert.deepEqual(trattoTest({ distanza_m: 5050, tempo_movimento_s: 1700 }, 5000), { da_giri: false, distanza_m: 5050, tempo_s: 1700, ritmo_s_km: 337 });
  assert.equal(trattoTest({ distanza_m: 8000, tempo_movimento_s: 2900 }, 5000), null);
});

test("Riegel e ritmi suggeriti", () => {
  assert.equal(Math.round(riegel(1600, 5000, 10000)), 3336); // 26:40 sui 5 km → 55:36 sui 10
  assert.deepEqual(ritmiSuggeriti({ distanza_m: 5000, tempo_s: 1600 }, 10000), {
    facile_lungo: { min: 380, max: 410 }, soglia: { min: 335, max: 345 }, ripetute: { min: 315, max: 325 }, gara: { min: 330, max: 335 },
  });
});

test("andamento sui dati di esempio: due test, previsione e ritmi da ricalibrare", () => {
  const leggi = (f) => JSON.parse(readFileSync(new URL(`../sito/esempio/${f}`, import.meta.url)));
  const a = analizza(leggi("piano.json"), leggi("attivita.json"), "2027-03-17").andamento;
  assert.deepEqual(a.test.map((t) => [t.seduta.id, t.tempo_s, t.differenza_s, t.precedente]),
    [["w6s5", 1664, null, null], ["w10s5", 1598, -66, "2027-02-14"]]);
  assert.equal(a.ultimo.seduta.id, "w10s5");
  assert.equal(a.obiettivo_s, 57 * 60);
  assert.ok(a.ultimo.previsione_s < a.obiettivo_s);
  // restano solo le fasi in corso e future: la fase 3
  assert.deepEqual(a.ricalibra.map((x) => [x.fase, x.ritmo, x.scarto_s]), [[3, "facile_lungo", -10], [3, "soglia", -15], [3, "gara", -10]]);
  // prima del secondo test i suggerimenti vengono dal primo
  const prima = analizza(leggi("piano.json"), leggi("attivita.json"), "2027-03-10").andamento;
  assert.equal(prima.ultimo.seduta.id, "w6s5");
});

// ---------- Tratti km per km ----------

const piano = { fasi: [{ fase: 2, ritmi: { facile_lungo: { min: "6:30", max: "7:00" }, soglia: { min: "5:50", max: "6:00" } } }] };
const seduta = (tratti) => ({ fase: 2, tipo: "qualita", tratti, distanza_m: 1000 * tratti.reduce((t, x) => t + x.km, 0) });

test("obiettivo di un tratto: ritmo della fase, preciso con tolleranza, fascia", () => {
  const s = seduta([]);
  assert.deepEqual(obiettivoTratto(piano, s, { km: 1, tipo: "corsa", ritmo: "soglia" }), { min: 350, max: 360, nome: "soglia" });
  assert.deepEqual(obiettivoTratto(piano, s, { km: 1, tipo: "corsa", ritmo: "6:05" }), { min: 360, max: 370, preciso: 365 });
  assert.deepEqual(obiettivoTratto(piano, s, { km: 1, tipo: "corsa", ritmo: "5:45-5:50" }), { min: 345, max: 350 });
  assert.equal(obiettivoTratto(piano, s, { km: 1, tipo: "riscaldamento" }), null);
  assert.equal(obiettivoTratto(piano, s, { km: 1, tipo: "corsa", ritmo: "gara" }), null); // la fase non ce l'ha
});

test("tratti fatti: i giri da 1 km vanno al loro tratto, con l'esito", () => {
  const s = seduta([{ km: 2, tipo: "riscaldamento", ritmo: "facile_lungo" }, { km: 3, tipo: "corsa", ritmo: "soglia" }, { km: 1, tipo: "defaticamento" }]);
  const a = { giri: giri([1000, 410], [1000, 405], [1000, 352], [1000, 362], [1000, 358], [1030, 440]) };
  assert.deepEqual(trattiFatti(piano, s, a).map((x) => [x.da_km, x.a_km, x.distanza_m, x.tempo_s, x.ritmo_s_km, x.esito]), [
    [0, 2, 2000, 815, 408, "nel_ritmo"],
    [2, 5, 3000, 1072, 357, "nel_ritmo"],
    [5, 6, 1030, 440, 427, null], // il defaticamento non ha un ritmo
  ]);
});

test("tratti fatti: con un giro solo per tutta la corsa non si misura niente", () => {
  const s = seduta([{ km: 2, tipo: "riscaldamento" }, { km: 5, tipo: "test" }, { km: 1, tipo: "defaticamento" }]);
  assert.ok(trattiFatti(piano, s, { giri: [] }).every((x) => x.ritmo_s_km === null));
  assert.ok(trattiFatti(piano, s, { giri: giri([8000, 2900]) }).every((x) => x.ritmo_s_km === null));
});

test("distanza del test: il tratto di test, se c'è", () => {
  assert.equal(distanzaTest({ distanza_m: 8000, tratti: [{ km: 2, tipo: "riscaldamento" }, { km: 5, tipo: "test" }, { km: 1, tipo: "defaticamento" }] }), 5000);
  assert.equal(distanzaTest({ distanza_m: 5000 }), 5000);
});
