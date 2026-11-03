// Confronto tra il piano (piano.json) e le attività (attivita.json).
// Funzioni pure: niente pagina, così si provano con node --test.

export const TIPI_CORSA = ["facile", "qualita", "lungo", "test", "gara"];
const LUNGHI = ["lungo", "test", "gara"];

// Tipo di attività su Strava -> tipo di seduta del piano (vedi le decisioni nella ROADMAP).
export const SPORT_TIPO = {
  Volleyball: "volley",
  WeightTraining: "forza",
  Yoga: "mobilita",
  Walk: "camminata",
  Hike: "trekking",
};

const GIORNO_MS = 86400000;
export const giorno = (iso) => Date.parse(iso + "T00:00:00Z") / GIORNO_MS;
export const iso = (g) => new Date(g * GIORNO_MS).toISOString().slice(0, 10);
export const secondiKm = (r) => {
  const [m, s] = r.split(":");
  return +m * 60 + +s;
};
export const settimanaDi = (piano, data) => Math.floor((giorno(data) - giorno(piano.inizio)) / 7) + 1;
const corsa = (a) => a.sport === "Run" || a.sport === "TrailRun" || a.sport === "VirtualRun";

/**
 * Ritmo obiettivo di una seduta in secondi al km, o null se il piano non lo dà:
 * {min, max}, più `nome` (soglia, ripetute, gara) quando viene dal campo `ritmo` della seduta,
 * `nota` della fase se c'è, e `indicativo` quando il ritmo medio dell'attività non basta a
 * giudicarlo.
 * - Facile e lungo: il ritmo facile della fase.
 * - Gara: l'obiettivo della gara, se è la gara del piano; altrimenti il ritmo scelto con
 *   `ritmo`, o il ritmo gara della fase.
 * - Qualità e test: il ritmo scelto con `ritmo`, solo indicativo, perché il ritmo medio di
 *   Strava include riscaldamento e recuperi. Senza `ritmo`, null.
 */
export function ritmoObiettivo(piano, s) {
  const fase = piano.fasi.find((f) => f.fase === s.fase);
  let r = null;
  const altro = {};
  if (s.tipo === "facile" || s.tipo === "lungo") r = fase?.ritmi.facile_lungo;
  else if (s.tipo === "gara") {
    const g = piano.gara.obiettivo_ritmo;
    if (s.data === piano.gara.data && g) r = { min: g, max: g };
    else r = fase?.ritmi[s.ritmo ?? "gara"];
  } else if ((s.tipo === "qualita" || s.tipo === "test") && s.ritmo) {
    r = fase?.ritmi[s.ritmo];
    altro.indicativo = true;
  }
  if (!r) return null;
  if (s.ritmo && !(s.tipo === "gara" && s.data === piano.gara.data)) altro.nome = s.ritmo;
  if (altro.nome && r.nota) altro.nota = r.nota;
  return { min: secondiKm(r.min), max: secondiKm(r.max), ...altro };
}

/** "veloce", "lento" o "nel_ritmo"; null se manca l'obiettivo o il ritmo. */
export function esitoRitmo(obiettivo, ritmo) {
  if (!obiettivo || ritmo == null) return null;
  if (ritmo < obiettivo.min) return "veloce";
  if (ritmo > obiettivo.max) return "lento";
  return "nel_ritmo";
}

/**
 * Abbina piano e attività fino al giorno `oggi` (ISO).
 *
 * Stato di ogni seduta:
 * - fatta: c'è l'attività, lo stesso giorno;
 * - spostata: c'è l'attività, in un altro giorno;
 * - saltata: giorno passato, nessuna attività;
 * - da_fare: oggi o dopo, nessuna attività ancora.
 *
 * Le corse si abbinano su numero_piano; le altre sedute sul tipo di attività Strava,
 * prima lo stesso giorno e poi la stessa settimana. Le attività dal primo giorno del piano
 * a oggi che non corrispondono a niente sono "extra".
 */
