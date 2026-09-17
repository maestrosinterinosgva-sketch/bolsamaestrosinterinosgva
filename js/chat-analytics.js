/**
 * js/chat-analytics.js
 * Asistente Conversacional Inteligente para Análisis de la Bolsa de Maestros Interinos GVA.
 * Funciona 100% en cliente (sin servidores externos ni costes), con respuesta inmediata (0ms)
 * y acceso determinista y exacto a los datos de la adjudicación.
 */

(function() {
  const SPECIALTIES = {
    INF: "Educación Infantil",
    PRI: "Educación Primaria",
    PT: "Pedagogía Terapéutica",
    AL: "Audición y Lenguaje",
    EF: "Educación Física",
    MUS: "Música",
    ING: "Lengua Extranjera: Inglés",
    FRA: "Lengua Extranjera: Francés"
  };

  const SPEC_SYNONYMS = {
    "infantil": "INF", "inf": "INF", "parvulos": "INF",
    "primaria": "PRI", "pri": "PRI",
    "pt": "PT", "pedagogia": "PT", "terapeutica": "PT",
    "al": "AL", "audicion": "AL", "lenguaje": "AL",
    "ef": "EF", "educacion fisica": "EF", "gimnasia": "EF", "fisica": "EF",
    "musica": "MUS", "mus": "MUS",
    "ingles": "ING", "ing": "ING", "english": "ING",
    "frances": "FRA", "fra": "FRA"
  };

  function normalize(str) {
    if (!str) return "";
    return str.normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9\s]/g, " ")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  // Estado de contexto conversacional en memoria (multi-turn memory)
  let lastReferencedPerson = null;
  let lastReferencedCenter = null;

  // --- MOTOR ANALÍTICO DE DATOS ---
  const AnalyticsEngine = {
    getStats() {
      return window.STATS_SUMMARY || (window.getStatsSummary ? window.getStatsSummary() : null);
    },

    getAllInterinos() {
      return window.ALL_INTERINOS || [];
    },

    getCurrentUser() {
      return window.currentUser || null;
    },

    getLastReferencedPerson() {
      return lastReferencedPerson;
    },

    setLastReferencedPerson(p) {
      lastReferencedPerson = p;
    },

    // 1. Resumen global de la última adjudicación
    getGlobalSummary() {
      const stats = this.getStats();
      if (!stats) return "No hay datos de adjudicación cargados todavía.";

      const fecha = stats.fecha_adjudicacion || "Reciente";
      const totalBolsa = (stats.total_participantes_bolsa || 17336).toLocaleString();
      const convocados = (stats.total_adjudicaciones_hoy || 0).toLocaleString();
      const plazas = (stats.total_plazas_adjudicadas || 0).toLocaleString();

      let specsHtml = '<div class="chat-table-wrap"><table class="chat-data-table"><thead><tr><th>Especialidad</th><th>Plazas Hoy</th><th>Último Adjudicado</th><th>Nº Bolsa</th></tr></thead><tbody>';

      if (stats.especialidades) {
        for (const [code, sp] of Object.entries(stats.especialidades)) {
          const ult = sp.ultimo_adjudicado;
          const ultNombre = ult ? ult.name : '<span style="color:#94a3b8">Sin plazas</span>';
          const ultBolsa = ult ? `#${ult.bolsa_num}` : '-';
          specsHtml += `<tr>
            <td><strong>${code}</strong> (${SPECIALTIES[code] || code})</td>
            <td><span class="chat-badge chat-badge-green">${sp.total_plazas_hoy || 0}</span></td>
            <td><small>${ultNombre}</small></td>
            <td><strong>${ultBolsa}</strong></td>
          </tr>`;
        }
      }
      specsHtml += '</tbody></table></div>';

      return `
        <div class="chat-card-answer">
          <h4>📊 Resumen Oficial de la Adjudicación (${fecha})</h4>
          <p>Esta es la radiografía completa de la última convocatoria de Conselleria:</p>
          <div class="chat-kpi-row">
            <div class="chat-kpi"><span class="kpi-num">${plazas}</span><span class="kpi-lbl">Plazas dadas hoy</span></div>
            <div class="chat-kpi"><span class="kpi-num">${convocados}</span><span class="kpi-lbl">Convocados</span></div>
            <div class="chat-kpi"><span class="kpi-num">${totalBolsa}</span><span class="kpi-lbl">Total en Bolsa</span></div>
          </div>
          ${specsHtml}
          <p class="chat-tip">💡 <em>Puedes preguntarme por una especialidad concreta (ej: "¿Dónde ha cortado Primaria?") o por centros ("¿Qué plazas hay en Torrevieja?").</em></p>
        </div>
      `;
    },

    // 2. Informe de cortes de bolsa
    getCutsReport(specFilter = null) {
      const stats = this.getStats();
      if (!stats || !stats.especialidades) return "No se dispone de datos de cortes actualmente.";

      let rows = [];
      const entries = specFilter 
        ? Object.entries(stats.especialidades).filter(([k]) => k === specFilter)
        : Object.entries(stats.especialidades);

      if (entries.length === 0) {
        return `No se encontraron datos de corte para la especialidad ${specFilter}.`;
      }

      for (const [code, sp] of entries) {
        const ult = sp.ultimo_adjudicado;
        if (ult) {
          rows.push(`
            <div class="chat-cut-item">
              <div class="cut-item-header">
                <span class="chat-tag-spec">${code} - ${SPECIALTIES[code] || code}</span>
                <span class="chat-badge chat-badge-blue">Nº Bolsa: #${ult.bolsa_num}</span>
              </div>
              <div class="cut-item-body">
                <div>👤 <strong>Adjudicado/a:</strong> ${ult.name}</div>
                <div>📍 <strong>Nº Convocatoria:</strong> #${ult.adj_order}</div>
                <div>🏫 <strong>Centro asignado:</strong> ${ult.centro || '-'}</div>
                <div>📊 <strong>Plazas en esta especialidad hoy:</strong> ${sp.total_plazas_hoy || 0}</div>
              </div>
            </div>
          `);
        } else {
          rows.push(`
            <div class="chat-cut-item">
              <div class="cut-item-header">
                <span class="chat-tag-spec">${code} - ${SPECIALTIES[code] || code}</span>
                <span class="chat-badge chat-badge-gray">Sin adjudicaciones hoy</span>
              </div>
              <p style="margin-top:6px; color:#64748b; font-size:0.85rem;">En esta convocatoria no se han asignado puestos de esta especialidad.</p>
            </div>
          `);
        }
      }

      const titulo = specFilter ? `Corte de ${SPECIALTIES[specFilter] || specFilter}` : "Cortes Oficiales de Todas las Especialidades";
      return `
        <div class="chat-card-answer">
          <h4>📍 ${titulo}</h4>
          <p>El corte representa a la <strong>última persona de la lista general</strong> que ha obtenido plaza en la convocatoria de hoy:</p>
          <div class="chat-cuts-list">${rows.join("")}</div>
        </div>
      `;
    },

    // 3. Consulta de plazas y centros por localidad, colegio o adjudicatario
    searchCentersAndPlaces(query, rawText = "") {
      const all = this.getAllInterinos();
      const normQ = normalize(query);
      const fullNorm = normalize(rawText || query);

      // Extraer si se menciona una especialidad
      let targetSpec = null;
      for (const [syn, code] of Object.entries(SPEC_SYNONYMS)) {
        if (new RegExp(`\\b${syn}\\b`).test(fullNorm)) {
          targetSpec = code;
          break;
        }
      }

      // Palabras clave de búsqueda filtrando palabras comunes
      const stopWords = new Set([
        "que", "plazas", "plaza", "puestos", "puesto", "hay", "han", "dado", "dio", "en", "el", "la", "los", "las", "un", "una", "unos", "unas",
        "de", "del", "centros", "centro", "colegios", "colegio", "pueblos", "pueblo", "municipios", "municipio", "adjudicado", "adjudicados",
        "adjudicada", "adjudicadas", "donde", "para", "por", "quien", "quienes", "se", "ha", "llevado", "llevo", "tiene", "cogio", "entro",
        "asignado", "tocado", "toco", "quedo", "ganado", "conseguido", "instituto", "institutos"
      ]);

      const rawWords = normQ.split(" ").filter(w => w.length > 1 && !stopWords.has(w) && !SPEC_SYNONYMS[w]);
      const keywords = rawWords.length > 0 ? rawWords : normQ.split(" ").filter(w => w.length > 1 && !stopWords.has(w));

      const matches = all.filter(p => {
        if (!p.plaza) return false;
        if (targetSpec && p.plaza.spec_acronym !== targetSpec) return false;

        if (keywords.length === 0) return true; // Si solo filtró por especialidad

        const centerNorm = normalize(p.plaza.center || "");
        const typeNorm = normalize(p.plaza.type || p.plaza.tipo_vacante || "");
        const codeNorm = String(p.plaza.code || "");
        const nameNorm = normalize(p.name || "");

        // Coincidencia exacta de frase o de palabras clave
        if (centerNorm.includes(normQ) || nameNorm.includes(normQ)) return true;
        return keywords.some(k => centerNorm.includes(k) || codeNorm.includes(k) || nameNorm.includes(k));
      });

      // Si no hubo coincidencia en la bolsa de Maestros
      if (matches.length === 0) {
        // Comprobar si el usuario preguntó por centros de Secundaria / FP (ej. La Torreta, institutos...)
        const isSecOrFP = /\b(torreta|ies|instituto|secundaria|fp|cipfp)\b/i.test(fullNorm);
        
        let extraExplanation = "";
        if (isSecOrFP) {
          extraExplanation = `
            <div style="background:#eff6ff; border-left:4px solid #3b82f6; padding:10px 14px; border-radius:6px; margin:12px 0; font-size:0.88rem; color:#1e3a8a;">
              <p style="margin-bottom:6px; font-weight:700;">📌 ¿Por qué no aparece en este listado?</p>
              <ul style="margin:0 0 0 16px; padding:0; line-height:1.5;">
                <li><strong>Centro de Secundaria o Formación Profesional:</strong> Centros como el <em>IES La Torreta</em> (Elda) o el <em>CIPFP La Torreta</em> (Elche) pertenecen a Secundaria y FP. Sus adjudicaciones se resuelven en el listado independiente de Secundaria/FP y no en esta bolsa de Maestros (Infantil y Primaria).</li>
                <li><strong>Plaza Desierta:</strong> Si la plaza se ofertó en la convocatoria pero ningún aspirante la solicitó o cumplía los requisitos voluntarios, queda <em>desierta</em> y no se asigna a ningún interino.</li>
              </ul>
            </div>
            <p style="font-size:0.85rem; color:#475569;">Puedes consultar las plazas que sí se han asignado hoy a Maestros en localidades cercanas:</p>
            <div class="chat-quick-chips" style="margin-top:8px;">
              <button class="chat-chip" data-query="plazas en elda">🏫 Plazas en Elda</button>
              <button class="chat-chip" data-query="plazas en elx">🏫 Plazas en Elche</button>
              <button class="chat-chip" data-query="plazas en torrevieja">🏫 Plazas en Torrevieja</button>
              <button class="chat-chip" data-query="plazas en alicante">🏫 Plazas en Alicante</button>
            </div>
          `;
        } else {
          extraExplanation = `
            <p style="margin-top:8px; font-size:0.85rem; color:#64748b;">Prueba a buscar por municipio (ej: <em>Valencia</em>, <em>Elche</em>, <em>Torrevieja</em>, <em>Alicante</em>) o por especialidad (ej: <em>plazas de Infantil</em>).</p>
            <div class="chat-quick-chips" style="margin-top:8px;">
              <button class="chat-chip" data-query="plazas en valencia">🏫 Valencia</button>
              <button class="chat-chip" data-query="plazas en alicante">🏫 Alicante</button>
              <button class="chat-chip" data-query="plazas en castellon">🏫 Castellón</button>
              <button class="chat-chip" data-query="plazas de primaria">📚 Primaria</button>
            </div>
          `;
        }

        return `
          <div class="chat-card-answer">
            <h4>🔍 Búsqueda de Plazas y Centros</h4>
            <p>No encontré ninguna plaza adjudicada hoy en la bolsa de Maestros que coincida con <strong>"${escapeHtml(query || rawText)}"</strong>.</p>
            ${extraExplanation}
          </div>
        `;
      }

      // Si hay coincidencia exacta de 1 sola plaza adjudicada:
      if (matches.length === 1) {
        const m = matches[0];
        lastReferencedPerson = m;
        lastReferencedCenter = m.plaza ? m.plaza.center : null;
        const pl = m.plaza;
        let jBadge = "Jornada entera";
        const jRaw = String(pl.jornada || '').toLowerCase();
        if (jRaw.includes("parcial") || jRaw.includes("11,5") || jRaw.includes("11.5") || jRaw.includes("7,5") || jRaw.includes("7.5") || jRaw.includes("7,667") || jRaw.includes("9 hora") || (jRaw.includes("hora") && !jRaw.includes("23"))) {
          jBadge = `<span class="chat-badge" style="background:#fff7ed; color:#9a3412; border:1px solid #fed7aa;">⏱️ Parcial (${escapeHtml(pl.jornada)})</span>`;
        } else {
          jBadge = `<span class="chat-badge chat-badge-green">⏳ Entera (${escapeHtml(pl.jornada || 'Completa')})</span>`;
        }

        return `
          <div class="chat-card-answer">
            <h4>🏫 Adjudicación en ${escapeHtml(pl.center || 'Centro asignado')}</h4>
            <p>La plaza se la ha llevado:</p>
            <div class="chat-cut-item" style="border-left: 4px solid #2563eb; background:#f8fafc; padding:12px;">
              <div style="font-size:1.05rem; font-weight:800; color:#1e293b; margin-bottom:6px;">
                👤 ${escapeHtml(m.name)}
              </div>
              <div style="font-size:0.88rem; line-height:1.55; color:#334155;">
                <div>📚 <strong>Especialidad:</strong> ${escapeHtml(pl.spec_name || pl.spec_acronym)} <span class="chat-badge chat-badge-blue">${escapeHtml(pl.spec_acronym || '-')}</span></div>
                <div>📋 <strong>Tipo de puesto:</strong> ${escapeHtml(pl.type || pl.tipo_vacante || 'Sustitución')}</div>
                <div>⏱️ <strong>Jornada:</strong> ${jBadge}</div>
                <div>🔢 <strong>Código de plaza:</strong> #${escapeHtml(pl.code || pl.cod_plaza || '-')}</div>
                <div>📊 <strong>Posición en Bolsa:</strong> #${m.bolsa_num || '-'} (Orden de adjudicación #${m.adj_order || '-'})</div>
              </div>
            </div>
            <p style="margin-top:8px; font-size:0.82rem; color:#64748b;">💡 <em>Puedes preguntarme: "¿Cuántos puestos le separan de [Mi Nombre]?" para ver la comparativa directa.</em></p>
          </div>
        `;
      }

      // Agrupar por centro para múltiples resultados
      const grouped = {};
      matches.forEach(m => {
        const c = m.plaza.center || "Centro no especificado";
        if (!grouped[c]) grouped[c] = [];
        grouped[c].push(m);
      });
      if (matches.length > 0) {
        lastReferencedPerson = matches[0];
        lastReferencedCenter = matches[0].plaza ? matches[0].plaza.center : null;
      }

      const totalCentros = Object.keys(grouped).length;
      let htmlRows = [];
      const displayedCenters = Object.entries(grouped).slice(0, 15);

      for (const [centro, docs] of displayedCenters) {
        const docsList = docs.map(d => `
          <li style="padding:4px 0; border-bottom:1px solid #f1f5f9;">
            <strong>${escapeHtml(d.name)}</strong> 
            <span class="chat-badge chat-badge-blue">${escapeHtml(d.plaza.spec_acronym || '')}</span>
            <small style="color:#64748b;">(${escapeHtml(d.plaza.type || d.plaza.tipo_vacante || 'Sustitución')}, ${escapeHtml(d.plaza.jornada || 'Completa')})</small>
            <br><small style="color:#94a3b8;">Bolsa #${d.bolsa_num || '-'} · Código #${escapeHtml(d.plaza.code || '-')}</small>
          </li>
        `).join("");

        htmlRows.push(`
          <div class="chat-center-card" style="margin-bottom:10px;">
            <div class="center-title" style="font-size:0.86rem; margin-bottom:6px;">
              🏫 <strong>${escapeHtml(centro)}</strong> 
              <span class="chat-badge chat-badge-green">${docs.length} ${docs.length === 1 ? 'plaza' : 'plazas'}</span>
            </div>
            <ul class="center-teachers-list" style="padding-left:4px;">${docsList}</ul>
          </div>
        `);
      }

      const extraText = totalCentros > 15 
        ? `<p style="margin-top:8px; font-size:0.8rem; color:#64748b;"><em>Mostrando 15 de ${totalCentros} centros coincidentes (${matches.length} plazas en total). Puedes afinar escribiendo el nombre exacto del colegio o municipio.</em></p>`
        : '';

      return `
        <div class="chat-card-answer">
          <h4>🏫 Centros y Plazas Adjudicadas (${matches.length} plazas encontradas)</h4>
          <div class="chat-centers-container">${htmlRows.join("")}</div>
          ${extraText}
        </div>
      `;
    },

    // 4. Informe sobre desactivados y no participantes
    getDeactivatedReport(spec = null) {
      const stats = this.getStats();
      if (!stats || !stats.especialidades) return "Datos no disponibles.";

      let totalDes = 0;
      let totalNoPart = 0;
      let rows = [];

      for (const [code, sp] of Object.entries(stats.especialidades)) {
        if (spec && code !== spec) continue;
        const des = sp.total_desactivados || 0;
        const noPart = sp.total_no_participat || 0;
        const act = sp.total_activos_espera || 0;
        totalDes += des;
        totalNoPart += noPart;

        rows.push(`
          <tr>
            <td><strong>${code}</strong> (${SPECIALTIES[code] || code})</td>
            <td><span class="chat-badge chat-badge-amber">${des.toLocaleString()}</span></td>
            <td><span class="chat-badge chat-badge-red">${noPart.toLocaleString()}</span></td>
            <td><span class="chat-badge chat-badge-green">${act.toLocaleString()}</span></td>
          </tr>
        `);
      }

      return `
        <div class="chat-card-answer">
          <h4>⏸️ Estado de Aspirantes: Desactivados y En Espera</h4>
          <p>Un aspirante <strong>desactivado</strong> no compite por plazas en esta adjudicación (por cuidado de hijos, baja o reserva), lo cual <strong>hace correr la bolsa más rápido a tu favor</strong>.</p>
          <div class="chat-table-wrap">
            <table class="chat-data-table">
              <thead><tr><th>Especialidad</th><th>Desactivados</th><th>No participaron</th><th>Activos en espera</th></tr></thead>
              <tbody>${rows.join("")}</tbody>
            </table>
          </div>
          <div class="chat-kpi-row" style="margin-top:12px;">
            <div class="chat-kpi"><span class="kpi-num">${totalDes.toLocaleString()}</span><span class="kpi-lbl">Total Desactivados</span></div>
            <div class="chat-kpi"><span class="kpi-num">${totalNoPart.toLocaleString()}</span><span class="kpi-lbl">No participaron hoy</span></div>
          </div>
        </div>
      `;
    },

    // 5. Análisis del puesto del usuario seleccionado
    getUserAnalysis() {
      const user = this.getCurrentUser();
      const currentSpec = window.currentSpecialty || 'PRI';
      const specName = SPECIALTIES[currentSpec] || currentSpec;
      const stats = this.getStats();

      if (!user) {
        return `
          <div class="chat-card-answer">
            <p>👤 <strong>No tienes ningún aspirante seleccionado en el buscador superior.</strong></p>
            <p>Para analizar tu posición personalizada:</p>
            <ol style="margin: 8px 0 8px 20px; font-size: 0.9rem;">
              <li>Escribe tu nombre o apellidos en la caja de búsqueda superior de la web.</li>
              <li>Selecciona tu perfil en la lista.</li>
              <li>Vuelve a preguntarme <em>"¿Cómo voy?"</em> o <em>"Analiza mi posición"</em>.</li>
            </ol>
            <p>O si prefieres, escribe aquí directamente: <strong>"Buscar a [Tu Nombre]"</strong> y te diré tu situación.</p>
          </div>
        `;
      }

      // Si el usuario ya ha obtenido plaza hoy
      if (user.plaza) {
        return `
          <div class="chat-card-answer">
            <h4>🎉 ¡Enhorabuena, ${user.name}!</h4>
            <p>En la adjudicación de hoy has obtenido plaza:</p>
            <div class="chat-cut-item" style="border-left: 4px solid var(--success);">
              <div>🏫 <strong>Centro:</strong> ${user.plaza.center}</div>
              <div>📚 <strong>Especialidad:</strong> ${user.plaza.spec_name} (${user.plaza.spec_acronym})</div>
              <div>📋 <strong>Tipo:</strong> ${user.plaza.type || 'Sustitución'}</div>
              <div>⏱️ <strong>Jornada:</strong> ${user.plaza.jornada || 'Completa'}</div>
              <div>🔢 <strong>Código de plaza:</strong> ${user.plaza.code || '-'}</div>
            </div>
          </div>
        `;
      }

      // Si está en espera
      const posActual = user.spec_positions ? user.spec_positions[currentSpec] : '-';
      const posDepurada = user.spec_positions_depurada ? user.spec_positions_depurada[currentSpec] : '-';
      const spStats = stats && stats.especialidades ? stats.especialidades[currentSpec] : null;
      const ult = spStats ? spStats.ultimo_adjudicado : null;

      let corteInfo = "";
      if (ult && user.adj_order) {
        const diff = user.adj_order - ult.adj_order;
        if (diff > 0) {
          corteInfo = `<p>📍 El corte hoy quedó en <strong>${ult.name}</strong> (Nº Convocatoria #${ult.adj_order}). Te has quedado a <strong>${diff.toLocaleString()} puestos de convocatoria</strong> de conseguir plaza.</p>`;
        } else {
          corteInfo = `<p>📍 Tu número (#${user.adj_order}) era anterior al corte de hoy (#${ult.adj_order}). Si no te han adjudicado, puede ser debido a tus provincias solicitadas o centros no marcados en tu petición telemática.</p>`;
        }
      }

      return `
        <div class="chat-card-answer">
          <h4>👤 Análisis de Posición: ${user.name}</h4>
          <p>Diagnóstico en <strong>${specName}</strong> (${stats?.fecha_adjudicacion || 'Hoy'}):</p>
          <div class="chat-kpi-row">
            <div class="chat-kpi"><span class="kpi-num">#${posActual}</span><span class="kpi-lbl">Puesto Bruto</span></div>
            <div class="chat-kpi highlight-blue"><span class="kpi-num">#${posDepurada}</span><span class="kpi-lbl">Puesto Neto Activo</span></div>
            <div class="chat-kpi"><span class="kpi-num">#${user.adj_order || user.num || '-'}</span><span class="kpi-lbl">Nº Convocatoria</span></div>
          </div>
          ${corteInfo}
          <div style="margin-top:10px; background:#eff6ff; padding:10px; border-radius:8px; font-size:0.85rem; color:#1e40af;">
            💡 <strong>Tu puesto neto real es #${posDepurada}:</strong> Significa que si descontamos a todos los que ya tienen plaza y a los que están desactivados, solo compites con ${posDepurada} personas reales por delante de ti.
          </div>
        </div>
      `;
    },

    // 6. Buscar directamente a cualquier persona por nombre
    findPerson(nameQuery) {
      const all = this.getAllInterinos();
      const normQ = normalize(nameQuery).replace(/buscar|a|el|la|dime|sobre|interino|docente/g, "").trim();
      if (!normQ || normQ.length < 3) {
        return "Por favor, introduce al menos 3 letras del nombre o apellidos para buscar.";
      }

      const matches = all.filter(p => p.norm_name && p.norm_name.includes(normQ)).slice(0, 5);

      if (matches.length === 0) {
        return `No se ha encontrado a ningún interino/a con el nombre o apellidos <strong>"${nameQuery}"</strong> en la bolsa oficial de 17.336 aspirantes.`;
      }

      if (matches.length === 1) {
        const p = matches[0];
        window.currentUser = p;
        if (window.selectUser) window.selectUser(p);
        return this.getUserAnalysis();
      }

      let listHtml = matches.map(p => `
        <li style="margin-bottom:8px;">
          <a href="#" class="chat-select-person-link" data-name="${p.name}">
            <strong>${p.name}</strong>
          </a> 
          <small>— Bolsa #${p.bolsa_num || '-'} (${p.status || 'En espera'})</small>
        </li>
      `).join("");

      return `
        <div class="chat-card-answer">
          <p>🔍 He encontrado varias coincidencias para <strong>"${nameQuery}"</strong>. Haz clic en la que deseas analizar:</p>
          <ul style="margin: 8px 0 8px 18px;">${listHtml}</ul>
        </div>
      `;
    },

    // 7. Explicaciones conceptuales
    explainConcept(query) {
      const q = normalize(query);
      if (q.includes("desactivat") || q.includes("desactivado")) {
        return `
          <div class="chat-card-answer">
            <h4>⏸️ ¿Qué significa estar Desactivado?</h4>
            <p>Un aspirante en estado <strong>Desactivat</strong> ha solicitado voluntariamente (o por encontrarse de baja/cuidado) no participar temporalmente en las adjudicaciones.</p>
            <p>• <strong>Impacto para ti:</strong> Es muy positivo. Esa persona se salta en el orden de adjudicación y tú avanzas puestos netos reales hacia la plaza.</p>
          </div>
        `;
      }
      if (q.includes("diferencia") || q.includes("vacante") || q.includes("sustitucion")) {
        return `
          <div class="chat-card-answer">
            <h4>📋 Vacante vs Sustitución</h4>
            <p>• <strong>Vacante:</strong> Plaza para todo el curso escolar (hasta el 31 de agosto). Puede ser a jornada completa o parcial.</p>
            <p>• <strong>Sustitución:</strong> Nombramiento temporal para cubrir la baja de un titular. Termina cuando el titular se reincorpora.</p>
          </div>
        `;
      }
      if (q.includes("depurada") || q.includes("neta") || q.includes("real")) {
        return `
          <div class="chat-card-answer">
            <h4>🎯 ¿Qué es la Posición Depurada o Neta?</h4>
            <p>Es la métrica más importante de esta app. En la lista oficial de Conselleria apareces con tu posición bruta, pero muchos de los que van por delante:</p>
            <ul style="margin-left: 20px; font-size: 0.9rem;">
              <li>Ya tienen plaza adjudicada previamente.</li>
              <li>Están desactivados temporalmente.</li>
              <li>No han participado en esta convocatoria.</li>
            </ul>
            <p style="margin-top:6px;"><strong>La posición depurada elimina a todos ellos</strong> y te dice con cuántas personas <em>reales y activas</em> estás compitiendo hoy por la próxima plaza.</p>
          </div>
        `;
      }
      return null;
    },

    // 7b. Informe de acreditaciones lingüísticas oficiales (B2, C1, C2)
    getLanguagesReport(query) {
      const q = normalize(query);
      const all = this.getAllInterinos();
      const currentUser = this.getCurrentUser();

      // ¿Pregunta el usuario por su propia acreditación?
      if (q.includes("mi ") || q.includes("tengo ") || q.includes("mis idiomas") || q.includes("mi nivel") || q.includes("consta")) {
        if (!currentUser) {
          return `
            <div class="chat-card-answer">
              <p>🤔 Para decirte tu acreditación oficial de idiomas, introduce primero tu nombre o DNI en el buscador de la cabecera.</p>
            </div>
          `;
        }
        if (currentUser.idiomas && Object.keys(currentUser.idiomas).length > 0) {
          const badges = Object.entries(currentUser.idiomas).map(([lang, lvl]) => {
            const lName = lang === 'ingles' ? 'Inglés' : lang === 'frances' ? 'Francés' : lang === 'aleman' ? 'Alemán' : lang === 'italiano' ? 'Italiano' : lang;
            const flag = lang === 'ingles' ? '🇬🇧' : lang === 'frances' ? '🇫🇷' : lang === 'aleman' ? '🇩🇪' : lang === 'italiano' ? '🇮🇹' : '🌐';
            return `<span class="chat-badge chat-badge-green">${flag} ${lvl} ${lName}</span>`;
          }).join(" ");

          return `
            <div class="chat-card-answer">
              <h4>🇬🇧 Acreditación Oficial Registrada</h4>
              <p>👤 <strong>${escapeHtml(currentUser.name)}:</strong></p>
              <p>Tienes oficialmente registrada en las resoluciones de Conselleria la siguiente acreditación lingüística:</p>
              <div style="margin: 10px 0;">${badges}</div>
              <p style="font-size:0.85rem; color:#64748b;">Esta acreditación te capacita para impartir áreas no lingüísticas en lengua extranjera (plurilingüismo) en colegios de la Comunitat Valenciana.</p>
            </div>
          `;
        } else {
          return `
            <div class="chat-card-answer">
              <h4>ℹ️ Acreditación Lingüística</h4>
              <p>👤 <strong>${escapeHtml(currentUser.name)}:</strong></p>
              <p>No consta ninguna acreditación de lengua extranjera (B2, C1, C2) en los listados definitivos mensuales publicados por Conselleria para tu nombre.</p>
              <p style="font-size:0.85rem; color:#64748b;">Si posees una certificación (Escuela Oficial de Idiomas, Cambridge, etc.) recuerda registrarla en el trámite mensual de acreditación de la Dirección Territorial para que sea computada oficialmente.</p>
            </div>
          `;
        }
      }

      // Estadísticas globales de la bolsa
      const accredited = all.filter(p => p.idiomas && Object.keys(p.idiomas).length > 0);
      const c1Count = all.filter(p => p.idiomas && Object.values(p.idiomas).some(lvl => lvl === 'C1')).length;
      const b2Count = all.filter(p => p.idiomas && Object.values(p.idiomas).some(lvl => lvl === 'B2')).length;
      const c2Count = all.filter(p => p.idiomas && Object.values(p.idiomas).some(lvl => lvl === 'C2')).length;
      const inAdjAccredited = all.filter(p => p.in_adjudicacion && p.idiomas && Object.keys(p.idiomas).length > 0).length;
      const adjudicadosAccredited = all.filter(p => p.status === 'Adjudicat' && p.idiomas && Object.keys(p.idiomas).length > 0);

      let topListHtml = adjudicadosAccredited.slice(0, 6).map(p => `
        <li style="margin-bottom:6px;">
          <strong>${escapeHtml(p.name)}</strong> (#${p.adj_order}) 
          <span class="chat-badge chat-badge-blue">${escapeHtml(p.idiomas_str || '')}</span>
          <br><small style="color:#64748b;">🏫 ${escapeHtml(p.plaza ? p.plaza.center : '-')}</small>
        </li>
      `).join("");

      return `
        <div class="chat-card-answer">
          <h4>🇬🇧 Acreditaciones en Lenguas Extranjeras (GVA)</h4>
          <p>Hemos cruzado los <strong>17.336 docentes de la bolsa</strong> con todas las resoluciones oficiales definitivas de Conselleria d'Educació (2012-2026):</p>
          <div class="chat-kpi-row">
            <div class="chat-kpi"><span class="kpi-num">${accredited.length}</span><span class="kpi-lbl">Acreditados en Bolsa</span></div>
            <div class="chat-kpi highlight-blue"><span class="kpi-num">${c1Count}</span><span class="kpi-lbl">Con Nivel C1</span></div>
            <div class="chat-kpi"><span class="kpi-num">${b2Count}</span><span class="kpi-lbl">Con Nivel B2</span></div>
            <div class="chat-kpi"><span class="kpi-num">${adjudicadosAccredited.length}</span><span class="kpi-lbl">Adjudicados hoy</span></div>
          </div>
          <p style="margin-top:10px;"><strong>🏆 Docentes adjudicados hoy con plaza y acreditación:</strong></p>
          <ul style="margin: 6px 0 8px 18px; font-size:0.88rem;">${topListHtml}</ul>
          <p class="chat-tip">💡 <em>Puedes filtrar la tabla buscando <code>C1</code>, <code>B2</code> o <code>Inglés</code> para ver todos los aspirantes con acreditación lingüística.</em></p>
        </div>
      `;
    },

    // 8. Buscar un objeto persona por nombre o apellidos
    findPersonObject(nameQuery) {
      const all = this.getAllInterinos();
      const normQ = normalize(nameQuery);
      if (!normQ || normQ.length < 3) return null;

      // Coincidencia directa
      let match = all.find(p => p.norm_name && p.norm_name.toLowerCase().includes(normQ));
      if (match) return match;

      // Coincidencia por tokens (ej: "pablo hernandez rizo" -> encuentra "HERNANDEZ RIZO, PABLO")
      const tokens = normQ.split(" ").filter(w => w.length > 2);
      if (tokens.length > 0) {
        match = all.find(p => {
          if (!p.norm_name) return false;
          const pNorm = p.norm_name.toLowerCase();
          return tokens.every(t => pNorm.includes(t));
        });
        if (match) return match;
      }
      return null;
    },

    // 9. Comparativa detallada de puestos entre dos aspirantes
    comparePersons(p1, p2) {
      if (!p1 || !p2) {
        return `
          <div class="chat-card-answer">
            <p>🤔 Para comparar puestos necesito dos aspirantes o que primero me preguntes por una plaza o persona.</p>
            <p style="font-size:0.85rem; color:#64748b;">Ejemplo: <em>"¿Quién se ha llevado la plaza de la torreta?"</em> y luego <em>"¿Cuántos puestos le separan de Pablo Hernández Rizo?"</em>.</p>
          </div>
        `;
      }

      const all = this.getAllInterinos();
      const stats = this.getStats();

      const order1 = p1.adj_order || p1.num || 0;
      const order2 = p2.adj_order || p2.num || 0;
      const diffConv = Math.abs(order1 - order2);

      const bolsa1 = p1.bolsa_num || 0;
      const bolsa2 = p2.bolsa_num || 0;
      const diffBolsa = Math.abs(bolsa1 - bolsa2);

      // Especialidad común
      const specs1 = p1.specialties || (p1.plaza ? [p1.plaza.spec_acronym] : []);
      const specs2 = p2.specialties || (p2.plaza ? [p2.plaza.spec_acronym] : []);
      const sharedSpecs = specs1.filter(s => specs2.includes(s));
      const mainSpec = sharedSpecs[0] || specs2[0] || specs1[0] || 'PT';
      const specName = SPECIALTIES[mainSpec] || mainSpec;

      // Calcular aspirantes convocados y plazas adjudicadas entre ambos
      let convocadosEntre = 0;
      let plazasDadasEntre = 0;
      if (order1 && order2) {
        const minOrd = Math.min(order1, order2);
        const maxOrd = Math.max(order1, order2);
        const between = all.filter(p => p.adj_order && p.adj_order > minOrd && p.adj_order < maxOrd && (p.specialties || []).includes(mainSpec));
        convocadosEntre = between.length;
        plazasDadasEntre = between.filter(p => p.plaza && p.plaza.spec_acronym === mainSpec).length;
      }

      const plazaInfo1 = p1.plaza ? `Adjudicada (${escapeHtml(p1.plaza.center)})` : (p1.status || 'En espera');
      const plazaInfo2 = p2.plaza ? `Adjudicada (${escapeHtml(p2.plaza.center)})` : (p2.status || 'En espera');

      // Corte de la especialidad
      let corteNote = "";
      if (stats && stats.especialidades && stats.especialidades[mainSpec]) {
        const ult = stats.especialidades[mainSpec].ultimo_adjudicado;
        if (ult) {
          const ultOrd = ult.adj_order || 0;
          const diffP2 = order2 - ultOrd;
          if (diffP2 <= 0) {
            corteNote = `
              <div style="background:#eff6ff; border-left:4px solid #3b82f6; padding:10px 14px; border-radius:6px; margin-top:12px; font-size:0.88rem; color:#1e3a8a;">
                🚀 <strong>Situación respecto al corte (${mainSpec}):</strong> El corte final de hoy llegó hasta el <strong>Nº #${ultOrd}</strong> (<em>${escapeHtml(ult.name)}</em>, bolsa #${ult.bolsa_num}). 
                <strong>${escapeHtml(p2.name)} (#${order2})</strong> estaba <strong>${Math.abs(diffP2)} puestos por delante del corte</strong>. ¡Está en una posición privilegiada para las próximas convocatorias!
              </div>
            `;
          } else {
            corteNote = `
              <div style="background:#f8fafc; border-left:4px solid #64748b; padding:10px 14px; border-radius:6px; margin-top:12px; font-size:0.88rem; color:#334155;">
                📍 <strong>Corte de ${mainSpec}:</strong> El corte final de hoy quedó en el <strong>Nº #${ultOrd}</strong> (<em>${escapeHtml(ult.name)}</em>). <strong>${escapeHtml(p2.name)}</strong> se ha quedado a <strong>${diffP2} puestos</strong> del corte en esta convocatoria.
              </div>
            `;
          }
        }
      }

      return `
        <div class="chat-card-answer">
          <h4>⚖️ Comparativa de Posición en Bolsa</h4>
          <p>Comparando a <strong>${escapeHtml(p1.name)}</strong> y <strong>${escapeHtml(p2.name)}</strong> en <strong>${specName}</strong>:</p>
          <div class="chat-kpi-row">
            <div class="chat-kpi"><span class="kpi-num">${diffConv.toLocaleString()}</span><span class="kpi-lbl">Puestos Convocatoria</span></div>
            <div class="chat-kpi"><span class="kpi-num">${diffBolsa.toLocaleString()}</span><span class="kpi-lbl">Puestos Bolsa General</span></div>
            <div class="chat-kpi highlight-blue"><span class="kpi-num">${convocadosEntre.toLocaleString()}</span><span class="kpi-lbl">Aspirantes ${mainSpec} en medio</span></div>
          </div>
          <div class="chat-table-wrap">
            <table class="chat-data-table">
              <thead>
                <tr><th>Dato</th><th>${escapeHtml(p1.name.split(',')[0])}</th><th>${escapeHtml(p2.name.split(',')[0])}</th><th>Diferencia</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>Nº Convocatoria</strong></td>
                  <td>#${order1}</td>
                  <td>#${order2}</td>
                  <td><span class="chat-badge chat-badge-blue">${diffConv.toLocaleString()} puestos</span></td>
                </tr>
                <tr>
                  <td><strong>Nº Bolsa General</strong></td>
                  <td>#${bolsa1}</td>
                  <td>#${bolsa2}</td>
                  <td><span class="chat-badge chat-badge-amber">${diffBolsa.toLocaleString()} puestos</span></td>
                </tr>
                <tr>
                  <td><strong>Plazas dadas en medio</strong></td>
                  <td colspan="2" style="text-align:center;">${plazasDadasEntre} plazas asignadas de ${mainSpec}</td>
                  <td><span class="chat-badge chat-badge-green">${plazasDadasEntre} plazas</span></td>
                </tr>
                <tr>
                  <td><strong>Estado hoy</strong></td>
                  <td><small>${plazaInfo1}</small></td>
                  <td><small>${plazaInfo2}</small></td>
                  <td>-</td>
                </tr>
              </tbody>
            </table>
          </div>
          ${corteNote}
        </div>
      `;
    }
  };

  // Función para extraer el nombre del centro, pueblo o término clave sin prefijos conversacionales
  function extractCenterOrPlazaTarget(rawText) {
    const q = normalize(rawText);
    const patterns = [
      /\b(dime|sabes|sabrias decirme|quiero saber|puedes decirme|consultar|ver|mostrar|por favor)\b/g,
      /\b(a\s+quien|quien|quienes)\s+(se\s+)?(ha|han|fue)?\s*(llevado|quedado|adjudicado|dado|cogido|entrado|asignado|tocado|obtenido|ganado)\b/g,
      /\b(a\s+quien|quien|quienes)\s+(tiene|esta|consiguio|gano|cogio|lleva|obtuvo)\b/g,
      /\b(que|cuantas|cuantos)\s+(plazas?|puestos?)\s+(hay|se\s+han\s+dado|han\s+dado|se\s+han\s+repartido|quedan|tenemos|dieron|asignaron)\b/g,
      /\b(hay|habido|habia|dieron|asignaron)\s+(plazas?|puestos?)\b/g,
      /\b(que\s+se\s+ha\s+dado|que\s+han\s+dado|que\s+se\s+dio)\b/g,
      /\b(la\s+plaza\s+de|el\s+puesto\s+de|las\s+plazas\s+de|los\s+puestos\s+de)\b/g,
      /\b(la\s+plaza\s+en|el\s+puesto\s+en|las\s+plazas\s+en|los\s+puestos\s+en)\b/g,
      /\b(la\s+plaza|el\s+puesto|las\s+plazas|los\s+puestos|plaza|plazas|puesto|puestos)\b/g,
      /\b(colegios?|centros?|institutos?|pueblos?|municipios?|ciudades)\b/g,
      /\b(en\s+el|en\s+la|en\s+los|en\s+las|del?|de\s+la|de\s+el|de\s+los|de\s+las|en)\b/g,
      /\b(el|la|los|las|un|una|unos|unas)\b/g
    ];
    let cleaned = q;
    for (const p of patterns) {
      cleaned = cleaned.replace(p, " ");
    }
    // Quitar especialidades del target si están presentes para no interferir en la búsqueda del centro
    for (const syn of Object.keys(SPEC_SYNONYMS)) {
      cleaned = cleaned.replace(new RegExp(`\\b${syn}\\b`, 'g'), " ");
    }
    return cleaned.replace(/\s+/g, " ").trim();
  }

  // --- INTERPRETACIÓN INTELIGENTE DEL MENSAJE DEL USUARIO ---
  function processUserMessage(rawText) {
    const text = rawText.trim();
    const q = normalize(text);

    if (!q) {
      return "Por favor, escribe una pregunta sobre las adjudicaciones, especialidades, plazas o centros.";
    }

    // 0. Saludos y bienvenida
    if (/^(hola|buenas|buenos dias|buenas tardes|que tal|hey|hello|hi|inicio|ayuda)\b/i.test(q)) {
      return `
        <div class="chat-card-answer">
          <p>👋 <strong>¡Hola! Soy tu Asistente de Análisis de la Bolsa de Maestros GVA.</strong></p>
          <p>Tengo indexados en tiempo real los <strong>17.336 interinos</strong> y la última adjudicación del <strong>15/09/2026</strong> (8.270 convocados y 309 plazas).</p>
          <p>Puedes preguntarme cosas como:</p>
          <ul style="margin: 6px 0 6px 20px; font-size: 0.88rem;">
            <li>📊 <em>"Resumen de hoy"</em></li>
            <li>📍 <em>"¿Dónde ha quedado el corte de Primaria o Infantil?"</em></li>
            <li>🏫 <em>"¿Quién se ha llevado la plaza de [Centro/Pueblo]?"</em></li>
            <li>🏫 <em>"¿Qué plazas hay en Torrevieja o Alicante?"</em></li>
            <li>⏸️ <em>"¿Cuántos desactivados hay en la bolsa?"</em></li>
            <li>👤 <em>"¿Cómo voy?" o "Buscar a [Mi Nombre]"</em></li>
          </ul>
        </div>
      `;
    }

    // 1. Conceptos y dudas administrativas
    const concept = AnalyticsEngine.explainConcept(q);
    if (concept) return concept;

    // Detectar especialidad mencionada
    let mentionedSpec = null;
    for (const [syn, code] of Object.entries(SPEC_SYNONYMS)) {
      if (new RegExp(`\\b${syn}\\b`).test(q)) {
        mentionedSpec = code;
        break;
      }
    }

    // 2. Cortes de bolsa
    if (q.includes("corte") || q.includes("cortes") || q.includes("cortado") || q.includes("ultimo adjudicado") || q.includes("por donde va") || q.includes("hasta que numero") || q.includes("quien entro al final")) {
      return AnalyticsEngine.getCutsReport(mentionedSpec);
    }

    // 3. Desactivados / No participantes / Renuncias
    if (q.includes("desactivad") || q.includes("no particip") || q.includes("renuncia") || q.includes("en espera")) {
      return AnalyticsEngine.getDeactivatedReport(mentionedSpec);
    }

    // 4. Situación personalizada del usuario
    if (q.includes("como voy") || q.includes("mi puesto") || q.includes("mi posicion") || q.includes("mis opciones") || q.includes("mi situacion") || q.includes("a cuanto me quede") || q.includes("cuanto me falta")) {
      return AnalyticsEngine.getUserAnalysis();
    }

    // 4b. Acreditaciones lingüísticas oficiales (Inglés, B2, C1, C2, Idiomas)
    if (q.includes("ingles") || q.includes("idioma") || q.includes("idiomas") || q.includes("acreditac") || q.includes("b2") || q.includes("c1") || q.includes("c2") || q.includes("frances") || q.includes("aleman") || q.includes("italiano")) {
      return AnalyticsEngine.getLanguagesReport(q);
    }

    // 5. Comparativa entre aspirantes o con la última plaza consultada
    // Ejemplos: "¿cuántos puestos le separan de Pablo Hernández Rizo?", "¿a cuántos puestos está de X?", "diferencia entre A y B"
    const isComparison = (
      q.includes("separan") || q.includes("separa") || q.includes("distancia") ||
      (q.includes("diferencia") && (q.includes("con") || q.includes("entre") || q.includes("de") || q.includes("respecto"))) ||
      (q.includes("cuantos puestos") && (q.includes("de") || q.includes("con") || q.includes("a") || q.includes("le") || q.includes("me"))) ||
      (q.includes("a cuantos") && (q.includes("esta") || q.includes("queda")))
    );

    if (isComparison) {
      // Patrón para dos nombres explícitos: "diferencia entre X e Y" / "separan a X de Y"
      const patDouble = /(?:diferencia\s+(?:entre|de)|separan\s+a)\s+(.+?)\s+(?:y|e|de)\s+(.+)/i;
      const mDouble = q.match(patDouble);
      if (mDouble) {
        const name1 = mDouble[1].replace(/[?.,]/g, "").trim();
        const name2 = mDouble[2].replace(/[?.,]/g, "").trim();
        const p1 = AnalyticsEngine.findPersonObject(name1);
        const p2 = AnalyticsEngine.findPersonObject(name2);
        if (p1 && p2) {
          lastReferencedPerson = p2;
          return AnalyticsEngine.comparePersons(p1, p2);
        }
      }

      // Patrón para un nombre: "¿cuántos puestos le separan de Pablo Hernández Rizo?"
      const patSingle = /(?:cuantos\s+puestos\s+(?:le|me|nos|los)?\s*separan\s+(?:de|a)?|a\s+cuantos\s+puestos\s+esta\s+de|diferencia\s+(?:con|respecto\s+a|frente\s+a))\s*(.+)/i;
      const mSingle = q.match(patSingle);

      let targetName = null;
      if (mSingle) {
        targetName = mSingle[1].replace(/[?.,]/g, "").trim();
      } else {
        targetName = q.replace(/(?:cuantos|puestos|le|me|nos|los|separa|separan|distancia|diferencia|con|de|a|esta|entre|frente)/g, " ").replace(/\s+/g, " ").trim();
      }

      if (targetName && targetName.length >= 3) {
        const p2 = AnalyticsEngine.findPersonObject(targetName);
        const p1 = lastReferencedPerson || AnalyticsEngine.getCurrentUser();
        if (p2) {
          if (!p1) {
            return `
              <div class="chat-card-answer">
                <h4>👤 Aspirante localizado: ${escapeHtml(p2.name)}</h4>
                <p>Nº Convocatoria: <strong>#${p2.adj_order || '-'}</strong> | Bolsa General: <strong>#${p2.bolsa_num || '-'}</strong> | Especialidad: <strong>${(p2.specialties || []).join(', ')}</strong></p>
                <p style="margin-top:6px; font-size:0.88rem; color:#64748b;">Para comparar puestos, pregúntame antes por una plaza (ej: <em>"¿Quién se ha llevado la plaza de la torreta?"</em>) o selecciona tu nombre en la web.</p>
              </div>
            `;
          }
          return AnalyticsEngine.comparePersons(p1, p2);
        }
      }
    }

    // 6. Búsqueda explícita de persona
    if (q.startsWith("buscar a ") || q.startsWith("buscar ") || q.includes("situacion de ") || q.includes("analiza a ")) {
      return AnalyticsEngine.findPerson(text);
    }

    // 6. Resumen general / Balance global (solo cuando piden explícitamente resumen o balance global)
    if (q === "resumen" || q === "resumen hoy" || q === "balance" || q.includes("resumen de hoy") || q.includes("resumen general") || q.includes("balance general") || q.includes("radiografia") || q.includes("total plazas") || q.includes("cuantas plazas en total") || q.includes("como ha ido la adjudicacion") || q.includes("estadisticas generales")) {
      if (mentionedSpec) {
        return AnalyticsEngine.getCutsReport(mentionedSpec);
      }
      return AnalyticsEngine.getGlobalSummary();
    }

    // 7. Preguntas sobre centros, colegios, municipios o quién se ha llevado una plaza
    const isAskingPlazaOrCenter = (
      q.includes("quien se ha llevado") || q.includes("quien se llevo") || q.includes("a quien han dado") ||
      q.includes("quien tiene la plaza") || q.includes("quien tiene plaza") || q.includes("a quien le ha tocado") ||
      q.includes("quien cogio") || q.includes("quien entro en") || q.includes("a quien asignaron") ||
      q.includes("que plazas hay") || q.includes("hay plazas") || q.includes("hay plaza") || q.includes("plazas en") ||
      q.includes("colegio") || q.includes("centro") || q.includes("instituto") || q.includes("ceip") || q.includes("ies") ||
      q.includes("pueblo") || q.includes("municipio") || q.includes("localidad") || q.includes("donde")
    );

    const targetSearch = extractCenterOrPlazaTarget(text);

    if (isAskingPlazaOrCenter || (targetSearch && targetSearch.length >= 3)) {
      const searchTerm = targetSearch || text;
      return AnalyticsEngine.searchCentersAndPlaces(searchTerm, text);
    }

    // 8. Si solo menciona una especialidad (ej: "infantil", "primaria")
    if (mentionedSpec) {
      return AnalyticsEngine.getCutsReport(mentionedSpec);
    }

    // 9. Intentar buscar como nombre de persona en la lista completa antes de rendirse
    const all = AnalyticsEngine.getAllInterinos();
    const candidateMatches = all.filter(p => p.norm_name && p.norm_name.includes(q));
    if (candidateMatches.length > 0 && candidateMatches.length <= 5) {
      return AnalyticsEngine.findPerson(text);
    }

    const centerMatches = all.filter(p => p.plaza && normalize(p.plaza.center || "").includes(q));
    if (centerMatches.length > 0) {
      return AnalyticsEngine.searchCentersAndPlaces(text, text);
    }

    // Fallback con opciones sugeridas
    return `
      <div class="chat-card-answer">
        <p>🤔 No estoy seguro de entender tu pregunta sobre <strong>"${text}"</strong>.</p>
        <p>Prueba con una de estas opciones:</p>
        <div class="chat-quick-chips" style="margin-top:8px;">
          <button class="chat-chip" data-query="resumen de hoy">📊 Resumen de hoy</button>
          <button class="chat-chip" data-query="cortes de hoy">📍 Cortes de todas las áreas</button>
          <button class="chat-chip" data-query="centros adjudicados">🏫 Centros con plazas</button>
          <button class="chat-chip" data-query="cuantos desactivados hay">⏸️ Desactivados</button>
          <button class="chat-chip" data-query="como voy">👤 Mi posición</button>
        </div>
      </div>
    `;
  }

  // --- GESTIÓN DE LA INTERFAZ DE USUARIO DEL CHAT ---
  function initChatUI() {
    const btnToggle = document.getElementById("btnChatToggle");
    const chatWidget = document.getElementById("chatWidget");
    const btnClose = document.getElementById("btnChatClose");
    const btnClear = document.getElementById("btnChatClear");
    const chatForm = document.getElementById("chatForm");
    const chatInput = document.getElementById("chatInput");
    const chatMessages = document.getElementById("chatMessages");
    const chatBadgeNotification = document.getElementById("chatBadgeNotification");

    if (!btnToggle || !chatWidget) return;

    // Toggle open/close
    btnToggle.addEventListener("click", () => {
      const isHidden = chatWidget.classList.contains("hidden");
      chatWidget.classList.toggle("hidden", !isHidden);
      btnToggle.classList.toggle("active", isHidden);
      if (chatBadgeNotification) chatBadgeNotification.classList.add("hidden");
      if (isHidden && chatInput) {
        setTimeout(() => chatInput.focus(), 150);
        scrollToBottom();
      }
    });

    if (btnClose) {
      btnClose.addEventListener("click", () => {
        chatWidget.classList.add("hidden");
        btnToggle.classList.remove("active");
      });
    }

    if (btnClear) {
      btnClear.addEventListener("click", () => {
        if (chatMessages) {
          chatMessages.innerHTML = "";
          appendAssistantMessage("🧹 Conversación reiniciada. ¿Qué dato de la bolsa deseas consultar?");
        }
      });
    }

    function scrollToBottom() {
      if (chatMessages) {
        chatMessages.scrollTop = chatMessages.scrollHeight;
      }
    }

    function appendUserMessage(text) {
      if (!chatMessages) return;
      const msgDiv = document.createElement("div");
      msgDiv.className = "chat-msg chat-msg-user";
      msgDiv.innerHTML = `<div class="chat-bubble chat-bubble-user">${escapeHtml(text)}</div>`;
      chatMessages.appendChild(msgDiv);
      scrollToBottom();
    }

    function appendAssistantMessage(htmlContent) {
      if (!chatMessages) return;
      const msgDiv = document.createElement("div");
      msgDiv.className = "chat-msg chat-msg-assistant";
      msgDiv.innerHTML = `
        <div class="chat-avatar">🤖</div>
        <div class="chat-bubble chat-bubble-assistant">${htmlContent}</div>
      `;
      chatMessages.appendChild(msgDiv);
      scrollToBottom();

      // Añadir listeners para chips interactivos dentro del mensaje
      msgDiv.querySelectorAll(".chat-chip").forEach(chip => {
        chip.addEventListener("click", () => {
          const q = chip.getAttribute("data-query");
          if (q) handleUserQuery(q);
        });
      });

      // Listener para nombres clicables
      msgDiv.querySelectorAll(".chat-select-person-link").forEach(link => {
        link.addEventListener("click", (e) => {
          e.preventDefault();
          const name = link.getAttribute("data-name");
          if (name) handleUserQuery(`analiza a ${name}`);
        });
      });
    }

    function handleUserQuery(query) {
      if (!query.trim()) return;
      appendUserMessage(query);
      if (chatInput) chatInput.value = "";

      // Pequeño retardo natural (120ms) para fluidez visual
      setTimeout(() => {
        const responseHtml = processUserMessage(query);
        appendAssistantMessage(responseHtml);
      }, 120);
    }

    if (chatForm && chatInput) {
      chatForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const val = chatInput.value;
        if (val && val.trim()) {
          handleUserQuery(val);
        }
      });
    }

    // Chips de sugerencia rápida fijos
    document.querySelectorAll(".chat-quick-chip-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const q = btn.getAttribute("data-query");
        if (q) handleUserQuery(q);
      });
    });

    // Mensaje inicial de bienvenida
    if (chatMessages && chatMessages.children.length === 0) {
      const stats = AnalyticsEngine.getStats();
      const fecha = stats?.fecha_adjudicacion || "15/09/2026";
      appendAssistantMessage(`
        <div class="chat-card-answer">
          <p>👋 <strong>¡Hola! Soy tu Asistente de Análisis de la Bolsa.</strong></p>
          <p>Puedo responderte al instante sobre plazas dadas, cortes de especialidad, centros adjudicados o analizar tu puesto en la lista del <strong>${fecha}</strong>.</p>
          <div class="chat-quick-chips" style="margin-top:10px;">
            <button class="chat-chip" data-query="resumen de hoy">📊 Resumen de hoy</button>
            <button class="chat-chip" data-query="cortes de todas las especialidades">📍 Cortes por especialidad</button>
            <button class="chat-chip" data-query="plazas de primaria">🏫 Plazas Primaria</button>
            <button class="chat-chip" data-query="plazas de infantil">👶 Plazas Infantil</button>
            <button class="chat-chip" data-query="como voy">👤 Mi posición</button>
          </div>
        </div>
      `);
    }
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // Inicializar cuando el DOM esté listo
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initChatUI);
  } else {
    initChatUI();
  }

  // Exportar para pruebas unitarias si aplica
  if (typeof window !== "undefined") {
    window.ChatAnalyticsEngine = AnalyticsEngine;
    window.processChatAnalyticsMessage = processUserMessage;
  }
})();
