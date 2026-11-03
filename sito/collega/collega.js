import { collegamento, leggi, leggiRepo, salvaCollegamento, scollega } from "../comune/github.js";

const $ = (id) => document.getElementById(id);

function mostra() {
  const c = collegamento();
  $("collegato").hidden = !c;
  if (c) {
    $("repo-collegato").textContent = c.repo;
    $("repo").value = c.repo;
  }
}

$("modulo").addEventListener("submit", async (e) => {
  e.preventDefault();
  const c = { repo: $("repo").value.trim(), token: $("token").value.trim() };
  const pulsante = e.submitter;
  pulsante.disabled = true;
  $("errore").hidden = true;
  try {
    const repo = await leggiRepo(c);
    const piano = JSON.parse((await leggi(c, "data/piano.json")).testo);
    salvaCollegamento(c);
    $("token").value = "";
    $("dettaglio").textContent = `${repo.private ? "Repo privato" : "Attenzione: il repo è pubblico"} · piano con ${piano.sedute?.length ?? 0} sedute, ${piano.gara?.nome ?? ""}`;
    mostra();
  } catch (err) {
    $("errore").textContent = err.message;
    $("errore").hidden = false;
  } finally {
    pulsante.disabled = false;
  }
});

$("scollega").addEventListener("click", () => {
  scollega();
  $("dettaglio").textContent = "";
  mostra();
});

mostra();
