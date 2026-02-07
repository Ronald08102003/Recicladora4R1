const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // La URL real de Postgres/Supabase
  ssl: { rejectUnauthorized: false }         // Necesario en Render
});

pool.connect(err => {
  if (err) {
    console.error('❌ Error de conexión a la DB:', err.stack);
  } else {
    console.log('✅ Conexión exitosa a la base de datos de Recicladora 4R');
  }
});

module.exports = pool;



