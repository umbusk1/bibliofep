// ============================================
// FUNCIÓN: ANALYZE TOPICS - CORREGIDA
// Usa Claude API para extraer temas de conversaciones
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
    verifyAuth(authHeader);

    // Conectar a la base de datos
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });

    // Obtener todas las conversaciones que NO tienen temas analizados
    const conversationsResult = await pool.query(`
      SELECT DISTINCT c.id, c.title
      FROM conversations c
      LEFT JOIN topics t ON c.id = t.conversation_id
      WHERE t.id IS NULL
      LIMIT 50
    `);

    if (conversationsResult.rows.length === 0) {
      await pool.end();
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'Todas las conversaciones ya tienen temas analizados',
          topicsAnalyzed: 0
        })
      };
    }

    const conversationIds = conversationsResult.rows.map(row => row.id);

    // Obtener mensajes de usuario de estas conversaciones
    const messagesResult = await pool.query(`
      SELECT 
        m.conversation_id,
        m.content,
        c.title
      FROM messages m
      JOIN conversations c ON m.conversation_id = c.id
      WHERE m.conversation_id = ANY($1)
      AND m.role = 'user'
      ORDER BY m.created_at
    `, [conversationIds]);

    if (messagesResult.rows.length === 0) {
      await pool.end();
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'No se encontraron mensajes para analizar',
          topicsAnalyzed: 0
        })
      };
    }

    // Agrupar mensajes por conversación
    const conversationTexts = {};
    messagesResult.rows.forEach(msg => {
      if (!conversationTexts[msg.conversation_id]) {
        conversationTexts[msg.conversation_id] = {
          title: msg.title,
          messages: []
        };
      }
      conversationTexts[msg.conversation_id].messages.push(msg.content);
    });

    // Preparar texto para Claude (máximo 30 conversaciones para no exceder límites)
    const conversationSummaries = Object.entries(conversationTexts)
      .slice(0, 30)
      .map(([id, data], index) => {
        const messagesText = data.messages.slice(0, 5).join(' | '); // Max 5 mensajes por conv
        return `${index + 1}. ${data.title || 'Sin título'}: ${messagesText.substring(0, 200)}...`;
      }).join('\n\n');

    const prompt = `Analiza estas conversaciones de un chatbot sobre Historia de Venezuela y extrae los 10-15 temas principales más relevantes.

CONVERSACIONES:
${conversationSummaries}

Identifica temas específicos como: personajes históricos (ej: Simón Bolívar, José Antonio Páez), eventos (ej: Batalla de Carabobo, Guerra Federal), períodos (ej: Independencia, Era Democrática), lugares (ej: Gran Colombia, Capitanía General), conceptos (ej: caudillismo, modernización).

Responde SOLO con un objeto JSON válido en este formato exacto (sin markdown ni texto adicional):
{
  "topics": [
    {"name": "Simón Bolívar", "relevance": 0.95},
    {"name": "Guerra de Independencia", "relevance": 0.85}
  ]
}`;

    // Llamar a Claude API
    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: prompt
        }]
      })
    });

    if (!claudeResponse.ok) {
      const errorText = await claudeResponse.text();
      throw new Error(`Claude API error: ${claudeResponse.status} - ${errorText}`);
    }

    const claudeData = await claudeResponse.json();
    const analysisText = claudeData.content[0].text;

    console.log('Claude response:', analysisText); // Para debugging

    // Extraer JSON de la respuesta
    let analysis;
    try {
      // Intentar parsear directamente
      analysis = JSON.parse(analysisText);
    } catch (e) {
      // Si falla, buscar JSON entre llaves
      const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No se pudo extraer JSON de la respuesta de Claude');
      }
      analysis = JSON.parse(jsonMatch[0]);
    }

    if (!analysis.topics || !Array.isArray(analysis.topics)) {
      throw new Error('Formato de respuesta inválido de Claude');
    }

    // Guardar temas en la base de datos
    let savedTopics = 0;
    for (const convId of conversationIds) {
      for (const topic of analysis.topics) {
        try {
          await pool.query(`
            INSERT INTO topics (conversation_id, topic_name, relevance_score)
            VALUES ($1, $2, $3)
          `, [convId, topic.name, topic.relevance || 0.5]);
          savedTopics++;
        } catch (err) {
          // Ignorar duplicados
          if (!err.message.includes('duplicate')) {
            console.error('Error guardando tema:', err);
          }
        }
      }
    }

    await pool.end();

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        conversationsAnalyzed: conversationIds.length,
        topicsIdentified: analysis.topics.length,
        topicsSaved: savedTopics,
        topics: analysis.topics
      })
    };

  } catch (error) {
    console.error('Error analizando temas:', error);
    
    return {
      statusCode: error.message === 'No autorizado' ? 401 : 500,
      headers,
      body: JSON.stringify({ 
        error: 'Error al analizar temas',
        details: error.message 
      })
    };
  }
};
