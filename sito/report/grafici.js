// Grafici in SVG, senza librerie. Colori e testo vengono dalle variabili CSS di stile.css.

const NS = "http://www.w3.org/2000/svg";
const s = (tag, attr = {}, ...figli) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attr)) if (v != null) el.setAttribute(k, v);
  el.append(...figli);
  return el;
};

// Un solo tooltip per la pagina, riempito con textContent.
const tip = document.createElement("div");
tip.className = "tooltip";
tip.hidden = true;
document.body.append(tip);

function mostra(e, righe, ancora) {
  tip.replaceChildren(...righe.map(([chiave, valore, etichetta]) => {
    const r = document.createElement("div");
    r.className = "tip-riga";
    if (chiave) {
      const k = document.createElement("span");
      k.className = `tip-chiave ${chiave}`;
      r.append(k);
    }
    const v = document.createElement("strong");
    v.textContent = valore;
    r.append(v);
    if (etichetta) r.append(document.createTextNode(` ${etichetta}`));
    return r;
  }));
  tip.hidden = false;
  const box = ancora?.getBoundingClientRect();
  const x = box ? box.left + box.width / 2 : e.clientX;
  const y = box ? box.top : e.clientY;
  const w = tip.offsetWidth;
  tip.style.left = `${Math.min(Math.max(8, x - w / 2), innerWidth - w - 8)}px`;
  tip.style.top = `${Math.max(8, y - tip.offsetHeight - 10) + scrollY}px`;
}
const nascondi = () => (tip.hidden = true);
addEventListener("scroll", nascondi, { passive: true });

function attivabile(el, righe) {
  el.setAttribute("tabindex", "0");
  el.addEventListener("pointerenter", (e) => mostra(e, righe(), el));
  el.addEventListener("pointerleave", nascondi);
  el.addEventListener("focus", (e) => mostra(e, righe(), el));
  el.addEventListener("blur", nascondi);
}

// Tacche "pulite" per l'asse y.
function tacche(max, n = 4) {
  const passo0 = max / n;
  const mag = 10 ** Math.floor(Math.log10(passo0));
  const passo = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((p) => p >= passo0);
  return Array.from({ length: Math.ceil(max / passo) + 1 }, (_, i) => i * passo);
}

