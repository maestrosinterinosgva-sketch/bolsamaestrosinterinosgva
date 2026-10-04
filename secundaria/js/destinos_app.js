// js/destinos_app.js - Lógica interactiva del Calculador de Destinos de Secundaria y Otros Cuerpos GVA

let allPlazas = [];
let destinosStats = null;
let municipiosGeo = {};
let selectedOrigin = null; // { nombre, lat, lng }
let map = null;
let markersLayer = null;
let favorites = new Set();

// Coordenadas centrales por defecto: Comunitat Valenciana
const DEFAULT_CENTER = [39.4699, -0.3763];
const DEFAULT_ZOOM = 8;

document.addEventListener("DOMContentLoaded", function () {
  initDestinos();
  setupDestinosEvents();
});

function initDestinos() {
  loadFavorites();

  if (window.PUESTOS_DATA) {
    allPlazas = window.PUESTOS_DATA;
  }
  if (window.DESTINOS_STATS) {
    destinosStats = window.DESTINOS_STATS;
  }

  // Cargar municipios para cálculo de distancia
  if (window.MUNICIPIOS_COORDS) {
    window.MUNICIPIOS_COORDS.forEach(m => {
      municipiosGeo[m.nombre.toUpperCase()] = m;
    });
    populateMunicipiosDatalist();
  } else {
    fetch('data/municipios_coords.json')
      .then(r => r.json())
      .then(data => {
        data.forEach(m => {
          municipiosGeo[m.nombre.toUpperCase()] = m;
        });
        populateMunicipiosDatalist();
      })
      .catch(() => {});
  }

  initMap();
  populateSpecialtyFilter();
  updateDestinosStats();
  renderPlazasList();
}

function initMap() {
  if (typeof L === 'undefined') return;
  const mapEl = document.getElementById("destinosMap");
  if (!mapEl) return;

  map = L.map("destinosMap").setView(DEFAULT_CENTER, DEFAULT_ZOOM);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);

  markersLayer = L.layerGroup().addTo(map);
}

function populateMunicipiosDatalist() {
  const dl = document.getElementById("municipiosList");
  if (!dl) return;
  dl.innerHTML = "";
  const names = Object.keys(municipiosGeo).sort();
  names.forEach(nom => {
    const opt = document.createElement("option");
    opt.value = municipiosGeo[nom].nombre;
    dl.appendChild(opt);
  });
}

