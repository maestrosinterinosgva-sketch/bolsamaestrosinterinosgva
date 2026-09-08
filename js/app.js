// js/app.js - Lógica interactiva de búsqueda, cálculo de métricas y visualización por delante y por detrás

let allInterinos = [];
let statsSummary = null;
let currentUser = null;
let currentSpecialty = 'PRI';
let currentTableView = 'ahead'; // 'ahead' | 'behind'
let currentTableFilter = 'all'; // Para 'ahead': 'all' | 'activos' | 'desactivados' | 'no_participat' | 'adjudicados'
let currentBehindFilter = 'spec'; // Para 'behind': 'spec' | 'all_specs'
let currentTableSearch = '';
let currentPage = 1;
const PAGE_SIZE = 25;

const SPECIALTY_NAMES = {
  INF: "Educación Infantil",
  PRI: "Educación Primaria",
  PT: "Pedagogía Terapéutica",
  AL: "Audición y Lenguaje",
  EF: "Educación Física",
  MUS: "Música",
  ING: "Lengua Extranjera: Inglés",
  FRA: "Lengua Extranjera: Francés"
};

// Normalizar texto eliminando acentos, espacios y tolerando variaciones Y/I
function normalizeText(text) {
  if (!text) return "";
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .toUpperCase()
    .replace(/Y/g, "I")
    .replace(/\s+/g, " ")
    .trim();
}

// Helpers seguros para modificar el DOM sin riesgo de errores por elementos ausentes
function safeSetText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = (text !== undefined && text !== null) ? text : "-";
}

function safeSetHTML(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = (html !== undefined && html !== null) ? html : "-";
}


// Inicialización segura
document.addEventListener("DOMContentLoaded", async () => {
  try {
    await loadData();
    setupEventListeners();
  } catch (err) {
    console.error("Error en inicialización:", err);
  }
});

function initStatsUI() {
  if (!statsSummary) return;

  try {
    if (statsSummary.fecha_adjudicacion) {
      safeSetText("headerAdjDate", `Adjudicación ${statsSummary.fecha_adjudicacion} • Maestros Generalitat Valenciana`);
    }

    const totalBolsa = statsSummary.total_participantes_bolsa || statsSummary.total_participantes_bolsa_inicial || 17329;
    const totalAdj = statsSummary.total_adjudicaciones_hoy || 11956;
    
    const elTotalBolsa = document.getElementById("globTotalBolsa");
    if (elTotalBolsa) elTotalBolsa.textContent = totalBolsa.toLocaleString();
    
    const elTotalAdj = document.getElementById("globTotalAdj");
    if (elTotalAdj) elTotalAdj.textContent = totalAdj.toLocaleString();
    
    let plazasTotal = 0;
    if (statsSummary.especialidades) {
      Object.values(statsSummary.especialidades).forEach(sp => {
        plazasTotal += sp.total_plazas_hoy || 0;
      });
    }
    const elTotalPlazas = document.getElementById("globTotalPlazas");
    if (elTotalPlazas) elTotalPlazas.textContent = plazasTotal.toLocaleString();
    
    // Actualizar contadores de las píldoras de especialidad
    if (statsSummary.especialidades) {
      Object.entries(statsSummary.especialidades).forEach(([code, spData]) => {
        const btn = document.querySelector(`.spec-btn[data-spec="${code}"] .spec-count`);
        if (btn) btn.textContent = (spData.total_bolsa || spData.total_convocados_adj || 0).toLocaleString();
      });
    }
  } catch (err) {
    console.error("Error en initStatsUI:", err);
  }
}

async function loadData() {
  // 1. Si ya se cargaron por script tag (funciona con doble clic directo en index.html)
  if (window.ALL_INTERINOS && window.STATS_SUMMARY) {
    allInterinos = window.ALL_INTERINOS;
    statsSummary = window.STATS_SUMMARY;
    initStatsUI();
    console.log(`Cargados ${allInterinos.length} interinos desde variables locales.`);
    return;
  }

  // 2. Si se ejecuta desde un servidor HTTP local
  try {
    const [resData, resStats] = await Promise.all([
      fetch("data/interinos_data.json"),
      fetch("data/stats_summary.json")
    ]);
    allInterinos = await resData.json();
    statsSummary = await resStats.json();
    initStatsUI();
    console.log(`Cargados ${allInterinos.length} interinos vía fetch con éxito.`);
  } catch (err) {
    console.error("Error al cargar datos:", err);
    // Intentar fallback si una variable está disponible
    if (window.ALL_INTERINOS) allInterinos = window.ALL_INTERINOS;
    if (window.STATS_SUMMARY) statsSummary = window.STATS_SUMMARY;
    if (allInterinos.length > 0) initStatsUI();
  }
}

