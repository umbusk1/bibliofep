// ============================================
// FUNCIÓN: PUBLISH REPORT
// Publica un reporte para que sea visible públicamente
// ============================================

const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

// Helper para verificar autenticación
const verifyAuth = (authHeader) => {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('No autorizado');
  }
  const token = authHeader.substring(7);
  return jwt.verify(token, process.env.JWT_SECRET);
};

exports.handler = async (event, context) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // Verificar autenticación
    const authHeader = event.headers.authorization || event.headers.Authorization;
    const user = verifyAuth(authHeader);

    // Parsear datos del reporte
    const { title, filters, statsData } = JSON.parse(event.body);

    if (!title || !statsData) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Faltan datos requeridos' })
      };
    }

    // Conectar a la base de datos
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });

    // Determinar período del reporte
    let periodStart, periodEnd, month = null, year = null;

    if (filters.month && filters.year) {
      month = parseInt(filters.month);
      year = parseInt(filters.year);
      periodStart = new Date(year, month - 1, 1);
      periodEnd = new Date(year, month, 0);
    } else if (filters.startDate && filters.endDate) {
      periodStart = new Date(filters.startDate);
      periodEnd = new Date(filters.endDate);
    } else {
      // Usar fechas del statsData.general
      periodStart = new Date(statsData.general.first_conversation);
      periodEnd = new Date(statsData.general.last_conversation);
    }

    // Insertar reporte publicado
    const result = await pool.query(`
      INSERT INTO published_reports (
        title, period_start, period_end, month, year, 
        stats_data, published_by, is_latest
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, true)
      RETURNING id, published_at
    `, [
      title,
      periodStart,
      periodEnd,
      month,
      year,
      JSON.stringify(statsData),
      user.userId
    ]);

    await pool.end();

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        reportId: result.rows[0].id,
        publishedAt: result.rows[0].published_at,
        message: 'Reporte publicado exitosamente'
      })
    };

  } catch (error) {
    console.error('Error publicando reporte:', error);
    
    return {
      statusCode: error.message === 'No autorizado' ? 401 : 500,
      headers,
      body: JSON.stringify({ 
        error: 'Error al publicar reporte',
        details: error.message 
      })
    };
  }
};
