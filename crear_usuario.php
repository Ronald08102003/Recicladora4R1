<?php
$host = "localhost";
$dbname = "recicladora"; // 👈 EXACTO como phpMyAdmin
$user = "root";
$pass = "";

$pdo = new PDO(
    "mysql:host=$host;dbname=$dbname;charset=utf8",
    $user,
    $pass,
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
);

$usuario = "ronald";
$nombre  = "Ronald Valdivieso";
$clave   = password_hash("1234", PASSWORD_DEFAULT);

$sql = "INSERT INTO usuarios (nombre, usuario, clave)
        VALUES (:nombre, :usuario, :clave)";

$stmt = $pdo->prepare($sql);
$stmt->execute([
    ":nombre" => $nombre,
    ":usuario" => $usuario,
    ":clave" => $clave
]);

echo "Usuario creado correctamente";
