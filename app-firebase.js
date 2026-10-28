import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { 
  getFirestore, 
  doc, 
  collection, 
  onSnapshot, 
  runTransaction 
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let unsubWeeks = null;
let unsubAppts = null;
let unsubConfig = null;

const syncState = {
  weeks: { loaded: false, error: null },
  appts: { loaded: false, error: null },
  config: { loaded: false, error: null }
};

setPersistence(auth, browserLocalPersistence).catch(() => {});

const EMAIL_OFICIAL = "preoperatoriodr.lucasmendes@gmail.com";
function resolverEmail(usuarioOuEmail) {
  const limpo = (usuarioOuEmail || "").trim().toLowerCase();
  if (limpo === "prelucasmendes" || limpo === "dr.lucasmendes") {
    return EMAIL_OFICIAL;
  }
  return (usuarioOuEmail || "").trim();
}

const body = document.body;
const loginOverlay = document.getElementById("lg");
const loginForm = document.getElementById("lf");
const loginUser = document.getElementById("lu");
const loginPass = document.getElementById("lp");
const loginErr = document.getElementById("le");
const loginBtn = document.getElementById("lb");
const logoutBtn = document.getElementById("lo");
const saveToast = document.getElementById("sv");

function showSaveToast(texto) {
  if (!saveToast) return;
  saveToast.textContent = texto;
  saveToast.classList.add("on");
  setTimeout(() => saveToast.classList.remove("on"), 2200);
}

function atualizarStatusUI() {
  if (typeof window.stLine === "function") window.stLine();
  const fbCard = document.getElementById("fb_card");
  if (fbCard && window.DATA) fbCard.innerHTML = window.DATA.cardHtml();
  const mgCard = document.getElementById("mg_card");
  if (mgCard && window.DATA) mgCard.innerHTML = window.DATA.migHtml();
}

function checarProntidaoERenderizar() {
  atualizarStatusUI();
  if (window.DATA.ready && typeof window.render === "function") {
    window.render();
  }
}

function resetarSyncState() {
  syncState.weeks = { loaded: false, error: null };
  syncState.appts = { loaded: false, error: null };
  syncState.config = { loaded: false, error: null };
}

function pararEscutas() {
  if (unsubWeeks) { unsubWeeks(); unsubWeeks = null; }
  if (unsubAppts) { unsubAppts(); unsubAppts = null; }
  if (unsubConfig) { unsubConfig(); unsubConfig = null; }
}

function iniciarEscutas() {
  pararEscutas();
  resetarSyncState();
  atualizarStatusUI();

  unsubWeeks = onSnapshot(collection(db, "weeks"), (snapshot) => {
    const dados = {};
    snapshot.forEach((d) => { dados[d.id] = d.data(); });
    window.weeks = dados;
    if (typeof window.setWeeks === "function") window.setWeeks(dados);
    syncState.weeks.loaded = true;
    syncState.weeks.error = null;
    checarProntidaoERenderizar();
  }, (err) => {
    console.error("Erro /weeks:", err);
    syncState.weeks.error = err.code === "permission-denied" ? "Permissão negada em semanas" : (err.message || "Falha em semanas");
    checarProntidaoERenderizar();
  });

  unsubAppts = onSnapshot(collection(db, "appts"), (snapshot) => {
    const dados = {};
    snapshot.forEach((d) => { dados[d.id] = d.data(); });
    window.appts = dados;
    if (typeof window.setAppts === "function") window.setAppts(dados);
    syncState.appts.loaded = true;
    syncState.appts.error = null;
    checarProntidaoERenderizar();
  }, (err) => {
    console.error("Erro /appts:", err);
    syncState.appts.error = err.code === "permission-denied" ? "Permissão negada em consultas" : (err.message || "Falha em consultas");
    checarProntidaoERenderizar();
  });

  unsubConfig = onSnapshot(doc(db, "config", "main"), (snap) => {
    const cfgData = snap.exists() ? (snap.data().cfg || {}) : {};
    window.cfg = cfgData;
    if (typeof window.setCfg === "function") window.setCfg(cfgData);
    if (typeof window.applyCfg === "function") window.applyCfg();
    syncState.config.loaded = true;
    syncState.config.error = null;
    checarProntidaoERenderizar();
  }, (err) => {
    console.error("Erro /config/main:", err);
    syncState.config.error = err.code === "permission-denied" ? "Permissão negada em configurações" : (err.message || "Falha em configurações");
    checarProntidaoERenderizar();
  });
}

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  if (user) {
    body.classList.remove("locked");
    if (loginOverlay) loginOverlay.style.display = "none";
    if (loginPass) loginPass.value = "";
    if (loginErr) loginErr.textContent = "";
    iniciarEscutas();
  } else {
    pararEscutas();
    resetarSyncState();
    body.classList.add("locked");
    if (loginOverlay) loginOverlay.style.display = "flex";
    atualizarStatusUI();
  }
});

