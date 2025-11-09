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
        const response = await fetch('/.netlify/functions/auth-verify', {
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

    // Upload de JSON
    document.getElementById('selectFileBtn').addEventListener('click', () => {
        document.getElementById('jsonFileInput').click();
    });

    document.getElementById('jsonFileInput').addEventListener('change', handleFileSelect);
    document.getElementById('uploadBtn').addEventListener('click', uploadJSON);

    // Análisis de temas
    document.getElementById('analyzeTopicsBtn').addEventListener('click', analyzeTopics);

    // Filtros
    document.getElementById('filterType').addEventListener('change', handleFilterTypeChange);
    document.getElementById('applyFiltersBtn').addEventListener('click', applyFilters);
    document.getElementById('resetFiltersBtn').addEventListener('click', resetFilters);
    // Publicación de reportes
    setupPublishListener();
}

// ============================================
// UPLOAD DE JSON
// ============================================

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        document.getElementById('fileName').textContent = file.name;
        document.getElementById('uploadBtn').style.display = 'inline-block';
    }
}

async function uploadJSON() {
    const fileInput = document.getElementById('jsonFileInput');
    const file = fileInput.files[0];

    if (!file) {
        showStatus('uploadStatus', 'Por favor selecciona un archivo', 'error');
        return;
    }

    const uploadBtn = document.getElementById('uploadBtn');
    const statusDiv = document.getElementById('uploadStatus');
    const progressBar = document.getElementById('uploadProgress');

    uploadBtn.disabled = true;
    progressBar.style.display = 'block';
    showStatus('uploadStatus', 'Procesando archivo...', 'loading');

    try {
        // Leer el archivo
        const fileContent = await file.text();
        const jsonData = JSON.parse(fileContent);

        // Enviar a la API
        const response = await fetch('/.netlify/functions/upload-json', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(jsonData)
        });

        const result = await response.json();

        if (response.ok) {
            showStatus('uploadStatus', 
                `✅ Archivo procesado exitosamente!\n` +
                `Conversaciones: ${result.stats.conversationsProcessed}\n` +
                `Mensajes: ${result.stats.messagesProcessed}`, 
                'success'
            );

            // Recargar datos
            setTimeout(() => {
                loadInitialData();
            }, 2000);
        } else {
            showStatus('uploadStatus', `❌ Error: ${result.error}`, 'error');
        }

    } catch (error) {
        console.error('Error subiendo JSON:', error);
        showStatus('uploadStatus', `❌ Error al procesar: ${error.message}`, 'error');
    } finally {
        uploadBtn.disabled = false;
        progressBar.style.display = 'none';
        
        // Limpiar input
        fileInput.value = '';
        document.getElementById('fileName').textContent = '';
        uploadBtn.style.display = 'none';
    }
}

// ============================================
// ANÁLISIS DE TEMAS CON CLAUDE
// ============================================

async function analyzeTopics() {
    const btn = document.getElementById('analyzeTopicsBtn');
    const statusDiv = document.getElementById('analyzeStatus');

    btn.disabled = true;
    showStatus('analyzeStatus', '🤖 Analizando temas con Claude AI...', 'loading');

    try {
        // Primero, obtener IDs de conversaciones sin temas analizados
        const statsResponse = await fetch('/.netlify/functions/get-stats', {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (!statsResponse.ok) {
            throw new Error('Error obteniendo datos');
        }

        // Por ahora, vamos a analizar todas las conversaciones recientes
        // En producción, podrías filtrar solo las que no tienen temas
        const conversationIds = await getRecentConversationIds();

        if (conversationIds.length === 0) {
            showStatus('analyzeStatus', 'ℹ️ No hay conversaciones para analizar', 'info');
            btn.disabled = false;
            return;
        }

        // Llamar a la función de análisis
        const response = await fetch('/.netlify/functions/analyze-topics', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ conversationIds })
        });

        const result = await response.json();

        if (response.ok) {
            showStatus('analyzeStatus', 
                `✅ Análisis completado!\n` +
                `Temas identificados: ${result.topicsAnalyzed}\n` +
                `Guardados en BD: ${result.topicsSaved}`,
                'success'
            );

            // Recargar gráficos
            setTimeout(() => {
                applyFilters();
            }, 2000);
        } else {
            showStatus('analyzeStatus', `❌ Error: ${result.error}`, 'error');
        }

    } catch (error) {
        console.error('Error analizando temas:', error);
        showStatus('analyzeStatus', `❌ Error: ${error.message}`, 'error');
    } finally {
        btn.disabled = false;
    }
}

// Helper para obtener IDs de conversaciones recientes
async function getRecentConversationIds() {
    // Esta es una función simplificada
    // En producción, harías una consulta más específica
    return ['a8f85631-bd53-4e03-9a74-4383d96449d1']; // Ejemplo del JSON
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
        currentFilters.startDate = document.getElementById('startDate').value;
        currentFilters.endDate = document.getElementById('endDate').value;
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
}

async function loadStats() {
    try {
        // Construir URL con parámetros
        let url = '/.netlify/functions/get-stats?';
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
// GRÁFICO: CONVERSACIONES POR DÍA
// ============================================

function createConversationsByDayChart(data) {
    const ctx = document.getElementById('conversationsByDayChart');
    
    const labels = data.map(item => {
        const date = new Date(item.date);
        return date.toLocaleDateString('es-VE', { day: '2-digit', month: 'short' });
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
    const ctx = document.getElementById('topicsChart');
    
    if (data.length === 0) {
        ctx.parentElement.innerHTML = '<p class="no-data">No hay temas analizados. Usa el botón "Analizar Temas" para generar este gráfico.</p>';
        return;
    }

    const labels = data.map(item => item.topic_name);
    const values = data.map(item => parseInt(item.count));

    chartsInstances.topics = new Chart(ctx, {
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
// GRÁFICO: PROMEDIO DE MENSAJES POR DÍA
// ============================================

function createAvgMessagesChart(data) {
    const ctx = document.getElementById('avgMessagesChart');
    
    const labels = data.map(item => {
        const date = new Date(item.date);
        return date.toLocaleDateString('es-VE', { day: '2-digit', month: 'short' });
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
// HELPERS
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

// ============================================
// PUBLICAR REPORTE
// ============================================

function setupPublishListener() {
    document.getElementById('publishReportBtn').addEventListener('click', publishReport);
}

async function publishReport() {
    const title = document.getElementById('reportTitle').value.trim();
    
    if (!title) {
        showStatus('publishStatus', '⚠️ Por favor ingresa un título para el reporte', 'error');
        return;
    }

    const btn = document.getElementById('publishReportBtn');
    btn.disabled = true;
    showStatus('publishStatus', '📤 Publicando reporte...', 'loading');

    try {
        // Obtener estadísticas actuales
        let url = '/.netlify/functions/get-stats?';
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
        const publishResponse = await fetch('/.netlify/functions/publish-report', {
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
            showStatus('publishStatus', 
                `✅ Reporte publicado exitosamente!\n` +
                `Visible en: /reportes/public.html`,
                'success'
            );
            
            // Limpiar título
            document.getElementById('reportTitle').value = '';
        } else {
            showStatus('publishStatus', `❌ Error: ${result.error}`, 'error');
        }

    } catch (error) {
        console.error('Error publicando reporte:', error);
        showStatus('publishStatus', `❌ Error: ${error.message}`, 'error');
    } finally {
        btn.disabled = false;
    }
}
