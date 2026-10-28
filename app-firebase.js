// app-firebase.js
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
  runTransaction,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

// Inicialização segura
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let unsubWeeks = null;
let unsubAppts = null;
let unsubConfig = null;

// Diagnóstico e rastreamento de operações
let lastReadTime = null;
let lastWriteTime = null;
let lastCheckTime = null;
let lastCheckStatus = "sem_confirmacao"; // 'conectado' | 'verificando' | 'erro' | 'sem_confirmacao'
let lastCheckError = null;
let isWriting = false;

// Estado independente por escuta
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

// Elementos da interface
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

  // 1. Escuta /weeks
  unsubWeeks = onSnapshot(collection(db, "weeks"), (snapshot) => {
    const dados = {};
    snapshot.forEach((d) => { dados[d.id] = d.data(); });
    window.weeks = dados;
    if (typeof window.setWeeks === "function") window.setWeeks(dados);
    syncState.weeks.loaded = true;
    syncState.weeks.error = null;
    lastReadTime = Date.now();
    lastCheckStatus = "conectado";
    checarProntidaoERenderizar();
  }, (err) => {
    console.error("Erro na escuta /weeks:", err);
    syncState.weeks.error = err.code === "permission-denied" ? "Permissão negada em semanas" : (err.message || "Falha em semanas");
    lastCheckStatus = "erro";
    lastCheckError = syncState.weeks.error;
    checarProntidaoERenderizar();
  });

  // 2. Escuta /appts
  unsubAppts = onSnapshot(collection(db, "appts"), (snapshot) => {
    const dados = {};
    snapshot.forEach((d) => { dados[d.id] = d.data(); });
    window.appts = dados;
    if (typeof window.setAppts === "function") window.setAppts(dados);
    syncState.appts.loaded = true;
    syncState.appts.error = null;
    lastReadTime = Date.now();
    lastCheckStatus = "conectado";
    checarProntidaoERenderizar();
  }, (err) => {
    console.error("Erro na escuta /appts:", err);
    syncState.appts.error = err.code === "permission-denied" ? "Permissão negada em consultas" : (err.message || "Falha em consultas");
    lastCheckStatus = "erro";
    lastCheckError = syncState.appts.error;
    checarProntidaoERenderizar();
  });

  // 3. Escuta /config/main
  unsubConfig = onSnapshot(doc(db, "config", "main"), (snap) => {
    const cfgData = snap.exists() ? (snap.data().cfg || {}) : {};
    window.cfg = cfgData;
    if (typeof window.setCfg === "function") window.setCfg(cfgData);
    if (typeof window.applyCfg === "function") window.applyCfg();
    syncState.config.loaded = true;
    syncState.config.error = null;
    lastReadTime = Date.now();
    lastCheckStatus = "conectado";
    checarProntidaoERenderizar();
  }, (err) => {
    console.error("Erro na escuta /config/main:", err);
    syncState.config.error = err.code === "permission-denied" ? "Permissão negada em configurações" : (err.message || "Falha em configurações");
    lastCheckStatus = "erro";
    lastCheckError = syncState.config.error;
    checarProntidaoERenderizar();
  });
}

// Monitoramento de login
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

const fdt = t => t ? new Date(t).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';

