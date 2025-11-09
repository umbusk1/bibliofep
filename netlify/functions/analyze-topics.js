// ============================================
// FUNCIÓN: ANALYZE TOPICS - CON DEBUG MEJORADO
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

  console.log('=== INICIO ANÁLISIS DE TEMAS ===');

  try {
    // Verificar autenticación
    const authHeader = event.headers.authorization || event.headers.Authorization;
    verifyAuth(authHeader);
    console.log('✓ Autenticación verificada');

    // Verificar API Key de Anthropic
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY no está configurada');
    }
    console.log('✓ API Key de Anthropic encontrada');

    // Conectar a la base de datos
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });
    console.log('✓ Conectado a base de datos');

    // Obtener TODAS las conversaciones (ignorar si ya tienen temas para esta prueba)
    const conversationsResult = await pool.query(`
      SELECT c.id, c.title, c.created_at
      FROM conversations c
      ORDER BY c.created_at DESC
      LIMIT 50
    `);

    console.log(`✓ Encontradas ${conversationsResult.rows.length} conversaciones`);

    if (conversationsResult.rows.length === 0) {
      await pool.end();
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'No hay conversaciones para analizar',
          topicsAnalyzed: 0
        })
      };
    }

    const conversationIds = conversationsResult.rows.map(row => row.id);
    console.log('IDs de conversaciones:', conversationIds.slice(0, 5));

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
      AND m.content IS NOT NULL
      AND LENGTH(m.content) > 10
      ORDER BY m.created_at
    `, [conversationIds]);

    console.log(`✓ Encontrados ${messagesResult.rows.length} mensajes de usuario`);

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
          title: msg.title || 'Sin título',
          messages: []
        };
      }
      conversationTexts[msg.conversation_id].messages.push(msg.content);
    });

    console.log(`✓ Agrupados mensajes de ${Object.keys(conversationTexts).length} conversaciones`);

    // Preparar texto para análisis (limitado)
    const conversationSummaries = Object.entries(conversationTexts)
      .slice(0, 30)
      .map(([id, data], index) => {
        const messagesText = data.messages.slice(0, 3).join(' | ');
        return `${index + 1}. ${messagesText.substring(0, 200)}`;
      }).join('\n');

    console.log('✓ Texto preparado para análisis, longitud:', conversationSummaries.length);

    // PROMPT MEJORADO Y SIMPLIFICADO
    const prompt = `Analiza estas preguntas sobre Historia de Venezuela y extrae 5-8 TEMAS PRINCIPALES agrupados.

PREGUNTAS:
${conversationSummaries}

REGLAS:
1. Agrupa temas similares (ej: todos los próceres en "Próceres")
2. NO uses "de Venezuela" - se sobreentiende
3. Nombres cortos y claros
4. Solo menciona países si NO son Venezuela

EJEMPLOS BUENOS:
✅ Independencia
✅ Próceres  
✅ Fuerzas Armadas
✅ Democracia
✅ Época Colonial
✅ Caudillismo

RESPONDE SOLO JSON (sin markdown):
{
  "topics": [
    {"name": "Independencia", "relevance": 0.9},
    {"name": "Próceres", "relevance": 0.8}
  ]
}`;

    console.log('✓ Prompt preparado');
    console.log('--- LLAMANDO A CLAUDE API ---');

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
        max_tokens: 1000,
        temperature: 0.3,
        messages: [{
          role: 'user',
          content: prompt
        }]
      })
    });

    console.log('Claude API status:', claudeResponse.status);

    if (!claudeResponse.ok) {
      const errorText = await claudeResponse.text();
      console.error('❌ Error de Claude API:', errorText);
      throw new Error(`Claude API error: ${claudeResponse.status} - ${errorText}`);
    }

    const claudeData = await claudeResponse.json();
    console.log('✓ Respuesta recibida de Claude');
    
    const analysisText = claudeData.content[0].text;
    console.log('--- RESPUESTA DE CLAUDE ---');
    console.log(analysisText);
    console.log('--- FIN RESPUESTA ---');

    // Extraer JSON
    let analysis;
    try {
      // Limpiar markdown si existe
      const cleanText = analysisText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      analysis = JSON.parse(cleanText);
      console.log('✓ JSON parseado correctamente');
    } catch (e) {
      console.log('⚠ Intento 1 falló, buscando JSON en el texto...');
      const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error('❌ No se encontró JSON en la respuesta');
        throw new Error('No se pudo extraer JSON de la respuesta de Claude');
      }
      analysis = JSON.parse(jsonMatch[0]);
      console.log('✓ JSON extraído y parseado');
    }

    if (!analysis.topics || !Array.isArray(analysis.topics)) {
      console.error('❌ Formato inválido:', analysis);
      throw new Error('Formato de respuesta inválido de Claude');
    }

    console.log(`✓ Temas identificados: ${analysis.topics.length}`);
    console.log('Temas:', analysis.topics.map(t => t.name).join(', '));

    // Limpiar temas
    const cleanedTopics = analysis.topics
      .map(topic => ({
        name: cleanTopic(topic.name),
        relevance: topic.relevance || 0.5
      }))
      .filter(topic => topic.name.length > 0 && topic.name.length < 100)
      .slice(0, 10);

    console.log(`✓ Temas limpiados: ${cleanedTopics.length}`);

    // Primero, eliminar temas existentes de estas conversaciones
    await pool.query(`
      DELETE FROM topics 
      WHERE conversation_id = ANY($1)
    `, [conversationIds]);
    console.log('✓ Temas anteriores eliminados');

    // Guardar nuevos temas
    let savedTopics = 0;
    for (const convId of conversationIds) {
      for (const topic of cleanedTopics) {
        try {
          await pool.query(`
            INSERT INTO topics (conversation_id, topic_name, relevance_score)
            VALUES ($1, $2, $3)
          `, [convId, topic.name, topic.relevance]);
          savedTopics++;
        } catch (err) {
          console.error('Error guardando tema:', err.message);
        }
      }
    }

    console.log(`✓ Guardados ${savedTopics} temas en BD`);

    await pool.end();

    console.log('=== FIN ANÁLISIS EXITOSO ===');

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
    console.error('❌ ERROR EN ANÁLISIS:', error);
    console.error('Stack:', error.stack);
    
    return {
      statusCode: error.message === 'No autorizado' ? 401 : 500,
      headers,
      body: JSON.stringify({ 
        error: 'Error al analizar temas',
        details: error.message,
        stack: error.stack
      })
    };
  }
};

// ============================================
// LIMPIAR NOMBRES DE TEMAS
// ============================================

function cleanTopic(topicName) {
  let cleaned = topicName.trim();
  
  // Eliminar redundancias
  const redundancies = [
    / de Venezuela$/i,
    / venezolano$/i,
    / venezolana$/i,
    / venezolanos$/i,
    / venezolanas$/i,
    / en Venezuela$/i,
    /^La /,
    /^El /,
    /^Los /,
    /^Las /
  ];
  
  redundancies.forEach(pattern => {
    cleaned = cleaned.replace(pattern, '');
  });
  
  // Capitalizar
  cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  
  // Limpiar espacios
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  return cleaned;
}
