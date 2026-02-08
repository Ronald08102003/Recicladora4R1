// db.js
const { Pool } = require('pg');

const pool = new Pool({
  host: 'uncwomrludpermxhuxhq.supabase.co',
  port: 5432,
  user: 'postgres',
  password: 'h5BVoOWRqsvdl7lB',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

// prueba inmediata
(async () => {
  try {
    const res = await pool.query('SELECT NOW()');
    console.log('✅ DB conectada a Supabase:', res.rows[0]);
  } catch (err) {
    console.error('❌ ERROR DB:', err);
  }
})();

module.exports = pool;








