// ============================================
// REPORTES PÚBLICOS V2 - VERSIÓN CORREGIDA
// ============================================

// Estado global
const App = {
    currentReport: null,
    charts: {},
    apiUrl: '/.netlify/functions/get-public-reports'
};

// ============================================
// INICIALIZACIÓN
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Iniciando sistema de reportes V2');
    init();
});

async function init() {
    setupEventListeners();
    await loadReports();
}

function setupEventListeners() {
    // Solo Word - PDF eliminado
    document.getElementById('btnWord').addEventListener('click', exportToWord);
}

// ============================================
// CARGAR REPORTES
// ============================================

async function loadReports() {
    try {
        console.log('📥 Cargando reportes...');
        const response = await fetch(App.apiUrl);
        
        if (!response.ok) throw new Error('Error al cargar reportes');
        
        const data = await response.json();
        console.log('✅ Reportes cargados:', data);
        
        renderReportsList(data.all);
        
        if (data.latest) {
            showReport(data.latest);
        }
        
    } catch (error) {
        console.error('❌ Error:', error);
        showError('No se pudieron cargar los reportes');
    }
}

// ============================================
// RENDERIZAR LISTA DE REPORTES
// ============================================

function renderReportsList(reports) {
    const container = document.getElementById('reportsList');
    
    if (!reports || reports.length === 0) {
        container.innerHTML = '<div class="loading">No hay reportes disponibles</div>';
        return;
    }
    
    container.innerHTML = reports.map((report, index) => `
        <div class="report-item ${index === 0 ? 'active' : ''}" 
             onclick="loadReportById(${report.id}, this)">
            <div class="report-item-title">${escapeHtml(report.title)}</div>
            <div class="report-item-date">
                📅 ${formatDate(report.period_start)} - ${formatDate(report.period_end)}
            </div>
            ${report.is_latest ? '<span class="report-item-badge">Más reciente</span>' : ''}
        </div>
    `).join('');
}

// ============================================
// CARGAR REPORTE POR ID - CORREGIDO
// ============================================

async function loadReportById(id, element) {
    try {
        console.log('📊 Cargando reporte ID:', id);
        const response = await fetch(`${App.apiUrl}?id=${id}`);
        
        if (!response.ok) throw new Error('Error al cargar reporte');
        
        const report = await response.json();
        showReport(report);
        
        // Actualizar estado activo - CORREGIDO
        document.querySelectorAll('.report-item').forEach(item => {
            item.classList.remove('active');
        });
        
        if (element) {
            element.classList.add('active');
        }
        
    } catch (error) {
        console.error('❌ Error:', error);
        alert('No se pudo cargar el reporte');
    }
}

// ============================================
// MOSTRAR REPORTE
// ============================================

function showReport(report) {
    console.log('📄 Mostrando reporte:', report);
    App.currentReport = report;
    
    const stats = report.stats_data;
    
    // Actualizar header
    document.getElementById('reportTitle').textContent = report.title;
    document.getElementById('reportPeriod').textContent = 
        `📅 Período: ${formatDate(report.period_start)} - ${formatDate(report.period_end)}`;
    document.getElementById('reportDate').textContent = 
        `📤 Publicado: ${formatDateTime(report.published_at)}`;
    
    // Actualizar estadísticas
    document.getElementById('totalConversations').textContent = 
        Number(stats.general.total_conversations || 0).toLocaleString();
    document.getElementById('totalMessages').textContent = 
        Number(stats.general.total_messages || 0).toLocaleString();
    document.getElementById('avgMessages').textContent = 
        Number(stats.general.avg_messages_per_conversation || 0).toFixed(1);
    document.getElementById('totalCountries').textContent = 
        stats.countries.length;
    
    // Crear gráficos
    createCharts(stats);
}

// ============================================
// CREAR GRÁFICOS
// ============================================

function createCharts(stats) {
    console.log('📊 Creando gráficos...');
    
    // Destruir gráficos anteriores
    Object.values(App.charts).forEach(chart => chart?.destroy());
    App.charts = {};
    
    // Gráfico 1: Conversaciones
    const convData = stats.conversationsByDay || stats.conversations_by_day || [];
    if (convData.length > 0) {
        createConversationsChart(convData);
    }
    
    // Gráfico 2: Países
    if (stats.countries?.length > 0) {
        createCountriesChart(stats.countries);
    }
    
    // Gráfico 3: Temas - MEJORADO
    if (stats.topics?.length > 0) {
        console.log('🎯 Datos de temas encontrados:', stats.topics);
        createTopicsChart(stats.topics);
    } else {
        console.log('⚠️ No hay datos de temas');
        document.getElementById('sectionTopics').style.display = 'none';
    }
    
    // Gráfico 4: Promedio
    const avgData = stats.avgMessagesByDay || stats.avg_messages_by_day || [];
    if (avgData.length > 0) {
        createAverageChart(avgData);
    } else {
        document.getElementById('sectionAverage').style.display = 'none';
    }
    
    console.log('✅ Gráficos creados');
}

