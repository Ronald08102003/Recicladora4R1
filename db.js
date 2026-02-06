const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.SUPABASE_URL, 
  ssl: {
    rejectUnauthorized: false 
  }
});

// Esto te dirá en los logs de Render si la conexión fue exitosa
pool.connect((err) => {
  if (err) {
    console.error('❌ Error de conexión a la base de datos:', err.stack);
  } else {
    console.log('✅ Conexión exitosa a la base de datos de Recicladora 4R');
  }
});

module.exports = pool;
