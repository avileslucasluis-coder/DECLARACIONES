# Publicación y paso a producción

Para el destino elegido (Vercel), seguir [VERCEL.md](VERCEL.md). Esa guía
incluye los controles y variables nuevos; el ejemplo de VPS de abajo requiere
adaptar la confianza del proxy antes de usarlo con NODE_ENV=production.

Estado al 23 de octubre de 2026: el sistema funciona localmente. Publicar la
aplicación en Internet y emitir comprobantes válidos en el SRI son dos pasos
distintos. La integración actual bloquea el ambiente de producción del SRI.

## 1. Preparar el sistema antes de abrirlo al público

- Resolver los avisos de dependencias registrados en backend/SRI.md.
- Revisar registro de usuarios, permisos, límites de intentos de acceso,
  recuperación de cuentas y exposición de /docs.
- Tener copia de PostgreSQL y comprobar su restauración antes de migrar.
- Definir dominio y servidor con Node.js compatible con el proyecto y
  PostgreSQL. No basta un alojamiento que solo sirva archivos HTML/PHP.
- Usar contraseñas nuevas y un JWT_SECRET aleatorio. No subir el .env local,
  certificados .p12 ni sus contraseñas al repositorio.

## 2. Compilar y trasladar la aplicación

Desde sistema_tributario_rimpe:

```sh
flutter pub get
flutter build web --release --dart-define=API_BASE_URL=
```

Copiar el contenido de build/web a backend/public. La API y la web se sirven
desde el mismo dominio. Trasladar backend con sus fuentes, prisma, resources,
public, package.json y package-lock.json; excluir .env y node_modules.

En el servidor, dentro de backend, configurar las variables mediante su gestor
de secretos o un .env protegido:

```dotenv
NODE_ENV=production
DATABASE_URL=postgresql://USUARIO:CLAVE@HOST:5432/BASE?schema=public
JWT_SECRET=REEMPLAZAR_POR_SECRETO_ALEATORIO
PORT=3000
CORS_ORIGIN=https://tributario.tudominio.com
```

Usar la configuración TLS de PostgreSQL indicada por el proveedor. Generar el
secreto en el servidor y guardarlo, sin compartirlo por chat:

```sh
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
npm ci
npm run prisma:generate
npm run build
npm run db:deploy
npm run seed
npm run start:prod
```

No ejecutar migrate reset ni usar migrate dev sobre la base de producción.
Configurar el proceso como servicio con reinicio automático; una terminal
abierta no constituye un despliegue permanente.

## 3. Dominio y HTTPS

Apuntar el DNS del dominio al servidor. Un ejemplo de Caddy en el mismo host:

```caddyfile
tributario.tudominio.com {
    reverse_proxy 127.0.0.1:3000
}
```

Caddy gestiona HTTPS automáticamente para dominios configurados correctamente.
Permitir 80/443 para la web; bloquear el acceso externo directo a 3000 y 5432.
El controlador de firma actual permite el salto local desde ese proxy: por eso
es indispensable que el único acceso externo sea HTTPS. Si el proxy corre en
otro host o contenedor, hay que adaptar y probar la confianza del proxy y el
control de HTTPS; no desactivar la validación para hacerlo funcionar.

Verificar /api/health, inicio de sesión, permisos entre empresas, importaciones,
descargas y firma desde HTTPS. Programar copias de seguridad y supervisión.
No ejecutar la prueba smoke sobre datos de clientes: usar una instancia de
preproducción y una base independiente.

## 4. Habilitar emisión real ante el SRI

1. Confirmar la habilitación del emisor en SRI en línea y disponer de certificado
   vigente del emisor. No enviar su contraseña por chat.
2. Obtener una autorización real en ambiente de pruebas con ese certificado y
   comprobar XML, firma y respuesta. Hoy solo se ha probado la firma sintética
   y una consulta real con clave inválida.
3. Completar los pendientes de backend/SRI.md: validaciones, RIDE, entrega y
   demás funciones necesarias para el alcance de emisión contratado.
4. Implementar una selección controlada de ambiente y endpoints oficiales,
   incluyendo ambiente 2 en XML/clave de acceso y separación de registros.
   Actualmente el código solo admite ambiente 1; NODE_ENV=production no cambia
   esto. No basta con reemplazar una URL.
5. Probar de extremo a extremo, habilitar el paso de forma controlada y revisar
   el primer comprobante autorizado. El ATS mantiene pendientes independientes
   y no debe presentarse automáticamente como si estuviera completo.

## Referencias

- https://caddyserver.com/docs/automatic-https
- https://caddyserver.com/docs/quick-starts/reverse-proxy
- https://www.sri.gob.ec/facturacion-electronica
- [Alcance y pendientes](backend/SRI.md)

Esta guía prepara el despliegue; no se ha contratado hosting, configurado DNS
ni publicado el sistema en un servidor externo.
