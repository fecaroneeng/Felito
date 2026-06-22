
(function(){
/* ========== KEYS & STATE ========== */
const ITEMS_KEY = "felito_items_v_final_complete";
const CART_KEY  = "felito_cart_v_final_complete";
const NEXT_KEY  = "felito_next_v_final_complete";
const STOCK_KEY = "felito_stock_v_final_complete";
const LAST_CLIENT_KEY = "felito_last_v1";
const CLIENTS_KEY = "felito_clients_v1";
const FIDELITY_KEY = "felito_fidelity_v1";
const PACKAGING_KEY = "felito_packaging_v1";
const PRODUCTS_KEY  = "felito_products_v1"; // novo: catálogo mestre

let items = JSON.parse(localStorage.getItem(ITEMS_KEY) || "[]");
let cart = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
let nextOrder = Number(localStorage.getItem(NEXT_KEY) || 1);
let stock = JSON.parse(localStorage.getItem(STOCK_KEY) || "{}");
let lastClient = localStorage.getItem(LAST_CLIENT_KEY) || "";
let clients = JSON.parse(localStorage.getItem(CLIENTS_KEY) || "[]"); // {id,name,phone}
let fidelity = JSON.parse(localStorage.getItem(FIDELITY_KEY) || "{}"); // keyed by clientId
// Custo de embalagem por tamanho (R$ por unidade)
let packagingCosts = JSON.parse(localStorage.getItem(PACKAGING_KEY) || '{"240 mL":0.80,"480 mL":1.20,"1,5 L":2.50}');

// ========== CATÁLOGO MESTRE DE PRODUTOS ==========
// Estrutura padrão se não houver nada salvo
const DEFAULT_SABORES = [
  {id:'s-abacate',        name:'Abacate',               active:true},
  {id:'s-baunilha',       name:'Baunilha',              active:true},
  {id:'s-doce-leite',     name:'Doce de Leite',         active:true},
  {id:'s-doce-leite-coco',name:'Doce de Leite com Coco',active:true},
  {id:'s-limao-man',      name:'Limão com Manjericão',  active:true},
  {id:'s-limao-sic',      name:'Limão Siciliano',       active:true},
  {id:'s-maracuja',       name:'Maracujá',              active:true},
  {id:'s-morango',        name:'Morango',               active:true},
  {id:'s-romeu',          name:'Romeu & Julieta',       active:true},
  {id:'s-strogo',         name:'Strogonoff de Nozes',   active:true},
];
const DEFAULT_TAMANHOS = [
  {id:'t-240', name:'240 mL', volume:'240ml', active:true},
  {id:'t-480', name:'480 mL', volume:'480ml', active:true},
  {id:'t-15',  name:'1,5 L',  volume:'1500ml',active:true},
];
// precos: chave = "saborId||tamanhoId||localId", valor = { price, updatedAt }
let productsCatalog = JSON.parse(localStorage.getItem(PRODUCTS_KEY) || 'null') || {
  sabores: DEFAULT_SABORES,
  tamanhos: DEFAULT_TAMANHOS,
  precos: {}  // "saborId||tamanhoId||localId" -> preço
};

function saveProductsCatalog(){
  localStorage.setItem(PRODUCTS_KEY, JSON.stringify(productsCatalog));
  // Sync to cloud
  if(window.auth && auth.currentUser && window.db){
    db.collection('meta').doc('products_catalog').set(productsCatalog, {merge:true})
      .catch(e=>console.error('err products catalog cloud', e));
  }
}

function getActiveSabores(){ return productsCatalog.sabores.filter(s=>s.active); }
function getActiveTamanhos(){ return productsCatalog.tamanhos.filter(t=>t.active); }

// Busca preço do catálogo: sabor name, tamanho name, localId (opcional)
function getPriceFromCatalog(saborName, tamanhoName, localId){
  const s = productsCatalog.sabores.find(x=>x.name===saborName);
  const t = productsCatalog.tamanhos.find(x=>x.name===tamanhoName);
  if(!s || !t) return null;
  // tenta com local primeiro, depois sem local (preço global)
  if(localId){
    const kLocal = `${s.id}||${t.id}||${localId}`;
    if(productsCatalog.precos[kLocal] != null) return Number(productsCatalog.precos[kLocal]);
  }
  const kGlobal = `${s.id}||${t.id}`;
  if(productsCatalog.precos[kGlobal] != null) return Number(productsCatalog.precos[kGlobal]);
  return null;
}

// Popula selects de sabor e tamanho em toda a aplicação
function populateSaborSelect(sel, includeEmpty){
  if(!sel) return;
  const cur = sel.value;
  sel.innerHTML = '';
  if(includeEmpty){ const o=document.createElement('option'); o.value=''; o.textContent='Selecione um sabor'; sel.appendChild(o); }
  getActiveSabores().forEach(s=>{
    const o=document.createElement('option'); o.value=s.name; o.textContent=s.name; sel.appendChild(o);
  });
  if(cur) sel.value = cur;
}
function populateTamanhoSelect(sel, includeEmpty){
  if(!sel) return;
  const cur = sel.value;
  sel.innerHTML = '';
  if(includeEmpty){ const o=document.createElement('option'); o.value=''; o.textContent='Selecione um tamanho'; sel.appendChild(o); }
  getActiveTamanhos().forEach(t=>{
    const o=document.createElement('option'); o.value=t.name; o.textContent=t.name; sel.appendChild(o);
  });
  if(cur) sel.value = cur;
}
function refreshAllProductSelects(){
  populateSaborSelect(document.getElementById('inputSabor'), true);
  populateTamanhoSelect(document.getElementById('inputTamanho'), true);
  populateSaborSelect(document.getElementById('modalSabor'), false);
  populateTamanhoSelect(document.getElementById('modalTamanho'), false);
  // também atualiza selects dentro do estoque v2
  document.querySelectorAll('.sv2-sabor-select').forEach(s=>populateSaborSelect(s,false));
  document.querySelectorAll('.sv2-tamanho-select').forEach(s=>populateTamanhoSelect(s,false));
}
// Lotes de produção — sincronizados via Firestore (não mais localStorage)
let productionBatches = [];
let nextBatchNum = 1; // próximo número de lote (carregado do Firestore)

let fidelityLastSort = 'stamps-desc';

// Admin UIDs
const ADMINS = ["JmmhgkplxGfIcueIewnS89f4DM62"];

/* ========== DOM refs ========== */
const loginCard = document.getElementById('loginCard');
const loginEmail = document.getElementById('loginEmail');
const loginSenha = document.getElementById('loginSenha');
const btnLogin = document.getElementById('btnLogin');
const btnCriar = document.getElementById('btnCriar');
const appDiv = document.getElementById('app');
const btnLogout = document.getElementById('btnLogout');

const pedidoBadge = document.getElementById('pedidoBadge');
const pedidoBadge2 = document.getElementById('pedidoBadge2');
const btnEditCurrentOrder = document.getElementById('btnEditCurrentOrder');
const lastClientSpan = document.getElementById('lastClient');

const inputCliente = document.getElementById('inputCliente');
const inputTelefone = document.getElementById('inputTelefone');
const inputTamanho = document.getElementById('inputTamanho');
const inputQuantidade = document.getElementById('inputQuantidade');
const inputSabor = document.getElementById('inputSabor');
const inputValor = document.getElementById('inputValor');
const inputStatus = document.getElementById('inputStatus');
const clientsDatalist = document.getElementById('clientsDatalist');
const btnNewClient = document.getElementById('btnNewClient');

const btnAddToCart = document.getElementById('btnAddToCart');
const btnFinalize = document.getElementById('btnFinalize');
const btnCancelCart = document.getElementById('btnCancelCart');

const tbodyMain = document.getElementById('tbodyMain');
const cartList = document.getElementById('cartList');
const countItems = document.getElementById('countItems');
const sumTotal = document.getElementById('sumTotal');

const filterStatus = document.getElementById('filterStatus');
const sortSelect = document.getElementById('sortSelect');
const monthSelect = document.getElementById('monthSelect');
// novo: filtro por cliente na tabela principal
const clientFilter = document.getElementById('clientFilter');

const btnSyncFromCloud = document.getElementById('btnSyncFromCloud');
const btnForceSync = document.getElementById('btnForceSync');
const btnEditStock = document.getElementById('btnEditStock');
const btnCopyStock = document.getElementById('btnCopyStock');
const btnExportCSV = document.getElementById('btnExportCSV');
const btnImportCSV = document.getElementById('btnImportCSV');
const fileImportCSV = document.getElementById('fileImportCSV');
const btnExportClientsCSV = document.getElementById('btnExportClientsCSV');
const btnExportClientsJSON = document.getElementById('btnExportClientsJSON');
const btnImportClients = document.getElementById('btnImportClients');
const fileImportClients = document.getElementById('fileImportClients');
const btnExportJSON = document.getElementById('btnExportJSON');
const btnImportJSON = document.getElementById('btnImportJSON');
const fileImportJSON = document.getElementById('fileImportJSON');

const kpiPendentes = document.getElementById('kpiPendentes');
const kpiTotal = document.getElementById('kpiTotal');
const kpiValor = document.getElementById('kpiValor');

const stockBox = document.getElementById('stockBox');
const stockContent = document.getElementById('stockContent');

const modalBack = document.getElementById('modalBack');
const modalPedido = document.getElementById('modalPedido');
const modalCliente = document.getElementById('modalCliente');
const modalTelefone = document.getElementById('modalTelefone');
const modalTamanho = document.getElementById('modalTamanho');
const modalQtd = document.getElementById('modalQtd');
const modalSabor = document.getElementById('modalSabor');
const modalValor = document.getElementById('modalValor');
const modalStatus = document.getElementById('modalStatus');
const modalSave = document.getElementById('modalSave');
const modalCancel = document.getElementById('modalCancel');

const modalClientBack = document.getElementById('modalClientBack');
const clientName = document.getElementById('clientName');
const clientPhone = document.getElementById('clientPhone');
const clientSave = document.getElementById('clientSave');
const clientCancel = document.getElementById('clientCancel');

const modalFidelityBack = document.getElementById('modalFidelityBack');
const fidelityContent = document.getElementById('fidelityContent');
const fidelityClose = document.getElementById('fidelityClose');
const fidelityControls = document.getElementById('fidelityControls');

const modalSummaryBack = document.getElementById('modalSummaryBack');
const summaryMonth = document.getElementById('summaryMonth');
const summaryContent = document.getElementById('summaryContent');
const summaryClose = document.getElementById('summaryClose');
const summaryGenerate = document.getElementById('summaryGenerate');

const btnFidelity = document.getElementById('btnFidelity');
const btnClients = document.getElementById('btnClients');

const modalClientsBack = document.getElementById('modalClientsBack');
const clientsContent = document.getElementById('clientsContent');
const clientsNew = document.getElementById('clientsNew');
const clientsSearch = document.getElementById('clientsSearch');
const clientsClose = document.getElementById('clientsClose');

const btnSummary = document.getElementById('btnSummary');

// Esconder o campo telefone do layout de lançamento (exatamente como solicitado).
if(inputTelefone){
  inputTelefone.style.display = 'none';
  inputTelefone.disabled = true;
}

/* ========== helpers ========== */
function pad(n){ return String(n).padStart(3,'0'); }
// === helper para status resgate (usar em vários lugares) ===
function isResgateStatus(s){
  if(!s) return false;
  const v = String(s).trim().toLowerCase();
  return v === 'resgate' || v === 'resgatado';
}


function getCurrentOrder(){ return pad(nextOrder); }
function today(){ return new Date().toISOString().slice(0,10); }
function formatBRL(v){ return "R$ " + Number(v).toFixed(2); }
function defaultPriceFor(sabor,tamanho,localId){
  // 1. Tenta o catálogo mestre
  const catalogPrice = getPriceFromCatalog(sabor, tamanho, localId || null);
  if(catalogPrice !== null) return catalogPrice;
  // 2. Fallback para preços hardcoded
  const priceStandard = { "240 mL": 17.00, "480 mL": 30.00, "1,5 L": 85.00 };
  const pricePremium = { "240 mL": 20.00, "480 mL": 35.00, "1,5 L": 100.00 };
  const premiumFlavors = ["Romeu & Julieta","Doce de Leite com Coco","Strogonoff de Nozes"];
  if(premiumFlavors.includes(sabor)) return pricePremium[tamanho] ?? priceStandard[tamanho] ?? 0;
  return priceStandard[tamanho] ?? 0;
}
function saveAllLocal(){
  localStorage.setItem(ITEMS_KEY, JSON.stringify(items));
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  localStorage.setItem(NEXT_KEY, String(nextOrder));
  localStorage.setItem(STOCK_KEY, JSON.stringify(stock));
  localStorage.setItem(LAST_CLIENT_KEY, lastClient);
  localStorage.setItem(CLIENTS_KEY, JSON.stringify(clients));
  localStorage.setItem(FIDELITY_KEY, JSON.stringify(fidelity));
  localStorage.setItem(PACKAGING_KEY, JSON.stringify(packagingCosts));
  localStorage.setItem(PRODUCTS_KEY, JSON.stringify(productsCatalog));
}

/* small utility to show modals consistently and control z-index */
function showModal(backEl){
  if(!backEl) return;
  // ensure other modals are behind
  [modalBack, modalClientBack, modalFidelityBack, modalSummaryBack, modalClientsBack].forEach(el=>{ if(el && el !== backEl) el.style.zIndex = 50; });
  backEl.style.zIndex = 99999;
  backEl.style.display = 'flex';
  // prevent accidental double-click toggles and immediate backdrop-click closing
  backEl.dataset.open = '1';
  // short guard to avoid the click that opened the modal from being treated as a backdrop click
  backEl.dataset.justOpened = '1';
  // ensure any floating suggest is hidden when opening modals (fix overlay capturing clicks)
  const suggest = document.getElementById('clientsSuggest'); if(suggest) suggest.style.display = 'none';
  setTimeout(()=> { try{ delete backEl.dataset.justOpened; }catch(e){} }, 300);
}
function hideModal(backEl){ if(!backEl) return; backEl.style.display = 'none'; backEl.dataset.open = '0'; }

/* Client helpers */
function newClientId(name){ return 'cli-' + name.toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_-]/g,'') + '-' + Date.now(); }
function loadClientsFromItems(){
  const map = {};
  clients.forEach(c=> map[c.name] = c);
  items.forEach(it=>{
    const nm = (it.cliente||'').trim();
    if(!nm) return;
    if(!map[nm]){
      const c = { id: newClientId(nm), name: nm, phone: it.telefone || '' };
      clients.push(c); map[nm] = c;
    }
    it.clientId = map[nm].id;
  });
  saveAllLocal();
}

// helper: atualiza campos cliente/telefone/clientId dentro dos items e tenta propagar para a nuvem
async function updateItemsClientFields(clientId, clientName, clientPhone){
  let changed = false;
  for(let i=0;i<items.length;i++){
    const it = items[i];
    const matchesById = (it.clientId === clientId);
    const matchesByName = (!it.clientId && (it.cliente||'').trim() === (clientName||'').trim());
    if(!matchesById && !matchesByName) continue;

    // atualiza campos locais
    it.clientId = clientId;
    it.cliente = clientName || it.cliente || '';
    if(!it.telefone && clientPhone) it.telefone = clientPhone;
    if(!it._localId) it._localId = String(Date.now()) + "-" + i;
    changed = true;

    // se o item já existe na nuvem, atualiza o documento para persistir a alteração
    if(it._id && window.auth && auth.currentUser && window.db){
      // fire-and-forget, log de erro em console
      db.collection('pedidos').doc(it._id).update({
        cliente: it.cliente,
        telefone: it.telefone || '',
        clientId: it.clientId || null
      }).catch(e => console.error('Erro atualizar item cliente na nuvem', e));
    }
  }
  if(changed){
    saveAllLocal();
    populateClientsDatalist();
    renderTable();
    // escreve clients na nuvem também
    if(window.auth && auth.currentUser) writeClientsToCloud();
  }
}

function findClientByNameExact(name){ return clients.find(c => c.name === (name||'').trim()); }
function findClientById(id){ return clients.find(c => c.id === id); }
function createClient(name, phone){
  name = (name||'').trim(); if(!name) return null;
  const existing = findClientByNameExact(name);
  if(existing){
    // se já existe, só atualiza telefone se novo telefone fornecido e campo estava vazio
    if(phone && (!existing.phone || existing.phone.trim() === "" )){
      existing.phone = (phone||'').trim();
      saveAllLocal(); populateClientsDatalist(); writeClientsToCloud();
      // propagar atualização para itens relacionados
      updateItemsClientFields(existing.id, existing.name, existing.phone);
    }
    return existing;
  }
  const c = { id: newClientId(name), name, phone: (phone||'').trim() };
  clients.push(c);

  // vincular itens já existentes com esse nome
  items.forEach((it, idx) => {
    if((it.cliente||'').trim() === name && !it.clientId){
      it.clientId = c.id;
      if(!it.telefone && c.phone) it.telefone = c.phone;
      if(!it._localId) it._localId = String(Date.now()) + "-" + idx;
    }
  });

  saveAllLocal();
  populateClientsDatalist();
  writeClientsToCloud();

  // atualizar itens na nuvem (se possuírem _id)
  updateItemsClientFields(c.id, c.name, c.phone);

  return c;
}


function updateClient(cid, name, phone){
  const idx = clients.findIndex(c => c.id === cid);
  if(idx < 0) return null;
  const oldName = clients[idx].name;
  const oldPhone = clients[idx].phone || '';
  name = (name||'').trim();
  phone = (phone||'').trim();

  // detectar se existe outro cliente com mesmo nome (mesclar)
  const other = clients.find(c => c.name === name && c.id !== cid);
  if(other){
    // mover lançamentos deste cliente para 'other'
    items.forEach(it=>{
      if(it.clientId === cid) it.clientId = other.id;
      if((it.cliente||'').trim() === oldName) it.cliente = other.name;
      if((!it.telefone || it.telefone.trim()==='') && other.phone) it.telefone = other.phone;
      if(!it._localId) it._localId = String(Date.now()) + "-" + Math.floor(Math.random()*10000);
    });
    // atualizar telefone do 'other' se necessário
    if(phone && (!other.phone || other.phone.trim()==='')) other.phone = phone;
    // remover o cliente antigo
    clients.splice(idx,1);
    saveAllLocal(); populateClientsDatalist(); writeClientsToCloud();
    // propagar atualizações para a nuvem
    updateItemsClientFields(other.id, other.name, other.phone);
    return other;
  }

  // atualizar registro local do cliente
  clients[idx].name = name;
  clients[idx].phone = phone;

  // atualizar lançamentos locais que possuam esse clientId OU que possuam o nome antigo
  items.forEach((it, i) => {
    if(it.clientId === cid){
      // item já vinculado -> atualiza telefone e nome
      it.telefone = phone || it.telefone || '';
      it.cliente = name || it.cliente || '';
    } else {
      // item não tinha clientId mas o nome bate com o antigo -> assume o clientId agora
      if((it.cliente||'').trim() === oldName){
        it.cliente = name;
        it.clientId = cid;
        if(!it.telefone && phone) it.telefone = phone;
      }
    }
    if(!it._localId) it._localId = String(Date.now()) + "-" + i;
  });

  saveAllLocal();
  populateClientsDatalist();
  writeClientsToCloud();

  // agora PROPAGAR as mudanças para a nuvem, para evitar sobrescrita no próximo snapshot
  updateItemsClientFields(cid, name, phone);

  return clients[idx];
}

function deleteClient(cid){
  const idx = clients.findIndex(c => c.id === cid);
  if(idx < 0) return false;
  clients.splice(idx,1);
  items.forEach(it => { if(it.clientId === cid) it.clientId = null; });
  saveAllLocal(); populateClientsDatalist(); writeClientsToCloud();
  return true;
}
function populateClientsDatalist(){
  if(!clientsDatalist) return;
  clientsDatalist.innerHTML = '';
  const names = clients.map(c=>c.name).sort();
  names.forEach(n=>{ const o = document.createElement('option'); o.value = n; clientsDatalist.appendChild(o); });
}

/* ========== Normal fidelity helpers (unchanged) ========== */
function ensureFidelityClientEntry(clientId){ if(!clientId) return; if(!fidelity[clientId]) fidelity[clientId] = { totalStamps: 0, gifts: [] }; }

/* ── 90-day fidelity window ── */
function cutoffDate90(){
  const d = new Date(); d.setDate(d.getDate() - 90);
  return d.toISOString().slice(0,10);
}
function isWithin90Days(item){
  const d = item.data || item.date || '';
  if(!d) return true; // se não tem data, inclui por cautela
  return d >= cutoffDate90();
}

function computeStampsFromOrdersForClient(clientId){
  const pedidoMap = {};
  items.forEach(it => {
    if(!it.pedido) return;
    // NÃO considerar linhas que sejam resgates
    if(String((it.status||'')).toLowerCase() === 'resgate') return;
    // Apenas pedidos dos últimos 90 dias
    if(!isWithin90Days(it)) return;
    const key = String(it.pedido);
    if(!pedidoMap[key]) pedidoMap[key] = { total:0, clientId: it.clientId || (findClientByNameExact(it.cliente)||{}).id || null };
    pedidoMap[key].total += (Number(it.qtd)||0) * (Number(it.valor)||0);
    if(!pedidoMap[key].clientId) pedidoMap[key].clientId = it.clientId || (findClientByNameExact(it.cliente)||{}).id || null;
  });
  let total = 0;
  Object.keys(pedidoMap).forEach(pk => {
    const p = pedidoMap[pk];
    if(p.clientId === clientId){
      total += Math.floor((Number(p.total)||0) / 15);
    }
  });
  return total;
}


function recalcFidelityForClient(clientId){
  if(!clientId) return;
  ensureFidelityClientEntry(clientId);
  // selos ganhos apenas por pedidos normais (cada R$30 = 1 selo)
  const totalFromOrders = computeStampsFromOrdersForClient(clientId);
  fidelity[clientId].gifts = fidelity[clientId].gifts || [];

  // agora, qtdResgates vem dos lançamentos com status 'Resgate'
  const qtdResgates = items.filter(it => (it.clientId === clientId) && isResgateStatus(it.status)).length;

  // total de prêmios (vouchers) gerados pela soma de pedidos (antes dos resgates)
  const desiredGifts = Math.floor(totalFromOrders / 10);
  const existingTotal = fidelity[clientId].gifts.length;
  if(desiredGifts > existingTotal){
    const toCreate = desiredGifts - existingTotal;
    for(let i=0;i<toCreate;i++){
      fidelity[clientId].gifts.push({ id: 'gift-' + Date.now() + '-' + Math.floor(Math.random()*9999), createdAt: today(), status: 'Pendente', voucher: 'BRIND-' + Math.random().toString(36).slice(2,8).toUpperCase() });
    }
  }

  // sela atual = selos ganhos - (qtdResgates * 10)
  const remaining = Math.max(0, totalFromOrders - (qtdResgates * 10));
  fidelity[clientId].totalStamps = remaining;
  fidelity[clientId].stamps = remaining;
  fidelity[clientId]._computedFromOrders = totalFromOrders;
  saveAllLocal();
  if(window.auth && auth.currentUser){ writeFidelityToCloud(clientId, fidelity[clientId]).catch(e=>console.error('Erro gravar fidelity recalc',e)); }
}


function rebuildFidelityFromItems(){
  loadClientsFromItems();
  const pedidoMap = {};
  items.forEach(it=>{
    if(!it.pedido) return;
    // Apenas pedidos dos últimos 90 dias
    if(!isWithin90Days(it)) return;
    const key = String(it.pedido);
    if(!pedidoMap[key]) pedidoMap[key] = { total:0, clientId: it.clientId || (findClientByNameExact(it.cliente)||{}).id || null };
    pedidoMap[key].total += (Number(it.qtd)||0) * (Number(it.valor)||0);
    if(!pedidoMap[key].clientId) pedidoMap[key].clientId = it.clientId || (findClientByNameExact(it.cliente)||{}).id || null;
  });
  const stampsPerClient = {};
  Object.keys(pedidoMap).forEach(pk=>{
    const p = pedidoMap[pk]; if(!p.clientId) return;
    const stampsThisOrder = Math.floor((Number(p.total)||0) / 15);
    if(stampsThisOrder <= 0) return;
    stampsPerClient[p.clientId] = (stampsPerClient[p.clientId] || 0) + stampsThisOrder;
  });
  clients.forEach(c=>{
    const cid = c.id; ensureFidelityClientEntry(cid);
    const computedTotalFromOrders = stampsPerClient[cid] || 0;
    fidelity[cid].gifts = fidelity[cid].gifts || [];

    // contar resgates diretamente pelos lançamentos
    const qtdResgates = items.filter(it => (it.clientId === cid) && isResgateStatus(it.status)).length;

    fidelity[cid].totalStamps = Math.max(0, computedTotalFromOrders - (qtdResgates * 10));
    fidelity[cid].stamps = fidelity[cid].totalStamps;

    const desiredTotalGifts = Math.floor(computedTotalFromOrders / 10);
    const toCreate = Math.max(0, desiredTotalGifts - (fidelity[cid].gifts || []).length);
    for(let i=0;i<toCreate;i++) fidelity[cid].gifts.push({ id: 'gift-' + Date.now() + '-' + Math.floor(Math.random()*9999), createdAt: today(), status: 'Pendente', voucher: 'BRIND-' + Math.random().toString(36).slice(2,8).toUpperCase() });
  });

  clients.forEach(c => { if(!fidelity[c.id]) fidelity[c.id] = { totalStamps:0, gifts:[] }; });
  saveAllLocal();
}

function addStampsToClient_forFinalize(clientId, stamps){
  if(!clientId || (stamps||0) <= 0) return [];
  ensureFidelityClientEntry(clientId);
  fidelity[clientId].totalStamps = (Number(fidelity[clientId].totalStamps)||0) + Math.floor(stamps);
  const desiredTotalGifts = Math.floor((Number(fidelity[clientId].totalStamps) || 0) / 10);
  const existingTotalGifts = (fidelity[clientId].gifts || []).length;
  const toCreate = Math.max(0, desiredTotalGifts - existingTotalGifts);
  const created = [];
  for(let i=0;i<toCreate;i++){ const g = { id: 'gift-' + Date.now() + '-' + Math.floor(Math.random()*9999), createdAt: today(), status: 'Pendente', voucher: 'BRIND-' + Math.random().toString(36).slice(2,8).toUpperCase() }; fidelity[clientId].gifts.push(g); created.push(g); }
  saveAllLocal();
  if(window.auth && auth.currentUser){ writeFidelityToCloud(clientId, fidelity[clientId]).catch(e => console.error('Erro gravar fidelity no finalize', e)); }
  return created;
}

/* write helpers (cloud) */
function writeClientsToCloud(){ if(!window.auth || !auth.currentUser) return; try{ db.collection('meta').doc('clients').set({ list: clients }, { merge: true }).catch(e=>console.error('err clients cloud',e)); }catch(e){ console.error(e);} }
function writeFidelityToCloud(clientId, entry){
  if(!window.auth || !auth.currentUser) return Promise.resolve();
  try{
    if(clientId && entry){
      const payload = {};
      payload[clientId] = { ...entry, _lastUpdatedBy: auth.currentUser.uid, _lastUpdatedAt: firebase.firestore.FieldValue.serverTimestamp() };
      return db.collection('meta').doc('fidelity').set(payload, { merge: true }).catch(e => { console.error('err fidelity cloud client', e); throw e; });
    } else {
      const payload = { ...(fidelity || {}) , _lastUpdatedAt: firebase.firestore.FieldValue.serverTimestamp() };
      return db.collection('meta').doc('fidelity').set(payload, { merge: true }).catch(e => { console.error('err fidelity cloud', e); throw e; });
    }
  }catch(e){ console.error('writeFidelityToCloud error', e); return Promise.reject(e); }
}
function writeStockToCloud(){ if(!window.auth || !auth.currentUser) return; try{ db.collection('meta').doc('stocks').set(stock, { merge: true }).catch(err=>console.error('Erro gravar stocks na nuvem',err)); }catch(e){ console.error(e); } }

/* normalize item */
function normalizeItem(raw, indexSeed){
  const it = {};
  it.pedido = String(raw.pedido || getCurrentOrder()).replace(/\D/g,'');
  if(!it.pedido) it.pedido = getCurrentOrder();
  it.pedido = pad(Number(it.pedido));
  const d = raw.data || raw.date || today();
  if(typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) it.data = d;
  else { const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(String(d)); if(m) it.data = `${m[3]}-${m[2]}-${m[1]}`; else it.data = today(); }
  it.cliente = String(raw.cliente || raw.customer || 'Cliente').trim();
  it.telefone = String(raw.telefone || raw.phone || '').trim();
  it.tam = String(raw.tam || raw.tamanho || '240 mL').trim();
  it.qtd = Number(raw.qtd || raw.qty || raw.quantidade || 1) || 1;
  it.sabor = String(raw.sabor || raw.flavor || '').trim();
  const vraw = (raw.valor || raw.value || raw.preco || 0).toString().replace(',','.');
  it.valor = Number(parseFloat(vraw) || 0);
  it.status = String(raw.status || 'A Fazer');
  it.local = raw.local || null;
  it.seq = raw.seq || Date.now() + (indexSeed||0);
  it._localId = raw._localId || String(Date.now()) + "-" + Math.floor(Math.random()*10000);
  if(raw._id) it._id = raw._id;
  const existing = findClientByNameExact(it.cliente);
  if(existing) it.clientId = existing.id;
  return it;
}

