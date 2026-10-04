// js/app.js - Lógica interactiva de búsqueda y cálculo para Secundaria y Otros Cuerpos GVA

let allInterinos = [];
let statsSummary = null;
let currentUser = null;
let currentSpecialty = '206'; // Matemàtiques por defecto
let currentTableView = 'ahead'; // 'ahead' | 'behind'
let currentTableFilter = 'all'; // 'all' | 'activos' | 'desactivados' | 'no_participat' | 'adjudicados'
let currentBehindFilter = 'spec';
let currentTableSearch = '';
let currentPage = 1;
const PAGE_SIZE = 25;

function normalizeText(text) {
  if (!text) return "";
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

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

function getSpecName(specCode) {
  return statsSummary?.especialidades?.[specCode]?.name || specCode;
}

function getStatusBadgeClass(status) {
  switch (status) {
    case 'Adjudicat': return 'badge-adjudicat';
    case 'Desactivat': return 'badge-desactivat';
    case 'Ha participat': return 'badge-participat';
    case 'No adjudicat': return 'badge-no-adjudicat';
    case 'No ha participat': return 'badge-no-participat';
    default: return 'badge-other';
  }
}

function getStatusLabel(status) {
  switch (status) {
    case 'Adjudicat': return '🎉 Adjudicat';
    case 'Desactivat': return '⏸️ Desactivat';
    case 'Ha participat': return '⏳ En espera (Activo)';
    case 'No adjudicat': return '⏳ No adjudicat (Activo)';
    case 'No ha participat': return '❌ No ha participat';
    default: return status || 'En bolsa';
  }
}

// Carga e inicialización de datos
document.addEventListener("DOMContentLoaded", function () {
  initData();
  setupEventListeners();
});

function initData() {
  if (window.STATS_SUMMARY) {
    statsSummary = window.STATS_SUMMARY;
  }
  if (window.INTERINOS_DATA) {
    allInterinos = window.INTERINOS_DATA;
  }

  // Si no estuviesen cargados por tag script, intentar fetch
  if (!statsSummary || allInterinos.length === 0) {
    Promise.all([
      fetch('data/stats_summary.json').then(r => r.json()).catch(() => null),
      fetch('data/interinos_data.json').then(r => r.json()).catch(() => [])
    ]).then(([stats, data]) => {
      if (stats) statsSummary = stats;
      if (data && data.length) allInterinos = data;
      populateSpecialtySelect();
      updateGlobalStats();
    });
  } else {
    populateSpecialtySelect();
    updateGlobalStats();
  }
}

function populateSpecialtySelect() {
  const select = document.getElementById("specialtySelect");
  if (!select) return;

  select.innerHTML = "";
  if (!statsSummary || !statsSummary.especialidades) return;

  const specs = Object.values(statsSummary.especialidades);
  // Ordenar alfabéticamente por nombre
  specs.sort((a, b) => a.name.localeCompare(b.name));

  let defaultExists = false;
  specs.forEach(sp => {
    const opt = document.createElement("option");
    opt.value = sp.code;
    const plazasText = sp.total_plazas_hoy > 0 ? ` (${sp.total_plazas_hoy} plazas)` : '';
    opt.textContent = `${sp.code} - ${sp.name}${plazasText}`;
    if (sp.code === currentSpecialty) {
      opt.selected = true;
      defaultExists = true;
    }
    select.appendChild(opt);
  });

  if (!defaultExists && specs.length > 0) {
    currentSpecialty = specs[0].code;
  }
}

function updateGlobalStats() {
  if (!statsSummary) return;

  const fec = statsSummary.fecha_adjudicacion || "01/10/2026";
  safeSetText("headerAdjDate", `Adjudicación ${fec} • Secundaria y Otros Cuerpos GVA`);
  safeSetText("globTotalBolsa", statsSummary.total_participantes_bolsa ? statsSummary.total_participantes_bolsa.toLocaleString('es-ES') : "42.146");
  safeSetText("globTotalAdj", statsSummary.total_adjudicaciones_hoy ? statsSummary.total_adjudicaciones_hoy.toLocaleString('es-ES') : "13.373");
  safeSetText("globTotalPlazas", statsSummary.total_plazas_adjudicadas ? statsSummary.total_plazas_adjudicadas.toLocaleString('es-ES') : "282");
}

function setupEventListeners() {
  // Selector de especialidad
  const select = document.getElementById("specialtySelect");
  if (select) {
    select.addEventListener("change", function (e) {
      currentSpecialty = e.target.value;
      if (currentUser) {
        // Buscar si el usuario actual tiene registro en esta especialidad
        const match = allInterinos.find(p => p.norm_name === currentUser.norm_name && p.specialty === currentSpecialty);
        if (match) {
          currentUser = match;
          renderUserView(match);
        } else {
          renderSpecialtySummaryOnly(currentSpecialty);
        }
      } else {
        renderSpecialtySummaryOnly(currentSpecialty);
      }
    });
  }

  // Buscador de aspirantes
  const searchInput = document.getElementById("searchInput");
  const clearBtn = document.getElementById("btnClearSearch");
  const autoList = document.getElementById("autocompleteList");

  if (searchInput) {
    searchInput.addEventListener("input", function (e) {
      const q = normalizeText(e.target.value);
      if (clearBtn) clearBtn.style.display = q ? "block" : "none";

      if (q.length < 2) {
        if (autoList) {
          autoList.innerHTML = "";
          autoList.classList.add("hidden");
        }
        return;
      }

      const qTokens = q.split(" ");
      const matches = allInterinos.filter(p => {
        return qTokens.every(tok => p.norm_name.includes(tok));
      }).slice(0, 15);

      renderAutocomplete(matches);
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener("click", function () {
      if (searchInput) {
        searchInput.value = "";
        searchInput.focus();
      }
      clearBtn.style.display = "none";
      if (autoList) {
        autoList.innerHTML = "";
        autoList.classList.add("hidden");
      }
      currentUser = null;
      document.getElementById("userSummarySection")?.classList.add("hidden");
      document.getElementById("emptyStateSection")?.classList.remove("hidden");
      document.getElementById("aheadSection")?.classList.add("hidden");
    });
  }

  // Pestañas de la tabla por delante / detrás
  const btnAhead = document.getElementById("btnViewAhead");
  const btnBehind = document.getElementById("btnViewBehind");
  if (btnAhead && btnBehind) {
    btnAhead.addEventListener("click", function () {
      currentTableView = 'ahead';
      btnAhead.classList.add("active");
      btnBehind.classList.remove("active");
      document.getElementById("tableFiltersAhead")?.classList.remove("hidden");
      document.getElementById("tableFiltersBehind")?.classList.add("hidden");
      currentPage = 1;
      renderTable();
    });
    btnBehind.addEventListener("click", function () {
      currentTableView = 'behind';
      btnBehind.classList.add("active");
      btnAhead.classList.remove("active");
      document.getElementById("tableFiltersAhead")?.classList.add("hidden");
      document.getElementById("tableFiltersBehind")?.classList.remove("hidden");
      currentPage = 1;
      renderTable();
    });
  }

  // Filtros de pestaña
  document.querySelectorAll("#tableFiltersAhead .btn-tab").forEach(tab => {
    tab.addEventListener("click", function () {
      document.querySelectorAll("#tableFiltersAhead .btn-tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      currentTableFilter = tab.dataset.filter || 'all';
      currentPage = 1;
      renderTable();
    });
  });

  document.querySelectorAll("#tableFiltersBehind .btn-tab").forEach(tab => {
    tab.addEventListener("click", function () {
      document.querySelectorAll("#tableFiltersBehind .btn-tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      currentBehindFilter = tab.dataset.behindFilter || 'spec';
      currentPage = 1;
      renderTable();
    });
  });

  // Filtro de búsqueda dentro de la tabla
  const tableSearch = document.getElementById("tableSearch");
  const btnClearTableSearch = document.getElementById("btnClearTableSearch");
  if (tableSearch) {
    tableSearch.addEventListener("input", function (e) {
      currentTableSearch = normalizeText(e.target.value);
      if (btnClearTableSearch) btnClearTableSearch.classList.toggle("hidden", !currentTableSearch);
      currentPage = 1;
      renderTable();
    });
  }
  if (btnClearTableSearch) {
    btnClearTableSearch.addEventListener("click", function () {
      if (tableSearch) tableSearch.value = "";
      currentTableSearch = "";
      btnClearTableSearch.classList.add("hidden");
      currentPage = 1;
      renderTable();
    });
  }

  // Paginación
  const btnPrev = document.getElementById("btnPrevPage");
  const btnNext = document.getElementById("btnNextPage");
  if (btnPrev) {
    btnPrev.addEventListener("click", function () {
      if (currentPage > 1) {
        currentPage--;
        renderTable();
      }
    });
  }
  if (btnNext) {
    btnNext.addEventListener("click", function () {
      currentPage++;
      renderTable();
    });
  }

  // Modal Resumen de Cortes
  const btnVerResumen = document.getElementById("btnVerResumenSpecs");
  const modalSummary = document.getElementById("modalSummary");
  const btnCloseModal = document.getElementById("btnCloseModal");
  if (btnVerResumen && modalSummary) {
    btnVerResumen.addEventListener("click", function () {
      renderModalSummary();
      modalSummary.classList.remove("hidden");
    });
  }
  if (btnCloseModal && modalSummary) {
    btnCloseModal.addEventListener("click", function () {
      modalSummary.classList.add("hidden");
    });
  }

  // Modal Móvil Wi-Fi
  const btnDevice = document.getElementById("btnDeviceConnect");
  const modalDevice = document.getElementById("modalDeviceConnect");
  const btnCloseDevice = document.getElementById("btnCloseDeviceModal");
  if (btnDevice && modalDevice) {
    btnDevice.addEventListener("click", function () {
      modalDevice.classList.remove("hidden");
    });
  }
  if (btnCloseDevice && modalDevice) {
    btnCloseDevice.addEventListener("click", function () {
      modalDevice.classList.add("hidden");
    });
  }

  // Cerrar modales clicando fuera
  window.addEventListener("click", function (e) {
    if (e.target === modalSummary) modalSummary.classList.add("hidden");
    if (e.target === modalDevice) modalDevice.classList.add("hidden");
    if (autoList && !autoList.contains(e.target) && e.target !== searchInput) {
      autoList.classList.add("hidden");
    }
  });
}

function renderAutocomplete(matches) {
  const autoList = document.getElementById("autocompleteList");
  if (!autoList) return;

  if (matches.length === 0) {
    autoList.innerHTML = `<div class="autocomplete-item" style="color:var(--slate-500); cursor:default;">No se encontraron resultados</div>`;
    autoList.classList.remove("hidden");
    return;
  }

  autoList.innerHTML = matches.map(p => `
    <div class="autocomplete-item" data-spec="${p.specialty}" data-num="${p.bolsa_num}" data-name="${escapeHtml(p.name)}">
      <div style="font-weight:700; color:var(--slate-800);">${escapeHtml(p.name)}</div>
      <div style="font-size:0.8rem; color:var(--slate-500); display:flex; gap:8px; align-items:center;">
        <span>📚 ${escapeHtml(p.specialty)} - ${escapeHtml(getSpecName(p.specialty))}</span>
        <span>•</span>
        <span>Nº Bolsa: #${p.bolsa_num}</span>
        <span class="badge ${getStatusBadgeClass(p.status)}" style="padding:2px 6px; font-size:0.75rem;">${escapeHtml(p.status)}</span>
      </div>
    </div>
  `).join("");

  autoList.classList.remove("hidden");

  autoList.querySelectorAll(".autocomplete-item").forEach(item => {
    item.addEventListener("click", function () {
      const spec = item.dataset.spec;
      const num = parseInt(item.dataset.num, 10);
      const name = item.dataset.name;

      const user = allInterinos.find(p => p.specialty === spec && p.bolsa_num === num && p.name === name);
      if (user) {
        currentUser = user;
        currentSpecialty = user.specialty;
        const sel = document.getElementById("specialtySelect");
        if (sel) sel.value = currentSpecialty;

        const input = document.getElementById("searchInput");
        if (input) input.value = user.name;
        autoList.classList.add("hidden");

        renderUserView(user);
      }
    });
  });
}

function renderUserView(user) {
  document.getElementById("emptyStateSection")?.classList.add("hidden");
  document.getElementById("userSummarySection")?.classList.remove("hidden");
  document.getElementById("aheadSection")?.classList.remove("hidden");

  safeSetText("userNameBadge", user.name);
  safeSetText("userSpecBadge", `${user.specialty} - ${getSpecName(user.specialty)}`);
  safeSetText("userServicesBadge", user.services || "AMB SERVEIS");

  const statusEl = document.getElementById("userStatusBadge");
  if (statusEl) {
    statusEl.className = `badge ${getStatusBadgeClass(user.status)}`;
    statusEl.textContent = getStatusLabel(user.status);
  }

  safeSetText("kpiPosBruta", `#${user.bolsa_num}`);
  safeSetText("kpiPosDepurada", user.posicion_depurada !== undefined ? user.posicion_depurada : "-");

  // Estadísticas de su especialidad
  const spStats = statsSummary?.especialidades?.[user.specialty] || {};
  safeSetText("kpiPlazasHoy", spStats.total_plazas_hoy !== undefined ? spStats.total_plazas_hoy : 0);

  if (spStats.ultimo_adjudicado) {
    safeSetText("kpiUltimoCorte", `#${spStats.ultimo_adjudicado.bolsa_num} (${spStats.ultimo_adjudicado.name.split(',')[0]})`);
  } else {
    safeSetText("kpiUltimoCorte", "Sin adjudicaciones");
  }

  // Si tiene plaza asignada
  const plazaCard = document.getElementById("userPlazaCard");
  if (user.plaza && plazaCard) {
    plazaCard.classList.remove("hidden");
    safeSetText("userPlazaType", user.plaza.type);
    safeSetText("userPlazaCenter", user.plaza.center);
    safeSetText("userPlazaCode", user.plaza.code ? `Cód: ${user.plaza.code}` : "");
    safeSetText("userPlazaJornada", user.plaza.jornada || "Jornada completa");
  } else if (plazaCard) {
    plazaCard.classList.add("hidden");
  }

  // Cálculo de distribución de aspirantes por delante
  const specPeople = allInterinos.filter(p => p.specialty === user.specialty);
  const peopleAhead = specPeople.filter(p => (p.bolsa_num < user.bolsa_num));

  let adjAhead = 0;
  let actAhead = 0;
  let desAhead = 0;
  let noPartAhead = 0;
  let otrosAhead = 0;

  peopleAhead.forEach(p => {
    if (p.status === 'Adjudicat') adjAhead++;
    else if (p.status === 'Ha participat' || p.status === 'No adjudicat') actAhead++;
    else if (p.status === 'Desactivat') desAhead++;
    else if (p.status === 'No ha participat') noPartAhead++;
    else otrosAhead++;
  });

  safeSetText("distTotalAhead", peopleAhead.length);
  safeSetText("legendAdjVal", adjAhead);
  safeSetText("legendActVal", actAhead);
  safeSetText("legendDesVal", desAhead);
  safeSetText("legendNoPartVal", noPartAhead);
  safeSetText("legendOtrosVal", otrosAhead);

  const totAhead = peopleAhead.length || 1;
  const setWidth = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.style.width = `${(val / totAhead) * 100}%`;
  };
  setWidth("barAdjudicados", adjAhead);
  setWidth("barActivos", actAhead);
  setWidth("barDesactivados", desAhead);
  setWidth("barNoParticipat", noPartAhead);
  setWidth("barNoConvocats", otrosAhead);

  currentPage = 1;
  renderTable();
}

function renderSpecialtySummaryOnly(specCode) {
  document.getElementById("userSummarySection")?.classList.add("hidden");
  document.getElementById("emptyStateSection")?.classList.add("hidden");
  document.getElementById("aheadSection")?.classList.remove("hidden");

  // Mostrar todos los de esta especialidad
  currentUser = null;
  currentPage = 1;
  renderTable();
}

function renderTable() {
  const tableBody = document.getElementById("aheadTableBody");
  if (!tableBody) return;

  const specPeople = allInterinos.filter(p => p.specialty === currentSpecialty);
  let dataset = [];

  if (currentUser) {
    if (currentTableView === 'ahead') {
      dataset = specPeople.filter(p => p.bolsa_num < currentUser.bolsa_num);
      // Aplicar filtros de estado
      if (currentTableFilter === 'activos') {
        dataset = dataset.filter(p => p.status === 'Ha participat' || p.status === 'No adjudicat');
      } else if (currentTableFilter === 'desactivados') {
        dataset = dataset.filter(p => p.status === 'Desactivat');
      } else if (currentTableFilter === 'no_participat') {
        dataset = dataset.filter(p => p.status === 'No ha participat');
      } else if (currentTableFilter === 'adjudicados') {
        dataset = dataset.filter(p => p.status === 'Adjudicat');
      }
    } else {
      // Behind
      dataset = specPeople.filter(p => p.bolsa_num > currentUser.bolsa_num && p.status === 'Adjudicat');
    }
  } else {
    dataset = specPeople;
  }

  // Filtro de búsqueda en tabla
  if (currentTableSearch) {
    dataset = dataset.filter(p => {
      return p.norm_name.includes(currentTableSearch) ||
        (p.plaza && normalizeText(p.plaza.center).includes(currentTableSearch));
    });
  }

  // Contadores de pestañas
  safeSetText("countViewAhead", currentUser ? specPeople.filter(p => p.bolsa_num < currentUser.bolsa_num).length : specPeople.length);
  safeSetText("countViewBehind", currentUser ? specPeople.filter(p => p.bolsa_num > currentUser.bolsa_num && p.status === 'Adjudicat').length : 0);

  // Paginación
  const totalItems = dataset.length;
  const totalPages = Math.ceil(totalItems / PAGE_SIZE) || 1;
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;

  const startIdx = (currentPage - 1) * PAGE_SIZE;
  const pageItems = dataset.slice(startIdx, startIdx + PAGE_SIZE);

  safeSetText("pageInfo", `Página ${currentPage} de ${totalPages} (${totalItems} registros)`);
  const prevBtn = document.getElementById("btnPrevPage");
  const nextBtn = document.getElementById("btnNextPage");
  if (prevBtn) prevBtn.disabled = (currentPage <= 1);
  if (nextBtn) nextBtn.disabled = (currentPage >= totalPages);

  if (pageItems.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:32px; color:var(--slate-500);">No se encontraron aspirantes con los filtros seleccionados.</td></tr>`;
    return;
  }

  tableBody.innerHTML = pageItems.map(p => {
    const isMe = (currentUser && p.bolsa_num === currentUser.bolsa_num);
    const rowClass = isMe ? 'highlight-row' : '';
    const plazaText = p.plaza ? `<strong>${escapeHtml(p.plaza.type)}</strong>: ${escapeHtml(p.plaza.center)} (${escapeHtml(p.plaza.jornada || 'Completa')})` : '-';

    return `
      <tr class="${rowClass}">
        <td><strong>#${p.posicion_depurada !== undefined ? p.posicion_depurada : '-'}</strong></td>
        <td>#${p.bolsa_num}</td>
        <td>
          <div style="font-weight:700;">${escapeHtml(p.name)}</div>
          <div style="font-size:0.75rem; color:var(--slate-500);">${escapeHtml(p.specialty)} - ${escapeHtml(getSpecName(p.specialty))}</div>
        </td>
        <td><span style="font-size:0.8rem; color:var(--slate-600);">${escapeHtml(p.services || 'AMB SERVEIS')}</span></td>
        <td><span class="badge ${getStatusBadgeClass(p.status)}">${escapeHtml(p.status)}</span></td>
        <td style="font-size:0.85rem;">${plazaText}</td>
      </tr>
    `;
  }).join("");
}

function renderModalSummary() {
  const body = document.getElementById("modalSummaryBody");
  if (!body || !statsSummary || !statsSummary.especialidades) return;

  const specs = Object.values(statsSummary.especialidades);
  specs.sort((a, b) => (b.total_plazas_hoy - a.total_plazas_hoy) || a.name.localeCompare(b.name));

  body.innerHTML = specs.map(sp => {
    const corteText = sp.corte_bolsa_num > 0 ? `#${sp.corte_bolsa_num}` : 'Sin corte';
    const ultNom = sp.ultimo_adjudicado ? `${sp.ultimo_adjudicado.name.split(',')[0]} (${sp.ultimo_adjudicado.centro.split('(')[0]})` : '-';
    return `
      <tr>
        <td><strong>${escapeHtml(sp.code)}</strong> - ${escapeHtml(sp.name)}</td>
        <td>${sp.total_bolsa_inicial || '-'}</td>
        <td><strong style="color:var(--success);">${sp.total_plazas_hoy}</strong></td>
        <td>${escapeHtml(ultNom)}</td>
        <td><strong>${corteText}</strong></td>
        <td>${sp.total_desactivados || 0}</td>
      </tr>
    `;
  }).join("");
}
