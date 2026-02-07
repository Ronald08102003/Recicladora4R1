// db.js
const { Pool } = require('pg');

// URL completa de conexión (supabase)
const connectionString = process.env.DATABASE_URL || 
    'postgresql://postgres:h5BVoOWRqsvdl7lB@uncwomrludpermxhuxhq.supabase.co:5432/postgres';

const pool = new Pool({
  connectionString: connectionString,
  ssl: { rejectUnauthorized: false } // necesario para Render / conexión externa
});

// Test de conexión
pool.query('SELECT NOW()', (err, res) => {
  if (err) console.error('❌ Error de conexión a la DB:', err.stack);
  else console.log('✅ Conexión exitosa a la base de datos de Recicladora 4R:', res.rows[0]);
});

module.exports = pool;