function setupEventListeners() {
  const searchInput = document.getElementById("searchInput");
  const btnClear = document.getElementById("btnClearSearch");
  const autocompleteList = document.getElementById("autocompleteList");
  const specialtySelect = document.getElementById("specialtySelect");
  const specPills = document.querySelectorAll(".spec-btn");
  const btnVerResumen = document.getElementById("btnVerResumenSpecs");
  const btnCloseModal = document.getElementById("btnCloseModal");
  const modalSummary = document.getElementById("modalSummary");

  // Búsqueda con debounce
  let debounceTimeout;
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      const val = e.target.value.trim();
      if (btnClear) btnClear.style.display = val ? "block" : "none";
      clearTimeout(debounceTimeout);
      debounceTimeout = setTimeout(() => {
        handleAutocomplete(val);
      }, 120);
    });

    // Permitir pulsar ENTER para seleccionar directamente el primer resultado
    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const firstItem = document.querySelector(".autocomplete-item");
        if (firstItem) {
          firstItem.click();
        } else {
          const val = searchInput.value.trim();
          if (val) {
            handleAutocomplete(val);
            const item = document.querySelector(".autocomplete-item");
            if (item) item.click();
          }
        }
      }
    });
  }

  if (btnClear) {
    btnClear.addEventListener("click", () => {
      if (searchInput) {
        searchInput.value = "";
        searchInput.focus();
      }
      btnClear.style.display = "none";
      if (autocompleteList) autocompleteList.classList.add("hidden");
    });
  }

  // Selector desplegable de especialidad
  if (specialtySelect) {
    specialtySelect.addEventListener("change", (e) => {
      setSpecialty(e.target.value);
    });
  }

  // Botones de especialidad rápida
  specPills.forEach(btn => {
    btn.addEventListener("click", () => {
      setSpecialty(btn.dataset.spec);
    });
  });

  // Delegación de eventos para especialidades del usuario
  const userSpecsList = document.getElementById("userSpecsList");
  if (userSpecsList) {
    userSpecsList.addEventListener("click", (e) => {
      const btn = e.target.closest(".spec-btn");
      if (btn && btn.dataset.spec) {
        e.preventDefault();
        e.stopPropagation();
        setSpecialty(btn.dataset.spec);
      }
    });
  }

  // Ejemplos clicables del empty state
  document.querySelectorAll(".btn-tag").forEach(btn => {
    btn.addEventListener("click", () => {
      const targetName = btn.dataset.name;
      if (searchInput) {
        searchInput.value = targetName;
        if (btnClear) btnClear.style.display = "block";
      }
      const user = allInterinos.find(u => u.name === targetName || (u.norm_name && u.norm_name.includes(normalizeText(targetName))));
      if (user) selectUser(user);
    });
  });

  // Conmutador principal de vista: Por Delante vs Por Detrás
  const btnViewAhead = document.getElementById("btnViewAhead");
  const btnViewBehind = document.getElementById("btnViewBehind");
  const cardKpiBehind = document.getElementById("cardKpiBehind");

  if (btnViewAhead) {
    btnViewAhead.addEventListener("click", () => switchTableView('ahead'));
  }
  if (btnViewBehind) {
    btnViewBehind.addEventListener("click", () => switchTableView('behind'));
  }
  if (cardKpiBehind) {
    cardKpiBehind.addEventListener("click", () => {
      switchTableView('behind');
      const tbl = document.getElementById("aheadTable");
      if (tbl) tbl.scrollIntoView({ behavior: 'smooth' });
    });
  }

  // Filtros de la tabla (vista Por Delante)
  document.querySelectorAll("#tableFiltersAhead .btn-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll("#tableFiltersAhead .btn-tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      currentTableFilter = tab.dataset.filter;
      currentPage = 1;
      renderCurrentTable();
    });
  });

  // Filtros de la tabla (vista Por Detrás)
  document.querySelectorAll("#tableFiltersBehind .btn-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll("#tableFiltersBehind .btn-tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      currentBehindFilter = tab.dataset.behindFilter;
      currentPage = 1;
      renderCurrentTable();
    });
  });

  // Buscador dentro de la tabla
  const tableSearch = document.getElementById("tableSearch");
  if (tableSearch) {
    tableSearch.addEventListener("input", (e) => {
      currentTableSearch = normalizeText(e.target.value);
      currentPage = 1;
      renderCurrentTable();
    });
  }

  // Paginación
  const btnPrev = document.getElementById("btnPrevPage");
  if (btnPrev) {
    btnPrev.addEventListener("click", () => {
      if (currentPage > 1) {
        currentPage--;
        renderCurrentTable();
      }
    });
  }

  const btnNext = document.getElementById("btnNextPage");
  if (btnNext) {
    btnNext.addEventListener("click", () => {
      currentPage++;
      renderCurrentTable();
    });
  }

  // Modal de Resumen
  if (btnVerResumen) btnVerResumen.addEventListener("click", openSummaryModal);
  if (btnCloseModal) btnCloseModal.addEventListener("click", () => modalSummary?.classList.add("hidden"));
  if (modalSummary) {
    modalSummary.addEventListener("click", (e) => {
      if (e.target === modalSummary) modalSummary.classList.add("hidden");
    });
  }

  // Modal de Conexión en Móvil
  const btnDeviceConnect = document.getElementById("btnDeviceConnect");
  const modalDeviceConnect = document.getElementById("modalDeviceConnect");
  const btnCloseDeviceModal = document.getElementById("btnCloseDeviceModal");
  const btnCopyWifiUrl = document.getElementById("btnCopyWifiUrl");
  const codeDeviceWifiUrl = document.getElementById("deviceWifiUrl");

  if (window.NETWORK_INFO && window.NETWORK_INFO.wifi_url && codeDeviceWifiUrl) {
    codeDeviceWifiUrl.textContent = window.NETWORK_INFO.wifi_url;
  }

  if (btnDeviceConnect && modalDeviceConnect) {
    btnDeviceConnect.addEventListener("click", () => {
      if (codeDeviceWifiUrl) {
        if (window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1" && window.location.protocol.startsWith("http")) {
          codeDeviceWifiUrl.textContent = window.location.origin;
        } else if (window.NETWORK_INFO && window.NETWORK_INFO.wifi_url) {
          codeDeviceWifiUrl.textContent = window.NETWORK_INFO.wifi_url;
        }
      }
      modalDeviceConnect.classList.remove("hidden");
    });
  }

  if (btnCloseDeviceModal && modalDeviceConnect) {
    btnCloseDeviceModal.addEventListener("click", () => {
      modalDeviceConnect.classList.add("hidden");
    });
  }

  if (modalDeviceConnect) {
    modalDeviceConnect.addEventListener("click", (e) => {
      if (e.target === modalDeviceConnect) modalDeviceConnect.classList.add("hidden");
    });
  }

  if (btnCopyWifiUrl && codeDeviceWifiUrl) {
    btnCopyWifiUrl.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(codeDeviceWifiUrl.textContent);
        const originalText = btnCopyWifiUrl.textContent;
        btnCopyWifiUrl.textContent = "✅ ¡Copiado!";
        setTimeout(() => { btnCopyWifiUrl.textContent = originalText; }, 2000);
      } catch (err) {
        const range = document.createRange();
        range.selectNodeContents(codeDeviceWifiUrl);
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(range);
      }
    });
  }

  // Cerrar autocomplete al hacer clic fuera
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".search-input-group") && autocompleteList) {
      autocompleteList.classList.add("hidden");
    }
  });

  // Inicializar banner de consentimiento de cookies y AdSense
  initCookieConsent();
}