export function analizza(piano, attivita, oggi) {
  const nelPiano = attivita
    .filter((a) => piano.inizio <= a.data && a.data <= oggi)
    .sort((a, b) => (a.data + (a.ora ?? "")).localeCompare(b.data + (b.ora ?? "")));
  const usate = new Set();
  const abbinate = new Map(); // id seduta -> attività

  const perNumero = new Map(nelPiano.filter((a) => a.numero_piano != null).map((a) => [a.numero_piano, a]));
  for (const s of piano.sedute) {
    if (!s.corsa) continue;
    const a = perNumero.get(s.numero_piano);
    if (a) {
      abbinate.set(s.id, a);
      usate.add(a);
    }
  }

  const altre = piano.sedute.filter((s) => !s.corsa);
  const libera = (s, stessoGiorno) =>
    nelPiano.find((a) => !usate.has(a) && SPORT_TIPO[a.sport] === s.tipo &&
      (stessoGiorno ? a.data === s.data : settimanaDi(piano, a.data) === s.settimana));
  for (const stessoGiorno of [true, false]) {
    for (const s of altre) {
      if (abbinate.has(s.id)) continue;
      const a = libera(s, stessoGiorno);
      if (a) {
        abbinate.set(s.id, a);
        usate.add(a);
      }
    }
  }

  const sedute = piano.sedute.map((s) => {
    const a = abbinate.get(s.id) ?? null;
    const stato = a ? (a.data === s.data ? "fatta" : "spostata") : s.data < oggi ? "saltata" : "da_fare";
    const obiettivo = s.corsa ? ritmoObiettivo(piano, s) : null;
    const esito = a && !obiettivo?.indicativo ? esitoRitmo(obiettivo, a.ritmo_s_km) : null;
    return { ...s, stato, attivita: a, obiettivo, esito };
  });
  const extra = nelPiano.filter((a) => !usate.has(a));

  const corse = nelPiano.filter(corsa);
  const settimane = piano.settimane.map((w) => {
    const sw = sedute.filter((s) => s.settimana === w.settimana);
    const lunghi = sw.filter((s) => LUNGHI.includes(s.tipo));
    const lunghiFatti = lunghi.filter((s) => s.attivita).map((s) => s.attivita.distanza_m ?? 0);
    const iniziata = w.dal <= oggi;
    return {
      settimana: w.settimana,
      fase: w.fase,
      tipo: w.tipo,
      dal: w.dal,
      al: w.al,
      nota: w.nota,
      previsto_m: w.distanza_m,
      fatto_m: iniziata ? corse.filter((a) => w.dal <= a.data && a.data <= w.al).reduce((t, a) => t + (a.distanza_m ?? 0), 0) : null,
      lungo_previsto_m: Math.max(0, ...lunghi.map((s) => s.distanza_m)) || null,
      lungo_fatto_m: lunghiFatti.length ? Math.max(...lunghiFatti) : null,
      sedute: sw,
      extra: extra.filter((a) => w.dal <= a.data && a.data <= w.al),
    };
  });

  // Fino a oggi: le corse previste nei giorni passati più quelle già fatte (anche in anticipo).
  const corsePiano = sedute.filter((s) => s.corsa);
  const finora = corsePiano.filter((s) => s.data < oggi || s.attivita);
  const conRitmo = sedute.filter((s) => s.esito);
  const totali = {
    giorni_alla_gara: Math.max(0, giorno(piano.gara.data) - giorno(oggi)),
    corse_fatte: corsePiano.filter((s) => s.attivita).length,
    corse_finora: finora.length,
    corse_totali: piano.totale_corse,
    km_fatti_m: corse.reduce((t, a) => t + (a.distanza_m ?? 0), 0),
    km_finora_m: finora.reduce((t, s) => t + s.distanza_m, 0),
    km_totali_m: piano.settimane.reduce((t, w) => t + w.distanza_m, 0),
    nel_ritmo: conRitmo.filter((s) => s.esito === "nel_ritmo").length,
    con_ritmo: conRitmo.length,
  };

  const test = sedute.filter((s) => s.tipo === "test" || s.tipo === "gara");
  return { oggi, settimana_corrente: settimanaDi(piano, oggi), sedute, extra, settimane, totali, test, andamento: andamentoTest(piano, sedute, oggi) };
}

// ---------- Test: tratto, andamento, previsione e ritmi suggeriti ----------
// Le stime usano regole pratiche diffuse tra chi corre, non un modello fisiologico:
// servono a capire se i ritmi del piano sono ancora quelli giusti, non a sostituirli.

/**
 * Il tratto del test dentro l'attività, {distanza_m, tempo_s, ritmo_s_km, da_giri}, o null.
 * Con i giri di Strava: i giri consecutivi più veloci che insieme fanno la distanza del test
 * (dal 97% al 110%), così riscaldamento e defaticamento restano fuori. Senza giri: l'attività
 * intera, ma solo se è lunga quanto il test.
 */
export function trattoTest(a, distanza_m) {
  const dentro = (m) => m >= distanza_m * 0.97 && m <= distanza_m * 1.1;
  const giri = a.giri ?? [];
  let migliore = null;
  for (let i = 0; i < giri.length; i++) {
    let m = 0;
    let t = 0;
    for (let j = i; j < giri.length && m < distanza_m * 1.1; j++) {
      m += giri[j].distanza_m;
      t += giri[j].tempo_s;
      if (dentro(m) && (!migliore || t / m < migliore.tempo_s / migliore.distanza_m)) migliore = { distanza_m: m, tempo_s: t };
    }
  }
  if (!migliore && a.distanza_m && a.tempo_movimento_s && dentro(a.distanza_m)) {
    migliore = { distanza_m: a.distanza_m, tempo_s: a.tempo_movimento_s, da_giri: false };
  }
  if (!migliore) return null;
  return { da_giri: true, ...migliore, ritmo_s_km: Math.round(migliore.tempo_s / (migliore.distanza_m / 1000)) };
}

