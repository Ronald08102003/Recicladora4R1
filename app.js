// app.js
const express = require('express');
const path = require('path');
const pool = require('./db'); // conexión a PostgreSQL/Supabase
const nodemailer = require('nodemailer');

const app = express();

// ================= CONFIGURACIÓN =================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let carritoTemporal = {};

// ================= EMAIL =================
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER, // env variable en Render
    pass: process.env.EMAIL_PASS  // env variable en Render
  }
});

// ================= RUTAS HTML =================
const rutasHTML = [
  ['/', 'Recicladora4R.html'],
  ['/login', 'login.html'],
  ['/registro', 'Registro.html'],
  ['/olvide_password', 'restablecer.html'],
  ['/panel_admin', 'panel.html'],
  ['/panel_usuario', 'panel_usuario.html'],
  ['/carrito', 'carrito.html'],
  ['/mis_pedidos', 'mis_pedidos.html'],
  ['/gestionar_pedidos', 'gestionar_pedidos.html'],
  ['/productos', 'productos.html'],
  ['/usuarios', 'usuarios.html'],
  ['/reportes', 'reportes.html'],
  ['/gestion_ventas', 'gestion_ventas.html'],
  ['/finalizar_pedido', 'finalizar_pedido.html'],
  ['/ver_detalle', 'ver_detalle.html']
];

rutasHTML.forEach(([ruta, archivo]) => {
  app.get(ruta, (req, res) => res.sendFile(path.join(__dirname, archivo)));
});

// ================= LOGIN =================
app.post('/api/login', async (req, res) => {
    try {
        const { usuario, clave } = req.body;
        console.log('Intento de login:', usuario);

        const result = await pool.query(
            'SELECT id, nombre, usuario, clave, rol FROM usuarios WHERE usuario = $1',
            [usuario]
        );

        console.log('Resultado consulta:', result.rows);

        if (result.rows.length === 0) 
            return res.json({ success: false, message: 'Usuario no encontrado' });

        const user = result.rows[0];
        if (clave.trim() !== user.clave.trim()) 
            return res.json({ success: false, message: 'Clave incorrecta' });

        res.json({
            success: true,
            userId: user.id,
            redirect: user.rol === 'admin' ? '/panel_admin' : '/panel_usuario'
        });
    } catch (err) {
        console.error("❌ ERROR EN LOGIN DETALLADO:", err);
        res.status(500).json({ success: false, message: 'Error de conexión con el servidor' });
    }
});

// ================= REGISTRO =================
app.post('/api/registro', async (req, res) => {
    try {
        const { nombre, correo, usuario, clave, telefono, provincia, ciudad, direccion } = req.body;

        const check = await pool.query('SELECT id FROM usuarios WHERE usuario = $1 OR correo = $2', [usuario, correo]);
        if (check.rows.length > 0) return res.json({ success: false, message: 'Usuario o correo ya existe' });

        await pool.query(`
            INSERT INTO usuarios (nombre, correo, usuario, clave, rol, telefono, provincia, ciudad, direccion)
            VALUES ($1,$2,$3,$4,'cliente',$5,$6,$7,$8)
        `, [nombre, correo, usuario, clave, telefono, provincia, ciudad, direccion]);

        res.json({ success: true });
    } catch (err) { 
        console.error("❌ ERROR EN REGISTRO:", err);
        res.status(500).json({ success: false, message: err.message }); 
    }
});

// ================= PRODUCTOS Y CARRITO =================
app.get('/api/productos-cliente', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, nombre, peso_kg, stock FROM productos WHERE stock > 0');
        res.json(result.rows);
    } catch (err) { 
        console.error("❌ ERROR PRODUCTOS:", err);
        res.status(500).send(err.message); 
    }
});

app.post('/api/agregar-al-carrito', (req, res) => {
    const { id_producto, cantidad } = req.body;
    carritoTemporal[id_producto] = (carritoTemporal[id_producto] || 0) + Number(cantidad);
    res.json({ success: true });
});

app.post('/api/finalizar-pedido', async (req, res) => {
    const { id_usuario } = req.body;
    try {
        await pool.query('BEGIN');
        const pedido = await pool.query(
            'INSERT INTO pedidos (id_usuario, fecha, total_peso, estado) VALUES ($1,NOW(),0,$2) RETURNING id',
            [id_usuario, 'Pendiente']
        );
        const idPedido = pedido.rows[0].id;
        let total = 0;

        for (const id in carritoTemporal) {
            const cant = carritoTemporal[id];
            const p = await pool.query('SELECT * FROM productos WHERE id = $1', [id]);
            const sub = p.rows[0].peso_kg * cant;
            total += sub;
            await pool.query(
                'INSERT INTO detalle_pedidos (id_pedido, id_producto, cantidad, peso_subtotal) VALUES ($1,$2,$3,$4)',
                [idPedido, id, cant, sub]
            );
            await pool.query('UPDATE productos SET stock = stock - $1 WHERE id = $2', [cant, id]);
        }

        await pool.query('UPDATE pedidos SET total_peso = $1 WHERE id = $2', [total, idPedido]);
        await pool.query('COMMIT');
        carritoTemporal = {};
        res.json({ success: true });
    } catch (err) {
        await pool.query('ROLLBACK');
        console.error("❌ ERROR FINALIZAR PEDIDO:", err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// ================= LOGOUT =================
app.get('/logout', (req, res) => {
    carritoTemporal = {};
    res.redirect('/login');
});

// ================= PUERTO DINÁMICO =================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ RECICLADORA 4R ACTIVA EN PUERTO ${PORT}`);
});

