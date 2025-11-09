// ============================================
// REPORTES PÚBLICOS - SCRIPT PRINCIPAL
// ============================================

let currentReport = null;
let charts = {};

// ============================================
// PLUGIN PARA FONDO BLANCO EN GRÁFICOS
// ============================================

const whiteBackgroundPlugin = {
    id: 'whiteBackground',
    beforeDraw: (chart) => {
        const ctx = chart.ctx;
        ctx.save();
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, chart.width, chart.height);
        ctx.restore();
    }
};

// Registrar plugin globalmente
if (typeof Chart !== 'undefined') {
    Chart.register(whiteBackgroundPlugin);
}

// ============================================
// INICIALIZACIÓN
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    console.log('Inicializando reportes públicos...');
    loadReports();
    setupExportButtons();
});

// ============================================
// CONFIGURAR BOTONES DE EXPORTACIÓN
// ============================================

function setupExportButtons() {
    const pdfBtn = document.getElementById('exportPdfBtn');
    const wordBtn = document.getElementById('exportWordBtn');
    
    if (pdfBtn) {
        pdfBtn.addEventListener('click', exportToPDF);
        console.log('Botón PDF configurado');
    } else {
        console.error('Botón exportPdfBtn no encontrado');
    }
    
    if (wordBtn) {
        wordBtn.addEventListener('click', exportToWord);
        console.log('Botón Word configurado');
    } else {
        console.error('Botón exportWordBtn no encontrado');
    }
}

// ============================================
// CARGAR LISTA DE REPORTES
// ============================================

async function loadReports() {
    console.log('Cargando reportes...');
    try {
        const response = await fetch('/.netlify/functions/get-public-reports');
        
        if (!response.ok) {
            throw new Error(`Error HTTP: ${response.status}`);
        }

        const data = await response.json();
        console.log('Reportes cargados:', data);

        // Mostrar lista de reportes en el sidebar
        displayReportsList(data.all);

        // Cargar el reporte más reciente
        if (data.latest) {
            displayReport(data.latest);
        } else {
            showNoReportsMessage();
        }

    } catch (error) {
        console.error('Error cargando reportes:', error);
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
        <div class="report-item ${index === 0 ? 'active' : ''}" 
             onclick="loadSpecificReport(${report.id})">
            <div class="report-item-title">${escapeHtml(report.title)}</div>
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
    console.log('Cargando reporte:', reportId);
    try {
        const response = await fetch(`/.netlify/functions/get-public-reports?id=${reportId}`);
        
        if (!response.ok) {
            throw new Error(`Error HTTP: ${response.status}`);
        }

        const report = await response.json();
        displayReport(report);

        // Actualizar item activo en la lista
        document.querySelectorAll('.report-item').forEach(item => {
            item.classList.remove('active');
        });
        
        // Encontrar y activar el item clickeado
        const clickedItem = event.target.closest('.report-item');
        if (clickedItem) {
            clickedItem.classList.add('active');
        }

    } catch (error) {
        console.error('Error cargando reporte:', error);
        alert('Error al cargar el reporte. Por favor, intenta de nuevo.');
    }
}

// ============================================
// MOSTRAR REPORTE
// ============================================

function displayReport(report) {
    console.log('Mostrando reporte:', report);
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
    Object.values(charts).forEach(chart => {
        if (chart) chart.destroy();
    });
    charts = {};

    // Crear gráficos
    if (statsData.conversations_by_day && statsData.conversations_by_day.length > 0) {
        createConversationsByDayChart(statsData.conversations_by_day);
    }

    if (statsData.countries && statsData.countries.length > 0) {
        createCountriesChart(statsData.countries);
    }

    if (statsData.topics && statsData.topics.length > 0) {
        createTopicsChart(statsData.topics);
    }

    if (statsData.avg_messages_by_day && statsData.avg_messages_by_day.length > 0) {
        createAverageMessagesChart(statsData.avg_messages_by_day);
    }
}

// ============================================
// GRÁFICO: CONVERSACIONES POR DÍA
// ============================================

function createConversationsByDayChart(data) {
    const ctx = document.getElementById('chartConversations');
    if (!ctx) return;
    
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
                whiteBackground: true,
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
// GRÁFICO: DISTRIBUCIÓN POR PAÍSES
// ============================================

function createCountriesChart(data) {
    const ctx = document.getElementById('chartCountries');
    if (!ctx) return;
    
    const sortedData = [...data].sort((a, b) => b.count - a.count).slice(0, 10);
    const labels = sortedData.map(item => item.country);
    const values = sortedData.map(item => parseInt(item.count));

    const colors = [
        'rgba(102, 126, 234, 0.8)',
        'rgba(237, 100, 166, 0.8)',
        'rgba(255, 159, 64, 0.8)',
        'rgba(75, 192, 192, 0.8)',
        'rgba(153, 102, 255, 0.8)',
        'rgba(255, 99, 132, 0.8)',
        'rgba(54, 162, 235, 0.8)',
        'rgba(255, 206, 86, 0.8)',
        'rgba(231, 233, 237, 0.8)',
        'rgba(201, 203, 207, 0.8)'
    ];

    charts.countries = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: colors.slice(0, values.length)
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                whiteBackground: true,
                legend: {
                    position: 'right',
                    labels: {
                        boxWidth: 15,
                        padding: 10,
                        font: {
                            size: 11
                        }
                    }
                }
            }
        }
    });
}