function ensureLocalIds(){ for(let i=0;i<items.length;i++){ if(!items[i]._id && !items[i]._localId){ items[i]._localId = String(Date.now()) + "-" + i; } } }

/* ---------------- render cart / table ---------------- */
function renderCart(){
  pedidoBadge.textContent = getCurrentOrder();
  pedidoBadge2.textContent = getCurrentOrder();
  lastClientSpan.textContent = lastClient || "—";
  if(!cart.length){ cartList.innerHTML = "<em>Nenhum item adicionado</em>"; return; }
  let html = "<ol style='padding-left:18px;margin:6px 0;'>";
  cart.forEach((c,i)=>{ html += `<li>${c.qtd}x ${c.tam} ${c.sabor} — ${formatBRL(c.valor)} (total ${formatBRL(c.qtd*c.valor)}) <button data-rem="${i}" style="margin-left:8px;padding:4px;border-radius:6px" type="button">Rem</button></li>`; });
  html += "</ol>";
  cartList.innerHTML = html;
  cartList.querySelectorAll('button[data-rem]').forEach(b=> b.addEventListener('click', ()=>{ const i = Number(b.getAttribute('data-rem')); cart.splice(i,1); saveAllLocal(); renderCart(); }));
}

/* filter & sort */
function applyFilterAndSort(arr){
  let out = arr.slice();
  const st = filterStatus.value;
  if(st && st !== "all") out = out.filter(x => x.status === st);
  try {
    const q = (clientFilter && (clientFilter.value||'').trim().toLowerCase()) || '';
    if(q) {
      out = out.filter(it => {
        const clientName = (it.clientId ? (findClientById(it.clientId)?.name || '') : (it.cliente||'')) || '';
        const contact = (it.telefone||'') || '';
        return clientName.toLowerCase().includes(q) || contact.toLowerCase().includes(q);
      });
    }
  } catch(e) { console.error('erro filtro cliente', e); }
  const s = sortSelect.value;
  if(s === "pedido-desc") out.sort((a,b)=> (Number(b.pedido)||0) - (Number(a.pedido)||0));
  else if(s === "pedido-asc") out.sort((a,b)=> (Number(a.pedido)||0) - (Number(b.pedido)||0));
  else if(s === "recent") out.sort((a,b)=> (b.seq||0) - (a.seq||0));
  else if(s === "oldest") out.sort((a,b)=> (a.seq||0) - (b.seq||0));
  else if(s === "sabor-asc") out.sort((a,b)=> (a.sabor||'').localeCompare(b.sabor||''));
  return out;
}

function statusPill(s){ const cls = "s-" + (s||'').replace(/\s/g,'-'); return `<span class="status-pill ${cls}">${s}</span>`; }

/* ---- Quick inline status picker ---- */
const STATUS_OPTIONS = ['A Fazer','À Entregar','Entregue','Pago','Cancelado','Resgate'];

function openStatusPicker(docid, currentStatus, anchorEl){
  // Remove any existing picker
  document.getElementById('statusPickerPopup')?.remove();

  const popup = document.createElement('div');
  popup.id = 'statusPickerPopup';
  popup.className = 'status-picker-popup';

  STATUS_OPTIONS.forEach(s => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'status-picker-option s-' + s.replace(/\s/g,'-');
    btn.textContent = s;
    if(s === currentStatus) btn.classList.add('status-picker-current');
    btn.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      popup.remove();
      await quickUpdateStatus(docid, s);
    });
    popup.appendChild(btn);
  });

  document.body.appendChild(popup);

  // Position popup near the pill
  const rect = anchorEl.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom;
  const popH = 220; // approx
  if(spaceBelow > popH){
    popup.style.top  = (rect.bottom + window.scrollY + 4) + 'px';
  } else {
    popup.style.top  = (rect.top + window.scrollY - popH - 4) + 'px';
  }
  popup.style.left = Math.min(rect.left + window.scrollX, window.innerWidth - 160) + 'px';

  // Close on outside click
  function onOutside(e){ if(!popup.contains(e.target)){ popup.remove(); document.removeEventListener('click', onOutside, true); } }
  setTimeout(()=> document.addEventListener('click', onOutside, true), 10);
}

async function quickUpdateStatus(docid, newStatus){
  const idx = findItemIndexByDocId(docid);
  if(idx < 0) return;
  const oldItem = JSON.parse(JSON.stringify(items[idx]));
  items[idx].status = newStatus;
  if(isResgateStatus(newStatus)) items[idx].valor = 0;
  saveAllLocal();
  renderTable();
  // sync Firebase
  if(items[idx]._id && window.auth && auth.currentUser){
    try{
      const payload = { status: newStatus };
      if(isResgateStatus(newStatus)) payload.valor = 0;
      await db.collection('pedidos').doc(items[idx]._id).update(payload);
    } catch(err){ console.error('quickUpdateStatus cloud err', err); }
  }
}

/* renderStock - legacy, disabled in favour of multi-local stock v2 */
function renderStock(){
  if(stockBox) stockBox.style.display = 'none';
}

/* populate month selector */
function populateMonthSelector(){
  if(!monthSelect) return;
  const set = new Set();
  items.forEach(it=>{ if(!it || !it.data) return; const parts = String(it.data).split('-'); if(parts.length >= 2){ set.add(`${parts[0]}-${parts[1]}`); } });
  const now = new Date(); const curYM = now.toISOString().slice(0,7);
  set.add(curYM);
  const arr = Array.from(set).sort((a,b)=> b.localeCompare(a));
  const prev = monthSelect.value;
  monthSelect.innerHTML = '';
  const optAll = document.createElement('option'); optAll.value = 'all'; optAll.textContent = 'Todos'; monthSelect.appendChild(optAll);
  arr.forEach(ym=>{ const o = document.createElement('option'); const parts = ym.split('-'); const display = `${String(parts[1]).padStart(2,'0')}/${parts[0]}`; o.value = ym; o.textContent = display; monthSelect.appendChild(o); });
  if(prev && (prev === 'all' || Array.from(set).includes(prev))) monthSelect.value = prev; else monthSelect.value = curYM;
}

/* WhatsApp link */
function createWhatsAppLink(telefone){ if(!telefone) return ''; const cleanPhone = telefone.replace(/\D/g,''); if(cleanPhone.length < 10) return ''; const fullPhone = '55' + cleanPhone; return `https://wa.me/${fullPhone}`; }

/* render main table
   IMPORTANT: replaced inline onclicks with programmatic listeners to avoid issues where global functions
   might be overwritten and to ensure buttons reliably open the modal. This also fixes the Edit button not opening. */
function renderTable(){
  tbodyMain.innerHTML = "";
  let total = 0;
  ensureLocalIds();
  const view = applyFilterAndSort(items);

  view.forEach((p, viewIdx)=>{
    const valorTotal = Number(p.qtd) * Number(p.valor);
    if(String(p.status||'').toLowerCase() !== 'resgate'){
  total += valorTotal;
}

    const docid = p._id ? p._id : p._localId;

    let whatsappBtn = '';
    if(p.telefone){ const link = createWhatsAppLink(p.telefone); if(link){ whatsappBtn = `<a href="${link}" target="_blank" class="whatsapp-btn" title="Abrir WhatsApp">📱 WhatsApp</a>`; } }

    const clientLabel = p.clientId ? (findClientById(p.clientId)?.name || p.cliente) : p.cliente;

    const tr = document.createElement('tr');
    tr.setAttribute('data-docid', String(docid));
    tr.innerHTML = `
      <td class="status-cell" data-docid="${docid}"></td>
      <td>${clientLabel}</td>
      <td>${p.tam}</td>
      <td>${p.qtd}</td>
      <td>${p.sabor}</td>
      <td>${formatBRL(p.valor)}</td>
      <td>${formatBRL(valorTotal)}</td>
      <td>${p.pedido}</td>
      <td>${p.data || today()}</td>
      <td>${p.local && window.__locations ? (() => { const loc = window.__locations.find(l => l.id === p.local); return loc ? '<span style="display:inline-flex;align-items:center;gap:4px"><span style="width:8px;height:8px;border-radius:50%;background:' + loc.color + ';flex-shrink:0"></span>' + loc.name + '</span>' : (p.local||'—'); })() : '—'}</td>
      <td>${whatsappBtn}${p.telefone ? '<br><span class="small">' + p.telefone + '</span>' : '<span class="small muted">—</span>'}</td>
      <td class="actions-cell"></td>
    `;
    tbodyMain.appendChild(tr);

    // wire interactive status pill
    (function(){
      const statusTd = tr.querySelector('.status-cell');
      if(!statusTd) return;
      function buildPill(s){ const cls = 's-' + (s||'').replace(/\s/g,'-'); return `<span class="status-pill ${cls}" style="cursor:pointer;user-select:none" title="Clique para alterar status">${s}</span>`; }
      statusTd.innerHTML = buildPill(p.status);
      statusTd.querySelector('.status-pill').addEventListener('click', (ev)=>{
        ev.stopPropagation();
        openStatusPicker(docid, p.status, ev.currentTarget);
      });
    })();

    // create buttons with explicit data-action + data-docid
    const actionsTd = tr.querySelector('.actions-cell');
    const btnEdit = document.createElement('button'); btnEdit.type = 'button'; btnEdit.className = 'btn-gray'; btnEdit.style.marginRight = '6px'; btnEdit.style.fontSize = '0.8rem';
    btnEdit.textContent = 'Editar'; btnEdit.setAttribute('data-action','edit-item'); btnEdit.setAttribute('data-docid', String(docid));
    const btnEditNum = document.createElement('button'); btnEditNum.type = 'button'; btnEditNum.className = 'btn-gray'; btnEditNum.style.marginRight = '6px'; btnEditNum.style.fontSize = '0.8rem';
    btnEditNum.textContent = 'Editar Nº'; btnEditNum.setAttribute('data-action','edit-order'); btnEditNum.setAttribute('data-docid', String(docid));
    const btnDel = document.createElement('button'); btnDel.type = 'button'; btnDel.className = 'btn-red'; btnDel.style.fontSize = '0.8rem'; btnDel.textContent = 'Excluir';
    btnDel.setAttribute('data-action','delete-item'); btnDel.setAttribute('data-docid', String(docid));

    actionsTd.appendChild(btnEdit); actionsTd.appendChild(btnEditNum); actionsTd.appendChild(btnDel);

    // Adiciona listeners diretamente (mesma abordagem do arquivo antigo)
    btnEdit.addEventListener('click', (ev)=>{ ev.stopPropagation(); ev.preventDefault(); openEditModal(docid); });
    btnEditNum.addEventListener('click', (ev)=>{ ev.stopPropagation(); ev.preventDefault(); window.editOrderNum(docid); });
    btnDel.addEventListener('click', (ev)=>{ ev.stopPropagation(); ev.preventDefault(); window.deleteItem(docid); });
  }); // ✅ fecha o view.forEach

  countItems.textContent = view.length;
  sumTotal.textContent = formatBRL(total);


  countItems.textContent = view.length;
  sumTotal.textContent = formatBRL(total);
  const pendingCount = items.filter(it => !(
  it.status === "Entregue" ||
  it.status === "Pago" ||
  it.status === "Cancelado" ||
  it.status === "Resgate"
)).length;

  const sel = monthSelect ? monthSelect.value : 'all';
  const sizes = { "240 mL": 0, "480 mL": 0, "1,5 L": 0 };
  let valueForPeriod = 0;
  items.forEach(it => {
    try{
      if(!it.data) return;
      const parts = String(it.data).split('-'); const y = Number(parts[0]); const m = Number(parts[1]);
      const ym = `${String(parts[0])}-${String(parts[1]).padStart(2,'0')}`;
      const include = (sel === 'all') ? true : (sel === ym);
      if(include){ if(sizes[it.tam] !== undefined) sizes[it.tam] += Number(it.qtd || 0); else sizes[it.tam] = (sizes[it.tam]||0) + Number(it.qtd || 0); valueForPeriod += (Number(it.qtd||0) * Number(it.valor||0)); }
    }catch(e){}
  });

  kpiPendentes.textContent = pendingCount;
  kpiTotal.innerHTML = `<span class="kpi-pair"><span class="kpi-count">${sizes['240 mL'] || 0}</span><span class="kpi-size">- 240 mL</span></span><span class="kpi-delim"></span><span class="kpi-pair"><span class="kpi-count">${sizes['480 mL'] || 0}</span><span class="kpi-size">- 480 mL</span></span><span class="kpi-delim"></span><span class="kpi-pair"><span class="kpi-count">${sizes['1,5 L'] || 0}</span><span class="kpi-size">- 1,5 L</span></span>`;
  kpiValor.innerHTML = `|----------|<br>${formatBRL(valueForPeriod)}<br>|----------|`;

  renderStock(); populateMonthSelector();
}


/* stock helpers */
function stockKey(sabor,tam){ return `${sabor}||${tam}`; }
function ensureStockEntry(sabor,tam){ const k = stockKey(sabor,tam); if(!stock[k]) stock[k] = { qty: 0, valueUnit: defaultPriceFor(sabor,tam) }; stock[k].qty = Math.max(0, Number(stock[k].qty) || 0); stock[k].valueUnit = Number(stock[k].valueUnit) || 0; return stock[k]; }
function adjustStockForFinalize(item){ const k = stockKey(item.sabor,item.tam); ensureStockEntry(item.sabor,item.tam); stock[k].qty = Math.max(0, (Number(stock[k].qty) || 0) - Number(item.qtd || 0)); saveAllLocal(); writeStockToCloud(); if(window.__adjustStockV2ForFinalize) window.__adjustStockV2ForFinalize(item); }
function adjustStockOnEdit(oldItem,newItem){ if(oldItem){ const kOld = stockKey(oldItem.sabor,oldItem.tam); ensureStockEntry(oldItem.sabor,oldItem.tam); stock[kOld].qty = Math.max(0, (Number(stock[kOld].qty) || 0) + Number(oldItem.qtd || 0)); } const kNew = stockKey(newItem.sabor,newItem.tam); ensureStockEntry(newItem.sabor,newItem.tam); stock[kNew].qty = Math.max(0, (Number(stock[kNew].qty) || 0) - Number(newItem.qtd || 0)); saveAllLocal(); writeStockToCloud(); if(window.__adjustStockV2OnEdit) window.__adjustStockV2OnEdit(oldItem, newItem); }
function adjustStockOnDelete(item){ if(!item) return; const k = stockKey(item.sabor,item.tam); ensureStockEntry(item.sabor,item.tam); stock[k].qty = Math.max(0, (Number(stock[k].qty)||0) + Number(item.qtd||0)); saveAllLocal(); writeStockToCloud(); if(window.__adjustStockV2OnDelete) window.__adjustStockV2OnDelete(item); }

/* modal edit flow */
let editingDocId = null;
function findItemIndexByDocId(docid){ if(!docid) return -1; let idx = items.findIndex(it => it._id === docid); if(idx >= 0) return idx; idx = items.findIndex(it => String(it._localId) === String(docid)); if(idx >= 0) return idx; return -1; }
function openEditModal(docid){
  const idx = findItemIndexByDocId(docid);
  if(idx < 0){ alert("Item não encontrado para editar."); return; }
  const it = items[idx];
  editingDocId = docid;
  if(modalPedido) modalPedido.value = it.pedido;
  if(modalCliente) modalCliente.value = it.cliente;
  if(modalTelefone) modalTelefone.value = it.telefone || '';
  if(modalTamanho) modalTamanho.value = it.tam;
  if(modalQtd) modalQtd.value = it.qtd;
  if(modalSabor) modalSabor.value = it.sabor;
  if(modalValor) modalValor.value = it.valor;
  if(modalStatus) modalStatus.value = it.status;
  // populate modal local select
  const modalLocalSel = document.getElementById('modalLocal');
  if(modalLocalSel){
    modalLocalSel.innerHTML = '';
    try{ (window.__locations||[]).forEach(l => { const o = document.createElement('option'); o.value = l.id; o.textContent = l.name; modalLocalSel.appendChild(o); }); if(it.local) modalLocalSel.value = it.local; }catch(e){}
  }

  // hide floating client suggestions to avoid overlay capturing clicks
  const suggest = document.getElementById('clientsSuggest'); if(suggest) suggest.style.display = 'none';

  showModal(modalBack);

  // focus first input for quicker editing (optional)
  try{ if(modalCliente) modalCliente.focus(); }catch(e){}
}
if(modalCancel) modalCancel.addEventListener('click', ()=> { hideModal(modalBack); editingDocId = null; });

/* Ensure modal buttons are explicit type="button" to avoid form-submit behavior and capturing by default form actions */
if(modalSave && modalSave.tagName && modalSave.tagName.toLowerCase()==='button'){ modalSave.type = 'button'; }
if(clientSave && clientSave.tagName && clientSave.tagName.toLowerCase()==='button'){ clientSave.type = 'button'; }
if(fidelityClose && fidelityClose.tagName && fidelityClose.tagName.toLowerCase()==='button'){ fidelityClose.type = 'button'; }
if(clientsClose && clientsClose.tagName && clientsClose.tagName.toLowerCase()==='button'){ clientsClose.type = 'button'; }
if(clientCancel && clientCancel.tagName && clientCancel.tagName.toLowerCase()==='button'){ clientCancel.type = 'button'; }

/* Save handler: added ev.stopPropagation / preventDefault for robustness */
// ---------- Modal Save (mais robusto) ----------
if(modalSave){
  try{ modalSave.type = 'button'; }catch(e){}
  modalSave.addEventListener('click', async (ev)=>{
    if(ev){ ev.stopPropagation(); ev.preventDefault(); }
    try{
      // preferir editingDocId, mas ler do dataset como fallback
      const docid = editingDocId || (modalSave.getAttribute && modalSave.getAttribute('data-docid')) || null;
      if(!docid){ hideModal(modalBack); editingDocId = null; return; }

      const idx = findItemIndexByDocId(docid);
      if(idx < 0){ alert("Item não encontrado na lista ao salvar."); hideModal(modalBack); editingDocId = null; return; }

      const oldItem = JSON.parse(JSON.stringify(items[idx]));

      const safeVal = (el, fallback) => (el && ('value' in el) ? el.value : fallback);

      const updated = {
        ...oldItem,
        pedido: pad(Number(safeVal(modalPedido, oldItem.pedido)) || Number(oldItem.pedido) || nextOrder),
        cliente: String(safeVal(modalCliente, oldItem.cliente || '')).trim() || oldItem.cliente,
        telefone: String(safeVal(modalTelefone, oldItem.telefone || '')).trim() || '',
        tam: String(safeVal(modalTamanho, oldItem.tam || '')).trim() || oldItem.tam,
        qtd: Number(safeVal(modalQtd, oldItem.qtd || 1)) || 1,
        sabor: String(safeVal(modalSabor, oldItem.sabor || '')).trim() || oldItem.sabor,
        valor: Number(safeVal(modalValor, oldItem.valor || 0)) || 0,
        status: String(safeVal(modalStatus, oldItem.status || 'A Fazer')).trim() || oldItem.status,
        local: (document.getElementById('modalLocal')?.value) || oldItem.local || null
      };

      const cli = findClientByNameExact(updated.cliente) || createClient(updated.cliente, updated.telefone);
      if(cli) updated.clientId = cli.id;

      if(String(updated.status||'').toLowerCase() === 'resgate'){ updated.valor = 0; }

      // após montar 'updated' e setar clientId:
      if(isResgateStatus(updated.status)){
        updated.valor = 0;
}


      // ajustar estoques (reverte antigo e aplica novo)
      adjustStockOnEdit(oldItem, updated);

      // salvar local
      items[idx] = updated;
      saveAllLocal();
      renderTable();

      // sincronizar com nuvem, se possível
      if(updated._id && window.auth && auth.currentUser){
        try{
          await db.collection('pedidos').doc(updated._id).update({
            pedido: updated.pedido,
            cliente: updated.cliente,
            telefone: updated.telefone,
            tam: updated.tam,
            qtd: updated.qtd,
            sabor: updated.sabor,
            valor: updated.valor,
            status: updated.status
          });
        }catch(err){
          console.error('Erro ao atualizar na nuvem', err);
          alert('Erro ao atualizar na nuvem: ' + (err.message || err));
        }
      } else if(!updated._id && window.auth && auth.currentUser){
        try{
          const ref = await db.collection('pedidos').add({
            pedido: updated.pedido,
            data: updated.data || today(),
            cliente: updated.cliente,
            telefone: updated.telefone,
            tam: updated.tam,
            qtd: updated.qtd,
            sabor: updated.sabor,
            valor: updated.valor,
            status: updated.status,
            createdBy: auth.currentUser.uid,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            seq: Date.now(),
            _localId: updated._localId
          });
          items[idx]._id = ref.id;
          saveAllLocal();
        }catch(err){
          console.error('Erro criar na nuvem', err);
          alert('Erro criar na nuvem: ' + (err.message || err));
        }
      }

      hideModal(modalBack);
      editingDocId = null;
    }catch(err){
      console.error('Erro no modalSave handler', err);
      alert('Erro ao salvar (ver console): ' + (err.message || err));
    }
  });
}


/* delete item */
window.deleteItem = async function(docid){
  if(window.__deletingInProgress) return alert('Aguarde, operação anterior em andamento.');
  window.__deletingInProgress = true;
  try{
    const idx = findItemIndexByDocId(docid);
    if(idx < 0){ alert("Item não encontrado para excluir."); window.__deletingInProgress = false; return; }
    const it = items[idx];
    if(!confirm(`Excluir item Pedido ${it.pedido} — ${it.qtd}x ${it.tam} ${it.sabor} ?`)) { window.__deletingInProgress = false; return; }
    if(it._id && window.auth && auth.currentUser){ try{ await db.collection('pedidos').doc(it._id).delete(); } catch(err){ console.error(err); alert('Erro ao excluir na nuvem: ' + (err.message||err)); window.__deletingInProgress = false; return; } }
    adjustStockOnDelete(it);
    for(let i=0;i<items.length;i++){ const cand = items[i]; if((cand._id && cand._id === docid) || (cand._localId && cand._localId === docid)){ items.splice(i,1); break; } }
    saveAllLocal(); renderTable();
  } finally { window.__deletingInProgress = false; }
};

/* edit order number quick */
window.editOrderNum = function(docid){
  const idx = findItemIndexByDocId(docid);
  if(idx < 0){ alert("Item não encontrado para editar pedido."); return; }
  const it = items[idx];
  const newNum = prompt("Editar número do pedido (apenas número)", String(Number(it.pedido) || nextOrder));
  if(newNum === null) return;
  it.pedido = pad(Number(newNum) || Number(it.pedido) || nextOrder);
  saveAllLocal(); renderTable();
  if(it._id && window.auth && auth.currentUser){ db.collection('pedidos').doc(it._id).update({ pedido: it.pedido }).catch(e=>alert('Erro atualizar nuvem: '+(e.message||e))); }
};
window.editItem = function(docid){ openEditModal(docid); };

/* add to cart / finalize */
function fillDefaultPrice(){
  const sabor = inputSabor?.value;
  const tam = inputTamanho?.value;
  const hint = document.getElementById('valorHint');
  if(!sabor || !tam) {
    if(inputValor) inputValor.value = '';
    if(hint){ hint.textContent = ''; hint.className='valor-hint'; }
    return;
  }
  const localId = document.getElementById('inputLocal')?.value || null;
  const p = defaultPriceFor(sabor, tam, localId);
  // Só preenche automaticamente se o campo estiver vazio
  if(!inputValor.value || Number(inputValor.value) === 0) {
    inputValor.value = p.toFixed(2);
    if(hint){ hint.textContent = '✔ Preenchido automaticamente (editável)'; hint.className='valor-hint valor-auto'; }
  }
}
if(inputSabor) inputSabor.addEventListener('change', ()=>{ inputValor.value = ''; fillDefaultPrice(); });
if(inputTamanho) inputTamanho.addEventListener('change', ()=>{ inputValor.value = ''; fillDefaultPrice(); });
if(inputValor) inputValor.addEventListener('input', ()=>{ const hint=document.getElementById('valorHint'); if(hint){ hint.textContent=''; hint.className='valor-hint'; } });
// NÃO pré-preenche cliente: campo inicia vazio

// Autocomplete suggestions (mantido)
(function setupClientAutocomplete(){
  let suggest = document.getElementById('clientsSuggest');
  if(!suggest){ suggest = document.createElement('div'); suggest.id = 'clientsSuggest'; suggest.style.position = 'absolute'; suggest.style.zIndex = 10000; suggest.style.background = '#fff'; suggest.style.border = '1px solid #ddd'; suggest.style.borderRadius = '6px'; suggest.style.padding = '6px'; suggest.style.display = 'none'; suggest.style.maxHeight = '240px'; suggest.style.overflow = 'auto'; document.body.appendChild(suggest); }
  function positionSuggest(){ if(!inputCliente) return; const r = inputCliente.getBoundingClientRect(); suggest.style.left = (r.left + window.scrollX) + 'px'; suggest.style.top = (r.bottom + window.scrollY + 6) + 'px'; suggest.style.minWidth = Math.max(240, r.width) + 'px'; }
  if(!inputCliente) return;
  inputCliente.addEventListener('input', ()=>{
    const v = (inputCliente.value||'').trim(); positionSuggest();
    if(!v){ suggest.style.display = 'none'; if(inputTelefone) inputTelefone.value = ''; return; }
    const matches = clients.filter(c => (c.name||'').toLowerCase().includes(v.toLowerCase()));
    if(matches.length === 0){ suggest.innerHTML = '<div class="small muted">Nenhum cliente</div>'; suggest.style.display = 'block'; return; }
    suggest.innerHTML = matches.map(c => `<div class="client-suggest-item" data-id="${c.id}" style="padding:6px;border-bottom:1px solid #eee;cursor:pointer">${c.name}<br><span class="small muted">${c.phone||''}</span></div>`).join('');
    suggest.style.display = 'block';
    suggest.querySelectorAll('.client-suggest-item').forEach(el=>{ el.addEventListener('click', ()=>{ const id = el.getAttribute('data-id'); const c = findClientById(id); if(c){ inputCliente.value = c.name; if(inputTelefone) inputTelefone.value = c.phone || ''; inputCliente.dataset.clientId = c.id; suggest.style.display = 'none'; } }); });
  });
  document.addEventListener('click', (ev)=>{ try{ if(!suggest.contains(ev.target) && ev.target !== inputCliente) suggest.style.display = 'none'; }catch(e){} });
  window.addEventListener('resize', ()=>{ if(suggest.style.display !== 'none') positionSuggest(); });
})();

if(btnAddToCart) btnAddToCart.addEventListener('click', ()=> {
  const cliente = (inputCliente.value || "Cliente").trim();
  const clienteObj = findClientByNameExact(cliente);
  const telefoneDoCadastro = clienteObj ? (clienteObj.phone || '') : '';
  const tam = inputTamanho.value;
  const qtd = Number(inputQuantidade.value) || 1;
  const sabor = inputSabor.value;
  const valor = Number(inputValor.value) || 0;
  const status = inputStatus.value;

  // Se for Resgate, permitir valor 0; caso contrário, exigir valor > 0
  if(!sabor || !tam || qtd <= 0 || (!isResgateStatus(status) && valor <= 0)){
    alert("Preencha Sabor/Tamanho/Quantidade/Valor");
    return;
  }

  // Forçar valor 0 quando for Resgate
  let valorFinal = valor;
  if(isResgateStatus(status)) valorFinal = 0;

  let clienteObj2 = clienteObj;
  if(!clienteObj2 && cliente !== 'Cliente') clienteObj2 = createClient(cliente, '');

  const item = {
    pedido: getCurrentOrder(),
    data: today(),
    cliente,
    telefone: telefoneDoCadastro,
    tam,
    qtd,
    sabor,
    valor: valorFinal,
    status,
    local: document.getElementById('inputLocal')?.value || null,
    _localId: String(Date.now()) + "-" + Math.floor(Math.random()*10000),
    seq: Date.now(),
    clientId: clienteObj2 ? clienteObj2.id : null
  };

  cart.push(item);
  lastClient = cliente;
  saveAllLocal();
  renderCart();
  inputQuantidade.value = 1;
  inputValor.value = "";
});



if(btnCancelCart) btnCancelCart.addEventListener('click', ()=>{ if(!cart.length){ alert("Carrinho vazio."); return; } if(!confirm("Cancelar pedido atual?")) return; cart = []; saveAllLocal(); renderCart(); });

