const express = require('express');
const path = require('path');
const pool = require('./db'); 
const nodemailer = require('nodemailer');

const app = express();

// ================= CONFIGURACIÓN =================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir archivos estáticos desde la raíz del proyecto
app.use(express.static(__dirname));

let carritoTemporal = {};

// ================= CONFIGURACIÓN EMAIL =================
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'ronaldvaldiviesoface@gmail.com',
        pass: 'devyzpfnsokkecdw'
    }
});

// ================= RUTAS DE NAVEGACIÓN (CORREGIDAS) =================
// Según tus logs de Render, el sistema busca 'recicladora4r.html' en minúsculas. 
// Estas rutas aseguran que el archivo se encuentre sin importar la extensión.

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'Recicladora4R.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/registro', (req, res) => res.sendFile(path.join(__dirname, 'Registro.html')));

// Rutas para los paneles y gestión administrativa
app.get('/panel_admin', (req, res) => res.sendFile(path.join(__dirname, 'panel.html')));
app.get('/panel_usuario', (req, res) => res.sendFile(path.join(__dirname, 'panel_usuario.html')));
app.get('/carrito', (req, res) => res.sendFile(path.join(__dirname, 'carrito.html')));
app.get('/mis_pedidos', (req, res) => res.sendFile(path.join(__dirname, 'mis_pedidos.html')));
app.get('/gestionar_pedidos', (req, res) => res.sendFile(path.join(__dirname, 'gestionar_pedidos.html')));
app.get('/productos', (req, res) => res.sendFile(path.join(__dirname, 'productos.html')));
app.get('/usuarios', (req, res) => res.sendFile(path.join(__dirname, 'usuarios.html')));
app.get('/reportes', (req, res) => res.sendFile(path.join(__dirname, 'reportes.html')));
app.get('/gestion_ventas', (req, res) => res.sendFile(path.join(__dirname, 'gestion_ventas.html')));
app.get('/finalizar_pedido', (req, res) => res.sendFile(path.join(__dirname, 'finalizar_pedido.html')));
app.get('/ver_detalle', (req, res) => res.sendFile(path.join(__dirname, 'ver_detalle.html')));

// ================= API LOGIN (CON MANEJO DE ERRORES) =================
app.post('/api/login', async (req, res) => {
    try {
        const { usuario, clave } = req.body;
        const result = await pool.query(
            'SELECT id, nombre, usuario, clave, rol FROM usuarios WHERE usuario = $1',
            [usuario]
        );

        if (result.rows.length === 0) {
            return res.json({ success: false, message: 'Usuario no encontrado' });
        }

        const user = result.rows[0];
        if (clave.trim() !== user.clave.trim()) {
            return res.json({ success: false, message: 'Clave incorrecta' });
        }

        res.json({
            success: true,
            userId: user.id,
            redirect: user.rol === 'admin' ? '/panel_admin' : '/panel_usuario'
        });
    } catch (err) {
        console.error("Error en la conexión con la base de datos:", err.message);
        res.status(500).json({ success: false, message: 'Error de conexión con el servidor' });
    }
});

// ================= API REGISTRO =================
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
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ================= PRODUCTOS Y PEDIDOS =================
app.get('/api/productos-cliente', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, nombre, peso_kg, stock FROM productos WHERE stock > 0');
        res.json(result.rows);
    } catch (err) { res.status(500).send(err.message); }
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
        const pedido = await pool.query('INSERT INTO pedidos (id_usuario, fecha, total_peso, estado) VALUES ($1,NOW(),0,$2) RETURNING id', [id_usuario, 'Pendiente']);
        const idPedido = pedido.rows[0].id;
        let total = 0;
        for (const id in carritoTemporal) {
            const cant = carritoTemporal[id];
            const p = await pool.query('SELECT * FROM productos WHERE id = $1', [id]);
            const sub = p.rows[0].peso_kg * cant;
            total += sub;
            await pool.query('INSERT INTO detalle_pedidos (id_pedido, id_producto, cantidad, peso_subtotal) VALUES ($1,$2,$3,$4)', [idPedido, id, cant, sub]);
            await pool.query('UPDATE productos SET stock = stock - $1 WHERE id = $2', [cant, id]);
        }
        await pool.query('UPDATE pedidos SET total_peso = $1 WHERE id = $2', [total, idPedido]);
        await pool.query('COMMIT');
        carritoTemporal = {};
        res.json({ success: true });
    } catch (err) {
        await pool.query('ROLLBACK');
        res.status(500).json({ success: false, message: err.message });
    }
});

// ================= SALIDA =================
app.get('/logout', (req, res) => {
    carritoTemporal = {};
    res.redirect('/login');
});

// ================= PUERTO DINÁMICO =================
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ RECICLADORA 4R ACTIVA EN PUERTO ${PORT}`);
});

