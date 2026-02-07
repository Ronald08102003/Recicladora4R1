const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // Aquí usamos DATABASE_URL
  ssl: { rejectUnauthorized: false } // necesario en Render
});

pool.connect((err) => {
  if (err) {
    console.error('❌ Error de conexión:', err.stack);
  } else {
    console.log('✅ Conexión exitosa a la base de datos de Recicladora 4R');
  }
});

module.exports = pool;
