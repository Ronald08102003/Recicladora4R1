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
let codigosVerificacion = {}; // Almacena códigos temporalmente

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

// Ruta específica para solucionar el error de la captura
app.get('/olvide_password', (req, res) => {
    res.sendFile(path.join(__dirname, 'restablecer.html'));
});

app.get('/panel_admin', (req, res) => res.redirect('/panel'));

// ================= RESTABLECIMIENTO DE CONTRASEÑA (ACTUALIZADO CON DISEÑO) =================
app.post('/api/enviar-codigo', async (req, res) => {
    const { correo } = req.body;
    try {
        // Obtenemos los datos completos del usuario para el correo personalizado
        const r = await pool.query('SELECT nombre, usuario, clave FROM usuarios WHERE correo = $1', [correo]);
        
        if (r.rows.length === 0) {
            return res.json({ success: false, message: 'Este correo no pertenece a ningún usuario registrado.' });
        }

        const { nombre, usuario, clave } = r.rows[0];

        // Enviamos el correo con formato profesional
        await transporter.sendMail({
            from: `"Recicladora 4R ♻️" <${process.env.EMAIL_USER}>`,
            to: correo,
            subject: 'Recuperación de Acceso - Recicladora 4R',
            html: `
                <div style="max-width: 600px; margin: auto; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; border: 1px solid #e0e0e0; border-radius: 15px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.1);">
                    <div style="background-color: #2e7d32; padding: 20px; text-align: center;">
                        <h1 style="color: white; margin: 0; font-size: 24px;">Recicladora 4R</h1>
                        <p style="color: #e8f5e9; margin: 5px 0 0 0;">Gestión de Residuos Sólidos</p>
                    </div>
                    <div style="padding: 30px; background-color: #ffffff;">
                        <h2 style="color: #1b5e20;">Hola, ${nombre}</h2>
                        <p style="color: #555; line-height: 1.6;">Has solicitado recuperar tus credenciales de acceso al sistema. Aquí tienes los detalles de tu cuenta:</p>
                        
                        <div style="background-color: #f9f9f9; padding: 20px; border-left: 5px solid #2e7d32; margin: 20px 0;">
                            <p style="margin: 5px 0;"><strong>Usuario:</strong> <span style="color: #2e7d32;">${usuario}</span></p>
                            <p style="margin: 5px 0;"><strong>Contraseña actual:</strong> <span style="color: #2e7d32;">${clave.trim()}</span></p>
                        </div>

                        <p style="color: #555; line-height: 1.6;">Te recomendamos ingresar al sistema y, si lo deseas, cambiar tu contraseña desde tu panel de perfil para mayor seguridad.</p>
                        
                        <div style="text-align: center; margin-top: 30px;">
                            <a href="https://recicladora4r.onrender.com/login" style="background-color: #2e7d32; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Ir al Sistema</a>
                        </div>
                    </div>
                    <div style="background-color: #f1f1f1; padding: 15px; text-align: center; font-size: 12px; color: #888;">
                        <p style="margin: 0;">© 2026 Recicladora 4R - UNACH. Todos los derechos reservados.</p>
                        <p style="margin: 5px 0 0 0;">Riobamba, Ecuador</p>
                    </div>
                </div>
            `
        });
        
        res.json({ success: true, message: 'Tus credenciales han sido enviadas con éxito.' });
    } catch (err) { 
        console.error("Error al enviar correo:", err);
        res.status(500).json({ success: false, message: 'No pudimos procesar el envío en este momento.' }); 
    }
});

app.post('/api/restablecer-final', async (req, res) => {
    const { correo, codigo, nuevaClave } = req.body;
    if (codigosVerificacion[correo] && codigosVerificacion[correo] == codigo) {
        try {
            await pool.query('UPDATE usuarios SET clave = $1 WHERE correo = $2', [nuevaClave.trim(), correo]);
            delete codigosVerificacion[correo];
            res.json({ success: true });
        } catch (err) { res.status(500).json({ success: false }); }
    } else {
        res.json({ success: false, message: 'Código incorrecto o expirado' });
    }
});

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

