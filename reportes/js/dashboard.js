// ============================================
// DASHBOARD - SCRIPT PRINCIPAL
// ============================================

// Variables globales
let authToken = null;
let currentFilters = {};
let chartsInstances = {};

// ============================================
// INICIALIZACIÓN
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    // Verificar autenticación
    authToken = localStorage.getItem('authToken');
    if (!authToken) {
        window.location.href = 'login.html';
        return;
    }

    // Verificar que el token sea válido
    verifyAuth();

    // Cargar información del usuario
    loadUserInfo();

    // Configurar event listeners
    setupEventListeners();

    // Cargar datos iniciales (mes actual)
    loadInitialData();
});

// ============================================
// AUTENTICACIÓN
// ============================================

async function verifyAuth() {
    try {
        const response = await fetch('/api/auth-verify', {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (!response.ok) {
            logout();
        }
    } catch (error) {
        console.error('Error verificando auth:', error);
        logout();
    }
}

function loadUserInfo() {
    const email = localStorage.getItem('userEmail');
    const role = localStorage.getItem('userRole');

    document.getElementById('userEmail').textContent = email;
    document.getElementById('userRole').textContent = role === 'admin' ? 'Administrador' : 'Visualizador';
}

function logout() {
    localStorage.clear();
    window.location.href = 'login.html';
}

// ============================================
// EVENT LISTENERS
// ============================================

function setupEventListeners() {
    // Logout
    document.getElementById('logoutBtn').addEventListener('click', logout);

    // Upload de JSON - NUEVO: usa el input oculto directamente
    document.getElementById('jsonFileInput').addEventListener('change', handleFileSelect);

    // Filtros
    document.getElementById('filterType').addEventListener('change', handleFilterTypeChange);
    document.getElementById('applyFiltersBtn').addEventListener('click', applyFilters);
    document.getElementById('resetFiltersBtn').addEventListener('click', resetFilters);
}

// ============================================
// FUNCIONES PARA BOTONES SUPERIORES
// ============================================

// Función global para abrir el selector de archivos
window.openFileSelector = function() {
    document.getElementById('jsonFileInput').click();
}

// Función global para mostrar/ocultar sección de análisis
window.showAnalysisSection = function() {
    const section = document.getElementById('analysisSection');
    if (section.classList.contains('section-hidden')) {
        section.classList.remove('section-hidden');
    } else {
        section.classList.add('section-hidden');
    }
}

// Función global para publicar reporte desde la barra superior
window.publishReport = async function() {
    const title = document.getElementById('reportTitleInput').value.trim();

    if (!title) {
        alert('⚠️ Por favor escribe un título para el reporte');
        return;
    }

    const btn = event.target; // El botón que fue clickeado
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '⏳ Publicando...';

    try {
        // Obtener estadísticas actuales
        let url = '/api/get-stats?';
        const params = new URLSearchParams(currentFilters);
        url += params.toString();

        const statsResponse = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (!statsResponse.ok) {
            throw new Error('Error obteniendo estadísticas');
        }

        const statsData = await statsResponse.json();

        // Publicar el reporte
        const publishResponse = await fetch('/api/publish-report', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                title,
                filters: currentFilters,
                statsData
            })
        });

        const result = await publishResponse.json();

        if (publishResponse.ok) {
            alert(`✅ Reporte publicado exitosamente!\n\nVisualizar en: ${window.location.origin}/reportes/public.html`);

            // Limpiar título
            document.getElementById('reportTitleInput').value = '';
        } else {
            alert(`❌ Error: ${result.error}`);
        }

    } catch (error) {
        console.error('Error publicando reporte:', error);
        alert(`❌ Error: ${error.message}`);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

// ============================================
// UPLOAD DE JSON
// ============================================

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Mostrar diálogo de confirmación
    const confirmMsg = `📄 Archivo seleccionado: ${file.name}\n\n¿Procesar este archivo?`;
    if (!confirm(confirmMsg)) {
        event.target.value = ''; // Limpiar selección
        return;
    }

    // Procesar automáticamente
    uploadJSON(file);
}

