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

if (typeof Chart !== 'undefined') {
    Chart.register(whiteBackgroundPlugin);
}

// ============================================
// INICIALIZACIÓN
// ============================================

document.addEventListener('DOMContentLoaded', function() {
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
    }
    
    if (wordBtn) {
        wordBtn.addEventListener('click', exportToWord);
        console.log('Botón Word configurado');
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
            throw new Error('Error HTTP: ' + response.status);
        }

        const data = await response.json();
        console.log('Reportes cargados:', data);

        displayReportsList(data.all);

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

    listContainer.innerHTML = reports.map((report, index) => {
        const isActive = index === 0 ? 'active' : '';
        const badge = report.is_latest ? '<span class="report-item-badge">Más reciente</span>' : '';
        
        return `
            <div class="report-item ${isActive}" onclick="loadSpecificReport(${report.id})">
                <div class="report-item-title">${escapeHtml(report.title)}</div>
                <div class="report-item-date">
                    📅 ${formatDate(report.period_start)} - ${formatDate(report.period_end)}
                </div>
                ${badge}
            </div>
        `;
    }).join('');
}

// ============================================
// CARGAR REPORTE ESPECÍFICO
// ============================================

async function loadSpecificReport(reportId) {
    console.log('Cargando reporte:', reportId);
    try {
        const response = await fetch('/.netlify/functions/get-public-reports?id=' + reportId);
        
        if (!response.ok) {
            throw new Error('Error HTTP: ' + response.status);
        }

        const report = await response.json();
        displayReport(report);

        document.querySelectorAll('.report-item').forEach(item => {
            item.classList.remove('active');
        });
        
        if (event && event.target) {
            const clickedItem = event.target.closest('.report-item');
            if (clickedItem) {
                clickedItem.classList.add('active');
            }
        }

    } catch (error) {
        console.error('Error cargando reporte:', error);
        alert('Error al cargar el reporte');
    }
}

// ============================================
// MOSTRAR REPORTE
// ============================================

function displayReport(report) {
    console.log('Mostrando reporte:', report);
    currentReport = report;
    const statsData = report.stats_data;

    document.getElementById('reportTitle').textContent = report.title;
    document.getElementById('reportPeriod').textContent = '📅 Período: ' + formatDate(report.period_start) + ' - ' + formatDate(report.period_end);
    document.getElementById('reportDate').textContent = '📤 Publicado: ' + formatDateTime(report.published_at);

    document.getElementById('statConversations').textContent = parseInt(statsData.general.total_conversations || 0).toLocaleString();
    document.getElementById('statMessages').textContent = parseInt(statsData.general.total_messages || 0).toLocaleString();
    document.getElementById('statAverage').textContent = parseFloat(statsData.general.avg_messages_per_conversation || 0).toFixed(1);
    document.getElementById('statCountries').textContent = statsData.countries.length;

    createCharts(statsData);
}

// ============================================
// CREAR GRÁFICOS
// ============================================

function createCharts(statsData) {
    console.log('=== CREANDO GRÁFICOS ===');
    console.log('Datos recibidos:', statsData);
    
    // Destruir gráficos existentes
    Object.values(charts).forEach(chart => {
        if (chart) chart.destroy();
    });
    charts = {};

    // Gráfico 1: Conversaciones por día (soporta ambos formatos)
    const conversationsData = statsData.conversationsByDay || statsData.conversations_by_day;
    if (conversationsData && conversationsData.length > 0) {
        console.log('✅ Creando gráfico de conversaciones con', conversationsData.length, 'puntos');
        createConversationsByDayChart(conversationsData);
    } else {
        console.warn('❌ No hay datos de conversaciones por día');
    }

    // Gráfico 2: Países
    if (statsData.countries && statsData.countries.length > 0) {
        console.log('✅ Creando gráfico de países con', statsData.countries.length, 'países');
        createCountriesChart(statsData.countries);
    } else {
        console.warn('❌ No hay datos de países');
    }

    // Gráfico 3: Temas
    console.log('Verificando datos de temas:', statsData.topics);
    if (statsData.topics && statsData.topics.length > 0) {
        console.log('✅ Creando gráfico de temas con', statsData.topics.length, 'temas');
        createTopicsChart(statsData.topics);
    } else {
        console.warn('❌ No hay datos de temas');
    }

    // Gráfico 4: Promedio de mensajes (soporta ambos formatos)
    const avgData = statsData.avgMessagesByDay || statsData.avg_messages_by_day;
    console.log('Verificando datos de promedio:', avgData);
    if (avgData && avgData.length > 0) {
        console.log('✅ Creando gráfico de promedio con', avgData.length, 'puntos');
        createAverageMessagesChart(avgData);
    } else {
        console.warn('❌ No hay datos de promedio');
    }
    
    console.log('=== GRÁFICOS CREADOS ===');
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
                backgroundColor: '#667eea',
                borderColor: '#4c63d2',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                whiteBackground: true,
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1,
                        color: '#2c3e50',
                        font: { size: 12, weight: 'bold' }
                    }
                },
                x: {
                    ticks: {
                        color: '#2c3e50',
                        font: { size: 11 }
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
    const ctx = document.getElementById('chartCountries');
    if (!ctx) return;
    
    const sortedData = [...data].sort((a, b) => b.count - a.count).slice(0, 10);
    const labels = sortedData.map(item => item.country);
    const values = sortedData.map(item => parseInt(item.count));

    const colors = [
        '#667eea', '#ed64a6', '#f6ad55', '#4fd1c5', '#9f7aea',
        '#fc8181', '#63b3ed', '#fbd38d', '#68d391', '#b794f4'
    ];

    charts.countries = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: colors.slice(0, values.length),
                borderColor: '#ffffff',
                borderWidth: 2
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
                        color: '#2c3e50',
                        font: { size: 11, weight: 'bold' }
                    }
                }
            }
        }
    });
}

