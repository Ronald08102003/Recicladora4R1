const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.SUPABASE_URL, 
  ssl: {
    rejectUnauthorized: false 
  },
  connectionTimeoutMillis: 5000, // Máximo 5 segundos para conectar
  idleTimeoutMillis: 30000 // Cerrar conexiones inactivas
});

pool.connect((err) => {
  if (err) {
    console.error('❌ Error de conexión:', err.stack);
  } else {
    console.log('✅ Conexión exitosa a la base de datos de Recicladora 4R');
  }
});

module.exports = pool;