async function uploadJSON(file) {
    // Mostrar modal o overlay de carga
    const loadingOverlay = showLoadingOverlay('Procesando archivo JSON...');

    try {
        // Leer el archivo
        const fileContent = await file.text();
        const jsonData = JSON.parse(fileContent);

        // Enviar a la API
        const response = await fetch('/api/upload-json', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(jsonData)
        });

        const result = await response.json();

if (response.ok) {
    let message = `✅ Archivo procesado exitosamente!\n\n` +
        `📊 Conversaciones: ${result.stats.conversationsProcessed}\n` +
        `💬 Mensajes: ${result.stats.messagesProcessed}`;

    // Si hubo análisis automático, agregar información
    if (result.analysis && result.analysis.topicsSaved > 0) {
        message += `\n\n🤖 Análisis automático completado:\n` +
            `✓ ${result.analysis.topicsSaved} temas identificados\n` +
            `✓ ${result.analysis.conversationsAnalyzed} conversaciones analizadas`;
    }

    alert(message);

    // Recargar datos
    setTimeout(() => {
        loadInitialData();
    }, 1000);
} else {
            alert(`❌ Error: ${result.error}`);
        }

    } catch (error) {
        console.error('Error subiendo JSON:', error);
        alert(`❌ Error al procesar: ${error.message}`);
    } finally {
        hideLoadingOverlay(loadingOverlay);

        // Limpiar input
        document.getElementById('jsonFileInput').value = '';
    }
}

// ============================================
// RE-ANALIZAR TEMAS - VERSIÓN ITERATIVA
// ============================================

window.analyzeRemainingTopics = async function() {
    const confirmMsg = '¿Iniciar análisis automático de todas las conversaciones sin temas?\n\nEsto puede tomar varios minutos.';

    if (!confirm(confirmMsg)) {
        return;
    }

    let totalConversations = 0;
    let totalTopics = 0;
    let iteration = 0;
    let hasMore = true;

    const loadingOverlay = showLoadingOverlay('🤖 Analizando conversaciones...\n\nLote 0 procesado');

    try {
        // Iterar hasta que no haya más conversaciones
        while (hasMore && iteration < 50) { // Máximo 50 iteraciones (500 conversaciones)
            iteration++;

            // Actualizar mensaje del overlay
            const overlayText = loadingOverlay.querySelector('h3');
            if (overlayText) {
                overlayText.textContent = `🤖 Análisis en progreso...\n\nLote ${iteration} - ${totalConversations} conversaciones procesadas`;
            }

            console.log(`--- Iteración ${iteration}: Llamando a analyze-topics ---`);

            const response = await fetch('/.netlify/functions/analyze-topics', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify({})
            });

            // Verificar si la respuesta es JSON válido
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                throw new Error('La respuesta del servidor no es JSON válido');
            }

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Error del servidor');
            }

            console.log(`✓ Lote ${iteration} completado:`, result);

            // Acumular totales
            totalConversations += result.conversationsAnalyzed || 0;
            totalTopics += result.topicsSaved || 0;

            // Verificar si hay más conversaciones
            if (result.conversationsAnalyzed === 0) {
                hasMore = false;
                console.log('✓ No hay más conversaciones para analizar');
            }

            // Pausa de 2 segundos entre iteraciones
            if (hasMore) {
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }

        hideLoadingOverlay(loadingOverlay);

        // Mensaje final
        if (totalConversations === 0) {
            alert('✅ Todas las conversaciones ya tienen temas analizados.\n\nNo hay nada que procesar.');
        } else {
            const message = `✅ Análisis automático completado!\n\n` +
                `📊 Conversaciones analizadas: ${totalConversations}\n` +
                `🎯 Temas guardados: ${totalTopics}\n` +
                `🔄 Iteraciones: ${iteration}`;

            alert(message);

            // Recargar gráficos
            setTimeout(() => {
                loadStats();
            }, 1000);
        }

    } catch (error) {
        hideLoadingOverlay(loadingOverlay);
        console.error('❌ Error en análisis iterativo:', error);

        // Mostrar progreso incluso si hubo error
        const partialMessage = totalConversations > 0
            ? `\n\nProgreso parcial:\n📊 ${totalConversations} conversaciones\n🎯 ${totalTopics} temas`
            : '';

        alert(`❌ Error: ${error.message}${partialMessage}\n\nRevisa la consola para más detalles.`);
    }
}

// ============================================
// FILTROS
// ============================================

