import { analizza, giorno, iso, secondiKm } from "./analisi.js";
import { caricaDati, leggiFile } from "./fonte.js";
import { colonneSettimane, ritmi } from "./grafici.js";

const NOMI_TIPO = {
  facile: "Facile", qualita: "Qualità", lungo: "Lungo", test: "Test", gara: "Gara",
  volley: "Gioco di squadra", forza: "Forza", mobilita: "Mobilità", camminata: "Camminata", trekking: "Trekking",
};
const STATI = {
  fatta: ["✓", "Fatta"],
  spostata: ["↔", "Spostata"],
  saltata: ["✕", "Saltata"],
  da_fare: ["○", "Da fare"],
  extra: ["+", "Extra"],
};
const ESITI = { nel_ritmo: ["✓", "nel ritmo"], veloce: ["▲", "più veloce"], lento: ["▼", "più lento"] };
const GIORNI = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
const MESI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];

const $ = (id) => document.getElementById(id);
const h = (tag, attr = {}, ...figli) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attr)) if (v != null && v !== false) el.setAttribute(k === "class" ? "class" : k, v);
  el.append(...figli.flat().filter((f) => f != null && f !== false));
  return el;
};
const km = (m, cifre = 1) => (m / 1000).toLocaleString("it-IT", { maximumFractionDigits: cifre });
const ritmo = (sec) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;
const durata = (sec) => {
  const o = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = String(sec % 60).padStart(2, "0");
  return o ? `${o}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
};
const dataBreve = (d) => `${+d.slice(8)} ${MESI[+d.slice(5, 7) - 1]}`;
const dataLunga = (d) => `${dataBreve(d)} ${d.slice(0, 4)}`;
const giornoSett = (d) => GIORNI[(((giorno(d) + 3) % 7) + 7) % 7];

// ?oggi=2026-11-20 per vedere il report come in un altro giorno.
const oggi = new URLSearchParams(location.search).get("oggi")
  ?? iso(Math.floor(Date.now() / 86400000 - new Date().getTimezoneOffset() / 1440));

let ultimo = null;

function disegna({ piano, attivita }) {
  ultimo = { piano, attivita };
  const r = analizza(piano, attivita, oggi);
  const t = r.totali;
  $("apri").hidden = true;
  $("report").hidden = false;
  $("sottotitolo").textContent = `${piano.gara.nome} del ${dataLunga(piano.gara.data)} · obiettivo ${piano.gara.obiettivo_tempo} (${piano.gara.obiettivo_ritmo}/km) · dati al ${dataLunga(oggi)}`;

  $("cifre").replaceChildren(
    cifra("Giorni alla gara", t.giorni_alla_gara, `settimana ${Math.min(r.settimana_corrente, piano.settimane.length)} di ${piano.settimane.length}`),
    cifra("Corse fatte", t.corse_fatte, `su ${t.corse_finora} previste finora, ${t.corse_totali} in tutto`),
    cifra("Km corsi", km(t.km_fatti_m), `su ${km(t.km_finora_m)} previsti finora, ${km(t.km_totali_m, 0)} in tutto`),
    cifra("Facili e lunghi nel ritmo", `${t.nel_ritmo} su ${t.con_ritmo}`, "nella fascia della fase"),
  );

  disegnaSettimana(piano, r);
  disegnaGrafici(piano, r);
  disegnaTest(r);
  disegnaSettimane(r);
}

function cifra(etichetta, valore, nota) {
  return h("div", { class: "cifra" }, h("span", { class: "etichetta" }, etichetta), h("strong", {}, String(valore)), h("span", { class: "tenue" }, nota));
}

const badgeStato = (stato) => h("span", { class: `stato ${stato}` }, h("span", { "aria-hidden": "true" }, STATI[stato][0]), ` ${STATI[stato][1]}`);
const badgeEsito = (esito) => esito ? h("span", { class: `esito ${esito}` }, h("span", { "aria-hidden": "true" }, ESITI[esito][0]), ` ${ESITI[esito][1]}`) : null;

const NOMI_RITMO = { soglia: "soglia", ripetute: "ripetute", gara: "ritmo gara" };

// "ritmo 6:30–7:00/km", oppure "ripetute 5:25–5:35/km · 1000 m · indicativo"
function testoObiettivo(o) {
  const valori = o.min === o.max ? ritmo(o.min) : `${ritmo(o.min)}–${ritmo(o.max)}`;
  return [`${o.nome ? NOMI_RITMO[o.nome] : "ritmo"} ${valori}/km`, o.nota, o.indicativo ? "indicativo" : null].filter(Boolean).join(" · ");
}

function previsto(s) {
  return h("div", {},
    h("strong", {}, NOMI_TIPO[s.tipo]),
    s.corsa ? ` · ${km(s.distanza_m)} km · ${s.numero_piano}/${ultimo.piano.totale_corse}` : "",
    s.descrizione !== NOMI_TIPO[s.tipo] ? h("div", { class: "tenue piccolo" }, s.descrizione) : null,
    s.obiettivo ? h("div", {
      class: "tenue piccolo",
      title: s.obiettivo.indicativo ? "Senza esito: il ritmo medio di Strava include riscaldamento e recuperi" : null,
    }, testoObiettivo(s.obiettivo)) : null,
  );
}

function fatto(a, s) {
  if (!a) return h("span", { class: "tenue" }, "—");
  const spostata = s && a.data !== s.data;
  return h("div", {},
    a.distanza_m ? h("strong", {}, `${km(a.distanza_m, 2)} km`) : h("strong", {}, a.nome),
    a.ritmo_s_km ? ` · ${ritmo(a.ritmo_s_km)}/km` : "",
    a.tempo_movimento_s ? h("span", { class: "tenue" }, ` · ${durata(a.tempo_movimento_s)}`) : "",
    spostata ? h("div", { class: "tenue piccolo" }, `${giornoSett(a.data)} ${dataBreve(a.data)}`) : null,
    a.origine === "manual" ? h("div", { class: "tenue piccolo" }, "inserita a mano") : null,
  );
}

function righeSedute(w) {
  const righe = [
    ...w.sedute.map((s) => ({ data: s.data, s, a: s.attivita, stato: s.stato })),
    ...w.extra.map((a) => ({ data: a.data, s: null, a, stato: "extra" })),
  ].sort((x, y) => x.data.localeCompare(y.data));
  return [
    h("thead", {}, h("tr", {}, h("th", {}, "Giorno"), h("th", {}, "Previsto"), h("th", {}, "Fatto"), h("th", {}, "Stato"))),
    h("tbody", {}, righe.map(({ data, s, a, stato }) => h("tr", { class: data === oggi ? "oggi" : null },
      h("td", { class: "giorno" }, `${giornoSett(data)} ${+data.slice(8)}`),
      h("td", {}, s ? previsto(s) : h("span", { class: "tenue" }, NOMI_TIPO[sportTipo(a)] ?? a.sport)),
      h("td", {}, fatto(a, s)),
      h("td", {}, badgeStato(stato), s?.esito ? h("div", {}, badgeEsito(s.esito)) : null),
    ))),
  ];
}

const sportTipo = (a) => (a.sport === "Run" ? "facile" : { Volleyball: "volley", WeightTraining: "forza", Yoga: "mobilita", Walk: "camminata", Hike: "trekking" }[a.sport]);

function disegnaSettimana(piano, r) {
  const n = Math.min(Math.max(1, r.settimana_corrente), piano.settimane.length);
  const w = r.settimane[n - 1];
  const fase = piano.fasi.find((f) => f.fase === w.fase);
  $("titolo-settimana").textContent = `${r.settimana_corrente === n ? "Questa settimana" : "Settimana"}: la ${n}, ${dataBreve(w.dal)} – ${dataBreve(w.al)}`;
  $("nota-settimana").textContent = [
    `${fase.nome}.`,
    `${km(w.fatto_m ?? 0)} di ${km(w.previsto_m)} km.`,
    w.tipo ? `Settimana di ${w.tipo}.` : "",
    w.nota ?? "",
  ].filter(Boolean).join(" ");
  $("settimana").replaceChildren(...righeSedute(w));
}

function disegnaGrafici(piano, r) {
  const settimane = r.settimane.map((w) => ({
    etichetta: `Settimana ${w.settimana}`,
    dettaglio: `${dataBreve(w.dal)} – ${dataBreve(w.al)}`,
    corta: String(w.settimana),
    corrente: w.settimana === r.settimana_corrente,
    w,
  }));
  const formato = (m) => km(m, 0);
  colonneSettimane($("grafico-volume"), settimane.map((d) => ({ ...d, previsto: d.w.previsto_m, fatto: d.w.fatto_m })),
    { formato, unita: "km", titolo: "Volume settimanale previsto e fatto" });
  colonneSettimane($("grafico-lungo"), settimane.map((d) => ({ ...d, previsto: d.w.lungo_previsto_m ?? 0, fatto: d.w.lungo_fatto_m })),
    { formato, unita: "km", titolo: "Lungo previsto e fatto" });

  const punti = r.sedute
    .filter((s) => (s.tipo === "facile" || s.tipo === "lungo") && s.attivita?.ritmo_s_km)
    .map((s) => ({
      x: giorno(s.attivita.data),
      ritmo: s.attivita.ritmo_s_km,
      esito: s.esito,
      etichetta: `${s.numero_piano}/${piano.totale_corse}`,
      dettaglio: `${NOMI_TIPO[s.tipo]} · ${km(s.attivita.distanza_m, 2)} km · ${dataBreve(s.attivita.data)}`,
    }));
  const contenitore = $("grafico-ritmo");
  if (!punti.length) {
    contenitore.replaceChildren(h("p", { class: "tenue" }, "Ancora nessuna corsa facile o lunga."));
    return;
  }
  // Dall'inizio del piano fino a qualche settimana dopo oggi, per vedere la fascia che arriva.
  const da = giorno(piano.inizio);
  const a = Math.min(giorno(piano.gara.data), Math.max(giorno(oggi), da + 28) + 14);
  const fasce = piano.fasi.filter((f) => f.ritmi.facile_lungo).map((f) => ({
    da: da + (f.settimane[0] - 1) * 7,
    a: da + f.settimane[1] * 7,
    min: secondiKm(f.ritmi.facile_lungo.min),
    max: secondiKm(f.ritmi.facile_lungo.max),
  }));
  ritmi(contenitore, punti, fasce, {
    da, a, titolo: "Ritmo delle corse facili e lunghe", formatoRitmo: ritmo, formatoData: (g) => dataBreve(iso(g)),
  });
}

function disegnaTest(r) {
  $("test").replaceChildren(
    h("thead", {}, h("tr", {}, h("th", {}, "Data"), h("th", {}, "Previsto"), h("th", {}, "Fatto"), h("th", {}, "Stato"))),
    h("tbody", {}, r.test.map((s) => h("tr", { class: s.data === oggi ? "oggi" : null },
      h("td", { class: "giorno" }, dataLunga(s.data)),
      h("td", {}, previsto(s)),
      h("td", {}, fatto(s.attivita, s)),
      h("td", {}, badgeStato(s.stato), s.esito ? h("div", {}, badgeEsito(s.esito)) : null),
    ))),
  );
}

function disegnaSettimane(r) {
  const passate = r.settimane.filter((w) => w.al < oggi).reverse();
  $("settimane").replaceChildren(...passate.map((w, i) => {
    const conta = (stato) => w.sedute.filter((s) => s.stato === stato).length + (stato === "extra" ? w.extra.length : 0);
    const plurale = { fatta: "fatte", spostata: "spostate", saltata: "saltate", extra: "extra" };
    const riassunto = ["fatta", "spostata", "saltata", "extra"].filter((st) => conta(st))
      .map((st) => `${conta(st)} ${conta(st) === 1 ? STATI[st][1].toLowerCase() : plurale[st]}`).join(", ");
    const d = h("details", { class: "settimana" },
      h("summary", {},
        h("strong", {}, `Settimana ${w.settimana}`),
        h("span", { class: "tenue" }, ` ${dataBreve(w.dal)} – ${dataBreve(w.al)}`),
        h("span", { class: "dx" }, `${km(w.fatto_m ?? 0)} / ${km(w.previsto_m)} km`),
        h("span", { class: "tenue riassunto" }, riassunto)),
      w.nota ? h("p", { class: "tenue" }, w.nota) : null,
      h("div", { class: "scorre" }, h("table", { class: "tabella" }, righeSedute(w))),
    );
    d.open = i === 0;
    return d;
  }));
}

$("file").addEventListener("change", async (e) => {
  try {
    disegna(await leggiFile(e.target.files));
    $("errore-file").hidden = true;
  } catch (err) {
    $("errore-file").textContent = err.message;
    $("errore-file").hidden = false;
  }
});

let attesa;
addEventListener("resize", () => {
  clearTimeout(attesa);
  attesa = setTimeout(() => ultimo && disegnaGrafici(ultimo.piano, analizza(ultimo.piano, ultimo.attivita, oggi)), 150);
});

const dati = await caricaDati();
if (dati) disegna(dati);
else $("apri").hidden = false;