// ============================================
// GRÁFICO: TEMAS PRINCIPALES
// ============================================

function createTopicsChart(data) {
    const ctx = document.getElementById('chartTopics');
    if (!ctx) return;
    
    const sortedData = [...data].sort((a, b) => b.count - a.count).slice(0, 10);
    const labels = sortedData.map(item => item.topic);
    const values = sortedData.map(item => parseInt(item.count));

    charts.topics = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Menciones',
                data: values,
                backgroundColor: 'rgba(237, 100, 166, 0.8)',
                borderColor: 'rgba(237, 100, 166, 1)',
                borderWidth: 1
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                whiteBackground: true,
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

function createAverageMessagesChart(data) {
    const ctx = document.getElementById('chartAverage');
    if (!ctx) return;
    
    const labels = data.map(item => {
        const date = new Date(item.date);
        return date.toLocaleDateString('es-VE', { day: '2-digit', month: 'short' });
    });
    
    const values = data.map(item => parseFloat(item.avg_messages));

    charts.average = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Promedio',
                data: values,
                backgroundColor: 'rgba(237, 100, 166, 0.2)',
                borderColor: 'rgba(237, 100, 166, 1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                whiteBackground: true,
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
// EXPORTAR A PDF
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
        // Esperar a que los gráficos se rendericen completamente
        await new Promise(resolve => setTimeout(resolve, 1000));

        const element = document.getElementById('reportContent');
        
        // Ocultar botones de exportación temporalmente
        const exportButtons = element.querySelector('.export-buttons');
        const originalDisplay = exportButtons.style.display;
        exportButtons.style.display = 'none';

        const opt = {
            margin: [15, 15, 15, 15],
            filename: `${sanitizeFilename(currentReport.title)}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { 
                scale: 3,
                logging: false,
                backgroundColor: '#ffffff'
            },
            jsPDF: { 
                unit: 'mm', 
                format: 'letter', 
                orientation: 'portrait',
                compress: false
            }
        };

        await html2pdf().set(opt).from(element).save();
        
        // Restaurar botones
        exportButtons.style.display = originalDisplay;

    } catch (error) {
        console.error('Error generando PDF:', error);
        alert('Error al generar PDF. Por favor, intenta de nuevo.');
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
        const statsData = currentReport.stats_data;
        
        // Esperar a que los gráficos se rendericen
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Convertir gráficos a imágenes
        const chartImages = await convertChartsToImages();
        
        // Obtener logo
        const logoBase64 = await getLogoBase64();
        
        // Crear HTML para Word
        let htmlContent = `
<!DOCTYPE html>
<html xmlns:v="urn:schemas-microsoft-com:vml"
      xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
    <meta charset="UTF-8">
    <title>${escapeHtml(currentReport.title)}</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 40px;
            color: #2c3e50;
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 3px solid #667eea;
        }
        .logo {
            max-width: 200px;
            margin-bottom: 20px;
        }
        h1 {
            color: #667eea;
            margin: 10px 0;
        }
        .meta {
            color: #7f8c8d;
            font-size: 14px;
            margin: 5px 0;
        }
        .stats-grid {
            display: table;
            width: 100%;
            margin: 30px 0;
            border-collapse: collapse;
        }
        .stat-row {
            display: table-row;
        }
        .stat-cell {
            display: table-cell;
            width: 25%;
            padding: 20px;
            text-align: center;
            border: 1px solid #ecf0f1;
            background: #f8f9fa;
        }
        .stat-value {
            font-size: 32px;
            font-weight: bold;
            color: #667eea;
            display: block;
            margin-bottom: 5px;
        }
        .stat-label {
            font-size: 14px;
            color: #7f8c8d;
            display: block;
        }
        .section {
            margin: 40px 0;
            page-break-inside: avoid;
        }
        .section-title {
            color: #667eea;
            font-size: 18px;
            margin-bottom: 15px;
            padding-bottom: 10px;
            border-bottom: 2px solid #ecf0f1;
        }
        .chart-container {
            text-align: center;
            margin: 20px 0;
            page-break-inside: avoid;
        }
        .chart-container img {
            max-width: 6.5in;
            height: auto;
        }
        .chart-container.topics img {
            max-width: 6in;
        }
    </style>
</head>
<body>
    <div class="header">
        ${logoBase64 ? `<img src="${logoBase64}" class="logo" alt="Logo">` : ''}
        <h1>${escapeHtml(currentReport.title)}</h1>
        <p class="meta">📅 Período: ${formatDate(currentReport.period_start)} - ${formatDate(currentReport.period_end)}</p>
        <p class="meta">📤 Publicado: ${formatDateTime(currentReport.published_at)}</p>
    </div>

    <div class="stats-grid">
        <div class="stat-row">
            <div class="stat-cell">
                <span class="stat-value">${parseInt(statsData.general.total_conversations || 0).toLocaleString()}</span>
                <span class="stat-label">💬 Conversaciones</span>
            </div>
            <div class="stat-cell">
                <span class="stat-value">${parseInt(statsData.general.total_messages || 0).toLocaleString()}</span>
                <span class="stat-label">📨 Mensajes</span>
            </div>
            <div class="stat-cell">
                <span class="stat-value">${parseFloat(statsData.general.avg_messages_per_conversation || 0).toFixed(1)}</span>
                <span class="stat-label">📊 Promedio</span>
            </div>
            <div class="stat-cell">
                <span class="stat-value">${statsData.countries.length}</span>
                <span class="stat-label">🌍 Países</span>
            </div>
        </div>
    </div>

    ${chartImages.conversations ? `
    <div class="section">
        <h2 class="section-title">📅 Conversaciones por Día</h2>
        <div class="chart-container">
            <img src="${chartImages.conversations}" alt="Conversaciones por Día">
        </div>
    </div>
    ` : ''}

    ${chartImages.countries ? `
    <div class="section">
        <h2 class="section-title">🌍 Distribución por País</h2>
        <div class="chart-container">
            <img src="${chartImages.countries}" alt="Distribución por País">
        </div>
    </div>
    ` : ''}

    ${chartImages.topics ? `
    <div class="section">
        <h2 class="section-title">🎯 Temas Principales</h2>
        <div class="chart-container topics">
            <img src="${chartImages.topics}" alt="Temas Principales">
        </div>
    </div>
    ` : ''}

    ${chartImages.average ? `
    <div class="section">
        <h2 class="section-title">📈 Promedio de Mensajes por Día</h2>
        <div class="chart-container">
            <img src="${chartImages.average}" alt="Promedio de Mensajes">
        </div>
    </div>
    ` : ''}

</body>
</html>`;

        // Crear blob y descargar
        const blob = new Blob([htmlContent], {
            type: 'application/msword'
        });
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${sanitizeFilename(currentReport.title)}.doc`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);

    } catch (error) {
        console.error('Error generando Word:', error);
        alert('Error al generar documento Word. Por favor, intenta de nuevo.');
    } finally {
        btn.disabled = false;
        btn.textContent = '📝 Descargar Word';
    }
}

