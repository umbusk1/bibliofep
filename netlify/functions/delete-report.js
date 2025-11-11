// ============================================
// FUNCIÓN: DELETE REPORT
// Elimina un reporte publicado
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
    'Access-Control-Allow-Methods': 'DELETE, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'DELETE') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // Verificar autenticación y rol
    const authHeader = event.headers.authorization || event.headers.Authorization;
    const decoded = verifyAuth(authHeader);

    // Solo admin puede eliminar
    if (decoded.role !== 'admin') {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ error: 'No tienes permisos para eliminar reportes' })
      };
    }

    // Obtener ID del reporte
    const reportId = event.queryStringParameters?.id;

    if (!reportId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'ID de reporte no proporcionado' })
      };
    }

    // Conectar a la base de datos
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });

    // Verificar que el reporte existe
    const checkResult = await pool.query(
      'SELECT id, title FROM published_reports WHERE id = $1',
      [reportId]
    );

    if (checkResult.rows.length === 0) {
      await pool.end();
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Reporte no encontrado' })
      };
    }

    // Eliminar el reporte
    await pool.query('DELETE FROM published_reports WHERE id = $1', [reportId]);

    await pool.end();

    console.log(`✓ Reporte ${reportId} eliminado por ${decoded.email}`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Reporte eliminado exitosamente',
        reportId: reportId,
        reportTitle: checkResult.rows[0].title
      })
    };

  } catch (error) {
    console.error('Error eliminando reporte:', error);
    
    return {
      statusCode: error.message === 'No autorizado' ? 401 : 500,
      headers,
      body: JSON.stringify({ 
        error: 'Error al eliminar reporte',
        details: error.message 
      })
    };
  }
};
