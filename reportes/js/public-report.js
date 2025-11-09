// ============================================
// SISTEMA DE REPORTES BIBLIOFEP V2
// ============================================

const App = {
    currentReport: null,
    charts: {}
};

// ============================================
// FUNCIONES DE CARGA
// ============================================

async function loadReports() {
    try {
        console.log('📥 Cargando reportes...');
        const response = await fetch('/.netlify/functions/dashboard-get-reports');
        
        if (!response.ok) {
            throw new Error(`Error HTTP: ${response.status}`);
        }
        
        const reports = await response.json();
        console.log('✅ Reportes cargados:', reports);
        
        populateReportsList(reports);
        
        if (reports.length > 0) {
            loadReport(reports[0].id);
        }
        
    } catch (error) {
        console.error('❌ Error cargando reportes:', error);
        showError('No se pudieron cargar los reportes');
    }
}

function populateReportsList(reports) {
    const select = document.getElementById('reportSelect');
    select.innerHTML = '<option value="">Selecciona un reporte...</option>';
    
    reports.forEach(report => {
        const option = document.createElement('option');
        option.value = report.id;
        
        const date = new Date(report.upload_date);
        const formattedDate = date.toLocaleDateString('es-ES', {
            year: 'numeric',
            month: 'long'
        });
        
        option.textContent = `${formattedDate} (${report.total_conversations} conversaciones)`;
        select.appendChild(option);
    });
}

async function loadReport(reportId) {
    try {
        console.log('📄 Cargando reporte:', reportId);
        const response = await fetch(`/.netlify/functions/dashboard-get-report-data?reportId=${reportId}`);
        
        if (!response.ok) {
            throw new Error(`Error HTTP: ${response.status}`);
        }
        
        App.currentReport = await response.json();
        console.log('📄 Mostrando reporte:', App.currentReport);
        
        displayReport(App.currentReport);
        
    } catch (error) {
        console.error('❌ Error cargando reporte:', error);
        showError('No se pudo cargar el reporte');
    }
}

// ============================================
// FUNCIONES DE VISUALIZACIÓN
// ============================================

function displayReport(report) {
    // Actualizar header
    const reportTitle = document.getElementById('reportTitle');
    const date = new Date(report.upload_date);
    const formattedDate = date.toLocaleDateString('es-ES', {
        year: 'numeric',
        month: 'long'
    });
    reportTitle.textContent = `Reporte ${formattedDate}`;
    
    // Actualizar métricas
    document.getElementById('totalConversations').textContent = 
        report.total_conversations.toLocaleString('es-ES');
    document.getElementById('avgMessagesPerConv').textContent = 
        parseFloat(report.avg_messages_per_conversation).toFixed(1);
    document.getElementById('totalCountries').textContent = 
        report.total_countries;
    document.getElementById('topCountry').textContent = 
        report.top_country || 'N/A';
    
    // Crear gráficos
    createCharts(report);
    
    // Mostrar dashboard
    document.getElementById('reportSelector').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';
}

function createCharts(report) {
    console.log('📊 Creando gráficos...');
    
    // Destruir gráficos anteriores
    Object.values(App.charts).forEach(chart => {
        if (chart) chart.destroy();
    });
    App.charts = {};
    
    // 1. Gráfico de conversaciones por día
    const dailyData = report.stats_data.daily_conversations;
    console.log('📅 Datos diarios encontrados:', dailyData);
    createDailyChart(dailyData);
    
    // 2. Gráfico de países
    const countriesData = report.stats_data.countries;
    console.log('🌍 Datos de países encontrados:', countriesData);
    createCountriesChart(countriesData);
    
    // 3. Gráfico de temas
    const topicsData = report.stats_data.topics;
    console.log('🎯 Datos de temas encontrados:', topicsData);
    createTopicsChart(topicsData);
    
    console.log('✅ Gráficos creados');
}

// ============================================
// GRÁFICO 1: CONVERSACIONES DIARIAS
// ============================================

function createDailyChart(data) {
    console.log('📊 Creando gráfico de conversaciones diarias');
    console.log('   Datos:', data);
    
    if (!Array.isArray(data) || data.length === 0) {
        console.warn('⚠️ No hay datos de conversaciones diarias');
        return;
    }
    
    // Ordenar por fecha
    const sortedData = [...data].sort((a, b) => 
        new Date(a.date) - new Date(b.date)
    );
    
    const labels = sortedData.map(item => {
        const date = new Date(item.date);
        return date.toLocaleDateString('es-ES', {
            day: 'numeric',
            month: 'short'
        });
    });
    
    const values = sortedData.map(item => parseInt(item.count) || 0);
    
    console.log('   Labels:', labels);
    console.log('   Values:', values);
    
    const ctx = document.getElementById('dailyChart').getContext('2d');
    App.charts.daily = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Conversaciones',
                data: values,
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
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
    
    console.log('✅ Gráfico de conversaciones diarias creado correctamente');
}

// ============================================
// GRÁFICO 2: PAÍSES
// ============================================

function createCountriesChart(data) {
    console.log('📊 Creando gráfico de países');
    console.log('   Datos:', data);
    
    if (!Array.isArray(data) || data.length === 0) {
        console.warn('⚠️ No hay datos de países');
        return;
    }
    
    // Tomar top 10 países
    const topCountries = data.slice(0, 10);
    
    const labels = topCountries.map(c => c.country_name);
    const values = topCountries.map(c => parseInt(c.count) || 0);
    
    console.log('   Labels:', labels);
    console.log('   Values:', values);
    
    const ctx = document.getElementById('countriesChart').getContext('2d');
    App.charts.countries = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Conversaciones',
                data: values,
                backgroundColor: '#10b981'
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
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
    
    console.log('✅ Gráfico de países creado correctamente');
}

// ============================================
// GRÁFICO 3: TEMAS (¡CORRECCIÓN AQUÍ!)
// ============================================

function createTopicsChart(data) {
    console.log('📊 Creando gráfico de temas');
    console.log('   Labels:', data.map(t => t.topic_name));
    console.log('   Values:', data.map(t => t.count));
    
    if (!Array.isArray(data) || data.length === 0) {
        console.warn('⚠️ No hay datos de temas');
        return;
    }
    
    // Ordenar por conteo descendente
    const sortedData = [...data].sort((a, b) => 
        parseInt(b.count) - parseInt(a.count)
    );
    
    const labels = sortedData.map(t => t.topic_name);
    // ⭐ CORRECCIÓN: Convertir strings a números
    const values = sortedData.map(t => parseInt(t.count) || 0);
    
    console.log('   Labels procesados:', labels);
    console.log('   Values procesados (números):', values);
    
    const ctx = document.getElementById('topicsChart').getContext('2d');
    App.charts.topics = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Menciones',
                data: values,
                backgroundColor: '#8b5cf6'
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
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
    
    console.log('✅ Gráfico de temas creado correctamente');
}

// ============================================
// UTILIDADES
// ============================================

function showError(message) {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    
    setTimeout(() => {
        errorDiv.style.display = 'none';
    }, 5000);
}

function showDashboard() {
    if (App.currentReport) {
        document.getElementById('reportSelector').style.display = 'none';
        document.getElementById('dashboard').style.display = 'block';
    }
}

function backToSelector() {
    document.getElementById('dashboard').style.display = 'none';
    document.getElementById('reportSelector').style.display = 'block';
    
    // Destruir gráficos al volver
    Object.values(App.charts).forEach(chart => {
        if (chart) chart.destroy();
    });
    App.charts = {};
}

// ============================================
// INICIALIZACIÓN
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Iniciando sistema de reportes V2');
    loadReports();
});
