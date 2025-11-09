// ============================================
// REPORTES PÚBLICOS - SCRIPT PRINCIPAL
// ============================================

let currentReport = null;
let charts = {};

// ============================================
// INICIALIZACIÓN
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    loadReports();
    setupExportButtons();
});

// ============================================
// CARGAR LISTA DE REPORTES
// ============================================

async function loadReports() {
    try {
        const response = await fetch('/.netlify/functions/get-public-reports');
        
        if (!response.ok) {
            throw new Error('Error cargando reportes');
        }

        const data = await response.json();

        // Mostrar lista de reportes en el sidebar
        displayReportsList(data.all);

        // Cargar el reporte más reciente
        if (data.latest) {
            displayReport(data.latest);
        } else {
            showNoReportsMessage();
        }

    } catch (error) {
        console.error('Error:', error);
        showErrorMessage();
    }
}

// ============================================
// MOSTRAR LISTA DE REPORTES
// ============================================

function displayReportsList(reports) {
    const listContainer = document.getElementById('reportsList');
    
    if (!reports || reports.length === 0) {
        listContainer.innerHTML = '<p class="loading-text">No hay reportes disponibles</p>';
        return;
    }

    listContainer.innerHTML = reports.map((report, index) => `
        <div class="report-item ${index === 0 ? 'active' : ''}" onclick="loadSpecificReport(${report.id})">
            <div class="report-item-title">${report.title}</div>
            <div class="report-item-date">
                📅 ${formatDate(report.period_start)} - ${formatDate(report.period_end)}
            </div>
            ${report.is_latest ? '<span class="report-item-badge">Más reciente</span>' : ''}
        </div>
    `).join('');
}

// ============================================
// CARGAR REPORTE ESPECÍFICO
// ============================================

async function loadSpecificReport(reportId) {
    try {
        const response = await fetch(`/.netlify/functions/get-public-reports?id=${reportId}`);
        
        if (!response.ok) {
            throw new Error('Error cargando reporte');
        }

        const report = await response.json();
        displayReport(report);

        // Actualizar item activo en la lista
        document.querySelectorAll('.report-item').forEach(item => {
            item.classList.remove('active');
        });
        event.target.closest('.report-item').classList.add('active');

    } catch (error) {
        console.error('Error:', error);
        alert('Error al cargar el reporte');
    }
}

// ============================================
// MOSTRAR REPORTE
// ============================================

function displayReport(report) {
    currentReport = report;
    const statsData = report.stats_data;

    // Actualizar header del reporte
    document.getElementById('reportTitle').textContent = report.title;
    document.getElementById('reportPeriod').textContent = 
        `📅 Período: ${formatDate(report.period_start)} - ${formatDate(report.period_end)}`;
    document.getElementById('reportDate').textContent = 
        `📤 Publicado: ${formatDateTime(report.published_at)}`;

    // Actualizar estadísticas generales
    document.getElementById('statConversations').textContent = 
        parseInt(statsData.general.total_conversations || 0).toLocaleString();
    document.getElementById('statMessages').textContent = 
        parseInt(statsData.general.total_messages || 0).toLocaleString();
    document.getElementById('statAverage').textContent = 
        parseFloat(statsData.general.avg_messages_per_conversation || 0).toFixed(1);
    document.getElementById('statCountries').textContent = 
        statsData.countries.length;

    // Crear gráficos
    createCharts(statsData);
}

// ============================================
// CREAR GRÁFICOS
// ============================================

function createCharts(statsData) {
    // Destruir gráficos existentes
    Object.values(charts).forEach(chart => chart.destroy());
    charts = {};

    // Gráfico 1: Conversaciones por día
    createConversationsByDayChart(statsData.conversationsByDay);

    // Gráfico 2: Países
    createCountriesChart(statsData.countries);

    // Gráfico 3: Temas
    createTopicsChart(statsData.topics);

    // Gráfico 4: Promedio de mensajes
    createAverageMessagesChart(statsData.avgMessagesByDay);
}

// ============================================
// GRÁFICO: CONVERSACIONES POR DÍA
// ============================================

