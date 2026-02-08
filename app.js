const express = require('express');
const path = require('path');
const pool = require('./db'); // PostgreSQL / Supabase
const nodemailer = require('nodemailer');

const app = express();

// ================= CONFIGURACIÓN =================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

let carritoTemporal = {};

// ================= CONFIGURACIÓN EMAIL =================
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// ================= RUTAS HTML =================
const htmlFiles = [
    'Recicladora4R', 'login', 'Registro', 'restablecer',
    'panel', 'panel_usuario', 'carrito', 'mis_pedidos',
    'gestionar_pedidos', 'productos', 'usuarios', 'reportes',
    'gestion_ventas', 'finalizar_pedido', 'ver_detalle'
];

htmlFiles.forEach(file => {
    app.get(`/${file === 'Recicladora4R' ? '' : file.toLowerCase()}`, (req, res) => {
        res.sendFile(path.join(__dirname, `${file}.html`));
    });
});

// ================= RUTA BOTÓN INICIO =================
app.get('/panel_admin', (req, res) => res.redirect('/panel'));

// ================= LOGIN =================
app.post('/api/login', async (req, res) => {
    try {
        const { usuario, clave } = req.body;
        const result = await pool.query(
            'SELECT id, nombre, usuario, clave, rol FROM usuarios WHERE usuario = $1',
            [usuario]
        );

        if (!result.rows.length) return res.json({ success: false });

        const user = result.rows[0];
        if (clave.trim() !== user.clave.trim()) return res.json({ success: false });

        res.json({
            success: true,
            userId: user.id,
            redirect: user.rol === 'admin' ? '/panel' : '/panel_usuario'
        });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// ================= REGISTRO =================
app.post('/api/registro', async (req, res) => {
    try {
        const { nombre, correo, usuario, clave, telefono, provincia, ciudad, direccion } = req.body;

        await pool.query(`
            INSERT INTO usuarios
            (nombre, correo, usuario, clave, rol, telefono, provincia, ciudad, direccion)
            VALUES ($1,$2,$3,$4,'cliente',$5,$6,$7,$8)
        `, [nombre, correo, usuario, clave, telefono, provincia, ciudad, direccion]);

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// ================= PRODUCTOS CLIENTE =================
app.get('/api/productos-cliente', async (req, res) => {
    const result = await pool.query(
        'SELECT id, nombre, peso_kg, stock FROM productos WHERE stock > 0'
    );
    res.json(result.rows);
});

// ================= CARRITO =================
app.post('/api/agregar-al-carrito', (req, res) => {
    const { id_producto, cantidad } = req.body;
    carritoTemporal[id_producto] = (carritoTemporal[id_producto] || 0) + Number(cantidad);
    res.json({ success: true });
});

// ================= FINALIZAR PEDIDO =================
app.post('/api/finalizar-pedido', async (req, res) => {
    try {
        const { id_usuario } = req.body;
        await pool.query('BEGIN');

        const pedido = await pool.query(
            `INSERT INTO pedidos (id_usuario, fecha, total_peso, estado)
             VALUES ($1,NOW(),0,'Pendiente') RETURNING id`,
            [id_usuario]
        );

        let total = 0;
        for (const id in carritoTemporal) {
            const cant = carritoTemporal[id];
            const p = await pool.query('SELECT peso_kg FROM productos WHERE id=$1', [id]);
            const sub = p.rows[0].peso_kg * cant;
            total += sub;

            await pool.query(
                'INSERT INTO detalle_pedidos VALUES ($1,$2,$3,$4)',
                [pedido.rows[0].id, id, cant, sub]
            );

            await pool.query(
                'UPDATE productos SET stock = stock - $1 WHERE id=$2',
                [cant, id]
            );
        }

        await pool.query('UPDATE pedidos SET total_peso=$1 WHERE id=$2', [total, pedido.rows[0].id]);
        await pool.query('COMMIT');
        carritoTemporal = {};
        res.json({ success: true });
    } catch {
        await pool.query('ROLLBACK');
        res.status(500).json({ success: false });
    }
});

// ================= ADMIN USUARIOS =================
app.get('/api/admin/usuarios', async (req, res) => {
    const r = await pool.query('SELECT id,nombre,usuario,rol FROM usuarios ORDER BY id');
    res.json(r.rows);
});

app.put('/api/admin/usuarios/rol', async (req, res) => {
    await pool.query('UPDATE usuarios SET rol=$1 WHERE id=$2', [req.body.rol, req.body.id]);
    res.json({ success: true });
});

app.delete('/api/admin/usuarios/:id', async (req, res) => {
    await pool.query('DELETE FROM usuarios WHERE id=$1', [req.params.id]);
    res.json({ success: true });
});

// ================= ADMIN INVENTARIO =================
app.get('/api/admin/productos', async (req, res) => {
    const r = await pool.query('SELECT * FROM productos ORDER BY id');
    res.json(r.rows);
});

// ================= ADMIN PEDIDOS =================
app.get('/api/admin/pedidos', async (req, res) => {
    const r = await pool.query(`
        SELECT p.id, u.nombre AS cliente, p.total_peso, p.estado
        FROM pedidos p
        JOIN usuarios u ON u.id = p.id_usuario
        ORDER BY p.id DESC
    `);
    res.json(r.rows);
});

app.put('/api/admin/pedidos/estado', async (req, res) => {
    await pool.query(
        'UPDATE pedidos SET estado=$1 WHERE id=$2',
        [req.body.estado, req.body.id]
    );
    res.json({ success: true });
});

// ================= REPORTES =================
app.get('/api/admin/reportes-detallados', async (req, res) => {
    const productos = await pool.query('SELECT nombre, stock, peso_kg FROM productos');
    const resumen = await pool.query(`
        SELECT
            (SELECT COUNT(*) FROM productos) totalProductos,
            (SELECT COUNT(*) FROM pedidos WHERE estado='Completado') totalVentas,
            (SELECT COALESCE(SUM(total_peso),0) FROM pedidos WHERE estado='Completado') totalPeso
    `);

    res.json({
        resumen: resumen.rows[0],
        listaProductos: productos.rows,
        grafica: {
            nombres: productos.rows.map(p => p.nombre),
            stocks: productos.rows.map(p => p.stock)
        }
    });
});

// ================= GESTIÓN DE VENTAS =================
app.get('/api/admin/propuestas-venta', async (req, res) => {
    const r = await pool.query(`
        SELECT pv.*, u.nombre AS cliente, u.telefono, u.ciudad, u.provincia, u.direccion
        FROM propuestas_venta pv
        LEFT JOIN usuarios u ON u.id = pv.id_usuario
        ORDER BY pv.fecha DESC
    `);
    res.json(r.rows);
});

app.put('/api/admin/propuestas-venta/estado', async (req, res) => {
    await pool.query(
        'UPDATE propuestas_venta SET estado=$1 WHERE id=$2',
        [req.body.estado, req.body.id]
    );
    res.json({ success: true });
});

app.get('/api/admin/propuesta-detalle/:id', async (req, res) => {
    const r = await pool.query(`
        SELECT pv.*, u.nombre AS cliente, u.correo, u.telefono
        FROM propuestas_venta pv
        LEFT JOIN usuarios u ON u.id = pv.id_usuario
        WHERE pv.id=$1
    `, [req.params.id]);

    res.json(r.rows[0]);
});

// ================= LOGOUT =================
app.get('/logout', (req, res) => {
    carritoTemporal = {};
    res.redirect('/login');
});

// ================= PUERTO =================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ RECICLADORA 4R ACTIVA EN PUERTO ${PORT}`);
});