/** Tempo previsto su un'altra distanza, con la formula di Riegel: t2 = t1 × (d2 / d1)^1.06. */
export const riegel = (tempo_s, da_m, a_m) => tempo_s * (a_m / da_m) ** 1.06;

const secondiTempo = (t) => t.split(":").reduce((s, x) => s * 60 + +x, 0);
const a5 = (s) => Math.round(s / 5) * 5;

/**
 * Fasce di ritmo suggerite da un test, in secondi al km. Partono dal ritmo equivalente sui
 * 5 km (con Riegel, se il test è su un'altra distanza):
 * - facile e lungo: da 60 a 90 secondi al km più lento;
 * - soglia: da 15 a 25 secondi più lento;
 * - ripetute: da 5 più veloce a 5 più lento;
 * - gara: il ritmo della previsione sulla gara del piano, 3 secondi in più o in meno.
 */
export function ritmiSuggeriti(tratto, gara_m) {
  const p5 = riegel(tratto.tempo_s, tratto.distanza_m, 5000) / 5;
  const pg = riegel(tratto.tempo_s, tratto.distanza_m, gara_m) / (gara_m / 1000);
  const fascia = (da, a) => ({ min: a5(p5 + da), max: a5(p5 + a) });
  return {
    facile_lungo: fascia(60, 90),
    soglia: fascia(15, 25),
    ripetute: fascia(-5, 5),
    gara: { min: a5(pg - 3), max: a5(pg + 3) },
  };
}

// Sotto questa differenza (secondi al km, al centro della fascia) i ritmi si considerano in linea.
export const SCARTO_RITMI_S = 10;

/**
 * I test fatti, in ordine, con il tratto del test, il confronto con il test precedente e la
 * previsione sulla gara; più i ritmi da ricalibrare dopo l'ultimo test.
 * Restituisce {test: [...], ultimo, ricalibra: [...]}.
 * - test[i]: {seduta, tratto (o null se non si ricava), tempo_s (sulla distanza prevista),
 *   differenza_s (secondi rispetto al test precedente sulla stessa distanza), differenza_ritmo_s
 *   (secondi al km rispetto al test precedente), precedente (data del test precedente),
 *   previsione_s (tempo previsto sulla gara)}. Senza un test precedente le differenze sono null.
 * - ricalibra: per le fasi in corso e future, i ritmi che si scostano di almeno SCARTO_RITMI_S
 *   da quelli suggeriti: {fase, nome, ritmo, attuale {min, max}, suggerito {min, max}, scarto_s}.
 *   scarto_s < 0: il test dice che puoi andare più veloce.
 */
export function andamentoTest(piano, sedute, oggi) {
  const gara_m = piano.gara.distanza_m;
  const fatti = sedute.filter((s) => s.tipo === "test" && s.attivita).sort((a, b) => a.data.localeCompare(b.data));
  let precedente = null;
  const test = fatti.map((s) => {
    const tratto = trattoTest(s.attivita, s.distanza_m);
    if (!tratto) return { seduta: s, tratto: null, tempo_s: null, differenza_s: null, differenza_ritmo_s: null, precedente: null, previsione_s: null };
    const tempo_s = Math.round(tratto.tempo_s * s.distanza_m / tratto.distanza_m);
    const confrontabile = precedente && precedente.seduta.distanza_m === s.distanza_m;
    const x = {
      seduta: s,
      tratto,
      tempo_s,
      differenza_s: confrontabile ? tempo_s - precedente.tempo_s : null,
      differenza_ritmo_s: precedente ? tratto.ritmo_s_km - precedente.tratto.ritmo_s_km : null,
      precedente: precedente?.seduta.attivita.data ?? null,
      previsione_s: Math.round(riegel(tratto.tempo_s, tratto.distanza_m, gara_m)),
    };
    precedente = x;
    return x;
  });
  const ultimo = precedente;
  const ricalibra = [];
  if (ultimo) {
    const suggeriti = ritmiSuggeriti(ultimo.tratto, gara_m);
    const settimana = settimanaDi(piano, oggi);
    for (const f of piano.fasi) {
      if (f.settimane[1] < settimana) continue;
      for (const [k, sug] of Object.entries(suggeriti)) {
        const r = f.ritmi[k];
        if (!r) continue;
        const attuale = { min: secondiKm(r.min), max: secondiKm(r.max) };
        const scarto_s = Math.round((sug.min + sug.max) / 2 - (attuale.min + attuale.max) / 2);
        if (Math.abs(scarto_s) >= SCARTO_RITMI_S) ricalibra.push({ fase: f.fase, nome: f.nome, ritmo: k, attuale, suggerito: sug, scarto_s });
      }
    }
  }
  return { test, ultimo, obiettivo_s: piano.gara.obiettivo_tempo ? secondiTempo(piano.gara.obiettivo_tempo) : null, ricalibra };
}
