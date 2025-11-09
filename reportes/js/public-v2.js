// ============================================
// REPORTES PÚBLICOS V2 - DESDE CERO
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
    document.getElementById('btnPDF').addEventListener('click', exportToPDF);
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
             onclick="loadReportById(${report.id})">
            <div class="report-item-title">${escapeHtml(report.title)}</div>
            <div class="report-item-date">
                📅 ${formatDate(report.period_start)} - ${formatDate(report.period_end)}
            </div>
            ${report.is_latest ? '<span class="report-item-badge">Más reciente</span>' : ''}
        </div>
    `).join('');
}

// ============================================
// CARGAR REPORTE POR ID
// ============================================

async function loadReportById(id) {
    try {
        console.log('📊 Cargando reporte ID:', id);
        const response = await fetch(`${App.apiUrl}?id=${id}`);
        
        if (!response.ok) throw new Error('Error al cargar reporte');
        
        const report = await response.json();
        showReport(report);
        
        // Actualizar estado activo
        document.querySelectorAll('.report-item').forEach(item => {
            item.classList.remove('active');
        });
        event.target.closest('.report-item').classList.add('active');
        
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
    
    // Gráfico 3: Temas
    if (stats.topics?.length > 0) {
        createTopicsChart(stats.topics);
    } else {
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
// GRÁFICO: TEMAS
// ============================================

function createTopicsChart(data) {
    const ctx = document.getElementById('chartTopics');
    if (!ctx) {
        console.error('❌ Canvas chartTopics no encontrado');
        return;
    }
    
    document.getElementById('sectionTopics').style.display = 'block';
    
    const sorted = [...data].sort((a, b) => b.count - a.count).slice(0, 10);
    const labels = sorted.map(item => item.topic);
    const values = sorted.map(item => Number(item.count));
    
    console.log('📊 Creando gráfico de temas con', values.length, 'elementos');
    
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
    
    console.log('✅ Gráfico de temas creado');
}

// ============================================
// GRÁFICO: PROMEDIO
// ============================================

function createAverageChart(data) {
    const ctx = document.getElementById('chartAverage');
    if (!ctx) return;
    
    document.getElementById('sectionAverage').style.display = 'block';
    
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
// EXPORTAR A PDF
// ============================================

async function exportToPDF() {
    if (!App.currentReport) {
        alert('No hay reporte cargado');
        return;
    }
    
    const btn = document.getElementById('btnPDF');
    btn.disabled = true;
    btn.textContent = '⏳ Generando...';
    
    try {
        // Esperar renderizado
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        const element = document.getElementById('reportContent');
        
        // Ocultar botones
        const buttons = document.querySelector('.export-buttons');
        buttons.style.display = 'none';
        
        await html2pdf()
            .set({
                margin: 10,
                filename: sanitizeFilename(App.currentReport.title) + '.pdf',
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { 
                    scale: 2,
                    logging: false,
                    backgroundColor: '#ffffff'
                },
                jsPDF: { 
                    unit: 'mm', 
                    format: 'letter', 
                    orientation: 'portrait' 
                }
            })
            .from(element)
            .save();
        
        buttons.style.display = '';
        
    } catch (error) {
        console.error('❌ Error PDF:', error);
        alert('Error al generar PDF');
    } finally {
        btn.disabled = false;
        btn.textContent = '📄 Descargar PDF';
    }
}

// ============================================
// EXPORTAR A WORD
// ============================================

async function exportToWord() {
    if (!App.currentReport) {
        alert('No hay reporte cargado');
        return;
    }
    
    const btn = document.getElementById('btnWord');
    btn.disabled = true;
    btn.textContent = '⏳ Generando...';
    
    try {
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const stats = App.currentReport.stats_data;
        const images = await convertChartsToImages();
        
        let html = '<!DOCTYPE html><html><head><meta charset="UTF-8">';
        html += '<style>';
        html += 'body{font-family:Arial;margin:30px;color:#2c3e50;}';
        html += 'h1{color:#667eea;text-align:center;margin-bottom:10px;}';
        html += '.meta{text-align:center;color:#666;margin-bottom:30px;font-size:14px;}';
        html += 'table{width:100%;border-collapse:collapse;margin:20px 0;}';
        html += 'td{padding:15px;text-align:center;border:1px solid #ddd;}';
        html += '.stat-value{font-size:24px;font-weight:bold;color:#667eea;}';
        html += '.stat-label{font-size:12px;color:#666;margin-top:5px;}';
        html += 'h2{color:#667eea;margin:30px 0 15px;font-size:18px;}';
        html += 'img{max-width:100%;height:auto;margin:10px 0;}';
        html += '</style></head><body>';
        
        // Header
        html += `<h1>${escapeHtml(App.currentReport.title)}</h1>`;
        html += '<div class="meta">';
        html += `<p>📅 ${formatDate(App.currentReport.period_start)} - ${formatDate(App.currentReport.period_end)}</p>`;
        html += `<p>📤 Publicado: ${formatDateTime(App.currentReport.published_at)}</p>`;
        html += '</div>';
        
        // Stats
        html += '<table><tr>';
        html += `<td><div class="stat-value">${Number(stats.general.total_conversations || 0).toLocaleString()}</div><div class="stat-label">💬 Conversaciones</div></td>`;
        html += `<td><div class="stat-value">${Number(stats.general.total_messages || 0).toLocaleString()}</div><div class="stat-label">📨 Mensajes</div></td>`;
        html += `<td><div class="stat-value">${Number(stats.general.avg_messages_per_conversation || 0).toFixed(1)}</div><div class="stat-label">📊 Promedio</div></td>`;
        html += `<td><div class="stat-value">${stats.countries.length}</div><div class="stat-label">🌍 Países</div></td>`;
        html += '</tr></table>';
        
        // Charts
        if (images.conversations) {
            html += '<h2>📅 Conversaciones por Día</h2>';
            html += `<img src="${images.conversations}" width="600">`;
        }
        
        if (images.countries) {
            html += '<h2>🌍 Distribución por País</h2>';
            html += `<img src="${images.countries}" width="500">`;
        }
        
        if (images.topics) {
            html += '<h2>🎯 Temas Principales</h2>';
            html += `<img src="${images.topics}" width="550">`;
        }
        
        if (images.average) {
            html += '<h2>📈 Promedio de Mensajes</h2>';
            html += `<img src="${images.average}" width="600">`;
        }
        
        html += '</body></html>';
        
        // Download
        const blob = new Blob([html], { type: 'application/msword' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = sanitizeFilename(App.currentReport.title) + '.doc';
        link.click();
        URL.revokeObjectURL(link.href);
        
    } catch (error) {
        console.error('❌ Error Word:', error);
        alert('Error al generar documento Word');
    } finally {
        btn.disabled = false;
        btn.textContent = '📝 Descargar Word';
    }
}

// ============================================
// CONVERTIR GRÁFICOS A IMÁGENES
// ============================================

async function convertChartsToImages() {
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const images = {};
    for (const [key, chart] of Object.entries(App.charts)) {
        if (chart?.canvas) {
            images[key] = chart.toBase64Image('image/png', 1.0);
        }
    }
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
        `<div class="error-message">${message}</div>`;
}