if (loginForm) {
  loginForm.onsubmit = async (e) => {
    e.preventDefault();
    if (loginBtn) loginBtn.disabled = true;
    if (loginErr) loginErr.textContent = "Conectando ao Firebase...";

    const email = resolverEmail(loginUser.value);
    const senha = loginPass.value;

    try {
      await signInWithEmailAndPassword(auth, email, senha);
      if (loginErr) loginErr.textContent = "";
    } catch (err) {
      console.error("Falha login:", err);
      let msg = "Usuário ou senha incorretos.";
      if (err.code === "auth/network-request-failed") msg = "Sem conexão com a internet.";
      else if (err.code === "auth/too-many-requests") msg = "Muitas tentativas. Aguarde alguns minutos.";
      else if (err.code === "auth/user-not-found" || err.code === "auth/invalid-credential" || err.code === "auth/wrong-password") {
        msg = "Conta inexistente ou senha incorreta no Firebase Authentication.";
      }
      if (loginErr) loginErr.textContent = msg;
    } finally {
      if (loginBtn) loginBtn.disabled = false;
    }
  };
}

if (logoutBtn) {
  logoutBtn.onclick = async () => {
    if (confirm("Deseja sair do painel?")) await signOut(auth);
  };
}

function calcularProximaVersao(docSnapshot) {
  if (!docSnapshot.exists()) return 1;
  const dados = docSnapshot.data();
  if (!("_v" in dados) || dados._v === null || dados._v === undefined) return 1;
  if (typeof dados._v === "number" && Number.isInteger(dados._v) && dados._v >= 1) return dados._v + 1;
  throw new Error("Versão (_v) inválida no banco. Atualização cancelada por segurança.");
}

window.DATA = {
  get ready() {
    return !!currentUser &&
      syncState.weeks.loaded && !syncState.weeks.error &&
      syncState.appts.loaded && !syncState.appts.error &&
      syncState.config.loaded && !syncState.config.error;
  },

  get loadingMessage() {
    if (!currentUser) return "Aguardando login";
    const errosAtivos = [];
    if (syncState.weeks.error) errosAtivos.push(syncState.weeks.error);
    if (syncState.appts.error) errosAtivos.push(syncState.appts.error);
    if (syncState.config.error) errosAtivos.push(syncState.config.error);
    if (errosAtivos.length > 0) return errosAtivos.join(" · ");
    if (!syncState.weeks.loaded || !syncState.appts.loaded || !syncState.config.loaded) {
      return "Sincronizando dados com servidor...";
    }
    return "Conexão confirmada";
  },

  async write(col, id, data) {
    if (!navigator.onLine) {
      alert("Sem conexão com a internet.");
      throw new Error("offline");
    }
    const ref = doc(db, col, id);
    try {
      await runTransaction(db, async (txn) => {
        const snap = await txn.get(ref);
        if (data === null) {
          if (snap.exists()) txn.delete(ref);
          return;
        }
        const novaVersao = calcularProximaVersao(snap);
        txn.set(ref, { ...data, _v: novaVersao });
      });
      showSaveToast("Dados salvos!");
    } catch (err) {
      console.error("Erro gravação:", err);
      alert("Erro ao gravar: " + (err.code === "permission-denied" ? "Permissão negada (UID não autorizado)" : (err.message || err.code)));
      throw err;
    }
  },

  async saveCfg(patch) {
    if (!navigator.onLine) {
      alert("Sem conexão com a internet.");
      return;
    }
    const ref = doc(db, "config", "main");
    try {
      await runTransaction(db, async (txn) => {
        const snap = await txn.get(ref);
        const novaVersao = calcularProximaVersao(snap);
        const cfgAtual = snap.exists() ? (snap.data().cfg || {}) : {};
        txn.set(ref, { cfg: { ...cfgAtual, ...patch }, _v: novaVersao });
      });
      const updated = { ...(window.cfg || {}), ...patch };
      window.cfg = updated;
      if (typeof window.setCfg === "function") window.setCfg(updated);
      if (typeof window.applyCfg === "function") window.applyCfg();
      showSaveToast("Configuração salva!");
    } catch (err) {
      console.error("Erro config:", err);
      alert("Erro ao salvar config: " + (err.message || err.code));
    }
  },

  async saveDoc(col, id, data) { return this.write(col, id, data); },
  async delDoc(col, id) { return this.write(col, id, null); },

  cardHtml() {
    const email = currentUser ? currentUser.email : "Não conectado";
    const status = this.loadingMessage;
    const color = this.ready ? "var(--g)" : (status.includes("Permissão") || status.includes("Falha") ? "var(--r)" : "var(--a)");
    return "<h2>Status da Conexão Firebase</h2><p class='note'>Projeto: <b>clinica-dr-lucas-mendes</b></p><p class='note'>Usuário conectado: <b>" + email + "</b></p><p class='note'>Estado do banco: <b style='color:" + color + "'>" + status + "</b></p>";
  },

  migHtml() {
    return "<h2>Migração dos dados locais antigos</h2><p class='note'>Lê dados de <code>kommo_painel_v1</code> e importa exclusivamente o que não existir no Firestore, com proteção anti-sobrescrita.</p><div class='row'><button class='b s' id='btn_mig_verificar'>Verificar dados locais</button></div><div id='mig_relatorio' style='margin-top:10px;' class='note'></div>";
  }
};

