// ============================================
// FUNCIÓN: ANALYZE TOPICS - OPTIMIZADA
// Análisis inteligente y agrupado de temas
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

    // Obtener conversaciones sin temas analizados
    const conversationsResult = await pool.query(`
      SELECT DISTINCT c.id, c.title
      FROM conversations c
      LEFT JOIN topics t ON c.id = t.conversation_id
      WHERE t.id IS NULL
      LIMIT 100
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

    // Obtener mensajes de usuario
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

    // Preparar resumen de conversaciones (limitar para no exceder tokens)
    const conversationSummaries = Object.entries(conversationTexts)
      .slice(0, 50)
      .map(([id, data], index) => {
        const messagesText = data.messages.slice(0, 3).join(' | ');
        return `${index + 1}. ${messagesText.substring(0, 150)}`;
      }).join('\n');

    // PROMPT MEJORADO
    const prompt = `Analiza estas preguntas de usuarios sobre Historia de Venezuela y extrae entre 5-10 CATEGORÍAS TEMÁTICAS PRINCIPALES, agrupando temas similares.

CONVERSACIONES:
${conversationSummaries}

INSTRUCCIONES CRÍTICAS:
1. AGRUPA temas relacionados en categorías amplias (ej: en vez de "Simón Bolívar", "Antonio José de Sucre", "José Antonio Páez" → usa "Próceres de la Independencia")
2. NO repitas "de Venezuela" - se sobreentiende que todo es sobre Venezuela
3. SOLO menciona países si son DIFERENTES a Venezuela (ej: "Gran Colombia" incluye otros países, "España" es otro país)
4. Usa nombres CONCISOS y CLAROS
5. Prioriza categorías amplias sobre personajes individuales

EJEMPLOS DE BUENAS CATEGORÍAS:
✅ "Independencia" (no "Guerra de Independencia de Venezuela")
✅ "Época Colonial" (no "Época Colonial Venezolana")
✅ "Fuerzas Armadas" (agrupa: ejército, milicia, defensa)
✅ "Democracia" (agrupa: presidentes democráticos, elecciones, partidos)
✅ "Próceres" (agrupa: Bolívar, Páez, Miranda, etc)
✅ "Caudillismo" (agrupa: caudillos, Guerra Federal, Zamora)
✅ "Relaciones con España" (porque involucra otro país)
✅ "Economía" (agrupa: petróleo, agricultura, comercio)

EJEMPLOS DE MALAS CATEGORÍAS:
❌ "Historia de Venezuela" (demasiado genérico)
❌ "Simón Bolívar y la Independencia de Venezuela" (muy largo y redundante)
❌ "El General José Antonio Páez" (muy específico, debería ser parte de "Próceres" o "Caudillismo")

Responde SOLO con JSON válido (sin markdown, sin texto adicional):
{
  "topics": [
    {"name": "Independencia", "relevance": 0.95},
    {"name": "Época Colonial", "relevance": 0.80}
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
        max_tokens: 1500,
        temperature: 0.3, // Más bajo para respuestas más consistentes
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

    console.log('Claude response:', analysisText);

    // Extraer JSON
    let analysis;
    try {
      analysis = JSON.parse(analysisText);
    } catch (e) {
      const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No se pudo extraer JSON de la respuesta de Claude');
      }
      analysis = JSON.parse(jsonMatch[0]);
    }

    if (!analysis.topics || !Array.isArray(analysis.topics)) {
      throw new Error('Formato de respuesta inválido de Claude');
    }

    // Post-procesamiento: limpiar y validar temas
    const cleanedTopics = analysis.topics
      .map(topic => ({
        name: cleanTopic(topic.name),
        relevance: topic.relevance || 0.5
      }))
      .filter(topic => topic.name.length > 0 && topic.name.length < 100)
      .slice(0, 12); // Máximo 12 temas

    // Guardar temas en la base de datos
    let savedTopics = 0;
    for (const convId of conversationIds) {
      for (const topic of cleanedTopics) {
        try {
          await pool.query(`
            INSERT INTO topics (conversation_id, topic_name, relevance_score)
            VALUES ($1, $2, $3)
            ON CONFLICT DO NOTHING
          `, [convId, topic.name, topic.relevance]);
          savedTopics++;
        } catch (err) {
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
        topicsIdentified: cleanedTopics.length,
        topicsSaved: savedTopics,
        topics: cleanedTopics
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

// ============================================
// FUNCIÓN PARA LIMPIAR NOMBRES DE TEMAS
// ============================================

function cleanTopic(topicName) {
  let cleaned = topicName.trim();
  
  // Eliminar redundancias comunes
  const redundancies = [
    / de Venezuela$/i,
    / venezolano$/i,
    / venezolana$/i,
    / en Venezuela$/i,
    /^La /,
    /^El /,
    /^Los /,
    /^Las /
  ];
  
  redundancies.forEach(pattern => {
    cleaned = cleaned.replace(pattern, '');
  });
  
  // Capitalizar correctamente
  cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  
  // Eliminar espacios extras
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  return cleaned;
}