function initCookieConsent() {
  const banner = document.getElementById("cookieBanner");
  const btnAccept = document.getElementById("btnAcceptCookies");
  const btnReject = document.getElementById("btnRejectCookies");
  const btnManage = document.getElementById("btnManageCookies");

  if (!banner) return;

  const consent = localStorage.getItem("cookie_consent");
  if (!consent) {
    banner.classList.remove("hidden");
  } else if (consent === "accepted") {
    loadAdSenseAds();
  }

  if (btnAccept) {
    btnAccept.addEventListener("click", () => {
      localStorage.setItem("cookie_consent", "accepted");
      banner.classList.add("hidden");
      loadAdSenseAds();
    });
  }

  if (btnReject) {
    btnReject.addEventListener("click", () => {
      localStorage.setItem("cookie_consent", "rejected");
      banner.classList.add("hidden");
    });
  }

  if (btnManage) {
    btnManage.addEventListener("click", () => {
      banner.classList.remove("hidden");
      banner.scrollIntoView({ behavior: "smooth" });
    });
  }
}

function loadAdSenseAds() {
  try {
    const ads = document.querySelectorAll(".adsbygoogle");
    ads.forEach(() => {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    });
  } catch (err) {
    console.log("AdSense slot inicializado.");
  }
}

function switchTableView(view) {
  currentTableView = view;
  const btnAhead = document.getElementById("btnViewAhead");
  const btnBehind = document.getElementById("btnViewBehind");
  const filtersAhead = document.getElementById("tableFiltersAhead");
  const filtersBehind = document.getElementById("tableFiltersBehind");

  if (btnAhead && btnBehind && filtersAhead && filtersBehind) {
    if (view === 'ahead') {
      btnAhead.classList.add("active");
      btnBehind.classList.remove("active");
      filtersAhead.classList.remove("hidden");
      filtersBehind.classList.add("hidden");
    } else {
      btnAhead.classList.remove("active");
      btnBehind.classList.add("active");
      filtersAhead.classList.add("hidden");
      filtersBehind.classList.remove("hidden");
    }
  }

  currentPage = 1;
  renderCurrentTable();
}

// Autocomplete predictivo compatible con nombres y números
function handleAutocomplete(query) {
  const dropdown = document.getElementById("autocompleteList");
  if (!dropdown) return;

  if (!query || query.length < 2) {
    dropdown.classList.add("hidden");
    dropdown.innerHTML = "";
    return;
  }

  const normQuery = normalizeText(query);
  const queryParts = normQuery.split(" ").filter(p => p.length > 0);
  const isNumber = !isNaN(query.trim()) && query.trim() !== "";
  const queryNum = isNumber ? parseInt(query.trim(), 10) : null;

  // Filtrar interinos
  const matches = [];
  for (let i = 0; i < allInterinos.length; i++) {
    const item = allInterinos[i];
    
    // Búsqueda por número (de adjudicación o de bolsa)
    if (queryNum !== null) {
      if (item.adj_order === queryNum || item.bolsa_num === queryNum || item.num === queryNum) {
        matches.push(item);
        if (matches.length >= 10) break;
        continue;
      }
    }

    // Búsqueda por palabras en el nombre con normalización tolerante Y/I
    const norm = normalizeText(item.norm_name || item.name || "");
    const allMatch = queryParts.every(part => norm.includes(part));
    if (allMatch) {
      matches.push(item);
      if (matches.length >= 10) break;
    }
  }

  if (matches.length === 0) {
    dropdown.innerHTML = `<div class="autocomplete-item"><span class="item-meta">No se encontraron resultados para "${query}"</span></div>`;
    dropdown.classList.remove("hidden");
    return;
  }

  dropdown.innerHTML = matches.map((item, idx) => {
    const adjText = item.adj_order ? `Nº Adjudicación: #${item.adj_order}` : "No convocado hoy";
    const bolsaText = item.bolsa_num ? `Bolsa inicial: #${item.bolsa_num}` : "";
    const metaParts = [adjText, bolsaText, item.services || "AMB SERVEIS", `Estado: <strong>${item.status}</strong>`].filter(Boolean);
    
    return `
      <div class="autocomplete-item" data-idx="${idx}">
        <div class="item-main">
          <span class="item-name">${highlightMatch(item.name, queryParts)}</span>
          <span class="item-meta">${metaParts.join(" &bull; ")}</span>
        </div>
        <div class="item-specs">
          ${(item.specialties || []).map(sp => `
            <button type="button" class="spec-badge-xs btn-spec-pick ${sp === currentSpecialty ? 'active' : ''}" data-idx="${idx}" data-spec="${sp}" title="Ver en ${sp}">
              ${sp}
            </button>
          `).join("")}
        </div>
      </div>
    `;
  }).join("");

  dropdown.querySelectorAll(".autocomplete-item").forEach(el => {
    el.addEventListener("click", (e) => {
      const idx = parseInt(el.dataset.idx, 10);
      const user = matches[idx];
      if (!user) return;

      const pickBtn = e.target.closest(".btn-spec-pick");
      const targetSpec = pickBtn ? pickBtn.dataset.spec : null;

      selectUser(user, targetSpec);
      dropdown.classList.add("hidden");
      const searchInput = document.getElementById("searchInput");
      if (searchInput) searchInput.value = user.name;
    });
  });

  dropdown.classList.remove("hidden");
}

function highlightMatch(text, parts) {
  if (!text) return "";
  let result = text;
  parts.forEach(part => {
    if (!part) return;
    let pat = "";
    for (let i = 0; i < part.length; i++) {
      const ch = part[i];
      if (ch === 'I' || ch === 'Y') {
        pat += "[IYÍÍyíi]";
      } else {
        pat += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      }
    }
    try {
      const regex = new RegExp(`(${pat})`, 'gi');
      result = result.replace(regex, "<strong>$1</strong>");
    } catch (e) {
      result = result.replace(new RegExp(`(${part})`, 'gi'), "<strong>$1</strong>");
    }
  });
  return result;
}