function handleFilterTypeChange() {
    const filterType = document.getElementById('filterType').value;

    // Ocultar todos los filtros
    document.getElementById('monthFilter').style.display = 'none';
    document.getElementById('yearFilterMonth').style.display = 'none';
    document.getElementById('rangeFilter').style.display = 'none';
    document.getElementById('rangeFilterEnd').style.display = 'none';

    // Mostrar filtros según tipo seleccionado
    if (filterType === 'month') {
        document.getElementById('monthFilter').style.display = 'block';
        document.getElementById('yearFilterMonth').style.display = 'block';
    } else if (filterType === 'range') {
        document.getElementById('rangeFilter').style.display = 'block';
        document.getElementById('rangeFilterEnd').style.display = 'block';
    }
}

function applyFilters() {
    const filterType = document.getElementById('filterType').value;

    currentFilters = {};

    if (filterType === 'month') {
        currentFilters.month = document.getElementById('monthSelect').value;
        currentFilters.year = document.getElementById('yearSelectMonth').value;
    } else if (filterType === 'range') {
        // Obtener fechas del input (formato YYYY-MM-DD del input[type="date"])
        const startDateInput = document.getElementById('startDate').value;
        const endDateInput = document.getElementById('endDate').value;

        if (!startDateInput || !endDateInput) {
            alert('Por favor selecciona ambas fechas');
            return;
        }

        // Convertir a formato ISO para la API (YYYY-MM-DD)
        currentFilters.startDate = startDateInput;
        currentFilters.endDate = endDateInput;

        console.log('Filtros aplicados:', currentFilters);
    }

    loadStats();
}

function resetFilters() {
    document.getElementById('filterType').value = 'month';
    handleFilterTypeChange();
    loadInitialData();
}

// ============================================
// CARGA DE DATOS
// ============================================

function loadInitialData() {
    // Establecer mes y año actual por defecto
    const now = new Date();
    document.getElementById('monthSelect').value = now.getMonth() + 1;
    document.getElementById('yearSelectMonth').value = now.getFullYear();

    currentFilters = {
        month: now.getMonth() + 1,
        year: now.getFullYear()
    };

    loadStats();

    // Cargar reportes publicados si es admin
    loadPublishedReports();
}

async function loadStats() {
    try {
        // Construir URL con parámetros
        let url = '/api/get-stats?';
        const params = new URLSearchParams(currentFilters);
        url += params.toString();

        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (!response.ok) {
            throw new Error('Error cargando estadísticas');
        }

        const stats = await response.json();

        // Actualizar estadísticas generales
        updateGeneralStats(stats.general);

        // Actualizar gráficos
        updateCharts(stats);

    } catch (error) {
        console.error('Error cargando estadísticas:', error);
        alert('Error al cargar estadísticas. Por favor intenta de nuevo.');
    }
}

// ============================================
// ACTUALIZAR ESTADÍSTICAS GENERALES
// ============================================

function updateGeneralStats(general) {
    document.getElementById('totalConversations').textContent =
        parseInt(general.total_conversations || 0).toLocaleString();

    document.getElementById('totalMessages').textContent =
        parseInt(general.total_messages || 0).toLocaleString();

    document.getElementById('avgMessages').textContent =
        parseFloat(general.avg_messages_per_conversation || 0).toFixed(1);

    // Contar países únicos (se calculará desde el gráfico de países)
    document.getElementById('totalCountries').textContent = '-';
}

// ============================================
// ACTUALIZAR GRÁFICOS
// ============================================

function updateCharts(stats) {
    // Destruir gráficos existentes
    Object.values(chartsInstances).forEach(chart => chart.destroy());
    chartsInstances = {};

    // Crear nuevos gráficos
    createConversationsByDayChart(stats.conversationsByDay);
    createCountriesChart(stats.countries);
    createTopicsChart(stats.topics);
    createAvgMessagesChart(stats.avgMessagesByDay);
}

// ============================================
// GRÁFICO: CONVERSACIONES POR DÍA - CORREGIDO
// ============================================