// Colonna con l'estremo superiore arrotondato di 4px e la base squadrata.
function colonna(x, y, w, h, r = 4) {
  r = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

function quadro(contenitore, altezza) {
  const larghezza = Math.max(300, contenitore.clientWidth || 600);
  const svg = s("svg", { viewBox: `0 0 ${larghezza} ${altezza}`, width: "100%", height: altezza, role: "img" });
  contenitore.replaceChildren(svg);
  return { svg, larghezza };
}

/**
 * Colonne per settimana: il previsto come colonna larga e tenue, il fatto come colonna
 * più stretta dentro. dati: [{etichetta, previsto, fatto (o null), corrente, dettaglio}]
 */
export function colonneSettimane(contenitore, dati, { formato, unita, titolo }) {
  const altezza = 220;
  const { svg, larghezza } = quadro(contenitore, altezza);
  svg.setAttribute("aria-label", titolo);
  const m = { sx: 40, dx: 8, su: 12, giu: 24 };
  const max = Math.max(1, ...dati.flatMap((d) => [d.previsto ?? 0, d.fatto ?? 0]));
  const ys = tacche(max);
  const top = ys.at(-1);
  const h = altezza - m.su - m.giu;
  const y = (v) => m.su + h - (v / top) * h;
  const slot = (larghezza - m.sx - m.dx) / dati.length;
  const largo = Math.min(24, Math.max(2, slot - 2));
  const stretto = Math.max(2, largo * 0.55);

  for (const v of ys) {
    svg.append(s("line", { x1: m.sx, x2: larghezza - m.dx, y1: y(v), y2: y(v), class: v ? "griglia" : "base" }));
    svg.append(s("text", { x: m.sx - 6, y: y(v) + 4, "text-anchor": "end", class: "asse" }, formato(v)));
  }
  const passoEtichette = Math.ceil(dati.length / Math.floor((larghezza - m.sx) / 28));
  dati.forEach((d, i) => {
    const cx = m.sx + slot * i + slot / 2;
    const g = s("g", { class: `colonna${d.corrente ? " corrente" : ""}`, "aria-label": `${d.etichetta}: previsto ${formato(d.previsto)} ${unita}${d.fatto != null ? `, fatto ${formato(d.fatto)} ${unita}` : ""}` });
    g.append(s("rect", { x: cx - slot / 2, y: m.su, width: slot, height: h, class: "bersaglio" }));
    if (d.previsto) g.append(s("path", { d: colonna(cx - largo / 2, y(d.previsto), largo, y(0) - y(d.previsto)), class: "previsto" }));
    if (d.fatto) g.append(s("path", { d: colonna(cx - stretto / 2, y(d.fatto), stretto, y(0) - y(d.fatto)), class: "fatto" }));
    attivabile(g, () => [
      [null, d.etichetta, d.dettaglio ?? ""],
      ["previsto", `${formato(d.previsto)} ${unita}`, "previsto"],
      ...(d.fatto != null ? [["fatto", `${formato(d.fatto)} ${unita}`, "fatto"]] : []),
    ]);
    svg.append(g);
    if (i % passoEtichette === 0 || d.corrente) {
      svg.append(s("text", { x: cx, y: altezza - 6, "text-anchor": "middle", class: `asse${d.corrente ? " forte" : ""}` }, d.corta));
    }
  });
}

/**
 * Ritmo delle corse nel tempo, con la fascia del ritmo previsto. Il più veloce sta in alto.
 * punti: [{x (giorno), ritmo (s/km), etichetta, dettaglio, esito}]; fasce: [{da, a, min, max}]
 */
export function ritmi(contenitore, punti, fasce, { da, a, titolo, formatoRitmo, formatoData }) {
  const altezza = 220;
  const { svg, larghezza } = quadro(contenitore, altezza);
  svg.setAttribute("aria-label", titolo);
  const m = { sx: 44, dx: 12, su: 12, giu: 24 };
  const valori = [...punti.map((p) => p.ritmo), ...fasce.flatMap((f) => [f.min, f.max])];
  const lo = Math.floor((Math.min(...valori) - 10) / 15) * 15;
  const hi = Math.ceil((Math.max(...valori) + 10) / 15) * 15;
  const h = altezza - m.su - m.giu;
  const y = (v) => m.su + ((v - lo) / (hi - lo)) * h; // più veloce = più in alto
  const x = (g) => m.sx + ((g - da) / Math.max(1, a - da)) * (larghezza - m.sx - m.dx);

  const passo = (hi - lo) / 15 > 6 ? 30 : 15;
  for (let v = Math.ceil(lo / passo) * passo; v <= hi; v += passo) {
    svg.append(s("line", { x1: m.sx, x2: larghezza - m.dx, y1: y(v), y2: y(v), class: "griglia" }));
    svg.append(s("text", { x: m.sx - 6, y: y(v) + 4, "text-anchor": "end", class: "asse" }, formatoRitmo(v)));
  }
  for (const f of fasce) {
    const x1 = x(Math.max(da, f.da));
    const x2 = x(Math.min(a, f.a));
    if (x2 <= x1) continue;
    svg.append(s("rect", { x: x1, y: y(f.min), width: x2 - x1, height: Math.max(2, y(f.max) - y(f.min)), class: "fascia" }));
  }
  // Date sull'asse x: inizio, fine e qualche tacca in mezzo.
  const nDate = Math.max(2, Math.min(6, Math.floor((larghezza - m.sx) / 90)));
  for (let i = 0; i < nDate; i++) {
    const g = Math.round(da + ((a - da) * i) / (nDate - 1));
    svg.append(s("text", { x: x(g), y: altezza - 6, "text-anchor": i === 0 ? "start" : i === nDate - 1 ? "end" : "middle", class: "asse" }, formatoData(g)));
  }
  for (const p of punti) {
    const g = s("g", { class: `punto ${p.esito ?? ""}`, "aria-label": `${p.etichetta}: ${formatoRitmo(p.ritmo)}/km` });
    g.append(s("circle", { cx: x(p.x), cy: y(p.ritmo), r: 12, class: "bersaglio" }));
    g.append(s("circle", { cx: x(p.x), cy: y(p.ritmo), r: 4.5, class: "segno" }));
    attivabile(g, () => [[null, `${formatoRitmo(p.ritmo)}/km`, p.etichetta], [null, p.dettaglio, ""]]);
    svg.append(g);
  }
}
