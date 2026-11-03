import { GIORNI, RITMI_SEDUTA, TIPI_CON_RITMO, TIPI_CORSA, TIPI_SEDUTA, controlla, espandi, faseDi, giorno, iso, serializza, settimanaDi } from "./piano.js";
import { caricaPiano, leggiFile, salvaPiano } from "./fonte.js";

export const NOMI_TIPO = {
  facile: "Facile",
  qualita: "Qualità",
  lungo: "Lungo",
  test: "Test",
  gara: "Gara",
  volley: "Gioco di squadra",
  forza: "Forza",
  mobilita: "Mobilità",
  camminata: "Camminata",
  trekking: "Trekking",
};
const NOMI_SETTIMANA = { "": "normale", scarico: "scarico", test: "test", gara: "gara" };
const MESI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
const BOZZA = "my-strava:editor:bozza";
const NOMI_RITMO = { soglia: "Soglia", ripetute: "Ripetute", gara: "Ritmo gara" };

const $ = (id) => document.getElementById(id);
const h = (tag, attr = {}, ...figli) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attr)) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  el.append(...figli.flat().filter((f) => f != null && f !== false));
  return el;
};
const km = (m) => (m / 1000).toLocaleString("it-IT", { maximumFractionDigits: 1 });
const dataBreve = (d) => `${+d.slice(8)} ${MESI[+d.slice(5, 7) - 1]}`;
const clona = (x) => structuredClone(x);

// ?oggi=2026-11-20 per vedere il piano come in un altro giorno.
const oggi = new URLSearchParams(location.search).get("oggi") ?? iso(Math.floor(Date.now() / 86400000 - new Date().getTimezoneOffset() / 1440));

const stato = {
  piano: null, // sempre espanso
  salvato: "", // testo dell'ultima versione caricata o salvata
  indietro: [],
  avanti: [],
  fase: null,
  modifica: null, // id della seduta nel dialogo, o null per una nuova
  verifica: { errori: [], avvisi: [] },
};

// ---------- Modifiche ----------

function cambia(fn) {
  const nuovo = clona(stato.piano);
  fn(nuovo);
  stato.indietro.push(stato.piano);
  stato.avanti = [];
  imposta(espandi(nuovo));
}

function imposta(piano) {
  stato.piano = piano;
  stato.verifica = controlla(piano);
  try {
    if (serializza(piano) === stato.salvato) localStorage.removeItem(BOZZA);
    else localStorage.setItem(BOZZA, JSON.stringify({ base: stato.salvato, piano }));
  } catch {}
  disegna();
}

function annulla() {
  if (!stato.indietro.length) return;
  stato.avanti.push(stato.piano);
  imposta(stato.indietro.pop());
}

function ripeti() {
  if (!stato.avanti.length) return;
  stato.indietro.push(stato.piano);
  imposta(stato.avanti.pop());
}

const modificato = () => stato.piano && serializza(stato.piano) !== stato.salvato;

function nuovoId(piano, data) {
  const n = settimanaDi(piano, data);
  const usati = new Set(piano.sedute.map((s) => s.id));
  let k = 1;
  while (usati.has(`w${n}s${k}`)) k++;
  return `w${n}s${k}`;
}

function sposta(id, data) {
  cambia((p) => {
    const s = p.sedute.find((s) => s.id === id);
    if (s.data === data) return;
    // In fondo al nuovo giorno: le sedute con la stessa data restano nell'ordine in cui sono.
    p.sedute = p.sedute.filter((x) => x !== s);
    s.data = data;
    p.sedute.push(s);
  });
}

// ---------- Disegno ----------

