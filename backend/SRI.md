# Integración SRI y alcance tributario

Actualizado el 23 de octubre de 2026. Este documento sustituye las notas iniciales
que describían la firma como un esqueleto no implementado.

## Comprobantes electrónicos: ambiente de pruebas

La pestaña **SRI · Pruebas** permite cargar un XML sin firma y un certificado
PKCS12 (.p12/.pfx), firmarlo, guardarlo, enviarlo a recepción, consultar su
autorización y descargar el XML firmado o el sobre autorizado.

- Solo admite ambiente `1`. Producción no está habilitada.
- Comprueba RUC de la empresa, estructura de la clave de acceso, dígito
  verificador, serie, secuencial, tipo de emisión y fecha.
- Firma XAdES-BES 1.3.2 enveloped con RSA-SHA1/SHA1 y C14N 1.0, según el
  perfil SRI. Firma documento, SignedProperties y KeyInfo.
- Comprueba vigencia, uso de firma y correspondencia entre certificado y clave
  privada RSA (mínimo 2048 bits). Verifica criptográficamente el resultado.
- El certificado y su contraseña no se guardan ni se incluyen en auditoría.
  La firma requiere HTTPS o acceso directo local; para despliegues remotos
  debe configurarse y verificarse TLS correctamente.
- Persistencia por empresa y clave única; permiso `sri.operar` para
  ADMIN_EMPRESA, SUPER_ADMIN, CONTADOR y FACTURACION.
- `RECIBIDA` no significa `AUTORIZADO`. Los códigos 43/70 requieren consultar.
  Una pérdida de conexión deja `POR_CONFIRMAR` y bloquea el reenvío automático.
  Tras una caída del servidor, las operaciones trabadas pueden consultarse
  transcurridos dos minutos.
- Un documento rechazado puede corregirse y volver a firmarse con su clave.
  La auditoría conserva metadatos de la revisión; los nuevos eventos redactan
  XML y claves sensibles. No se reemplaza un documento autorizado.
- El historial muestra los últimos 100 documentos; la descarga requiere acceso
  a su empresa. No se almacena el certificado privado.

Los contratos SOAP públicos fueron consultados con TLS normal. Las pruebas
automatizadas de recepción/autorización usan respuestas simuladas. La prueba
real de API/BD firma con un certificado sintético y no envía documentos al SRI.
**No se ha demostrado una autorización con un certificado real del emisor.**

Faltan para una emisión completa en producción: prueba real aceptada por el SRI,
validación XSD local por tipo y versión de comprobante, editor de comprobantes,
RIDE, entrega al destinatario y operaciones de anulación. La validación local
no comprueba revocación/confianza del certificado ni elegibilidad del emisor;
el servicio de autorización SRI realizará sus controles.

## Declaraciones y retenciones

El 103 contiene renta retenida. El resumen del 104 separa IVA propio e IVA
retenido a proveedores. Solo se acumulan retenciones importadas desde su XML;
los antiguos cálculos automáticos de compras no cuentan como retenciones reales.
Los registros históricos existentes se conservan.

Son papeles de trabajo **mensuales**, sin presentación automática. Deben revisarse
derecho a crédito tributario, proporcionalidad, saldos anteriores, operaciones
especiales, intereses y multas. Una obligación semestral necesita consolidar
todo el semestre. Registrar una presentación cambia a `PRESENTADA_LOCAL` y
devuelve `enviadaAlSri: false`; no llama al SRI.

El calendario de obligaciones corrige IVA semestral por defecto para RIMPE
Emprendedor, renta en el año siguiente y ATS en el mes subsiguiente. El perfil
tributario todavía no recoge todas las condiciones; fechas referenciales no
incluyen feriados ni ampliaciones excepcionales. No sustituye las obligaciones
registradas en el RUC.

## ATS: borrador, no archivo listo para presentar

Se corrigieron tipos de identificación de clientes/proveedores, consumidor final,
proveedor en liquidaciones, agrupación de ventas y notas de crédito de venta.
Se conservan los XML importados y se extraen sus formas de pago disponibles.
Las pruebas validan la salida contra `resources/ats.xsd`.

Persisten estas limitaciones concretas:

- Sustento de compras `01` provisional y partes relacionadas pendientes de
  confirmación; no hay editor de clasificación ATS.
- Notas de crédito de compra sin vínculo al original **bloquean** la generación,
  en lugar de desaparecer del archivo.
- Retenciones emitidas/recibidas sin vinculación automática al documento de
  sustento: los importes correspondientes deben completarse en revisión.
- Bases no objeto/exentas, ICE, exportaciones, reembolsos, establecimientos,
  recap, fideicomisos y rendimientos financieros no están resueltos completamente.
- Los documentos anteriores a la migración no tienen XML original; no se
  inventan formas de pago. Los períodos semestrales no se consolidan aún.

El reporte queda `BORRADOR_REQUIERE_REVISION` y conserva sus advertencias.
La pantalla muestra validación antes de descargar. Cumplir el XSD no equivale
a cumplir todas las reglas fiscales ni a haber presentado el anexo.

## Dependencias y operación

La auditoría npm de dependencias de producción detectó avisos pendientes en
dependencias del proyecto. No se hizo una migración mayor automática de NestJS.
El aviso de node-forge GHSA-86w9-cpqp-85rv afecta a su verificación RSA PKCS#1;
esta implementación verifica XML con xml-crypto/crypto de Node, no con el
verificador RSA de forge. No se certifica la seguridad de un despliegue público;
queda pendiente actualizar y revisar el conjunto de dependencias antes de ello.

## Fuentes oficiales

- [Facturación electrónica, ficha técnica offline 2.34, julio 2026](https://www.sri.gob.ec/facturacion-electronica)
- [WSDL de recepción en pruebas](https://celcer.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline?wsdl)
- [WSDL de autorización en pruebas](https://celcer.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline?wsdl)
- [Ficha técnica ATS](https://www.sri.gob.ec/o/sri-portlet-biblioteca-alfresco-internet/descargar/72d717c2-88ed-47b7-baba-50b87b7198b7/Ficha%20Tecnica%20Transaccional%20Simplificado%20ATS.pdf)
- [Declaración de renta del ejercicio 2025](https://www.sri.gob.ec/web/intersri/declaracion-impuesto-a-la-renta-2025)
- [Impuesto al Valor Agregado](https://www.sri.gob.ec/impuesto-al-valor-agregado-iva)
- [Formularios e instructivos](https://www.sri.gob.ec/web/intersri/formularios-e-instructivos)
