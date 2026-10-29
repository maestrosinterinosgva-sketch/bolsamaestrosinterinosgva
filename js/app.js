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

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Clasifica la jornada entre entera (completa, 23h, itinerante) o parcial (11,5h, 7,5h, tercio)
function getJornadaType(plaza) {
  if (!plaza || !plaza.jornada) return { type: 'DESCONOCIDA', label: 'No especificada', isParcial: false, raw: '' };
  const jRaw = String(plaza.jornada).trim();
  const j = jRaw.toLowerCase();

  if (j.includes("parcial") || j.includes("11,5") || j.includes("11.5") || j.includes("7,5") || j.includes("7.5") || j.includes("7,667") || j.includes("7.667") || j.includes("9 hora") || (j.includes("hora") && !j.includes("23"))) {
    return {
      type: 'PARCIAL',
      label: 'Jornada parcial',
      shortLabel: 'Parcial',
      isParcial: true,
      raw: jRaw,
      hours: jRaw
    };
  }

  let sub = jRaw;
  if (j === "itinerante") sub = "Itinerante";
  else if (j.includes("23")) sub = "23 horas";
  else if (j.includes("completa")) sub = "Completa";

  return {
    type: 'ENTERA',
    label: 'Jornada entera',
    shortLabel: 'Entera',
    isParcial: false,
    raw: jRaw,
    hours: sub
  };
}

function getJornadaBadgeHTML(plaza) {
  if (!plaza || !plaza.jornada) return '';
  const info = getJornadaType(plaza);
  if (info.isParcial) {
    return `<span class="badge-jornada badge-jornada-parcial" title="Jornada Parcial (${escapeHtml(info.raw)})">⏱️ Parcial (${escapeHtml(info.raw)})</span>`;
  }
  return `<span class="badge-jornada badge-jornada-entera" title="Jornada Entera (${escapeHtml(info.raw)})">⏳ Entera (${escapeHtml(info.hours)})</span>`;
}

function getLanguagesBadgeHTML(idiomas) {
  if (!idiomas || typeof idiomas !== 'object') return '';
  const entries = Object.entries(idiomas);
  if (entries.length === 0) return '';

  return `<div style="display:flex; gap:4px; flex-wrap:wrap; margin-top:3px;">` +
    entries.map(([lang, lvl]) => {
      const lvlUpper = String(lvl).toUpperCase();
      let badgeClass = 'badge-lang-b2';
      if (lvlUpper === 'C1') badgeClass = 'badge-lang-c1';
      else if (lvlUpper === 'C2') badgeClass = 'badge-lang-c2';

      let flag = '🌐';
      let langName = lang;
      if (lang === 'ingles') { flag = '🇬🇧'; langName = 'Inglés'; }
      else if (lang === 'frances') { flag = '🇫🇷'; langName = 'Francés'; }
      else if (lang === 'aleman') { flag = '🇩🇪'; langName = 'Alemán'; }
      else if (lang === 'italiano') { flag = '🇮🇹'; langName = 'Italiano'; }

      return `<span class="badge-lang ${badgeClass}" title="Acreditación Oficial: ${lvlUpper} en ${escapeHtml(langName)}">${flag} ${lvlUpper} ${escapeHtml(langName)}</span>`;
    }).join('') +
    `</div>`;
}