if(btnFinalize) btnFinalize.addEventListener('click', async ()=> {
  if(!cart.length){ alert("Carrinho vazio."); return; }
  // Prevent double click
  if(btnFinalize.disabled) return;
  btnFinalize.disabled = true;
  btnFinalize.textContent = '⏳ Finalizando...';

  const currentPedNum = getCurrentOrder();

  // mover cada item do cart para items (com spread correto)
  for(let i=0;i<cart.length;i++){
    const it = cart[i];
    const localCopy = { ...it, _id: null, seq: Date.now() + i, pedido: currentPedNum };
    if(isResgateStatus(localCopy.status)){
      localCopy.valor = 0;
    }
    if(!localCopy.clientId && localCopy.cliente){
      const c = findClientByNameExact(localCopy.cliente) || createClient(localCopy.cliente, localCopy.telefone);
      if(c) localCopy.clientId = c.id;
    }
    items.push(localCopy);
    adjustStockForFinalize(localCopy);
  }

  // calcular selos por cliente ignorando lançamentos do tipo Resgate
  const perClientTotals = {};
  items.filter(it => it.pedido === currentPedNum && !isResgateStatus(it.status)).forEach(it => {
    const cid = it.clientId || (findClientByNameExact(it.cliente)||{}).id || null;
    if(!cid) return;
    perClientTotals[cid] = (perClientTotals[cid]||0) + (Number(it.qtd)||0) * (Number(it.valor)||0);
  });

  Object.keys(perClientTotals).forEach(cid => {
    const tot = perClientTotals[cid];
    const selos = Math.floor(tot / 15);
    if(selos > 0) addStampsToClient_forFinalize(cid, selos);
  });

  saveAllLocal();
  renderTable();

  // sincroniza itens novos com a nuvem (mesma lógica que já existia)
  let cloudSuccess = false;
  if(window.auth && auth.currentUser){
    try{
      const unsynced = items.filter(it => !it._id);
      for(let i=0;i<unsynced.length;i++){
        const it = unsynced[i];
        const payload = {
          pedido: it.pedido,
          data: it.data,
          cliente: it.cliente,
          telefone: it.telefone,
          tam: it.tam,
          qtd: it.qtd,
          sabor: it.sabor,
          valor: it.valor,
          status: it.status,
          local: it.local || null,
          createdBy: auth.currentUser.uid,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          seq: it.seq || Date.now() + i,
          _localId: it._localId,
          clientId: it.clientId
        };
        const ref = await db.collection('pedidos').add(payload);
        for(let j=items.length-1;j>=0;j--){
          const cand = items[j];
          if(!cand._id && cand._localId && cand._localId === it._localId){
            cand._id = ref.id;
            cand.seq = payload.seq;
            break;
          }
        }
      }
      if(clients.length) db.collection('meta').doc('clients').set({ list: clients }, { merge: true });
      if(Object.keys(fidelity).length) db.collection('meta').doc('fidelity').set(fidelity, { merge: true });
      saveAllLocal();
      renderTable();
      cloudSuccess = true;
    }catch(err){
      console.error(err);
    }
  }

  cart = [];
  nextOrder++;
  saveAllLocal();
  renderCart();
  renderTable();

  // Reset form fields for next order
  if(inputCliente){ inputCliente.value = ''; delete inputCliente.dataset.clientId; }
  if(inputSabor) inputSabor.value = '';
  if(inputTamanho) inputTamanho.value = '';
  if(inputValor) inputValor.value = '';
  if(inputQuantidade) inputQuantidade.value = 1;

  btnFinalize.disabled = false;
  btnFinalize.textContent = '✓ Finalizar pedido';

  // Fechar painel e mostrar confirmação visual
  const closeBtn = document.getElementById('btnCloseOrderPanel');
  if(closeBtn) closeBtn.click();

  // Toast de sucesso
  const toast = document.createElement('div');
  toast.innerHTML = `✅ Pedido nº ${currentPedNum} finalizado!${cloudSuccess ? ' (sincronizado ☁️)' : ' (local)'}`;
  toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#012b29;color:#f2efeb;padding:14px 28px;border-radius:12px;font-weight:700;z-index:999999;box-shadow:0 4px 16px rgba(0,0,0,0.3);font-size:1rem;text-align:center;max-width:90vw';
  document.body.appendChild(toast);
  setTimeout(()=>toast.remove(), 3500);
});


/* ---------------- realtime listener & sync helpers ---------------- */
let unsubscribe = null;
let stockUnsubscribe = null;

function mergeCloudWithLocals(cloudList, localList){
  const result = [];
  const cloudMap = {};
  cloudList.forEach(c => { cloudMap[c._id] = c; result.push(c); });
  localList.forEach(l => {
    if(l._id){ if(!cloudMap[l._id]) result.push(l); }
    else {
      const exists = result.some(r => (r._localId && r._localId === l._localId) || (r.pedido === l.pedido && r.sabor === l.sabor && r.tam === l.tam && Number(r.valor).toFixed(2) === Number(l.valor).toFixed(2) && String(r.data) === String(l.data)));
      if(!exists) result.push(l);
    }
  });
  return result;
}

function startListener(){
  if(unsubscribe) return;
  if(!window.db) return console.warn('Firestore não inicializado (db não encontrado) — login necessário para startListener');
  unsubscribe = db.collection('pedidos').orderBy('seq','desc').onSnapshot(snapshot=>{
    const cloud = [];
    snapshot.forEach(doc=>{ const d = doc.data(); cloud.push({_id: doc.id, pedido: d.pedido || '000', data: d.data || today(), cliente: d.cliente || '', telefone: d.telefone || '', tam: d.tam || '', qtd: d.qtd || 1, sabor: d.sabor || '', valor: Number(d.valor || 0), status: d.status || 'A Fazer', seq: d.seq || 0, createdBy: d.createdBy || null, _localId: d._localId || null, clientId: d.clientId || null}); });
    const localUnsynced = items.filter(it => !it._id);
    items = mergeCloudWithLocals(cloud, localUnsynced);
    loadClientsFromItems(); rebuildFidelityFromItems(); saveAllLocal(); renderTable();
  }, err=>{ console.error('Listener error',err); alert('Erro listener: '+(err.message||err)); });
}
function stopListener(){ if(unsubscribe){ unsubscribe(); unsubscribe = null; } }

/* ---------------- meta listeners (clients / fidelity) ---------------- */
let metaUnsubscribe = null;
function startMetaListeners(){
  if(metaUnsubscribe || !window.db) return;
  try{
    metaUnsubscribe = {};
    metaUnsubscribe.clients = db.collection('meta').doc('clients').onSnapshot(doc=>{
      if(!doc.exists) return;
      const data = doc.data() || {};
      if(Array.isArray(data.list)){
        clients = data.list.slice(); populateClientsDatalist(); saveAllLocal(); renderClientsTable(); renderTable();
      }
    }, err=>{ console.error('meta clients listener', err); });

    metaUnsubscribe.fidelity = db.collection('meta').doc('fidelity').onSnapshot(doc => {
      if(!doc.exists) return;
      const raw = doc.data() || {};
      const cleaned = {};
      Object.keys(raw).forEach(k => { if(!k.startsWith('_')) cleaned[k] = raw[k]; });
      Object.keys(cleaned).forEach(k => { fidelity[k] = cleaned[k]; });
      saveAllLocal(); renderFidelityControls(); renderFidelityTable();
    }, err => { console.error('meta fidelity listener', err); });

  }catch(e){ console.error('startMetaListeners', e); }
}
function stopMetaListeners(){ try{ if(metaUnsubscribe && metaUnsubscribe.clients){ metaUnsubscribe.clients(); } if(metaUnsubscribe && metaUnsubscribe.fidelity){ metaUnsubscribe.fidelity(); } metaUnsubscribe = null; }catch(e){ console.error('stopMetaListeners', e); } }
function startStockListener(){ if(stockUnsubscribe) return; try{ stockUnsubscribe = db.collection('meta').doc('stocks').onSnapshot(doc=>{ if(!doc.exists) return; const remote = doc.data() || {}; Object.keys(remote).forEach(k=>{ stock[k] = remote[k]; }); Object.keys(stock).forEach(k=>{ stock[k].qty = Math.max(0, Number(stock[k].qty) || 0); stock[k].valueUnit = Number(stock[k].valueUnit) || 0; }); saveAllLocal(); renderStock(); }, err=>{ console.error('stock listener error',err); }); }catch(e){ console.error('startStockListener',e); } }
function stopStockListener(){ if(stockUnsubscribe){ stockUnsubscribe(); stockUnsubscribe = null; } }

async function fetchLastPedidoSetNext(){ try{ if(!window.db) return; const snap = await db.collection('pedidos').orderBy('pedido','desc').limit(1).get(); if(!snap.empty){ const last = snap.docs[0].data().pedido; const num = Number(last) || 0; if(num >= nextOrder) nextOrder = num + 1; saveAllLocal(); } }catch(err){ console.error(err); } }

/* Sync from cloud -> replace local */
if(btnSyncFromCloud) btnSyncFromCloud.addEventListener('click', async ()=>{
  if(!window.auth || !auth.currentUser) return alert('Faça login.');
  if(!confirm('Sincronizar da nuvem irá substituir seus dados locais. Continuar?')) return;
  try{
    const snap = await db.collection('pedidos').orderBy('seq','desc').get();
    const cloud = [];
    snap.forEach(doc=>{ const d = doc.data(); cloud.push({_id: doc.id, pedido: d.pedido||'000', data: d.data||today(), cliente: d.cliente||'', telefone: d.telefone||'', tam: d.tam||'', qtd: d.qtd||1, sabor: d.sabor||'', valor: Number(d.valor)||0, status: d.status||'A Fazer', seq: d.seq||0, _localId: d._localId || null, clientId: d.clientId || null}); });
    items = cloud;
    try{
      const stockDoc = await db.collection('meta').doc('stocks').get();
      if(stockDoc.exists){
        const remote = stockDoc.data() || {};
        stock = {};
        Object.keys(remote).forEach(k=>{ stock[k] = remote[k]; });
      }

      try{
        const cdoc = await db.collection('meta').doc('clients').get();
        if(cdoc.exists){
          const data = cdoc.data() || {};
          if(Array.isArray(data.list)) clients = data.list;
        }
      }catch(e){
        console.error('Erro buscar clients na nuvem',e);
      }

      try{
        const fdoc = await db.collection('meta').doc('fidelity').get();
        if(fdoc.exists){
          const raw = fdoc.data() || {};
          const cleaned = {};
          Object.keys(raw).forEach(k=>{ if(!k.startsWith('_')) cleaned[k]=raw[k]; });
          fidelity = cleaned;
        }
      }catch(e){
        console.error('Erro buscar fidelity na nuvem',e);
      }

    }catch(e){
      console.error('Erro buscar stocks na nuvem',e);
    }
    saveAllLocal(); rebuildFidelityFromItems(); renderTable(); await fetchLastPedidoSetNext(); alert('Sincronização concluída.');
  }catch(err){
    console.error(err); alert('Erro ao sincronizar: ' + (err.message||err));
  }
});


/* Force sync admin */
if(btnForceSync) btnForceSync.addEventListener('click', async ()=>{
  if(!window.auth || !auth.currentUser) return alert('Faça login.');
  const uid = auth.currentUser.uid; if(!ADMINS.includes(uid)) return alert('Seu usuário não é admin. Forçar sincronização não autorizado.');
  if(!confirm('FORÇAR sincronização irá deixar a nuvem igual aos seus dados locais (substituir). Recomendo exportar JSON antes. Continuar?')) return;
  (async function(){
    try{
      items.forEach((it, idx)=>{ if(!it._localId) it._localId = String(Date.now()) + "-" + idx; }); saveAllLocal();
      const snap = await db.collection('pedidos').get(); const cloud = []; snap.forEach(doc => { const d = doc.data(); cloud.push({ _id: doc.id, _localId: d._localId || null, pedido: d.pedido || null, data: d.data || null }); });
      const cloudById = {}; const cloudByLocalId = {}; cloud.forEach(c => { cloudById[c._id] = c; if(c._localId) cloudByLocalId[c._localId] = c; });
      const toCreate = []; const toUpdate = [];
      for(let i=0;i<items.length;i++){ const it = items[i]; if(it._id && cloudById[it._id]){ toUpdate.push({ id: it._id, payload: { pedido: it.pedido, data: it.data || today(), cliente: it.cliente, telefone: it.telefone || '', tam: it.tam, qtd: it.qtd, sabor: it.sabor, valor: it.valor, status: it.status, seq: it.seq || Date.now(), _localId: it._localId || null, clientId: it.clientId || null } }); }
        else if(it._localId && cloudByLocalId[it._localId]){ toUpdate.push({ id: cloudByLocalId[it._localId]._id, payload: { pedido: it.pedido, data: it.data || today(), cliente: it.cliente, telefone: it.telefone || '', tam: it.tam, qtd: it.qtd, sabor: it.sabor, valor: it.valor, status: it.status, seq: it.seq || Date.now(), _localId: it._localId, clientId: it.clientId || null } }); it._id = cloudByLocalId[it._localId]._id; }
        else { toCreate.push(it); } }
      const localIds = new Set(items.map(it => it._id).filter(Boolean)); const localLocalIds = new Set(items.map(it => it._localId).filter(Boolean));
      const toDeleteIds = []; cloud.forEach(c => { if(!localIds.has(c._id) && !(c._localId && localLocalIds.has(c._localId))){ toDeleteIds.push(c._id); } });
      const deleteBatchSize = 400; for(let i=0;i<toDeleteIds.length;i+=deleteBatchSize){ const slice = toDeleteIds.slice(i,i+deleteBatchSize); const b = db.batch(); slice.forEach(id => b.delete(db.collection('pedidos').doc(id))); await b.commit(); }
      const updateBatchSize = 400; for(let i=0;i<toUpdate.length;i+=updateBatchSize){ const slice = toUpdate.slice(i,i+updateBatchSize); const b = db.batch(); slice.forEach(u => { const ref = db.collection('pedidos').doc(u.id); b.set(ref, u.payload, { merge: true }); }); await b.commit(); }
      const createBatchSize = 200; for(let i=0;i<toCreate.length;i+=createBatchSize){ const slice = toCreate.slice(i,i+createBatchSize); const b = db.batch(); slice.forEach((it, idx)=>{ const ref = db.collection('pedidos').doc(); const payload = { pedido: it.pedido, data: it.data || today(), cliente: it.cliente, telefone: it.telefone || '', tam: it.tam, qtd: it.qtd, sabor: it.sabor, valor: it.valor, status: it.status, createdBy: uid, createdAt: firebase.firestore.FieldValue.serverTimestamp(), seq: it.seq || Date.now() + i + idx, _localId: it._localId || (String(Date.now()) + "-" + (i+idx)), clientId: it.clientId || null }; b.set(ref, payload); }); await b.commit(); }
      const afterSnap = await db.collection('pedidos').get(); const cloudAfter = []; afterSnap.forEach(doc => { const d = doc.data(); cloudAfter.push({_id: doc.id, _localId: d._localId || null}); }); const mapByLocal = {}; cloudAfter.forEach(c => { if(c._localId) mapByLocal[c._localId] = c._id; }); for(let i=0;i<items.length;i++){ const it = items[i]; if(!it._id && it._localId && mapByLocal[it._localId]) it._id = mapByLocal[it._localId]; }
      writeStockToCloud(); if(clients.length) db.collection('meta').doc('clients').set({ list: clients }, { merge: true }); if(Object.keys(fidelity).length) db.collection('meta').doc('fidelity').set(fidelity, { merge: true }); saveAllLocal(); renderTable(); alert('Forçar sincronização concluída (local -> nuvem).'); await fetchLastPedidoSetNext();
    }catch(err){ console.error('Erro forçar sync', err); alert('Erro ao forçar sincronização: ' + (err.message || err)); }
  })();
});

