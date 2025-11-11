// ============================================
// FUNCIÓN: UPLOAD JSON + ANÁLISIS AUTOMÁTICO
// ============================================

const { Pool } = require('pg');

// Importar la función de análisis
const analyzeTopicsHandler = require('./analyze-topics').handler;

exports.handler = async (event, context) => {
  // Solo permitir POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  let pool;

  try {
    const jsonData = JSON.parse(event.body);
    
    if (!jsonData.conversations || !Array.isArray(jsonData.conversations)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid JSON structure' })
      };
    }

    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });

    // Verificar si este archivo ya fue procesado
    const filename = `${jsonData.startDateStr}_${jsonData.endDateStr}.json`;
    const checkFile = await pool.query(
      'SELECT id FROM processed_files WHERE filename = $1',
      [filename]
    );

    if (checkFile.rows.length > 0) {
      await pool.end();
      return {
        statusCode: 409,
        body: JSON.stringify({ 
          error: 'Este archivo ya fue procesado anteriormente',
          filename: filename
        })
      };
    }

    await pool.query('BEGIN');

    let conversationsProcessed = 0;
    let messagesProcessed = 0;
    let messagesSkipped = 0;
    const newConversationIds = []; // Guardar IDs de conversaciones nuevas

    // Procesar cada conversación
    for (const conv of jsonData.conversations) {
      const createdAt = new Date(conv.created_at);
      const month = createdAt.getMonth() + 1;
      const year = createdAt.getFullYear();

      // Insertar conversación y capturar si fue insertada
      const insertResult = await pool.query(`
        INSERT INTO conversations (
          id, chatbot_id, chatbot_name, country, created_at, 
          title, message_count, min_score, source, user_id_chat, 
          anonymous_id, month, year, sentiment, last_message_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        ON CONFLICT (id) DO NOTHING
        RETURNING id
      `, [
        conv.id,
        conv.chatbot_id,
        jsonData.chatbotName,
        conv.country || 'Unknown',
        conv.created_at,
        conv.title,
        conv.messages ? conv.messages.length : 0,
        conv.min_score,
        conv.source,
        conv.user_id,
        conv.anonymous_id,
        month,
        year,
        conv.sentiment,
        conv.last_message_at
      ]);

      // Si fue insertada (nueva), guardar su ID
      if (insertResult.rows.length > 0) {
        newConversationIds.push(conv.id);
      }

      conversationsProcessed++;

      // Procesar mensajes
      if (conv.messages && Array.isArray(conv.messages)) {
        for (const msg of conv.messages) {
          if (msg.id && msg.createdAt) {
            try {
              await pool.query(`
                INSERT INTO messages (
                  id, conversation_id, role, content, score, 
                  created_at, step_id, message_type
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT (id) DO NOTHING
              `, [
                msg.id,
                conv.id,
                msg.role,
                msg.content,
                msg.score || null,
                msg.createdAt,
                msg.stepId || null,
                msg.type || 'text'
              ]);

              messagesProcessed++;
            } catch (msgError) {
              console.error(`Error insertando mensaje ${msg.id}:`, msgError.message);
              messagesSkipped++;
            }
          } else {
            messagesSkipped++;
          }
        }
      }
    }

    // Registrar archivo procesado
    await pool.query(`
      INSERT INTO processed_files (
        filename, start_date, end_date, total_conversations
      ) VALUES ($1, $2, $3, $4)
    `, [
      filename,
      jsonData.startDateStr,
      jsonData.endDateStr,
      conversationsProcessed
    ]);

    await pool.query('COMMIT');
    await pool.end();

    console.log(`✓ JSON procesado: ${conversationsProcessed} conversaciones, ${newConversationIds.length} nuevas`);

    // 🚀 ANÁLISIS AUTOMÁTICO DE CONVERSACIONES NUEVAS
    let analysisResult = null;
    if (newConversationIds.length > 0) {
      console.log(`🤖 Iniciando análisis automático de ${newConversationIds.length} conversaciones nuevas...`);
      
      try {
        // Llamar a la función de análisis
        const analysisEvent = {
          httpMethod: 'POST',
          headers: event.headers, // Pasar autenticación
          body: JSON.stringify({
            conversationIds: newConversationIds,
            autoMode: true // Indicar que es modo automático
          })
        };

        const analysisResponse = await analyzeTopicsHandler(analysisEvent, context);
        analysisResult = JSON.parse(analysisResponse.body);
        
        console.log(`✓ Análisis completado: ${analysisResult.topicsSaved} temas guardados`);
      } catch (analysisError) {
        console.error('⚠ Error en análisis automático:', analysisError.message);
        // No fallar el upload por esto
      }
    }

    // Respuesta exitosa
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        success: true,
        message: 'JSON procesado exitosamente',
        stats: {
          conversationsProcessed,
          conversationsNew: newConversationIds.length,
          messagesProcessed,
          messagesSkipped,
          filename,
          period: `${jsonData.startDateStr} a ${jsonData.endDateStr}`
        },
        analysis: analysisResult ? {
          topicsAnalyzed: analysisResult.topicsSaved || 0,
          conversationsAnalyzed: analysisResult.conversationsAnalyzed || 0
        } : null
      })
    };

  } catch (error) {
    console.error('Error processing JSON:', error);
    
    if (pool) {
      try {
        await pool.query('ROLLBACK');
        await pool.end();
      } catch (rollbackError) {
        console.error('Error en rollback:', rollbackError);
      }
    }
    
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Error al procesar el archivo',
        details: error.message 
      })
    };
  }
};
