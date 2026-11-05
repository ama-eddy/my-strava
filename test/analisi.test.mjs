// node --test
import { test } from "node:test";
import assert from "node:assert/strict";
import { analizza, esitoRitmo, ritmoObiettivo } from "../sito/report/analisi.js";

// Un piano piccolo, nello stesso formato di piano.json: due settimane e la gara.
const seduta = (id, data, tipo, numero, km, settimana) => ({
  id, data, settimana, fase: 1, tipo, descrizione: tipo, corsa: numero != null,
  numero_piano: numero, distanza_m: km == null ? null : km * 1000,
});
const piano = {
  inizio: "2026-10-05",
  gara: { nome: "Gara", data: "2026-10-18", distanza_m: 10000, obiettivo_ritmo: "5:40" },
  totale_corse: 5,
  fasi: [{ fase: 1, settimane: [1, 2], ritmi: { facile_lungo: { min: "6:30", max: "7:00" }, gara: null } }],
  settimane: [
    { settimana: 1, fase: 1, tipo: null, dal: "2026-10-05", al: "2026-10-11", distanza_m: 18000, nota: null },
    { settimana: 2, fase: 1, tipo: "gara", dal: "2026-10-12", al: "2026-10-18", distanza_m: 15000, nota: null },
  ],
  sedute: [
    seduta("w1s1", "2026-10-05", "facile", 1, 4, 1),
    seduta("w1s2", "2026-10-06", "volley", null, null, 1),
    seduta("w1s3", "2026-10-08", "qualita", 2, 6, 1),
    seduta("w1s4", "2026-10-11", "lungo", 3, 8, 1),
    seduta("w2s1", "2026-10-12", "facile", 4, 5, 2),
    seduta("w2s2", "2026-10-13", "volley", null, null, 2),
    seduta("w2s3", "2026-10-18", "gara", 5, 10, 2),
  ],
};
const corsa = (data, numero, km, ritmo, nome = `${numero}/5`) =>
  ({ data, ora: "18:00", nome, sport: "Run", numero_piano: numero, distanza_m: km * 1000, ritmo_s_km: ritmo });
const altro = (data, sport) => ({ data, ora: "20:00", nome: sport, sport, numero_piano: null, distanza_m: null, ritmo_s_km: null });

const attivita = [
  corsa("2026-09-30", null, 5, 360, "Prima del piano"),
  corsa("2026-10-05", 1, 4.1, 400), // fatta, nel ritmo (6:40)
  altro("2026-10-07", "Volleyball"), // spostata di un giorno
  corsa("2026-10-09", 2, 6, 330), // spostata; qualità: nessun obiettivo
  // corsa 3 saltata
  corsa("2026-10-12", 4, 5, 380), // fatta, troppo veloce (6:20)
  altro("2026-10-12", "WeightTraining"), // extra: niente forza nel piano
  corsa("2026-10-13", null, 3, 420, "Corsetta"), // extra
];

test("stati delle sedute", () => {
  const r = analizza(piano, attivita, "2026-10-14");
  const stati = Object.fromEntries(r.sedute.map((s) => [s.id, s.stato]));
  assert.deepEqual(stati, {
    w1s1: "fatta", w1s2: "spostata", w1s3: "spostata", w1s4: "saltata",
    w2s1: "fatta", w2s2: "saltata", w2s3: "da_fare",
  });
  assert.deepEqual(r.extra.map((a) => a.nome), ["WeightTraining", "Corsetta"]);
  assert.equal(r.settimana_corrente, 2);
});

test("oggi non è saltata: la seduta di oggi resta da fare", () => {
  const r = analizza(piano, attivita, "2026-10-13");
  assert.equal(r.sedute.find((s) => s.id === "w2s2").stato, "da_fare");
  assert.equal(r.extra.find((a) => a.nome === "Corsetta").data, "2026-10-13");
});

test("ritmi", () => {
  const r = analizza(piano, attivita, "2026-10-14");
  const esiti = Object.fromEntries(r.sedute.filter((s) => s.corsa).map((s) => [s.id, s.esito]));
  assert.deepEqual(esiti, { w1s1: "nel_ritmo", w1s3: null, w1s4: null, w2s1: "veloce", w2s3: null });
  assert.deepEqual(ritmoObiettivo(piano, r.sedute.find((s) => s.id === "w2s3")), { min: 340, max: 340 });
  assert.equal(esitoRitmo({ min: 390, max: 420 }, 421), "lento");
  assert.equal(r.totali.nel_ritmo, 1);
  assert.equal(r.totali.con_ritmo, 2);
});

test("campo ritmo: qualità e test indicativi, gare intermedie con esito", () => {
  const p = structuredClone(piano);
  p.fasi[0].ritmi.soglia = { min: "5:50", max: "6:00", nota: "medio" };
  p.sedute.find((s) => s.id === "w1s3").ritmo = "soglia"; // qualità, fatta a 5:30
  const intermedia = { ...p.sedute.find((s) => s.id === "w1s4"), tipo: "gara", ritmo: "soglia" };
  p.sedute = p.sedute.map((s) => (s.id === "w1s4" ? intermedia : s));
  const att = [...attivita, corsa("2026-10-11", 3, 8, 355)];
  const r = analizza(p, att, "2026-10-14");
  const q = r.sedute.find((s) => s.id === "w1s3");
  assert.deepEqual(q.obiettivo, { min: 350, max: 360, nome: "soglia", nota: "medio", indicativo: true });
  assert.equal(q.esito, null);
  const g = r.sedute.find((s) => s.id === "w1s4");
  assert.deepEqual(g.obiettivo, { min: 350, max: 360, nome: "soglia", nota: "medio" });
  assert.equal(g.esito, "nel_ritmo");
  // la gara del piano resta sull'obiettivo della gara, anche con un ritmo
  const finale = { ...p.sedute.find((s) => s.id === "w2s3"), ritmo: "soglia" };
  assert.deepEqual(ritmoObiettivo(p, finale), { min: 340, max: 340 });
});

test("volumi e totali", () => {
  const r = analizza(piano, attivita, "2026-10-14");
  const [w1, w2] = r.settimane;
  assert.equal(w1.fatto_m, 10100);
  assert.equal(w2.fatto_m, 8000);
  assert.equal(w1.lungo_previsto_m, 8000);
  assert.equal(w1.lungo_fatto_m, null);
  assert.equal(w2.lungo_previsto_m, 10000);
  assert.deepEqual(
    { ...r.totali },
    { giorni_alla_gara: 4, corse_fatte: 3, corse_finora: 4, corse_totali: 5, km_fatti_m: 18100, km_finora_m: 23000,
      km_totali_m: 33000, nel_ritmo: 1, con_ritmo: 2 },
  );
  assert.equal(analizza(piano, attivita, "2026-10-04").settimane[0].fatto_m, null);
});
