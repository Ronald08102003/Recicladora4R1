-- 1. CREACIÓN DE LA BASE DE DATOS
IF NOT EXISTS (SELECT * FROM sys.databases WHERE name = 'recicladora')
BEGIN
    CREATE DATABASE recicladora;
END
GO

USE recicladora;
GO

-- --------------------------------------------------------
-- 2. CREACIÓN DE TABLAS (Traducidas de MariaDB a SQL Server)
-- --------------------------------------------------------

-- Tabla de Usuarios
CREATE TABLE usuarios (
    id INT IDENTITY(1,1) PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    correo VARCHAR(100) UNIQUE,
    usuario VARCHAR(50) UNIQUE NOT NULL,
    clave VARCHAR(255) NOT NULL,
    fecha_registro DATETIME DEFAULT GETDATE(),
    rol VARCHAR(20) DEFAULT 'usuario'
);

-- Tabla de Productos
CREATE TABLE productos (
    id INT IDENTITY(1,1) PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    categoria VARCHAR(50) NULL,
    stock INT NOT NULL,
    fecha_registro DATETIME DEFAULT GETDATE(),
    peso_kg DECIMAL(10,2) DEFAULT 0.00,
    -- REGLA DEL TALLER: El stock no puede ser menor o igual a 15
    CONSTRAINT CHK_StockMinimo CHECK (stock > 15)
);

-- Tabla de Pedidos
CREATE TABLE pedidos (
    id INT IDENTITY(1,1) PRIMARY KEY,
    id_usuario INT NOT NULL,
    fecha DATETIME DEFAULT GETDATE(),
    total_peso DECIMAL(10,2) NULL,
    estado VARCHAR(20) DEFAULT 'Pendiente',
    CONSTRAINT FK_Usuario_Pedido FOREIGN KEY (id_usuario) REFERENCES usuarios(id)
);

-- Tabla Detalle de Pedidos
CREATE TABLE detalle_pedidos (
    id INT IDENTITY(1,1) PRIMARY KEY,
    id_pedido INT NOT NULL,
    id_producto INT NOT NULL,
    cantidad INT NULL,
    peso_subtotal DECIMAL(10,2) NULL,
    CONSTRAINT FK_Pedido_Detalle FOREIGN KEY (id_pedido) REFERENCES pedidos(id),
    CONSTRAINT FK_Producto_Detalle FOREIGN KEY (id_producto) REFERENCES productos(id)
);

GO

-- --------------------------------------------------------
-- 3. VOLCADO DE DATOS (Los datos que tenías en tu archivo)
-- --------------------------------------------------------

-- Insertar Usuarios (Se usa la clave encriptada que ya tenías)
INSERT INTO usuarios (nombre, correo, usuario, clave, rol) VALUES 
('Ronald Valdivieso', '', 'ronald', '$2y$10$Ndm0N48rpOj1CA..UpaEPuGgv5/NXduLuRTT01ME6OCM/D/s.oJHS', 'admin'),
('ismael', 'ronaldvaldiviesoface@gmail.com', 'ismael', '$2y$10$jJmMqLgaTxED0seucYPOi.JwRq9jRPoo6cHB6XNBqI.JHHqNfVQYy', 'usuario');

-- Insertar Productos
INSERT INTO productos (nombre, categoria, stock, peso_kg) VALUES 
('botella', 'plastico', 797, 200.00);

-- Insertar Pedidos previos
SET IDENTITY_INSERT pedidos ON; -- Permitir insertar IDs manuales para mantener historial
INSERT INTO pedidos (id, id_usuario, fecha, total_peso, estado) VALUES 
(1, 11, '2025-12-23 14:36:41', 200.00, 'Completado'),
(2, 11, '2025-12-23 14:39:37', 200.00, 'Cancelado'),
(3, 11, '2025-12-29 10:13:31', 20000.00, 'Pendiente');
SET IDENTITY_INSERT pedidos OFF;

GO

-- --------------------------------------------------------
-- 4. PROCEDIMIENTO ALMACENADO (Lógica del Taller)
-- --------------------------------------------------------

CREATE PROCEDURE sp_RegistrarPedidoReciclaje
    @idUsuario INT,
    @idProducto INT,
    @cantidad INT
AS
BEGIN
    -- Iniciamos el bloque de protección
    BEGIN TRY
        BEGIN TRANSACTION;

        -- 1. Insertar el encabezado del pedido
        DECLARE @NuevoPedidoID INT;
        INSERT INTO pedidos (id_usuario, estado, fecha) 
        VALUES (@idUsuario, 'Pendiente', GETDATE());
        
        SET @NuevoPedidoID = SCOPE_IDENTITY(); -- Obtiene el ID generado

        -- 2. Insertar el detalle del pedido
        INSERT INTO detalle_pedidos (id_pedido, id_producto, cantidad)
        VALUES (@NuevoPedidoID, @idProducto, @cantidad);

        -- 3. Actualizar el stock del producto
        -- Si esta resta deja el stock en 15 o menos, el CHECK CHK_StockMinimo 
        -- cancelará la operación automáticamente y saltará al CATCH.
        UPDATE productos 
        SET stock = stock - @cantidad 
        WHERE id = @idProducto;

        -- Si llegamos aquí, todo está bien
        COMMIT TRANSACTION;
        PRINT 'Transacción completada: Pedido registrado y stock actualizado.';

    END TRY
    BEGIN CATCH
        -- Si hubo error (ej: stock bajo), deshacemos todo
        IF @@TRANCOUNT > 0
        BEGIN
            ROLLBACK TRANSACTION;
        END

        -- Capturamos el error para enviarlo a Node.js
        DECLARE @MensajeError NVARCHAR(4000) = ERROR_MESSAGE();
        RAISERROR(@MensajeError, 16, 1);
    END CATCH
END;
GO


-- Ver productos (deberías ver 797 botellas)
SELECT * FROM productos;

-- Ver usuarios (deberías ver a Ronald e Ismael)
SELECT * FROM usuarios;