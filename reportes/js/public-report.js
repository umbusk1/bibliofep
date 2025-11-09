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
                whiteBackground: true, // ← AGREGAR ESTO
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
                whiteBackground: true, // ← AGREGAR ESTO
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
                whiteBackground: true, // ← AGREGAR ESTO
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
                whiteBackground: true, // ← AGREGAR ESTO
                legend: { display: false }
            },
            scales: {
                y: { beginAtZero: true }
            }
        }
    });
}

// ============================================
// EXPORTAR A PDF - MEJORADO CON ESPERA
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
        // Esperar a que todos los gráficos estén completamente renderizados
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Clonar el contenido
        const element = document.getElementById('reportContent');
        const clone = element.cloneNode(true);
        
        // Crear contenedor temporal
        const tempContainer = document.createElement('div');
        tempContainer.style.position = 'absolute';
        tempContainer.style.left = '-9999px';
        tempContainer.style.width = '800px';
        tempContainer.style.backgroundColor = '#ffffff';
        document.body.appendChild(tempContainer);
        
        // Ocultar botones de exportación
        const exportButtons = clone.querySelector('.export-buttons');
        if (exportButtons) {
            exportButtons.remove();
        }
        
        // Agregar logo al inicio
        const logo = document.createElement('div');
        logo.style.textAlign = 'center';
        logo.style.marginBottom = '30px';
        logo.style.paddingTop = '20px';
        
        const logoImg = document.createElement('img');
        logoImg.src = '/__logo-umbusk.png';
        logoImg.style.height = '60px';
        logoImg.style.width = 'auto';
        logo.appendChild(logoImg);
        
        clone.insertBefore(logo, clone.firstChild);
        
        // Ajustar estilos para mejor renderizado
        clone.style.padding = '40px';
        clone.style.backgroundColor = '#ffffff';
        
        // Mejorar contraste de colores
        const statBoxes = clone.querySelectorAll('.stat-box');
        statBoxes.forEach(box => {
            box.style.backgroundColor = '#f0f4ff';
            box.style.border = '2px solid #667eea';
        });
        
        const statValues = clone.querySelectorAll('.stat-box p');
        statValues.forEach(val => {
            val.style.color = '#667eea';
            val.style.fontWeight = 'bold';
        });
        
        // Mejorar charts
        const chartContainers = clone.querySelectorAll('.chart-container');
        chartContainers.forEach(container => {
            container.style.backgroundColor = '#ffffff';
            container.style.padding = '20px';
            container.style.marginBottom = '30px';
            
            const canvas = container.querySelector('canvas');
            if (canvas) {
                canvas.style.maxWidth = '100%';
                canvas.style.height = 'auto';
            }
        });
        
        tempContainer.appendChild(clone);
        
        // Esperar un poco más para que se apliquen los estilos
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Configuración optimizada para PDF
        const opt = {
            margin: [10, 10, 10, 10],
            filename: `${sanitizeFilename(currentReport.title)}.pdf`,
            image: { 
                type: 'jpeg', 
                quality: 1.0
            },
            html2canvas: { 
                scale: 3, // Mayor escala para mejor calidad
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff',
                windowWidth: 800,
                windowHeight: tempContainer.scrollHeight,
                onclone: (clonedDoc) => {
                    // Asegurar que los canvas se rendericen
                    const clonedCharts = clonedDoc.querySelectorAll('canvas');
                    clonedCharts.forEach(canvas => {
                        canvas.style.width = '100%';
                        canvas.style.maxWidth = '700px';
                    });
                }
            },
            jsPDF: { 
                unit: 'mm', 
                format: 'letter', 
                orientation: 'portrait',
                compress: false // No comprimir para mejor calidad
            },
            pagebreak: { 
                mode: ['avoid-all', 'css'],
                after: '.chart-container'
            }
        };

        await html2pdf().set(opt).from(tempContainer).save();
        
        // Limpiar
        document.body.removeChild(tempContainer);

    } catch (error) {
        console.error('Error generando PDF:', error);
        alert('Error al generar PDF: ' + error.message);
    } finally {
        btn.disabled = false;
        btn.textContent = '📄 Descargar PDF';
    }
}

