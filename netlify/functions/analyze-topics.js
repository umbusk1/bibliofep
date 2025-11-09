// ============================================
// FUNCIÓN: ANALYZE TOPICS
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

    // Parsear parámetros
    const { conversationIds } = JSON.parse(event.body);

    if (!conversationIds || !Array.isArray(conversationIds)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'conversationIds debe ser un array' })
      };
    }

    // Conectar a la base de datos
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });

    // Obtener mensajes de las conversaciones especificadas
    const messagesResult = await pool.query(`
      SELECT 
        m.conversation_id,
        m.role,
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
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'No se encontraron mensajes' })
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

    // Preparar prompt para Claude
    const conversationSummaries = Object.entries(conversationTexts).map(([id, data]) => {
      return `Conversación: ${data.title}\nMensajes: ${data.messages.join(' | ')}`;
    }).join('\n\n');

    const prompt = `Analiza las siguientes conversaciones de un chatbot sobre Historia de Venezuela y extrae los temas principales consultados.

${conversationSummaries}

Por favor, identifica los 10-15 temas más relevantes y agrúpalos por categoría temática (por ejemplo: personajes históricos, eventos, lugares, conceptos, etc.). 

Responde ÚNICAMENTE con un JSON en este formato:
{
  "topics": [
    {
      "name": "Nombre del tema",
      "category": "Categoría",
      "relevance": 0.95
    }
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
      throw new Error(`Claude API error: ${claudeResponse.statusText}`);
    }

    const claudeData = await claudeResponse.json();
    const analysisText = claudeData.content[0].text;

    // Parsear respuesta de Claude
    const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No se pudo extraer JSON de la respuesta de Claude');
    }

    const analysis = JSON.parse(jsonMatch[0]);

    // Guardar temas en la base de datos
    let savedTopics = 0;
    for (const convId of conversationIds) {
      for (const topic of analysis.topics) {
        await pool.query(`
          INSERT INTO topics (conversation_id, topic_name, relevance_score)
          VALUES ($1, $2, $3)
          ON CONFLICT DO NOTHING
        `, [convId, topic.name, topic.relevance || 0.5]);
        savedTopics++;
      }
    }

    await pool.end();

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        topicsAnalyzed: analysis.topics.length,
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