function disegna() {
  const p = stato.piano;
  const { errori, avvisi } = stato.verifica;

  $("gara").textContent = `${p.gara.nome} · ${dataLunga(p.gara.data)} · obiettivo ${p.gara.obiettivo_tempo}`;
  $("annulla").disabled = !stato.indietro.length;
  $("ripeti").disabled = !stato.avanti.length;
  $("stato-salvataggio").textContent = modificato() ? "Modifiche non salvate" : "Salvato";
  $("stato-salvataggio").classList.toggle("attenzione", modificato());

  const totale = p.settimane.reduce((t, w) => t + w.distanza_m, 0);
  const restano = Math.max(0, giorno(p.gara.data) - giorno(oggi));
  $("riepilogo").replaceChildren(
    cifra(p.totale_corse, "corse"),
    cifra(`${km(totale)} km`, "in totale"),
    cifra(p.settimane.length, "settimane"),
    cifra(restano, "giorni alla gara"),
  );

  const c = $("controlli");
  const aperto = c.open;
  c.className = `controlli ${errori.length ? "con-errori" : avvisi.length ? "con-avvisi" : "ok"}`;
  c.replaceChildren(
    h("summary", {}, errori.length
      ? `${errori.length === 1 ? "1 errore" : `${errori.length} errori`}: il piano non si può salvare`
      : avvisi.length ? `Nessun errore · ${avvisi.length === 1 ? "1 avviso" : `${avvisi.length} avvisi`} sulle regole del piano` : "Nessun errore, nessun avviso"),
    errori.length || avvisi.length
      ? h("ul", {}, errori.map((e) => h("li", { class: "errore" }, e)), avvisi.map((a) => h("li", {}, a)))
      : null,
  );
  c.open = aperto;
  $("salva").disabled = errori.length > 0;

  if (stato.fase == null) {
    const n = settimanaDi(p, oggi);
    stato.fase = p.fasi.find((f) => f.settimane[0] <= n && n <= f.settimane[1])?.fase ?? 1;
  }
  $("fasi").replaceChildren(
    ...p.fasi.map((f) => h("button", {
      class: f.fase === stato.fase ? "attiva" : null,
      "aria-pressed": f.fase === stato.fase ? "true" : "false",
      onclick: () => { stato.fase = f.fase; disegna(); },
    }, f.nome.replace(/^Fase \d+ · /, `${f.fase} · `))),
    h("button", {
      class: stato.fase === 0 ? "attiva" : null,
      "aria-pressed": stato.fase === 0 ? "true" : "false",
      onclick: () => { stato.fase = 0; disegna(); },
    }, "Tutte"),
  );

  const fase = p.fasi.find((f) => f.fase === stato.fase);
  $("fase-info").replaceChildren(...(fase ? infoFase(fase) : []));

  const daMostrare = p.settimane.filter((w) => !fase || (fase.settimane[0] <= w.settimana && w.settimana <= fase.settimane[1]));
  const avvisiPerData = new Map();
  for (const a of avvisi) {
    const d = a.slice(0, 10);
    avvisiPerData.set(d, [...(avvisiPerData.get(d) ?? []), a.slice(12)]);
  }
  $("settimane").replaceChildren(...daMostrare.map((w) => settimana(w, avvisiPerData)));
}

const cifra = (valore, etichetta) => h("div", { class: "cifra" }, h("strong", {}, String(valore)), h("span", {}, etichetta));

function dataLunga(d) {
  return `${+d.slice(8)} ${MESI[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}`;
}

function infoFase(f) {
  const ritmi = Object.entries({ facile_lungo: "Facile e lungo", soglia: "Soglia", ripetute: "Ripetute", gara: "Gara" })
    .filter(([k]) => f.ritmi[k])
    .map(([k, nome]) => {
      const r = f.ritmi[k];
      const val = r.min === r.max ? r.min : `${r.min}–${r.max}`;
      return h("span", { class: "ritmo" }, `${nome} `, h("strong", {}, `${val}/km`), r.nota ? ` (${r.nota})` : "");
    });
  return [h("p", {}, h("strong", {}, `${f.periodo}. `), f.obiettivo), h("p", { class: "ritmi" }, ritmi)];
}

function settimana(w, avvisiPerData) {
  const p = stato.piano;
  const giorni = Array.from({ length: 7 }, (_, i) => iso(giorno(w.dal) + i));
  const lungo = Math.max(0, ...p.sedute.filter((s) => s.settimana === w.settimana && ["lungo", "test", "gara"].includes(s.tipo)).map((s) => s.distanza_m));
  const corrente = w.dal <= oggi && oggi <= w.al;
  const passata = w.al < oggi;

  return h("article", { class: `settimana${corrente ? " corrente" : ""}${passata ? " passata" : ""}`, id: `s${w.settimana}` },
    h("header", {},
      h("h3", {}, `Settimana ${w.settimana}`),
      h("span", { class: "sotto" }, `${dataBreve(w.dal)} – ${dataBreve(w.al)}`),
      h("span", { class: "km" }, `${km(w.distanza_m)} km`),
      lungo ? h("span", { class: "sotto" }, `lungo ${km(lungo)}`) : null,
      corrente ? h("span", { class: "etichetta" }, "questa settimana") : null,
      h("label", { class: "tipo-settimana" }, "Tipo ",
        h("select", {
          onchange: (e) => cambia((q) => { q.settimane[w.settimana - 1].tipo = e.target.value || null; }),
        }, Object.entries(NOMI_SETTIMANA).map(([v, t]) => h("option", { value: v, selected: (w.tipo ?? "") === v }, t)))),
    ),
    h("div", { class: "giorni" }, giorni.map((d, i) => giornoCella(d, i, avvisiPerData.get(d)))),
    notaSettimana(w),
  );
}

function notaSettimana(w) {
  const area = h("textarea", { rows: 1, placeholder: "Nota della settimana", "aria-label": `Nota della settimana ${w.settimana}` });
  area.value = w.nota ?? "";
  area.addEventListener("change", () => cambia((q) => { q.settimane[w.settimana - 1].nota = area.value.trim() || null; }));
  return area;
}

