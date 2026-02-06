const express = require('express');
const path = require('path');
const pool = require('./db'); // Conexión a Supabase
const nodemailer = require('nodemailer');

const app = express();

// ================= CONFIGURACIÓN =================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir archivos estáticos (CSS, Imágenes, JS) desde la raíz
app.use(express.static(path.join(__dirname)));

let carritoTemporal = {};

// ================= CONFIGURACIÓN EMAIL =================
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'ronaldvaldiviesoface@gmail.com',
        pass: 'devyzpfnsokkecdw'
    }
});

// ================= RUTAS HTML (NORMALIZADAS PARA RENDER) =================

// Ruta Principal
app.get('/', (req, res) => res.sendFile(path.resolve(__dirname, 'Recicladora4R.html')));
app.get('/Recicladora4R.html', (req, res) => res.redirect('/'));

// Login
app.get('/login', (req, res) => res.sendFile(path.resolve(__dirname, 'login.html')));
app.get('/login.html', (req, res) => res.redirect('/login'));

// Registro
app.get('/registro', (req, res) => res.sendFile(path.resolve(__dirname, 'Registro.html')));
app.get('/Registro.html', (req, res) => res.redirect('/registro'));

// Olvidé Password
app.get('/olvide_password', (req, res) => res.sendFile(path.resolve(__dirname, 'restablecer.html')));
app.get('/restablecer.html', (req, res) => res.redirect('/olvide_password'));

// Paneles y Gestión (Mapeo automático para evitar errores 404)
const paginas = [
    'panel', 'panel_usuario', 'carrito', 'mis_pedidos', 
    'gestionar_pedidos', 'productos', 'usuarios', 'reportes', 
    'gestion_ventas', 'finalizar_pedido', 'ver_detalle'
];

paginas.forEach(pag => {
    app.get(`/${pag}`, (req, res) => res.sendFile(path.resolve(__dirname, `${pag}.html`)));
    app.get(`/${pag}.html`, (req, res) => res.redirect(`/${pag}`));
});

// ================= API LOGIN =================
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
        res.status(500).json({ success: false, message: err.message });
    }
});

// ================= API REGISTRO =================
app.post('/api/registro', async (req, res) => {
    try {
        const { nombre, correo, usuario, clave, telefono, provincia, ciudad, direccion } = req.body;
        const check = await pool.query(
            'SELECT id FROM usuarios WHERE usuario = $1 OR correo = $2',
            [usuario, correo]
        );

        if (check.rows.length > 0) {
            return res.json({ success: false, message: 'Usuario o correo ya existe' });
        }

        await pool.query(`
            INSERT INTO usuarios 
            (nombre, correo, usuario, clave, rol, telefono, provincia, ciudad, direccion)
            VALUES ($1,$2,$3,$4,'cliente',$5,$6,$7,$8)
        `, [nombre, correo, usuario, clave, telefono, provincia, ciudad, direccion]);

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ================= RECUPERAR CLAVE =================
app.post('/api/olvide-password', async (req, res) => {
    try {
        const { correo } = req.body;
        const result = await pool.query(
            'SELECT nombre, usuario, clave FROM usuarios WHERE correo = $1',
            [correo]
        );

        if (result.rows.length === 0) {
            return res.json({ success: false, message: 'Correo no registrado' });
        }

        const user = result.rows[0];
        await transporter.sendMail({
            from: '"Recicladora 4R" <ronaldvaldiviesoface@gmail.com>',
            to: correo,
            subject: 'Recuperación de acceso',
            html: `<p>Usuario: ${user.usuario}</p><p>Clave: ${user.clave}</p>`
        });

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ================= GESTIÓN DE PRODUCTOS =================
app.get('/api/admin/productos', async (req, res) => {
    const result = await pool.query('SELECT * FROM productos ORDER BY nombre');
    res.json(result.rows);
});

app.post('/api/admin/productos', async (req, res) => {
    const { nombre, categoria, stock, peso_kg } = req.body;
    await pool.query(
        'INSERT INTO productos (nombre, categoria, stock, peso_kg) VALUES ($1,$2,$3,$4)',
        [nombre, categoria, stock, peso_kg]
    );
    res.json({ success: true });
});

app.delete('/api/admin/productos/:id', async (req, res) => {
    await pool.query('DELETE FROM productos WHERE id = $1', [req.params.id]);
    res.json({ success: true });
});

// ================= CARRITO Y PEDIDOS =================
app.get('/api/productos-cliente', async (req, res) => {
    const result = await pool.query('SELECT id, nombre, peso_kg, stock FROM productos WHERE stock > 0');
    res.json(result.rows);
});

app.post('/api/agregar-al-carrito', (req, res) => {
    const { id_producto, cantidad } = req.body;
    carritoTemporal[id_producto] = (carritoTemporal[id_producto] || 0) + Number(cantidad);
    res.json({ success: true });
});

app.get('/api/ver-carrito', async (req, res) => {
    let items = [];
    for (const id in carritoTemporal) {
        const p = await pool.query('SELECT * FROM productos WHERE id = $1', [id]);
        if (p.rows.length) {
            items.push({
                ...p.rows[0],
                cantidad: carritoTemporal[id],
                subtotal: p.rows[0].peso_kg * carritoTemporal[id]
            });
        }
    }
    res.json({ items });
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
        res.status(500).json({ success: false, message: err.message });
    }
});

// ================= SALIDA =================
app.get('/logout', (req, res) => {
    carritoTemporal = {};
    res.redirect('/login');
});

// ================= PUERTO DINÁMICO PARA RENDER =================
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log('\n=========================================');
    console.log(`✅ RECICLADORA 4R ACTIVA EN PUERTO ${PORT}`);
    console.log('=========================================\n');
});
