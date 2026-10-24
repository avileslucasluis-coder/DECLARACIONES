// Prueba la API real con datos sintéticos y elimina solamente esos datos al terminar.
require('dotenv').config();
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const baseUrl = process.env.TEST_API_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
const email = `prueba-${randomUUID()}@example.com`;
const password = randomUUID();
let companyId;
let userId;
let accessToken;

async function request(path, body, expected = 200, token = accessToken) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(15000),
  });
  const text = await response.text();
  assert.equal(response.status, expected, `${path}: ${response.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

function factura(rucEmisor, comprador, base, iva, secuencial) {
  const clave = `1510202601${rucEmisor}1${'001001'}${String(secuencial).padStart(9, '0')}1234567811`;
  return `<factura><infoTributaria><ruc>${rucEmisor}</ruc><razonSocial>PRUEBA AUTOMATICA</razonSocial><claveAcceso>${clave}</claveAcceso></infoTributaria>
  <infoFactura><fechaEmision>15/10/2026</fechaEmision><identificacionComprador>${comprador}</identificacionComprador><razonSocialComprador>PRUEBA AUTOMATICA</razonSocialComprador>
  <importeTotal>${base + iva}</importeTotal><totalConImpuestos><totalImpuesto><codigo>2</codigo><baseImponible>${base}</baseImponible><valor>${iva}</valor></totalImpuesto></totalConImpuestos></infoFactura></factura>`;
}

async function main() {
  assert.equal((await request('/api/health')).database, 'connected');
  const registro = await request('/api/auth/register', { email, password, nombre: 'PRUEBA AUTOMATICA' }, 201);
  accessToken = registro.accessToken;
  userId = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64url')).sub;
  assert.equal((await request('/api/companies')).length, 0);
  const ruc = `${String(Date.now()).slice(-10)}001`;
  const company = await request('/api/companies', { ruc, razonSocial: 'PRUEBA AUTOMATICA', regimen: 'GENERAL' }, 201);
  companyId = company.id;
  assert.equal((await request('/api/companies'))[0].miRol, 'ADMIN_EMPRESA');

  const xmlCompra = factura('0992345678001', ruc, 100, 15, 1);
  const compra = await request('/api/vouchers/import', { companyId, xmlContent: xmlCompra }, 201);
  assert.equal(compra.voucher.direccion, 'COMPRA');
  assert.equal(compra.withholding, null);
  await request('/api/vouchers/import', { companyId, xmlContent: xmlCompra }, 400);
  await request('/api/vouchers/import', { companyId, xmlContent: factura(ruc, '0992345678001', 200, 30, 2) }, 201);
  const vouchers = await request(`/api/vouchers?companyId=${companyId}&mes=10&anio=2026`);
  assert.equal(vouchers.length, 2);
  const periodo = { companyId, mes: 10, anio: 2026 };
  const declaracion = await request('/api/declarations/generar', periodo, 201);
  assert.equal(Number(declaracion.totalComprasGravadas), 100);
  assert.equal(Number(declaracion.totalVentasGravadas), 200);
  assert.equal(declaracion.ivaAPagar104, 15);
  const obligaciones = await request(`/api/tax/obligations?companyId=${companyId}&mes=10&anio=2026`);
  assert.ok(Array.isArray(obligaciones));
  assert.equal((await request('/api/ats/validate', periodo, 201)).errores.length, 0);
  assert.ok((await request('/api/ats/generate', periodo, 201)).xml.includes('<iva>'));
  assert.equal((await request(`/api/ats/history?companyId=${companyId}`)).length, 1);
  const presentada = await request('/api/declarations/presentar', periodo, 201);
  assert.equal(presentada.estado, 'PRESENTADA_LOCAL');
  assert.equal(presentada.enviadaAlSri, false);
  assert.deepEqual(await request(`/api/sri/documents?companyId=${companyId}`), []);
  await request(`/api/sri/documents?companyId=${randomUUID()}`, undefined, 403);
  // Certificado sintético en memoria: verifica firma/API/BD sin enviar nada al SRI.
  const forge = require('node-forge');
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date(Date.now() - 86400000);
  cert.validity.notAfter = new Date(Date.now() + 86400000);
  cert.setSubject([{ name: 'commonName', value: 'SOLO PRUEBA LOCAL' }]);
  cert.setIssuer([{ name: 'commonName', value: 'SOLO PRUEBA LOCAL' }]);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const claveP12 = randomUUID();
  const p12 = Buffer.from(forge.asn1.toDer(forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], claveP12, { algorithm: '3des' })).getBytes(), 'binary');
  const baseClave = `1510202601${ruc}1001001000000003123456781`;
  let suma = 0;
  for (let i = 47, peso = 2; i >= 0; i--, peso = peso === 7 ? 2 : peso + 1) suma += Number(baseClave[i]) * peso;
  const digito = 11 - suma % 11;
  const claveSri = baseClave + (digito === 11 ? 0 : digito === 10 ? 1 : digito);
  const xmlSri = `<factura id="comprobante" version="1.1.0"><infoTributaria><ambiente>1</ambiente><tipoEmision>1</tipoEmision><ruc>${ruc}</ruc><claveAcceso>${claveSri}</claveAcceso><codDoc>01</codDoc><estab>001</estab><ptoEmi>001</ptoEmi><secuencial>000000003</secuencial></infoTributaria><infoFactura><fechaEmision>15/10/2026</fechaEmision></infoFactura></factura>`;
  const preparar = { companyId, xml: xmlSri, certificadoP12: p12.toString('base64'), clave: claveP12 };
  const firmado = await request('/api/sri/prepare', preparar, 201);
  assert.equal(firmado.estado, 'FIRMADO');
  assert.equal(firmado.xmlFirmado, undefined);
  await request('/api/sri/prepare', preparar, 409);
  await request('/api/sri/prepare', { ...preparar, xml: xmlSri.replace('<ambiente>1', '<ambiente>2') }, 400);
  const detalleSri = await request(`/api/sri/documents/${firmado.id}?companyId=${companyId}`);
  assert.ok(detalleSri.xmlFirmado.includes('SignedProperties'));
  assert.equal(detalleSri.xmlAutorizado, null);
  assert.equal((await request(`/api/sri/documents?companyId=${companyId}`)).length, 1);
  p12.fill(0);
  await request(`/api/vouchers?companyId=${randomUUID()}`, undefined, 403);
  await request('/api/companies', undefined, 401, null);
  const login = await request('/api/auth/login', { email, password }, 201);
  const refresh = await request('/api/auth/refresh', { refreshToken: login.refreshToken }, 201);
  await request('/api/auth/refresh', { refreshToken: login.refreshToken }, 401);
  await request('/api/auth/logout', { refreshToken: refresh.refreshToken }, 201);
  await request('/api/auth/refresh', { refreshToken: refresh.refreshToken }, 401);
  console.log('OK: salud, autenticacion, empresas, XML, declaracion, obligaciones, ATS, firma XAdES sintetica con persistencia, bloqueo de produccion/duplicados, permisos, refresh y logout. No se enviaron documentos al SRI.');
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(async () => {
  try {
    // El correo único identifica la cuenta de esta ejecución aun si falló la respuesta HTTP.
    const user = userId ? { id: userId } : await prisma.user.findUnique({ where: { email } });
    if (user) {
      const empresas = await prisma.company.findMany({ where: { companyUsers: { some: { userId: user.id } } } });
      const ids = empresas.map((empresa) => empresa.id);
      await prisma.auditLog.deleteMany({ where: { OR: [{ userId: user.id }, { companyId: { in: ids } }] } });
      await prisma.company.deleteMany({ where: { id: { in: ids } } });
      await prisma.user.delete({ where: { id: user.id } });
    }
    console.log('Datos sinteticos de la prueba eliminados.');
  } finally { await prisma.$disconnect(); }
});
