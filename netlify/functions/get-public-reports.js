// ============================================
// FUNCIÓN: GET PUBLIC REPORTS
// Obtiene reportes publicados (sin autenticación)
// ============================================

const { Pool } = require('pg');

exports.handler = async (event, context) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const params = event.queryStringParameters || {};
    const reportId = params.id;

    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });

    // Si se solicita un reporte específico
    if (reportId) {
      const result = await pool.query(
        'SELECT * FROM published_reports WHERE id = $1',
        [reportId]
      );

      await pool.end();

      if (result.rows.length === 0) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ error: 'Reporte no encontrado' })
        };
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(result.rows[0])
      };
    }

    // Si no, devolver el último reporte y la lista de todos
    const latestResult = await pool.query(
      'SELECT * FROM published_reports WHERE is_latest = true LIMIT 1'
    );

    const allReportsResult = await pool.query(`
      SELECT id, title, period_start, period_end, published_at, is_latest
      FROM published_reports
      ORDER BY published_at DESC
      LIMIT 50
    `);

    await pool.end();

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        latest: latestResult.rows[0] || null,
        all: allReportsResult.rows
      })
    };

  } catch (error) {
    console.error('Error obteniendo reportes:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Error al obtener reportes',
        details: error.message 
      })
    };
  }
};