// ============================================
// GRÁFICO: CONVERSACIONES POR DÍA
// ============================================

function createConversationsChart(data) {
    const ctx = document.getElementById('chartConversations');
    if (!ctx) return;
    
    const labels = data.map(item => formatShortDate(item.date));
    const values = data.map(item => Number(item.count));
    
    App.charts.conversations = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Conversaciones',
                data: values,
                backgroundColor: '#667eea',
                borderColor: '#4c63d2',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { stepSize: 1 }
                }
            }
        }
    });
}

// ============================================
// GRÁFICO: PAÍSES
// ============================================

function createCountriesChart(data) {
    const ctx = document.getElementById('chartCountries');
    if (!ctx) return;
    
    const sorted = [...data].sort((a, b) => b.count - a.count).slice(0, 10);
    const labels = sorted.map(item => item.country);
    const values = sorted.map(item => Number(item.count));
    
    const colors = [
        '#667eea', '#ed64a6', '#f6ad55', '#4fd1c5', '#9f7aea',
        '#fc8181', '#63b3ed', '#fbd38d', '#68d391', '#b794f4'
    ];
    
    App.charts.countries = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: colors,
                borderColor: '#ffffff',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'right'
                }
            }
        }
    });
}

// ============================================
// GRÁFICO: TEMAS - MEJORADO
// ============================================

function createTopicsChart(data) {
    const ctx = document.getElementById('chartTopics');
    if (!ctx) {
        console.error('❌ Canvas chartTopics no encontrado');
        return;
    }
    
    const section = document.getElementById('sectionTopics');
    if (section) {
        section.style.display = 'block';
    }
    
    const sorted = [...data].sort((a, b) => b.count - a.count).slice(0, 10);
    const labels = sorted.map(item => item.topic);
    const values = sorted.map(item => Number(item.count));
    
    console.log('📊 Creando gráfico de temas');
    console.log('   Labels:', labels);
    console.log('   Values:', values);
    
    try {
        App.charts.topics = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Menciones',
                    data: values,
                    backgroundColor: '#ed64a6',
                    borderColor: '#d53f8c',
                    borderWidth: 2
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: {
                        beginAtZero: true,
                        ticks: { stepSize: 1 }
                    }
                }
            }
        });
        
        console.log('✅ Gráfico de temas creado correctamente');
        
    } catch (error) {
        console.error('❌ Error creando gráfico de temas:', error);
    }
}

// ============================================
// GRÁFICO: PROMEDIO
// ============================================