// Comprueba si un docente cumple el requisito lingüístico de inglés (B2, C1, C2 de resoluciones GVA o especialidad ING)
function hasEnglishRequirement(p) {
  if (!p) return false;
  if (p.idiomas && p.idiomas.ingles) {
    const lvl = String(p.idiomas.ingles).toUpperCase();
    if (lvl === 'B2' || lvl === 'C1' || lvl === 'C2') return true;
  }
  if (typeof currentSpecialty !== 'undefined' && currentSpecialty !== 'ING' && Array.isArray(p.specialties) && p.specialties.includes('ING')) {
    return true;
  }
  return false;
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

  // Acceso global para filtrar tabla por requisito de inglés desde el chat
  window.filterByEnglishRequirement = function() {
    const tabIngles = document.querySelector('#tableFiltersAhead .btn-tab[data-filter="ingles"]');
    if (tabIngles) {
      tabIngles.click();
      const tableSec = document.getElementById('aheadTable') || document.getElementById('tableFiltersAhead');
      if (tableSec) tableSec.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Buscador dentro de la tabla (Personas, Puestos y Centros)
  const tableSearch = document.getElementById("tableSearch");
  const btnClearTableSearch = document.getElementById("btnClearTableSearch");
  if (tableSearch) {
    tableSearch.addEventListener("input", (e) => {
      currentTableSearch = normalizeText(e.target.value);
      if (btnClearTableSearch) {
        btnClearTableSearch.classList.toggle("hidden", !e.target.value.trim());
      }
      currentPage = 1;
      renderCurrentTable();
    });
  }
  if (btnClearTableSearch) {
    btnClearTableSearch.addEventListener("click", () => {
      if (tableSearch) {
        tableSearch.value = "";
        currentTableSearch = "";
        btnClearTableSearch.classList.add("hidden");
        currentPage = 1;
        renderCurrentTable();
      }
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

  // Medición de clics en botones de Wood & Print Partners (Google Analytics 4)
  document.addEventListener("click", (e) => {
    const link = e.target.closest('a[href*="woodandprintpartners"]');
    if (!link) return;

    let ubicacion = 'otra';
    if (link.closest('.main-header')) {
      ubicacion = 'cabecera';
    } else if (link.closest('#woodAndPrintPromo')) {
      ubicacion = 'tarjeta_destacada';
    } else if (link.closest('.main-footer')) {
      ubicacion = 'pie_pagina';
    } else if (link.closest('#chatWidget') || link.closest('.chat-card-answer')) {
      ubicacion = 'chat_ia';
    }

    if (typeof window.gtag === 'function') {
      window.gtag('event', 'click_woodandprint', {
        'event_category': 'promocion',
        'event_label': ubicacion,
        'ubicacion_boton': ubicacion,
        'destino': 'instagram'
      });
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

  // Acreditación oficial de lenguas extranjeras (B2, C1, C2)
  const langRow = document.getElementById("userLanguagesRow");
  const langBadges = document.getElementById("userLanguagesBadges");
  if (langRow && langBadges) {
    if (currentUser.idiomas && Object.keys(currentUser.idiomas).length > 0) {
      langRow.style.display = "flex";
      langBadges.innerHTML = getLanguagesBadgeHTML(currentUser.idiomas);
    } else {
      langRow.style.display = "none";
      langBadges.innerHTML = "";
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
      const jInfo = getJornadaType(currentUser.plaza);
      safeSetText("adjJornada", `${jInfo.label} (${jInfo.raw || 'Completa'})`);
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
    window.currentUserSpecPos = null;
    window.currentUserSpecTotal = specMembers.length;
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
    safeSetText("valPosicionIngles", "-");
    safeSetText("subPosicionIngles", "No disponible");
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
  window.currentUserSpecPos = userPos;
  window.currentUserSpecTotal = specMembers.length;
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

  // DATO 3B: POSICIÓN CON REQUISITO DE INGLÉS (QUITANDO ADJUDICADOS, DESACTIVADOS Y SIN INGLÉS)
  const userHasEnglish = hasEnglishRequirement(currentUser);
  const aheadIngles = aheadLimpios.filter(p => hasEnglishRequirement(p));
  const allIngles = allLimpios.filter(p => hasEnglishRequirement(p));
  const posIngles = aheadIngles.length + 1;
  const allAcredB2C1 = allLimpios.filter(p => p.idiomas && p.idiomas.ingles);

  if (userHasEnglish) {
    const userLvl = (currentUser.idiomas && currentUser.idiomas.ingles) 
      ? `🇬🇧 ${currentUser.idiomas.ingles}` 
      : "🇬🇧 Especialista";
    safeSetHTML("valPosicionIngles", `Puesto <strong>#${posIngles.toLocaleString()}</strong> <span class="badge-lang badge-lang-c1" style="font-size:0.75rem; vertical-align:middle; margin-left:6px;">${userLvl}</span>`);
    const extraAcred = (currentSpecialty !== 'ING' && allIngles.length !== allAcredB2C1.length) 
      ? ` (${allAcredB2C1.length} con B2/C1 oficial)` 
      : "";
    safeSetHTML("subPosicionIngles", `De <strong>${allIngles.length.toLocaleString()}</strong> interinos disponibles con requisito de inglés en esta convocatoria${extraAcred}`);
  } else {
    safeSetHTML("valPosicionIngles", `Puesto <strong>#${posIngles.toLocaleString()}*</strong> <span class="tag-deact-sm" style="background:#fef2f2; color:#b91c1c; border:1px solid #fecaca; vertical-align:middle; margin-left:6px;">Sin requisito</span>`);
    const extraAcred = (currentSpecialty !== 'ING' && allIngles.length !== allAcredB2C1.length) 
      ? ` (${allAcredB2C1.length} con B2/C1 oficial)` 
      : "";
    safeSetHTML("subPosicionIngles", `De <strong>${allIngles.length.toLocaleString()}</strong> disponibles con inglés${extraAcred} (*puesto teórico si acreditaras B2/C1; hay ${aheadIngles.length.toLocaleString()} con inglés por delante)`);
  }

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
  safeSetText("countIngles", ahead.filter(p => hasEnglishRequirement(p)).length);
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
  renderUserEvolution(currentSpecialty, user);
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

// Comprueba si un candidato coincide con la búsqueda por persona, puesto, centro o localidad
function matchesTableSearch(p, query) {
  if (!query) return true;

  // 1. Nombre de aspirante y números de orden
  if (p.norm_name && p.norm_name.includes(query)) return true;
  if (p.name && normalizeText(p.name).includes(query)) return true;
  if (String(p.adj_order || p.num || '').includes(query)) return true;
  if (String(p.bolsa_num || '').includes(query)) return true;

  // 2. Estado
  if (p.status && normalizeText(p.status).includes(query)) return true;

  // 3. Puesto y Centro adjudicado (nombre de centro, código oficial, localidad, tipo vacante, especialidad)
  if (p.plaza) {
    if (p.plaza.center && normalizeText(p.plaza.center).includes(query)) return true;
    if (p.plaza.spec_name && normalizeText(p.plaza.spec_name).includes(query)) return true;
    if (p.plaza.spec_acronym && normalizeText(p.plaza.spec_acronym).includes(query)) return true;
    if (p.plaza.tipo_vacante && normalizeText(p.plaza.tipo_vacante).includes(query)) return true;
    if (p.plaza.type && normalizeText(p.plaza.type).includes(query)) return true;
    if (p.plaza.jornada && normalizeText(p.plaza.jornada).includes(query)) return true;
    if (p.plaza.code && String(p.plaza.code).includes(query)) return true;
    if (p.plaza.cod_plaza && String(p.plaza.cod_plaza).includes(query)) return true;

    const jInfo = getJornadaType(p.plaza);
    if (jInfo.isParcial && ("PARCIAL".includes(query) || query.includes("PARCIAL"))) return true;
    if (!jInfo.isParcial && ("ENTERA".includes(query) || "COMPLETA".includes(query) || query.includes("ENTERA") || query.includes("COMPLETA"))) return true;
  }

  // 4. Especialidades del aspirante
  if (Array.isArray(p.specialties)) {
    for (const sp of p.specialties) {
      if (normalizeText(sp).includes(query)) return true;
    }
  }

  // 5. Idiomas acreditados oficialmente (C1, B2, C2, Inglés, Francés, Alemán, Italiano)
  if (p.idiomas_str && normalizeText(p.idiomas_str).includes(query)) return true;
  if (p.idiomas) {
    for (const [lang, lvl] of Object.entries(p.idiomas)) {
      if (normalizeText(lvl).includes(query)) return true;
      if (normalizeText(lang).includes(query)) return true;
    }
  }

  return false;
}

function renderCurrentTable() {
  const thead = document.getElementById("tableHead");
  const tbody = document.getElementById("aheadTableBody");
  const mainTitle = document.getElementById("tableMainTitle");
  const subtitle = document.getElementById("tableSubtitle");

  const specName = SPECIALTY_NAMES[currentSpecialty] || currentSpecialty;

  if (currentTableView === "ahead") {
    // Vista: Aspirantes por Delante
    if (mainTitle) mainTitle.innerHTML = `Listado de aspirantes por delante en <span id="tableSpecName">${specName}</span>`;

    let filtered = window.currentAheadList || [];
    if (currentTableFilter === "activos") {
      filtered = filtered.filter(p => !p.status || p.status === "Actiu" || p.status === "En espera" || p.status === "Disponible");
    } else if (currentTableFilter === "ingles") {
      filtered = filtered.filter(p => hasEnglishRequirement(p));
    } else if (currentTableFilter === "desactivados") {
      filtered = filtered.filter(p => p.status === "Desactivat");
    } else if (currentTableFilter === "no_participat") {
      filtered = filtered.filter(p => p.status === "No ha participat");
    } else if (currentTableFilter === "adjudicados") {
      filtered = filtered.filter(p => p.status === "Adjudicat");
    }

    if (currentTableSearch) {
      filtered = filtered.filter(p => matchesTableSearch(p, currentTableSearch));
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
          <th>Destino Adjudicado y Jornada</th>
        </tr>
      `;
    }

    const totalPages = Math.ceil(filtered.length / PAGE_SIZE) || 1;
    currentPage = Math.min(currentPage, totalPages);
    const start = (currentPage - 1) * PAGE_SIZE;
    const pageItems = filtered.slice(start, start + PAGE_SIZE);

    if (tbody) {
      if (pageItems.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 24px; color: var(--slate-400);">No hay aspirantes que coincidan con la búsqueda.</td></tr>`;
      } else {
        tbody.innerHTML = pageItems.map(p => `
          <tr>
            <td><strong>#${p.spec_position}</strong></td>
            <td><strong>#${p.adj_order || p.num}</strong></td>
            <td>
              <strong>${escapeHtml(p.name)}</strong>
              ${getLanguagesBadgeHTML(p.idiomas)}
            </td>
            <td><small class="tag tag-services">${escapeHtml(p.services || 'AMB SERVEIS')}</small>${p.bolsa_num ? `<br><small style="color:var(--slate-500); font-size:0.75rem;">Bolsa #${p.bolsa_num}</small>` : ''}</td>
            <td><span class="tag tag-status ${getStatusClass(p.status)}">${escapeHtml(p.status)}</span></td>
            <td>
              ${p.plaza ? `
                <div style="display:flex; flex-direction:column; gap:4px;">
                  <small style="line-height:1.35; font-size:0.85rem;" title="${escapeHtml(p.plaza.center)}">
                    <strong>${escapeHtml(p.plaza.center)}</strong>
                  </small>
                  <div style="display:flex; align-items:center; gap:5px; flex-wrap:wrap; margin-top:2px;">
                    <span class="spec-badge-xs">${escapeHtml(p.plaza.spec_acronym || p.plaza.spec_code || '')}</span>
                    ${getJornadaBadgeHTML(p.plaza)}
                    <span class="tag-vacante-sm">${escapeHtml(p.plaza.type || 'VACANT')}</span>
                  </div>
                </div>
              ` : '<span style="color:var(--slate-400);">-</span>'}
            </td>
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
      filtered = filtered.filter(p => matchesTableSearch(p, currentTableSearch));
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
          <th>Tipo de Jornada / Vacante</th>
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
            <td>
              <strong>${escapeHtml(p.name)}</strong>
              ${getLanguagesBadgeHTML(p.idiomas)}
              ${p.bolsa_num ? `<br><small style="color:var(--slate-500); font-size:0.75rem;">Bolsa #${p.bolsa_num}</small>` : ''}
            </td>
            <td><span class="spec-badge-xs">${escapeHtml(p.plaza ? p.plaza.spec_code + ' - ' + p.plaza.spec_name : '-')}</span></td>
            <td><small><strong>${escapeHtml(p.plaza ? p.plaza.center : '-')}</strong></small></td>
            <td>
              ${p.plaza ? `
                <div style="display:flex; flex-direction:column; gap:4px;">
                  ${getJornadaBadgeHTML(p.plaza)}
                  <small style="color:var(--slate-500); font-size:0.75rem;">${escapeHtml(p.plaza.type || 'VACANT')}</small>
                </div>
              ` : '-'}
            </td>
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


// ============================================================================
// Evolución Temporal y Gráfica Histórica de Cortes
// ============================================================================
let currentEvoView = 'chart';
window.currentEvoSeries = [];

function switchEvoView(view) {
  window.currentEvoView = view;
  const chartContainer = document.getElementById("evoChartContainer");
  const tableContainer = document.getElementById("evoTableContainer");
  const btnCombined = document.getElementById("btnEvoCombined");
  const btnChart = document.getElementById("btnEvoChart");
  const btnSpec = document.getElementById("btnEvoSpec");
  const btnTable = document.getElementById("btnEvoTable");

  [btnCombined, btnChart, btnSpec, btnTable].forEach(b => {
    if (b) b.classList.remove("active");
  });

  if (view === "table") {
    if (btnTable) btnTable.classList.add("active");
    if (chartContainer) chartContainer.classList.add("hidden");
    if (tableContainer) tableContainer.classList.remove("hidden");
  } else {
    // view es 'combined', 'chart' o 'spec'
    if (view === "combined" && btnCombined) btnCombined.classList.add("active");
    if (view === "chart" && btnChart) btnChart.classList.add("active");
    if (view === "spec" && btnSpec) btnSpec.classList.add("active");

    if (tableContainer) tableContainer.classList.add("hidden");
    if (chartContainer) chartContainer.classList.remove("hidden");

    window.currentEvoMode = view;
    updateEvoKpis(window.currentEvoMacroSeries, window.currentEvoPersonalSeries, currentUser, view);
    renderEvoSvgChart(window.currentEvoMacroSeries, window.currentEvoPersonalSeries, currentUser, view);
  }
}
window.switchEvoView = switchEvoView;

function updateEvoKpis(macroSeries, personalSeries, user, mode) {
  const specCode = currentSpecialty;
  const specName = SPECIALTY_NAMES[specCode] || specCode;

  // Si hay datos personales de evolución, mostrar KPIs enfocados en su progreso y adjudicación
  if (personalSeries && personalSeries.length > 0 && mode !== "chart") {
    const latest = personalSeries[personalSeries.length - 1];
    const first = personalSeries[0];
    const prev = personalSeries.length >= 2 ? personalSeries[personalSeries.length - 2] : null;

    // KPI 1: Posición Actual en Especialidad
    safeSetText("evoKpiDistance", `#${latest.pos.toLocaleString()}`);
    safeSetText("evoKpiDistanceDesc", `de ${latest.total.toLocaleString()} convocados en ${specName}`);

    // KPI 2: Nº Adjudicación Convocada Hoy
    const adjNum = latest.adj || (user?.adj_order ? user.adj_order : user?.bolsa_num);
    safeSetText("evoKpiSpeed", adjNum ? `#${adjNum.toLocaleString()}` : "Convocado/a");
    safeSetText("evoKpiSpeedDesc", "Tu orden en la convocatoria oficial de hoy");

    // KPI 3: Último Avance
    if (prev) {
      const diff = prev.pos - latest.pos;
      if (diff > 0) {
        safeSetHTML("evoKpiMax", `<span style="color:var(--success)">▲ +${diff.toLocaleString()} puestos</span>`);
        safeSetText("evoKpiMaxDate", `Avanzaste desde #${prev.pos} (${prev.fecha})`);
      } else if (diff === 0) {
        safeSetHTML("evoKpiMax", `<span style="color:var(--slate-600)">= Mismo puesto</span>`);
        safeSetText("evoKpiMaxDate", `Puesto mantenido desde ${prev.fecha}`);
      } else {
        safeSetHTML("evoKpiMax", `<span style="color:#ef4444">▼ ${diff.toLocaleString()} puestos</span>`);
        safeSetText("evoKpiMaxDate", `Variación respecto a ${prev.fecha}`);
      }
    } else {
      safeSetText("evoKpiMax", `#${latest.pos.toLocaleString()}`);
      safeSetText("evoKpiMaxDate", `Fecha: ${latest.fecha}`);
    }

    // KPI 4: Progreso Acumulado
    const totalAdvance = first.pos - latest.pos;
    if (totalAdvance > 0) {
      const pct = ((totalAdvance / first.pos) * 100).toFixed(0);
      safeSetHTML("evoKpiEstimate", `<span style="color:var(--success)">+${totalAdvance.toLocaleString()} puestos</span>`);
      safeSetText("evoKpiEstimateDesc", `Has subido un ${pct}% desde el inicio (#${first.pos} el ${first.fecha})`);
    } else {
      safeSetText("evoKpiEstimate", `Puesto #${latest.pos}`);
      safeSetText("evoKpiEstimateDesc", `Evolución en ${personalSeries.length} convocatorias`);
    }
    return;
  }

  // Modo Macro (Solo Corte general)
  const validPoints = (macroSeries || []).filter(p => p.corte_num !== null && p.corte_num > 0);
  if (validPoints.length === 0) {
    safeSetText("evoKpiDistance", "-");
    safeSetText("evoKpiSpeed", "-");
    safeSetText("evoKpiMax", "-");
    safeSetText("evoKpiEstimate", "-");
    return;
  }

  const latestPoint = validPoints[validPoints.length - 1];
  const latestCut = latestPoint.corte_num;
  const cutsOnly = validPoints.map(p => p.corte_num);
  const maxCut = Math.max(...cutsOnly);
  const maxCutPoint = validPoints.find(p => p.corte_num === maxCut);

  const totalPlazas = (macroSeries || []).reduce((sum, p) => sum + (p.plazas || 0), 0);
  const avgPlazas = Math.round(totalPlazas / Math.max(1, (macroSeries || []).length));
  const userBolsa = user?.bolsa_num || null;

  if (user && user.status === "Adjudicat") {
    safeSetHTML("evoKpiDistance", `<span style="color:var(--success)">🎉 Adjudicado/a</span>`);
    safeSetText("evoKpiDistanceDesc", "Plaza asignada en esta especialidad");
    safeSetHTML("evoKpiEstimate", `<span style="color:var(--success)">¡En activo!</span>`);
    safeSetText("evoKpiEstimateDesc", "Destino asignado oficialmente");
  } else if (userBolsa && latestCut) {
    const diff = userBolsa - latestCut;
    if (diff <= 0) {
      safeSetHTML("evoKpiDistance", `<span style="color:var(--success)">En rango (${diff.toLocaleString()})</span>`);
      safeSetText("evoKpiDistanceDesc", `Tu puesto #${userBolsa.toLocaleString()} está por delante del corte (#${latestCut.toLocaleString()})`);
      safeSetHTML("evoKpiEstimate", `<span style="color:var(--success)">Inminente</span>`);
      safeSetText("evoKpiEstimateDesc", "Dentro del rango de corte de plazas");
    } else {
      safeSetText("evoKpiDistance", `+${diff.toLocaleString()} puestos`);
      safeSetText("evoKpiDistanceDesc", `Hasta el corte actual (#${latestCut.toLocaleString()})`);
      if (avgPlazas > 0) {
        const estAdjs = Math.ceil(diff / avgPlazas);
        const estWeeks = (estAdjs / 2).toFixed(1);
        safeSetText("evoKpiEstimate", `~${estAdjs} adjudicaciones`);
        safeSetText("evoKpiEstimateDesc", `Aprox. ${estWeeks} semanas (~${avgPlazas} plazas/adj)`);
      } else {
        safeSetText("evoKpiEstimate", "Variable");
        safeSetText("evoKpiEstimateDesc", "A la espera de nuevas plazas");
      }
    }
  } else {
    safeSetText("evoKpiDistance", `#${latestCut.toLocaleString()}`);
    safeSetText("evoKpiDistanceDesc", "Corte oficial de la última adjudicación");
    safeSetText("evoKpiEstimate", `${totalPlazas.toLocaleString()} plazas`);
    safeSetText("evoKpiEstimateDesc", "Total adjudicadas en esta especialidad");
  }

  safeSetText("evoKpiSpeed", `~${avgPlazas} plazas / adj.`);
  safeSetText("evoKpiSpeedDesc", `Total acumulado: ${totalPlazas} plazas`);
  safeSetText("evoKpiMax", `#${maxCut.toLocaleString()}`);
  safeSetText("evoKpiMaxDate", maxCutPoint ? `Alcanzado el ${maxCutPoint.fecha}` : "Curso 2026/27");
}

function renderUserEvolution(specCode, user) {
  const card = document.getElementById("evolutionCard");
  if (!card) return;

  const historico = window.HISTORICO_CORTES || [];
  if (!historico || historico.length === 0) {
    card.style.display = "none";
    return;
  }
  card.style.display = "block";

  const specName = SPECIALTY_NAMES[specCode] || specCode;
  safeSetText("evoSpecName", specName);
  safeSetText("evoValSpecShort", specCode);

  // 1. Extraer serie macro de cortes
  const macroSeries = [];
  historico.forEach(h => {
    const sp = h.especialidades ? h.especialidades[specCode] : null;
    macroSeries.push({
      fecha: h.fecha,
      plazas: sp ? (sp.plazas || 0) : 0,
      corte_num: sp && sp.corte_num ? sp.corte_num : null,
      corte_nombre: sp ? sp.corte_nombre : null,
      activos_espera: sp ? sp.activos_espera : 0,
      convocados: sp ? sp.convocados : 0
    });
  });
  window.currentEvoMacroSeries = macroSeries;
  window.currentEvoSeries = macroSeries; // retrocompatibilidad

  // 2. Extraer serie personal de evolución en la especialidad
  let personalSeries = [];
  if (user && user.evo && user.evo[specCode]) {
    personalSeries = user.evo[specCode].map(entry => ({
      fecha: entry[0],
      adj: entry[1],
      pos: entry[2],
      total: entry[3],
      status: entry[4] || "No adjudicat"
    }));
  }
  window.currentEvoPersonalSeries = personalSeries;

  // 3. User Header Badges
  const userAdj = user?.adj_order || null;
  const userPos = (personalSeries.length > 0) ? personalSeries[personalSeries.length - 1].pos : (window.currentUserSpecPos || null);
  const userTotal = (personalSeries.length > 0) ? personalSeries[personalSeries.length - 1].total : (window.currentUserSpecTotal || null);
  const userBolsa = user?.bolsa_num || null;

  safeSetText("evoValAdj", userAdj ? `#${userAdj.toLocaleString()}` : (user?.in_adjudicacion ? "Convocado/a" : "No convocado hoy"));
  safeSetText("evoValPos", userPos ? `#${userPos.toLocaleString()}${userTotal ? ' de ' + userTotal.toLocaleString() : ''}` : "-");
  safeSetText("evoValBolsa", userBolsa ? `#${userBolsa.toLocaleString()}` : "-");

  // 4. Determinar modo activo:
  // Por defecto 'combined' si hay datos personales (muestra la Línea Azul Y la Línea Verde juntas)
  let activeMode = window.currentEvoMode;
  if (!activeMode || (activeMode === 'combined' && personalSeries.length === 0)) {
    activeMode = (personalSeries.length > 0) ? 'combined' : 'chart';
  }
  window.currentEvoMode = activeMode;

  const btnCombined = document.getElementById("btnEvoCombined");
  const btnChart = document.getElementById("btnEvoChart");
  const btnSpec = document.getElementById("btnEvoSpec");
  const btnTable = document.getElementById("btnEvoTable");
  if (btnCombined) btnCombined.classList.toggle("active", activeMode === "combined");
  if (btnChart) btnChart.classList.toggle("active", activeMode === "chart");
  if (btnSpec) btnSpec.classList.toggle("active", activeMode === "spec");
  if (btnTable) btnTable.classList.toggle("active", activeMode === "table");

  // Actualizar KPIs
  updateEvoKpis(macroSeries, personalSeries, user, activeMode);

  // Renderizar Gráfica SVG
  renderEvoSvgChart(macroSeries, personalSeries, user, activeMode);

  // Renderizar Tabla Histórica
  renderEvoTable(macroSeries, personalSeries, user);
}
window.renderUserEvolution = renderUserEvolution;

function renderEvoSvgChart(macroSeries, personalSeries, user, mode) {
  const wrap = document.getElementById("evoSvgWrap");
  if (!wrap) return;

  const userBolsa = user?.bolsa_num || null;
  const userAdj = user?.adj_order || null;
  const specName = SPECIALTY_NAMES[currentSpecialty] || currentSpecialty;

  if (mode === "combined" && (!personalSeries || personalSeries.length === 0)) {
    mode = "chart";
  }

  const svgW = 700;
  const svgH = 240;
  const padLeft = 68;
  const padRight = (mode === "combined" || mode === "spec") ? 64 : 35;
  const padTop = 32;
  const padBottom = 35;
  const plotW = svgW - padLeft - padRight;
  const plotH = svgH - padTop - padBottom;

  const allDates = (macroSeries || []).map(s => s.fecha.slice(0, 5));

  function getXForDate(dateStr) {
    const s = dateStr.slice(0, 5);
    const idx = allDates.indexOf(s);
    if (idx === -1 || allDates.length <= 1) return padLeft + plotW / 2;
    return padLeft + (idx / (allDates.length - 1)) * plotW;
  }

  // -------------------------------------------------------------------------
  // CÁLCULO DE ESCALA MACRO (CORTE DE BOLSA - LÍNEA AZUL)
  // -------------------------------------------------------------------------
  const validMacro = (macroSeries || []).filter(s => s.corte_num !== null && s.corte_num > 0);
  const cuts = validMacro.map(s => s.corte_num);
  let allMacroVals = [...cuts];
  if (userBolsa && userBolsa > 0 && userBolsa <= 35000) {
    allMacroVals.push(userBolsa);
  }
  let minMacroRaw = allMacroVals.length > 0 ? Math.min(...allMacroVals) : 10000;
  let maxMacroRaw = allMacroVals.length > 0 ? Math.max(...allMacroVals) : 16000;
  if (minMacroRaw === maxMacroRaw) {
    minMacroRaw -= 500;
    maxMacroRaw += 500;
  }
  const macroRange = maxMacroRaw - minMacroRaw;
  const macroStep = macroRange > 6000 ? 2000 : (macroRange > 2500 ? 1000 : 500);
  const minMacroY = Math.max(0, Math.floor((minMacroRaw - macroStep * 0.3) / macroStep) * macroStep);
  const maxMacroY = Math.ceil((maxMacroRaw + macroStep * 0.4) / macroStep) * macroStep;

  function getYMacro(val) {
    if (maxMacroY === minMacroY) return padTop + plotH / 2;
    return padTop + plotH - ((val - minMacroY) / (maxMacroY - minMacroY)) * plotH;
  }

  // -------------------------------------------------------------------------
  // CÁLCULO DE ESCALA PERSONAL (PUESTO EN ESPECIALIDAD - LÍNEA VERDE, ESCALA INVERTIDA: #1 ARRIBA)
  // -------------------------------------------------------------------------
  let hasPersonal = personalSeries && personalSeries.length > 0;
  let minPos = 1, maxPos = 1000, topPosVal = 1, bottomPosVal = 1000, posStep = 250;
  if (hasPersonal) {
    const positions = personalSeries.map(p => p.pos);
    minPos = Math.min(...positions);
    maxPos = Math.max(...positions);
    const posRange = maxPos - minPos;
    posStep = posRange > 800 ? 250 : (posRange > 400 ? 100 : (posRange > 150 ? 50 : 25));
    topPosVal = Math.max(1, Math.floor((minPos - posStep * 0.3) / posStep) * posStep);
    bottomPosVal = Math.ceil((maxPos + posStep * 0.4) / posStep) * posStep;
  }

  function getYPersonal(pos) {
    if (bottomPosVal === topPosVal) return padTop + plotH / 2;
    return padTop + ((pos - topPosVal) / (bottomPosVal - topPosVal)) * plotH;
  }

  // -------------------------------------------------------------------------
  // 1. CUADRÍCULA Y EJES Y
  // -------------------------------------------------------------------------
  const numGridLines = Math.min(5, Math.floor((maxMacroY - minMacroY) / macroStep));
  let gridLinesSvg = "";
  for (let i = 0; i <= numGridLines; i++) {
    const val = minMacroY + i * macroStep;
    if (val > maxMacroY) break;
    const y = getYMacro(val);

    // Eje izquierdo azul (Corte de Bolsa)
    let leftAxisLabel = `<text x="${padLeft - 8}" y="${y + 3.5}" fill="#1e40af" font-size="9.5" font-weight="700" text-anchor="end">#${val.toLocaleString()}</text>`;

    // Eje derecho verde (Puesto en especialidad en vista combinada)
    let rightAxisLabel = "";
    if (mode === "combined" && hasPersonal) {
      const posVal = Math.round(topPosVal + (i / numGridLines) * (bottomPosVal - topPosVal));
      rightAxisLabel = `<text x="${padLeft + plotW + 8}" y="${y + 3.5}" fill="#059669" font-size="9.5" font-weight="700" text-anchor="start">#${posVal.toLocaleString()}</text>`;
    }

    gridLinesSvg += `
      <line x1="${padLeft}" y1="${y}" x2="${padLeft + plotW}" y2="${y}" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="3,3" />
      ${leftAxisLabel}
      ${rightAxisLabel}
    `;
  }

  // Si es modo 'spec' exclusivo, poner labels de puesto en la izquierda
  if (mode === "spec" && hasPersonal) {
    gridLinesSvg = "";
    const numSpecLines = Math.min(6, Math.floor((bottomPosVal - topPosVal) / posStep));
    for (let i = 0; i <= numSpecLines; i++) {
      const val = topPosVal + i * posStep;
      if (val > bottomPosVal) break;
      const y = getYPersonal(val);
      gridLinesSvg += `
        <line x1="${padLeft}" y1="${y}" x2="${padLeft + plotW}" y2="${y}" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="3,3" />
        <text x="${padLeft - 8}" y="${y + 3.5}" fill="#059669" font-size="10" font-weight="700" text-anchor="end">#${val.toLocaleString()}</text>
      `;
    }
  }

  // -------------------------------------------------------------------------
  // 2. EJE X CON FECHAS
  // -------------------------------------------------------------------------
  let xAxisSvg = "";
  allDates.forEach((d, idx) => {
    const x = padLeft + (idx / (allDates.length - 1)) * plotW;
    xAxisSvg += `
      <line x1="${x}" y1="${padTop + plotH}" x2="${x}" y2="${padTop + plotH + 4}" stroke="#cbd5e1" stroke-width="1" />
      <text x="${x}" y="${padTop + plotH + 16}" fill="#64748b" font-size="9.5" font-weight="500" text-anchor="middle">${d}</text>
    `;
  });

  // -------------------------------------------------------------------------
  // 3. LÍNEA AZUL DE CORTE DE BOLSA (SIEMPRE EN 'combined' Y 'chart')
  // -------------------------------------------------------------------------
  let blueCutLineSvg = "";
  let blueDotsSvg = "";
  if (mode === "combined" || mode === "chart") {
    const macroPoints = [];
    let lastKnownY = null;
    (macroSeries || []).forEach((s, idx) => {
      const x = padLeft + (idx / (allDates.length - 1)) * plotW;
      if (s.corte_num !== null && s.corte_num > 0) {
        const y = getYMacro(s.corte_num);
        lastKnownY = y;
        macroPoints.push({ x, y, data: s, origIdx: idx });
      } else if (lastKnownY !== null) {
        macroPoints.push({ x, y: lastKnownY, data: s, origIdx: idx, isInterpolated: true });
      }
    });

    const macroPolyPointsStr = macroPoints.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

    let macroAreaSvg = "";
    if (macroPoints.length > 1) {
      const firstX = macroPoints[0].x.toFixed(1);
      const lastX = macroPoints[macroPoints.length - 1].x.toFixed(1);
      const bottomY = (padTop + plotH).toFixed(1);
      const areaPointsStr = `${firstX},${bottomY} ${macroPolyPointsStr} ${lastX},${bottomY}`;
      macroAreaSvg = `<polygon points="${areaPointsStr}" fill="url(#evoBlueGradient)" />`;
    }

    macroPoints.forEach(p => {
      if (p.data.corte_num === null) return;
      const isReached = userBolsa && p.data.corte_num >= userBolsa;
      const dotFill = isReached ? "#10b981" : "#ffffff";
      const dotStroke = isReached ? "#059669" : "#2563eb";

      blueDotsSvg += `
        <g class="evo-point-group-blue" data-idx="${p.origIdx}">
          <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4.5" fill="${dotFill}" stroke="${dotStroke}" stroke-width="2.5" />
          <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="16" fill="transparent" style="cursor:pointer"
            onmouseenter="window.showEvoTooltip(event, ${p.origIdx}, 'chart')"
            onmousemove="window.moveEvoTooltip(event)"
            onmouseleave="window.hideEvoTooltip()" />
        </g>
      `;
    });

    blueCutLineSvg = `
      ${macroAreaSvg}
      <polyline points="${macroPolyPointsStr}" fill="none" stroke="#2563eb" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" />
    `;
  }

  // -------------------------------------------------------------------------
  // 4. LÍNEA NARANJA DE REFERENCIA DE TU BOLSA INICIAL
  // -------------------------------------------------------------------------
  let userBolsaLineSvg = "";
  if (userBolsa && userBolsa > 0 && (mode === "combined" || mode === "chart")) {
    const uY = getYMacro(userBolsa);
    const isInsidePlot = uY >= padTop && uY <= padTop + plotH;
    const lineY = isInsidePlot ? uY : (uY < padTop ? padTop : padTop + plotH);
    const adjLabel = userAdj ? ` • Nº Adj: #${userAdj.toLocaleString()}` : "";
    const badgeW = userAdj ? 180 : 124;
    const badgeX = padLeft + plotW - badgeW;

    userBolsaLineSvg = `
      <g class="evo-user-reference">
        <line x1="${padLeft}" y1="${lineY}" x2="${padLeft + plotW}" y2="${lineY}" stroke="#d97706" stroke-width="2.2" stroke-dasharray="6,4" />
        <rect x="${badgeX}" y="${lineY - 18}" width="${badgeW}" height="18" rx="4" fill="#d97706" />
        <text x="${badgeX + badgeW / 2}" y="${lineY - 5}" fill="#ffffff" font-size="10" font-weight="700" text-anchor="middle">Tu Bolsa: #${userBolsa.toLocaleString()}${adjLabel}</text>
      </g>
    `;
  }

  // -------------------------------------------------------------------------
  // 5. LÍNEA VERDE DE EVOLUCIÓN PERSONAL EN LA ESPECIALIDAD (EN 'combined' Y 'spec')
  // -------------------------------------------------------------------------
  let greenLineSvg = "";
  let greenDotsSvg = "";
  let calloutSvg = "";

  if (hasPersonal && (mode === "combined" || mode === "spec")) {
    const personalPoints = personalSeries.map((s, idx) => ({
      x: getXForDate(s.fecha),
      y: getYPersonal(s.pos),
      data: s,
      idx: idx
    }));

    const persPolyPointsStr = personalPoints.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

    personalPoints.forEach((p, pIdx) => {
      const s = p.data;
      const isAdjudicat = s.status === "Adjudicat";
      const isLast = pIdx === personalPoints.length - 1;

      let markerSvg = "";
      if (isAdjudicat) {
        markerSvg = `
          <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="6" fill="#f59e0b" stroke="#047857" stroke-width="2.5" />
          <text x="${p.x.toFixed(1)}" y="${(p.y - 10).toFixed(1)}" fill="#047857" font-size="9" font-weight="800" text-anchor="middle">🎉 Pl. Obtenida</text>
        `;
      } else if (isLast) {
        markerSvg = `
          <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="6.5" fill="#10b981" stroke="#047857" stroke-width="2.5" />
          <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2.5" fill="#ffffff" />
        `;
      } else {
        markerSvg = `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4.5" fill="#ffffff" stroke="#10b981" stroke-width="2.5" />`;
      }

      greenDotsSvg += `
        <g class="evo-point-group-green" data-idx="${pIdx}">
          ${markerSvg}
          <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="18" fill="transparent" style="cursor:pointer"
            onmouseenter="window.showEvoTooltip(event, ${pIdx}, 'spec')"
            onmousemove="window.moveEvoTooltip(event)"
            onmouseleave="window.hideEvoTooltip()" />
        </g>
      `;
    });

    // Chincheta flotante destacada en el último punto (HOY)
    if (personalPoints.length > 0) {
      const lastP = personalPoints[personalPoints.length - 1];
      const badgeW = 205;
      const badgeH = 22;
      let bX = lastP.x - badgeW + 8;
      if (bX < padLeft) bX = lastP.x - badgeW / 2;
      const bY = Math.max(padTop - 24, lastP.y - 28);

      const adjDisplay = (lastP.data.adj || userAdj) ? `#${(lastP.data.adj || userAdj).toLocaleString()}` : "-";
      calloutSvg = `
        <g class="evo-callout-today">
          <rect x="${bX}" y="${bY}" width="${badgeW}" height="${badgeH}" rx="5" fill="#0f172a" />
          <polygon points="${lastP.x},${lastP.y - 4} ${lastP.x - 5},${bY + badgeH} ${lastP.x + 5},${bY + badgeH}" fill="#0f172a" />
          <text x="${bX + badgeW / 2}" y="${bY + 15}" fill="#34d399" font-size="10.5" font-weight="700" text-anchor="middle">
            📍 Hoy: Puesto #${lastP.data.pos.toLocaleString()} (Nº Adj: ${adjDisplay})
          </text>
        </g>
      `;
    }

    greenLineSvg = `
      <polyline points="${persPolyPointsStr}" fill="none" stroke="#10b981" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" />
    `;
  }

  // -------------------------------------------------------------------------
  // 6. LEYENDA DINÁMICA SEGÚN MODO
  // -------------------------------------------------------------------------
  let legendHtml = "";
  if (mode === "combined") {
    legendHtml = `
      <div class="evo-legend">
        <span class="evo-legend-item"><span class="evo-dot dot-corte"></span> <strong>Línea de Corte Oficial</strong> (Eje izq. azul)</span>
        <span class="evo-legend-item"><span class="evo-dot dot-spec"></span> <strong>Tu Puesto en ${specName}</strong> (Eje der. verde)</span>
        <span class="evo-legend-item"><span class="evo-dot dot-user"></span> Tu Bolsa (#${userBolsa ? userBolsa.toLocaleString() : '-'})</span>
        <span class="evo-legend-item"><strong style="color:var(--primary)">📋 Nº Adjudicación convocada actual: ${userAdj ? '#' + userAdj.toLocaleString() : '-'}</strong></span>
      </div>
    `;
  } else if (mode === "chart") {
    legendHtml = `
      <div class="evo-legend">
        <span class="evo-legend-item"><span class="evo-dot dot-corte"></span> <strong>Línea de Corte Oficial</strong> (Nº Bolsa del último adjudicado)</span>
        <span class="evo-legend-item"><span class="evo-dot dot-user"></span> Tu Bolsa inicial (#${userBolsa ? userBolsa.toLocaleString() : '-'})</span>
        <span class="evo-legend-item"><strong style="color:var(--primary)">📋 Nº Adjudicación actual: ${userAdj ? '#' + userAdj.toLocaleString() : '-'}</strong></span>
      </div>
    `;
  } else {
    legendHtml = `
      <div class="evo-legend">
        <span class="evo-legend-item"><span class="evo-dot dot-spec"></span> <strong>Tu Puesto en ${specName}</strong> (Meta: Puesto #1)</span>
        <span class="evo-legend-item"><span class="evo-dot" style="background:#f59e0b;border:2px solid #047857"></span> 🎉 Plaza Adjudicada</span>
        <span class="evo-legend-item"><strong style="color:var(--primary)">📋 Nº Adjudicación convocada actual: ${userAdj ? '#' + userAdj.toLocaleString() : '-'}</strong></span>
      </div>
    `;
  }

  wrap.innerHTML = `
    <svg class="evo-svg" viewBox="0 0 ${svgW} ${svgH}" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="evoBlueGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.32" />
          <stop offset="85%" stop-color="#3b82f6" stop-opacity="0.04" />
          <stop offset="100%" stop-color="#3b82f6" stop-opacity="0" />
        </linearGradient>
      </defs>
      ${gridLinesSvg}
      ${xAxisSvg}
      ${blueCutLineSvg}
      ${userBolsaLineSvg}
      ${greenLineSvg}
      ${blueDotsSvg}
      ${greenDotsSvg}
      ${calloutSvg}
    </svg>
    ${legendHtml}
  `;
}

function renderEvoTable(macroSeries, personalSeries, user) {
  const tbody = document.getElementById("evoTableBody");
  if (!tbody) return;

  const revMacro = [...(macroSeries || [])].reverse();
  const personalMap = {};
  (personalSeries || []).forEach(p => {
    personalMap[p.fecha] = p;
  });

  tbody.innerHTML = revMacro.map((s, idx) => {
    const shortDate = s.fecha.slice(0, 5);
    const pers = personalMap[shortDate] || null;

    let posBadge = `<span style="color:var(--slate-400)">-</span>`;
    if (pers && pers.pos) {
      posBadge = `<strong class="tag tag-blue">#${pers.pos.toLocaleString()}</strong> <small style="color:var(--slate-500);font-weight:600">de ${pers.total ? pers.total.toLocaleString() : '-'}</small>`;
    }

    let adjBadge = `<span style="color:var(--slate-400)">-</span>`;
    if (pers && pers.adj) {
      adjBadge = `<span class="tag" style="background:#eff6ff;color:#1e40af;font-weight:700">#${pers.adj.toLocaleString()}</span>`;
    }

    let advanceBadge = `<span style="color:var(--slate-400)">-</span>`;
    if (pers && personalSeries) {
      const persIdx = personalSeries.findIndex(p => p.fecha === shortDate);
      if (persIdx > 0) {
        const prevPers = personalSeries[persIdx - 1];
        const diff = prevPers.pos - pers.pos;
        if (diff > 0) {
          advanceBadge = `<span class="badge-advance advance-positive">▲ +${diff.toLocaleString()} puestos</span>`;
        } else if (diff === 0) {
          advanceBadge = `<span class="badge-advance advance-neutral">= Sin cambios</span>`;
        } else {
          advanceBadge = `<span class="badge-advance advance-negative">▼ ${diff.toLocaleString()} puestos</span>`;
        }
      }
    }

    const hasCut = s.corte_num !== null && s.corte_num > 0;
    const corteBadge = hasCut 
      ? `<strong class="tag" style="background:#f1f5f9;color:#334155;font-weight:700">#${s.corte_num.toLocaleString()}</strong>` 
      : `<span style="color:var(--slate-400)">Sin plazas hoy</span>`;

    let statusBadge = `<span style="font-size:0.8rem;color:var(--slate-600)">Convocatoria</span>`;
    if (pers && pers.status) {
      if (pers.status === "Adjudicat") {
        statusBadge = `<span class="tag tag-status status-adjudicat">🎉 Adjudicat</span>`;
      } else if (pers.status === "Desactivat") {
        statusBadge = `<span class="tag tag-status status-desactivat">Desactivat</span>`;
      } else {
        statusBadge = `<span class="tag tag-status status-no-adjudicat">${pers.status}</span>`;
      }
    }

    return `
      <tr>
        <td><strong>${s.fecha}</strong></td>
        <td>${posBadge}</td>
        <td>${adjBadge}</td>
        <td>${advanceBadge}</td>
        <td>${corteBadge}</td>
        <td><span class="tag" style="background:#f8fafc;color:#475569;font-weight:600">${s.plazas} ${s.plazas === 1 ? 'plaza' : 'plazas'}</span></td>
        <td>${statusBadge}</td>
      </tr>
    `;
  }).join("");
}

// Tooltips interactivos de la gráfica
function showEvoTooltip(evt, idx, mode) {
  const tooltip = document.getElementById("evoTooltip");
  if (!tooltip) return;

  const specCode = currentSpecialty;
  const specName = SPECIALTY_NAMES[specCode] || specCode;

  if (mode === "spec") {
    const series = window.currentEvoPersonalSeries || [];
    const p = series[idx];
    if (!p) return;

    let advanceHtml = "";
    if (idx > 0) {
      const prev = series[idx - 1];
      const diff = prev.pos - p.pos;
      if (diff > 0) {
        advanceHtml = `<div style="color:#34d399;font-weight:700;margin-top:4px">▲ Subiste +${diff.toLocaleString()} puestos respecto al ${prev.fecha} (#${prev.pos})</div>`;
      } else if (diff === 0) {
        advanceHtml = `<div style="color:#94a3b8;font-size:0.75rem;margin-top:4px">= Mismo puesto que el ${prev.fecha}</div>`;
      } else {
        advanceHtml = `<div style="color:#f87171;font-size:0.75rem;margin-top:4px">▼ Variación de ${diff.toLocaleString()} puestos respecto al ${prev.fecha}</div>`;
      }
    }

    tooltip.innerHTML = `
      <div style="font-weight:700;margin-bottom:3px">📅 Adjudicación ${p.fecha}</div>
      <div style="color:#6ee7b7;font-weight:700;font-size:0.9rem">Puesto #${p.pos.toLocaleString()} <small style="color:#cbd5e1">de ${p.total ? p.total.toLocaleString() : '-'} en ${specName}</small></div>
      <div style="font-size:0.75rem;color:#93c5fd;margin-top:2px">Nº Adjudicación: <strong>${p.adj ? '#' + p.adj.toLocaleString() : '-'}</strong></div>
      <div style="font-size:0.75rem;color:#94a3b8">Estado: <strong>${p.status}</strong></div>
      ${advanceHtml}
    `;
  } else {
    const series = window.currentEvoMacroSeries || window.currentEvoSeries || [];
    const s = series[idx];
    if (!s) return;

    const userBolsa = currentUser?.bolsa_num || null;
    const userAdj = currentUser?.adj_order || null;
    let distHtml = "";
    if (userBolsa && s.corte_num) {
      const diff = userBolsa - s.corte_num;
      if (diff <= 0) {
        distHtml = `<div style="color:#34d399;font-weight:700;margin-top:4px">✓ En rango (${diff.toLocaleString()} puestos)</div>`;
      } else {
        distHtml = `<div style="color:#93c5fd;font-weight:600;margin-top:4px">A +${diff.toLocaleString()} puestos de tu bolsa</div>`;
      }
    }

    tooltip.innerHTML = `
      <div style="font-weight:700;margin-bottom:2px">📅 Adjudicación ${s.fecha}</div>
      <div style="color:#93c5fd;font-weight:700">Línea de Corte: <strong>${s.corte_num ? '#' + s.corte_num.toLocaleString() : 'Sin plazas'}</strong></div>
      ${s.corte_nombre ? `<div style="font-size:0.75rem;color:#cbd5e1">${s.corte_nombre}</div>` : ''}
      <div style="font-size:0.75rem;color:#94a3b8">Plazas asignadas: <strong>${s.plazas}</strong></div>
      ${userAdj ? `<div style="font-size:0.75rem;color:#bfdbfe">Tu Nº Adjudicación convocada: <strong>#${userAdj.toLocaleString()}</strong></div>` : ''}
      ${distHtml}
    `;
  }

  tooltip.classList.remove("hidden");
  moveEvoTooltip(evt);
}
window.showEvoTooltip = showEvoTooltip;

function moveEvoTooltip(evt) {
  const tooltip = document.getElementById("evoTooltip");
  const wrap = document.getElementById("evoSvgWrap");
  if (!tooltip || !wrap) return;

  const rect = wrap.getBoundingClientRect();
  const x = evt.clientX - rect.left;
  const y = evt.clientY - rect.top;

  tooltip.style.left = `${x}px`;
  tooltip.style.top = `${y}px`;
}
window.moveEvoTooltip = moveEvoTooltip;

function hideEvoTooltip() {
  const tooltip = document.getElementById("evoTooltip");
  if (tooltip) tooltip.classList.add("hidden");
}
window.hideEvoTooltip = hideEvoTooltip;