function createConversationsByDayChart(data) {
    const ctx = document.getElementById('conversationsByDayChart');

    // CORRECCIÓN: Extraer fecha sin conversión de zona horaria
    const labels = data.map(item => {
        const dateStr = item.date.split('T')[0]; // "2025-11-01"
        const [year, month, day] = dateStr.split('-');
        const monthNames = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
        return `${day} ${monthNames[parseInt(month) - 1]}`;
    });

    const values = data.map(item => parseInt(item.count));

    chartsInstances.conversationsByDay = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Conversaciones',
                data: values,
                backgroundColor: 'rgba(102, 126, 234, 0.8)',
                borderColor: 'rgba(102, 126, 234, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    }
                }
            }
        }
    });
}

// ============================================
// GRÁFICO: PAÍSES
// ============================================

function createCountriesChart(data) {
    const ctx = document.getElementById('countriesChart');

    const labels = data.map(item => item.country || 'Desconocido');
    const values = data.map(item => parseInt(item.count));

    // Actualizar total de países
    document.getElementById('totalCountries').textContent = data.length;

    // Colores para el pie chart
    const colors = [
        'rgba(102, 126, 234, 0.8)',
        'rgba(118, 75, 162, 0.8)',
        'rgba(237, 100, 166, 0.8)',
        'rgba(255, 154, 158, 0.8)',
        'rgba(250, 208, 196, 0.8)',
        'rgba(163, 228, 215, 0.8)',
        'rgba(130, 204, 221, 0.8)'
    ];

    chartsInstances.countries = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: colors,
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'bottom'
                }
            }
        }
    });
}

// ============================================
// GRÁFICO: TEMAS MÁS CONSULTADOS
// ============================================

function createTopicsChart(data) {
    const canvas = document.getElementById('topicsChart');
    const container = canvas.parentElement;

    // Destruir gráfico anterior si existe
    if (chartsInstances.topics) {
        chartsInstances.topics.destroy();
        delete chartsInstances.topics;
    }

    if (!data || data.length === 0) {
        // Reemplazar canvas con mensaje
        canvas.style.display = 'none';

        // Buscar si ya existe un mensaje
        let message = container.querySelector('.no-data');
        if (!message) {
            message = document.createElement('p');
            message.className = 'no-data';
            message.style.textAlign = 'center';
            message.style.padding = '40px 20px';
            message.style.color = '#666';
            message.textContent = 'No hay temas analizados. Usa el botón "🤖 Análisis con Claude AI" para generar este gráfico.';
            container.appendChild(message);
        }
        return;
    }

    // Mostrar canvas y eliminar mensaje si existe
    canvas.style.display = 'block';
    const existingMessage = container.querySelector('.no-data');
    if (existingMessage) {
        existingMessage.remove();
    }

    const labels = data.map(item => item.topic_name);
    const values = data.map(item => parseInt(item.count));

    chartsInstances.topics = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Menciones',
                data: values,
                backgroundColor: 'rgba(118, 75, 162, 0.8)',
                borderColor: 'rgba(118, 75, 162, 1)',
                borderWidth: 1
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    }
                }
            }
        }
    });
}

// ============================================
// GRÁFICO: PROMEDIO DE MENSAJES POR DÍA - CORREGIDO
// ============================================