window.DATA = {
  get ready() {
    return !!currentUser &&
      syncState.weeks.loaded && !syncState.weeks.error &&
      syncState.appts.loaded && !syncState.appts.error &&
      syncState.config.loaded && !syncState.config.error;
  },

  get isWriting() {
    return isWriting;
  },

  get lastRead() {
    return lastReadTime;
  },

  get lastWrite() {
    return lastWriteTime;
  },

  get loadingMessage() {
    if (!currentUser) return "Aguardando login";
    const errosAtivos = [];
    if (syncState.weeks.error) errosAtivos.push(syncState.weeks.error);
    if (syncState.appts.error) errosAtivos.push(syncState.appts.error);
    if (syncState.config.error) errosAtivos.push(syncState.config.error);
    if (errosAtivos.length > 0) return errosAtivos.join(" · ");
    if (!syncState.weeks.loaded || !syncState.appts.loaded || !syncState.config.loaded) {
      return "Sincronizando dados iniciais do servidor...";
    }
    return "Conexão confirmada";
  },

  // Verificação ativa, autorizada e não destrutiva do Firestore
  async checkConnection() {
    if (!currentUser) throw new Error("Usuário não autenticado");
    lastCheckStatus = "verificando";
    atualizarStatusUI();
    try {
      const snap = await getDoc(doc(db, "config", "main"));
      lastCheckTime = Date.now();
      lastReadTime = Date.now();
      lastCheckStatus = "conectado";
      lastCheckError = null;
      return true;
    } catch (err) {
      lastCheckTime = Date.now();
      lastCheckStatus = "erro";
      lastCheckError = err.message || err.code;
      throw err;
    } finally {
      atualizarStatusUI();
    }
  },

  async write(col, id, data) {
    if (!navigator.onLine) {
      alert("Sem conexão com a internet. A gravação foi cancelada.");
      throw new Error("offline");
    }
    isWriting = true;
    atualizarStatusUI();
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
      lastWriteTime = Date.now();
      showSaveToast("Dados salvos!");
    } catch (err) {
      console.error("Erro gravação:", err);
      alert("Erro ao gravar: " + (err.code === "permission-denied" ? "Permissão negada (UID não autorizado)" : (err.message || err.code)));
      throw err;
    } finally {
      isWriting = false;
      atualizarStatusUI();
    }
  },

  async saveCfg(patch) {
    if (!navigator.onLine) {
      alert("Sem conexão com a internet.");
      return;
    }
    isWriting = true;
    atualizarStatusUI();
    const ref = doc(db, "config", "main");
    try {
      await runTransaction(db, async (txn) => {
        const snap = await txn.get(ref);
        const novaVersao = calcularProximaVersao(snap);
        const cfgAtual = snap.exists() ? (snap.data().cfg || {}) : {};
        txn.set(ref, { cfg: { ...cfgAtual, ...patch }, _v: novaVersao });
      });
      lastWriteTime = Date.now();
      const updated = { ...(window.cfg || {}), ...patch };
      window.cfg = updated;
      if (typeof window.setCfg === "function") window.setCfg(updated);
      if (typeof window.applyCfg === "function") window.applyCfg();
      showSaveToast("Configuração salva!");
    } catch (err) {
      console.error("Erro config:", err);
      alert("Erro ao salvar config: " + (err.message || err.code));
    } finally {
      isWriting = false;
      atualizarStatusUI();
    }
  },

  async saveDoc(col, id, data) { return this.write(col, id, data); },
  async delDoc(col, id) { return this.write(col, id, null); },

  cardHtml() {
    const email = currentUser ? currentUser.email : "Não conectado";
    const uid = currentUser ? currentUser.uid : "—";
    const authTag = currentUser 
      ? '<span class="tag" style="background:var(--g);color:#fff">Autenticado</span>' 
      : '<span class="tag" style="background:var(--r);color:#fff">Desconectado</span>';

    const onlineTag = navigator.onLine 
      ? '' 
      : ' <span class="tag" style="background:var(--r);color:#fff">Offline (status desatualizado)</span>';

    const fsStateTag = lastCheckStatus === 'conectado'
      ? '<span class="tag" style="background:var(--g);color:#fff">Conectado</span>'
      : lastCheckStatus === 'verificando'
      ? '<span class="tag" style="background:var(--b);color:#fff">Verificando...</span>'
      : lastCheckStatus === 'erro'
      ? '<span class="tag" style="background:var(--r);color:#fff">Erro de leitura</span>'
      : '<span class="tag">Sem confirmação recente</span>';

    const writeTag = isWriting 
      ? '<span class="tag" style="background:var(--a);color:#fff">Gravação pendente...</span>' 
      : '<span class="tag">Nenhuma gravação pendente</span>';

    return `
      <h2>Status da Conexão Firebase</h2>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px;margin-top:12px">
        <div style="background:var(--bg);padding:12px;border-radius:10px">
          <h3 style="font-size:13px;text-transform:uppercase;margin:0 0 8px;color:var(--mut)">Autenticação</h3>
          <p style="margin:3px 0">Estado: ${authTag}</p>
          <p style="margin:3px 0">E-mail: <b>${email}</b></p>
          <p class="note" style="margin:3px 0;word-break:break-all">UID: <code>${uid}</code></p>
        </div>

        <div style="background:var(--bg);padding:12px;border-radius:10px">
          <h3 style="font-size:13px;text-transform:uppercase;margin:0 0 8px;color:var(--mut)">Conexão com Firestore</h3>
          <p style="margin:3px 0">Estado: ${fsStateTag}${onlineTag}</p>
          <p style="margin:3px 0">Projeto: <b>clinica-dr-lucas-mendes</b></p>
          <p class="note" style="margin:3px 0">Último teste: <b>${fdt(lastCheckTime || lastReadTime)}</b></p>
          ${lastCheckError ? `<p class="note" style="color:var(--r);margin:3px 0">${lastCheckError}</p>` : ''}
          <div class="row" style="margin-top:8px">
            <button class="b s" id="btn_fb_verificar" style="padding:4px 10px;font-size:12px">Verificar conexão agora</button>
          </div>
        </div>

        <div style="background:var(--bg);padding:12px;border-radius:10px">
          <h3 style="font-size:13px;text-transform:uppercase;margin:0 0 8px;color:var(--mut)">Atualização dos Dados</h3>
          <p style="margin:3px 0">Última leitura dos dados: <b>${fdt(lastReadTime)}</b></p>
          <p style="margin:3px 0">Última gravação realizada: <b>${fdt(lastWriteTime)}</b></p>
          <p style="margin:3px 0">Fila local: ${writeTag}</p>
        </div>
      </div>
    `;
  },

  migHtml() {
    return "<h2>Migração dos dados locais antigos</h2><p class='note'>Lê dados de <code>kommo_painel_v1</code> e importa exclusivamente o que não existir no Firestore, com proteção anti-sobrescrita.</p><div class='row'><button class='b s' id='btn_mig_verificar'>Verificar dados locais</button></div><div id='mig_relatorio' style='margin-top:10px;' class='note'></div>";
  }
};

// Evento do botão de verificação ativa do Firebase
document.addEventListener("click", async (e) => {
  if (e.target && e.target.id === "btn_fb_verificar") {
    const btn = e.target;
    btn.disabled = true;
    btn.textContent = "Verificando...";
    try {
      await window.DATA.checkConnection();
      showSaveToast("Conexão Firestore confirmada!");
    } catch (err) {
      console.error("Falha ao testar conexão:", err);
      showSaveToast("Erro na verificação do Firestore");
    } finally {
      btn.disabled = false;
      btn.textContent = "Verificar conexão agora";
    }
  }
});