// ============================================
// CONVERTIR GRÁFICOS A IMÁGENES
// ============================================

async function convertChartsToImages() {
    const images = {};
    
    for (const [key, chart] of Object.entries(charts)) {
        if (chart && chart.canvas) {
            try {
                images[key] = chart.toBase64Image('image/png', 1.0);
            } catch (error) {
                console.error(`Error convirtiendo gráfico ${key}:`, error);
            }
        }
    }
    
    return images;
}

// ============================================
// OBTENER LOGO EN BASE64
// ============================================

async function getLogoBase64() {
    try {
        const response = await fetch('/assets/img/logo.png');
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (error) {
        console.error('Error cargando logo:', error);
        return null;
    }
}

// ============================================
// UTILIDADES
// ============================================

function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('es-VE', { 
        day: '2-digit', 
        month: 'short', 
        year: 'numeric' 
    });
}

function formatDateTime(dateString) {
    if (!dateString) return 'N/A';
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
    return filename
        .replace(/[^a-z0-9áéíóúñ\s-]/gi, '')
        .replace(/\s+/g, '-')
        .toLowerCase();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showNoReportsMessage() {
    const content = document.getElementById('reportContent');
    content.innerHTML = `
        <div class="error-container">
            <h3>No hay reportes disponibles</h3>
            <p>Todavía no se ha publicado ningún reporte.</p>
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
```

## 📝 Explicación de los Cambios

### **Problemas Corregidos:**

1. **`setupExportButtons is not defined`** ✅
   - Ahora la función está claramente definida antes de ser llamada
   - Incluye validación de que los botones existen

2. **Error al cargar reportes anteriores** ✅
   - Mejorada la función `loadSpecificReport`
   - Mejor manejo de errores con `try-catch`
   - Mensajes de error más claros

3. **Logs de depuración** 🔍
   - Agregados `console.log()` para ver qué está pasando
   - Ayuda a identificar problemas más fácilmente

### **Cómo Funciona:**
```
1. Página carga
   ↓
2. DOMContentLoaded se dispara
   ↓
3. Se llama loadReports()
   ↓
4. Se llama setupExportButtons()
   ↓
5. Los botones quedan listos para usar