// ================= PRODUCTOS / INVENTARIO =================
app.get('/api/admin/productos', async (req, res) => {
    try {
        const r = await pool.query('SELECT * FROM productos ORDER BY id ASC');
        res.json(r.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/productos', async (req, res) => {
    try {
        const r = await pool.query('SELECT * FROM productos ORDER BY id ASC');
        res.json(r.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

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

// ================= GESTIÓN DE PEDIDOS (ADMIN) =================
app.get('/api/admin/pedidos', async (req, res) => {
    try {
        const r = await pool.query(`
            SELECT p.id, u.nombre as cliente, p.fecha, p.total_peso, p.estado 
            FROM pedidos p 
            JOIN usuarios u ON p.id_usuario = u.id 
            ORDER BY p.fecha DESC
        `);
        res.json(r.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/admin/pedidos/estado', async (req, res) => {
    const { id, estado } = req.body;
    try {
        await pool.query('UPDATE pedidos SET estado=$1 WHERE id=$2', [estado, id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ================= OFERTAS Y PROPUESTAS DE VENTA =================
app.put('/api/admin/productos/oferta', async (req, res) => {
    const { id, oferta } = req.body;
    try {
        await pool.query('UPDATE productos SET oferta=$1 WHERE id=$2', [oferta, id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

app.get('/api/admin/ventas-propuestas', async (req, res) => {
    try {
        const r = await pool.query(`
            SELECT p.fecha, u.nombre as cliente, u.ciudad as ubicacion, 
            pr.nombre as material, p.total_peso as peso_est, p.estado 
            FROM pedidos p
            JOIN usuarios u ON p.id_usuario = u.id
            JOIN detalle_pedidos dp ON dp.id_pedido = p.id
            JOIN productos pr ON dp.id_producto = pr.id
            ORDER BY p.fecha DESC
        `);
        res.json(r.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/admin/propuestas-venta', async (req, res) => {
    try {
        const r = await pool.query(`
            SELECT p.id, p.fecha, u.nombre as cliente, u.ciudad, u.provincia, u.direccion, u.telefono,
                   pr.nombre, pr.categoria, p.total_peso as peso_kg, 
                   (p.total_peso * 0.12) as precio_estimado, p.estado
            FROM pedidos p
            JOIN usuarios u ON p.id_usuario = u.id
            JOIN detalle_pedidos dp ON dp.id_pedido = p.id
            JOIN productos pr ON dp.id_producto = pr.id
            ORDER BY p.fecha DESC
        `);
        res.json(r.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/admin/propuesta-detalle/:id', async (req, res) => {
    try {
        const r = await pool.query(`
            SELECT p.id, u.nombre as cliente, u.telefono, u.correo, u.provincia, u.ciudad, u.direccion,
                   pr.categoria, pr.nombre, p.total_peso as peso_kg, (p.total_peso * 0.12) as precio_estimado
            FROM pedidos p
            JOIN usuarios u ON p.id_usuario = u.id
            JOIN detalle_pedidos dp ON dp.id_pedido = p.id
            JOIN productos pr ON dp.id_producto = pr.id
            WHERE p.id = $1
        `, [req.params.id]);
        res.json(r.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/admin/propuestas-venta/estado', async (req, res) => {
    const { id, estado } = req.body;
    try {
        await pool.query('UPDATE pedidos SET estado=$1 WHERE id=$2', [estado, id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

app.post('/api/vender-producto', async (req, res) => {
    const { categoria, nombre, peso, id_usuario } = req.body;
    try {
        await pool.query('INSERT INTO pedidos (id_usuario, fecha, total_peso, estado) VALUES ($1, NOW(), $2, \'Pendiente\')', [id_usuario, peso]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

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

app.get('/api/ver-carrito', async (req, res) => {
    let items = [];
    for (const id in carritoTemporal) {
        const r = await pool.query('SELECT id, nombre, peso_kg FROM productos WHERE id=$1', [id]);
        if(r.rows.length > 0) {
            items.push({
                nombre: r.rows[0].nombre,
                cantidad: carritoTemporal[id],
                peso_kg: r.rows[0].peso_kg,
                subtotal: r.rows[0].peso_kg * carritoTemporal[id]
            });
        }
    }
    res.json({ items });
});

app.post('/api/vaciar-carrito', (req, res) => {
    carritoTemporal = {};
    res.json({ success: true });
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
            const p = await pool.query('SELECT peso_kg FROM productos WHERE id=$1',[id]);
            const sub = p.rows[0].peso_kg * cant;
            total += sub;
            await pool.query(`
                INSERT INTO detalle_pedidos
                (id_pedido,id_producto,cantidad,peso_subtotal)
                VALUES ($1,$2,$3,$4)
            `,[pedido.rows[0].id,id,cant,sub]);
            await pool.query('UPDATE productos SET stock=stock-$1 WHERE id=$2',[cant,id]);
        }
        await pool.query('UPDATE pedidos SET total_peso=$1 WHERE id=$2',[total,pedido.rows[0].id]);
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

app.get('/api/usuario/mis-pedidos/:id', async (req, res) => {
    const r = await pool.query('SELECT id,fecha,total_peso,estado FROM pedidos WHERE id_usuario=$1 ORDER BY fecha DESC',[req.params.id]);
    res.json(r.rows);
});

// ================= ADMIN USUARIOS =================
app.get('/api/admin/usuarios', async (req, res) => {
    const r = await pool.query(`SELECT id,nombre,usuario,rol FROM usuarios ORDER BY id`);
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
app.get('/api/reportes', async (req, res) => {
    try {
        const materiales = await pool.query('SELECT COUNT(*) FROM productos');
        const unidades = await pool.query('SELECT SUM(stock) FROM productos');
        const peso = await pool.query('SELECT SUM(total_peso) FROM pedidos');
        const auditoria = await pool.query(`
            SELECT nombre as material, stock as stock_actual, peso_kg as peso_unitario, 
            CASE WHEN stock > 10 THEN 'Suficiente' ELSE 'Bajo' END as estado_stock FROM productos
        `);
        const stockData = await pool.query('SELECT nombre, stock FROM productos');
        res.json({
            total_materiales: materiales.rows[0].count,
            unidades_recibidas: unidades.rows[0].sum || 0,
            peso_total: peso.rows[0].sum || 0,
            inventario_auditoria: auditoria.rows,
            grafica_stock: stockData.rows
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/reportes', async (req, res) => {
    try {
        const pedidos = await pool.query('SELECT COUNT(*) FROM pedidos');
        const peso = await pool.query('SELECT SUM(total_peso) FROM pedidos');
        const clientes = await pool.query("SELECT COUNT(*) FROM usuarios WHERE rol='cliente'");
        const porMes = await pool.query(`SELECT TO_CHAR(fecha, 'Month') as mes, SUM(total_peso) as peso FROM pedidos GROUP BY mes, EXTRACT(MONTH FROM fecha) ORDER BY EXTRACT(MONTH FROM fecha)`);
        res.json({ total_pedidos: pedidos.rows[0].count, peso_total: peso.rows[0].sum || 0, total_clientes: clientes.rows[0].count, datos_mensuales: porMes.rows });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/reportes-detallados', async (req, res) => {
    try {
        const pCount = await pool.query('SELECT COUNT(*) FROM productos');
        const vCount = await pool.query('SELECT SUM(cantidad) FROM detalle_pedidos');
        const pesoSum = await pool.query('SELECT SUM(total_peso) FROM pedidos');
        const lista = await pool.query('SELECT nombre, stock, peso_kg FROM productos ORDER BY stock ASC');
        res.json({
            resumen: { totalProductos: pCount.rows[0].count, totalVentas: vCount.rows[0].sum || 0, totalPeso: pesoSum.rows[0].sum || 0 },
            listaProductos: lista.rows,
            grafica: { nombres: lista.rows.map(p => p.nombre), stocks: lista.rows.map(p => p.stock) }
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ================= NUEVO: DETALLE DE PEDIDO (FACTURA) =================
app.get('/api/pedidos/detalle/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const pQuery = await pool.query(`
            SELECT p.id, p.fecha, p.total_peso, p.estado,
                   u.nombre, u.correo, u.telefono, u.provincia, u.ciudad, u.direccion
            FROM pedidos p
            JOIN usuarios u ON p.id_usuario = u.id
            WHERE p.id = $1
        `, [id]);

        if (pQuery.rows.length === 0) 
            return res.status(404).json({ success: false });

        const dQuery = await pool.query(`
            SELECT pr.nombre as material, dp.cantidad, dp.peso_subtotal
            FROM detalle_pedidos dp
            JOIN productos pr ON dp.id_producto = pr.id
            WHERE dp.id_pedido = $1
        `, [id]);

        res.json({
            success: true,
            pedido: pQuery.rows[0],
            detalles: dQuery.rows
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ================= LOGOUT Y SERVIDOR =================
app.get('/logout', (req, res) => {
    carritoTemporal = {};
    res.redirect('/login');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log('✅ RECICLADORA 4R ACTIVA EN PUERTO: ' + PORT);
});