function createAvgMessagesChart(data) {
    const ctx = document.getElementById('avgMessagesChart');

    // CORRECCIÓN: Extraer fecha sin conversión de zona horaria
    const labels = data.map(item => {
        const dateStr = item.date.split('T')[0]; // "2025-11-01"
        const [year, month, day] = dateStr.split('-');
        const monthNames = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
        return `${day} ${monthNames[parseInt(month) - 1]}`;
    });

    const values = data.map(item => parseFloat(item.avg_messages).toFixed(1));

    chartsInstances.avgMessages = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Promedio de Mensajes',
                data: values,
                backgroundColor: 'rgba(237, 100, 166, 0.8)',
                borderColor: 'rgba(237, 100, 166, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}

// ============================================
// HELPERS - LOADING OVERLAY
// ============================================

function showLoadingOverlay(message) {
    const overlay = document.createElement('div');
    overlay.id = 'loadingOverlay';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
    `;

    const content = document.createElement('div');
    content.style.cssText = `
        background: white;
        padding: 40px;
        border-radius: 12px;
        text-align: center;
        box-shadow: 0 10px 40px rgba(0,0,0,0.3);
    `;

    content.innerHTML = `
        <div style="font-size: 48px; margin-bottom: 20px;">⏳</div>
        <h3 style="margin: 0 0 10px 0; color: #333;">${message}</h3>
        <p style="margin: 0; color: #666;">Por favor espera...</p>
    `;

    overlay.appendChild(content);
    document.body.appendChild(overlay);

    return overlay;
}

function hideLoadingOverlay(overlay) {
    if (overlay && overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
    }
}

// ============================================
// HELPERS - STATUS MESSAGES
// ============================================

function showStatus(elementId, message, type) {
    const element = document.getElementById(elementId);
    element.textContent = message;
    element.className = `status-message status-${type}`;
    element.style.display = 'block';

    if (type === 'success') {
        setTimeout(() => {
            element.style.display = 'none';
        }, 5000);
    }
}

// Función global para abrir reportes públicos
window.openPublicReports = function() {
    const publicUrl = window.location.origin + '/reportes/public-v2.html';
    window.open(publicUrl, '_blank');
}

// ============================================
// GESTIÓN DE REPORTES PUBLICADOS
// ============================================

async function loadPublishedReports() {
    const userRole = localStorage.getItem('userRole');
    const section = document.getElementById('manageReportsSection');

    // Solo mostrar para admin
    if (userRole !== 'admin') {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'block';

    try {
        const response = await fetch('/.netlify/functions/get-public-reports');

        if (!response.ok) throw new Error('Error cargando reportes');

        const data = await response.json();
        renderPublishedReports(data.all || []);

    } catch (error) {
        console.error('Error cargando reportes publicados:', error);
        document.getElementById('publishedReportsList').innerHTML =
            '<p style="color: #c33;">Error al cargar reportes</p>';
    }
}

function renderPublishedReports(reports) {
    const container = document.getElementById('publishedReportsList');

    if (reports.length === 0) {
        container.innerHTML = '<p style="color: #666; font-style: italic;">No hay reportes publicados</p>';
        return;
    }

    container.innerHTML = `
        <table style="width: 100%; border-collapse: collapse;">
            <thead>
                <tr style="background: #f7fafc; border-bottom: 2px solid #e2e8f0;">
                    <th style="padding: 12px; text-align: left; font-weight: 600;">Título</th>
                    <th style="padding: 12px; text-align: left; font-weight: 600;">Período</th>
                    <th style="padding: 12px; text-align: left; font-weight: 600;">Publicado</th>
                    <th style="padding: 12px; text-align: center; font-weight: 600;">Acciones</th>
                </tr>
            </thead>
            <tbody>
                ${reports.map(report => `
                    <tr style="border-bottom: 1px solid #e2e8f0;">
                        <td style="padding: 12px;">${escapeHtml(report.title)}</td>
                        <td style="padding: 12px; font-size: 13px; color: #666;">
                            ${formatDateShort(report.period_start)} - ${formatDateShort(report.period_end)}
                        </td>
                        <td style="padding: 12px; font-size: 13px; color: #666;">
                            ${formatDateShort(report.published_at)}
                        </td>
                        <td style="padding: 12px; text-align: center;">
                            <button onclick="deleteReport(${report.id}, '${escapeHtml(report.title)}')"
                                    class="btn-secondary"
                                    style="padding: 6px 12px; font-size: 13px; background: #fed7d7; color: #c53030; border: 1px solid #fc8181;">
                                🗑️ Eliminar
                            </button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

async function deleteReport(reportId, reportTitle) {
    const confirmMsg = `¿Eliminar este reporte?\n\n"${reportTitle}"\n\nEsta acción no se puede deshacer.`;

    if (!confirm(confirmMsg)) {
        return;
    }

    const loadingOverlay = showLoadingOverlay('Eliminando reporte...');

    try {
        const response = await fetch(`/.netlify/functions/delete-report?id=${reportId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        const result = await response.json();

        hideLoadingOverlay(loadingOverlay);

        if (response.ok) {
            alert(`✅ Reporte eliminado exitosamente:\n\n"${result.reportTitle}"`);

            // Recargar lista
            loadPublishedReports();
        } else {
            alert(`❌ Error: ${result.error}`);
        }

    } catch (error) {
        hideLoadingOverlay(loadingOverlay);
        console.error('Error eliminando reporte:', error);
        alert(`❌ Error: ${error.message}`);
    }
}

function formatDateShort(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('es-VE', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