// ============================================
// EXPORTAR A WORD - CON GRÁFICOS AJUSTADOS
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
      xmlns:m="http://schemas.microsoft.com/office/2004/12/omml"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
    <meta charset="UTF-8">
    <meta name="ProgId" content="Word.Document">
    <meta name="Generator" content="Microsoft Word 15">
    <meta name="Originator" content="Microsoft Word 15">
    <title>${currentReport.title}</title>
    <!--[if gte mso 9]>
    <xml>
        <w:WordDocument>
            <w:View>Print</w:View>
            <w:Zoom>100</w:Zoom>
        </w:WordDocument>
    </xml>
    <![endif]-->
    <style>
        @page {
            size: 8.5in 11in;
            margin: 0.75in;
        }
        
        body { 
            font-family: Arial, sans-serif; 
            line-height: 1.6;
            color: #2d3748;
        }
        
        .logo-container {
            text-align: center;
            margin-bottom: 40px;
        }
        
        .logo {
            height: 60px;
            width: auto;
        }
        
        h1 { 
            color: #667eea; 
            text-align: center;
            margin-bottom: 10px;
            font-size: 28pt;
        }
        
        h2 { 
            color: #764ba2; 
            margin-top: 30px;
            margin-bottom: 15px;
            border-bottom: 3px solid #667eea;
            padding-bottom: 8px;
            font-size: 18pt;
        }
        
        .report-meta {
            text-align: center;
            color: #666;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 1px solid #ddd;
        }
        
        .stats-container {
            width: 100%;
            margin: 30px 0;
        }
        
        .stats-table {
            width: 100%;
            border-collapse: collapse;
        }
        
        .stat-cell { 
            text-align: center;
            padding: 20px; 
            border: 3px solid #667eea; 
            background-color: #f8f9ff;
            width: 25%;
        }
        
        .stat-label { 
            margin: 0 0 10px 0; 
            color: #667eea;
            font-size: 11pt;
            font-weight: bold;
        }
        
        .stat-value { 
            font-size: 24pt; 
            font-weight: bold; 
            margin: 0; 
            color: #667eea;
        }
        
        .chart-container {
            margin: 30px 0;
            page-break-inside: avoid;
            text-align: center;
        }
        
        .chart-image {
            width: 100%;
            max-width: 6.5in; /* Ancho máximo para evitar desbordamiento */
            height: auto;
            display: block;
            margin: 20px auto;
            border: 1px solid #ddd;
        }
        
        /* Gráfico horizontal de temas - más angosto */
        .chart-topics {
            max-width: 6in !important;
        }
        
        .footer {
            margin-top: 60px;
            padding-top: 20px;
            border-top: 1px solid #ddd;
            text-align: center;
            color: #999; 
            font-size: 10pt;
        }
    </style>
