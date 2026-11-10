// Logica del piano: la stessa di scripts/piano.py.
// Se cambia una, va cambiata anche l'altra: test/piano.test.mjs le confronta.

export const TIPI_CORSA = ["facile", "qualita", "lungo", "test", "gara"];
export const TIPI_ALTRI = ["volley", "forza", "mobilita", "camminata", "trekking"];
export const TIPI_SEDUTA = [...TIPI_CORSA, ...TIPI_ALTRI];
export const TIPI_SETTIMANA = [null, "scarico", "test", "gara"];
export const RITMI = ["facile_lungo", "soglia", "ripetute", "gara"];
// Il campo facoltativo `ritmo` di una seduta: quale ritmo della fase vale per qualità, test e gara.
export const RITMI_SEDUTA = ["soglia", "ripetute", "gara"];
export const TIPI_CON_RITMO = ["qualita", "test", "gara"];
// Il campo facoltativo `tratti` di una corsa: la corsa km per km, a blocchi.
export const TIPI_TRATTO = ["riscaldamento", "corsa", "test", "defaticamento"];
export const GIORNI = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
const RITMO = /^\d{1,2}:[0-5]\d$/;
const RITMO_TRATTO = /^(\d{1,2}:[0-5]\d)(?:-(\d{1,2}:[0-5]\d))?$/;
const GIORNO_MS = 86400000;

export const secondiKm = (r) => {
  const [m, s] = r.split(":");
  return +m * 60 + +s;
};

// Date ISO come giorni dal 1970, in UTC: niente sorprese con l'ora legale.
export const giorno = (iso) => Date.parse(iso + "T00:00:00Z") / GIORNO_MS;
export const iso = (g) => new Date(g * GIORNO_MS).toISOString().slice(0, 10);
export const giornoSettimana = (d) => (((giorno(d) + 3) % 7) + 7) % 7; // 0 = lunedì
const dataValida = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && iso(giorno(s)) === s;

export const settimanaDi = (piano, data) => Math.floor((giorno(data) - giorno(piano.inizio)) / 7) + 1;

export function faseDi(piano, settimana) {
  for (const f of piano.fasi) {
    const [a, b] = f.settimane;
    if (a <= settimana && settimana <= b) return f.fase;
  }
  return null;
}

/** I metri di una corsa con i tratti: la somma dei km dei tratti. */
export const distanzaTratti = (tratti) => Math.round(tratti.reduce((t, x) => t + x.km, 0) * 1000);

const kmValido = (x) => typeof x === "number" && Number.isFinite(x) && x > 0 && Math.abs(x * 10 - Math.round(x * 10)) < 1e-9;
const trattiValidi = (tratti) => Array.isArray(tratti) && tratti.every((t) => t && typeof t === "object" && !Array.isArray(t) && kmValido(t.km));

export const ordina = (sedute) =>
  sedute.map((s, i) => [s, i]).sort((x, y) => (x[0].data < y[0].data ? -1 : x[0].data > y[0].data ? 1 : x[1] - y[1])).map((x) => x[0]);

/** Il piano con i campi ricavati ricalcolati dai dati di base. */
export function espandi(piano) {
  const tipoSettimana = new Map(piano.settimane.map((w) => [w.settimana, w.tipo]));
  let numero = 0;
  const sedute = ordina(piano.sedute).map((s) => {
    const n = settimanaDi(piano, s.data);
    const corsa = TIPI_CORSA.includes(s.tipo);
    if (corsa) numero += 1;
    const seduta = {
      id: s.id,
      data: s.data,
      giorno: GIORNI[giornoSettimana(s.data)],
      settimana: n,
      fase: faseDi(piano, n),
      tipo_settimana: tipoSettimana.has(n) ? tipoSettimana.get(n) : null,
      tipo: s.tipo,
      descrizione: s.descrizione,
      corsa,
      numero_piano: corsa ? numero : null,
      distanza_m: s.distanza_m ?? null,
    };
    if (s.ritmo != null) seduta.ritmo = s.ritmo; // solo se c'è, così i piani senza ritmo non cambiano
    if (s.tratti != null) { // come ritmo; con i tratti la distanza è la loro somma
      seduta.tratti = s.tratti;
      if (s.tratti.length && trattiValidi(s.tratti)) seduta.distanza_m = distanzaTratti(s.tratti);
    }
    return seduta;
  });
  const settimane = piano.settimane.map((w) => {
    const n = w.settimana;
    const dal = giorno(piano.inizio) + (n - 1) * 7;
    return {
      settimana: n,
      fase: faseDi(piano, n),
      tipo: w.tipo,
      dal: iso(dal),
      al: iso(dal + 6),
      distanza_m: sedute.filter((s) => s.corsa && s.settimana === n).reduce((t, s) => t + s.distanza_m, 0),
      nota: w.nota,
    };
  });
  return {
    versione: piano.versione ?? 1,
    inizio: piano.inizio,
    gara: piano.gara,
    totale_corse: numero,
    fasi: piano.fasi,
    settimane,
    sedute,
    settimana_tipo: piano.settimana_tipo ?? [],
    regole: piano.regole ?? [],
  };
}