function populateSpecialtyFilter() {
  const sel = document.getElementById("filterEspecialidad");
  if (!sel) return;

  const specMap = new Map();
  allPlazas.forEach(p => {
    const cod = p.codigo_especialidad || p.especialidad;
    const nom = p.especialidad;
    if (cod && !specMap.has(cod)) {
      specMap.set(cod, nom);
    }
  });

  const sorted = Array.from(specMap.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  sel.innerHTML = '<option value="">Todas las especialidades</option>';
  sorted.forEach(([cod, nom]) => {
    const opt = document.createElement("option");
    opt.value = cod;
    opt.textContent = `${cod} - ${nom}`;
    sel.appendChild(opt);
  });
}

function updateDestinosStats() {
  if (!destinosStats) return;
  const fec = destinosStats.fecha_adjudicacion || "01/10/2026";
  const elDate = document.getElementById("navAdjudicacionDate");
  if (elDate) elDate.textContent = `📅 Adjudicación: ${fec}`;

  const elTot = document.getElementById("statTotalPlazas");
  if (elTot) elTot.textContent = destinosStats.total_plazas || allPlazas.length;

  const elSec = document.getElementById("statSecundariaPlazas");
  if (elSec) elSec.textContent = destinosStats.total_secundaria || allPlazas.filter(p => !p.cuerpo.includes("MAESTROS")).length;

  const elVac = document.getElementById("statVacantes");
  if (elVac) elVac.textContent = destinosStats.total_vacantes || 0;
}

// Cálculo de distancia de Haversine
function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radio de la Tierra en km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function deg2rad(deg) {
  return deg * (Math.PI / 180);
}

function estimateDriveMinutes(km) {
  if (km < 15) return Math.round(km * 2.2); // Urbano / comarcal
  if (km < 50) return Math.round(km * 1.3); // Vía rápida / comarcal
  return Math.round(km * 1.05); // Autovía
}

function setupDestinosEvents() {
  const inputMun = document.getElementById("inputMunicipioOrigen");
  const btnSetMun = document.getElementById("btnSetMunicipio");
  const btnClearMun = document.getElementById("btnClearMunicipio");

  const applyOrigin = () => {
    const val = (inputMun?.value || "").trim().toUpperCase();
    if (val && municipiosGeo[val]) {
      selectedOrigin = municipiosGeo[val];
      localStorage.setItem("userOriginMunicipio", selectedOrigin.nombre);
      if (btnClearMun) btnClearMun.style.display = "inline-block";
      renderPlazasList();
      if (map && selectedOrigin.lat && selectedOrigin.lng) {
        map.setView([selectedOrigin.lat, selectedOrigin.lng], 10);
      }
    }
  };

  if (inputMun) {
    inputMun.addEventListener("change", applyOrigin);
    inputMun.addEventListener("keydown", (e) => {
      if (e.key === "Enter") applyOrigin();
    });
    // Recuperar municipio guardado
    const saved = localStorage.getItem("userOriginMunicipio");
    if (saved && municipiosGeo[saved.toUpperCase()]) {
      inputMun.value = saved;
      selectedOrigin = municipiosGeo[saved.toUpperCase()];
      if (btnClearMun) btnClearMun.style.display = "inline-block";
    }
  }

  if (btnSetMun) btnSetMun.addEventListener("click", applyOrigin);

  if (btnClearMun) {
    btnClearMun.addEventListener("click", () => {
      selectedOrigin = null;
      localStorage.removeItem("userOriginMunicipio");
      if (inputMun) inputMun.value = "";
      btnClearMun.style.display = "none";
      renderPlazasList();
      if (map) map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    });
  }

  // Filtros
  ["filterEspecialidad", "filterTipo", "filterProvincia", "filterCuerpo"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("change", () => renderPlazasList());
  });

  const searchPlazaInput = document.getElementById("inputSearchPlaza");
  if (searchPlazaInput) {
    searchPlazaInput.addEventListener("input", () => renderPlazasList());
  }

  // Modal favoritos
  const btnFav = document.getElementById("btnOpenFavorites");
  const modalFav = document.getElementById("modalFavorites");
  const btnCloseFav = document.getElementById("btnCloseFavoritesModal");
  if (btnFav && modalFav) {
    btnFav.addEventListener("click", () => {
      renderFavoritesModal();
      modalFav.classList.remove("hidden");
    });
  }
  if (btnCloseFav && modalFav) {
    btnCloseFav.addEventListener("click", () => modalFav.classList.add("hidden"));
  }
}

function loadFavorites() {
  try {
    const saved = localStorage.getItem("secundaria_favorites");
    if (saved) favorites = new Set(JSON.parse(saved));
  } catch (e) {
    favorites = new Set();
  }
  updateFavoritesCountBadge();
}

function saveFavorites() {
  try {
    localStorage.setItem("secundaria_favorites", JSON.stringify(Array.from(favorites)));
  } catch (e) {}
  updateFavoritesCountBadge();
}

function updateFavoritesCountBadge() {
  const badge = document.getElementById("favCountBadge");
  if (badge) badge.textContent = favorites.size;
}

function toggleFavorite(id) {
  if (favorites.has(id)) {
    favorites.delete(id);
  } else {
    favorites.add(id);
  }
  saveFavorites();
  renderPlazasList();
}

