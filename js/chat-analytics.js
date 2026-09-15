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

    // 3. Consulta de plazas y centros por localidad o especialidad
    searchCentersAndPlaces(query) {
      const all = this.getAllInterinos();
      const normQ = normalize(query);

      // Extraer si se menciona una especialidad
      let targetSpec = null;
      for (const [syn, code] of Object.entries(SPEC_SYNONYMS)) {
        if (normQ.includes(syn)) {
          targetSpec = code;
          break;
        }
      }

      // Palabras clave de búsqueda filtrando palabras comunes
      const stopWords = new Set(["que", "plazas", "puestos", "hay", "han", "dado", "en", "el", "la", "los", "las", "de", "del", "centros", "colegios", "pueblos", "adjudicado", "adjudicados", "donde", "para", "por"]);
      const keywords = normQ.split(" ").filter(w => w.length > 2 && !stopWords.has(w) && !SPEC_SYNONYMS[w]);

      const matches = all.filter(p => {
        if (!p.plaza) return false;
        if (targetSpec && p.plaza.spec_acronym !== targetSpec) return false;

        if (keywords.length === 0) return true; // Si solo filtró por especialidad

        const centerNorm = normalize(p.plaza.center || "");
        const typeNorm = normalize(p.plaza.type || p.plaza.tipo_vacante || "");
        const codeNorm = String(p.plaza.code || "");

        return keywords.some(k => centerNorm.includes(k) || typeNorm.includes(k) || codeNorm.includes(k));
      });

      if (matches.length === 0) {
        return `
          <div class="chat-card-answer">
            <p>🔍 No encontré centros o plazas adjudicadas que coincidan con <strong>"${query}"</strong> en esta lista.</p>
            <p style="margin-top:6px; font-size:0.85rem; color:#64748b;">Prueba a buscar por una localidad (ej: <em>Torrevieja</em>, <em>Benicàssim</em>, <em>Valencia</em>, <em>Alicante</em>) o por especialidad (ej: <em>plazas de Infantil</em>).</p>
          </div>
        `;
      }

      // Agrupar por centro
      const grouped = {};
      matches.forEach(m => {
        const c = m.plaza.center || "Centro no especificado";
        if (!grouped[c]) grouped[c] = [];
        grouped[c].push(m);
      });

      const totalCentros = Object.keys(grouped).length;
      let htmlRows = [];
      const displayedCenters = Object.entries(grouped).slice(0, 15);

      for (const [centro, docs] of displayedCenters) {
        const docsList = docs.map(d => `
          <li>
            <strong>${d.name}</strong> 
            <span class="chat-badge chat-badge-blue">${d.plaza.spec_acronym || ''}</span>
            <small style="color:#64748b;">(${d.plaza.type || 'Sustitución'}, ${d.plaza.jornada || 'Completa'})</small>
          </li>
        `).join("");

        htmlRows.push(`
          <div class="chat-center-card">
            <div class="center-title">🏫 <strong>${centro}</strong> <span class="chat-badge chat-badge-green">${docs.length} ${docs.length === 1 ? 'plaza' : 'plazas'}</span></div>
            <ul class="center-teachers-list">${docsList}</ul>
          </div>
        `);
      }

      const extraText = totalCentros > 15 
        ? `<p style="margin-top:8px; font-size:0.8rem; color:#64748b;"><em>Mostrando 15 de ${totalCentros} centros coincidentes. Puedes afinar escribiendo el nombre exacto del colegio o municipio.</em></p>`
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
    }
  };

  // --- INTERPRETACIÓN INTELIGENTE DEL MENSAJE DEL USUARIO ---
  function processUserMessage(rawText) {
    const text = rawText.trim();
    const q = normalize(text);

    if (!q) {
      return "Por favor, escribe una pregunta sobre las adjudicaciones, especialidades, plazas o centros.";
    }

    // Saludos y bienvenida
    if (/^(hola|buenas|buenos dias|buenas tardes|que tal|hey|hello|hi|inicio|ayuda)/i.test(q)) {
      return `
        <div class="chat-card-answer">
          <p>👋 <strong>¡Hola! Soy tu Asistente de Análisis de la Bolsa de Maestros GVA.</strong></p>
          <p>Tengo indexados en tiempo real los <strong>17.336 interinos</strong> y la última adjudicación del <strong>15/09/2026</strong> (8.270 convocados y 309 plazas).</p>
          <p>Puedes preguntarme cosas como:</p>
          <ul style="margin: 6px 0 6px 20px; font-size: 0.88rem;">
            <li>📊 <em>"¿Cuántas plazas se han dado hoy?"</em></li>
            <li>📍 <em>"¿Dónde ha quedado el corte de Primaria o Infantil?"</em></li>
            <li>🏫 <em>"¿Qué plazas hay en Torrevieja o Alicante?"</em></li>
            <li>⏸️ <em>"¿Cuántos desactivados hay en la bolsa?"</em></li>
            <li>👤 <em>"¿Cómo voy?" o "Analiza a [Mi Nombre]"</em></li>
          </ul>
        </div>
      `;
    }

    // Conceptos
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

    // 1. Cortes
    if (q.includes("corte") || q.includes("cortes") || q.includes("ultimo adjudicado") || q.includes("quien entro") || q.includes("ultimo")) {
      return AnalyticsEngine.getCutsReport(mentionedSpec);
    }

    // 2. Desactivados / No participantes
    if (q.includes("desactivad") || q.includes("no particip") || q.includes("renuncia") || q.includes("en espera")) {
      return AnalyticsEngine.getDeactivatedReport(mentionedSpec);
    }

    // 3. Situación del usuario
    if (q.includes("como voy") || q.includes("mi puesto") || q.includes("mi posicion") || q.includes("mis opciones") || q.includes("mi situacion") || q.includes("a cuanto me quede")) {
      return AnalyticsEngine.getUserAnalysis();
    }

    // 4. Búsqueda explícita de persona
    if (q.startsWith("buscar") || q.includes("docente") || q.includes("interino") || q.includes("situacion de") || q.includes("analiza a")) {
      return AnalyticsEngine.findPerson(text);
    }

    // 5. Centros, colegios, pueblos, municipios
    if (q.includes("colegio") || q.includes("centro") || q.includes("instituto") || q.includes("pueblo") || q.includes("municipio") || q.includes("localidad") || q.includes("donde")) {
      return AnalyticsEngine.searchCentersAndPlaces(text);
    }

    // 6. Plazas / Resumen
    if (q.includes("plaza") || q.includes("puesto") || q.includes("reparto") || q.includes("resumen") || q.includes("general") || q.includes("adjudicacion") || q.includes("total")) {
      if (mentionedSpec) {
        return AnalyticsEngine.getCutsReport(mentionedSpec);
      }
      return AnalyticsEngine.getGlobalSummary();
    }

    // 7. Si solo menciona una especialidad
    if (mentionedSpec) {
      return AnalyticsEngine.getCutsReport(mentionedSpec);
    }

    // 8. Intentar buscar como nombre o centro antes de rendirse
    const all = AnalyticsEngine.getAllInterinos();
    const candidateMatches = all.filter(p => p.norm_name && p.norm_name.includes(q));
    if (candidateMatches.length > 0 && candidateMatches.length <= 5) {
      return AnalyticsEngine.findPerson(text);
    }

    const centerMatches = all.filter(p => p.plaza && normalize(p.plaza.center || "").includes(q));
    if (centerMatches.length > 0) {
      return AnalyticsEngine.searchCentersAndPlaces(text);
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