function createConversationsByDayChart(data) {
    const ctx = document.getElementById('chartConversations');
    
    const labels = data.map(item => {
        const date = new Date(item.date);
        return date.toLocaleDateString('es-VE', { day: '2-digit', month: 'short' });
    });
    
    const values = data.map(item => parseInt(item.count));

    charts.conversations = new Chart(ctx, {
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
    
    const labels = data.map(item => item.country || 'Desconocido');
    const values = data.map(item => parseInt(item.count));

    const colors = [
        'rgba(102, 126, 234, 0.8)',
        'rgba(118, 75, 162, 0.8)',
        'rgba(237, 100, 166, 0.8)',
        'rgba(255, 154, 158, 0.8)',
        'rgba(250, 208, 196, 0.8)',
        'rgba(163, 228, 215, 0.8)',
        'rgba(130, 204, 221, 0.8)'
    ];

    charts.countries = new Chart(ctx, {
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
                legend: { position: 'bottom' }
            }
        }
    });
}

// ============================================
// GRÁFICO: TEMAS
// ============================================

function createTopicsChart(data) {
    const ctx = document.getElementById('chartTopics');
    const container = ctx.parentElement;
    
    if (!data || data.length === 0) {
        container.innerHTML = '<p class="no-topics-message">No hay temas analizados para este período</p>';
        return;
    }

    const labels = data.map(item => item.topic_name);
    const values = data.map(item => parseInt(item.count));

    charts.topics = new Chart(ctx, {
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
}

// ============================================
// GRÁFICO: PROMEDIO DE MENSAJES
// ============================================

function createAverageMessagesChart(data) {
    const ctx = document.getElementById('chartAverage');
    
    const labels = data.map(item => {
        const date = new Date(item.date);
        return date.toLocaleDateString('es-VE', { day: '2-digit', month: 'short' });
    });
    
    const values = data.map(item => parseFloat(item.avg_messages).toFixed(1));

    charts.average = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Promedio',
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
                legend: { display: false }
            },
            scales: {
                y: { beginAtZero: true }
            }
        }
    });
}

// ============================================
// EXPORTAR A PDF
// ============================================

function setupExportButtons() {
    document.getElementById('exportPdfBtn').addEventListener('click', exportToPDF);
    document.getElementById('exportWordBtn').addEventListener('click', exportToWord);
}

// ============================================
// EXPORTAR A PDF - MEJORADO
// ============================================

