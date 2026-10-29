/**
 * Painel KOMMO – Conector Oficial Firebase Firestore (SDK v10 Modular)
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getFirestore, 
  doc, 
  setDoc, 
  deleteDoc, 
  onSnapshot, 
  collection, 
  enableIndexedDbPersistence 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ============================================================================
// ⚠️ SUBSTITUA PELAS SUAS CREDENCIAIS DO FIREBASE CONSOLE:
// (Acesse: Console Firebase > Configurações do Projeto > Geral > Seus Aplicativos Web)
// ============================================================================
const firebaseConfig = {
  apiKey: "SUA_API_KEY_AQUI",
  authDomain: "SEU_PROJETO.firebaseapp.com",
  projectId: "SEU_PROJETO_ID",
  storageBucket: "SEU_PROJETO.appspot.com",
  messagingSenderId: "SEU_MESSAGING_SENDER_ID",
  appId: "SEU_APP_ID"
};

let db = null;
let isFbConnected = false;

try {
  if (firebaseConfig.projectId && firebaseConfig.projectId !== "SEU_PROJETO_ID") {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    isFbConnected = true;

    // Habilita persistência offline do próprio Firestore (se suportado pelo navegador)
    try {
      enableIndexedDbPersistence(db).catch(err => {
        if (err.code !== 'failed-precondition' && err.code !== 'unimplemented') {
          console.warn("Persistência offline do Firestore desabilitada:", err);
        }
      });
    } catch(e) {}
  }
} catch (err) {
  console.error("Erro ao inicializar Firebase App:", err);
}

// Objeto global DATA exigido pelo index.html
window.DATA = {
  ready: isFbConnected,
  lastRead: Date.now(),

  // Gravação / exclusão de documentos (weeks, appts, etc.)
  async write(col, id, data) {
    if (!db) return false;
    try {
      const ref = doc(db, col, id);
      if (data === null) {
        await deleteDoc(ref);
      } else {
        await setDoc(ref, data, { merge: true });
      }
      return true;
    } catch (err) {
      console.error(`Erro ao gravar em ${col}/${id} no Firestore:`, err);
      throw err;
    }
  },

  // Gravação das configurações do painel
  async saveCfg(patch) {
    if (!db) return false;
    try {
      await setDoc(doc(db, "config", "general"), patch, { merge: true });
      return true;
    } catch (err) {
      console.error("Erro ao salvar configuração no Firestore:", err);
      throw err;
    }
  },

  // HTML do card de status no painel de configurações
  cardHtml: () => `
    <h2>Status do Firebase Firestore</h2>
    <p class="note" style="margin:4px 0">
      ${isFbConnected 
        ? `<span style="color:var(--g);font-weight:600">● Conectado com sucesso</span> ao projeto <code>${firebaseConfig.projectId}</code>`
        : `<span style="color:var(--r);font-weight:600">● Chaves não configuradas</span> (edite <code>app-firebase.js</code> com suas credenciais).`}
    </p>
    <p class="note" style="margin:4px 0">As gravações são persistidas no Firestore em nuvem e sincronizadas entre abas e dispositivos.</p>
  `,

  migHtml: () => ''
};

// ============================================================================
// ESCUTAS EM TEMPO REAL (onSnapshot)
// Sincroniza automaticamente qualquer alteração feita no banco com a interface
// ============================================================================
if (isFbConnected && db) {
  // 1. Semanas Lançadas
  onSnapshot(collection(db, "weeks"), snap => {
    const w = {};
    snap.forEach(d => { w[d.id] = d.data(); });
    window.DATA.lastRead = Date.now();
    if (typeof window.setWeeks === 'function') {
      window.setWeeks(w);
    }
    if (typeof window.stLine === 'function') window.stLine();
  }, err => {
    console.error("Erro ao escutar coleção 'weeks' no Firestore:", err);
  });

  // 2. Consultas Agendadas
  onSnapshot(collection(db, "appts"), snap => {
    const a = {};
    snap.forEach(d => { a[d.id] = d.data(); });
    window.DATA.lastRead = Date.now();
    if (typeof window.setAppts === 'function') {
      window.setAppts(a);
    }
    if (typeof window.stLine === 'function') window.stLine();
  }, err => {
    console.error("Erro ao escutar coleção 'appts' no Firestore:", err);
  });

  // 3. Configurações
  onSnapshot(collection(db, "config"), snap => {
    snap.forEach(d => {
      if (d.id === "general" && typeof window.setCfg === 'function') {
        window.setCfg(d.data());
      }
    });
  }, err => {
    console.error("Erro ao escutar coleção 'config' no Firestore:", err);
  });
}

// Atualiza o indicador de status no topo da página
if (typeof window.stLine === 'function') {
  window.stLine();
}
