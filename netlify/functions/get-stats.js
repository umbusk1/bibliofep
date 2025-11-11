// ============================================
// FUNCIÓN: GET STATISTICS - CON ZONA HORARIA
// ============================================

const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

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
    const authHeader = event.headers.authorization || event.headers.Authorization;
    verifyAuth(authHeader);

    const params = event.queryStringParameters || {};
    const startDate = params.startDate;
    const endDate = params.endDate;
    const month = params.month;
    const year = params.year;

    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });

    let stats = {};

    // 1. CONVERSACIONES POR DÍA
    let conversationsByDayQuery = `
      SELECT 
        DATE(created_at AT TIME ZONE 'America/Caracas') as date,
        COUNT(*) as count
      FROM conversations
      WHERE 1=1
    `;
    let queryParams = [];
    let paramCount = 1;

    if (startDate && endDate) {
      conversationsByDayQuery += ` AND (created_at AT TIME ZONE 'America/Caracas')::date >= $${paramCount}::date 
        AND (created_at AT TIME ZONE 'America/Caracas')::date <= $${paramCount + 1}::date`;
      queryParams.push(startDate, endDate);
      paramCount += 2;
    } else if (month && year) {
      conversationsByDayQuery += ` AND month = $${paramCount} AND year = $${paramCount + 1}`;
      queryParams.push(month, year);
      paramCount += 2;
    }

    conversationsByDayQuery += ` GROUP BY DATE(created_at AT TIME ZONE 'America/Caracas') ORDER BY date`;

    const conversationsByDay = await pool.query(conversationsByDayQuery, queryParams);

    // 2. PAÍSES
    let countriesQuery = `
      SELECT 
        country,
        COUNT(*) as count
      FROM conversations
      WHERE 1=1
    `;
    queryParams = [];
    paramCount = 1;

    if (startDate && endDate) {
      countriesQuery += ` AND (created_at AT TIME ZONE 'America/Caracas')::date >= $${paramCount}::date 
        AND (created_at AT TIME ZONE 'America/Caracas')::date <= $${paramCount + 1}::date`;
      queryParams.push(startDate, endDate);
      paramCount += 2;
    } else if (month && year) {
      countriesQuery += ` AND month = $${paramCount} AND year = $${paramCount + 1}`;
      queryParams.push(month, year);
      paramCount += 2;
    }

    countriesQuery += ` GROUP BY country ORDER BY count DESC`;

    const countries = await pool.query(countriesQuery, queryParams);

    // 3. PROMEDIO DE MENSAJES POR DÍA
    let avgMessagesQuery = `
      SELECT 
        DATE(created_at AT TIME ZONE 'America/Caracas') as date,
        AVG(message_count) as avg_messages
      FROM conversations
      WHERE 1=1
    `;
    queryParams = [];
    paramCount = 1;

    if (startDate && endDate) {
      avgMessagesQuery += ` AND (created_at AT TIME ZONE 'America/Caracas')::date >= $${paramCount}::date 
        AND (created_at AT TIME ZONE 'America/Caracas')::date <= $${paramCount + 1}::date`;
      queryParams.push(startDate, endDate);
      paramCount += 2;
    } else if (month && year) {
      avgMessagesQuery += ` AND month = $${paramCount} AND year = $${paramCount + 1}`;
      queryParams.push(month, year);
      paramCount += 2;
    }

    avgMessagesQuery += ` GROUP BY DATE(created_at AT TIME ZONE 'America/Caracas') ORDER BY date`;

    const avgMessages = await pool.query(avgMessagesQuery, queryParams);

    // 4. TEMAS MÁS CONSULTADOS
    let topicsQuery = `
      SELECT 
        t.topic_name,
        COUNT(*) as count
      FROM topics t
      JOIN conversations c ON t.conversation_id = c.id
      WHERE 1=1
    `;
    queryParams = [];
    paramCount = 1;

    if (startDate && endDate) {
      topicsQuery += ` AND (c.created_at AT TIME ZONE 'America/Caracas')::date >= $${paramCount}::date 
        AND (c.created_at AT TIME ZONE 'America/Caracas')::date <= $${paramCount + 1}::date`;
      queryParams.push(startDate, endDate);
      paramCount += 2;
    } else if (month && year) {
      topicsQuery += ` AND c.month = $${paramCount} AND c.year = $${paramCount + 1}`;
      queryParams.push(month, year);
      paramCount += 2;
    }

    topicsQuery += ` GROUP BY t.topic_name ORDER BY count DESC LIMIT 10`;

    const topics = await pool.query(topicsQuery, queryParams);

    // 5. ESTADÍSTICAS GENERALES
    let generalStatsQuery = `
      SELECT 
        COUNT(*) as total_conversations,
        SUM(message_count) as total_messages,
        AVG(message_count) as avg_messages_per_conversation,
        MIN(created_at) as first_conversation,
        MAX(created_at) as last_conversation
      FROM conversations
      WHERE 1=1
    `;
    queryParams = [];
    paramCount = 1;

    if (startDate && endDate) {
      generalStatsQuery += ` AND (created_at AT TIME ZONE 'America/Caracas')::date >= $${paramCount}::date 
        AND (created_at AT TIME ZONE 'America/Caracas')::date <= $${paramCount + 1}::date`;
      queryParams.push(startDate, endDate);
    } else if (month && year) {
      generalStatsQuery += ` AND month = $${paramCount} AND year = $${paramCount + 1}`;
      queryParams.push(month, year);
    }

    const generalStats = await pool.query(generalStatsQuery, queryParams);

    await pool.end();

    stats = {
      conversationsByDay: conversationsByDay.rows,
      countries: countries.rows,
      avgMessagesByDay: avgMessages.rows,
      topics: topics.rows,
      general: generalStats.rows[0]
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(stats)
    };

  } catch (error) {
    console.error('Error obteniendo estadísticas:', error);
    
    return {
      statusCode: error.message === 'No autorizado' ? 401 : 500,
      headers,
      body: JSON.stringify({ 
        error: 'Error al obtener estadísticas',
        details: error.message 
      })
    };
  }
};