function createAverageChart(data) {
    const ctx = document.getElementById('chartAverage');
    if (!ctx) return;
    
    const section = document.getElementById('sectionAverage');
    if (section) {
        section.style.display = 'block';
    }
    
    const labels = data.map(item => formatShortDate(item.date));
    const values = data.map(item => Number(item.avg_messages || item.avgMessages));
    
    App.charts.average = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Promedio',
                data: values,
                backgroundColor: 'rgba(237, 100, 166, 0.2)',
                borderColor: '#ed64a6',
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointBackgroundColor: '#d53f8c',
                pointBorderColor: '#ffffff',
                pointBorderWidth: 2,
                pointRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { display: false }
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
// EXPORTAR A WORD - MEJORADO Y OPTIMIZADO
// ============================================

async function exportToWord() {
    if (!App.currentReport) {
        alert('No hay reporte cargado');
        return;
    }
    
    const btn = document.getElementById('btnWord');
    btn.disabled = true;
    btn.textContent = '⏳ Generando Word...';
    
    try {
        // Esperar a que los gráficos estén completamente renderizados
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const stats = App.currentReport.stats_data;
        const images = await convertChartsToImages();
        
        // Crear HTML optimizado para Word con gráficos pequeños
        let html = `
<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" 
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
    <meta charset="UTF-8">
    <title>${escapeHtml(App.currentReport.title)}</title>
    <!--[if gte mso 9]>
    <xml>
        <w:WordDocument>
            <w:View>Print</w:View>
            <w:Zoom>90</w:Zoom>
        </w:WordDocument>
    </xml>
    <![endif]-->
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 30px;
            color: #2c3e50;
            line-height: 1.6;
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 3px solid #667eea;
        }
        .logo {
            max-width: 120px;
            margin-bottom: 15px;
        }
        h1 {
            color: #667eea;
            font-size: 24px;
            margin: 10px 0;
        }
        .meta {
            color: #666;
            font-size: 13px;
            margin: 5px 0;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
        }
        td {
            padding: 12px;
            text-align: center;
            border: 1px solid #ddd;
            background: #fafafa;
            width: 50%;
        }
        .stat-value {
            font-size: 28px;
            font-weight: bold;
            color: #667eea;
            margin-bottom: 5px;
        }
        .stat-label {
            font-size: 12px;
            color: #666;
        }
        .section {
            margin: 25px 0;
            page-break-inside: avoid;
        }
        h2 {
            color: #667eea;
            font-size: 16px;
            margin: 20px 0 10px;
            padding-bottom: 8px;
            border-bottom: 2px solid #e0e0e0;
        }
        .chart-img {
            display: block;
            margin: 15px auto;
            max-width: 100%;
            height: auto;
        }
        .chart-small {
            max-width: 450px;
        }
        .chart-medium {
            max-width: 400px;
        }
        .chart-large {
            max-width: 500px;
        }
    </style>
</head>
<body>
    <div class="header">
        <img src="https://umbusk.com/wp-content/uploads/2024/10/cropped-logo-umbusk-2.png" class="logo">
        <h1>${escapeHtml(App.currentReport.title)}</h1>
        <p class="meta">📅 ${formatDate(App.currentReport.period_start)} - ${formatDate(App.currentReport.period_end)}</p>
        <p class="meta">📤 Publicado: ${formatDateTime(App.currentReport.published_at)}</p>
    </div>
    
    <table>
        <tr>
            <td>
                <div class="stat-value">${Number(stats.general.total_conversations || 0).toLocaleString()}</div>
                <div class="stat-label">💬 Conversaciones</div>
            </td>
            <td>
                <div class="stat-value">${Number(stats.general.total_messages || 0).toLocaleString()}</div>
                <div class="stat-label">📨 Mensajes</div>
            </td>
        </tr>
        <tr>
            <td>
                <div class="stat-value">${Number(stats.general.avg_messages_per_conversation || 0).toFixed(1)}</div>
                <div class="stat-label">📊 Promedio por Conversación</div>
            </td>
            <td>
                <div class="stat-value">${stats.countries.length}</div>
                <div class="stat-label">🌍 Países</div>
            </td>
        </tr>
    </table>
`;

        // Agregar gráficos con tamaños optimizados
        if (images.conversations) {
            html += `
    <div class="section">
        <h2>📅 Conversaciones por Día</h2>
        <img src="${images.conversations}" class="chart-img chart-large" width="500">
    </div>
`;
        }
        
        if (images.countries) {
            html += `
    <div class="section">
        <h2>🌍 Distribución por País (Top 10)</h2>
        <img src="${images.countries}" class="chart-img chart-medium" width="380">
    </div>
`;
        }
        
        if (images.topics) {
            html += `
    <div class="section">
        <h2>🎯 Temas Principales (Top 10)</h2>
        <img src="${images.topics}" class="chart-img chart-large" width="480">
    </div>
`;
        }
        
        if (images.average) {
            html += `
    <div class="section">
        <h2>📈 Promedio de Mensajes por Día</h2>
        <img src="${images.average}" class="chart-img chart-large" width="500">
    </div>
`;
        }
        
        html += `
</body>
</html>`;
        
        // Crear y descargar el archivo
        const blob = new Blob(['\ufeff', html], { 
            type: 'application/msword;charset=utf-8' 
        });
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = sanitizeFilename(App.currentReport.title) + '.doc';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
        
        console.log('✅ Documento Word generado exitosamente');
        
    } catch (error) {
        console.error('❌ Error generando Word:', error);
        alert('Error al generar el documento Word. Por favor intenta de nuevo.');
    } finally {
        btn.disabled = false;
        btn.textContent = '📝 Descargar Word';
    }
}

// ============================================
// CONVERTIR GRÁFICOS A IMÁGENES BASE64
// ============================================

async function convertChartsToImages() {
    // Esperar un momento para asegurar que todo esté renderizado
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const images = {};
    
    console.log('🖼️ Convirtiendo gráficos a imágenes...');
    console.log('   Gráficos disponibles:', Object.keys(App.charts));
    
    for (const [key, chart] of Object.entries(App.charts)) {
        if (chart?.canvas) {
            try {
                images[key] = chart.toBase64Image('image/png', 1.0);
                console.log(`   ✅ ${key} convertido`);
            } catch (error) {
                console.error(`   ❌ Error convirtiendo ${key}:`, error);
            }
        }
    }
    
    console.log('✅ Conversión completada');
    return images;
}

// ============================================
// UTILIDADES
// ============================================

function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('es-VE', { 
        day: '2-digit', 
        month: 'short', 
        year: 'numeric' 
    });
}

function formatDateTime(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('es-VE', { 
        day: '2-digit', 
        month: 'short', 
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatShortDate(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('es-VE', { 
        day: '2-digit', 
        month: 'short' 
    });
}

function sanitizeFilename(name) {
    return name
        .replace(/[^a-z0-9áéíóúñ\s-]/gi, '')
        .replace(/\s+/g, '-')
        .toLowerCase();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showError(message) {
    document.getElementById('reportContent').innerHTML = 
        `<div style="text-align:center;padding:50px;color:#c33;">${message}</div>`;
}
