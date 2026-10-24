# Verificación del 23 de octubre de 2026

## Seguridad y preparación Vercel

- Backend: 51 pruebas aprobadas; las 7 de seguridad se repitieron tras exigir
  validación estricta del certificado PostgreSQL. Compilación correcta.
- Flutter: 9 pruebas aprobadas. Sesiones web cambiadas a memoria y registro
  con contraseña de mínimo 12 caracteres.
- Migración security_rate_limits aplicada sin borrar los datos de negocio.
- Smoke real contra API/BD aprobado con los controles nuevos; datos temporales
  eliminados. Encabezados CSP, no-sniff, no-store y request ID comprobados por HTTP.
- Configuración Vercel y guía VERCEL.md añadidas. No hay despliegue externo,
  dominio HTTPS, base remota ni firewall de proveedor activados todavía.
- Auditoría npm mantiene avisos pendientes; no se declara seguridad completa,
  cifrado total ni aptitud para exposición pública. Se actualizaron dependencias
  compatibles sin forzar migraciones mayores.

## Actualización final

- Backend: compilación correcta y **44 pruebas aprobadas** en 7 suites.
- Flutter: compilación web release correcta y **9 pruebas aprobadas**, incluidas
  navegación móvil/escritorio y estados del módulo SRI. Análisis previo a los
  últimos ajustes visuales: sin errores ni advertencias, 16 avisos informativos.
- Migración de documentos electrónicos aplicada y permisos SRI cargados,
  conservando los datos existentes.
- API final iniciada en http://localhost:3000 y pantalla de acceso verificada
  visualmente en el navegador.
- `npm run test:smoke` aprobado contra la API final y PostgreSQL: autenticación,
  empresas, importación XML, declaración, obligaciones, ATS, firma XAdES con
  certificado sintético, persistencia, bloqueo de producción y duplicados,
  permisos y sesiones. Datos sintéticos eliminados al finalizar.
- Consulta real al servicio de autorización del SRI de pruebas con una clave
  sintética de 49 ceros: respuesta RECHAZADA, código 80, procesada correctamente.
  Esta comprobación verifica conectividad y lectura de rechazos; no demuestra
  aceptación de un comprobante firmado. No se enviaron comprobantes al SRI.
- La firma se verificó localmente con certificado sintético, tres referencias
  XML y comprobación independiente de canonicalización/firma.

**Límites:** falta probar la autorización con un certificado real del emisor.
El módulo opera únicamente en ambiente de pruebas; el ATS sigue siendo un
borrador con funcionalidades pendientes. No se certifica cumplimiento integral
ni preparación para producción. Alcance y pendientes detallados en
[backend/SRI.md](backend/SRI.md).

## Registro anterior: 20 de octubre de 2026

- Backend: `npm run build` genera `dist/main.js` y la API inicia correctamente.
- Backend: `npm test -- --runInBand` — **19 pruebas aprobadas**.
- Flutter: `flutter test` — **7 pruebas aprobadas**, incluyendo navegación en
  390 y 1366 píxeles, todas las pestañas y el estado sin empresas.
- Flutter: `flutter analyze --no-fatal-infos` — sin errores ni advertencias;
  conserva 17 avisos informativos por APIs de Flutter deprecadas.
- Flutter: `flutter build web --release` — compilación web correcta.
- PostgreSQL: contenedor `backend-db-1` saludable, migraciones aplicadas,
  roles y permisos cargados. Se conservaron los registros existentes.
- `iniciar.ps1 -SinCompilar`: arranque completo comprobado.
- `npm run test:smoke`: prueba contra PostgreSQL y la API real de salud,
  registro, login, empresa, importación de compra y venta, duplicados,
  retenciones, declaración, obligaciones, validación y generación de ATS,
  historial, aislamiento entre empresas, rotación de sesión y logout.
  Los datos sintéticos se eliminaron al finalizar.
- Navegador: pantalla de acceso visible en `http://localhost:3000`.

La validación XSD usa el archivo ya incluido en el proyecto. Estas pruebas
comprueban el funcionamiento del software; no certifican los catálogos ni
las reglas tributarias vigentes. Continúan las limitaciones documentadas del
ATS, la firma electrónica y el envío al SRI.

Para recuperar el arranque de Docker se conservaron sus carpetas temporales
anteriores como `run.codex-backup-20261020` y
`docker-secrets-engine.codex-backup-20261020`, junto a sus ubicaciones originales
en el perfil local. No se restableció Docker ni se borraron volúmenes.