// Seleccionar usuario (con especialidad objetivo opcional)
function selectUser(user, targetSpec = null) {
  currentUser = user;
  const emptyState = document.getElementById("emptyState");
  const resultsSection = document.getElementById("resultsSection");
  if (emptyState) emptyState.classList.add("hidden");
  if (resultsSection) resultsSection.classList.remove("hidden");

  // Si se ha seleccionado una especialidad explícita y el usuario la tiene, aplicarla
  if (targetSpec && currentUser.specialties && currentUser.specialties.includes(targetSpec)) {
    currentSpecialty = targetSpec;
  } else if (currentUser.specialties && currentUser.specialties.length > 0) {
    // Si la especialidad actual no pertenece al usuario, seleccionar la primera disponible
    if (!currentUser.specialties.includes(currentSpecialty)) {
      currentSpecialty = currentUser.specialties[0];
    }
  }

  updateSpecialtyUI();
  renderUserData();
}

function setSpecialty(sp) {
  if (!sp) return;
  currentSpecialty = sp;
  updateSpecialtyUI();
  if (currentUser) {
    renderUserData();
  }
}
window.setSpecialty = setSpecialty;

function updateSpecialtyUI() {
  const sel = document.getElementById("specialtySelect");
  if (sel) sel.value = currentSpecialty;

  // Actualizar botones de especialidad en selector superior
  document.querySelectorAll("#specialtyPills .spec-btn").forEach(btn => {
    if (btn.dataset.spec === currentSpecialty) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });

  // Actualizar botones de especialidad en perfil de usuario
  document.querySelectorAll("#userSpecsList .spec-btn").forEach(btn => {
    if (btn.dataset.spec === currentSpecialty) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });
}