</head>
<body>
    <div class="logo-container">
        <img src="${logoBase64}" class="logo" alt="Umbusk Logo">
    </div>
    
    <h1>${currentReport.title}</h1>
    
    <div class="report-meta">
        <p><strong>📅 Período:</strong> ${formatDate(currentReport.period_start)} - ${formatDate(currentReport.period_end)}</p>
        <p><strong>📤 Publicado:</strong> ${formatDateTime(currentReport.published_at)}</p>
    </div>
    
    <h2>Estadísticas Generales</h2>
    <div class="stats-container">
        <table class="stats-table">
            <tr>
                <td class="stat-cell">
                    <p class="stat-label">💬 Conversaciones</p>
                    <p class="stat-value">${parseInt(statsData.general.total_conversations || 0).toLocaleString()}</p>
                </td>
                <td class="stat-cell">
                    <p class="stat-label">✉️ Mensajes</p>
                    <p class="stat-value">${parseInt(statsData.general.total_messages || 0).toLocaleString()}</p>
                </td>
                <td class="stat-cell">
                    <p class="stat-label">📊 Promedio</p>
                    <p class="stat-value">${parseFloat(statsData.general.avg_messages_per_conversation || 0).toFixed(1)}</p>
                </td>
                <td class="stat-cell">
                    <p class="stat-label">🌍 Países</p>
                    <p class="stat-value">${statsData.countries.length}</p>
                </td>
            </tr>
        </table>
    </div>
    
    <h2>📅 Conversaciones por Día</h2>
    <div class="chart-container">
        <img src="${chartImages.conversations}" class="chart-image" alt="Conversaciones por Día">
    </div>
    
    <h2>🌍 Distribución por País</h2>
    <div class="chart-container">
        <img src="${chartImages.countries}" class="chart-image" alt="Distribución por País">
    </div>
    
    ${statsData.topics && statsData.topics.length > 0 ? `
    <h2>📚 Temas Más Consultados</h2>
    <div class="chart-container">
        <img src="${chartImages.topics}" class="chart-image chart-topics" alt="Temas Más Consultados">
    </div>
    ` : ''}
    
    <h2>📈 Promedio de Mensajes por Día</h2>
    <div class="chart-container">
        <img src="${chartImages.average}" class="chart-image" alt="Promedio de Mensajes">
    </div>
    
    <div class="footer">
        <p>Generado por Sistema de Reportes Bibliofep - Fundación Empresas Polar</p>
        <p>Powered by Umbusk</p>
    </div>
</body>
</html>
        `;

        // Crear blob y descargar
        const blob = new Blob(['\ufeff', htmlContent], { 
            type: 'application/msword;charset=utf-8'
        });
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
        alert('Error al generar documento Word: ' + error.message);
    } finally {
        btn.disabled = false;
        btn.textContent = '📝 Descargar Word';
    }
}

// ============================================
// CONVERTIR GRÁFICOS A IMÁGENES BASE64
// ============================================

async function convertChartsToImages() {
    const images = {
        conversations: '',
        countries: '',
        topics: '',
        average: ''
    };
    
    try {
        // Esperar a que los gráficos se rendericen
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Conversaciones por día
        if (charts.conversations) {
            // Configurar fondo blanco
            const originalBg = charts.conversations.options.plugins?.backgroundColor;
            if (!charts.conversations.options.plugins) {
                charts.conversations.options.plugins = {};
            }
            
            images.conversations = charts.conversations.toBase64Image('image/png', 1.0);
        }
        
        // Países
        if (charts.countries) {
            images.countries = charts.countries.toBase64Image('image/png', 1.0);
        }
        
        // Temas - ajustar tamaño si es muy grande
        if (charts.topics) {
            images.topics = charts.topics.toBase64Image('image/png', 1.0);
        }
        
        // Promedio
        if (charts.average) {
            images.average = charts.average.toBase64Image('image/png', 1.0);
        }
    } catch (error) {
        console.error('Error convirtiendo gráficos:', error);
    }
    
    return images;
}

// ============================================
// OBTENER LOGO EN BASE64
// ============================================

async function getLogoBase64() {
    try {
        const response = await fetch('logo-umbusk.png');
        const blob = await response.blob();
        
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (error) {
        console.error('Error cargando logo:', error);
        return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    }
}

// ============================================
// CONVERTIR GRÁFICOS A IMÁGENES
// ============================================

async function convertChartsToImages() {
    const images = {};
    
    try {
        // Conversaciones por día
        if (charts.conversations) {
            images.conversations = charts.conversations.toBase64Image('image/png', 1);
        }
        
        // Países
        if (charts.countries) {
            images.countries = charts.countries.toBase64Image('image/png', 1);
        }
        
        // Temas
        if (charts.topics) {
            images.topics = charts.topics.toBase64Image('image/png', 1);
        }
        
        // Promedio
        if (charts.average) {
            images.average = charts.average.toBase64Image('image/png', 1);
        }
    } catch (error) {
        console.error('Error convirtiendo gráficos:', error);
    }
    
    return images;
}

// ============================================
// OBTENER LOGO EN BASE64
// ============================================

async function getLogoBase64() {
    try {
        const response = await fetch('/__logo-umbusk.png');
        const blob = await response.blob();
        
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (error) {
        console.error('Error cargando logo:', error);
        return '';
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