/* ---------------- Export / Import (CSV/JSON) ---------------- */
function csvFromRows(rows){ const sep = ';'; return rows.map(r => r.map(cell => { if(cell==null) return ""; const s=String(cell); if(s.includes(sep)||s.includes('"')||s.includes('\n')) return '"' + s.replace(/"/g,'""') + '"'; return s; }).join(sep)).join('\n'); }
if(btnExportCSV) btnExportCSV.addEventListener('click', ()=>{ const rows = [["pedido","data","cliente","telefone","tam","qtd","sabor","valor","status","clientId"]]; items.forEach(it => rows.push([it.pedido,it.data,it.cliente,it.telefone||'',it.tam,it.qtd,it.sabor, Number(it.valor).toFixed(2), it.status, it.clientId||''])); const csv = csvFromRows(rows); const blob = new Blob([csv],{type:'text/csv;charset=utf-8;'}); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `felito_items_${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url); });

if(btnExportClientsCSV) btnExportClientsCSV.addEventListener('click', () => { if (!clients || clients.length === 0) { alert('Nenhum cliente cadastrado.'); return; } const rows = [['id','nome','telefone'], ...clients.map(c => [c.id || '', c.name || '', c.phone || ''])]; const csv = rows.map(r => r.map(v => '"' + String(v).replace(/"/g,'""') + '"').join(';')).join('\n'); const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `felito_clientes_${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url); });
if(btnExportClientsJSON) btnExportClientsJSON.addEventListener('click', () => { if (!clients || clients.length === 0) { alert('Nenhum cliente cadastrado.'); return; } const blob = new Blob([JSON.stringify(clients, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `felito_clientes_${new Date().toISOString().slice(0,19).replace(/[:]/g,'')}.json`; a.click(); URL.revokeObjectURL(url); });

if(btnImportCSV) btnImportCSV.addEventListener('click', ()=> fileImportCSV.click());
if(fileImportCSV) fileImportCSV.addEventListener('change', async (e)=>{ const f = e.target.files[0]; if(!f) return; const text = await f.text(); const rows = parseCSV(text,';'); if(!rows.length) return alert('CSV inválido'); const header = rows[0].map(h=>h.trim().toLowerCase()); const needed = ['pedido','data','cliente','tam','qtd','sabor','valor','status']; const missing = needed.filter(n=>!header.includes(n)); if(missing.length) return alert('Colunas faltando: ' + missing.join(', ')); const imported = []; for(let i=1;i<rows.length;i++){ const r = rows[i]; if(!r || r.length===0) continue; const obj = {}; for(let c=0;c<r.length;c++) obj[header[c]] = r[c]; const norm = normalizeItem(obj, i); imported.push(norm); } if(!confirm('Importar CSV: OK para SUBSTITUIR os dados atuais. Cancelar para ACRÉSCIMO.')) items = items.concat(imported); else items = imported; items.forEach((it,idx)=>{ it.seq = it.seq || Date.now() + idx; if(!it._localId) it._localId = String(Date.now()) + "-" + idx; }); loadClientsFromItems(); rebuildFidelityFromItems(); saveAllLocal(); renderTable(); alert('Importação concluída.'); fileImportCSV.value = ""; });

if(btnImportClients) btnImportClients.addEventListener('click', () => fileImportClients.click());
if(fileImportClients) fileImportClients.addEventListener('change', async (e) => {
  const f = e.target.files[0]; if (!f) return; const text = await f.text();
  try {
    let importedClients = [];
    const name = (f.name || '').toLowerCase();
    if (name.endsWith('.json') || f.type === 'application/json') { const data = JSON.parse(text); if (Array.isArray(data)) importedClients = data; else if (Array.isArray(data.clients)) importedClients = data.clients; else throw new Error('JSON não contém um array de clientes.'); }
    else {
      const rows = parseCSV(text, ';'); if (!rows || rows.length < 1) throw new Error('CSV inválido ou vazio.'); const header = rows[0].map(h => String(h||'').trim().toLowerCase()); const idxId = header.indexOf('id'); const idxNome = header.indexOf('nome') >= 0 ? header.indexOf('nome') : header.indexOf('name'); const idxPhone = header.indexOf('telefone') >= 0 ? header.indexOf('telefone') : header.indexOf('phone'); if (idxNome < 0) throw new Error('CSV precisa conter coluna "nome" ou "name".'); for (let i = 1; i < rows.length; i++) { const r = rows[i]; if (!r || r.length === 0) continue; const obj = { id: idxId >= 0 ? (r[idxId] || '').trim() : '', name: r[idxNome] ? String(r[idxNome]).trim() : '', phone: idxPhone >= 0 && r[idxPhone] ? String(r[idxPhone]).trim() : '' }; if (!obj.name) continue; if (!obj.id) obj.id = newClientId(obj.name); importedClients.push(obj); } }
    if (!importedClients.length) return alert('Nenhum cliente válido encontrado no arquivo.'); const replace = confirm('Importação de clientes: OK para SUBSTITUIR clientes locais. Cancelar para ACRÉSCIMO (não duplicar por id).'); if (replace) { clients = importedClients.map(c => ({ id: c.id || newClientId(c.name||''), name: (c.name||'').trim(), phone: (c.phone||'').trim() })); } else { const mapById = {}; clients.forEach(c => { if(c && c.id) mapById[c.id] = c; }); const mapByName = {}; clients.forEach(c => { if(c && c.name) mapByName[c.name.trim().toLowerCase()] = c; }); importedClients.forEach(ic => { const id = ic.id || newClientId(ic.name||''); const name = (ic.name||'').trim(); const phone = (ic.phone||'').trim(); if (mapById[id]) { mapById[id].name = name || mapById[id].name; mapById[id].phone = phone || mapById[id].phone; } else if (name && mapByName[name.toLowerCase()]) { const ex = mapByName[name.toLowerCase()]; ex.phone = ex.phone || phone; } else { const newC = { id, name, phone }; clients.push(newC); mapById[id] = newC; mapByName[name.toLowerCase()] = newC; } }); }
    saveAllLocal(); populateClientsDatalist(); renderClientsTable(); renderFidelityControls(); renderFidelityTable(); if (typeof rebuildFidelityFromItems === 'function') rebuildFidelityFromItems(); if (auth && auth.currentUser) writeClientsToCloud(); alert('Importação de clientes concluída.');
  } catch (err) { console.error('Erro importar clientes', err); alert('Erro ao importar clientes: ' + (err.message || err)); } finally { fileImportClients.value = ''; }
});

if(btnExportJSON) btnExportJSON.addEventListener('click', ()=>{ const payload = {items, cart, nextOrder, stock, clients, fidelity}; const blob = new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `felito_backup_${new Date().toISOString().slice(0,19).replace(/[:]/g,'')}.json`; a.click(); URL.revokeObjectURL(url); });

if(btnImportJSON) btnImportJSON.addEventListener('click', ()=> fileImportJSON.click());
if(fileImportJSON) fileImportJSON.addEventListener('change', async (e)=>{ const f = e.target.files[0]; if(!f) return; const txt = await f.text(); try{ const data = JSON.parse(txt); if(!data || !Array.isArray(data.items)) throw new Error('Formato inválido'); if(!confirm('Importar JSON substituirá itens + carrinho + número do pedido. Continuar?')) return; items = data.items.map((it,idx)=>normalizeItem(it, idx)); cart = data.cart || []; nextOrder = Number(data.nextOrder) || 1; stock = data.stock || {}; if(Array.isArray(data.clients)) clients = data.clients; if(data.fidelity) fidelity = data.fidelity; saveAllLocal(); renderCart(); renderTable(); alert('Import JSON concluído.'); } catch(err){ alert('Erro ao importar JSON: ' + (err.message||err)); } fileImportJSON.value = ""; });

function parseCSV(text, sep=';'){ const lines = text.split(/\r\n|\n/).filter(l=>l.trim().length>0); return lines.map(line=>{ const cells = []; let cur = "", inQ=false; for(let i=0;i<line.length;i++){ const ch = line[i]; if(ch === '"'){ if(inQ && line[i+1] === '"'){ cur += '"'; i++; } else inQ = !inQ; continue; } if(!inQ && ch === sep){ cells.push(cur); cur = ""; continue; } cur += ch; } cells.push(cur); return cells; }); }

/* ---------------- Resumo mensal ---------------- */
if(btnSummary) btnSummary.addEventListener('click', ()=> { if(modalSummaryBack) showModal(modalSummaryBack); if(summaryMonth) summaryMonth.value = new Date().toISOString().slice(0,7); if(summaryContent) summaryContent.innerHTML = "<div class='small'>Escolha o mês e clique em Gerar</div>"; });
if(summaryClose) summaryClose.addEventListener('click', ()=> { if(modalSummaryBack) hideModal(modalSummaryBack); });
if(summaryGenerate) summaryGenerate.addEventListener('click', ()=>{
  const val = summaryMonth.value; if(!val) return alert('Escolha mês'); const [Y,M] = val.split('-').map(Number);
  const byFlavor = {}; const bySize = {}; let totalR = 0;
  items.forEach(it=>{ if(!it.data) return; const parts = String(it.data).split('-'); const y=Number(parts[0]); const m=Number(parts[1]); if(y===Y && m===M){ byFlavor[it.sabor] = byFlavor[it.sabor] || { qty:0, value:0 }; byFlavor[it.sabor].qty += (Number(it.qtd)||0); byFlavor[it.sabor].value += (Number(it.qtd)||0) * (Number(it.valor)||0); const key = `${it.sabor}||${it.tam}`; bySize[key] = bySize[key] || { sabor: it.sabor, tam: it.tam, qty:0, value:0 }; bySize[key].qty += (Number(it.qtd)||0); bySize[key].value += (Number(it.qtd)||0) * (Number(it.valor)||0); totalR += (Number(it.qtd)||0) * (Number(it.valor||0)); } });
  let html = `<div style="display:flex;justify-content:space-between;align-items:center"><h4>Resumo ${String(M).padStart(2,'0')}/${Y}</h4><div style="font-weight:700">${formatBRL(totalR)}</div></div>`;
  html += `<div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:8px">`;
  html += `<div style="min-width:240px"><h5>Por sabor</h5><table style="width:100%"><thead><tr><th>Sabor</th><th>Qtd</th><th>Valor</th></tr></thead><tbody>`;
  Object.keys(byFlavor).sort().forEach(k=> html += `<tr><td>${k}</td><td>${byFlavor[k].qty}</td><td>${formatBRL(byFlavor[k].value)}</td></tr>`);
  html += `</tbody></table></div>`;
  html += `<div style="min-width:320px"><h5>Por sabor + tamanho</h5><table style="width:100%"><thead><tr><th>Sabor</th><th>Tam</th><th>Qtd</th><th>Valor</th></tr></thead><tbody>`;
  Object.keys(bySize).sort().forEach(k=> { const v=bySize[k]; html += `<tr><td>${v.sabor}</td><td>${v.tam}</td><td>${v.qty}</td><td>${formatBRL(v.value)}</td></tr>`; });
  html += `</tbody></table></div></div>`;
  if(summaryContent) summaryContent.innerHTML = html;
});

/* ---------------- FIDELITY UI & controls ---------------- */
function renderFidelityControls(){
  fidelityControls.innerHTML = '';
  const sortSel = document.createElement('select');
  sortSel.innerHTML = `<option value="name-asc">Nome A→Z</option>\n                       <option value="name-desc">Nome Z→A</option>\n                       <option value="stamps-desc">Selos (maior)</option>\n                       <option value="stamps-asc">Selos (menor)</option>\n                       <option value="gifts-pending">Prêmios pendentes</option>`;
  sortSel.value = fidelityLastSort || 'stamps-desc'; fidelityControls.appendChild(sortSel);
  const filterInp = document.createElement('input'); filterInp.placeholder = 'Buscar cliente.'; filterInp.style.padding = '6px'; filterInp.style.borderRadius = '6px'; filterInp.style.border = '1px solid #ddd'; filterInp.style.marginLeft = '8px'; fidelityControls.appendChild(filterInp);
  const btnRefresh = document.createElement('button'); btnRefresh.className='btn-gray'; btnRefresh.textContent='Atualizar'; btnRefresh.style.marginLeft='8px'; fidelityControls.appendChild(btnRefresh);
  btnRefresh.addEventListener('click', ()=> { fidelityLastSort = sortSel.value; renderFidelityTable(sortSel.value, filterInp.value); });
  sortSel.addEventListener('change', ()=> { fidelityLastSort = sortSel.value; renderFidelityTable(sortSel.value, filterInp.value); });
  filterInp.addEventListener('input', ()=> renderFidelityTable(sortSel.value, filterInp.value));
}

function renderFidelityTable(sortBy = fidelityLastSort || 'stamps-desc', filterText = ''){
  loadClientsFromItems(); fidelityLastSort = sortBy;
  const list = clients.map(c => {
    const fid = fidelity[c.id] || { totalStamps: 0, gifts: [] };
    const pendingGifts = (fid.gifts||[]).filter(g => g.status === 'Pendente').length;
    // contar RESGATES pelos lançamentos
    const redeemedGifts = items.filter(it => (it.clientId === c.id) && isResgateStatus(it.status)).length;
    const totalGifts = (fid.gifts||[]).length;
    // recompute selos also for display
    const recomputed = computeStampsFromOrdersForClient(c.id) - (redeemedGifts * 10);
    const displayStamps = Math.max(0, Number(recomputed));
    return { id: c.id, name: c.name, phone: c.phone, totalStamps: Number(fid.totalStamps || displayStamps || 0), pendingGifts, redeemedGifts, totalGifts };
  });

  let out = list;
  if(filterText && filterText.trim()){ const q = filterText.trim().toLowerCase(); out = out.filter(x => x.name.toLowerCase().includes(q) || (x.phone||'').toLowerCase().includes(q)); }
  if(sortBy === 'name-asc') out.sort((a,b)=> a.name.localeCompare(b.name)); else if(sortBy === 'name-desc') out.sort((a,b)=> b.name.localeCompare(a.name)); else if(sortBy === 'stamps-desc') out.sort((a,b)=> (b.totalStamps||0) - (a.totalStamps||0)); else if(sortBy === 'stamps-asc') out.sort((a,b)=> (a.totalStamps||0) - (b.totalStamps||0)); else if(sortBy === 'gifts-pending') out.sort((a,b)=> b.pendingGifts - a.pendingGifts);

  let html = `<table class="fidelity-table"><thead><tr><th>Cliente</th><th>Selos (90 dias)</th><th>Resgates</th><th>Total Prêmios</th></tr></thead><tbody>`;
  out.forEach(c=>{ html += `<tr>\n      <td>${c.name}<br><span class="small muted">${c.phone||'—'}</span></td>\n      <td><span class="fidelity-seal">🏆 ${c.totalStamps}</span></td>\n      <td>${c.redeemedGifts}</td>\n      <td>${c.totalGifts}</td>\n    </tr>`; });
  html += `</tbody></table><div style="margin-top:10px;font-size:0.85rem;background:#fffbe6;border:1px solid #e9b42e;border-radius:8px;padding:10px;color:#7a5c1e">⏱️ <strong>Janela de 90 dias ativa:</strong> apenas pedidos a partir de <strong>${cutoffDate90()}</strong> são considerados para cálculo de selos. Pedidos mais antigos são ignorados automaticamente.</div>`;
  fidelityContent.innerHTML = html;

}

/* open fidelity modal */
if(btnFidelity) btnFidelity.addEventListener('click', ()=>{
  loadClientsFromItems(); if(Object.keys(fidelity).length === 0) rebuildFidelityFromItems(); renderFidelityControls(); fidelityLastSort = fidelityLastSort || 'stamps-desc'; clients.forEach(c => recalcFidelityForClient(c.id)); renderFidelityTable(fidelityLastSort, '');
  showModal(modalFidelityBack);
});
if(fidelityClose) fidelityClose.addEventListener('click', ()=> hideModal(modalFidelityBack));

function openFidelityClientModal(clientId){
  const c = findClientById(clientId);
  if(!c) return alert('Cliente não encontrado');
  ensureFidelityClientEntry(clientId);
  recalcFidelityForClient(clientId);
  const fid = fidelity[clientId] || { totalStamps:0, gifts:[] };
  let html = `<div><strong>${c.name}</strong><div class="small muted">${c.phone||'—'}</div></div>`;
  html += `<div style="margin-top:8px">Selos acumulados: <span class="fidelity-seal">🏆 ${fid.totalStamps||0}</span></div>`;
  html += `<div style="margin-top:8px"><h4>Prêmios</h4>`;
  if(!(fid.gifts||[]).length) html += `<div class="muted">Nenhum prêmio ainda.</div>`;
  else {
    html += `<table style="width:100%"><thead><tr><th>Voucher</th><th>Criado</th><th>Status</th><th>Ações</th></tr></thead><tbody>`;
    fid.gifts.forEach(g=>{
      const actions = g.status === 'Pendente' ? `<button type="button" class="small-btn btn-green" data-act="redeem" data-gid="${g.id}" data-cid="${clientId}">Resgatar</button>` : `<button type="button" class="small-btn btn-gray" data-act="show" data-gid="${g.id}" data-cid="${clientId}">Mostrar</button> <button type="button" class="small-btn btn-red" data-act="cancel" data-gid="${g.id}" data-cid="${clientId}">Cancelar resgate</button>`;
      html += `<tr><td>${g.voucher}</td><td>${g.createdAt}</td><td>${g.status}${g.redeemedAt ? '<br><span class="small muted">Resgatado: '+g.redeemedAt+'</span>' : ''}</td><td>${actions}</td></tr>`;
    });
    html += `</tbody></table>`;
  }

  // Histórico de resgates (puxado diretamente dos lançamentos)
  const history = items.filter(it => (it.clientId === clientId) && isResgateStatus(it.status))
                       .sort((a,b)=> (b.seq||0) - (a.seq||0));
  if(history.length){
    html += `<div style="margin-top:10px"><h4>Histórico de Resgates</h4><table style="width:100%"><thead><tr><th>Pedido</th><th>Data</th><th>Qtd</th><th>Sabor</th></tr></thead><tbody>`;
    history.forEach(h => { html += `<tr><td>${h.pedido}</td><td>${h.data || ''}</td><td>${h.qtd}</td><td>${h.sabor}</td></tr>`; });
    html += `</tbody></table></div>`;
  } else {
    html += `<div style="margin-top:10px" class="muted">Nenhum resgate registrado (pelo histórico de lançamentos).</div>`;
  }


  html += `</div>`;
  html += `<div style="margin-top:10px;text-align:right"><button class="btn-gray" id="closeClientFid" type="button">Fechar</button></div>`;


  fidelityContent.innerHTML = html;
  try{
    // Garantir listener para os botões "Ver / Resgatar" caso a delegação não esteja funcionando
    fidelityContent.querySelectorAll('button[data-action="view-client"]').forEach(btn => {
      btn.addEventListener('click', (ev) => {
        try{ ev.stopPropagation(); ev.preventDefault(); const cid = btn.getAttribute('data-id'); if(cid) openFidelityClientModal(cid); }catch(e){ console.error('err view-client click', e); }
      });
    });
  }catch(e){ console.error('renderFidelityTable attach view-client handlers', e); }
  document.getElementById('closeClientFid').addEventListener('click', ()=>{ renderFidelityTable(fidelityLastSort, ''); });
  fidelityContent.querySelectorAll('button[data-act=show]').forEach(b=>{ b.addEventListener('click', ()=>{ const gid = b.getAttribute('data-gid'); const cid = b.getAttribute('data-cid'); showGiftVoucher(cid, gid); }); });
  fidelityContent.querySelectorAll('button[data-act=cancel]').forEach(b=>{ b.addEventListener('click', ()=>{ const gid = b.getAttribute('data-gid'); const cid = b.getAttribute('data-cid'); cancelRedeem(cid, gid); }); });
}

function redeemGift(clientId, giftId){ const fid = fidelity[clientId]; if(!fid) return alert('Registro não encontrado'); const g = fid.gifts.find(x=>x.id === giftId); if(!g) return alert('Brinde não encontrado'); if(g.status !== 'Pendente') return alert('Brinde já resgatado.'); g.status = 'Resgatado'; g.redeemedAt = today(); saveAllLocal(); if(window.auth && auth.currentUser){ writeFidelityToCloud(clientId, fid).then(()=> { openFidelityClientModal(clientId); }).catch(err => { console.error('Erro gravar resgate na nuvem', err); alert('Erro ao gravar resgate na nuvem: ' + (err.message || err)); openFidelityClientModal(clientId); }); } else { alert('Resgate aplicado localmente. Faça login para sincronizar com a nuvem.'); openFidelityClientModal(clientId); } }

function cancelRedeem(clientId, giftId){ const fid = fidelity[clientId]; if(!fid) return alert('Registro não encontrado'); const g = fid.gifts.find(x=>x.id === giftId); if(!g) return alert('Brinde não encontrado'); if(g.status !== 'Resgatado') return alert('Apenas resgates podem ser cancelados.'); g.status = 'Pendente'; delete g.redeemedAt; saveAllLocal(); if(window.auth && auth.currentUser){ writeFidelityToCloud(clientId, fid).then(()=> openFidelityClientModal(clientId)).catch(err => { console.error('Erro cancelar resgate na nuvem', err); alert('Erro ao cancelar resgate: '+(err.message||err)); openFidelityClientModal(clientId); }); } else { alert('Cancelamento aplicado localmente. Faça login para sincronizar com a nuvem.'); openFidelityClientModal(clientId); } }

function showGiftVoucher(clientId, giftId){ const fid = fidelity[clientId]; if(!fid) return; const g = fid.gifts.find(x=>x.id === giftId); if(!g) return; const html = `<div><strong>Voucher: ${g.voucher}</strong><div class="small muted">Cliente: ${findClientById(clientId)?.name || '—'}</div><div class="voucher"><div style="font-weight:800">${g.voucher}</div><div class="small">Status: ${g.status}</div><div class="small">Criado: ${g.createdAt}</div>${g.redeemedAt ? `<div class="small">Resgatado: ${g.redeemedAt}</div>`: ''}</div><div style="text-align:right;margin-top:8px"><button class="btn-gray" id="closeVoucherBtn" type="button">Fechar</button></div></div>`; fidelityContent.innerHTML = html; document.getElementById('closeVoucherBtn').addEventListener('click', ()=>{ openFidelityClientModal(clientId); }); }

/* ---------------- Clients modal & receivables button ---------------- */
if(btnClients) btnClients.addEventListener('click', ()=>{ showModal(modalClientsBack); renderClientsTable(); });
if(clientsClose) clientsClose.addEventListener('click', ()=> hideModal(modalClientsBack));
if(clientsNew) clientsNew.addEventListener('click', ()=> { clientName.value = ''; clientPhone.value = ''; showModal(modalClientBack); currentEditingClientId = null; });
if(clientsSearch) clientsSearch.addEventListener('input', ()=> renderClientsTable(clientsSearch.value));

// Variável para controlar edição de cliente no modal sem sobrescrever listeners
let currentEditingClientId = null;

function renderClientsTable(query = ''){
  if(!clientsContent) return;
  // tenta preservar a ordenação atual se o select já existir na UI
  const existingSortEl = document.getElementById('clientsSortSelect');
  const preservedSortVal = existingSortEl ? existingSortEl.value : 'receivable-desc';

  // lista inicial (filtrar por query se fornecido)
  let list = clients.slice();
  if(query && query.trim()){
    const q = query.trim().toLowerCase();
    list = list.filter(c => (c.name||'').toLowerCase().includes(q) || (c.phone||'').toLowerCase().includes(q));
  }

  // mapa de recebíveis por cliente
  const receivablesMap = {};
  list.forEach(c => { receivablesMap[c.id] = 0; });
  items.forEach(it=>{
    const itClientId = it.clientId || (findClientByNameExact(it.cliente)||{}).id || null;
    if(!itClientId) return;
    const status = (it.status||'').toLowerCase();
    if(status === 'pago' || status === 'cancelado') return;
    const linhaValor = (Number(it.qtd||0) * Number(it.valor||0)) || 0;
    receivablesMap[itClientId] = (receivablesMap[itClientId]||0) + linhaValor;
  });

  // aplicar ordenação conforme valor preservado
  const sortVal = preservedSortVal || 'receivable-desc';
  if(sortVal === 'receivable-desc'){
    list.sort((a,b)=> (receivablesMap[b.id]||0) - (receivablesMap[a.id]||0));
  } else if(sortVal === 'receivable-asc'){
    list.sort((a,b)=> (receivablesMap[a.id]||0) - (receivablesMap[b.id]||0));
  } else if(sortVal === 'name-asc'){
    list.sort((a,b)=> (a.name||'').localeCompare(b.name||''));
  } else if(sortVal === 'name-desc'){
    list.sort((a,b)=> (b.name||'').localeCompare(a.name||''));
  } else if(sortVal === 'stamps-desc'){
    list.forEach(c => { if(!fidelity[c.id]) fidelity[c.id] = { totalStamps: 0, gifts: [] }; });
    list.sort((a,b)=> (Number(fidelity[b.id]?.totalStamps || 0)) - (Number(fidelity[a.id]?.totalStamps || 0)));
  } else {
    list.sort((a,b)=> (receivablesMap[b.id]||0) - (receivablesMap[a.id]||0));
  }

  // totais
  const totalReceivableAll = Object.keys(receivablesMap).reduce((acc, k) => acc + (receivablesMap[k] || 0), 0);
  const clientsWithReceivable = Object.keys(receivablesMap).filter(k => (receivablesMap[k]||0) > 0).length;

  // helper para marcar option selecionada (usa preservedSortVal)
  const sel = (v) => (sortVal === v ? ' selected' : '');

  // montar HTML (novo select criado aqui)
  let html = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <div>
        <label class="small">Ordenar:</label>
        <select id="clientsSortSelect" style="padding:6px;border-radius:6px;border:1px solid #ddd;margin-left:6px">
          <option value="receivable-desc"${sel('receivable-desc')}>Recebíveis (maior)</option>
          <option value="receivable-asc"${sel('receivable-asc')}>Recebíveis (menor)</option>
          <option value="name-asc"${sel('name-asc')}>Nome A→Z</option>
          <option value="name-desc"${sel('name-desc')}>Nome Z→A</option>
          <option value="stamps-desc"${sel('stamps-desc')}>Selos (maior)</option>
        </select>
      </div>
      <div style="text-align:right">
        <div style="font-weight:700">Total a receber: ${formatBRL(totalReceivableAll)}</div>
        <div class="small muted">${clientsWithReceivable} cliente(s) com saldo</div>
      </div>
    </div>
  `;

  if(!list.length){
    html += `<div style="text-align:center;padding:40px;color:#8a877c;font-style:italic">Nenhum cliente encontrado.</div>`;
  } else {
    html += `<div class="clients-grid">`;
    list.forEach(c=>{
      const clientId = c.id;
      const receivable = receivablesMap[clientId] || 0;
      const stamps = fidelity[clientId]?.totalStamps || 0;
      const gifts  = (fidelity[clientId]?.gifts || []).filter(g=>g.status==='Pendente').length;
      const phone  = c.phone || '';
      const waLink = phone ? createWhatsAppLink(phone) : '';
      html += `<div class="client-card${receivable>0?' client-card--pending':''}">
        <div class="client-card-name">${c.name}</div>
        <div class="client-card-meta">
          ${phone ? `<span>📞 ${phone}</span>` : '<span class="muted" style="font-size:0.78rem">Sem telefone</span>'}
          ${waLink ? `<a href="${waLink}" target="_blank" class="whatsapp-btn" style="font-size:0.75rem;padding:3px 7px;margin-left:6px">WhatsApp</a>` : ''}
        </div>
        <div class="client-card-stats">
          <div class="client-stat${receivable>0?' client-stat--warn':''}">
            <div class="client-stat-val">${formatBRL(receivable)}</div>
            <div class="client-stat-label">A receber</div>
          </div>
          <div class="client-stat">
            <div class="client-stat-val">${stamps} 🏷️</div>
            <div class="client-stat-label">Selos</div>
          </div>
          ${gifts>0?`<div class="client-stat client-stat--gift"><div class="client-stat-val">🎁 ${gifts}</div><div class="client-stat-label">Brinde(s)</div></div>`:''}
        </div>
        <div class="client-card-actions">
          <button type="button" class="small-btn btn-yellow" data-act="edit-client" data-id="${c.id}">✏️ Editar</button>
          <button type="button" class="small-btn btn-gray" data-act="msg-client" data-id="${c.id}">📋 Cobrar</button>
          <button type="button" class="small-btn btn-red" data-act="del-client" data-id="${c.id}">Apagar</button>
        </div>
      </div>`;
    });
    html += `</div>`;
  }
  clientsContent.innerHTML = html;

  // anexar listener do select recém-criado (apenas 1 vez porque o elemento foi recriado agora)
  const sortSelectEl2 = document.getElementById('clientsSortSelect');
  if(sortSelectEl2){
    sortSelectEl2.addEventListener('change', ()=> { renderClientsTable(query); });
  }

  // listeners dos botões da tabela
  clientsContent.querySelectorAll('button[data-act=edit-client]').forEach(b=>{
    b.addEventListener('click', ()=>{
      const id = b.getAttribute('data-id');
      const c = findClientById(id);
      if(!c) return alert('Cliente não encontrado');
      clientName.value = c.name;
      clientPhone.value = c.phone || '';
      showModal(modalClientBack);
      currentEditingClientId = id;
    });
  });

  clientsContent.querySelectorAll('button[data-act=del-client]').forEach(b=>{
    b.addEventListener('click', ()=>{
      const id = b.getAttribute('data-id');
      if(!confirm('Excluir cliente? Isso NÃO apagará pedidos anteriores, apenas desvinculará o cliente.')) return;
      deleteClient(id);
      saveAllLocal();
      renderClientsTable();
      renderTable();
    });
  });

  clientsContent.querySelectorAll('button[data-act=msg-client]').forEach(b=>{
    b.addEventListener('click', ()=>{
      const cid = b.getAttribute('data-id');
      const msg = buildPendingMessageForClient(cid);
      if(navigator.clipboard && navigator.clipboard.writeText){
        navigator.clipboard.writeText(msg).then(()=> alert('Mensagem copiada para área de transferência:\n\n' + msg)).catch(()=> { prompt('Copiar manualmente (Ctrl+C):', msg); });
      } else {
        prompt('Copiar manualmente (Ctrl+C):', msg);
      }
    });
  });
}


function buildPendingMessageForClient(clientId){ const map = {}; let total = 0; items.forEach(it=>{ const itClientId = it.clientId || (findClientByNameExact(it.cliente)||{}).id || null; if(itClientId !== clientId) return; const status = (it.status||'').toLowerCase(); if(status === 'pago' || status === 'cancelado' || isResgateStatus(status)) return; const key = `${it.sabor}||${it.tam}`; if(!map[key]) map[key] = { sabor: it.sabor, tam: it.tam, qtd: 0, total: 0 }; map[key].qtd += Number(it.qtd||0); map[key].total += Number(it.qtd||0) * Number(it.valor||0); }); const lines = Object.keys(map).map(k => map[k]); let msg = ''; lines.forEach(l=>{ msg += `${formatBRL(l.total)} por ${l.qtd} ${l.sabor} ${l.tam}\n`; total += l.total; }); msg += `\nTotal ${formatBRL(total)}\nPix CNPJ: 53643402000170`; return msg; }

/* ---------------- Initialization & misc ---------------- */
if(!localStorage.getItem(NEXT_KEY)) localStorage.setItem(NEXT_KEY,String(nextOrder));
if(!localStorage.getItem(ITEMS_KEY)) localStorage.setItem(ITEMS_KEY, JSON.stringify(items));
if(!localStorage.getItem(STOCK_KEY)) localStorage.setItem(STOCK_KEY, JSON.stringify(stock));


function ensureResgateOptionExists(){
  try{
    if(modalStatus){
      const has = Array.from(modalStatus.options).some(o => String(o.value||'').toLowerCase() === 'resgate');
      if(!has){
        const o = document.createElement('option');
        o.value = 'Resgate';
        o.textContent = 'Resgate';
        modalStatus.appendChild(o);
      }
    }
    if(filterStatus){
      const has = Array.from(filterStatus.options).some(o => String(o.value||'').toLowerCase() === 'resgate');
      if(!has){
        const o = document.createElement('option');
        o.value = 'Resgate';
        o.textContent = 'Resgate';
        filterStatus.appendChild(o);
      }
    }
  }catch(e){ console.error('ensureResgateOptionExists error', e); }
}
// chamar dentro de initUI()


function initUI(){
  ensureResgateOptionExists();
  if(window.__ensureDefaultLocations) window.__ensureDefaultLocations();
  if(window.__populateLocalSelect) window.__populateLocalSelect();
  refreshAllProductSelects();
  renderCart();
  populateMonthSelector();
  renderTable();
  populateClientsDatalist();
  renderClientsTable();
  renderFidelityControls();
  if(Object.keys(fidelity).length === 0 && items.length > 0) rebuildFidelityFromItems();
}
initUI();

/* ---- Order form modal panel ---- */
(function setupOrderFormToggle(){
  const btnShow  = document.getElementById('btnShowOrderForm');
  const backdrop = document.getElementById('modalOrderBack');
  const btnClose = document.getElementById('btnCloseOrderPanel');
  const btnFin   = document.getElementById('btnFinalize');
  const btnCan   = document.getElementById('btnCancelCart');
  const badge    = document.getElementById('orderCartBadge');
  if(!btnShow || !backdrop) return;

  function updateBadge(){
    if(!badge) return;
    const count = cart ? cart.length : 0;
    badge.textContent = count;
    badge.style.display = count > 0 ? 'inline-flex' : 'none';
  }

  function openPanel(){
    backdrop.style.display = 'flex';
    updateBadge();
    // Sempre que abrir: limpar campos para novo pedido
    const ic = document.getElementById('inputCliente');
    const is = document.getElementById('inputSabor');
    const it = document.getElementById('inputTamanho');
    const iv = document.getElementById('inputValor');
    const iq = document.getElementById('inputQuantidade');
    if(ic){ ic.value = ''; delete ic.dataset.clientId; }
    if(is) is.value = '';
    if(it) it.value = '';
    if(iv) iv.value = '';
    if(iq) iq.value = 1;
    // Ocultar sugestão de autocomplete
    const sug = document.getElementById('clientsSuggest'); if(sug) sug.style.display='none';
    setTimeout(()=>{ try{ ic?.focus(); }catch(e){} }, 80);
  }

  function closePanel(){
    backdrop.style.display = 'none';
    updateBadge();
  }

  btnShow.addEventListener('click', openPanel);
  if(btnClose) btnClose.addEventListener('click', closePanel);

  // Close on backdrop click (outside the panel)
  backdrop.addEventListener('click', e => { if(e.target === backdrop) closePanel(); });

  // Auto-close after finalize/cancel when cart is empty
  if(btnCan) btnCan.addEventListener('click', ()=>{ setTimeout(()=>{ if(!cart || cart.length === 0) closePanel(); updateBadge(); }, 60); });
  if(btnFin) btnFin.addEventListener('click', ()=>{ setTimeout(()=>{ if(!cart || cart.length === 0) closePanel(); updateBadge(); }, 60); });

  // Keep badge updated when items are added
  const btnAdd = document.getElementById('btnAddToCart');
  if(btnAdd) btnAdd.addEventListener('click', ()=>{ setTimeout(updateBadge, 60); });

  // If cart already has items on page load, open panel automatically
  if(cart && cart.length > 0) openPanel();

  // expose for external close
  window._closeOrderPanel = closePanel;
  window._updateOrderBadge = updateBadge;
})();

/* ---- Utils panel toggle ---- */
(function setupUtilsToggle(){
  const btn   = document.getElementById('btnToggleUtils');
  const panel = document.getElementById('utilsPanel');
  if(!btn || !panel) return;
  btn.addEventListener('click', ()=>{
    const isOpen = panel.style.display !== 'none';
    panel.style.display = isOpen ? 'none' : 'block';
    btn.textContent = isOpen ? '⚙️ Utilidades ▾' : '⚙️ Utilidades ▴';
  });
})();


// Delegação para ações da tabela (um listener central) — proteção para ev.target
if(tbodyMain){
  tbodyMain.addEventListener('click', (ev) => {
    // prevent bubbling causing backdrop to see the same click after showModal
    ev.stopPropagation();
    const target = ev.target;
    if(!target || typeof target.closest !== 'function') return;
    const btn = target.closest('button');
    if(!btn) return;
    const action = btn.getAttribute('data-action');
    const docid = btn.getAttribute('data-docid') || (btn.closest('tr') && btn.closest('tr').getAttribute('data-docid'));
    if(!action || !docid) return;

    if(action === 'edit-item'){ openEditModal(docid); }
    else if(action === 'edit-order'){ window.editOrderNum(docid); }
    else if(action === 'delete-item'){ window.deleteItem(docid); }
  });
}



if(filterStatus) filterStatus.addEventListener('change', ()=> renderTable());
if(sortSelect) sortSelect.addEventListener('change', ()=> renderTable());
if(monthSelect) monthSelect.addEventListener('change', ()=> renderTable());
if(clientFilter) clientFilter.addEventListener('input', ()=> renderTable());

window.assignLocalIdsIfMissing = function(){ let changed=false; items.forEach((it,i)=>{ if(!it._id && !it._localId){ it._localId = String(Date.now()) + "-" + i; changed=true; } }); if(changed){ saveAllLocal(); alert('IDs locais adicionados.'); } else alert('Nada a fazer.'); };

/* ---------------- Auth handling ---------------- */
let listenerStarted = false;
if(window.auth){
  auth.onAuthStateChanged(async (user)=>{
    try{
      if(user){
        loginCard.style.display = 'none'; appDiv.style.display = 'block';
        if(!listenerStarted && window.db){
          startListener(); startStockListener(); startMetaListeners();
          if(window.__startStockV2Listeners) window.__startStockV2Listeners();
          listenerStarted = true;
        }
        await fetchLastPedidoSetNext();
        rebuildFidelityFromItems();
        if(window.__loadProductsCatalogFromCloud) window.__loadProductsCatalogFromCloud();
        refreshAllProductSelects();
        renderTable();
      } else {
        loginCard.style.display = 'block'; appDiv.style.display = 'none';
        stopListener(); stopStockListener(); stopMetaListeners();
        if(window.__stopStockV2Listeners) window.__stopStockV2Listeners();
        listenerStarted = false;
      }
    }catch(err){ console.error('Erro no auth.onAuthStateChanged handler', err); alert('Erro de autenticação (ver console).'); }
  });
}

/* login / create / logout */
// login / create / logout (com checagem segura de auth)
if(btnLogin) btnLogin.addEventListener('click', ()=>{
  const e = (loginEmail && loginEmail.value || '').trim();
  const s = (loginSenha && loginSenha.value) || '';
  if(!e||!s) return alert('Preencha e-mail e senha');

  if(!window.auth || typeof auth.signInWithEmailAndPassword !== 'function'){
    console.error('Firebase auth não inicializado. window.auth:', window.auth);
    return alert('Autenticação não disponível — verifique se o Firebase foi inicializado.');
  }

  auth.signInWithEmailAndPassword(e,s).catch(err=>alert('Erro ao logar: '+(err.message||err)));
});

if(btnCriar) btnCriar.addEventListener('click', ()=>{
  const e = (loginEmail && loginEmail.value || '').trim();
  const s = (loginSenha && loginSenha.value) || '';
  if(!e||!s) return alert('Preencha e-mail e senha');

  if(!window.auth || typeof auth.createUserWithEmailAndPassword !== 'function'){
    console.error('Firebase auth não inicializado. window.auth:', window.auth);
    return alert('Autenticação não disponível — verifique se o Firebase foi inicializado.');
  }

  auth.createUserWithEmailAndPassword(e,s)
    .then(()=>alert('Conta criada. Faça login.'))
    .catch(err=>alert('Erro criar conta: '+(err.message||err)));
}); // ✅ FECHOU CERTO


if(btnLogout) btnLogout.addEventListener('click', ()=>{
  if(!window.auth || typeof auth.signOut !== 'function') return console.warn('logout: auth não definido');
  auth.signOut().catch(err=>console.error(err));
});


if(btnEditCurrentOrder) btnEditCurrentOrder.addEventListener('click', ()=> { const novo = prompt('Definir nº do pedido atual (apenas número). Ex: 5 -> 005', String(Number(nextOrder))); if(novo === null) return; const n = Number(novo); if(!Number.isInteger(n) || n<1) return alert('Número inválido.'); nextOrder = n; saveAllLocal(); renderCart(); });


// Botão novo cliente (Cadastrar) — abre modal com valores do campo cliente principal
if(btnNewClient) btnNewClient.addEventListener('click', ()=>{ clientName.value = inputCliente.value || ''; clientPhone.value = ''; currentEditingClientId = null; showModal(modalClientBack); });
if(clientCancel) clientCancel.addEventListener('click', ()=> hideModal(modalClientBack));

// Handler único de salvar cliente (utilizado tanto para criar quanto para editar)
if(clientSave) clientSave.addEventListener('click', ()=>{
  const name = (clientName.value||'').trim(); const phone = (clientPhone.value||'').trim(); if(!name) return alert('Digite nome do cliente');
  if(currentEditingClientId){ updateClient(currentEditingClientId, name, phone); currentEditingClientId = null; hideModal(modalClientBack); saveAllLocal(); renderClientsTable(); renderTable(); alert('Cliente atualizado.'); }
  else { const c = createClient(name, phone); if(c){ hideModal(modalClientBack); inputCliente.value = c.name; if(inputTelefone) inputTelefone.value = c.phone || ''; saveAllLocal(); renderTable(); alert('Cliente cadastrado.'); } }
});

/* make backdrop clicks close modal only when clicking the backdrop itself (and not inner content). This prevents flicker. */
[modalBack, modalClientBack, modalFidelityBack, modalSummaryBack, modalClientsBack].forEach(m=>{ if(!m) return; m.addEventListener('click', (ev)=>{ if(ev.target === m){ // avoid closing immediately after opening due to same click
      if(m.dataset && m.dataset.justOpened === '1') { return; }
      hideModal(m);
    } }); });

/* ensure fidelity modal close button also hides nicely */
if(fidelityClose) fidelityClose.addEventListener('click', ()=> hideModal(modalFidelityBack));


// Delegação única e segura para fidelidade (apenas uma vez)
if(typeof fidelityContent !== 'undefined' && fidelityContent){
  fidelityContent.addEventListener('click', (ev) => {
    // prevent backdrop click misinterpreting this same click after showModal
    ev.stopPropagation();
    ev.preventDefault();
    const target = ev.target;
    if(!target || typeof target.closest !== 'function') return;
    const btn = target.closest('button');
    if(!btn) return;

    const actionView = btn.getAttribute('data-action'); // view-client
    const action = btn.getAttribute('data-act'); // redeem/show/cancel
    const cid = btn.getAttribute('data-id') || btn.getAttribute('data-cid');

    if(actionView === 'view-client' && cid){
      // OPEN the client content inside the fidelity modal.
      // IMPORTANT: do NOT call showModal(modalFidelityBack) again here (it causes a re-show race that blocks clicks).
      openFidelityClientModal(cid);
      return;
    }
    if(action === 'redeem' && cid){
      const gid = btn.getAttribute('data-gid');
      if(gid) redeemGift(cid, gid);
      return;
    }
    if(action === 'show' && cid){
      const gid = btn.getAttribute('data-gid');
      if(gid) showGiftVoucher(cid, gid);
      return;
    }
    if(action === 'cancel' && cid){
      const gid = btn.getAttribute('data-gid');
      if(gid) cancelRedeem(cid, gid);
      return;
    }
  });
}



/* ---- expose locations for renderTable ---- */
Object.defineProperty(window, '__locations', { get: function(){ return locations; }, configurable: true });
Object.defineProperty(window, '__ensureDefaultLocations', { get: function(){ return ensureDefaultLocations; }, configurable: true });
Object.defineProperty(window, '__populateLocalSelect', { get: function(){ return populateLocalSelect; }, configurable: true });


/* ===== MÓDULO ESTOQUE MULTI-LOCAL v2 ===== */

/* ---- State & Keys ---- */
const LOCATIONS_KEY = "felito_locations_v1";
const STOCK_V2_KEY  = "felito_stock_v2_ml";
const TRANSFERS_KEY = "felito_transfers_v1";

let locations  = JSON.parse(localStorage.getItem(LOCATIONS_KEY) || "[]");
let stockV2    = JSON.parse(localStorage.getItem(STOCK_V2_KEY)  || "{}");
let transfers  = JSON.parse(localStorage.getItem(TRANSFERS_KEY) || "[]");
let sv2EntranceCart = []; // temp cart for batch stock entries
let sv2LastEstoqueLoc = null;

const LOC_COLORS = ['#012b29','#e9b42e','#ff6b6b','#2196f3','#9c27b0','#43a047','#e67e22','#00838f'];

/* ---- Persist ---- */
function saveStockV2Local(){
  localStorage.setItem(LOCATIONS_KEY, JSON.stringify(locations));
  localStorage.setItem(STOCK_V2_KEY,  JSON.stringify(stockV2));
  localStorage.setItem(TRANSFERS_KEY, JSON.stringify(transfers));
}

/* ---- Cloud write ---- */
function writeStockV2ToCloud(){
  if(!window.auth || !auth.currentUser || !window.db) return;
  db.collection('meta').doc('stock_v2').set(
    { entries: stockV2, _updatedAt: firebase.firestore.FieldValue.serverTimestamp() },
    { merge: true }
  ).catch(e => console.error('writeStockV2ToCloud', e));
  db.collection('meta').doc('locations').set(
    { list: locations, _updatedAt: firebase.firestore.FieldValue.serverTimestamp() },
    { merge: true }
  ).catch(e => console.error('writeLocationsToCloud', e));
  db.collection('meta').doc('transfers').set(
    { list: transfers.slice(-500), _updatedAt: firebase.firestore.FieldValue.serverTimestamp() },
    { merge: true }
  ).catch(e => console.error('writeTransfersToCloud', e));
}

/* ---- Firestore: Production Batches ---- */
function writeProductionBatchToCloud(batch){
  if(!window.db || !window.auth?.currentUser) return Promise.resolve();
  return db.collection('producao_lotes').doc(batch.id).set({
    ...batch,
    _updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }).catch(e => console.error('writeProductionBatchToCloud', e));
}

function deleteProductionBatchFromCloud(id){
  if(!window.db || !window.auth?.currentUser) return;
  db.collection('producao_lotes').doc(id).delete()
    .catch(e => console.error('deleteProductionBatchFromCloud', e));
}

function updateProductionBatchInCloud(id, updates){
  if(!window.db || !window.auth?.currentUser) return;
  db.collection('producao_lotes').doc(id).update({
    ...updates,
    _updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }).catch(e => console.error('updateProductionBatchInCloud', e));
}

function calcBatchCosts(totalCost, qtys){
  const tamanhos = getActiveTamanhos().map(t=>t.name); if(!tamanhos.length) tamanhos.push('240 mL','480 mL','1,5 L');
  const TAM_VOL  = {'240 mL': 240, '480 mL': 480, '1,5 L': 1500};
  const weightedTotal = tamanhos.reduce((s,t) => s + (Number(qtys[t])||0) * TAM_VOL[t], 0);
  if(!weightedTotal) return null;
  const costPerMl = totalCost / weightedTotal;
  return tamanhos.reduce((acc,t) => {
    acc[t] = +(costPerMl * TAM_VOL[t] + (packagingCosts[t]||0)).toFixed(4);
    return acc;
  }, {});
}

/* ---- Location helpers ---- */
function newLocId(name){
  return 'loc-' + (name||'loc').toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_-]/g,'') + '-' + Date.now();
}

function getDefaultLocation(){
  return locations.find(l => l.isDefault) || locations[0] || null;
}

function findLocationById(id){ return locations.find(l => l.id === id); }

function ensureDefaultLocations(){
  if(locations.length > 0) return;
  const casaId = 'loc-casa';
  locations = [
    { id: casaId,          name: 'Casa',             color: LOC_COLORS[0], isDefault: true  },
    { id: 'loc-delicatto', name: 'Mercado Delicatto', color: LOC_COLORS[1], isDefault: false },
    { id: 'loc-eventos',   name: 'Eventos',           color: LOC_COLORS[2], isDefault: false }
  ];
  // migrate old stock entries (sabor||tam) → new loc-casa||sabor||tam
  try{
    const oldStock = JSON.parse(localStorage.getItem("felito_stock_v_final_complete") || "{}");
    Object.keys(oldStock).forEach(k => {
      const parts = k.split('||');
      if(parts.length < 2) return;
      const [sabor, tam] = parts;
      const entry = oldStock[k];
      const newKey = `${casaId}||${sabor}||${tam}`;
      if(!stockV2[newKey]) stockV2[newKey] = { qty: Math.max(0, Number(entry.qty)||0), valueUnit: Number(entry.valueUnit)||defaultPriceFor(sabor,tam) };
    });
  }catch(e){ console.error('migrate old stock', e); }
  saveStockV2Local();
  writeStockV2ToCloud();
}

/* ---- StockV2 helpers ---- */
function sv2Key(locId, sabor, tam){ return `${locId}||${sabor}||${tam}`; }

function ensureSV2Entry(locId, sabor, tam){
  const k = sv2Key(locId, sabor, tam);
  if(!stockV2[k]) stockV2[k] = { qty: 0, valueUnit: defaultPriceFor(sabor, tam) };
  stockV2[k].qty = Math.max(0, Number(stockV2[k].qty) || 0);
  stockV2[k].valueUnit = Number(stockV2[k].valueUnit) || defaultPriceFor(sabor, tam);
  return stockV2[k];
}

function getTotalValueForLocation(locId){
  let total = 0;
  Object.keys(stockV2).forEach(k => {
    if(!k.startsWith(locId + '||')) return;
    const e = stockV2[k];
    total += (Number(e.qty)||0) * (Number(e.valueUnit)||0);
  });
  return total;
}

function getTotalQtyForLocation(locId){
  let total = 0;
  Object.keys(stockV2).forEach(k => {
    if(!k.startsWith(locId + '||')) return;
    total += Number(stockV2[k]?.qty) || 0;
  });
  return total;
}

function getFlavorDataForLocation(locId){
  const map = {};
  Object.keys(stockV2).forEach(k => {
    if(!k.startsWith(locId + '||')) return;
    const parts = k.split('||');
    if(parts.length < 3) return;
    const [, sabor, tam] = parts;
    if(!map[sabor]) map[sabor] = { qty: 0, value: 0, bySize: {} };
    const qty = Number(stockV2[k]?.qty) || 0;
    if(!qty) return; // skip zero-stock entries
    const val = qty * (Number(stockV2[k]?.valueUnit) || 0);
    map[sabor].qty += qty;
    map[sabor].value += val;
    if(!map[sabor].bySize[tam]) map[sabor].bySize[tam] = { qty: 0, value: 0 };
    map[sabor].bySize[tam].qty += qty;
    map[sabor].bySize[tam].value += val;
  });
  return map;
}

function getGlobalFlavorData(){
  const map = {};
  Object.keys(stockV2).forEach(k => {
    const parts = k.split('||');
    if(parts.length < 3) return;
    const [, sabor] = parts;
    const qty = Number(stockV2[k]?.qty) || 0;
    if(!qty) return; // skip zero-stock entries
    const val = qty * (Number(stockV2[k]?.valueUnit) || 0);
    if(!map[sabor]) map[sabor] = { qty: 0, value: 0 };
    map[sabor].qty += qty;
    map[sabor].value += val;
  });
  return map;
}

/* ---- Stock adjustments (V2 versions) ---- */
function adjustStockV2ForFinalize(item){
  if(!item) return;
  const locId = item.local || (getDefaultLocation()?.id);
  if(!locId) return;
  ensureSV2Entry(locId, item.sabor, item.tam);
  const k = sv2Key(locId, item.sabor, item.tam);
  stockV2[k].qty = Math.max(0, (stockV2[k].qty||0) - Number(item.qtd||0));
  transfers.push({
    id:     'mv-' + Date.now() + '-' + Math.floor(Math.random()*9999),
    date:   today(), seq: Date.now(),
    type:   'venda',
    fromId: locId, toId: null,
    sabor: item.sabor, tam: item.tam,
    qty:    Number(item.qtd||0),
    note:   'Venda Pedido ' + (item.pedido||''),
    userId: (window.auth?.currentUser?.uid) || null
  });
  saveStockV2Local();
  writeStockV2ToCloud();
}

function adjustStockV2OnEdit(oldItem, newItem){
  if(oldItem){
    const locId = oldItem.local || (getDefaultLocation()?.id);
    if(locId){
      ensureSV2Entry(locId, oldItem.sabor, oldItem.tam);
      stockV2[sv2Key(locId, oldItem.sabor, oldItem.tam)].qty += Number(oldItem.qtd||0);
    }
  }
  const newLocId = newItem.local || (getDefaultLocation()?.id);
  if(newLocId){
    ensureSV2Entry(newLocId, newItem.sabor, newItem.tam);
    const k = sv2Key(newLocId, newItem.sabor, newItem.tam);
    stockV2[k].qty = Math.max(0, (stockV2[k].qty||0) - Number(newItem.qtd||0));
  }
  saveStockV2Local(); writeStockV2ToCloud();
}

function adjustStockV2OnDelete(item){
  if(!item) return;
  const locId = item.local || (getDefaultLocation()?.id);
  if(!locId) return;
  ensureSV2Entry(locId, item.sabor, item.tam);
  stockV2[sv2Key(locId, item.sabor, item.tam)].qty += Number(item.qtd||0);
  saveStockV2Local(); writeStockV2ToCloud();
}

/* ---- Transfer between locations ---- */
function doTransfer(fromId, toId, sabor, tam, qty, note){
  qty = Number(qty);
  if(qty <= 0) return { ok: false, msg: 'Quantidade inválida' };
  if(fromId === toId) return { ok: false, msg: 'Origem e destino iguais' };
  ensureSV2Entry(fromId, sabor, tam);
  const fromQty = stockV2[sv2Key(fromId, sabor, tam)].qty;
  if(fromQty < qty) return { ok: false, msg: `Estoque insuficiente em "${findLocationById(fromId)?.name||fromId}". Disponível: ${fromQty}` };
  stockV2[sv2Key(fromId, sabor, tam)].qty -= qty;
  ensureSV2Entry(toId, sabor, tam);
  stockV2[sv2Key(toId, sabor, tam)].qty += qty;
  // copy unit value if destination is new
  if(!stockV2[sv2Key(toId, sabor, tam)].valueUnit)
    stockV2[sv2Key(toId, sabor, tam)].valueUnit = stockV2[sv2Key(fromId, sabor, tam)].valueUnit;
  transfers.push({
    id:     'tr-' + Date.now() + '-' + Math.floor(Math.random()*9999),
    date:   today(), seq: Date.now(),
    type:   'transfer',
    fromId, toId,
    sabor, tam, qty,
    note:   note || '',
    userId: (window.auth?.currentUser?.uid) || null
  });
  saveStockV2Local(); writeStockV2ToCloud();
  return { ok: true };
}

/* ---- Manual entry / adjustment ---- */
function doEntrada(locId, sabor, tam, qty, valueUnit, note){
  qty = Number(qty);
  if(qty <= 0) return { ok: false, msg: 'Quantidade inválida' };
  ensureSV2Entry(locId, sabor, tam);
  const k = sv2Key(locId, sabor, tam);
  stockV2[k].qty += qty;
  if(Number(valueUnit) > 0) stockV2[k].valueUnit = Number(valueUnit);
  transfers.push({
    id:     'en-' + Date.now() + '-' + Math.floor(Math.random()*9999),
    date:   today(), seq: Date.now(),
    type:   'entrada',
    fromId: null, toId: locId,
    sabor, tam, qty,
    note:   note || '',
    userId: (window.auth?.currentUser?.uid) || null
  });
  saveStockV2Local(); writeStockV2ToCloud();
  return { ok: true };
}

function doAjuste(locId, sabor, tam, newQty, valueUnit, note){
  newQty = Number(newQty); if(newQty < 0) return { ok: false, msg: 'Quantidade inválida' };
  ensureSV2Entry(locId, sabor, tam);
  const k = sv2Key(locId, sabor, tam);
  const old = stockV2[k].qty;
  stockV2[k].qty = newQty;
  if(Number(valueUnit) > 0) stockV2[k].valueUnit = Number(valueUnit);
  transfers.push({
    id:     'aj-' + Date.now() + '-' + Math.floor(Math.random()*9999),
    date:   today(), seq: Date.now(),
    type:   'ajuste',
    fromId: locId, toId: locId,
    sabor, tam, qty: newQty,
    note:   (note || 'Ajuste manual') + ` (era ${old})`,
    userId: (window.auth?.currentUser?.uid) || null
  });
  saveStockV2Local(); writeStockV2ToCloud();
  return { ok: true };
}

/* ---- Populate local select in main form ---- */
function populateLocalSelect(){
  const sel = document.getElementById('inputLocal');
  if(!sel) return;
  const prev = sel.value;
  sel.innerHTML = '';
  locations.forEach(l => {
    const o = document.createElement('option');
    o.value = l.id;
    o.textContent = l.name + (l.isDefault ? ' ★' : '');
    sel.appendChild(o);
  });
  if(prev && locations.find(l => l.id === prev)) sel.value = prev;
  else {
    const def = getDefaultLocation();
    if(def) sel.value = def.id;
  }
  updateLocalDot(sel);
}

function updateLocalDot(sel){
  const dot = document.getElementById('localDotPreview');
  if(!dot || !sel) return;
  const loc = findLocationById(sel.value);
  dot.style.background = loc ? loc.color : '#ccc';
}

/* ========== STOCK V2 MODAL UI ========== */

const stockV2Modal = document.getElementById('modalStockV2Back');
const stockV2Content = document.getElementById('sv2Content');
const stockV2CloseBtn = document.getElementById('stockV2Close');
let currentStockTab = 'dashboard';

if(stockV2CloseBtn) stockV2CloseBtn.addEventListener('click', ()=> hideModal(stockV2Modal));

// Tab delegation
const sv2Tabs = document.querySelector('.sv2-tabs');
if(sv2Tabs){
  sv2Tabs.addEventListener('click', ev => {
    const btn = ev.target.closest('.sv2-tab');
    if(!btn) return;
    document.querySelectorAll('.sv2-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentStockTab = btn.getAttribute('data-tab');
    renderStockV2Tab(currentStockTab);
  });
}

function openStockV2Modal(){
  ensureDefaultLocations();
  currentStockTab = 'dashboard';
  document.querySelectorAll('.sv2-tab').forEach(b => b.classList.toggle('active', b.getAttribute('data-tab') === 'dashboard'));
  renderStockV2Tab('dashboard');
  showModal(stockV2Modal);
}

function renderStockV2Tab(tab){
  if(!stockV2Content) return;
  switch(tab){
    case 'dashboard':     stockV2Content.innerHTML = renderDashboard(); break;
    case 'locais':        renderLocaisTab(); break;
    case 'estoque':       renderEstoqueTab(); break;
    case 'historico':     renderHistoricoTab(); break;
    case 'custos':        renderCustosTab(); break;
    default: stockV2Content.innerHTML = '';
  }
}

/* ---- DASHBOARD ---- */
function renderDashboard(){
  const totalValueAll = locations.reduce((s, l) => s + getTotalValueForLocation(l.id), 0);
  const totalQtyAll   = locations.reduce((s, l) => s + getTotalQtyForLocation(l.id), 0);
  const TAM_ORDER = ['240 mL', '480 mL', '1,5 L'];

  let html = `
  <div class="sv2-summary-bar">
    <div class="sv2-sum-card highlight">
      <span class="sv2-sum-label">💰 Valor Total em Estoque</span>
      <span class="sv2-sum-value">${formatBRL(totalValueAll)}</span>
    </div>
    <div class="sv2-sum-card">
      <span class="sv2-sum-label">📦 Unidades Totais</span>
      <span class="sv2-sum-value">${totalQtyAll}</span>
    </div>
    <div class="sv2-sum-card">
      <span class="sv2-sum-label">📍 Pontos de Venda</span>
      <span class="sv2-sum-value">${locations.length}</span>
    </div>
    <div class="sv2-sum-card">
      <span class="sv2-sum-label">🏭 Lotes Registrados</span>
      <span class="sv2-sum-value">${productionBatches.length}</span>
    </div>
    <div class="sv2-sum-card">
      <span class="sv2-sum-label">🔄 Movimentações</span>
      <span class="sv2-sum-value">${transfers.length}</span>
    </div>
  </div>`;

  // ---- Custo reference card from latest batch ----
  const batchesWithCostD = productionBatches.filter(b => b.totalCost > 0);
  const lastBatchD = batchesWithCostD.length ? batchesWithCostD[batchesWithCostD.length-1] : null;
  const lastCostsD = lastBatchD ? calcBatchCosts(lastBatchD.totalCost, lastBatchD.qtys) : null;
  if(lastCostsD){
    const tamanhos2 = ['240 mL','480 mL','1,5 L'];
    const priceStd2  = {'240 mL':17,'480 mL':30,'1,5 L':85};
    html += `<div style="margin-bottom:14px;padding:14px;background:#fff;border-radius:12px;border:1px solid #e0d9cf;display:flex;flex-wrap:wrap;gap:12px;align-items:center">
      <div style="font-weight:700;color:#012b29;white-space:nowrap">📊 Custo/Margem — Lote ${lastBatchD.loteNum||'?'}</div>
      ${tamanhos2.map(t => {
        const c = lastCostsD[t]; const p = priceStd2[t];
        const m = p > 0 ? ((p-c)/p*100).toFixed(1) : 0;
        const col = parseFloat(m)>=50?'#16a34a':parseFloat(m)>=30?'#ca8a04':'#dc2626';
        return `<div style="padding:8px 14px;background:#f8f5ef;border-radius:8px;text-align:center">
          <div style="font-size:0.78rem;color:#8a877c">${t}</div>
          <div style="font-weight:800;color:#012b29">${formatBRL(c)}</div>
          <div style="font-size:0.8rem;color:${col};font-weight:700">${m}% margem</div>
        </div>`;
      }).join('')}
    </div>`;
  }

  // ---- Per-location cards ----
  html += `<div class="sv2-loc-grid">`;
  locations.forEach(loc => {
    const locValue = getTotalValueForLocation(loc.id);
    const locQty   = getTotalQtyForLocation(loc.id);
    const pct      = totalValueAll > 0 ? (locValue / totalValueAll * 100).toFixed(1) : 0;
    const flData   = getFlavorDataForLocation(loc.id);
    const flavors  = Object.keys(flData).filter(s => flData[s].qty > 0).sort();

    html += `<div class="sv2-loc-card" style="border-top:5px solid ${loc.color}">
      <div class="sv2-loc-header">
        <span class="sv2-loc-dot" style="background:${loc.color}"></span>
        <span class="sv2-loc-name">${loc.name}</span>
        ${loc.isDefault ? '<span class="sv2-default-badge">padrão</span>' : ''}
      </div>
      <div class="sv2-loc-value">${formatBRL(locValue)}</div>
      <div class="sv2-loc-qty">${locQty} unidades &nbsp;·&nbsp; ${pct}% do total</div>`;

    if(flavors.length){
      html += `<div class="sv2-flavor-list">`;
      flavors.forEach(sabor => {
        const d = flData[sabor];
        // sort tamanhos by canonical order, skip qty=0
        const sizes = TAM_ORDER
          .filter(t => d.bySize[t] && d.bySize[t].qty > 0)
          .map(t => ({ tam: t, qty: d.bySize[t].qty }));
        // also include non-standard sizes
        Object.keys(d.bySize).forEach(t => {
          if(!TAM_ORDER.includes(t) && d.bySize[t].qty > 0) sizes.push({ tam: t, qty: d.bySize[t].qty });
        });
        if(!sizes.length) return;
        html += `<div class="sv2-flavor-block">
          <div class="sv2-flavor-name">
            <span>${sabor}</span>
            <span class="sv2-flavor-total">${d.qty} un</span>
          </div>`;
        sizes.forEach(sz => {
          html += `<div class="sv2-size-row">
            <span class="sv2-size-label">${sz.tam}</span>
            <span class="sv2-size-dots"></span>
            <span class="sv2-size-qty" style="color:${loc.color}">${sz.qty}</span>
          </div>`;
        });
        html += `</div>`;
      });
      html += `</div>`;
    } else {
      html += `<div class="sv2-empty-msg" style="margin-top:10px">Sem itens em estoque</div>`;
    }

    html += `</div>`;
  });
  html += `</div>`;

  // ---- Global flavor breakdown (sabor → tamanho) ----
  // Build global map with bySize using all locations
  const globalMap = {};
  locations.forEach(loc => {
    const fd = getFlavorDataForLocation(loc.id);
    Object.keys(fd).forEach(sabor => {
      if(!globalMap[sabor]) globalMap[sabor] = { qty: 0, value: 0, bySize: {} };
      globalMap[sabor].qty += fd[sabor].qty;
      globalMap[sabor].value += fd[sabor].value;
      Object.keys(fd[sabor].bySize).forEach(tam => {
        if(!globalMap[sabor].bySize[tam]) globalMap[sabor].bySize[tam] = { qty: 0, value: 0 };
        globalMap[sabor].bySize[tam].qty   += fd[sabor].bySize[tam].qty;
        globalMap[sabor].bySize[tam].value += fd[sabor].bySize[tam].value;
      });
    });
  });

  const globalFlavors = Object.keys(globalMap).filter(s => globalMap[s].qty > 0).sort();

  html += `<div class="sv2-global-chart">
    <h4>📊 Estoque Global por Sabor</h4>`;

  if(globalFlavors.length){
    html += `<div class="sv2-flavor-grid">`;
    globalFlavors.forEach(sabor => {
      const d = globalMap[sabor];
      const sizes = TAM_ORDER
        .filter(t => d.bySize[t] && d.bySize[t].qty > 0)
        .map(t => ({ tam: t, qty: d.bySize[t].qty, val: d.bySize[t].value }));
      Object.keys(d.bySize).forEach(t => {
        if(!TAM_ORDER.includes(t) && d.bySize[t].qty > 0)
          sizes.push({ tam: t, qty: d.bySize[t].qty, val: d.bySize[t].value });
      });
      if(!sizes.length) return;

      html += `<div class="sv2-flavor-card">
        <div class="sv2-flavor-card-header">
          <span class="sv2-flavor-card-name">${sabor}</span>
          <span class="sv2-flavor-card-total">${d.qty} un &middot; ${formatBRL(d.value)}</span>
        </div>`;
      sizes.forEach(sz => {
        html += `<div class="sv2-flavor-card-row">
          <span class="sv2-flavor-card-size">${sz.tam}</span>
          <span class="sv2-flavor-card-dots"></span>
          <span class="sv2-flavor-card-qty">${sz.qty}</span>
        </div>`;
      });
      html += `</div>`;
    });
    html += `</div>`;
  } else {
    html += `<div class="sv2-empty-msg">Nenhum item em estoque ainda.</div>`;
  }
  html += `</div>`;

  // ---- Per-location summary table (multi-local only) ----
  if(locations.length > 1){
    html += `<div class="sv2-global-chart" style="margin-top:14px">
      <h4>💼 Relatório por Ponto de Venda</h4>
      <div style="overflow:auto">
      <table style="width:100%;border-collapse:collapse;min-width:400px">
        <thead><tr>
          <th style="text-align:left;padding:8px;background:#efe9de">Local</th>
          <th style="text-align:right;padding:8px;background:#efe9de">Unidades</th>
          <th style="text-align:right;padding:8px;background:#efe9de">Valor em Estoque</th>
          <th style="text-align:right;padding:8px;background:#efe9de">% do Total</th>
        </tr></thead><tbody>`;
    locations.forEach(loc => {
      const v = getTotalValueForLocation(loc.id);
      const q = getTotalQtyForLocation(loc.id);
      const p = totalValueAll > 0 ? (v / totalValueAll * 100).toFixed(1) : '0.0';
      html += `<tr>
        <td style="padding:8px;border-bottom:1px solid #eee">
          <span class="sv2-loc-dot" style="background:${loc.color};display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:6px"></span>
          <strong>${loc.name}</strong>${loc.isDefault ? ' <span class="sv2-default-badge">padrão</span>':''}
        </td>
        <td style="padding:8px;text-align:right;border-bottom:1px solid #eee">${q}</td>
        <td style="padding:8px;text-align:right;border-bottom:1px solid #eee;font-weight:700">${formatBRL(v)}</td>
        <td style="padding:8px;text-align:right;border-bottom:1px solid #eee">
          <div style="display:flex;align-items:center;justify-content:flex-end;gap:8px">
            <div style="width:60px;height:8px;background:#efe9de;border-radius:4px;overflow:hidden">
              <div style="width:${p}%;height:100%;background:${loc.color};border-radius:4px"></div>
            </div>
            ${p}%
          </div>
        </td>
      </tr>`;
    });
    html += `<tr style="font-weight:800">
        <td style="padding:8px">Total</td>
        <td style="padding:8px;text-align:right">${totalQtyAll}</td>
        <td style="padding:8px;text-align:right">${formatBRL(totalValueAll)}</td>
        <td style="padding:8px;text-align:right">100%</td>
      </tr>
      </tbody></table></div></div>`;
  }

  return html;
}

/* ---- LOCAIS TAB ---- */
function renderLocaisTab(){
  let html = `<div class="sv2-section-title">Pontos de Venda</div>
  <div class="sv2-locations-list" id="sv2LocList">`;

  locations.forEach(loc => {
    html += `<div class="sv2-loc-row" style="border-left-color:${loc.color}" data-locid="${loc.id}">
      <span class="sv2-loc-dot" style="background:${loc.color}"></span>
      <span class="sv2-loc-row-name">${loc.name}${loc.isDefault ? ' <span class="sv2-default-badge">padrão</span>':''}</span>
      <span class="small muted">${getTotalQtyForLocation(loc.id)} un · ${formatBRL(getTotalValueForLocation(loc.id))}</span>
      <div class="sv2-loc-row-actions">
        ${!loc.isDefault ? `<button type="button" class="small-btn btn-gray" data-act="set-default" data-id="${loc.id}">Def.</button>` : ''}
        <button type="button" class="small-btn btn-yellow" data-act="edit-loc" data-id="${loc.id}">Editar</button>
        <button type="button" class="small-btn btn-red" data-act="del-loc" data-id="${loc.id}">Apagar</button>
      </div>
    </div>`;
  });

  html += `</div>
  <div class="sv2-section-title" style="margin-top:20px">Adicionar Local</div>
  <div class="sv2-add-form" id="sv2AddLocForm">
    <div>
      <label>Nome</label>
      <input id="sv2NewLocName" placeholder="Ex: Mercado Centro" style="min-width:180px" />
    </div>
    <div>
      <label>Cor</label>
      <div class="sv2-color-grid" id="sv2ColorGrid">
        ${LOC_COLORS.map((c,i) => `<div class="sv2-color-swatch${i===0?' selected':''}" style="background:${c}" data-color="${c}" title="${c}"></div>`).join('')}
      </div>
      <input type="hidden" id="sv2NewLocColor" value="${LOC_COLORS[0]}" />
    </div>
    <div style="display:flex;gap:8px;align-items:flex-end">
      <button type="button" class="btn-yellow" id="sv2BtnAddLoc">Adicionar Local</button>
    </div>
  </div>`;

  stockV2Content.innerHTML = html;

  // Color swatches
  document.querySelectorAll('.sv2-color-swatch').forEach(sw => {
    sw.addEventListener('click', ()=>{
      document.querySelectorAll('.sv2-color-swatch').forEach(s => s.classList.remove('selected'));
      sw.classList.add('selected');
      const ci = document.getElementById('sv2NewLocColor');
      if(ci) ci.value = sw.getAttribute('data-color');
    });
  });

  // Add location
  const btnAddLoc = document.getElementById('sv2BtnAddLoc');
  if(btnAddLoc) btnAddLoc.addEventListener('click', ()=>{
    const nameEl = document.getElementById('sv2NewLocName');
    const colorEl = document.getElementById('sv2NewLocColor');
    const name = (nameEl?.value||'').trim();
    if(!name) return alert('Digite o nome do local');
    if(locations.find(l => l.name.toLowerCase() === name.toLowerCase())) return alert('Local já existe');
    const color = colorEl?.value || LOC_COLORS[0];
    locations.push({ id: newLocId(name), name, color, isDefault: false });
    saveStockV2Local(); writeStockV2ToCloud(); populateLocalSelect();
    renderLocaisTab();
  });

  // Action delegation
  const listEl = document.getElementById('sv2LocList');
  if(listEl) listEl.addEventListener('click', ev => {
    const btn = ev.target.closest('button[data-act]');
    if(!btn) return;
    const act = btn.getAttribute('data-act');
    const id  = btn.getAttribute('data-id');
    if(act === 'set-default'){
      locations.forEach(l => l.isDefault = (l.id === id));
      saveStockV2Local(); writeStockV2ToCloud(); populateLocalSelect(); renderLocaisTab();
    } else if(act === 'edit-loc'){
      const loc = findLocationById(id);
      if(!loc) return;
      const newName = prompt('Nome do local:', loc.name);
      if(!newName || !newName.trim()) return;
      loc.name = newName.trim();
      saveStockV2Local(); writeStockV2ToCloud(); populateLocalSelect(); renderLocaisTab();
    } else if(act === 'del-loc'){
      if(locations.length <= 1) return alert('Você precisa ter pelo menos 1 local.');
      const loc = findLocationById(id);
      const qty = getTotalQtyForLocation(id);
      if(qty > 0 && !confirm(`Local "${loc?.name}" tem ${qty} unidades em estoque. Apagar mesmo assim? O estoque será perdido.`)) return;
      if(!confirm(`Apagar local "${loc?.name}"?`)) return;
      // remove stock entries for this location
      Object.keys(stockV2).forEach(k => { if(k.startsWith(id + '||')) delete stockV2[k]; });
      locations = locations.filter(l => l.id !== id);
      if(!locations.find(l => l.isDefault) && locations.length) locations[0].isDefault = true;
      saveStockV2Local(); writeStockV2ToCloud(); populateLocalSelect(); renderLocaisTab();
    }
  });
}

/* ---- ESTOQUES TAB ---- */
function renderEstoqueTab(filterLoc){
  const sabores = getActiveSabores().map(s=>s.name); if(!sabores.length) sabores.push(...['Abacate','Baunilha','Doce de Leite','Doce de Leite com Coco','Limão com Manjericão','Limão Siciliano','Maracujá','Morango','Romeu & Julieta','Strogonoff de Nozes']);
  const tamanhos = getActiveTamanhos().map(t=>t.name); if(!tamanhos.length) tamanhos.push('240 mL','480 mL','1,5 L');
  const selLocId = filterLoc || sv2LastEstoqueLoc || (getDefaultLocation()?.id);
  sv2LastEstoqueLoc = selLocId;

  /* ---- build stock rows (non-zero only) ---- */
  function buildStockRows(locId){
    let rows = [];
    sabores.forEach(sabor => {
      tamanhos.forEach(tam => {
        const k = sv2Key(locId, sabor, tam);
        const e = stockV2[k];
        if(e && Number(e.qty) > 0) rows.push({ sabor, tam, qty: e.qty, valueUnit: e.valueUnit||0 });
      });
    });
    // non-standard combinations
    Object.keys(stockV2).forEach(k => {
      if(!k.startsWith(locId + '||')) return;
      const parts = k.split('||');
      if(parts.length < 3) return;
      const [,s,t] = parts;
      if(sabores.includes(s) && tamanhos.includes(t)) return;
      const e = stockV2[k];
      if(e && Number(e.qty) > 0) rows.push({ sabor: s, tam: t, qty: e.qty, valueUnit: e.valueUnit||0 });
    });
    return rows;
  }

  const stockRows = buildStockRows(selLocId);
  const locValue  = getTotalValueForLocation(selLocId);

  function buildCartHTML(){
    if(!sv2EntranceCart.length) return `<div class="sv2-empty-msg" style="padding:8px 0">Nenhum produto adicionado ao lote ainda. Use o formulário acima.</div>`;
    const TAM_VOL2 = {'240 mL':240,'480 mL':480,'1,5 L':1500};
    const totalCostPreview = parseFloat(document.getElementById('sv2LoteCustoTotal')?.value) || 0;
    const qtysMap = {};
    sv2EntranceCart.forEach(it => { qtysMap[it.tam] = (qtysMap[it.tam]||0) + it.qty; });
    const costsPreview = totalCostPreview > 0 ? calcBatchCosts(totalCostPreview, qtysMap) : null;
    let totalValor = 0;
    sv2EntranceCart.forEach(it => { totalValor += it.qty * (it.precoUnit||0); });
    let h = `<table style="width:100%;border-collapse:collapse;font-size:0.88rem">
      <thead><tr>
        <th style="padding:6px;background:#efe9de;text-align:left">Sabor</th>
        <th style="padding:6px;background:#efe9de">Tam.</th>
        <th style="padding:6px;background:#efe9de;text-align:right">Qtd</th>
        <th style="padding:6px;background:#efe9de;text-align:right">Preço Unit.</th>
        <th style="padding:6px;background:#efe9de;text-align:right">Valor Total</th>
        <th style="padding:6px;background:#efe9de;text-align:right">Custo Unit.</th>
        <th style="padding:6px;background:#efe9de"></th>
      </tr></thead><tbody>`;
    sv2EntranceCart.forEach((item, idx) => {
      const custoUnit = costsPreview ? costsPreview[item.tam] : null;
      const valorItem = item.qty * (item.precoUnit||0);
      h += `<tr>
        <td style="padding:6px;border-bottom:1px solid #eee">${item.sabor}</td>
        <td style="padding:6px;border-bottom:1px solid #eee;text-align:center">${item.tam}</td>
        <td style="padding:6px;border-bottom:1px solid #eee;text-align:right;font-weight:700">${item.qty}</td>
        <td style="padding:6px;border-bottom:1px solid #eee;text-align:right">
          <input type="number" step="0.01" value="${(item.precoUnit||0).toFixed(2)}"
            data-idx="${idx}" data-field="precoUnit"
            style="width:72px;padding:3px 5px;border-radius:5px;border:1px solid #ccc;text-align:right;font-size:0.85rem" />
        </td>
        <td style="padding:6px;border-bottom:1px solid #eee;text-align:right;font-weight:700">${formatBRL(valorItem)}</td>
        <td style="padding:6px;border-bottom:1px solid #eee;text-align:right;color:${custoUnit?'#166534':'#8a877c'};font-weight:700">
          ${custoUnit ? formatBRL(custoUnit) : '<em style="font-weight:400;font-size:0.8rem">—</em>'}
        </td>
        <td style="padding:6px;border-bottom:1px solid #eee;text-align:center">
          <button type="button" class="small-btn btn-red" data-act="rem-cart" data-idx="${idx}" style="padding:3px 7px">✕</button>
        </td>
      </tr>`;
    });
    h += `<tr style="font-weight:800;background:#f8f5ef">
      <td colspan="4" style="padding:6px">Total do lote</td>
      <td style="padding:6px;text-align:right">${formatBRL(totalValor)}</td>
      <td colspan="2"></td>
    </tr>`;
    h += `</tbody></table>`;
    return h;
  }

  let html = `
  <!-- Location selector bar -->
  <div class="sv2-stock-controls">
    <label class="small" style="font-weight:700">Local de Destino:</label>
    <select id="sv2StockLocFilter" style="padding:6px 10px;border-radius:8px;border:1px solid #ccc;font-weight:700">
      ${locations.map(l => `<option value="${l.id}"${l.id===selLocId?' selected':''}><span>${l.name}</span></option>`).join('')}
    </select>
    <div style="margin-left:auto;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <span class="small">Valor em estoque:</span>
      <span style="font-weight:800;font-size:1.1rem;color:var(--green)">${formatBRL(locValue)}</span>
    </div>
  </div>

  <!-- LANÇAMENTO DE PRODUÇÃO UNIFICADO -->
  <div class="sv2-entrada-form" style="margin-bottom:14px;border:2px solid var(--yellow);border-radius:12px;padding:16px;background:#fffdf7">
    <h4 style="margin:0 0 12px 0;display:flex;align-items:center;gap:8px;color:#012b29">
      🏭 Lançamento de Produção
      <span class="small muted" style="font-weight:400">— registre o lote, quantidades e custo de uma só vez</span>
    </h4>

    <!-- Lote + Data + Custo (cabeçalho do lote) -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid #e0d9cf">
      <div>
        <label class="small" style="font-weight:700">Nº do Lote</label>
        <input id="sv2LoteNum" type="number" min="1" value="${nextBatchNum}"
          style="width:100%;padding:7px;border-radius:8px;border:1.5px solid var(--yellow);font-weight:800;font-size:1.1rem;color:#012b29" />
      </div>
      <div>
        <label class="small" style="font-weight:700">Data da Produção</label>
        <input id="sv2LoteData" type="date" value="${today()}"
          style="width:100%;padding:7px;border-radius:8px;border:1px solid #ccc" />
      </div>
      <div>
        <label class="small" style="font-weight:700">💰 Custo Total da Produção (R$)</label>
        <input id="sv2LoteCustoTotal" type="number" step="0.01" min="0" placeholder="Ex: 180.00"
          style="width:100%;padding:7px;border-radius:8px;border:1.5px solid #86efac;font-weight:700;font-size:1rem;background:#f0fff4" />
      </div>
      <div>
        <label class="small" style="font-weight:700">Observação (opcional)</label>
        <input id="sv2LoteNota" type="text" placeholder="Ex: Lote morango + baunilha"
          style="width:100%;padding:7px;border-radius:8px;border:1px solid #ccc" />
      </div>
    </div>

    <!-- Adicionar produtos ao lote -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;align-items:end">
      <div>
        <label class="small">Sabor</label>
        <select id="sv2EntradaSabor" style="width:100%;padding:7px;border-radius:8px;border:1px solid #ccc">
          ${sabores.map(s => `<option>${s}</option>`).join('')}
        </select>
      </div>
      <div>
        <label class="small">Tamanho</label>
        <select id="sv2EntradaTam" style="width:100%;padding:7px;border-radius:8px;border:1px solid #ccc">
          ${tamanhos.map(t => `<option>${t}</option>`).join('')}
        </select>
      </div>
      <div>
        <label class="small">Quantidade Produzida</label>
        <input id="sv2EntradaQty" type="number" min="1" value="1" style="width:100%;padding:7px;border-radius:8px;border:1px solid #ccc" />
      </div>
      <div>
        <label class="small">Preço Unit. Venda (R$)</label>
        <input id="sv2EntradaPreco" type="number" step="0.01" min="0" placeholder="Auto" style="width:100%;padding:7px;border-radius:8px;border:1px solid #ccc" />
      </div>
      <div style="display:flex;align-items:flex-end">
        <button type="button" id="sv2BtnAddToCart" class="btn-yellow" style="width:100%;padding:8px;white-space:nowrap">+ Adicionar ao lote</button>
      </div>
    </div>

    <!-- Pending cart -->
    <div id="sv2CartSection" style="margin-top:12px;border-top:1px solid #e0d9cf;padding-top:10px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
        <strong style="font-size:0.9rem">Produtos do lote (${sv2EntranceCart.length} item${sv2EntranceCart.length !== 1?'s':''})</strong>
        ${sv2EntranceCart.length ? `<div style="display:flex;gap:6px">
          <button type="button" id="sv2BtnConfirmCart" class="btn-green" style="white-space:nowrap">✓ Confirmar lançamento</button>
          <button type="button" id="sv2BtnClearCart" class="btn-gray" style="padding:5px 8px;font-size:0.82rem">Limpar</button>
        </div>` : ''}
      </div>
      <div id="sv2CartList">${buildCartHTML()}</div>
      ${sv2EntranceCart.length ? `<div id="sv2CustoPreview" style="margin-top:10px;padding:10px;background:#f0fff4;border-radius:8px;border:1px solid #86efac;font-size:0.85rem;color:#166534"></div>` : ''}
    </div>
  </div>

  <!-- ESTOQUE ATUAL -->
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
    <div class="sv2-section-title" style="margin:0;border:none;padding:0">Estoque atual — ${findLocationById(selLocId)?.name || selLocId}</div>
    <button type="button" id="sv2BtnZerarTudo" class="btn-red" style="font-size:0.78rem;padding:5px 10px;opacity:0.7">Zerar tudo</button>
  </div>
  <div class="sv2-stock-table"><div style="overflow:auto">
  <table style="width:100%;border-collapse:collapse">
    <thead><tr>
      <th style="padding:8px 10px;text-align:left">Sabor</th>
      <th style="padding:8px 10px;text-align:left">Tamanho</th>
      <th style="padding:8px 10px;text-align:right">Qtd</th>
      <th style="padding:8px 10px;text-align:right">Preço Unit.</th>
      <th style="padding:8px 10px;text-align:right">Valor Total</th>
      <th style="padding:8px 10px;text-align:center">Ações</th>
    </tr></thead>
    <tbody id="sv2StockTbody">`;

  if(stockRows.length){
    stockRows.forEach(r => {
      const val = r.qty * r.valueUnit;
      html += `<tr data-sabor="${r.sabor}" data-tam="${r.tam}">
        <td style="padding:8px 10px">${r.sabor}</td>
        <td style="padding:8px 10px">${r.tam}</td>
        <td style="padding:8px 10px;text-align:right;font-weight:700" id="td-qty-${btoa(selLocId+'||'+r.sabor+'||'+r.tam).replace(/[^a-zA-Z0-9]/g,'')}">${r.qty}</td>
        <td style="padding:8px 10px;text-align:right">${formatBRL(r.valueUnit)}</td>
        <td style="padding:8px 10px;text-align:right"><span class="sv2-val-pill">${formatBRL(val)}</span></td>
        <td style="padding:8px 10px;text-align:center">
          <button type="button" class="small-btn btn-gray" data-act="ajuste-inline"
            data-loc="${selLocId}" data-sabor="${r.sabor}" data-tam="${r.tam}"
            data-qty="${r.qty}" data-vu="${r.valueUnit}">✏️ Editar</button>
        </td>
      </tr>`;
    });
  } else {
    html += `<tr><td colspan="6" style="padding:18px;text-align:center;color:#8a877c;font-style:italic">
      Nenhum item com estoque neste local. Use o formulário acima para adicionar.
    </td></tr>`;
  }

  html += `</tbody></table></div></div>`;

  stockV2Content.innerHTML = html;

  /* ---- Location filter ---- */
  document.getElementById('sv2StockLocFilter')?.addEventListener('change', e => {
    sv2EntranceCart = [];
    renderEstoqueTab(e.target.value);
  });

  /* ---- Add to entrance cart ---- */
  document.getElementById('sv2BtnAddToCart')?.addEventListener('click', () => {
    const sabor = document.getElementById('sv2EntradaSabor')?.value;
    const tam   = document.getElementById('sv2EntradaTam')?.value;
    const qty   = Number(document.getElementById('sv2EntradaQty')?.value) || 0;
    if(!sabor || !tam || qty <= 0){ alert('Quantidade inválida'); return; }
    // use typed price or fall back to default
    const precoInputVal = parseFloat(document.getElementById('sv2EntradaPreco')?.value);
    const precoUnit = (!isNaN(precoInputVal) && precoInputVal > 0) ? precoInputVal : defaultPriceFor(sabor, tam);
    // merge if same sabor+tam already in cart
    const existing = sv2EntranceCart.find(c => c.sabor === sabor && c.tam === tam);
    if(existing){ existing.qty += qty; }
    else { sv2EntranceCart.push({ sabor, tam, qty, precoUnit }); }
    document.getElementById('sv2EntradaQty').value = 1;
    const precoEl = document.getElementById('sv2EntradaPreco');
    if(precoEl) precoEl.value = '';
    renderEstoqueTab(selLocId);
  });

  /* ---- Auto-fill selling price when sabor/tam changes ---- */
  function autoFillPreco(){
    const sabor = document.getElementById('sv2EntradaSabor')?.value;
    const tam   = document.getElementById('sv2EntradaTam')?.value;
    const precoEl = document.getElementById('sv2EntradaPreco');
    if(precoEl && !precoEl.value && sabor && tam){
      precoEl.placeholder = formatBRL(defaultPriceFor(sabor, tam)).replace('R$ ','');
    }
  }
  document.getElementById('sv2EntradaSabor')?.addEventListener('change', autoFillPreco);
  document.getElementById('sv2EntradaTam')?.addEventListener('change', autoFillPreco);
  autoFillPreco();

  /* ---- Cost preview update ---- */
  function updateCustoPreview(){
    const totalCost = parseFloat(document.getElementById('sv2LoteCustoTotal')?.value) || 0;
    const previewEl = document.getElementById('sv2CustoPreview');
    // Also refresh cart HTML so custoUnit column updates live
    const cartListEl = document.getElementById('sv2CartList');
    if(cartListEl && sv2EntranceCart.length) cartListEl.innerHTML = buildCartHTML();
    if(!previewEl || !sv2EntranceCart.length) return;
    if(!totalCost){ previewEl.innerHTML = `<em>Informe o custo total para ver o custo por unidade calculado automaticamente.</em>`; return; }
    const qtys = {};
    sv2EntranceCart.forEach(it => { qtys[it.tam] = (qtys[it.tam]||0) + it.qty; });
    const costs = calcBatchCosts(totalCost, qtys);
    if(!costs){ previewEl.innerHTML = ''; return; }
    const tamanhos2 = ['240 mL','480 mL','1,5 L'];
    let preview = `<strong>⚡ Custo por unidade calculado:</strong> `;
    preview += tamanhos2.filter(t => qtys[t] > 0).map(t =>
      `<strong>${t}</strong>: ${formatBRL(costs[t])}`
    ).join(' &nbsp;·&nbsp; ');
    previewEl.innerHTML = preview;
  }
  document.getElementById('sv2LoteCustoTotal')?.addEventListener('input', updateCustoPreview);
  updateCustoPreview();

  /* ---- Cart: inline edit precoUnit ---- */
  document.getElementById('sv2CartList')?.addEventListener('input', ev => {
    const inp = ev.target.closest('input[data-field="precoUnit"]');
    if(!inp) return;
    const idx = Number(inp.getAttribute('data-idx'));
    if(sv2EntranceCart[idx]) {
      sv2EntranceCart[idx].precoUnit = parseFloat(inp.value) || 0;
      // Update displayed total without full re-render (just re-render cart HTML)
      const cl = document.getElementById('sv2CartList');
      if(cl) cl.innerHTML = buildCartHTML();
      attachCartListeners();
    }
  });

  function attachCartListeners(){
    /* ---- Cart remove item ---- */
    document.getElementById('sv2CartList')?.addEventListener('click', ev => {
      const btn = ev.target.closest('button[data-act="rem-cart"]');
      if(!btn) return;
      const idx = Number(btn.getAttribute('data-idx'));
      sv2EntranceCart.splice(idx, 1);
      renderEstoqueTab(selLocId);
    });
  }

  /* ---- Cart remove item ---- */
  document.getElementById('sv2CartList')?.addEventListener('click', ev => {
    const btn = ev.target.closest('button[data-act="rem-cart"]');
    if(!btn) return;
    const idx = Number(btn.getAttribute('data-idx'));
    sv2EntranceCart.splice(idx, 1);
    renderEstoqueTab(selLocId);
  });

  /* ---- Clear cart ---- */
  document.getElementById('sv2BtnClearCart')?.addEventListener('click', () => {
    sv2EntranceCart = [];
    renderEstoqueTab(selLocId);
  });

  /* ---- Confirm production batch ---- */
  document.getElementById('sv2BtnConfirmCart')?.addEventListener('click', async () => {
    if(!sv2EntranceCart.length) return;
    const loteNum   = Number(document.getElementById('sv2LoteNum')?.value) || nextBatchNum;
    const loteData  = document.getElementById('sv2LoteData')?.value || today();
    const custTotal = parseFloat(document.getElementById('sv2LoteCustoTotal')?.value) || 0;
    const nota      = document.getElementById('sv2LoteNota')?.value || '';
    const locId     = selLocId;

    if(custTotal <= 0 && !confirm('Você não informou o custo de produção. Deseja registrar o lote sem custo? (poderá editar depois na aba 💰 Custos)')) return;

    // Build qtys map for cost calculation
    const qtys = {};
    sv2EntranceCart.forEach(it => { qtys[it.tam] = (qtys[it.tam]||0) + it.qty; });
    const costs = custTotal > 0 ? calcBatchCosts(custTotal, qtys) : null;

    // 1. Add to stock (doEntrada for each item, using computed cost per unit as valueUnit)
    let errMsg = null;
    sv2EntranceCart.forEach(item => {
      const vu = costs ? costs[item.tam] : defaultPriceFor(item.sabor, item.tam);
      const res = doEntrada(locId, item.sabor, item.tam, item.qty, vu, `Lote ${loteNum}`);
      if(!res.ok) errMsg = res.msg;
    });
    if(errMsg){ alert('Erro ao registrar entradas: ' + errMsg); return; }

    // 2. Create production batch record
    const batch = {
      id: 'lote-' + Date.now(),
      loteNum,
      date: loteData,
      totalCost: custTotal,
      qtys,
      items: sv2EntranceCart.map(it => ({
        sabor: it.sabor,
        tam: it.tam,
        qty: it.qty,
        precoUnit: it.precoUnit || defaultPriceFor(it.sabor, it.tam),
        valorTotal: it.qty * (it.precoUnit || defaultPriceFor(it.sabor, it.tam)),
        custoUnit: costs ? (costs[it.tam] || 0) : null
      })),
      note: nota,
      locId,
      costs: costs || null,
      packagingSnapshot: {...packagingCosts},
      _createdAt: new Date().toISOString()
    };
    productionBatches.push(batch);
    if(loteNum >= nextBatchNum) nextBatchNum = loteNum + 1;

    // 3. Save to Firestore
    await writeProductionBatchToCloud(batch);
    // Also save nextBatchNum
    if(window.db && window.auth?.currentUser){
      db.collection('meta').doc('producao_meta').set({ nextBatchNum }, { merge: true })
        .catch(e => console.error('save nextBatchNum', e));
    }

    const count = sv2EntranceCart.length;
    const totalQty = sv2EntranceCart.reduce((s,c) => s + c.qty, 0);
    sv2EntranceCart = [];
    renderEstoqueTab(locId);
    const notice = document.createElement('div');
    notice.innerHTML = `✅ Lote ${loteNum} registrado! ${totalQty} unidades → estoque "${findLocationById(locId)?.name}"${custTotal > 0 ? ` · Custo total: ${formatBRL(custTotal)}` : ''}`;
    notice.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#012b29;color:#f2efeb;padding:12px 24px;border-radius:10px;font-weight:700;z-index:99999;box-shadow:0 4px 16px rgba(0,0,0,0.3);max-width:90vw;text-align:center';
    document.body.appendChild(notice);
    setTimeout(() => notice.remove(), 4000);
  });

  /* ---- Zerar tudo ---- */
  document.getElementById('sv2BtnZerarTudo')?.addEventListener('click', () => {
    const locName = findLocationById(selLocId)?.name || selLocId;
    if(!confirm(`Zerar TODO o estoque em "${locName}"? Esta ação não pode ser desfeita.`)) return;
    Object.keys(stockV2).forEach(k => { if(k.startsWith(selLocId + '||')) stockV2[k].qty = 0; });
    saveStockV2Local(); writeStockV2ToCloud();
    renderEstoqueTab(selLocId);
  });

  /* ---- Inline ajuste (no prompt) ---- */
  document.getElementById('sv2StockTbody')?.addEventListener('click', ev => {
    const btn = ev.target.closest('button[data-act="ajuste-inline"]');
    if(!btn) return;
    const locId  = btn.getAttribute('data-loc');
    const sabor  = btn.getAttribute('data-sabor');
    const tam    = btn.getAttribute('data-tam');
    const curQty = btn.getAttribute('data-qty');
    const curVu  = btn.getAttribute('data-vu');

    // Remove any existing inline editor
    document.getElementById('sv2InlineEditor')?.remove();

    const tr = btn.closest('tr');
    if(!tr) return;
    const editorRow = document.createElement('tr');
    editorRow.id = 'sv2InlineEditor';
    editorRow.style.background = '#fffaf0';
    editorRow.innerHTML = `
      <td colspan="6" style="padding:12px 10px">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <strong style="font-size:0.9rem;color:var(--green)">${sabor} · ${tam}</strong>
          <div style="display:flex;align-items:center;gap:6px">
            <label class="small" style="margin:0">Nova qtd:</label>
            <input id="sv2InlineQty" type="number" min="0" value="${curQty}" style="width:70px;padding:5px 8px;border-radius:6px;border:2px solid var(--yellow);font-weight:700;text-align:center" />
          </div>
          <div style="display:flex;align-items:center;gap:6px">
            <label class="small" style="margin:0">Preço unit. (R$):</label>
            <input id="sv2InlineVu" type="number" step="0.01" value="${Number(curVu).toFixed(2)}" style="width:90px;padding:5px 8px;border-radius:6px;border:1px solid #ccc" />
          </div>
          <button type="button" id="sv2InlineSave" class="btn-yellow" style="padding:6px 14px">Salvar</button>
          <button type="button" id="sv2InlineCancel" class="btn-gray" style="padding:6px 12px">Cancelar</button>
        </div>
      </td>`;
    tr.insertAdjacentElement('afterend', editorRow);

    document.getElementById('sv2InlineQty')?.focus();
    document.getElementById('sv2InlineQty')?.select();

    document.getElementById('sv2InlineSave')?.addEventListener('click', () => {
      const newQty = Number(document.getElementById('sv2InlineQty')?.value);
      const newVu  = Number(document.getElementById('sv2InlineVu')?.value) || Number(curVu);
      if(isNaN(newQty) || newQty < 0){ alert('Quantidade inválida'); return; }
      const res = doAjuste(locId, sabor, tam, newQty, newVu, '');
      if(!res.ok){ alert(res.msg); return; }
      editorRow.remove();
      // Update table cells without full re-render for speed
      renderEstoqueTab(locId);
    });

    document.getElementById('sv2InlineCancel')?.addEventListener('click', () => editorRow.remove());
  });
}

/* ---- TRANSFERÊNCIAS TAB ---- */
function renderTransferenciasTab(){
  const sabores = getActiveSabores().map(s=>s.name); if(!sabores.length) sabores.push(...['Abacate','Baunilha','Doce de Leite','Doce de Leite com Coco','Limão com Manjericão','Limão Siciliano','Maracujá','Morango','Romeu & Julieta','Strogonoff de Nozes']);
  const tamanhos = getActiveTamanhos().map(t=>t.name); if(!tamanhos.length) tamanhos.push('240 mL','480 mL','1,5 L');

  const fromDef = getDefaultLocation();
  const toDef   = locations.find(l => !l.isDefault) || locations[1] || fromDef;

  let html = `
  <div class="sv2-transfer-form">
    <h4>↔️ Transferir Estoque entre Locais</h4>
    <div class="sv2-transfer-grid">
      <div>
        <label class="small">De (origem)</label>
        <select id="sv2TrFrom" style="width:100%;padding:8px;border-radius:8px;border:1px solid #ddd">
          ${locations.map(l => `<option value="${l.id}"${l.id===fromDef?.id?' selected':''}>${l.name}</option>`).join('')}
        </select>
      </div>
      <div class="sv2-arrow">→</div>
      <div>
        <label class="small">Para (destino)</label>
        <select id="sv2TrTo" style="width:100%;padding:8px;border-radius:8px;border:1px solid #ddd">
          ${locations.map(l => `<option value="${l.id}"${l.id===toDef?.id?' selected':''}>${l.name}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="sv2-transfer-grid" style="margin-top:10px">
      <div>
        <label class="small">Sabor</label>
        <select id="sv2TrSabor" style="width:100%;padding:8px;border-radius:8px;border:1px solid #ddd">
          ${sabores.map(s => `<option>${s}</option>`).join('')}
        </select>
      </div>
      <div>
        <label class="small">Tamanho</label>
        <select id="sv2TrTam" style="width:100%;padding:8px;border-radius:8px;border:1px solid #ddd">
          ${tamanhos.map(t => `<option>${t}</option>`).join('')}
        </select>
      </div>
      <div>
        <label class="small">Quantidade</label>
        <input id="sv2TrQty" type="number" min="1" value="1" style="width:100%;padding:8px;border-radius:8px;border:1px solid #ddd" />
      </div>
    </div>
    <div style="margin-top:10px">
      <label class="small">Observação (opcional)</label>
      <input id="sv2TrNota" placeholder="Ex: Reabastecimento semanal" style="width:100%;padding:8px;border-radius:8px;border:1px solid #ddd;margin-top:4px" />
    </div>
    <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      <button type="button" class="btn-yellow" id="sv2BtnTransfer">Registrar Transferência</button>
      <span id="sv2TrPreview" class="small muted" style="margin-left:8px"></span>
    </div>
  </div>

  <div class="sv2-section-title">Últimas Transferências</div>
  <div class="sv2-history-table"><div style="overflow:auto">
  <table style="width:100%;border-collapse:collapse">
    <thead><tr>
      <th style="padding:8px">Data</th>
      <th style="padding:8px">De</th>
      <th style="padding:8px">Para</th>
      <th style="padding:8px">Sabor</th>
      <th style="padding:8px">Tam.</th>
      <th style="padding:8px;text-align:right">Qtd</th>
      <th style="padding:8px">Obs.</th>
    </tr></thead><tbody>`;

  const trList = transfers.filter(t => t.type === 'transfer').slice(-50).reverse();
  if(trList.length){
    trList.forEach(t => {
      const fromLoc = findLocationById(t.fromId);
      const toLoc   = findLocationById(t.toId);
      html += `<tr>
        <td style="padding:8px">${t.date||''}</td>
        <td style="padding:8px">
          ${fromLoc ? `<span class="sv2-loc-dot" style="background:${fromLoc.color};display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:4px"></span>${fromLoc.name}` : (t.fromId||'—')}
        </td>
        <td style="padding:8px">
          ${toLoc ? `<span class="sv2-loc-dot" style="background:${toLoc.color};display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:4px"></span>${toLoc.name}` : (t.toId||'—')}
        </td>
        <td style="padding:8px">${t.sabor||''}</td>
        <td style="padding:8px">${t.tam||''}</td>
        <td style="padding:8px;text-align:right;font-weight:700">${t.qty||0}</td>
        <td style="padding:8px;font-size:0.82rem;color:#8a877c">${t.note||'—'}</td>
      </tr>`;
    });
  } else {
    html += `<tr><td colspan="7" style="padding:16px;text-align:center;color:#8a877c;font-style:italic">Nenhuma transferência registrada ainda.</td></tr>`;
  }

  html += `</tbody></table></div></div>`;
  stockV2Content.innerHTML = html;

  // Live preview
  function updateTrPreview(){
    const fromId = document.getElementById('sv2TrFrom')?.value;
    const sabor  = document.getElementById('sv2TrSabor')?.value;
    const tam    = document.getElementById('sv2TrTam')?.value;
    if(!fromId || !sabor || !tam) return;
    const avail = stockV2[sv2Key(fromId, sabor, tam)]?.qty || 0;
    const prev  = document.getElementById('sv2TrPreview');
    if(prev) prev.textContent = `Disponível em "${findLocationById(fromId)?.name}": ${avail} unidades`;
  }
  ['sv2TrFrom','sv2TrSabor','sv2TrTam'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', updateTrPreview);
  });
  updateTrPreview();

  // Transfer button
  document.getElementById('sv2BtnTransfer')?.addEventListener('click', () => {
    const fromId = document.getElementById('sv2TrFrom')?.value;
    const toId   = document.getElementById('sv2TrTo')?.value;
    const sabor  = document.getElementById('sv2TrSabor')?.value;
    const tam    = document.getElementById('sv2TrTam')?.value;
    const qty    = Number(document.getElementById('sv2TrQty')?.value);
    const nota   = document.getElementById('sv2TrNota')?.value || '';
    const res = doTransfer(fromId, toId, sabor, tam, qty, nota);
    if(!res.ok) return alert('❌ ' + res.msg);
    document.getElementById('sv2TrQty').value = 1;
    document.getElementById('sv2TrNota').value = '';
    updateTrPreview();
    renderTransferenciasTab();
    alert(`✅ Transferência registrada: ${qty}x ${sabor} ${tam}\n"${findLocationById(fromId)?.name}" → "${findLocationById(toId)?.name}"`);
  });
}

/* ---- HISTÓRICO TAB ---- */
function renderHistoricoTab(){
  const typeLabels = { venda:'Venda', transfer:'Transferência', entrada:'Entrada', ajuste:'Ajuste' };

  let html = `
  <div class="sv2-stock-controls" style="margin-bottom:14px">
    <label class="small">Tipo:</label>
    <select id="sv2HistType" style="padding:6px;border-radius:6px;border:1px solid #ddd">
      <option value="all">Todos</option>
      <option value="venda">Vendas</option>
      <option value="transfer">Transferências</option>
      <option value="entrada">Entradas</option>
      <option value="ajuste">Ajustes</option>
    </select>
    <label class="small" style="margin-left:8px">Local:</label>
    <select id="sv2HistLoc" style="padding:6px;border-radius:6px;border:1px solid #ddd">
      <option value="all">Todos</option>
      ${locations.map(l => `<option value="${l.id}">${l.name}</option>`).join('')}
    </select>
    <button type="button" class="small-btn btn-gray" id="sv2HistApply">Filtrar</button>
    <span class="small muted" style="margin-left:auto">${transfers.length} movimentações total</span>
  </div>
  <div id="sv2HistContent"></div>`;

  stockV2Content.innerHTML = html;

  function applyHistFilter(){
    const typeF = document.getElementById('sv2HistType')?.value || 'all';
    const locF  = document.getElementById('sv2HistLoc')?.value || 'all';

    let list = transfers.slice().reverse();
    if(typeF !== 'all') list = list.filter(t => t.type === typeF);
    if(locF !== 'all')  list = list.filter(t => t.fromId === locF || t.toId === locF);

    let thtml = `<div class="sv2-history-table"><div style="overflow:auto">
    <table style="width:100%;border-collapse:collapse">
      <thead><tr>
        <th style="padding:8px">Data</th>
        <th style="padding:8px">Tipo</th>
        <th style="padding:8px">De</th>
        <th style="padding:8px">Para</th>
        <th style="padding:8px">Sabor</th>
        <th style="padding:8px">Tam.</th>
        <th style="padding:8px;text-align:right">Qtd</th>
        <th style="padding:8px">Obs.</th>
      </tr></thead><tbody>`;

    const show = list.slice(0, 200);
    if(show.length){
      show.forEach(t => {
        const fromLoc = findLocationById(t.fromId);
        const toLoc   = findLocationById(t.toId);
        const typeLabel = typeLabels[t.type] || t.type;
        const typeClass = `sv2-type-${t.type}`;
        thtml += `<tr>
          <td style="padding:8px;white-space:nowrap">${t.date||''}</td>
          <td style="padding:8px"><span class="sv2-type-badge ${typeClass}">${typeLabel}</span></td>
          <td style="padding:8px;font-size:0.85rem">
            ${fromLoc ? `<span style="display:inline-flex;align-items:center;gap:4px"><span style="width:8px;height:8px;border-radius:50%;background:${fromLoc.color};flex-shrink:0"></span>${fromLoc.name}</span>` : (t.fromId ? t.fromId : '—')}
          </td>
          <td style="padding:8px;font-size:0.85rem">
            ${toLoc ? `<span style="display:inline-flex;align-items:center;gap:4px"><span style="width:8px;height:8px;border-radius:50%;background:${toLoc.color};flex-shrink:0"></span>${toLoc.name}</span>` : (t.toId ? t.toId : '—')}
          </td>
          <td style="padding:8px;font-size:0.85rem">${t.sabor||''}</td>
          <td style="padding:8px;font-size:0.85rem">${t.tam||''}</td>
          <td style="padding:8px;text-align:right;font-weight:700">${t.qty||0}</td>
          <td style="padding:8px;font-size:0.8rem;color:#8a877c">${t.note||'—'}</td>
        </tr>`;
      });
    } else {
      thtml += `<tr><td colspan="8" style="padding:16px;text-align:center;color:#8a877c;font-style:italic">Nenhuma movimentação encontrada.</td></tr>`;
    }

    thtml += `</tbody></table></div></div>`;
    if(list.length > 200) thtml += `<div class="small muted" style="margin-top:6px">Exibindo 200 de ${list.length} registros.</div>`;
    const histContent = document.getElementById('sv2HistContent');
    if(histContent) histContent.innerHTML = thtml;
  }

  document.getElementById('sv2HistApply')?.addEventListener('click', applyHistFilter);
  applyHistFilter();
}

/* ---- CUSTOS TAB ---- */
function renderCustosTab(){
  const tamanhos = getActiveTamanhos().map(t=>t.name); if(!tamanhos.length) tamanhos.push('240 mL','480 mL','1,5 L');
  const priceStd  = {'240 mL':17,'480 mL':30,'1,5 L':85};
  const pricePrem = {'240 mL':20,'480 mL':35,'1,5 L':100};

  function marginColor(v){ return v >= 50 ? '#16a34a' : v >= 30 ? '#ca8a04' : '#dc2626'; }

  const sortedBatches = productionBatches.slice().sort((a,b) => {
    if(b.loteNum !== a.loteNum) return (b.loteNum||0) - (a.loteNum||0);
    return (b._createdAt||b.date||'') > (a._createdAt||a.date||'') ? 1 : -1;
  });

  const batchesWithCost = productionBatches.filter(b => b.totalCost > 0);
  const lastBatch = batchesWithCost.length ? batchesWithCost[batchesWithCost.length-1] : null;
  const lastCosts = lastBatch ? calcBatchCosts(lastBatch.totalCost, lastBatch.qtys) : null;

  const totalCostAll = productionBatches.reduce((s,b) => s + (Number(b.totalCost)||0), 0);
  const totalUnitsAll = productionBatches.reduce((s,b) => {
    if(!b.items) return s;
    return s + b.items.reduce((ss,it) => ss + (Number(it.qty)||0), 0);
  }, 0);
  const avgCostPerUnit = totalUnitsAll > 0 ? totalCostAll / totalUnitsAll : 0;

  // Average cost per flavor/size across all batches
  const flavorCostMap = {};
  const flavorUnitMap = {};
  productionBatches.forEach(b => {
    if(!b.totalCost || !b.items) return;
    const bc = calcBatchCosts(b.totalCost, b.qtys);
    if(!bc) return;
    b.items.forEach(it => {
      const key = (it.sabor||'') + '||' + (it.tam||'');
      if(!flavorCostMap[key]) { flavorCostMap[key] = 0; flavorUnitMap[key] = 0; }
      flavorCostMap[key] += (bc[it.tam]||0) * (Number(it.qty)||0);
      flavorUnitMap[key] += Number(it.qty)||0;
    });
  });

  // Build margin table rows for last batch
  function buildMarginRows(){
    if(!lastCosts) return `<div style="padding:20px;text-align:center;color:#8a877c;font-style:italic">
      Nenhum lote com custo registrado ainda.<br>
      <span style="font-size:0.85rem">Use a aba <strong>📦 Estoques</strong> para lançar produção com custo.</span>
    </div>`;
    let rows = '';
    tamanhos.forEach(t => {
      const c  = lastCosts[t];
      const ps = priceStd[t]; const pp = pricePrem[t];
      const ms = ps > 0 ? ((ps-c)/ps*100).toFixed(1) : 0;
      const mp = pp > 0 ? ((pp-c)/pp*100).toFixed(1) : 0;
      rows += '<tr style="border-bottom:1px solid #f0ebe3">'
        + '<td style="padding:10px;font-weight:700">' + t + '</td>'
        + '<td style="padding:10px;text-align:right;font-weight:800;color:#012b29">' + formatBRL(c) + '</td>'
        + '<td style="padding:10px;text-align:right">' + formatBRL(ps) + '</td>'
        + '<td style="padding:10px;text-align:right"><span style="color:' + marginColor(parseFloat(ms)) + ';font-weight:700">' + ms + '%</span><span style="font-size:0.78rem;color:#888;display:block">' + formatBRL(ps-c) + '</span></td>'
        + '<td style="padding:10px;text-align:right">' + formatBRL(pp) + '</td>'
        + '<td style="padding:10px;text-align:right"><span style="color:' + marginColor(parseFloat(mp)) + ';font-weight:700">' + mp + '%</span><span style="font-size:0.78rem;color:#888;display:block">' + formatBRL(pp-c) + '</span></td>'
        + '</tr>';
    });
    return '<div style="overflow:auto">'
      + '<table style="width:100%;border-collapse:collapse;min-width:480px">'
      + '<thead><tr style="background:#012b29;color:#f2efeb">'
      + '<th style="padding:10px;text-align:left">Tamanho</th>'
      + '<th style="padding:10px;text-align:right">Custo Unit.</th>'
      + '<th style="padding:10px;text-align:right">Preço Std</th>'
      + '<th style="padding:10px;text-align:right">Margem Std</th>'
      + '<th style="padding:10px;text-align:right">Preço Prem.</th>'
      + '<th style="padding:10px;text-align:right">Margem Prem.</th>'
      + '</tr></thead><tbody>' + rows + '</tbody></table></div>'
      + '<div style="margin-top:10px;padding:10px;background:#f8f5ef;border-radius:8px;font-size:0.82rem;color:#6b6860">'
      + '📌 Lote referência: <strong>Lote ' + (lastBatch.loteNum||'?') + '</strong> — ' + lastBatch.date
      + (lastBatch.note ? ' — <em>' + lastBatch.note + '</em>' : '')
      + ' — custo total: <strong>' + formatBRL(lastBatch.totalCost) + '</strong>'
      + '</div>';
  }

  // Build flavor average rows
  function buildFlavorAvgRows(){
    const keys = Object.keys(flavorCostMap).sort();
    if(!keys.length) return '';
    let rows = '';
    keys.forEach(key => {
      const [sabor, tam] = key.split('||');
      const avg = flavorUnitMap[key] > 0 ? flavorCostMap[key] / flavorUnitMap[key] : 0;
      rows += '<tr style="border-bottom:1px solid #f0ebe3">'
        + '<td style="padding:8px">' + sabor + '</td>'
        + '<td style="padding:8px">' + tam + '</td>'
        + '<td style="padding:8px;text-align:right">' + flavorUnitMap[key] + '</td>'
        + '<td style="padding:8px;text-align:right;font-weight:700;color:#012b29">' + formatBRL(avg) + '</td>'
        + '</tr>';
    });
    return '<div style="background:#fff;border-radius:12px;border:1px solid #e0d9cf;padding:16px;margin-bottom:16px">'
      + '<h4 style="margin:0 0 12px 0;color:#012b29">🍦 Custo Médio por Sabor/Tamanho (histórico geral)</h4>'
      + '<div style="overflow:auto">'
      + '<table style="width:100%;border-collapse:collapse;font-size:0.85rem">'
      + '<thead><tr style="background:#efe9de">'
      + '<th style="padding:8px;text-align:left">Sabor</th>'
      + '<th style="padding:8px;text-align:left">Tamanho</th>'
      + '<th style="padding:8px;text-align:right">Qtd Produzida</th>'
      + '<th style="padding:8px;text-align:right">Custo Médio Unit.</th>'
      + '</tr></thead><tbody>' + rows + '</tbody></table></div></div>';
  }

  // Build all batch cards
  function buildBatchCards(){
    if(!sortedBatches.length) return '<div style="padding:16px;text-align:center;color:#8a877c;font-style:italic">Nenhum lote registrado ainda. Use a aba 📦 Estoques para lançar sua produção.</div>';
    let out = '';
    sortedBatches.forEach(b => {
      const bc = b.totalCost > 0 ? calcBatchCosts(b.totalCost, b.qtys) : null;
      const hasCost = b.totalCost > 0;
      const batchItems = b.items || [];
      const totalValorLote = batchItems.reduce((s,it) => s + (it.valorTotal || (it.qty * (it.precoUnit||0))), 0);

      let itemRows = '';
      batchItems.forEach(it => {
        const custoU = bc ? (bc[it.tam]||0) : (it.custoUnit||null);
        const precoU = it.precoUnit || defaultPriceFor(it.sabor, it.tam);
        const valorT = it.valorTotal || (it.qty * precoU);
        const margin = (custoU && precoU > 0) ? ((precoU - custoU)/precoU*100).toFixed(1) : null;
        itemRows += '<tr style="border-bottom:1px solid #f0ebe3">'
          + '<td style="padding:8px 10px">' + (it.sabor||'—') + '</td>'
          + '<td style="padding:8px 10px">' + (it.tam||'—') + '</td>'
          + '<td style="padding:8px 10px;text-align:right;font-weight:700">' + (it.qty||0) + '</td>'
          + '<td style="padding:8px 10px;text-align:right">' + formatBRL(precoU) + '</td>'
          + '<td style="padding:8px 10px;text-align:right"><span class="sv2-val-pill">' + formatBRL(valorT) + '</span></td>'
          + '<td style="padding:8px 10px;text-align:right">'
          + (custoU ? '<span style="font-weight:700;color:#012b29">' + formatBRL(custoU) + '</span>'
            + (margin ? '<span style="font-size:0.75rem;color:' + marginColor(parseFloat(margin)) + ';display:block">' + margin + '% margem</span>' : '')
            : '<em style="color:#8a877c;font-size:0.8rem">—</em>')
          + '</td></tr>';
      });

      const itemsSection = batchItems.length
        ? '<div style="overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:0.85rem">'
          + '<thead><tr style="background:#f8f5ef">'
          + '<th style="padding:8px 10px;text-align:left">Sabor</th>'
          + '<th style="padding:8px 10px;text-align:left">Tamanho</th>'
          + '<th style="padding:8px 10px;text-align:right">Qtd Produzida</th>'
          + '<th style="padding:8px 10px;text-align:right">Preço Unit. (venda)</th>'
          + '<th style="padding:8px 10px;text-align:right">Valor Total</th>'
          + '<th style="padding:8px 10px;text-align:right">Custo Unit.</th>'
          + '</tr></thead><tbody>' + itemRows
          + '<tr style="background:#efe9de;font-weight:800">'
          + '<td colspan="3" style="padding:8px 10px">Total do lote</td>'
          + '<td style="padding:8px 10px"></td>'
          + '<td style="padding:8px 10px;text-align:right">' + formatBRL(totalValorLote) + '</td>'
          + '<td style="padding:8px 10px;text-align:right">' + (hasCost ? formatBRL(b.totalCost) : '—') + '</td>'
          + '</tr></tbody></table></div>'
        : '<div style="padding:14px;color:#8a877c;font-style:italic;font-size:0.85rem">Nenhum item registrado neste lote (lote criado antes da atualização).</div>';

      out += '<div style="border:1px solid #e0d9cf;border-radius:10px;margin-bottom:12px;overflow:hidden">'
        + '<div style="background:#012b29;color:#f2efeb;padding:12px 16px;display:flex;flex-wrap:wrap;gap:10px;align-items:center">'
        + '<span style="font-weight:800;font-size:1rem">🏭 Lote ' + (b.loteNum||'?') + '</span>'
        + '<span style="opacity:0.8;font-size:0.88rem">' + (b.date||'') + '</span>'
        + (b.note ? '<span style="opacity:0.7;font-size:0.82rem;font-style:italic">' + b.note + '</span>' : '')
        + '<span style="margin-left:auto;background:' + (hasCost?'#e9b42e':'#dc2626') + ';color:' + (hasCost?'#012b29':'#fff') + ';padding:3px 10px;border-radius:6px;font-weight:700;font-size:0.85rem">'
        + (hasCost ? formatBRL(b.totalCost) : 'Sem custo') + '</span>'
        + '<button type="button" class="small-btn" data-act="edit-batch" data-id="' + b.id + '" style="background:#e9b42e;color:#012b29;padding:4px 10px;border-radius:6px;font-size:0.78rem;font-weight:700">✏️ Editar</button>'
        + '<button type="button" class="small-btn btn-red" data-act="del-batch" data-id="' + b.id + '" style="padding:4px 8px;font-size:0.78rem">✕</button>'
        + '</div>'
        + itemsSection
        + '</div>';
    });
    return out;
  }

  const html = ''
    + '<div class="custo-kpi-grid" style="margin-bottom:16px">'
    + '<div class="custo-kpi"><div class="custo-kpi-label">💰 Custo Total (todos lotes)</div><div class="custo-kpi-value">' + formatBRL(totalCostAll) + '</div></div>'
    + '<div class="custo-kpi"><div class="custo-kpi-label">🏭 Lotes Registrados</div><div class="custo-kpi-value">' + productionBatches.length + '</div></div>'
    + '<div class="custo-kpi"><div class="custo-kpi-label">📦 Total Unidades Produzidas</div><div class="custo-kpi-value">' + totalUnitsAll + '</div></div>'
    + '<div class="custo-kpi"><div class="custo-kpi-label">⚖️ Custo Médio por Unidade</div><div class="custo-kpi-value">' + (avgCostPerUnit > 0 ? formatBRL(avgCostPerUnit) : '—') + '</div></div>'
    + '</div>'
    + '<div style="background:#fff;border-radius:12px;border:1px solid #e0d9cf;padding:16px;margin-bottom:16px">'
    + '<h4 style="margin:0 0 14px 0;color:#012b29">📊 Dashboard de Margens — baseado no último lote com custo</h4>'
    + buildMarginRows()
    + '</div>'
    + buildFlavorAvgRows()
    + '<div style="background:#fff;border-radius:12px;border:1px solid #e0d9cf;padding:16px">'
    + '<h4 style="margin:0 0 12px 0;color:#012b29;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">'
    + '📋 Histórico de Lotes de Produção'
    + '<span class="small muted" style="font-weight:400">' + productionBatches.length + ' lote' + (productionBatches.length!==1?'s':'') + ' registrado' + (productionBatches.length!==1?'s':'') + '</span>'
    + '</h4>'
    + buildBatchCards()
    + '</div>'
    + '<div id="editBatchModal" style="display:none;position:fixed;left:0;top:0;right:0;bottom:0;background:rgba(0,0,0,0.55);z-index:999999;align-items:center;justify-content:center">'
    + '<div style="background:#fff;border-radius:14px;padding:24px;max-width:480px;width:92vw;box-shadow:0 8px 32px rgba(0,0,0,0.35)">'
    + '<h3 style="margin:0 0 16px 0;color:#012b29">✏️ Editar Lote de Produção</h3>'
    + '<p style="margin:0 0 14px 0;font-size:0.82rem;color:#8a877c">Edite o cabeçalho do lote. Ao salvar, os custos unitários são recalculados automaticamente.</p>'
    + '<input type="hidden" id="editBatchId" />'
    + '<div style="display:grid;gap:10px">'
    + '<div><label class="small" style="font-weight:700">Nº do Lote</label><input type="number" id="editBatchLoteNum" min="1" style="width:100%;padding:8px;border-radius:8px;border:1px solid #ccc" /></div>'
    + '<div><label class="small" style="font-weight:700">Data</label><input type="date" id="editBatchDate" style="width:100%;padding:8px;border-radius:8px;border:1px solid #ccc" /></div>'
    + '<div><label class="small" style="font-weight:700">💰 Custo Total da Produção (R$)</label><input type="number" step="0.01" min="0" id="editBatchCost" placeholder="0.00" style="width:100%;padding:8px;border-radius:8px;border:1.5px solid #86efac;font-weight:700;background:#f0fff4" /></div>'
    + '<div><label class="small" style="font-weight:700">Observação</label><input type="text" id="editBatchNote" style="width:100%;padding:8px;border-radius:8px;border:1px solid #ccc" /></div>'
    + '<div id="editBatchPreview" style="background:#f0fff4;border-radius:8px;padding:10px;font-size:0.85rem;color:#166534;display:none"></div>'
    + '</div>'
    + '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">'
    + '<button type="button" id="editBatchSave" class="btn-yellow">💾 Salvar e recalcular custos</button>'
    + '<button type="button" id="editBatchCancel" class="btn-gray">Cancelar</button>'
    + '</div></div></div>';

  stockV2Content.innerHTML = html;

  // Edit / Delete delegation
  stockV2Content.addEventListener('click', ev => {
    const editBtn = ev.target.closest('button[data-act="edit-batch"]');
    if(editBtn){
      const id = editBtn.getAttribute('data-id');
      const b  = productionBatches.find(x => x.id === id);
      if(!b) return;
      document.getElementById('editBatchId').value = id;
      document.getElementById('editBatchLoteNum').value = b.loteNum || '';
      document.getElementById('editBatchDate').value = b.date || today();
      document.getElementById('editBatchCost').value = b.totalCost || 0;
      document.getElementById('editBatchNote').value = b.note || '';
      updateEditPreview();
      document.getElementById('editBatchModal').style.display = 'flex';
      return;
    }
    const delBtn = ev.target.closest('button[data-act="del-batch"]');
    if(delBtn){
      const id = delBtn.getAttribute('data-id');
      const b  = productionBatches.find(x => x.id === id);
      if(!confirm('Excluir Lote ' + (b?.loteNum||'?') + '? Esta ação não pode ser desfeita.')) return;
      productionBatches = productionBatches.filter(x => x.id !== id);
      deleteProductionBatchFromCloud(id);
      renderCustosTab();
    }
  });

  function updateEditPreview(){
    const cost = parseFloat(document.getElementById('editBatchCost')?.value) || 0;
    const prev = document.getElementById('editBatchPreview');
    const id   = document.getElementById('editBatchId')?.value;
    const b    = productionBatches.find(x => x.id === id);
    if(!prev || !b) return;
    if(!cost){ prev.style.display = 'none'; return; }
    const costs = calcBatchCosts(cost, b.qtys);
    if(!costs){ prev.style.display = 'none'; return; }
    prev.style.display = 'block';
    const parts = tamanhos.filter(t => (b.qtys[t]||0) > 0).map(t => '<strong>' + t + '</strong>: ' + formatBRL(costs[t]));
    prev.innerHTML = '<strong>Custo recalculado por unidade:</strong> ' + parts.join(' · ');
  }

  document.getElementById('editBatchCost')?.addEventListener('input', updateEditPreview);

  document.getElementById('editBatchCancel')?.addEventListener('click', () => {
    document.getElementById('editBatchModal').style.display = 'none';
  });

  document.getElementById('editBatchSave')?.addEventListener('click', () => {
    const id = document.getElementById('editBatchId')?.value;
    const b  = productionBatches.find(x => x.id === id);
    if(!b) return;
    const loteNum   = Number(document.getElementById('editBatchLoteNum')?.value) || b.loteNum;
    const date      = document.getElementById('editBatchDate')?.value || b.date;
    const totalCost = parseFloat(document.getElementById('editBatchCost')?.value) || 0;
    const note      = document.getElementById('editBatchNote')?.value || '';
    const costs     = totalCost > 0 ? calcBatchCosts(totalCost, b.qtys) : null;

    b.loteNum   = loteNum;
    b.date      = date;
    b.totalCost = totalCost;
    b.note      = note;
    b.costs     = costs;
    if(b.items && costs){
      b.items.forEach(it => { it.custoUnit = costs[it.tam] || null; });
    }

    updateProductionBatchInCloud(id, { loteNum, date, totalCost, note, qtys: b.qtys, costs, items: b.items });

    document.getElementById('editBatchModal').style.display = 'none';
    renderCustosTab();
    const notice = document.createElement('div');
    notice.textContent = 'Lote ' + loteNum + ' atualizado! Custos recalculados.';
    notice.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#012b29;color:#f2efeb;padding:12px 24px;border-radius:10px;font-weight:700;z-index:99999;box-shadow:0 4px 16px rgba(0,0,0,0.3)';
    document.body.appendChild(notice);
    setTimeout(() => notice.remove(), 2500);
  });
}



/* ---- Firebase listeners for stock v2 ---- */
let stockV2Unsub = null;
let locationsUnsub = null;
let transfersUnsub = null;
let productionBatchesUnsub = null;

function startStockV2Listeners(){
  if(!window.db || stockV2Unsub) return;
  try{
    stockV2Unsub = db.collection('meta').doc('stock_v2').onSnapshot(doc => {
      if(!doc.exists) return;
      const d = doc.data() || {};
      if(d.entries && typeof d.entries === 'object'){
        Object.keys(d.entries).forEach(k => { stockV2[k] = d.entries[k]; });
      }
      saveStockV2Local();
      if(currentStockTab === 'dashboard' || currentStockTab === 'estoque') renderStockV2Tab(currentStockTab);
    }, e => console.error('stockV2 listener', e));

    locationsUnsub = db.collection('meta').doc('locations').onSnapshot(doc => {
      if(!doc.exists) return;
      const d = doc.data() || {};
      if(Array.isArray(d.list) && d.list.length > 0){
        locations = d.list;
        saveStockV2Local();
        populateLocalSelect();
        if(currentStockTab === 'locais') renderStockV2Tab('locais');
      }
    }, e => console.error('locations listener', e));

    transfersUnsub = db.collection('meta').doc('transfers').onSnapshot(doc => {
      if(!doc.exists) return;
      const d = doc.data() || {};
      if(Array.isArray(d.list)){
        const cloudIds = new Set(d.list.map(t => t.id));
        const localOnly = transfers.filter(t => !cloudIds.has(t.id));
        transfers = [...d.list, ...localOnly];
        saveStockV2Local();
        if(currentStockTab === 'historico' || currentStockTab === 'transferencias') renderStockV2Tab(currentStockTab);
      }
    }, e => console.error('transfers listener', e));

    // Production batches listener (real-time sync)
    productionBatchesUnsub = db.collection('producao_lotes').orderBy('_updatedAt').onSnapshot(snapshot => {
      snapshot.docChanges().forEach(change => {
        const data = change.doc.data();
        if(change.type === 'removed'){
          productionBatches = productionBatches.filter(b => b.id !== data.id);
        } else {
          const idx = productionBatches.findIndex(b => b.id === data.id);
          if(idx >= 0) productionBatches[idx] = data;
          else productionBatches.push(data);
        }
      });
      // Update nextBatchNum
      const maxLote = productionBatches.reduce((m, b) => Math.max(m, b.loteNum||0), 0);
      if(maxLote >= nextBatchNum) nextBatchNum = maxLote + 1;
      if(currentStockTab === 'custos') renderStockV2Tab('custos');
      if(currentStockTab === 'estoque') renderStockV2Tab('estoque');
    }, e => console.error('producao_lotes listener', e));

    // Load nextBatchNum
    db.collection('meta').doc('producao_meta').get().then(doc => {
      if(doc.exists){
        const n = doc.data().nextBatchNum;
        if(n && n > nextBatchNum) nextBatchNum = n;
      }
    }).catch(()=>{});

  }catch(e){ console.error('startStockV2Listeners', e); }
}

function stopStockV2Listeners(){
  try{ if(stockV2Unsub){ stockV2Unsub(); stockV2Unsub = null; } }catch(e){}
  try{ if(locationsUnsub){ locationsUnsub(); locationsUnsub = null; } }catch(e){}
  try{ if(transfersUnsub){ transfersUnsub(); transfersUnsub = null; } }catch(e){}
  try{ if(productionBatchesUnsub){ productionBatchesUnsub(); productionBatchesUnsub = null; } }catch(e){}
}

/* ---- Hook: open stock v2 modal ---- */
const btnStockV2 = document.getElementById('btnStockV2');
if(btnStockV2) btnStockV2.addEventListener('click', openStockV2Modal);

// Also hook the existing Editar Estoque button to open the new modal
const btnEditStockOld = document.getElementById('btnEditStock');
if(btnEditStockOld){
  // Remove old handler by cloning
  const newBtn = btnEditStockOld.cloneNode(true);
  btnEditStockOld.parentNode.replaceChild(newBtn, btnEditStockOld);
  newBtn.addEventListener('click', openStockV2Modal);
}

/* ---- Init ---- */
ensureDefaultLocations();
populateLocalSelect();

// Wire up local dot preview in main form
const inputLocalSel = document.getElementById('inputLocal');
if(inputLocalSel){
  inputLocalSel.addEventListener('change', () => updateLocalDot(inputLocalSel));
  updateLocalDot(inputLocalSel);
}

/* ---- Expose to auth listener (start V2 listeners on login) ---- */
window.__startStockV2Listeners  = startStockV2Listeners;
window.__stopStockV2Listeners   = stopStockV2Listeners;
window.__adjustStockV2ForFinalize = adjustStockV2ForFinalize;
window.__adjustStockV2OnEdit      = adjustStockV2OnEdit;
window.__adjustStockV2OnDelete    = adjustStockV2OnDelete;

/* ========================================================
   MÓDULO ANALYTICS / RELATÓRIO DE VENDAS
   ======================================================== */

const analyticsModal    = document.getElementById('modalAnalyticsBack');
const analyticsContent  = document.getElementById('analyticsContent');
const analyticsClose    = document.getElementById('analyticsClose');
let   analyticsTab      = 'overview';

if(analyticsClose) analyticsClose.addEventListener('click', ()=> hideModal(analyticsModal));
if(analyticsModal) analyticsModal.addEventListener('click', e => { if(e.target === analyticsModal) hideModal(analyticsModal); });

const btnAnalytics = document.getElementById('btnAnalytics');
if(btnAnalytics) btnAnalytics.addEventListener('click', ()=>{
  showModal(analyticsModal);
  analyticsTab = 'overview';
  renderAnalyticsTabs();
  renderAnalyticsContent();
});

function renderAnalyticsTabs(){
  const tabs = document.querySelectorAll('.analytics-tab');
  tabs.forEach(t => t.classList.toggle('active', t.getAttribute('data-tab') === analyticsTab));
}

// Tab delegation
const analyticsTabBar = document.querySelector('.analytics-tabs');
if(analyticsTabBar){
  analyticsTabBar.addEventListener('click', ev => {
    const btn = ev.target.closest('.analytics-tab');
    if(!btn) return;
    analyticsTab = btn.getAttribute('data-tab');
    renderAnalyticsTabs();
    renderAnalyticsContent();
  });
}

function renderAnalyticsContent(){
  if(!analyticsContent) return;
  switch(analyticsTab){
    case 'overview':  analyticsContent.innerHTML = buildAnalyticsOverview(); break;
    case 'mensal':    analyticsContent.innerHTML = buildAnalyticsMensal(); break;
    case 'sabores':   analyticsContent.innerHTML = buildAnalyticsSabores(); break;
    case 'clientes':  analyticsContent.innerHTML = buildAnalyticsClientes(); break;
    default: analyticsContent.innerHTML = '';
  }
}

/* ---- helpers ---- */
function analyticsItems(){ return items.filter(it => !isResgateStatus(it.status) && it.status !== 'Cancelado'); }

function getMonthsRange(){
  const set = new Set();
  items.forEach(it => { if(it.data) set.add(it.data.slice(0,7)); });
  return Array.from(set).sort();
}

function fmtMonth(ym){ const [y,m] = ym.split('-'); return `${m}/${y}`; }

function itemsInMonth(ym, arr){ return (arr||analyticsItems()).filter(it => it.data && it.data.startsWith(ym)); }

function revenueOf(arr){ return arr.reduce((s,it)=> s + (Number(it.qtd||0)*Number(it.valor||0)), 0); }
function qtyOf(arr)    { return arr.reduce((s,it)=> s + Number(it.qtd||0), 0); }

/* ── OVERVIEW ── */
function buildAnalyticsOverview(){
  const all = analyticsItems();
  const months = getMonthsRange();
  const now = new Date().toISOString().slice(0,7);
  const curItems  = itemsInMonth(now, all);
  const prevMonth = months.slice(-2)[0] || now;
  const prevItems = itemsInMonth(prevMonth, all);

  const totalRev    = revenueOf(all);
  const totalQty    = qtyOf(all);
  const totalOrders = new Set(all.map(it=>it.pedido)).size;
  const avgTicket   = totalOrders > 0 ? totalRev / totalOrders : 0;

  const curRev = revenueOf(curItems);
  const prevRev = revenueOf(prevItems);
  const revDelta = prevRev > 0 ? ((curRev - prevRev)/prevRev*100).toFixed(1) : null;

  // status breakdown
  const statusMap = {};
  items.forEach(it => { statusMap[it.status||'?'] = (statusMap[it.status||'?']||0) + 1; });

  // monthly sparkline data (last 6)
  const last6 = months.slice(-6);

  let html = `<div class="an-kpi-grid">
    <div class="an-kpi">
      <div class="an-kpi-label">💰 Receita Total</div>
      <div class="an-kpi-val">${formatBRL(totalRev)}</div>
      <div class="an-kpi-sub">todos os períodos</div>
    </div>
    <div class="an-kpi">
      <div class="an-kpi-label">📦 Unidades Vendidas</div>
      <div class="an-kpi-val">${totalQty}</div>
      <div class="an-kpi-sub">todos os períodos</div>
    </div>
    <div class="an-kpi">
      <div class="an-kpi-label">🧾 Pedidos Finalizados</div>
      <div class="an-kpi-val">${totalOrders}</div>
      <div class="an-kpi-sub">todos os períodos</div>
    </div>
    <div class="an-kpi">
      <div class="an-kpi-label">🎯 Ticket Médio</div>
      <div class="an-kpi-val">${formatBRL(avgTicket)}</div>
      <div class="an-kpi-sub">por pedido</div>
    </div>
    <div class="an-kpi an-kpi--month">
      <div class="an-kpi-label">📅 Receita este mês</div>
      <div class="an-kpi-val">${formatBRL(curRev)}</div>
      <div class="an-kpi-sub">${revDelta !== null ? (revDelta >= 0 ? '▲' : '▼') + ' ' + Math.abs(revDelta) + '% vs mês anterior' : '—'}</div>
    </div>
  </div>`;

  // Bar chart – monthly revenue
  if(last6.length){
    const maxRev = Math.max(...last6.map(ym => revenueOf(itemsInMonth(ym, all))), 1);
    html += `<div class="an-section">
      <div class="an-section-title">📈 Receita dos últimos meses</div>
      <div class="an-bar-chart">`;
    last6.forEach(ym => {
      const rev = revenueOf(itemsInMonth(ym, all));
      const qty = qtyOf(itemsInMonth(ym, all));
      const pct = Math.max(3, Math.round(rev / maxRev * 116));
      html += `<div class="an-bar-col">
        <div class="an-bar-wrap"><div class="an-bar" style="height:${pct}px" title="${formatBRL(rev)}"></div></div>
        <div class="an-bar-val">${formatBRL(rev).replace('R$ ','')}</div>
        <div class="an-bar-label">${fmtMonth(ym)}</div>
        <div class="an-bar-qty">${qty} un</div>
      </div>`;
    });
    html += `</div></div>`;
  }

  // Status breakdown
  html += `<div class="an-section">
    <div class="an-section-title">📊 Distribuição por Status</div>
    <div class="an-status-grid">`;
  const statusColors = {'A Fazer':'#fff3cd','À Entregar':'#cce5ff','Entregue':'#d4edda','Pago':'#e9b42e','Cancelado':'#f8d7da','Resgate':'#e8f6ef'};
  const statusText   = {'A Fazer':'#786200','À Entregar':'#084298','Entregue':'#155724','Pago':'#012b29','Cancelado':'#721c24','Resgate':'#0b6b4f'};
  Object.keys(statusMap).sort().forEach(s => {
    const bg = statusColors[s] || '#eee';
    const tc = statusText[s] || '#333';
    html += `<div class="an-status-card" style="background:${bg};color:${tc}">
      <div class="an-status-count">${statusMap[s]}</div>
      <div class="an-status-name">${s}</div>
    </div>`;
  });
  html += `</div></div>`;

  return html;
}

/* ── MENSAL ── */
function buildAnalyticsMensal(){
  const all = analyticsItems();
  const months = getMonthsRange().reverse();

  if(!months.length) return `<div class="an-empty">Nenhum dado disponível.</div>`;

  let html = `<div class="an-section">
    <div class="an-section-title">📅 Resumo por Mês</div>
    <div style="overflow:auto">
    <table class="an-table">
      <thead><tr>
        <th>Mês</th><th>Receita</th><th>Unidades</th><th>Pedidos</th><th>Ticket Médio</th>
        <th>240 mL</th><th>480 mL</th><th>1,5 L</th>
      </tr></thead><tbody>`;

  let grandRev = 0, grandQty = 0, grandOrders = 0;

  months.forEach(ym => {
    const mi = itemsInMonth(ym, all);
    if(!mi.length) return;
    const rev = revenueOf(mi);
    const qty = qtyOf(mi);
    const orders = new Set(mi.map(it=>it.pedido)).size;
    const ticket = orders > 0 ? rev/orders : 0;
    const by240 = mi.filter(it=>it.tam==='240 mL').reduce((s,it)=>s+Number(it.qtd||0),0);
    const by480 = mi.filter(it=>it.tam==='480 mL').reduce((s,it)=>s+Number(it.qtd||0),0);
    const by15  = mi.filter(it=>it.tam==='1,5 L').reduce((s,it)=>s+Number(it.qtd||0),0);
    grandRev += rev; grandQty += qty; grandOrders += orders;
    html += `<tr>
      <td style="font-weight:700">${fmtMonth(ym)}</td>
      <td>${formatBRL(rev)}</td>
      <td>${qty}</td>
      <td>${orders}</td>
      <td>${formatBRL(ticket)}</td>
      <td>${by240||'—'}</td><td>${by480||'—'}</td><td>${by15||'—'}</td>
    </tr>`;
  });

  html += `<tr class="an-table-total">
    <td>Total</td>
    <td>${formatBRL(grandRev)}</td>
    <td>${grandQty}</td>
    <td>${grandOrders}</td>
    <td>${formatBRL(grandOrders>0?grandRev/grandOrders:0)}</td>
    <td colspan="3"></td>
  </tr>`;
  html += `</tbody></table></div></div>`;

  // Revenue trend bar chart (all months)
  const allMonthsAsc = getMonthsRange();
  if(allMonthsAsc.length > 1){
    const maxRev = Math.max(...allMonthsAsc.map(ym => revenueOf(itemsInMonth(ym, all))), 1);
    html += `<div class="an-section" style="margin-top:16px">
      <div class="an-section-title">📈 Evolução Mensal de Receita</div>
      <div class="an-bar-chart an-bar-chart--wide">`;
    allMonthsAsc.forEach(ym => {
      const rev = revenueOf(itemsInMonth(ym, all));
      const pct = Math.max(3, Math.round(rev / maxRev * 116));
      html += `<div class="an-bar-col">
        <div class="an-bar-wrap"><div class="an-bar" style="height:${pct}px"></div></div>
        <div class="an-bar-val">${formatBRL(rev).replace('R$ ','')}</div>
        <div class="an-bar-label">${fmtMonth(ym)}</div>
      </div>`;
    });
    html += `</div></div>`;
  }

  return html;
}

/* ── SABORES ── */
function buildAnalyticsSabores(){
  const all = analyticsItems();

  // by flavor
  const byFlavor = {};
  const bySize   = {};
  all.forEach(it => {
    const s = it.sabor || '?';
    if(!byFlavor[s]) byFlavor[s] = { qty:0, rev:0 };
    byFlavor[s].qty += Number(it.qtd||0);
    byFlavor[s].rev += Number(it.qtd||0)*Number(it.valor||0);
    const t = it.tam || '?';
    if(!bySize[t]) bySize[t] = { qty:0, rev:0 };
    bySize[t].qty += Number(it.qtd||0);
    bySize[t].rev += Number(it.qtd||0)*Number(it.valor||0);
  });

  const totalQty = qtyOf(all);
  const totalRev = revenueOf(all);

  const flavorsSorted = Object.keys(byFlavor).sort((a,b)=> byFlavor[b].rev - byFlavor[a].rev);
  const maxFRev = Math.max(...flavorsSorted.map(s=>byFlavor[s].rev), 1);

  let html = `<div class="an-section">
    <div class="an-section-title">🍦 Receita por Sabor</div>
    <div class="an-flavor-bars">`;

  flavorsSorted.forEach((s, i) => {
    const d = byFlavor[s];
    const pct = (d.rev / maxFRev * 100).toFixed(0);
    const share = totalRev > 0 ? (d.rev/totalRev*100).toFixed(1) : 0;
    html += `<div class="an-flavor-row">
      <div class="an-flavor-name">${s}</div>
      <div class="an-flavor-track">
        <div class="an-flavor-fill" style="width:${pct}%;opacity:${1-(i*0.07)}"></div>
      </div>
      <div class="an-flavor-stats">${d.qty} un &middot; ${formatBRL(d.rev)} &middot; <span class="an-share">${share}%</span></div>
    </div>`;
  });
  html += `</div></div>`;

  // by size
  html += `<div class="an-section" style="margin-top:16px">
    <div class="an-section-title">📐 Receita por Tamanho</div>
    <div class="an-size-grid">`;
  ['240 mL','480 mL','1,5 L'].forEach(t => {
    const d = bySize[t] || {qty:0,rev:0};
    const share = totalQty > 0 ? (d.qty/totalQty*100).toFixed(1) : 0;
    html += `<div class="an-size-card">
      <div class="an-size-name">${t}</div>
      <div class="an-size-qty">${d.qty} <span class="an-size-unit">un</span></div>
      <div class="an-size-rev">${formatBRL(d.rev)}</div>
      <div class="an-size-share">${share}% das unidades</div>
    </div>`;
  });
  html += `</div></div>`;

  // table
  html += `<div class="an-section" style="margin-top:16px">
    <div class="an-section-title">📋 Tabela de Sabores</div>
    <div style="overflow:auto"><table class="an-table">
      <thead><tr><th>Sabor</th><th>Unidades</th><th>Receita</th><th>% Receita</th></tr></thead>
      <tbody>`;
  flavorsSorted.forEach(s => {
    const d = byFlavor[s];
    const share = totalRev > 0 ? (d.rev/totalRev*100).toFixed(1) : 0;
    html += `<tr><td>${s}</td><td>${d.qty}</td><td>${formatBRL(d.rev)}</td><td>${share}%</td></tr>`;
  });
  html += `</tbody></table></div></div>`;

  return html;
}

/* ── CLIENTES ── */
function buildAnalyticsClientes(){
  const all = analyticsItems();
  const byClient = {};
  all.forEach(it => {
    const cid = it.clientId || it.cliente || '?';
    const name = (it.clientId ? (findClientById(it.clientId)?.name || it.cliente) : it.cliente) || '?';
    if(!byClient[cid]) byClient[cid] = { name, qty:0, rev:0, orders: new Set() };
    byClient[cid].qty += Number(it.qtd||0);
    byClient[cid].rev += Number(it.qtd||0)*Number(it.valor||0);
    if(it.pedido) byClient[cid].orders.add(it.pedido);
  });

  const sorted = Object.values(byClient).sort((a,b)=>b.rev-a.rev);
  const totalRev = revenueOf(all);

  let html = `<div class="an-section">
    <div class="an-section-title">👥 Top Clientes por Receita</div>
    <div style="overflow:auto"><table class="an-table">
      <thead><tr>
        <th>#</th><th>Cliente</th><th>Pedidos</th><th>Unidades</th><th>Receita</th><th>% Total</th>
      </tr></thead><tbody>`;

  sorted.slice(0,30).forEach((c, i) => {
    const share = totalRev > 0 ? (c.rev/totalRev*100).toFixed(1) : 0;
    const ticket = c.orders.size > 0 ? c.rev/c.orders.size : 0;
    html += `<tr>
      <td class="muted">${i+1}</td>
      <td style="font-weight:600">${c.name}</td>
      <td>${c.orders.size}</td>
      <td>${c.qty}</td>
      <td>${formatBRL(c.rev)}</td>
      <td><div class="an-share-bar"><div style="width:${share}%;background:var(--green);height:6px;border-radius:3px"></div><span>${share}%</span></div></td>
    </tr>`;
  });

  html += `</tbody></table></div></div>`;
  return html;
}

/* ========================================================
   MÓDULO PRODUTOS — Sabores, Tamanhos e Preços
   ======================================================== */

const produtosModal = document.getElementById('modalProdutosBack');
const produtosContent = document.getElementById('produtosContent');
const btnProdutos = document.getElementById('btnProdutos');
const produtosClose = document.getElementById('produtosClose');
let currentProdutosTab = 'sabores';

function openProdutosModal(){
  currentProdutosTab = 'sabores';
  document.querySelectorAll('[data-ptab]').forEach(b=>b.classList.toggle('active', b.getAttribute('data-ptab')==='sabores'));
  renderProdutosTab('sabores');
  showModal(produtosModal);
}

if(btnProdutos) btnProdutos.addEventListener('click', openProdutosModal);
if(produtosClose) produtosClose.addEventListener('click', ()=>hideModal(produtosModal));
if(produtosModal) produtosModal.addEventListener('click', e=>{ if(e.target===produtosModal) hideModal(produtosModal); });

// Tab delegation para produtos
const produtosHeader = produtosModal?.querySelector('.sv2-header');
if(produtosHeader){
  produtosHeader.addEventListener('click', ev=>{
    const btn = ev.target.closest('[data-ptab]');
    if(!btn) return;
    document.querySelectorAll('[data-ptab]').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    currentProdutosTab = btn.getAttribute('data-ptab');
    renderProdutosTab(currentProdutosTab);
  });
}

function renderProdutosTab(tab){
  if(!produtosContent) return;
  if(tab==='sabores')  renderProdutosSabores();
  else if(tab==='tamanhos') renderProdutosTamanhos();
  else if(tab==='precos')   renderProdutosPrecos();
}

/* ---- SABORES ---- */
function renderProdutosSabores(){
  const list = productsCatalog.sabores;
  let html = `<div class="sv2-section-title">Sabores cadastrados</div>
  <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px" id="saboresList">`;
  list.forEach((s,i)=>{
    html += `<div style="display:flex;align-items:center;gap:10px;background:#fff;padding:10px 14px;border-radius:10px;border:1px solid #e0d9cf">
      <span style="flex:1;font-weight:700;color:${s.active?'#012b29':'#aaa'}">${s.name}${!s.active?' <span style="font-size:0.72rem;color:#dc2626;font-weight:400">(inativo)</span>':''}</span>
      <button type="button" class="small-btn btn-yellow" data-act="edit-sabor" data-idx="${i}">✏️ Editar</button>
      <button type="button" class="small-btn ${s.active?'btn-gray':'btn-green'}" data-act="toggle-sabor" data-idx="${i}">${s.active?'Desativar':'Ativar'}</button>
      <button type="button" class="small-btn btn-red" data-act="del-sabor" data-idx="${i}">✕</button>
    </div>`;
  });
  html += `</div>
  <div class="sv2-section-title">Adicionar Sabor</div>
  <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;background:#fff;padding:14px;border-radius:10px;border:1px solid #e0d9cf">
    <div style="flex:1;min-width:200px">
      <label class="small" style="font-weight:700">Nome do Sabor</label>
      <input id="newSaborName" placeholder="Ex: Pistache" style="width:100%;padding:8px;border-radius:8px;border:1px solid #ccc;margin-top:4px" />
    </div>
    <button type="button" class="btn-yellow" id="btnAddSabor" style="padding:8px 18px">+ Adicionar</button>
  </div>`;
  produtosContent.innerHTML = html;

  // Listeners
  produtosContent.querySelectorAll('[data-act="edit-sabor"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const idx = Number(btn.getAttribute('data-idx'));
      const s = productsCatalog.sabores[idx];
      const newName = prompt('Novo nome do sabor:', s.name);
      if(!newName || !newName.trim()) return;
      s.name = newName.trim();
      saveProductsCatalog(); refreshAllProductSelects(); renderProdutosSabores();
    });
  });
  produtosContent.querySelectorAll('[data-act="toggle-sabor"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const idx = Number(btn.getAttribute('data-idx'));
      productsCatalog.sabores[idx].active = !productsCatalog.sabores[idx].active;
      saveProductsCatalog(); refreshAllProductSelects(); renderProdutosSabores();
    });
  });
  produtosContent.querySelectorAll('[data-act="del-sabor"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const idx = Number(btn.getAttribute('data-idx'));
      if(!confirm('Excluir sabor "'+productsCatalog.sabores[idx].name+'"? Isso não apaga pedidos existentes.')) return;
      productsCatalog.sabores.splice(idx,1);
      saveProductsCatalog(); refreshAllProductSelects(); renderProdutosSabores();
    });
  });
  document.getElementById('btnAddSabor')?.addEventListener('click', ()=>{
    const name = (document.getElementById('newSaborName')?.value||'').trim();
    if(!name) return alert('Digite o nome do sabor');
    if(productsCatalog.sabores.find(s=>s.name.toLowerCase()===name.toLowerCase())) return alert('Sabor já existe');
    const id = 's-' + name.toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'') + '-' + Date.now();
    productsCatalog.sabores.push({id, name, active:true});
    saveProductsCatalog(); refreshAllProductSelects(); renderProdutosSabores();
    document.getElementById('newSaborName').value = '';
  });
}

