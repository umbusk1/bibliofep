// ============================================
// FUNCIÓN: UPLOAD JSON
// Recibe archivo JSON y lo procesa
// ============================================

const { Pool } = require('pg');

exports.handler = async (event, context) => {
  // Solo permitir POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // Parsear el JSON del body
    const jsonData = JSON.parse(event.body);
    
    // Validar que tenga la estructura correcta
    if (!jsonData.conversations || !Array.isArray(jsonData.conversations)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid JSON structure' })
      };
    }

    // Conectar a la base de datos
    const pool = new Pool({
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

    // Comenzar transacción
    await pool.query('BEGIN');

    let conversationsProcessed = 0;
    let messagesProcessed = 0;

    // Procesar cada conversación
    for (const conv of jsonData.conversations) {
      // Extraer mes y año de created_at
      const createdAt = new Date(conv.created_at);
      const month = createdAt.getMonth() + 1;
      const year = createdAt.getFullYear();

      // Insertar conversación
      await pool.query(`
        INSERT INTO conversations (
          id, chatbot_id, chatbot_name, country, created_at, 
          title, message_count, min_score, source, user_id_chat, 
          anonymous_id, month, year, sentiment, last_message_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        ON CONFLICT (id) DO NOTHING
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

      conversationsProcessed++;

      // Procesar mensajes de esta conversación
      if (conv.messages && Array.isArray(conv.messages)) {
        for (const msg of conv.messages) {
          // Solo procesar mensajes que tengan ID (no son mensajes iniciales del asistente)
          if (msg.id) {
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

    // Commit transacción
    await pool.query('COMMIT');
    await pool.end();

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
          messagesProcessed,
          filename,
          period: `${jsonData.startDateStr} a ${jsonData.endDateStr}`
        }
      })
    };

  } catch (error) {
    console.error('Error processing JSON:', error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Error al procesar el archivo',
        details: error.message 
      })
    };
  }
};