// ============================================
// GRÁFICO: TEMAS - CORREGIDO
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
    
    // CORRECCIÓN: Usar topic_name en lugar de topic
    const labels = sorted.map(item => item.topic_name || item.topic);
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

function createAverageMessagesChart(data) {
    const ctx = document.getElementById('chartAverage');
    if (!ctx) return;
    
    const labels = data.map(item => {
        const date = new Date(item.date);
        return date.toLocaleDateString('es-VE', { day: '2-digit', month: 'short' });
    });
    
    const values = data.map(item => parseFloat(item.avg_messages || item.avgMessages));

    charts.average = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Promedio',
                data: values,
                backgroundColor: '#ed64a6',
                borderColor: '#d53f8c',
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointBackgroundColor: '#d53f8c',
                pointBorderColor: '#ffffff',
                pointBorderWidth: 2,
                pointRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                whiteBackground: true,
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: '#2c3e50',
                        font: { size: 12, weight: 'bold' }
                    }
                },
                x: {
                    ticks: {
                        color: '#2c3e50',
                        font: { size: 11 }
                    }
                }
            }
        }
    });
}

// ============================================
// EXPORTAR A PDF - SIN CAPA BLANCA
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
        // Esperar más tiempo para asegurar renderizado completo
        await new Promise(resolve => setTimeout(resolve, 2000));

        const element = document.getElementById('reportContent');
        
        // Ocultar botones
        const exportButtons = element.querySelector('.export-buttons');
        const originalDisplay = exportButtons ? exportButtons.style.display : '';
        if (exportButtons) exportButtons.style.display = 'none';

        // Configuración mejorada sin capa blanca
        const opt = {
            margin: 10,
            filename: sanitizeFilename(currentReport.title) + '.pdf',
            image: { 
                type: 'jpeg', 
                quality: 0.95 
            },
            html2canvas: { 
                scale: 2,
                useCORS: true,
                allowTaint: true,
                logging: false,
                backgroundColor: '#ffffff',
                windowWidth: element.scrollWidth,
                windowHeight: element.scrollHeight
            },
            jsPDF: { 
                unit: 'mm', 
                format: 'letter', 
                orientation: 'portrait',
                hotfixes: ['px_scaling']
            },
            pagebreak: { 
                mode: ['avoid-all', 'css', 'legacy'] 
            }
        };

        await html2pdf().set(opt).from(element).save();
        
        // Restaurar botones
        if (exportButtons) exportButtons.style.display = originalDisplay;

    } catch (error) {
        console.error('Error generando PDF:', error);
        alert('Error al generar PDF. Intenta de nuevo.');
    } finally {
        btn.disabled = false;
        btn.textContent = '📄 Descargar PDF';
    }
}

// ============================================
// CONVERTIR GRÁFICOS A IMÁGENES
// ============================================

async function convertChartsToImages() {
    const images = {};
    await new Promise(resolve => setTimeout(resolve, 500));
    
    for (const key in charts) {
        if (charts[key] && charts[key].canvas) {
            try {
                images[key] = charts[key].toBase64Image('image/png', 1.0);
            } catch (error) {
                console.error('Error convirtiendo gráfico ' + key, error);
            }
        }
    }
    
    return images;
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
    content.innerHTML = '<div style="text-align:center;padding:50px;"><h3>No hay reportes disponibles</h3></div>';
}

function showErrorMessage() {
    const content = document.getElementById('reportContent');
    content.innerHTML = '<div style="text-align:center;padding:50px;"><h3>Error al cargar reportes</h3><p>Intenta recargar la página</p></div>';
}
