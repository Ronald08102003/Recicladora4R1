require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const app = express();

// ================= CONFIG =================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: 'recicladora4r_secret',
    resave: false,
    saveUninitialized: false
}));

// ================= BD =================
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// ================= ARCHIVOS ESTÁTICOS =================
// Servimos los archivos HTML que ya tienes en la raíz
app.use(express.static(__dirname));

// ================= RUTA INICIO =================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'Recicladora4R.html'));
});

// ================= LOGIN =================
app.post('/login', async (req, res) => {
    const { usuario, clave } = req.body;

    try {
        const r = await pool.query(
            'SELECT * FROM usuarios WHERE usuario = $1',
            [usuario]
        );

        if (!r.rows.length) {
            return res.redirect('/login.html?error=1');
        }

        const user = r.rows[0];

        if (clave !== user.clave) {
            return res.redirect('/login.html?error=1');
        }

        req.session.usuario = {
            id: user.id,
            nombre: user.nombre,
            rol: user.rol
        };

        if (user.rol === 'admin') {
            res.redirect('/panel.html');
        } else {
            res.redirect('/usuario.html');
        }

    } catch (err) {
        console.error(err);
        res.redirect('/login.html?error=1');
    }
});

// ================= SESIÓN =================
app.get('/api/session', (req, res) => {
    if (!req.session.usuario) {
        return res.json({ logged: false });
    }
    res.json({ logged: true, usuario: req.session.usuario });
});

// ================= USUARIOS (ADMIN) =================
app.get('/api/usuarios', async (req, res) => {
    try {
        const r = await pool.query('SELECT * FROM usuarios ORDER BY id');
        res.json(r.rows);
    } catch (err) {
        res.status(500).json([]);
    }
});

// ================= PRODUCTOS =================
app.get('/api/productos', async (req, res) => {
    try {
        const r = await pool.query('SELECT * FROM productos ORDER BY id');
        res.json(r.rows);
    } catch (err) {
        res.status(500).json([]);
    }
});

// ================= INVENTARIO =================
app.get('/api/inventario', async (req, res) => {
    try {
        const r = await pool.query(`
            SELECT 
                p.id,
                p.nombre,
                COALESCE(SUM(d.cantidad),0) AS cantidad,
                COALESCE(SUM(d.peso_subtotal),0) AS peso
            FROM productos p
            LEFT JOIN detalle_pedidos d ON d.id_producto = p.id
            GROUP BY p.id, p.nombre
            ORDER BY p.nombre
        `);

        res.json(r.rows);
    } catch (err) {
        console.error('❌ INVENTARIO:', err.message);
        res.status(500).json([]);
    }
});

// ================= CREAR PEDIDO =================
app.post('/api/pedidos', async (req, res) => {
    const { id_usuario, materiales } = req.body;

    try {
        let total = 0;
        materiales.forEach(m => total += m.peso_subtotal);

        const pedido = await pool.query(`
            INSERT INTO pedidos (id_usuario, total_peso, estado)
            VALUES ($1, $2, 'pendiente')
            RETURNING id
        `, [id_usuario, total]);

        const id_pedido = pedido.rows[0].id;

        for (let m of materiales) {
            await pool.query(`
                INSERT INTO detalle_pedidos
                (id_pedido, id_producto, cantidad, peso_subtotal)
                VALUES ($1, $2, $3, $4)
            `, [id_pedido, m.id_producto, m.cantidad, m.peso_subtotal]);
        }

        res.json({ ok: true, id_pedido });

    } catch (err) {
        console.error('❌ PEDIDO:', err.message);
        res.status(500).json({ ok: false });
    }
});

// ================= MIS PEDIDOS (USUARIO) =================
app.get('/api/usuario/mis-pedidos/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const r = await pool.query(`
            SELECT 
                id,
                fecha,
                total_peso,
                estado
            FROM pedidos
            WHERE id_usuario = $1
            ORDER BY fecha DESC
        `, [id]);

        res.json(r.rows);
    } catch (err) {
        console.error('❌ MIS PEDIDOS:', err.message);
        res.status(500).json([]);
    }
});

// ================= DETALLE DE PEDIDO =================
app.get('/api/pedidos/detalle/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const pedido = await pool.query(`
            SELECT 
                p.id,
                p.fecha,
                p.total_peso,
                u.nombre,
                u.correo,
                u.telefono,
                u.ciudad,
                u.provincia,
                u.direccion
            FROM pedidos p
            JOIN usuarios u ON u.id = p.id_usuario
            WHERE p.id = $1
        `, [id]);

        if (!pedido.rows.length) {
            return res.status(404).json({ error: 'Pedido no encontrado' });
        }

        const detalles = await pool.query(`
            SELECT 
                pr.nombre AS material,
                d.cantidad,
                d.peso_subtotal
            FROM detalle_pedidos d
            JOIN productos pr ON pr.id = d.id_producto
            WHERE d.id_pedido = $1
        `, [id]);

        res.json({
            pedido: pedido.rows[0],
            detalles: detalles.rows
        });

    } catch (err) {
        console.error('❌ DETALLE PEDIDO:', err.message);
        res.status(500).json({ error: 'Error' });
    }
});

// ================= REPORTES =================
app.get('/api/reportes', async (req, res) => {
    try {
        const r = await pool.query(`
            SELECT 
                DATE(fecha) AS fecha,
                COUNT(*) AS pedidos,
                SUM(total_peso) AS total
            FROM pedidos
            GROUP BY DATE(fecha)
            ORDER BY fecha DESC
        `);

        res.json(r.rows);
    } catch (err) {
        res.status(500).json([]);
    }
});

// ================= LOGOUT =================
app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/login.html');
    });
});

// ================= SERVER =================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log('=================================');
    console.log('✅ RECICLADORA 4R ACTIVA');
    console.log('🚀 PUERTO:', PORT);
    console.log('=================================');
});



