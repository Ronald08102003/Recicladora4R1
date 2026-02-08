const express = require('express');
const path = require('path');
const pool = require('./db'); // Supabase PostgreSQL
const nodemailer = require('nodemailer');

const app = express();

// ================= CONFIGURACIÓN =================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

let carritoTemporal = {};

// ================= EMAIL =================
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// ================= RUTAS HTML =================
const htmlFiles = [
    'Recicladora4R','login','Registro','restablecer',
    'panel','panel_usuario','carrito','mis_pedidos',
    'gestionar_pedidos','productos','usuarios',
    'reportes','gestion_ventas','finalizar_pedido','ver_detalle'
];

htmlFiles.forEach(file => {
    app.get(`/${file === 'Recicladora4R' ? '' : file.toLowerCase()}`, (req, res) => {
        res.sendFile(path.join(__dirname, `${file}.html`));
    });
});

app.get('/panel_admin', (req, res) => res.redirect('/panel'));

// ================= LOGIN =================
app.post('/api/login', async (req, res) => {
    const { usuario, clave } = req.body;

    const r = await pool.query(
        'SELECT id,nombre,usuario,clave,rol FROM usuarios WHERE usuario=$1',
        [usuario]
    );

    if (r.rows.length === 0)
        return res.json({ success:false,message:'Usuario no encontrado' });

    if (r.rows[0].clave.trim() !== clave.trim())
        return res.json({ success:false,message:'Clave incorrecta' });

    res.json({
        success:true,
        userId:r.rows[0].id,
        redirect: r.rows[0].rol === 'admin' ? '/panel' : '/panel_usuario'
    });
});

// ================= REGISTRO =================
app.post('/api/registro', async (req, res) => {
    const { nombre,correo,usuario,clave,telefono,provincia,ciudad,direccion } = req.body;

    const check = await pool.query(
        'SELECT id FROM usuarios WHERE usuario=$1 OR correo=$2',
        [usuario,correo]
    );

    if (check.rows.length > 0)
        return res.json({ success:false });

    await pool.query(`
        INSERT INTO usuarios
        (nombre,correo,usuario,clave,rol,telefono,provincia,ciudad,direccion)
        VALUES ($1,$2,$3,$4,'cliente',$5,$6,$7,$8)
    `,[nombre,correo,usuario,clave,telefono,provincia,ciudad,direccion]);

    res.json({ success:true });
});

// ================= PRODUCTOS =================

// NUEVO: Obtener todos los productos para la tabla del administrador
app.get('/api/productos', async (req, res) => {
    try {
        const r = await pool.query('SELECT * FROM productos ORDER BY id ASC');
        res.json(r.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// NUEVO: Agregar material desde el panel
app.post('/api/productos', async (req, res) => {
    const { nombre, categoria, stock, peso_kg } = req.body;
    try {
        await pool.query(
            'INSERT INTO productos (nombre, categoria, stock, peso_kg) VALUES ($1, $2, $3, $4)',
            [nombre, categoria, stock, peso_kg]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// NUEVO: Eliminar material de la tabla
app.delete('/api/productos/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM productos WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/productos-cliente', async (req, res) => {
    const r = await pool.query(
        'SELECT id,nombre,peso_kg,stock FROM productos WHERE stock>0'
    );
    res.json(r.rows);
});

// ================= OFERTAS =================
app.get('/api/ofertas', async (req, res) => {
    const r = await pool.query(`
        SELECT id,nombre,peso_kg,descuento
        FROM productos
        WHERE oferta=true AND stock>0
    `);
    res.json(r.rows);
});

// ================= CARRITO =================
app.post('/api/agregar-al-carrito', (req, res) => {
    const { id_producto, cantidad } = req.body;
    carritoTemporal[id_producto] =
        (carritoTemporal[id_producto] || 0) + Number(cantidad);
    res.json({ success:true });
});

// ================= FINALIZAR PEDIDO =================
app.post('/api/finalizar-pedido', async (req, res) => {
    const { id_usuario } = req.body;

    try {
        await pool.query('BEGIN');

        const pedido = await pool.query(`
            INSERT INTO pedidos (id_usuario,fecha,total_peso,estado)
            VALUES ($1,NOW(),0,'Pendiente') RETURNING id
        `,[id_usuario]);

        let total = 0;

        for (const id in carritoTemporal) {
            const cant = carritoTemporal[id];

            const p = await pool.query(
                'SELECT peso_kg FROM productos WHERE id=$1',[id]
            );

            const sub = p.rows[0].peso_kg * cant;
            total += sub;

            await pool.query(`
                INSERT INTO detalle_pedidos
                (id_pedido,id_producto,cantidad,peso_subtotal)
                VALUES ($1,$2,$3,$4)
            `,[pedido.rows[0].id,id,cant,sub]);

            await pool.query(
                'UPDATE productos SET stock=stock-$1 WHERE id=$2',
                [cant,id]
            );
        }

        await pool.query(
            'UPDATE pedidos SET total_peso=$1 WHERE id=$2',
            [total,pedido.rows[0].id]
        );

        await pool.query('COMMIT');
        carritoTemporal = {};
        res.json({ success:true });

    } catch (err) {
        await pool.query('ROLLBACK');
        res.json({ success:false,message:err.message });
    }
});

// ================= MIS PEDIDOS =================
app.get('/api/mis-pedidos/:id', async (req, res) => {
    const r = await pool.query(`
        SELECT id,fecha,total_peso,estado
        FROM pedidos
        WHERE id_usuario=$1
        ORDER BY fecha DESC
    `,[req.params.id]);
    res.json(r.rows);
});

// ================= ADMIN USUARIOS =================
app.get('/api/admin/usuarios', async (req, res) => {
    const r = await pool.query(`
        SELECT id,nombre,usuario,rol FROM usuarios ORDER BY id
    `);
    res.json(r.rows);
});

app.put('/api/admin/usuarios/rol', async (req, res) => {
    const { id, rol } = req.body;
    await pool.query('UPDATE usuarios SET rol=$1 WHERE id=$2',[rol,id]);
    res.json({ success:true });
});

app.delete('/api/admin/usuarios/:id', async (req, res) => {
    await pool.query('DELETE FROM usuarios WHERE id=$1',[req.params.id]);
    res.json({ success:true });
});

// ================= REPORTES =================
app.get('/api/admin/reportes', async (req, res) => {
    const pedidos = await pool.query('SELECT COUNT(*) FROM pedidos');
    const peso = await pool.query('SELECT SUM(total_peso) FROM pedidos');

    res.json({
        total_pedidos: pedidos.rows[0].count,
        peso_total: peso.rows[0].sum || 0
    });
});

// ================= LOGOUT =================
app.get('/logout', (req, res) => {
    carritoTemporal = {};
    res.redirect('/login');
});

// ================= SERVIDOR =================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log('=================================');
    console.log('✅ RECICLADORA 4R ACTIVA');
    console.log(`🚀 PUERTO: ${PORT}`);
    console.log('=================================');
});

