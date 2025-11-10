// ============================================
// OBTENER IDs DE CONVERSACIONES
// ============================================

const { Pool } = require('pg');

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });

    // Obtener parámetros de query
    const params = event.queryStringParameters || {};
    const { month, year, startDate, endDate } = params;

    let query = 'SELECT id FROM conversations WHERE 1=1';
    const values = [];
    let paramIndex = 1;

    // Filtrar por mes y año
    if (month && year) {
      query += ` AND month = $${paramIndex} AND year = $${paramIndex + 1}`;
      values.push(parseInt(month), parseInt(year));
      paramIndex += 2;
    }
    // O filtrar por rango de fechas
    else if (startDate && endDate) {
      query += ` AND created_at >= $${paramIndex} AND created_at <= $${paramIndex + 1}`;
      values.push(startDate, endDate);
      paramIndex += 2;
    }

    // Ordenar por fecha más reciente
    query += ' ORDER BY created_at DESC LIMIT 200';

    const result = await pool.query(query, values);
    await pool.end();

    const conversationIds = result.rows.map(row => row.id);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        conversationIds,
        count: conversationIds.length
      })
    };

  } catch (error) {
    console.error('Error getting conversation IDs:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Error al obtener IDs de conversaciones',
        details: error.message 
      })
    };
  }
};