function renderPlazasList() {
  const container = document.getElementById("plazasCardsContainer");
  if (!container) return;

  const filterEsp = document.getElementById("filterEspecialidad")?.value || "";
  const filterTipo = document.getElementById("filterTipo")?.value || "";
  const filterProv = document.getElementById("filterProvincia")?.value || "";
  const filterCuerpo = document.getElementById("filterCuerpo")?.value || "";
  const searchText = (document.getElementById("inputSearchPlaza")?.value || "").toUpperCase().trim();

  let filtered = allPlazas.filter(p => {
    if (filterEsp && p.codigo_especialidad !== filterEsp && p.especialidad !== filterEsp) return false;
    if (filterTipo && !p.tipo.toUpperCase().includes(filterTipo.toUpperCase())) return false;
    if (filterProv && !p.provincia.toUpperCase().includes(filterProv.toUpperCase())) return false;
    if (filterCuerpo && !p.cuerpo.toUpperCase().includes(filterCuerpo.toUpperCase())) return false;
    if (searchText) {
      const matchNom = p.nombre_centro.toUpperCase().includes(searchText);
      const matchLoc = p.localidad.toUpperCase().includes(searchText);
      const matchEsp = p.especialidad.toUpperCase().includes(searchText);
      const matchCod = (p.codigo_centro || '').includes(searchText) || (p.lloc || '').includes(searchText);
      if (!matchNom && !matchLoc && !matchEsp && !matchCod) return false;
    }
    return true;
  });

  // Calcular distancias si hay origen
  if (selectedOrigin && selectedOrigin.lat && selectedOrigin.lng) {
    filtered.forEach(p => {
      if (p.lat && p.lng) {
        p.dist_km = getDistanceFromLatLonInKm(selectedOrigin.lat, selectedOrigin.lng, p.lat, p.lng);
        p.dist_mins = estimateDriveMinutes(p.dist_km);
      } else {
        p.dist_km = 9999;
        p.dist_mins = 9999;
      }
    });
    // Ordenar por cercanía
    filtered.sort((a, b) => a.dist_km - b.dist_km);
  } else {
    filtered.sort((a, b) => a.numero - b.numero);
  }

  const countEl = document.getElementById("filteredPlazasCount");
  if (countEl) countEl.textContent = `${filtered.length} plazas encontradas`;

  // Actualizar marcadores en mapa
  updateMapMarkers(filtered);

  if (filtered.length === 0) {
    container.innerHTML = `<div class="empty-plazas-msg" style="padding:40px; text-align:center; color:var(--text-muted);">No se encontraron plazas con los filtros seleccionados.</div>`;
    return;
  }

  // Renderizar tarjetas
  container.innerHTML = filtered.map(p => {
    const isFav = favorites.has(p.lloc || p.numero);
    const favClass = isFav ? 'active' : '';
    const isVac = p.tipo.toUpperCase().includes("VACANTE");
    const badgeTypeClass = isVac ? 'badge-vacante' : 'badge-sustitucion';

    let distHtml = '';
    if (selectedOrigin && p.dist_km !== undefined && p.dist_km < 9999) {
      distHtml = `
        <div class="card-distance-badge" title="Distancia estimada en coche desde ${selectedOrigin.nombre}">
          🚗 <strong>${Math.round(p.dist_km)} km</strong> · ~${p.dist_mins} min
        </div>
      `;
    }

    return `
      <div class="plaza-card ${isVac ? 'border-vacante' : ''}" data-id="${p.lloc || p.numero}">
        <div class="plaza-card-header">
          <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
            <span class="badge ${badgeTypeClass}">${escapeHtml(p.tipo)}</span>
            <span class="badge badge-cuerpo">${escapeHtml(p.cuerpo.split(' ')[0] + ' ' + (p.cuerpo.split(' ')[1] || ''))}</span>
            <span class="badge badge-horas">${escapeHtml(p.horas_num ? p.horas_num + 'h' : p.horas)}</span>
          </div>
          <button class="btn-star ${favClass}" onclick="toggleFavorite('${p.lloc || p.numero}')" title="Añadir a mi selección">
            ${isFav ? '★' : '☆'}
          </button>
        </div>

        <div class="plaza-card-title">${escapeHtml(p.nombre_centro)}</div>
        <div class="plaza-card-loc">📍 ${escapeHtml(p.localidad)} (${escapeHtml(p.provincia)}) · Cód: ${escapeHtml(p.codigo_centro)}</div>

        <div class="plaza-card-spec">
          📚 <strong>${escapeHtml(p.codigo_especialidad)}</strong> - ${escapeHtml(p.especialidad)}
        </div>

        <div class="plaza-card-footer">
          <div style="font-size:0.8rem; color:var(--text-muted);">
            Plaza Nº <strong>${escapeHtml(p.lloc || p.numero)}</strong>
          </div>
          ${distHtml}
        </div>
      </div>
    `;
  }).join("");
}

