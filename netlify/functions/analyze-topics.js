// ============================================
// FUNCIÓN: ANALYZE TOPICS - VERSIÓN CORREGIDA
// Analiza conversaciones individualmente
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

    // Obtener conversaciones SIN temas analizados
    const conversationsResult = await pool.query(`
      SELECT c.id, c.title, c.created_at
      FROM conversations c
      LEFT JOIN topics t ON c.id = t.conversation_id
      WHERE t.conversation_id IS NULL
      ORDER BY c.created_at DESC
      LIMIT 20
    `);

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
          topicsAnalyzed: 0
        })
      };
    }

    let totalTopicsSaved = 0;
    let conversationsAnalyzed = 0;
    const BATCH_SIZE = 3; // Analizar de 5 en 5

    // Procesar en lotes
    for (let i = 0; i < conversationsResult.rows.length; i += BATCH_SIZE) {
      const batch = conversationsResult.rows.slice(i, i + BATCH_SIZE);
      const batchIds = batch.map(c => c.id);
      
      console.log(`\n--- Procesando lote ${Math.floor(i/BATCH_SIZE) + 1} (${batch.length} conversaciones) ---`);

      // Obtener mensajes de este lote
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
        console.log('⚠ Sin mensajes en este lote, saltando...');
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

      // Preparar texto para análisis - FORMATO MEJORADO
      const conversationsList = Object.entries(conversationTexts)
        .map(([id, data], index) => {
          const messagesText = data.messages.slice(0, 5).join(' ');
          return `CONV${index + 1}: ${messagesText.substring(0, 300)}`;
        }).join('\n\n');

      console.log(`Texto preparado (${conversationsList.length} caracteres)`);

      // PROMPT OPTIMIZADO
      const prompt = `Analiza estas ${batch.length} conversaciones sobre Historia de Venezuela y asigna 1-3 TEMAS ESPECÍFICOS a cada conversación.

${conversationsList}

REGLAS:
1. Cada conversación debe tener sus propios temas según su contenido
2. Temas generales y concisos (max 3 palabras)
3. NO uses "de Venezuela" - se sobreentiende
4. Agrupa temas similares con el mismo nombre

TEMAS VÁLIDOS (ejemplos):
✅ Independencia, Próceres, Fuerzas Armadas, Democracia, Época Colonial, Caudillismo, Economía, Educación, Cultura, Política, Historia Regional, Personajes, Batallas, Instituciones

RESPONDE JSON (sin markdown):
{
  "conversations": [
    {"conv_id": "CONV1", "topics": ["Próceres", "Independencia"]},
    {"conv_id": "CONV2", "topics": ["Democracia"]},
    {"conv_id": "CONV3", "topics": ["Fuerzas Armadas", "Historia"]}
  ]
}`;

      console.log('Llamando a Claude API...');

      // Llamar a Claude
      const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 2000,
          temperature: 0.3,
          messages: [{
            role: 'user',
            content: prompt
          }]
        })
      });

      if (!claudeResponse.ok) {
        const errorText = await claudeResponse.text();
        console.error('❌ Error de Claude API:', errorText);
        continue; // Saltar este lote y continuar
      }

      const claudeData = await claudeResponse.json();
      const analysisText = claudeData.content[0].text;
      console.log('Respuesta recibida');

      // Extraer y parsear JSON
      let analysis;
      try {
        const cleanText = analysisText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        analysis = JSON.parse(cleanText);
      } catch (e) {
        const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          console.error('⚠ No se pudo parsear JSON, saltando lote');
          continue;
        }
        analysis = JSON.parse(jsonMatch[0]);
      }

      if (!analysis.conversations || !Array.isArray(analysis.conversations)) {
        console.error('⚠ Formato inválido, saltando lote');
        continue;
      }

      // Mapear CONV1, CONV2... a IDs reales
      const convMapping = Object.keys(conversationTexts);

      // Guardar temas por conversación
      for (const convResult of analysis.conversations) {
        const convIndex = parseInt(convResult.conv_id.replace('CONV', '')) - 1;
        const realConvId = convMapping[convIndex];
        
        if (!realConvId || !convResult.topics) continue;

        for (const topicName of convResult.topics) {
          const cleanedTopic = cleanTopic(topicName);
          if (!cleanedTopic || cleanedTopic.length === 0) continue;

          try {
            await pool.query(`
              INSERT INTO topics (conversation_id, topic_name, relevance_score)
              VALUES ($1, $2, $3)
              ON CONFLICT DO NOTHING
            `, [realConvId, cleanedTopic, 1.0]);
            totalTopicsSaved++;
          } catch (err) {
            console.error('Error guardando tema:', err.message);
          }
        }
      }

      conversationsAnalyzed += batch.length;
      console.log(`✓ Lote procesado: ${totalTopicsSaved} temas guardados hasta ahora`);

      // Pequeña pausa para no saturar la API
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    await pool.end();

    console.log('=== FIN ANÁLISIS EXITOSO ===');
    console.log(`Total: ${conversationsAnalyzed} conversaciones, ${totalTopicsSaved} temas`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        conversationsAnalyzed,
        topicsAnalyzed: Math.floor(totalTopicsSaved / Math.max(conversationsAnalyzed, 1)),
        topicsSaved: totalTopicsSaved
      })
    };

  } catch (error) {
    console.error('❌ ERROR EN ANÁLISIS:', error);
    
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
// LIMPIAR NOMBRES DE TEMAS
// ============================================

function cleanTopic(topicName) {
  if (!topicName) return '';
  
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
  
  // Capitalizar primera letra
  cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  
  // Limpiar espacios múltiples
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  return cleaned;
}
