let currentSpecialtyData = null;
let filteredList = [];
let currentPage = 1;
const pageSize = 50;

// Elementos del DOM
const selectEspecialidad = document.getElementById("select-especialidad");
const searchInput = document.getElementById("search-input");
const checkBilingueOnly = document.getElementById("check-bilingue-only");
const totalInterinosEl = document.getElementById("stat-total");
const bilinguesCountEl = document.getElementById("stat-bilingues");
const visibleCountEl = document.getElementById("stat-visibles");
const tableBody = document.getElementById("table-body");
const paginationInfo = document.getElementById("pagination-info");
const btnPrev = document.getElementById("btn-prev");
const btnNext = document.getElementById("btn-next");
const loadingIndicator = document.getElementById("loading-indicator");

// Inicialización
document.addEventListener("DOMContentLoaded", () => {
  cargarCatalogoEspecialidades();

  selectEspecialidad.addEventListener("change", (e) => {
    cargarDatosEspecialidad(e.target.value);
  });

  searchInput.addEventListener("input", () => {
    currentPage = 1;
    aplicarFiltros();
  });

  checkBilingueOnly.addEventListener("change", () => {
    currentPage = 1;
    aplicarFiltros();
  });

  btnPrev.addEventListener("click", () => {
    if (currentPage > 1) {
      currentPage--;
      renderizarTabla();
    }
  });

  btnNext.addEventListener("click", () => {
    const totalPages = Math.ceil(filteredList.length / pageSize);
    if (currentPage < totalPages) {
      currentPage++;
      renderizarTabla();
    }
  });
});

async function cargarCatalogoEspecialidades() {
  try {
    const res = await fetch("data/especialidades.json");
    const data = await res.json();
    
    selectEspecialidad.innerHTML = "";
    data.especialidades.forEach((esp) => {
      const opt = document.createElement("option");
      opt.value = esp.codigo;
      opt.textContent = `${esp.codigo} - ${esp.nombre} (${esp.total.toLocaleString()} interinos)`;
      selectEspecialidad.appendChild(opt);
    });

    // Cargar por defecto la primera especialidad
    if (data.especialidades.length > 0) {
      cargarDatosEspecialidad(data.especialidades[0].codigo);
    }
  } catch (err) {
    console.error("Error al cargar especialidades:", err);
    tableBody.innerHTML = `<tr><td colspan="5" class="empty-state"><div class="empty-icon">⚠️</div>No se pudo cargar el listado de especialidades.</td></tr>`;
  }
}

async function cargarDatosEspecialidad(codigo) {
  tableBody.innerHTML = `<tr><td colspan="5" class="empty-state"><div class="empty-icon">⏳</div>Cargando datos de la especialidad...</td></tr>`;
  currentPage = 1;

  try {
    const res = await fetch(`data/maestros_${codigo}.json`);
    currentSpecialtyData = await res.json();

    totalInterinosEl.textContent = currentSpecialtyData.total.toLocaleString();
    const bilinguesTotal = currentSpecialtyData.aspirantes.filter(a => a.b === 1).length;
    bilinguesCountEl.textContent = bilinguesTotal.toLocaleString();

    aplicarFiltros();
  } catch (err) {
    console.error("Error cargando especialidad:", err);
    tableBody.innerHTML = `<tr><td colspan="5" class="empty-state"><div class="empty-icon">⚠️</div>Error al leer los datos de la especialidad seleccionada.</td></tr>`;
  }
}

function aplicarFiltros() {
  if (!currentSpecialtyData || !currentSpecialtyData.aspirantes) return;

  const query = searchInput.value.trim().toUpperCase();
  const onlyBilingue = checkBilingueOnly.checked;

  filteredList = currentSpecialtyData.aspirantes.filter((item) => {
    // Filtro bilingüe
    if (onlyBilingue && item.b !== 1) return false;

    // Filtro texto (DNI o Nombre)
    if (query) {
      const matchDNI = item.d && item.d.toUpperCase().includes(query);
      const matchNom = item.nom && item.nom.toUpperCase().includes(query);
      return matchDNI || matchNom;
    }
    return true;
  });

  visibleCountEl.textContent = filteredList.length.toLocaleString();
  renderizarTabla();
}

function renderizarTabla() {
  if (filteredList.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="5" class="empty-state"><div class="empty-icon">🔍</div>No se han encontrado aspirantes con los filtros seleccionados.</td></tr>`;
    paginationInfo.textContent = "0 de 0";
    btnPrev.disabled = true;
    btnNext.disabled = true;
    return;
  }

  const totalPages = Math.ceil(filteredList.length / pageSize);
  if (currentPage > totalPages) currentPage = totalPages;

  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, filteredList.length);
  const pageItems = filteredList.slice(startIndex, endIndex);

  let html = "";
  pageItems.forEach((a) => {
    const isTop = a.n <= 50 ? "top-tier" : "";
    const bilingueBadge = a.b === 1 
      ? `<span class="badge-bilingue">✓ Habilitado</span>`
      : `<span style="color:#94a3b8; font-size:0.8rem;">—</span>`;

    html += `
      <tr>
        <td class="col-order ${isTop}">#${a.n}</td>
        <td class="col-dni">${escapeHtml(a.d)}</td>
        <td class="col-name">${escapeHtml(a.nom)}</td>
        <td class="col-score">${escapeHtml(a.p)}</td>
        <td>${bilingueBadge}</td>
      </tr>
    `;
  });

  tableBody.innerHTML = html;

  paginationInfo.textContent = `Mostrando ${startIndex + 1} - ${endIndex} de ${filteredList.length.toLocaleString()} aspirantes (Página ${currentPage} de ${totalPages})`;
  btnPrev.disabled = currentPage === 1;
  btnNext.disabled = currentPage === totalPages;
}

function escapeHtml(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