function controllaTratti(piano, s, sid, err) {
  const tratti = s.tratti;
  if (!TIPI_CORSA.includes(s.tipo)) {
    err(`${sid}: solo le corse hanno i tratti`);
    return;
  }
  if (!Array.isArray(tratti) || !tratti.length) {
    err(`${sid}: tratti vuoti o non validi`);
    return;
  }
  const n = faseDi(piano, settimanaDi(piano, s.data));
  const fase = piano.fasi.find((f) => f.fase === n);
  tratti.forEach((t, idx) => {
    const i = idx + 1;
    if (!t || typeof t !== "object" || Array.isArray(t)) {
      err(`${sid}: tratto ${i} non valido`);
      return;
    }
    if (!kmValido(t.km)) err(`${sid}: tratto ${i}: km deve essere positivo, al massimo con un decimale`);
    if (!TIPI_TRATTO.includes(t.tipo)) err(`${sid}: tratto ${i}: tipo '${t.tipo}' non valido`);
    const r = t.ritmo;
    if (r == null) return;
    if (RITMI.includes(r)) {
      if (fase && !fase.ritmi?.[r]) err(`${sid}: tratto ${i}: la fase ${n} non ha il ritmo ${r}`);
      return;
    }
    const m = typeof r === "string" ? RITMO_TRATTO.exec(r) : null;
    if (!m || (m[2] && secondiKm(m[1]) > secondiKm(m[2]))) err(`${sid}: tratto ${i}: ritmo '${r}' non valido`);
  });
  const test = tratti.filter((t) => t && typeof t === "object" && t.tipo === "test").length;
  if (test && s.tipo !== "test") err(`${sid}: solo i test hanno un tratto di test`);
  else if (test > 1) err(`${sid}: più di un tratto di test`);
}

/** Restituisce {errori, avvisi}, come controlla() in piano.py, senza il controllo
 * dei campi ricavati: l'editor li ricalcola sempre prima di salvare. */