async function exportToPDF() {
    if (!currentReport) {
        alert('No hay reporte cargado');
        return;
    }

    const btn = document.getElementById('exportPdfBtn');
    btn.disabled = true;
    btn.textContent = '⏳ Generando PDF...';

    try {
        // Clonar el elemento para no afectar la visualización
        const element = document.getElementById('reportContent');
        const clone = element.cloneNode(true);
        
        // Ocultar botones de exportación en el clon
        const exportButtons = clone.querySelector('.export-buttons');
        if (exportButtons) {
            exportButtons.style.display = 'none';
        }
        
        // Agregar logo al inicio del reporte
        const logo = document.createElement('div');
        logo.style.textAlign = 'center';
        logo.style.marginBottom = '30px';
        logo.innerHTML = `<img src="/__logo-umbusk.png" style="height: 80px; width: auto;">`;
        clone.insertBefore(logo, clone.firstChild);
        
        // Configuración mejorada para PDF
        const opt = {
            margin: [15, 15, 15, 15],
            filename: `${sanitizeFilename(currentReport.title)}.pdf`,
            image: { 
                type: 'jpeg', 
                quality: 1 
            },
            html2canvas: { 
                scale: 2,
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff',
                // Forzar renderizado de canvas (gráficos)
                allowTaint: true,
                foreignObjectRendering: false
            },
            jsPDF: { 
                unit: 'mm', 
                format: 'letter', 
                orientation: 'portrait',
                compress: true
            },
            pagebreak: { 
                mode: ['avoid-all', 'css', 'legacy'],
                after: '.chart-container'
            }
        };

        // Crear PDF desde el clon
        await html2pdf().set(opt).from(clone).save();

    } catch (error) {
        console.error('Error generando PDF:', error);
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
    if (!currentReport) {
        alert('No hay reporte cargado');
        return;
    }

    const btn = document.getElementById('exportWordBtn');
    btn.disabled = true;
    btn.textContent = '⏳ Generando Word...';

    try {
        // Obtener el contenido del reporte
        const statsData = currentReport.stats_data;
        
        // Crear HTML para Word
        let htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>${currentReport.title}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        h1 { color: #667eea; }
        h2 { color: #764ba2; margin-top: 30px; }
        table { border-collapse: collapse; width: 100%; margin: 20px 0; }
        th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
        th { background-color: #667eea; color: white; }
        .stat-box { display: inline-block; margin: 10px; padding: 20px; border: 2px solid #667eea; border-radius: 8px; }
        .stat-box h3 { margin: 0; color: #667eea; }
        .stat-box p { font-size: 24px; font-weight: bold; margin: 10px 0 0 0; }
    </style>
</head>
<body>
    <h1>${currentReport.title}</h1>
    <p><strong>Período:</strong> ${formatDate(currentReport.period_start)} - ${formatDate(currentReport.period_end)}</p>
    <p><strong>Publicado:</strong> ${formatDateTime(currentReport.published_at)}</p>
    
    <h2>Estadísticas Generales</h2>
    <div class="stat-box">
        <h3>💬 Conversaciones</h3>
        <p>${parseInt(statsData.general.total_conversations || 0).toLocaleString()}</p>
    </div>
    <div class="stat-box">
        <h3>✉️ Mensajes</h3>
        <p>${parseInt(statsData.general.total_messages || 0).toLocaleString()}</p>
    </div>
    <div class="stat-box">
        <h3>📊 Promedio</h3>
        <p>${parseFloat(statsData.general.avg_messages_per_conversation || 0).toFixed(1)}</p>
    </div>
    <div class="stat-box">
        <h3>🌍 Países</h3>
        <p>${statsData.countries.length}</p>
    </div>
    
    <h2>Conversaciones por Día</h2>
    <table>
        <tr><th>Fecha</th><th>Cantidad</th></tr>
        ${statsData.conversationsByDay.map(item => `
            <tr>
                <td>${formatDate(item.date)}</td>
                <td>${item.count}</td>
            </tr>
        `).join('')}
    </table>
    
    <h2>Distribución por País</h2>
    <table>
        <tr><th>País</th><th>Cantidad</th></tr>
        ${statsData.countries.map(item => `
            <tr>
                <td>${item.country || 'Desconocido'}</td>
                <td>${item.count}</td>
            </tr>
        `).join('')}
    </table>
    
    ${statsData.topics && statsData.topics.length > 0 ? `
    <h2>Temas Más Consultados</h2>
    <table>
        <tr><th>Tema</th><th>Menciones</th></tr>
        ${statsData.topics.map(item => `
            <tr>
                <td>${item.topic_name}</td>
                <td>${item.count}</td>
            </tr>
        `).join('')}
    </table>
    ` : ''}
    
    <h2>Promedio de Mensajes por Día</h2>
    <table>
        <tr><th>Fecha</th><th>Promedio</th></tr>
        ${statsData.avgMessagesByDay.map(item => `
            <tr>
                <td>${formatDate(item.date)}</td>
                <td>${parseFloat(item.avg_messages).toFixed(1)}</td>
            </tr>
        `).join('')}
    </table>
    
    <p style="margin-top: 40px; color: #999; font-size: 12px;">
        Generado por Sistema de Reportes Bibliofep - Fundación Empresas Polar
    </p>
</body>
</html>
        `;

        // Crear blob y descargar
        const blob = new Blob([htmlContent], { type: 'application/msword' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${sanitizeFilename(currentReport.title)}.doc`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

    } catch (error) {
        console.error('Error generando Word:', error);
        alert('Error al generar documento Word');
    } finally {
        btn.disabled = false;
        btn.textContent = '📝 Descargar Word';
    }
}

// ============================================
// HELPERS
// ============================================

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-VE', { 
        day: '2-digit', 
        month: 'short', 
        year: 'numeric' 
    });
}

function formatDateTime(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-VE', { 
        day: '2-digit', 
        month: 'short', 
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function sanitizeFilename(filename) {
    return filename.replace(/[^a-z0-9]/gi, '_').toLowerCase();
}

function showNoReportsMessage() {
    const content = document.getElementById('reportContent');
    content.innerHTML = `
        <div class="loading-container">
            <h3>No hay reportes publicados</h3>
            <p>Cuando se publique un reporte, aparecerá aquí.</p>
        </div>
    `;
}

function showErrorMessage() {
    const content = document.getElementById('reportContent');
    content.innerHTML = `
        <div class="error-container">
            <h3>Error al cargar reportes</h3>
            <p>Por favor, intenta recargar la página.</p>
        </div>
    `;
}