/* ---- TAMANHOS ---- */
function renderProdutosTamanhos(){
  const list = productsCatalog.tamanhos;
  let html = `<div class="sv2-section-title">Tamanhos cadastrados</div>
  <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">`;
  list.forEach((t,i)=>{
    html += `<div style="display:flex;align-items:center;gap:10px;background:#fff;padding:10px 14px;border-radius:10px;border:1px solid #e0d9cf">
      <span style="flex:1;font-weight:700;color:${t.active?'#012b29':'#aaa'}">${t.name} <span class="muted" style="font-weight:400">${t.volume||''}</span>${!t.active?' <span style="font-size:0.72rem;color:#dc2626;font-weight:400">(inativo)</span>':''}</span>
      <button type="button" class="small-btn btn-yellow" data-act="edit-tam" data-idx="${i}">✏️ Editar</button>
      <button type="button" class="small-btn ${t.active?'btn-gray':'btn-green'}" data-act="toggle-tam" data-idx="${i}">${t.active?'Desativar':'Ativar'}</button>
      <button type="button" class="small-btn btn-red" data-act="del-tam" data-idx="${i}">✕</button>
    </div>`;
  });
  html += `</div>
  <div class="sv2-section-title">Adicionar Tamanho</div>
  <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;background:#fff;padding:14px;border-radius:10px;border:1px solid #e0d9cf">
    <div>
      <label class="small" style="font-weight:700">Nome</label>
      <input id="newTamName" placeholder="Ex: 700 mL" style="width:120px;padding:8px;border-radius:8px;border:1px solid #ccc;margin-top:4px" />
    </div>
    <div>
      <label class="small" style="font-weight:700">Volume/Peso</label>
      <input id="newTamVolume" placeholder="Ex: 700ml" style="width:100px;padding:8px;border-radius:8px;border:1px solid #ccc;margin-top:4px" />
    </div>
    <button type="button" class="btn-yellow" id="btnAddTam" style="padding:8px 18px">+ Adicionar</button>
  </div>`;
  produtosContent.innerHTML = html;

  produtosContent.querySelectorAll('[data-act="edit-tam"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const idx = Number(btn.getAttribute('data-idx'));
      const t = productsCatalog.tamanhos[idx];
      const newName = prompt('Novo nome do tamanho:', t.name);
      if(!newName || !newName.trim()) return;
      t.name = newName.trim();
      const newVol = prompt('Volume/Peso (opcional):', t.volume||'');
      if(newVol !== null) t.volume = newVol.trim();
      saveProductsCatalog(); refreshAllProductSelects(); renderProdutosTamanhos();
    });
  });
  produtosContent.querySelectorAll('[data-act="toggle-tam"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const idx = Number(btn.getAttribute('data-idx'));
      productsCatalog.tamanhos[idx].active = !productsCatalog.tamanhos[idx].active;
      saveProductsCatalog(); refreshAllProductSelects(); renderProdutosTamanhos();
    });
  });
  produtosContent.querySelectorAll('[data-act="del-tam"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const idx = Number(btn.getAttribute('data-idx'));
      if(!confirm('Excluir tamanho "'+productsCatalog.tamanhos[idx].name+'"?')) return;
      productsCatalog.tamanhos.splice(idx,1);
      saveProductsCatalog(); refreshAllProductSelects(); renderProdutosTamanhos();
    });
  });
  document.getElementById('btnAddTam')?.addEventListener('click', ()=>{
    const name = (document.getElementById('newTamName')?.value||'').trim();
    const volume = (document.getElementById('newTamVolume')?.value||'').trim();
    if(!name) return alert('Digite o nome do tamanho');
    if(productsCatalog.tamanhos.find(t=>t.name.toLowerCase()===name.toLowerCase())) return alert('Tamanho já existe');
    const id = 't-' + name.toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'') + '-' + Date.now();
    productsCatalog.tamanhos.push({id, name, volume, active:true});
    saveProductsCatalog(); refreshAllProductSelects(); renderProdutosTamanhos();
    document.getElementById('newTamName').value = '';
    document.getElementById('newTamVolume').value = '';
  });
}

