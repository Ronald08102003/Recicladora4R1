const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres.uncwomrludpermxhuxhq:eF4RSPGcfpnnyBlQ@aws-1-us-east-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

// prueba inmediata de conexión
(async () => {
  try {
    const res = await pool.query('SELECT NOW()');
    console.log('✅ CONEXIÓN OK SUPABASE:', res.rows[0]);
  } catch (err) {
    console.error('❌ ERROR DB:', err);
  }
})();

module.exports = pool;