// Renderizado principal
function renderUserData() {
  if (!currentUser) return;

  // 1. Cabecera del perfil
  safeSetText("userName", currentUser.name);
  
  const elAdjOrder = document.getElementById("userAdjOrder");
  if (elAdjOrder) {
    elAdjOrder.textContent = currentUser.adj_order ? `#${currentUser.adj_order}` : "No convocado";
  }

  const elBolsaNum = document.getElementById("userBolsaNum");
  const elBolsaTag = document.getElementById("userBolsaTag");
  if (currentUser.bolsa_num) {
    if (elBolsaNum) elBolsaNum.textContent = `#${currentUser.bolsa_num}`;
    if (elBolsaTag) elBolsaTag.style.display = "inline-flex";
  } else {
    if (elBolsaTag) elBolsaTag.style.display = "none";
  }

  const elServices = document.getElementById("userServices");
  if (elServices) elServices.textContent = currentUser.services || "AMB SERVEIS";

  const statusBadge = document.getElementById("userStatusBadge");
  if (statusBadge) {
    statusBadge.textContent = currentUser.status;
    statusBadge.className = "tag tag-status " + getStatusClass(currentUser.status);
  }

  // Especialidades del usuario con botones interactivos y claros
  const specsList = document.getElementById("userSpecsList");
  if (specsList) {
    const specs = currentUser.specialties || [];
    if (specs.length > 1) {
      specsList.innerHTML = `
        <div class="specs-select-prompt">
          <span class="prompt-icon">👉</span>
          <strong>Especialidades habilitadas</strong> (pulsa en cualquiera para ver tus resultados en ella):
        </div>
        <div class="specs-buttons-wrap">
          ${specs.map(sp => {
            const isCurrent = sp === currentSpecialty;
            const isDeactivated = currentUser.specialties_deactivated && currentUser.specialties_deactivated.includes(sp);
            return `
              <button type="button" class="spec-btn ${isCurrent ? 'active' : ''}" data-spec="${sp}" onclick="setSpecialty('${sp}')">
                <span class="spec-code">${sp}</span> &bull; ${SPECIALTY_NAMES[sp] || sp}
                ${isDeactivated ? '<span class="tag-deact-sm">(Desactivada)</span>' : ''}
              </button>
            `;
          }).join("")}
        </div>
      `;
    } else if (specs.length === 1) {
      const sp = specs[0];
      const isDeactivated = currentUser.specialties_deactivated && currentUser.specialties_deactivated.includes(sp);
      specsList.innerHTML = `
        <div class="specs-buttons-wrap">
          <button type="button" class="spec-btn active" data-spec="${sp}" onclick="setSpecialty('${sp}')">
            <span class="spec-code">${sp}</span> &bull; ${SPECIALTY_NAMES[sp] || sp}
            ${isDeactivated ? '<span class="tag-deact-sm">(Desactivada)</span>' : ''}
          </button>
        </div>
      `;
    } else {
      specsList.innerHTML = `<span class="tag tag-services">Sin especialidades registradas</span>`;
    }
  }

  // Banner de Adjudicado
  const adjBox = document.getElementById("adjudicadoBox");
  if (adjBox) {
    if (currentUser.status === "Adjudicat" && currentUser.plaza) {
      adjBox.classList.remove("hidden");
      safeSetText("adjCentro", currentUser.plaza.center || "No especificado");
      safeSetText("adjEspecialidad", `${currentUser.plaza.spec_code} - ${currentUser.plaza.spec_name}`);
      safeSetText("adjTipoVacante", currentUser.plaza.type || "VACANT");
      safeSetText("adjJornada", currentUser.plaza.jornada || "Completa");
      safeSetText("adjCodigoPlaza", currentUser.plaza.code || "-");
    } else {
      adjBox.classList.add("hidden");
    }
  }

  // 2. Cálculos de la Especialidad Seleccionada ESTRICTAMENTE SOBRE ADJUDICACIONES309
  // Filtramos solo los participantes de adjudicaciones309 que tienen esta especialidad
  const specMembers = allInterinos.filter(p => (p.in_adjudicacion || p.adj_order) && p.specialties && p.specialties.includes(currentSpecialty));
  specMembers.sort((a, b) => (a.adj_order || 0) - (b.adj_order || 0));

  const userIdx = specMembers.findIndex(p => (currentUser.adj_order && p.adj_order === currentUser.adj_order) || p.name === currentUser.name);

  const specName = SPECIALTY_NAMES[currentSpecialty] || currentSpecialty;
  safeSetText("posSpecLabel", specName);
  safeSetText("tableSpecName", specName);
  safeSetText("cutoffSpecName", specName);

  if (userIdx === -1) {
    // El usuario no figura en la adjudicación para esta especialidad
    safeSetText("userSpecPos", "-");
    safeSetText("userSpecTotal", specMembers.length.toLocaleString());
    safeSetText("kpiPuestosFaltan", "-");
    safeSetText("kpiPuestosFaltanDesc", currentUser.specialties && currentUser.specialties.includes(currentSpecialty) 
      ? "No convocado/a en esta adjudicación de hoy" 
      : "No habilitado en esta especialidad");
    safeSetText("kpiDesactivadas", "-");
    safeSetText("kpiNoParticipat", "-");
    safeSetText("kpiAdjudicadas", "-");
    safeSetText("kpiAdjudicadasBehind", "-");
    safeSetText("distTotalAhead", "0");
    
    // Valores del panel de 5 datos
    safeSetText("summary5UserName", currentUser.name);
    safeSetText("summary5SpecName", specName);
    safeSetHTML("valPosicionActual", currentUser.adj_order ? `Nº <strong>#${currentUser.adj_order}</strong>` : `Bolsa <strong>#${currentUser.bolsa_num || '-'}</strong>`);
    safeSetText("subPosicionActual", "No figura convocado en esta adjudicación para " + specName);
    safeSetText("valTotalPorDelante", "-");
    safeSetText("subTotalPorDelante", "-");
    safeSetText("valPosicionDepurada", "-");
    safeSetText("subPosicionDepurada", "No disponible");
    safeSetText("valUltimoAdjudicado", "-");
    safeSetText("subUltimoAdjudicado", "-");
    safeSetText("valDiferenciaCorte", "-");
    safeSetText("subDiferenciaCorte", "-");

    const specStats = statsSummary?.especialidades ? statsSummary.especialidades[currentSpecialty] : null;
    renderCutoffInfo(specStats, currentUser);
    window.currentAheadList = [];
    window.currentBehindList = [];
    renderCurrentTable();
    return;
  }

  const userPos = userIdx + 1;
  safeSetText("userSpecPos", userPos.toLocaleString());
  safeSetText("userSpecTotal", specMembers.length.toLocaleString());

  // Personas por delante y por detrás en esta adjudicación
  const ahead = specMembers.slice(0, userIdx);
  const behind = specMembers.slice(userIdx + 1);

  // Clasificación de personas por delante en adjudicaciones309
  const desactivadosAhead = ahead.filter(p => 
    p.status === "Desactivat" || 
    (p.specialties_deactivated && p.specialties_deactivated.includes(currentSpecialty))
  );
  const noParticipatAhead = ahead.filter(p => p.status === "No ha participat");
  const adjudicadosAhead = ahead.filter(p => p.status === "Adjudicat");
  const activosAhead = ahead.filter(p => p.status === "Ha participat" || p.status === "No adjudicat");
  const noConvocatsAhead = ahead.filter(p => 
    !["Desactivat", "No ha participat", "Adjudicat", "Ha participat", "No adjudicat"].includes(p.status)
  );

  // Clasificación de adjudicados por detrás en adjudicaciones309
  const behindAdjudicadosSpec = behind.filter(p => 
    p.status === "Adjudicat" && p.plaza && p.plaza.spec_acronym === currentSpecialty
  );
  const behindAdjudicadosAll = behind.filter(p => p.status === "Adjudicat");

  // =========================================================================
  // 5 DATOS CLAVE DE ADJUDICACIÓN SOLICITADOS (BASADOS EN ADJUDICACIONES309)
  // =========================================================================
  safeSetText("summary5UserName", currentUser.name);
  safeSetText("summary5SpecName", specName);

  // DATO 1: POSICIÓN EN LA ESPECIALIDAD SELECCIONADA
  const posAdjNum = currentUser.adj_order || currentUser.num;
  safeSetHTML("valPosicionActual", `Puesto <strong>#${userPos.toLocaleString()}</strong> <small style="font-size:0.85rem; font-weight:600; color:var(--slate-500);">de ${specMembers.length.toLocaleString()}</small>`);
  const bolsaInicialText = currentUser.bolsa_num ? ` &bull; Bolsa inicial: #${currentUser.bolsa_num.toLocaleString()}` : "";
  safeSetHTML("subPosicionActual", `En <strong>${specName}</strong> &bull; Nº Adjudicación general: <strong>#${posAdjNum.toLocaleString()}</strong>${bolsaInicialText}`);

  // DATO 2: TOTAL INTERINOS DE LA ESPECIALIDAD POR DELANTE
  safeSetHTML("valTotalPorDelante", `<strong>${ahead.length.toLocaleString()}</strong> personas`);
  safeSetHTML("subTotalPorDelante", `Convocados antes que tú en ${specName} en esta adjudicación`);

  // DATO 3: POSICIÓN SEGÚN ESPECIALIDAD (QUITANDO ADJUDICADOS Y DESACTIVADOS)
  const aheadLimpios = ahead.filter(p => 
    p.status !== "Adjudicat" && 
    p.status !== "Desactivat" && 
    !(p.specialties_deactivated && p.specialties_deactivated.includes(currentSpecialty))
  );
  const posDepurada = aheadLimpios.length + 1;
  const allLimpios = specMembers.filter(p => 
    p.status !== "Adjudicat" && 
    p.status !== "Desactivat" && 
    !(p.specialties_deactivated && p.specialties_deactivated.includes(currentSpecialty))
  );
  safeSetHTML("valPosicionDepurada", `Puesto <strong>#${posDepurada.toLocaleString()}</strong>`);
  safeSetHTML("subPosicionDepurada", `De <strong>${allLimpios.length.toLocaleString()}</strong> interinos disponibles sin plaza ni desactivados en esta convocatoria`);

  // DATO 4: ÚLTIMO ADJUDICADO DE LA BOLSA EN ESTA ESPECIALIDAD
  const adjudicadosEnSp = specMembers.filter(p => 
    p.status === "Adjudicat" && p.plaza && p.plaza.spec_acronym === currentSpecialty
  );
  const ultimoAdj = adjudicadosEnSp.length > 0 ? adjudicadosEnSp[adjudicadosEnSp.length - 1] : null;

  if (ultimoAdj) {
    const idxUlt = specMembers.indexOf(ultimoAdj);
    const posEspUlt = idxUlt + 1;
    safeSetHTML("valUltimoAdjudicado", `<strong>${ultimoAdj.name}</strong>`);
    const ultBolsaText = ultimoAdj.bolsa_num ? ` (Bolsa inicial: #${ultimoAdj.bolsa_num.toLocaleString()})` : "";
    safeSetHTML("subUltimoAdjudicado", `Nº Adjudicación <strong>#${(ultimoAdj.adj_order || ultimoAdj.num).toLocaleString()}</strong>${ultBolsaText} &bull; Puesto #${posEspUlt.toLocaleString()} en ${specName} &bull; ${ultimoAdj.plaza.center || ''}`);

    // DATO 5: PUESTOS DE DIFERENCIA CON EL ÚLTIMO ADJUDICADO
    const diffEsp = userPos - posEspUlt;
    const diffAdj = posAdjNum - (ultimoAdj.adj_order || ultimoAdj.num);

    const elDiff = document.getElementById("valDiferenciaCorte");
    const elSubDiff = document.getElementById("subDiferenciaCorte");

    if (diffEsp < 0) {
      safeSetHTML("valDiferenciaCorte", `<span class="diff-tag-ahead">⬆️ ${Math.abs(diffEsp).toLocaleString()} puestos POR DELANTE</span>`);
      safeSetHTML("subDiferenciaCorte", `En ${specName} (${Math.abs(diffAdj).toLocaleString()} números en la lista de adjudicaciones por delante del corte)`);
    } else if (diffEsp > 0) {
      safeSetHTML("valDiferenciaCorte", `<span class="diff-tag-behind">⬇️ ${diffEsp.toLocaleString()} puestos POR DETRÁS</span>`);
      safeSetHTML("subDiferenciaCorte", `En ${specName} (${diffAdj.toLocaleString()} números en la lista de adjudicaciones por detrás del corte)`);
    } else {
      safeSetHTML("valDiferenciaCorte", `<span class="diff-tag-same">🎯 Eres el último adjudicado</span>`);
      safeSetHTML("subDiferenciaCorte", `Tu nombramiento marca el corte de hoy en ${specName}`);
    }
  } else {
    safeSetText("valUltimoAdjudicado", "Sin adjudicaciones");
    safeSetText("subUltimoAdjudicado", "No hubo plazas hoy");
    safeSetText("valDiferenciaCorte", "-");
    safeSetText("subDiferenciaCorte", "-");
  }

  // 3. KPI Cards
  const kpiPuestos = document.getElementById("kpiPuestosFaltan");
  const kpiPuestosDesc = document.getElementById("kpiPuestosFaltanDesc");

  if (currentUser.status === "Adjudicat") {
    if (kpiPuestos) {
      kpiPuestos.textContent = "¡Nombrado/a!";
      kpiPuestos.style.fontSize = "1.7rem";
    }
    if (kpiPuestosDesc) kpiPuestosDesc.textContent = "Has obtenido plaza en esta convocatoria";
  } else if (currentUser.status === "Desactivat") {
    if (kpiPuestos) {
      kpiPuestos.textContent = `${activosAhead.length + 1}`;
      kpiPuestos.style.fontSize = "";
    }
    if (kpiPuestosDesc) kpiPuestosDesc.textContent = "Estás desactivado/a. Activos compitiendo por delante si te activas.";
  } else {
    if (kpiPuestos) {
      kpiPuestos.textContent = `${activosAhead.length + 1}`;
      kpiPuestos.style.fontSize = "";
    }
    if (kpiPuestosDesc) kpiPuestosDesc.textContent = `${activosAhead.length} personas activas compitiendo por delante`;
  }

  safeSetText("kpiDesactivadas", desactivadosAhead.length.toLocaleString());
  const pctDes = ahead.length > 0 ? ((desactivadosAhead.length / ahead.length) * 100).toFixed(1) : "0";
  safeSetText("kpiDesactivadasPct", `${pctDes}% de los convocados por delante`);

  safeSetText("kpiNoParticipat", noParticipatAhead.length.toLocaleString());
  safeSetText("kpiAdjudicadas", adjudicadosAhead.length.toLocaleString());

  // KPI Adjudicados por detrás
  safeSetText("kpiAdjudicadasBehind", behindAdjudicadosSpec.length.toLocaleString());
  safeSetText("kpiAdjudicadasBehindDesc", `${behindAdjudicadosAll.length.toLocaleString()} en cualquier especialidad`);

  // 4. Barra de Distribución Visual
  safeSetText("distTotalAhead", ahead.length.toLocaleString());
  const totalA = ahead.length || 1;
  const pAdj = (adjudicadosAhead.length / totalA) * 100;
  const pAct = (activosAhead.length / totalA) * 100;
  const pDes = (desactivadosAhead.length / totalA) * 100;
  const pNoP = (noParticipatAhead.length / totalA) * 100;
  const pNoC = (noConvocatsAhead.length / totalA) * 100;

  const elBarAdj = document.getElementById("barAdjudicados");
  if (elBarAdj) elBarAdj.style.width = `${pAdj}%`;
  const elBarAct = document.getElementById("barActivos");
  if (elBarAct) elBarAct.style.width = `${pAct}%`;
  const elBarDes = document.getElementById("barDesactivados");
  if (elBarDes) elBarDes.style.width = `${pDes}%`;
  const elBarNoP = document.getElementById("barNoParticipat");
  if (elBarNoP) elBarNoP.style.width = `${pNoP}%`;
  const elBarNoC = document.getElementById("barNoConvocats");
  if (elBarNoC) elBarNoC.style.width = `${pNoC}%`;

  safeSetText("legendAdjVal", adjudicadosAhead.length);
  safeSetText("legendActVal", activosAhead.length);
  safeSetText("legendDesVal", desactivadosAhead.length);
  safeSetText("legendNoPartVal", noParticipatAhead.length);
  safeSetText("legendOtrosVal", noConvocatsAhead.length);

  // 5. Corte del último adjudicado en la especialidad
  const specStats = statsSummary?.especialidades ? statsSummary.especialidades[currentSpecialty] : null;
  renderCutoffInfo(specStats, currentUser);

  // 6. Contadores de las pestañas
  safeSetText("countViewAhead", ahead.length.toLocaleString());
  safeSetText("countViewBehind", behindAdjudicadosSpec.length.toLocaleString());
  safeSetText("countBehindSpec", behindAdjudicadosSpec.length.toLocaleString());
  safeSetText("countBehindAll", behindAdjudicadosAll.length.toLocaleString());

  safeSetText("countAll", ahead.length);
  safeSetText("countActivos", activosAhead.length);
  safeSetText("countDesactivados", desactivadosAhead.length);
  safeSetText("countNoPart", noParticipatAhead.length);
  safeSetText("countAdjudicados", adjudicadosAhead.length);

  // Guardar listas en memoria
  window.currentAheadList = ahead.map((p, i) => ({
    ...p,
    spec_position: i + 1
  }));

  window.currentBehindList = behind.map((p, i) => ({
    ...p,
    spec_position: userIdx + 1 + (i + 1),
    dist_bolsa: (p.bolsa_num && currentUser.bolsa_num) ? p.bolsa_num - currentUser.bolsa_num : (p.num - currentUser.num),
    dist_adj: (p.adj_order || p.num) - (currentUser.adj_order || currentUser.num),
    dist_spec: i + 1
  })).filter(p => p.status === "Adjudicat");

  currentPage = 1;
  renderCurrentTable();
}