export function controlla(piano) {
  const errori = [];
  const avvisi = [];
  const err = (m) => errori.push(m);

  for (const campo of ["inizio", "gara", "fasi", "settimane", "sedute"]) {
    if (!(campo in piano)) err(`manca il campo '${campo}'`);
  }
  if (errori.length) return { errori, avvisi };

  if (!dataValida(piano.inizio) || !dataValida(piano.gara?.data)) {
    return { errori: ["date di inizio o gara non valide"], avvisi };
  }
  const inizio = piano.inizio;
  const gara = piano.gara.data;
  if (giornoSettimana(inizio) !== 0) err(`inizio ${inizio} non è un lunedì`);
  if (gara <= inizio) err("la gara è prima dell'inizio");
  const rg = piano.gara.obiettivo_ritmo;
  if (rg != null && !RITMO.test(rg)) err(`gara.obiettivo_ritmo '${rg}' non è nel formato m:ss`);
  const nSettimane = settimanaDi(piano, gara);

  // Fasi: contigue e a copertura di tutte le settimane
  let attesa = 1;
  piano.fasi.forEach((f, idx) => {
    const i = idx + 1;
    if (f.fase !== i) err(`fase in posizione ${i} ha numero ${f.fase}`);
    const [a, b] = f.settimane;
    if (a !== attesa || b < a) err(`fase ${i}: settimane ${a}–${b}, attesa partenza da ${attesa}`);
    attesa = b + 1;
    for (const k of RITMI) {
      const r = f.ritmi?.[k];
      if (r == null) continue;
      if (!(RITMO.test(r.min ?? "") && RITMO.test(r.max ?? ""))) err(`fase ${i}: ritmo ${k} non nel formato m:ss`);
      else if (secondiKm(r.min) > secondiKm(r.max)) err(`fase ${i}: ritmo ${k} con min più lento di max`);
    }
  });
  if (attesa - 1 !== nSettimane) err(`le fasi coprono ${attesa - 1} settimane, il piano ne ha ${nSettimane}`);

  // Settimane: una per ogni numero, in ordine
  if (piano.settimane.some((w, i) => w.settimana !== i + 1) || piano.settimane.length !== nSettimane) {
    err(`le settimane devono essere 1..${nSettimane} in ordine`);
  }
  for (const w of piano.settimane) {
    if (!TIPI_SETTIMANA.includes(w.tipo ?? null)) err(`settimana ${w.settimana}: tipo '${w.tipo}' non valido`);
  }

  // Sedute
  const conta = new Map();
  for (const s of piano.sedute) conta.set(s.id, (conta.get(s.id) ?? 0) + 1);
  for (const [id, n] of conta) if (n > 1) err(`id seduta duplicato: ${id}`);
  let prec = "";
  for (const s of piano.sedute) {
    const sid = s.id ?? "?";
    if (!dataValida(s.data)) {
      err(`${sid}: data non valida`);
      continue;
    }
    if (!(inizio <= s.data && s.data <= gara)) err(`${sid}: data ${s.data} fuori dal piano`);
    if (s.data < prec) err(`${sid}: sedute non in ordine di data`);
    prec = s.data;
    if (!TIPI_SEDUTA.includes(s.tipo)) err(`${sid}: tipo '${s.tipo}' non valido`);
    if (!s.descrizione) err(`${sid}: descrizione vuota`);
    const km = s.distanza_m;
    if (TIPI_CORSA.includes(s.tipo)) {
      if (!Number.isInteger(km) || km <= 0) err(`${sid}: una corsa deve avere distanza_m intera positiva`);
    } else if (km != null) err(`${sid}: solo le corse hanno distanza_m`);
    const r = s.ritmo;
    if (r != null) {
      const n = faseDi(piano, settimanaDi(piano, s.data));
      const fase = piano.fasi.find((f) => f.fase === n);
      if (!TIPI_CON_RITMO.includes(s.tipo)) err(`${sid}: solo qualità, test e gara hanno un ritmo`);
      else if (!RITMI_SEDUTA.includes(r)) err(`${sid}: ritmo '${r}' non valido`);
      else if (fase && !fase.ritmi?.[r]) err(`${sid}: la fase ${n} non ha il ritmo ${r}`);
    }
    if (s.tratti != null) controllaTratti(piano, s, sid, err);
  }

  if (!piano.sedute.some((s) => s.tipo === "gara" && s.data === gara)) err(`nessuna seduta di tipo gara il ${gara}`);
  if (errori.length) return { errori, avvisi };

  // Regole del piano: qualità mai il giorno dopo il gioco di squadra,
  // almeno un giorno tra la qualità e il lungo (o test/gara).
  const perData = new Map();
  for (const s of piano.sedute) {
    if (!perData.has(s.data)) perData.set(s.data, new Set());
    perData.get(s.data).add(s.tipo);
  }
  for (const d of [...perData.keys()].sort()) {
    if (!perData.get(d).has("qualita")) continue;
    const g = giorno(d);
    if (perData.get(iso(g - 1))?.has("volley")) avvisi.push(`${d}: qualità il giorno dopo il gioco di squadra`);
    for (const altro of [iso(g - 1), iso(g + 1)]) {
      const tipi = perData.get(altro);
      if (tipi && ["lungo", "test", "gara"].some((t) => tipi.has(t))) {
        avvisi.push(`${d}: qualità attaccata al lungo/test/gara del ${altro}`);
      }
    }
  }
  return { errori, avvisi };
}

/** Il file come lo scrive piano.py: indentazione 2, UTF-8, a capo finale. */
export const serializza = (piano) => JSON.stringify(piano, null, 2) + "\n";
