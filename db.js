// db.js
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:h5BVoOWRqsvdl7lB@db.uncwomrludpermxhuxhq.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false } // obligatorio en Render
});

pool.connect(err => {
  if (err) {
    console.error('❌ Error de conexión a la DB:', err.stack);
  } else {
    console.log('✅ Conexión exitosa a la base de datos de Recicladora 4R');
  }
});

module.exports = pool;