function renderCutoffInfo(specStats, user) {
  const specName = SPECIALTY_NAMES[currentSpecialty] || currentSpecialty;
  safeSetText("cutoffSpecName", specName);

  if (!specStats || !specStats.ultimo_adjudicado) {
    safeSetText("cutoffName", "Sin datos de corte");
    safeSetText("cutoffBolsa", "-");
    safeSetText("cutoffOrdenAdj", "-");
    safeSetText("cutoffCentro", "-");
    safeSetText("cutoffDistanceBadge", "");
    return;
  }

  const ult = specStats.ultimo_adjudicado;
  safeSetText("cutoffName", ult.name || "-");
  safeSetText("cutoffBolsa", ult.bolsa_num ? `#${ult.bolsa_num.toLocaleString()}` : "-");
  safeSetText("cutoffOrdenAdj", ult.adj_order ? `#${ult.adj_order.toLocaleString()}` : "-");
  safeSetText("cutoffCentro", ult.centro || "-");

  const badge = document.getElementById("cutoffDistanceBadge");
  if (badge) {
    if (user && user.adj_order && ult.adj_order) {
      if (user.adj_order <= ult.adj_order) {
        badge.textContent = "Estás dentro del rango de corte de hoy";
        badge.style.backgroundColor = "#ecfdf5";
        badge.style.color = "#065f46";
      } else {
        const diff = user.adj_order - ult.adj_order;
        badge.textContent = `A ${diff.toLocaleString()} números de adjudicación del corte`;
        badge.style.backgroundColor = "#eff6ff";
        badge.style.color = "#1e40af";
      }
    } else {
      badge.textContent = "-";
      badge.style.backgroundColor = "";
      badge.style.color = "";
    }
  }
}