/* ---- PREÇOS ---- */
function renderProdutosPrecos(){
  const sabores  = productsCatalog.sabores.filter(s=>s.active);
  const tamanhos = productsCatalog.tamanhos.filter(t=>t.active);

  // Monta lista de locais disponíveis (global + por local)
  const localOpts = [{ id:'', name:'(Preço global — todos os locais)' }];
  if(typeof locations !== 'undefined'){
    locations.forEach(l=>localOpts.push({id:l.id, name:l.name}));
  }

  const selLocId = produtosContent.__selLocId || '';

  let html = `<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap">
    <label class="small" style="font-weight:700">Localidade:</label>
    <select id="precosLocSelect" style="padding:7px 12px;border-radius:8px;border:1px solid #ccc;font-weight:700">
      ${localOpts.map(l=>`<option value="${l.id}"${l.id===selLocId?' selected':''}>${l.name}</option>`).join('')}
    </select>
    <span class="small muted">Selecione a localidade para ver/editar os preços</span>
  </div>
  <div style="overflow:auto">
  <table style="width:100%;border-collapse:collapse;min-width:400px">
    <thead><tr>
      <th style="padding:10px;background:#012b29;color:#f2efeb;text-align:left">Sabor</th>
      ${tamanhos.map(t=>`<th style="padding:10px;background:#012b29;color:#f2efeb;text-align:center">${t.name}</th>`).join('')}
    </tr></thead>
    <tbody>`;

  sabores.forEach(s=>{
    html += `<tr style="border-bottom:1px solid #f0ebe3">
      <td style="padding:10px;font-weight:700">${s.name}</td>`;
    tamanhos.forEach(t=>{
      let kLocal = selLocId ? `${s.id}||${t.id}||${selLocId}` : null;
      let kGlobal = `${s.id}||${t.id}`;
      let price = kLocal && productsCatalog.precos[kLocal] != null
        ? productsCatalog.precos[kLocal]
        : (productsCatalog.precos[kGlobal] != null ? productsCatalog.precos[kGlobal] : defaultPriceFor(s.name, t.name));
      const key = kLocal || kGlobal;
      html += `<td style="padding:6px;text-align:center">
        <div style="display:flex;align-items:center;gap:4px;justify-content:center">
          <span style="font-size:0.82rem;color:#888">R$</span>
          <input type="number" step="0.01" min="0" value="${Number(price||0).toFixed(2)}"
            data-pkey="${key}"
            style="width:75px;padding:5px;border-radius:6px;border:1.5px solid #e0d9cf;text-align:right;font-weight:700;font-size:0.9rem"
          />
        </div>
      </td>`;
    });
    html += `</tr>`;
  });
  html += `</tbody></table></div>
  <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px">
    <button type="button" class="btn-yellow" id="btnSavePrecos" style="padding:10px 24px">💾 Salvar Preços</button>
  </div>
  <div class="small muted" style="margin-top:8px">💡 Preço global é usado quando não há preço específico para a localidade selecionada. Pedidos sempre consultam primeiro o preço da localidade de venda.</div>`;

  produtosContent.innerHTML = html;
  produtosContent.__selLocId = selLocId;

  document.getElementById('precosLocSelect')?.addEventListener('change', e=>{
    produtosContent.__selLocId = e.target.value;
    renderProdutosPrecos();
  });

  document.getElementById('btnSavePrecos')?.addEventListener('click', ()=>{
    produtosContent.querySelectorAll('input[data-pkey]').forEach(inp=>{
      const key = inp.getAttribute('data-pkey');
      const val = parseFloat(inp.value);
      if(!isNaN(val) && val >= 0) productsCatalog.precos[key] = val;
    });
    saveProductsCatalog();
    const toast = document.createElement('div');
    toast.textContent = '✅ Preços salvos!';
    toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#012b29;color:#f2efeb;padding:12px 24px;border-radius:10px;font-weight:700;z-index:999999;box-shadow:0 4px 16px rgba(0,0,0,0.3)';
    document.body.appendChild(toast);
    setTimeout(()=>toast.remove(), 2000);
  });
}

// Load products catalog from cloud on login
function loadProductsCatalogFromCloud(){
  if(!window.db || !window.auth?.currentUser) return;
  db.collection('meta').doc('products_catalog').get().then(doc=>{
    if(!doc.exists) return;
    const d = doc.data();
    if(d && d.sabores && d.tamanhos){
      productsCatalog = d;
      localStorage.setItem(PRODUCTS_KEY, JSON.stringify(productsCatalog));
      refreshAllProductSelects();
    }
  }).catch(e=>console.error('load products catalog', e));
}
window.__loadProductsCatalogFromCloud = loadProductsCatalogFromCloud;

/* ---------- End of IIFE ---------- */
})();