function giornoCella(d, i, avvisi) {
  const p = stato.piano;
  const sedute = p.sedute.filter((s) => s.data === d);
  const fuori = d < p.inizio || d > p.gara.data;
  const cella = h("div", {
    class: `giorno${d === oggi ? " oggi" : ""}${avvisi ? " avviso" : ""}${fuori ? " fuori" : ""}`,
    "data-data": d,
  },
    h("div", { class: "giorno-testa" },
      h("span", {}, `${GIORNI[i]} ${+d.slice(8)}`),
      fuori ? null : h("button", { class: "aggiungi", title: `Aggiungi una seduta il ${dataBreve(d)}`, onclick: () => apriDialogo(null, d) }, "+")),
    sedute.map(seduta),
    avvisi ? h("p", { class: "avviso-testo" }, avvisi.join("; ")) : null,
  );
  if (!fuori) {
    cella.addEventListener("dragover", (e) => { e.preventDefault(); cella.classList.add("sopra"); });
    cella.addEventListener("dragleave", () => cella.classList.remove("sopra"));
    cella.addEventListener("drop", (e) => {
      e.preventDefault();
      cella.classList.remove("sopra");
      const id = e.dataTransfer.getData("text/plain");
      if (id) sposta(id, d);
    });
  }
  return cella;
}

function seduta(s) {
  return h("button", {
    class: `seduta tipo-${s.tipo}`,
    draggable: "true",
    title: s.descrizione,
    ondragstart: (e) => { e.dataTransfer.setData("text/plain", s.id); e.dataTransfer.effectAllowed = "move"; },
    onclick: () => apriDialogo(s.id),
  },
    h("span", { class: "seduta-testa" },
      h("span", { class: "tipo" }, NOMI_TIPO[s.tipo]),
      s.corsa ? h("span", { class: "numero" }, `${s.numero_piano}/${stato.piano.totale_corse}`) : null),
    s.corsa ? h("span", { class: "seduta-km" }, `${km(s.distanza_m)} km`, s.ritmo ? h("span", { class: "ritmo" }, ` · ${NOMI_RITMO[s.ritmo]?.toLowerCase() ?? s.ritmo}`) : null) : null,
    s.descrizione !== NOMI_TIPO[s.tipo] ? h("span", { class: "descrizione" }, s.descrizione) : null,
  );
}

// ---------- Dialogo ----------

const modulo = $("modulo");
modulo.tipo.replaceChildren(
  h("optgroup", { label: "Corse" }, TIPI_CORSA.map((t) => h("option", { value: t }, NOMI_TIPO[t]))),
  h("optgroup", { label: "Altro" }, TIPI_SEDUTA.filter((t) => !TIPI_CORSA.includes(t)).map((t) => h("option", { value: t }, NOMI_TIPO[t]))),
);
const aggiornaCampoKm = () => {
  const corsa = TIPI_CORSA.includes(modulo.tipo.value);
  $("campo-km").hidden = !corsa;
  modulo.km.required = corsa;
  aggiornaCampoRitmo();
};

// I ritmi della fase in cui cade la data scelta; quelli che la fase non ha restano visibili ma spenti.
function aggiornaCampoRitmo() {
  const conRitmo = TIPI_CON_RITMO.includes(modulo.tipo.value);
  $("campo-ritmo").hidden = !conRitmo;
  if (!conRitmo) return;
  const scelto = modulo.ritmo.value;
  const p = stato.piano;
  const n = modulo.data.value ? faseDi(p, settimanaDi(p, modulo.data.value)) : null;
  const ritmi = p.fasi.find((f) => f.fase === n)?.ritmi ?? {};
  modulo.ritmo.replaceChildren(
    h("option", { value: "" }, "Nessuno"),
    ...RITMI_SEDUTA.map((k) => {
      const r = ritmi[k];
      const valori = r ? ` · ${r.min === r.max ? r.min : `${r.min}–${r.max}`}/km${r.nota ? ` (${r.nota})` : ""}` : ` · non previsto in fase ${n ?? "?"}`;
      return h("option", { value: k, disabled: r ? null : "" }, NOMI_RITMO[k] + valori);
    }),
  );
  modulo.ritmo.value = scelto;
  if (modulo.ritmo.value !== scelto) modulo.ritmo.value = "";
}
modulo.tipo.addEventListener("change", aggiornaCampoKm);
modulo.data.addEventListener("change", aggiornaCampoRitmo);