function renderCurrentTable() {
  const thead = document.getElementById("tableHead");
  const tbody = document.getElementById("aheadTableBody");
  const mainTitle = document.getElementById("tableMainTitle");
  const subtitle = document.getElementById("tableSubtitle");
  const specName = SPECIALTY_NAMES[currentSpecialty] || currentSpecialty;

  if (currentTableView === 'ahead') {
    // Vista: Aspirantes por Delante
    if (mainTitle) mainTitle.innerHTML = `Listado de aspirantes por delante en <span id="tableSpecName">${specName}</span>`;
    
    let filtered = window.currentAheadList || [];
    if (currentTableFilter === "activos") {
      filtered = filtered.filter(p => p.status === "Ha participat" || p.status === "No adjudicat");
    } else if (currentTableFilter === "desactivados") {
      filtered = filtered.filter(p => p.status === "Desactivat" || (p.specialties_deactivated && p.specialties_deactivated.includes(currentSpecialty)));
    } else if (currentTableFilter === "no_participat") {
      filtered = filtered.filter(p => p.status === "No ha participat");
    } else if (currentTableFilter === "adjudicados") {
      filtered = filtered.filter(p => p.status === "Adjudicat");
    }

    if (currentTableSearch) {
      filtered = filtered.filter(p => p.norm_name.includes(currentTableSearch) || String(p.adj_order || p.num).includes(currentTableSearch) || String(p.bolsa_num || '').includes(currentTableSearch));
    }

    if (subtitle) subtitle.textContent = `Mostrando convocados antes de tu posición (${filtered.length.toLocaleString()} aspirantes)`;

    if (thead) {
      thead.innerHTML = `
        <tr>
          <th>Puesto Esp.</th>
          <th>Nº Adjudicación</th>
          <th>Nombre y Apellidos</th>
          <th>Servicios / Bolsa</th>
          <th>Estado Adjudicación</th>
          <th>Destino Adjudicado</th>
        </tr>
      `;
    }

    const totalPages = Math.ceil(filtered.length / PAGE_SIZE) || 1;
    currentPage = Math.min(currentPage, totalPages);
    const start = (currentPage - 1) * PAGE_SIZE;
    const pageItems = filtered.slice(start, start + PAGE_SIZE);

    if (tbody) {
      if (pageItems.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 24px; color: var(--slate-400);">No hay aspirantes en este filtro.</td></tr>`;
      } else {
        tbody.innerHTML = pageItems.map(p => `
          <tr>
            <td><strong>#${p.spec_position}</strong></td>
            <td><strong>#${p.adj_order || p.num}</strong></td>
            <td><strong>${p.name}</strong></td>
            <td><small class="tag tag-services">${p.services || 'AMB SERVEIS'}</small>${p.bolsa_num ? `<br><small style="color:var(--slate-500); font-size:0.75rem;">Bolsa #${p.bolsa_num}</small>` : ''}</td>
            <td><span class="tag tag-status ${getStatusClass(p.status)}">${p.status}</span></td>
            <td>${p.plaza ? `<small title="${p.plaza.center}"><strong>${p.plaza.spec_name}</strong> - ${p.plaza.center}</small>` : '<span style="color:var(--slate-400);">-</span>'}</td>
          </tr>
        `).join("");
      }
    }

    safeSetText("pageInfo", `Página ${currentPage} de ${totalPages} (${filtered.length} aspirantes)`);
    const btnPrev = document.getElementById("btnPrevPage");
    if (btnPrev) btnPrev.disabled = currentPage <= 1;
    const btnNext = document.getElementById("btnNextPage");
    if (btnNext) btnNext.disabled = currentPage >= totalPages;

  } else {
    // Vista: Adjudicados por Detrás
    if (mainTitle) mainTitle.innerHTML = `Docentes adjudicados con número posterior a ti en <span id="tableSpecName">${specName}</span>`;

    let filtered = window.currentBehindList || [];
    if (currentBehindFilter === "spec") {
      filtered = filtered.filter(p => p.plaza && p.plaza.spec_acronym === currentSpecialty);
    }

    if (currentTableSearch) {
      filtered = filtered.filter(p => p.norm_name.includes(currentTableSearch) || String(p.adj_order || p.num).includes(currentTableSearch) || String(p.bolsa_num || '').includes(currentTableSearch));
    }

    if (subtitle) subtitle.textContent = `Mostrando docentes con número posterior que han obtenido plaza hoy (${filtered.length.toLocaleString()} adjudicados)`;

    if (thead) {
      thead.innerHTML = `
        <tr>
          <th>Puesto Esp.</th>
          <th>Nº Adjudicación</th>
          <th>Distancia</th>
          <th>Nombre y Apellidos</th>
          <th>Especialidad Plaza</th>
          <th>Centro Adjudicado</th>
          <th>Jornada / Vacante</th>
        </tr>
      `;
    }

    const totalPages = Math.ceil(filtered.length / PAGE_SIZE) || 1;
    currentPage = Math.min(currentPage, totalPages);
    const start = (currentPage - 1) * PAGE_SIZE;
    const pageItems = filtered.slice(start, start + PAGE_SIZE);

    if (tbody) {
      if (pageItems.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 24px; color: var(--slate-400);">No hay adjudicados por detrás en este filtro.</td></tr>`;
      } else {
        tbody.innerHTML = pageItems.map(p => `
          <tr>
            <td><strong>#${p.spec_position}</strong></td>
            <td><strong>#${p.adj_order || p.num}</strong></td>
            <td><span class="tag-dist-behind">+${p.dist_adj || p.dist_bolsa} orden</span></td>
            <td><strong>${p.name}</strong>${p.bolsa_num ? `<br><small style="color:var(--slate-500); font-size:0.75rem;">Bolsa #${p.bolsa_num}</small>` : ''}</td>
            <td><span class="spec-badge-xs">${p.plaza ? p.plaza.spec_code + ' - ' + p.plaza.spec_name : '-'}</span></td>
            <td><small><strong>${p.plaza ? p.plaza.center : '-'}</strong></small></td>
            <td><small>${p.plaza ? p.plaza.jornada + ' &bull; ' + p.plaza.type : '-'}</small></td>
          </tr>
        `).join("");
      }
    }

    safeSetText("pageInfo", `Página ${currentPage} de ${totalPages} (${filtered.length} adjudicados)`);
    const btnPrev = document.getElementById("btnPrevPage");
    if (btnPrev) btnPrev.disabled = currentPage <= 1;
    const btnNext = document.getElementById("btnNextPage");
    if (btnNext) btnNext.disabled = currentPage >= totalPages;
  }
}

function getStatusClass(status) {
  if (status === "Adjudicat") return "status-adjudicat";
  if (status === "Desactivat") return "status-desactivat";
  if (status === "No ha participat") return "status-no-participat";
  if (status === "Ha participat" || status === "No adjudicat") return "status-ha-participat";
  return "status-no-convocat";
}

// Modal de resumen general de cortes
function openSummaryModal() {
  const modal = document.getElementById("modalSummary");
  const tbody = document.getElementById("modalSummaryBody");
  
  if (!statsSummary || !modal || !tbody) return;

  tbody.innerHTML = Object.entries(statsSummary.especialidades).map(([code, data]) => `
    <tr>
      <td><strong>${code}</strong> - ${data.name}</td>
      <td>${(data.total_bolsa || data.total_convocados_adj || 0).toLocaleString()}</td>
      <td><span class="tag status-adjudicat">${data.total_plazas_hoy}</span></td>
      <td>${data.ultimo_adjudicado ? data.ultimo_adjudicado.name : '-'}</td>
      <td><strong>${data.ultimo_adjudicado ? '#' + (data.ultimo_adjudicado.adj_order || data.ultimo_adjudicado.bolsa_num) : '-'}</strong></td>
      <td>${data.total_desactivados.toLocaleString()}</td>
    </tr>
  `).join("");

  modal.classList.remove("hidden");
}
