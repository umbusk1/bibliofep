// ============================================
// FUNCIÓN: ANALYZE TOPICS - VERSIÓN ROBUSTA
// Con mejor manejo de timeouts y errores
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
    const authHeader = event.headers.authorization || event.headers.Authorization;
    verifyAuth(authHeader);

    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY no está configurada');
    }

    const body = JSON.parse(event.body || '{}');
    const specificIds = body.conversationIds;

    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });

    // Query: conversaciones sin temas - LÍMITE REDUCIDO A 20
    let query = `
      SELECT c.id, c.title, c.created_at
      FROM conversations c
      LEFT JOIN topics t ON c.id = t.conversation_id
      WHERE t.conversation_id IS NULL
    `;
    let queryParams = [];

    if (specificIds && specificIds.length > 0) {
      query += ` AND c.id = ANY($1)`;
      queryParams.push(specificIds);
    }

    query += ` ORDER BY c.created_at DESC LIMIT 10`; // REDUCIDO DE 50 A 10

    const conversationsResult = await pool.query(query, queryParams);

    console.log(`✓ Encontradas ${conversationsResult.rows.length} conversaciones sin analizar`);

    if (conversationsResult.rows.length === 0) {
      await pool.end();
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'No hay conversaciones nuevas para analizar',
          conversationsAnalyzed: 0,
          topicsSaved: 0
        })
      };
    }

    let totalTopicsSaved = 0;
    let conversationsAnalyzed = 0;
    const BATCH_SIZE = 2; // REDUCIDO DE 5 A 2

    // Procesar en lotes
    for (let i = 0; i < conversationsResult.rows.length; i += BATCH_SIZE) {
      const batch = conversationsResult.rows.slice(i, i + BATCH_SIZE);
      const batchIds = batch.map(c => c.id);

      console.log(`--- Lote ${Math.floor(i/BATCH_SIZE) + 1}: ${batch.length} conversaciones ---`);

      // Obtener mensajes
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
      `, [batchIds]);

      if (messagesResult.rows.length === 0) {
        console.log('⚠ Sin mensajes, saltando');
        continue;
      }

      // Agrupar por conversación
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

      // Preparar texto
      const conversationsList = Object.entries(conversationTexts)
        .map(([id, data], index) => {
          const messagesText = data.messages.slice(0, 5).join(' ');
          return `CONV${index + 1}: ${messagesText.substring(0, 300)}`;
        }).join('\n\n');

      // PROMPT MEJORADO
      const prompt = `Analiza estas ${batch.length} conversaciones sobre Historia de Venezuela y asigna 1-3 temas a cada una.

${conversationsList}

REGLAS:
1. Temas generales (máx 3 palabras)
2. NO uses "de Venezuela"
3. Agrupa temas similares

EJEMPLOS: Independencia, Próceres, Fuerzas Armadas, Democracia, Economía, Educación

RESPONDE SOLO CON JSON VÁLIDO (sin markdown ni comentarios):
{"conversations":[{"conv_id":"CONV1","topics":["Próceres","Independencia"]},{"conv_id":"CONV2","topics":["Democracia"]}]}`;

      // Llamar a Claude
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
          temperature: 0.3,
          messages: [{
            role: 'user',
            content: prompt
          }]
        })
      });

      if (!claudeResponse.ok) {
        console.error('❌ Error de Claude API');
        continue;
      }

      const claudeData = await claudeResponse.json();
      const analysisText = claudeData.content[0].text;

      // MEJORAR PARSING DE JSON
      let analysis;
      try {
        // Intentar parsear directamente
        const cleanText = analysisText
          .replace(/```json\n?/g, '')
          .replace(/```\n?/g, '')
          .replace(/\/\/.*$/gm, '') // Eliminar comentarios
          .trim();

        analysis = JSON.parse(cleanText);
      } catch (e) {
        console.error('⚠ Error parseando JSON, intentando extraer...');

        // Intentar extraer JSON del texto
        const jsonMatch = analysisText.match(/\{[\s\S]*"conversations"[\s\S]*\}/);
        if (!jsonMatch) {
          console.error('⚠ No se pudo extraer JSON, saltando lote');
          console.error('Respuesta de Claude:', analysisText.substring(0, 500));
          continue;
        }

        try {
          const extractedJson = jsonMatch[0]
            .replace(/,\s*}/g, '}') // Eliminar comas finales
            .replace(/,\s*]/g, ']'); // Eliminar comas finales en arrays
          analysis = JSON.parse(extractedJson);
        } catch (e2) {
          console.error('⚠ Fallo extrayendo JSON, saltando lote');
          console.error('JSON extraído:', jsonMatch[0].substring(0, 500));
          continue;
        }
      }

      if (!analysis.conversations || !Array.isArray(analysis.conversations)) {
        console.error('⚠ Formato inválido, saltando');
        continue;
      }

      // Mapear CONV1, CONV2... a IDs reales
      const convMapping = Object.keys(conversationTexts);

// Guardar temas
for (const convResult of analysis.conversations) {
  const convIndex = parseInt(convResult.conv_id.replace('CONV', '')) - 1;
  const realConvId = convMapping[convIndex];

  if (!realConvId) {
    console.log(`⚠ No se encontró ID real para ${convResult.conv_id}`);
    continue;
  }

  if (!convResult.topics) {
    console.log(`⚠ No hay temas para conversación ${realConvId}`);
    continue;
  }

  console.log(`Guardando temas para conversación ${realConvId}:`, convResult.topics);

  for (const topicName of convResult.topics) {
    const cleanedTopic = cleanTopic(topicName);

    if (!cleanedTopic || cleanedTopic.length === 0) {
      console.log(`⚠ Tema vacío después de limpiar: "${topicName}"`);
      continue;
    }

    try {
      console.log(`  Insertando: ${realConvId} -> ${cleanedTopic}`);

      const result = await pool.query(`
        INSERT INTO topics (conversation_id, topic_name, relevance_score)
        VALUES ($1, $2, $3)
        ON CONFLICT DO NOTHING
        RETURNING id
      `, [realConvId, cleanedTopic, 1.0]);

      if (result.rows.length > 0) {
        console.log(`  ✓ Tema guardado con ID: ${result.rows[0].id}`);
        totalTopicsSaved++;
      } else {
        console.log(`  ⚠ Tema ya existía (ON CONFLICT)`);
      }

    } catch (err) {
      console.error(`  ❌ ERROR guardando tema "${cleanedTopic}":`, err);
      console.error(`     Conversación: ${realConvId}`);
      console.error(`     Error completo:`, err.stack);
    }
  }
}

      conversationsAnalyzed += batch.length;
      console.log(`✓ Lote procesado: ${totalTopicsSaved} temas totales`);

      // Pausa más larga para evitar saturar API
      await new Promise(resolve => setTimeout(resolve, 1500));
    }

    await pool.end();

    console.log('=== FIN ANÁLISIS ===');
    console.log(`Total: ${conversationsAnalyzed} conversaciones, ${totalTopicsSaved} temas`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        conversationsAnalyzed,
        topicsSaved: totalTopicsSaved,
        message: `Análisis completado: ${conversationsAnalyzed} conversaciones, ${totalTopicsSaved} temas`
      })
    };

  } catch (error) {
    console.error('❌ ERROR:', error);

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

// Función de limpieza
function cleanTopic(topicName) {
  if (!topicName) return '';

  let cleaned = topicName.trim();

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

  cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  return cleaned;
}