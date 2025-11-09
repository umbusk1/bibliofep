// ============================================
// REPORTES PÚBLICOS V2 - COMPLETO
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
// GRÁFICO: TEMAS - CON DEBUG
// ============================================

function createTopicsChart(data) {
    const ctx = document.getElementById('chartTopics');
    if (!ctx) {
        console.error('❌ Canvas chartTopics no encontrado');
        return;
    }
    
    const section = document.getElementById('sectionTopics');
    section.style.display = 'block';
    
    const sorted = [...data].sort((a, b) => b.count - a.count).slice(0, 10);
    const labels = sorted.map(item => item.topic);
    const values = sorted.map(item => Number(item.count));
    
    console.log('📊 Creando gráfico de temas');
    console.log('   Datos:', { labels, values });
    console.log('   Canvas:', ctx);
    console.log('   Canvas size:', ctx.width, 'x', ctx.height);
    console.log('   Canvas visible:', ctx.offsetWidth, 'x', ctx.offsetHeight);
    
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
        
        console.log('✅ Gráfico de temas creado:', App.charts.topics);
        
        // Verificar después de crear
        setTimeout(() => {
            console.log('🔍 Verificación post-creación:');
            console.log('   Canvas size:', ctx.width, 'x', ctx.height);
            console.log('   Visible:', ctx.offsetWidth, 'x', ctx.offsetHeight);
            console.log('   Parent:', ctx.parentElement);
            console.log('   Display:', window.getComputedStyle(ctx).display);
            console.log('   Visibility:', window.getComputedStyle(ctx).visibility);
        }, 1000);
        
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
    section.style.display = 'block';
    
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
// EXPORTAR A PDF - CON FORMATO
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
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const pdfContent = createPDFContent();
        document.body.appendChild(pdfContent);
        
        await html2pdf()
            .set({
                margin: 15,
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
            .from(pdfContent)
            .save();
        
        document.body.removeChild(pdfContent);
        
    } catch (error) {
        console.error('❌ Error PDF:', error);
        alert('Error al generar PDF');
    } finally {
        btn.disabled = false;
        btn.textContent = '📄 Descargar PDF';
    }
}

// ============================================
// CREAR CONTENIDO PARA PDF
// ============================================

function createPDFContent() {
    const stats = App.currentReport.stats_data;
    
    const container = document.createElement('div');
    container.style.cssText = 'position:absolute;left:-9999px;width:210mm;background:white;padding:20px;font-family:Arial,sans-serif;';
    
    let html = `
        <div style="text-align:center;margin-bottom:30px;border-bottom:3px solid #667eea;padding-bottom:20px;">
            <div style="margin-bottom:15px;">
                <img src="https://umbusk.com/wp-content/uploads/2024/10/cropped-logo-umbusk-2.png" 
                     style="max-width:150px;height:auto;" 
                     onerror="this.style.display='none'">
            </div>
            <h1 style="color:#667eea;font-size:24px;margin:10px 0;font-family:Arial,sans-serif;">${escapeHtml(App.currentReport.title)}</h1>
            <p style="color:#666;font-size:14px;margin:5px 0;">📅 ${formatDate(App.currentReport.period_start)} - ${formatDate(App.currentReport.period_end)}</p>
            <p style="color:#666;font-size:12px;margin:5px 0;">📤 Publicado: ${formatDateTime(App.currentReport.published_at)}</p>
        </div>
    `;
    
    html += `
        <table style="width:100%;margin:20px 0;border-collapse:collapse;">
            <tr>
                <td style="width:50%;padding:15px;text-align:center;border:2px solid #e0e0e0;background:#fafafa;">
                    <div style="font-size:32px;color:#667eea;font-weight:bold;margin-bottom:5px;">${Number(stats.general.total_conversations || 0).toLocaleString()}</div>
                    <div style="font-size:14px;color:#666;">💬 Conversaciones</div>
                </td>
                <td style="width:50%;padding:15px;text-align:center;border:2px solid #e0e0e0;background:#fafafa;">
                    <div style="font-size:32px;color:#667eea;font-weight:bold;margin-bottom:5px;">${Number(stats.general.total_messages || 0).toLocaleString()}</div>
                    <div style="font-size:14px;color:#666;">📨 Mensajes</div>
                </td>
            </tr>
            <tr>
                <td style="padding:15px;text-align:center;border:2px solid #e0e0e0;background:#fafafa;">
                    <div style="font-size:32px;color:#667eea;font-weight:bold;margin-bottom:5px;">${Number(stats.general.avg_messages_per_conversation || 0).toFixed(1)}</div>
                    <div style="font-size:14px;color:#666;">📊 Promedio</div>
                </td>
                <td style="padding:15px;text-align:center;border:2px solid #e0e0e0;background:#fafafa;">
                    <div style="font-size:32px;color:#667eea;font-weight:bold;margin-bottom:5px;">${stats.countries.length}</div>
                    <div style="font-size:14px;color:#666;">🌍 Países</div>
                </td>
            </tr>
        </table>
    `;
    
    const chartImages = getChartImages();
    
    if (chartImages.conversations) {
        html += `
            <div style="margin:30px 0;page-break-inside:avoid;">
                <h2 style="color:#667eea;font-size:18px;margin-bottom:15px;padding-bottom:10px;border-bottom:2px solid #e0e0e0;">📅 Conversaciones por Día</h2>
                <div style="text-align:center;">
                    <img src="${chartImages.conversations}" style="max-width:100%;height:auto;max-height:280px;">
                </div>
            </div>
        `;
    }
    
    if (chartImages.countries) {
        html += `
            <div style="margin:30px 0;page-break-inside:avoid;">
                <h2 style="color:#667eea;font-size:18px;margin-bottom:15px;padding-bottom:10px;border-bottom:2px solid #e0e0e0;">🌍 Distribución por País</h2>
                <div style="text-align:center;">
                    <img src="${chartImages.countries}" style="max-width:80%;height:auto;max-height:300px;">
                </div>
            </div>
        `;
    }
    
    if (chartImages.topics) {
        html += `
            <div style="margin:30px 0;page-break-inside:avoid;">
                <h2 style="color:#667eea;font-size:18px;margin-bottom:15px;padding-bottom:10px;border-bottom:2px solid #e0e0e0;">🎯 Temas Principales</h2>
                <div style="text-align:center;">
                    <img src="${chartImages.topics}" style="max-width:90%;height:auto;max-height:300px;">
                </div>
            </div>
        `;
    }
    
    if (chartImages.average) {
        html += `
            <div style="margin:30px 0;page-break-inside:avoid;">
                <h2 style="color:#667eea;font-size:18px;margin-bottom:15px;padding-bottom:10px;border-bottom:2px solid #e0e0e0;">📈 Promedio de Mensajes por Día</h2>
                <div style="text-align:center;">
                    <img src="${chartImages.average}" style="max-width:100%;height:auto;max-height:280px;">
                </div>
            </div>
        `;
    }
    
    container.innerHTML = html;
    return container;
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
        html += 'td{padding:15px;text-align:center;border:1px solid #ddd;background:#fafafa;}';
        html += '.stat-value{font-size:24px;font-weight:bold;color:#667eea;margin-bottom:5px;}';
        html += '.stat-label{font-size:12px;color:#666;}';
        html += 'h2{color:#667eea;margin:30px 0 15px;font-size:18px;}';
        html += 'img{max-width:100%;height:auto;margin:10px 0;}';
        html += '</style></head><body>';
        
        html += '<div style="text-align:center;margin-bottom:20px;">';
        html += '<img src="https://umbusk.com/wp-content/uploads/2024/10/cropped-logo-umbusk-2.png" style="max-width:150px;">';
        html += '</div>';
        
        html += `<h1>${escapeHtml(App.currentReport.title)}</h1>`;
        html += '<div class="meta">';
        html += `<p>📅 ${formatDate(App.currentReport.period_start)} - ${formatDate(App.currentReport.period_end)}</p>`;
        html += `<p>📤 Publicado: ${formatDateTime(App.currentReport.published_at)}</p>`;
        html += '</div>';
        
        html += '<table><tr>';
        html += `<td><div class="stat-value">${Number(stats.general.total_conversations || 0).toLocaleString()}</div><div class="stat-label">💬 Conversaciones</div></td>`;
        html += `<td><div class="stat-value">${Number(stats.general.total_messages || 0).toLocaleString()}</div><div class="stat-label">📨 Mensajes</div></td>`;
        html += '</tr><tr>';
        html += `<td><div class="stat-value">${Number(stats.general.avg_messages_per_conversation || 0).toFixed(1)}</div><div class="stat-label">📊 Promedio</div></td>`;
        html += `<td><div class="stat-value">${stats.countries.length}</div><div class="stat-label">🌍 Países</div></td>`;
        html += '</tr></table>';
        
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
// OBTENER IMÁGENES DE GRÁFICOS
// ============================================

function getChartImages() {
    const images = {};
    for (const [key, chart] of Object.entries(App.charts)) {
        if (chart?.canvas) {
            try {
                images[key] = chart.toBase64Image('image/png', 1.0);
            } catch (error) {
                console.error(`Error convirtiendo ${key}:`, error);
            }
        }
    }
    return images;
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
        `<div style="text-align:center;padding:50px;color:#c33;">${message}</div>`;
}