function apriDialogo(id, data) {
  const s = id ? stato.piano.sedute.find((s) => s.id === id) : null;
  stato.modifica = id;
  $("dialogo-titolo").textContent = s ? (s.corsa ? `Corsa ${s.numero_piano}/${stato.piano.totale_corse}` : NOMI_TIPO[s.tipo]) : "Nuova seduta";
  modulo.data.min = stato.piano.inizio;
  modulo.data.max = stato.piano.gara.data;
  modulo.data.value = s?.data ?? data;
  modulo.tipo.value = s?.tipo ?? "facile";
  modulo.descrizione.value = s?.descrizione ?? "";
  modulo.km.value = s?.distanza_m ? s.distanza_m / 1000 : "";
  $("elimina").hidden = !s;
  $("dialogo-errore").hidden = true;
  aggiornaCampoKm();
  // il valore attuale si imposta dopo le opzioni: se la fase non lo ha più resta, e il controllo lo segnala
  if (s?.ritmo && ![...modulo.ritmo.options].some((o) => o.value === s.ritmo)) {
    modulo.ritmo.append(h("option", { value: s.ritmo }, `${NOMI_RITMO[s.ritmo] ?? s.ritmo} · non valido`));
  }
  modulo.ritmo.value = s?.ritmo ?? "";
  $("dialogo").showModal();
}

modulo.addEventListener("submit", (e) => {
  if (e.submitter?.value !== "ok") return;
  const corsa = TIPI_CORSA.includes(modulo.tipo.value);
  const distanza = corsa ? Math.round(parseFloat(String(modulo.km.value).replace(",", ".")) * 1000) : null;
  if (corsa && !(distanza > 0)) {
    e.preventDefault();
    mostraErrore("Una corsa ha bisogno della distanza.");
    return;
  }
  const valori = { data: modulo.data.value, tipo: modulo.tipo.value, descrizione: modulo.descrizione.value.trim(), distanza_m: distanza };
  const ritmo = TIPI_CON_RITMO.includes(valori.tipo) ? modulo.ritmo.value || null : null;
  if (!valori.descrizione) {
    e.preventDefault();
    mostraErrore("Scrivi una descrizione.");
    return;
  }
  const id = stato.modifica;
  cambia((p) => {
    if (id) {
      const s = p.sedute.find((s) => s.id === id);
      const nuovaData = s.data !== valori.data;
      Object.assign(s, valori);
      if (ritmo) s.ritmo = ritmo;
      else delete s.ritmo;
      if (nuovaData) {
        p.sedute = p.sedute.filter((x) => x !== s);
        p.sedute.push(s);
      }
    } else {
      p.sedute.push({ id: nuovoId(p, valori.data), ...valori, ...(ritmo ? { ritmo } : {}) });
    }
  });
});

function mostraErrore(testo) {
  $("dialogo-errore").textContent = testo;
  $("dialogo-errore").hidden = false;
}

$("elimina").addEventListener("click", () => {
  const id = stato.modifica;
  const s = stato.piano.sedute.find((s) => s.id === id);
  const conferma = s.corsa
    ? `Togliere la corsa ${s.numero_piano}? Le corse successive scalano di uno.`
    : `Togliere ${NOMI_TIPO[s.tipo].toLowerCase()} del ${dataBreve(s.data)}?`;
  if (!confirm(conferma)) return;
  $("dialogo").close();
  cambia((p) => { p.sedute = p.sedute.filter((x) => x.id !== id); });
});

// ---------- Avvio ----------

$("annulla").addEventListener("click", annulla);
$("ripeti").addEventListener("click", ripeti);
$("salva").addEventListener("click", async () => {
  stato.salvato = await salvaPiano(stato.piano);
  imposta(stato.piano);
});
document.addEventListener("keydown", (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z" || e.target.closest("input, textarea")) return;
  e.preventDefault();
  if (e.shiftKey) ripeti();
  else annulla();
});
window.addEventListener("beforeunload", (e) => {
  if (modificato()) e.preventDefault();
});
$("file").addEventListener("change", async (e) => {
  if (e.target.files[0]) apri(await leggiFile(e.target.files[0]));
});

function apri({ testo }) {
  let piano;
  try {
    piano = JSON.parse(testo);
  } catch {
    alert("Il file non è un JSON valido.");
    return;
  }
  stato.salvato = testo;
  stato.indietro = [];
  stato.avanti = [];
  let bozza = null;
  try {
    bozza = JSON.parse(localStorage.getItem(BOZZA));
  } catch {}
  if (bozza?.base === testo && confirm("C'è una bozza non salvata di questo piano. Riprenderla?")) {
    stato.indietro = [espandi(piano)];
    piano = bozza.piano;
  }
  $("apri").hidden = true;
  $("editor").hidden = false;
  imposta(espandi(piano));
  document.querySelector(".settimana.corrente")?.scrollIntoView({ block: "start" });
}

const iniziale = await caricaPiano();
if (iniziale) apri(iniziale);
else $("apri").hidden = false;
