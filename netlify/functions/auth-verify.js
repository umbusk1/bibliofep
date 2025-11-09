// ============================================
// FUNCIÓN: VERIFY TOKEN
// Verifica si un JWT token es válido
// ============================================

const jwt = require('jsonwebtoken');

exports.handler = async (event, context) => {
  // Permitir GET y OPTIONS
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
    // Obtener token del header Authorization
    const authHeader = event.headers.authorization || event.headers.Authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ 
          error: 'Token no proporcionado' 
        })
      };
    }

    const token = authHeader.substring(7); // Remover "Bearer "

    // Verificar token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        valid: true,
        user: {
          userId: decoded.userId,
          email: decoded.email,
          role: decoded.role
        }
      })
    };

  } catch (error) {
    console.error('Error verificando token:', error);
    
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ 
        valid: false,
        error: 'Token inválido o expirado' 
      })
    };
  }
};