function updateMapMarkers(plazas) {
  if (!markersLayer || !map) return;
  markersLayer.clearLayers();

  const bounds = [];

  // Marcador de origen si existe
  if (selectedOrigin && selectedOrigin.lat && selectedOrigin.lng) {
    const originIcon = L.divIcon({
      className: 'origin-marker-icon',
      html: '<div style="background:#ef4444; color:#fff; width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:16px; box-shadow:0 2px 6px rgba(0,0,0,0.3); border:2px solid #fff;">🏠</div>',
      iconSize: [28, 28],
      iconAnchor: [14, 14]
    });
    const oMarker = L.marker([selectedOrigin.lat, selectedOrigin.lng], { icon: originIcon })
      .bindPopup(`<b>Tu origen:</b> ${selectedOrigin.nombre}`);
    markersLayer.addLayer(oMarker);
    bounds.push([selectedOrigin.lat, selectedOrigin.lng]);
  }

  // Marcadores de plazas (máximo 150 simultáneos en el mapa para rendimiento fluido)
  const plazasToShow = plazas.slice(0, 150);
  plazasToShow.forEach(p => {
    if (p.lat && p.lng) {
      const isVac = p.tipo.toUpperCase().includes("VACANTE");
      const color = isVac ? '#059669' : '#2563eb';
      const m = L.circleMarker([p.lat, p.lng], {
        radius: 7,
        fillColor: color,
        color: '#ffffff',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.85
      });

      let popupHtml = `
        <div style="font-family:sans-serif; min-width:200px;">
          <div style="font-weight:700; color:#0f172a; margin-bottom:4px;">${escapeHtml(p.nombre_centro)}</div>
          <div style="font-size:12px; color:#64748b; margin-bottom:6px;">📍 ${escapeHtml(p.localidad)} (${escapeHtml(p.provincia)})</div>
          <div style="font-size:12px; margin-bottom:4px;">📚 <b>${escapeHtml(p.codigo_especialidad)}</b>: ${escapeHtml(p.especialidad)}</div>
          <div style="font-size:12px; margin-bottom:6px;">📋 <b>${escapeHtml(p.tipo)}</b> (${escapeHtml(p.horas_num ? p.horas_num + 'h' : p.horas)})</div>
      `;
      if (selectedOrigin && p.dist_km !== undefined && p.dist_km < 9999) {
        popupHtml += `<div style="font-size:12px; color:#0284c7; font-weight:700;">🚗 ${Math.round(p.dist_km)} km (~${p.dist_mins} min) desde tu casa</div>`;
      }
      popupHtml += `</div>`;

      m.bindPopup(popupHtml);
      markersLayer.addLayer(m);
      bounds.push([p.lat, p.lng]);
    }
  });

  if (bounds.length > 0 && !selectedOrigin) {
    map.fitBounds(bounds, { padding: [20, 20], maxZoom: 12 });
  }
}

function renderFavoritesModal() {
  const container = document.getElementById("favModalList");
  if (!container) return;

  const favPlazas = allPlazas.filter(p => favorites.has(p.lloc || p.numero));
  if (favPlazas.length === 0) {
    container.innerHTML = `<div style="padding:24px; text-align:center; color:var(--text-muted);">No has guardado ninguna plaza en tu selección todavía. Pulsa en la estrella (☆) de cualquier tarjeta para guardarla aquí.</div>`;
    return;
  }

  container.innerHTML = favPlazas.map((p, idx) => `
    <div style="background:var(--bg-main); border:1px solid var(--border); border-radius:8px; padding:12px; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center; gap:12px;">
      <div>
        <div style="font-weight:700; color:var(--text-main);">${idx + 1}. ${escapeHtml(p.nombre_centro)} (${escapeHtml(p.localidad)})</div>
        <div style="font-size:0.8rem; color:var(--text-muted);">
          <span>📚 ${escapeHtml(p.codigo_especialidad)} - ${escapeHtml(p.especialidad)}</span> · 
          <span>📋 ${escapeHtml(p.tipo)}</span> · 
          <span>Plaza Nº: ${escapeHtml(p.lloc || p.numero)}</span>
        </div>
      </div>
      <button onclick="toggleFavorite('${p.lloc || p.numero}'); renderFavoritesModal();" style="background:#fee2e2; color:#ef4444; border:none; padding:6px 10px; border-radius:6px; cursor:pointer; font-weight:700;">
        Eliminar
      </button>
    </div>
  `).join("");
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