document.addEventListener("click", async (e) => {
  if (e.target && e.target.id === "btn_mig_verificar") {
    const report = document.getElementById("mig_relatorio");
    if (!report) return;
    if (!window.DATA.ready) {
      report.innerHTML = "<span style='color:var(--r)'>Aguarde a conexão com o Firestore estar confirmada. (" + window.DATA.loadingMessage + ")</span>";
      return;
    }
    const raw = localStorage.getItem("kommo_painel_v1");
    if (!raw) {
      report.innerHTML = "<span style='color:var(--g)'>Nenhum dado local antigo encontrado em <code>kommo_painel_v1</code>.</span>";
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      const sem = parsed.weeks || {};
      const app = parsed.appts || {};
      report.innerHTML = "<p>Encontrados: <b>" + Object.keys(sem).length + " semanas</b> e <b>" + Object.keys(app).length + " consultas</b>.</p><button class='b' id='btn_mig_executar'>Importar com validação e anti-sobrescrita</button>";

      const execBtn = document.getElementById("btn_mig_executar");
      if (execBtn) {
        execBtn.onclick = async () => {
          execBtn.disabled = true;
          execBtn.textContent = "Processando migração segura...";
          let imp = 0, pres = 0; const errs = [];

          for (const [id, w] of Object.entries(sem)) {
            if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(id) || Object.keys(w).length > 80) {
              errs.push("Semana " + id + " rejeitada por violar regras. Mantida intacta localmente.");
              continue;
            }
            try {
              const res = await runTransaction(db, async (txn) => {
                const s = await txn.get(doc(db, "weeks", id));
                if (s.exists()) return "pres";
                txn.set(doc(db, "weeks", id), { ...w, _v: 1 });
                return "imp";
              });
              if (res === "imp") imp++; else pres++;
            } catch (x) { errs.push("Semana " + id + ": " + (x.message || x.code)); }
          }

          for (const [id, a] of Object.entries(app)) {
            if (typeof a.patient !== "string" || !a.patient.trim() || a.patient.length > 200 || Object.keys(a).length > 20) {
              errs.push("Consulta " + id + " rejeitada por violar formato. Mantida intacta localmente.");
              continue;
            }
            try {
              const res = await runTransaction(db, async (txn) => {
                const s = await txn.get(doc(db, "appts", id));
                if (s.exists()) return "pres";
                txn.set(doc(db, "appts", id), { ...a, _v: 1 });
                return "imp";
              });
              if (res === "imp") imp++; else pres++;
            } catch (x) { errs.push("Consulta " + id + ": " + (x.message || x.code)); }
          }

          if (errs.length === 0) {
            report.innerHTML = "<span style='color:var(--g);font-weight:600;'>Migração concluída com sucesso:</span> " + imp + " novos registros importados, " + pres + " preservados intactos.";
          } else {
            report.innerHTML = "<span style='color:var(--a);font-weight:600;'>Concluída com pendências:</span> " + imp + " importados, " + pres + " preservados.<br><pre>" + errs.join("\n") + "</pre>";
          }
        };
      }
    } catch (err) {
      report.innerHTML = "<span style='color:var(--r)'>Erro: " + err.message + "</span>";
    }
  }
});
