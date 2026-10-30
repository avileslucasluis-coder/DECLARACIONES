import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { create } from 'xmlbuilder2';
import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { metadataAts, tipoIdentificacionAts } from './ats-metadata';

export interface ErrorValidacionAts {
  campo: string;
  mensaje: string;
}

/// Generador de borradores mensuales ATS: compras y ventas locales.
/// Conserva advertencias de datos pendientes; no presenta archivos al SRI.
/// NC de compra bloquean la generación hasta vincular el documento original.
/// NC de venta se incluyen en registros positivos independientes.
@Injectable()
export class AtsService {
  private readonly VERSION_CATALOGO_ASUMIDA = 'Ficha Técnica ATS — revisión parcial 22/10/2026';
  private readonly VERSION_XSD_ASUMIDA = 'ats.xsd — descargas.sri.gob.ec/download/anexos/ats/ats.xsd (verificado)';

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async obtenerDetalle(companyId: string, mes: number, anio: number) {
    const desde = new Date(anio, mes - 1, 1);
    const hasta = new Date(anio, mes, 1);
    const vouchers = await this.prisma.voucher.findMany({
      where: { companyId, fechaEmision: { gte: desde, lt: hasta } },
      include: { withholding: true },
      orderBy: { fechaEmision: 'asc' },
    });
    return vouchers;
  }

  /// Validaciones de negocio y de formato que SÍ podemos verificar sin el
  /// XSD oficial (campos vacíos, longitud de RUC, fechas dentro del
  /// periodo, montos negativos inesperados). No sustituye una validación
  /// XSD real.
  async validar(companyId: string, mes: number, anio: number): Promise<{
    errores: ErrorValidacionAts[];
    advertencias: ErrorValidacionAts[];
  }> {
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Empresa no encontrada.');

    const vouchers = await this.obtenerDetalle(companyId, mes, anio);
    const errores: ErrorValidacionAts[] = [];
    const advertencias: ErrorValidacionAts[] = [];
    advertencias.push({ campo: 'alcance', mensaje: 'Borrador mensual para revisión: no presenta el ATS ante el SRI. Revisa sustento tributario, partes relacionadas, retenciones y operaciones especiales. El cumplimiento del XSD no valida estas condiciones.' });
    if (vouchers.some((v) => v.direccion === 'COMPRA')) advertencias.push({ campo: 'codSustento', mensaje: 'Las compras usan sustento 01 provisional. Debe sustituirse por el sustento real antes de presentar el archivo.' });

    if (!/^\d{10}001$/.test(company.ruc)) {
      errores.push({
        campo: 'company.ruc',
        mensaje: 'El RUC del informante debe terminar en "001" según el XSD oficial (numeroRucType).',
      });
    }

    if (vouchers.length === 0) {
      advertencias.push({ campo: 'periodo', mensaje: 'No hay comprobantes registrados en este periodo.' });
    }

    const notasCreditoCompra = vouchers.filter((v: (typeof vouchers)[number]) => v.direccion === 'COMPRA' && v.tipoComprobante === 'NOTA_CREDITO');
    if (notasCreditoCompra.length > 0) {
      errores.push({
        campo: 'notasCreditoCompra',
        mensaje:
          `Hay ${notasCreditoCompra.length} nota(s) de crédito de compra pendientes de vincular al comprobante original. ` +
          'Se bloquea la generación para evitar omitirlas silenciosamente; este flujo requiere completar docModificado y su autorización.',
      });
    }

    const retencionesRecibidas = vouchers.filter((v: (typeof vouchers)[number]) => v.direccion === 'RETENCION_RECIBIDA');
    if (retencionesRecibidas.length > 0) {
      advertencias.push({
        campo: 'retencionesRecibidas',
        mensaje:
          `Hay ${retencionesRecibidas.length} comprobante(s) de retención que te aplicaron un cliente, pero el ` +
          'generador todavía NO los enlaza automáticamente al <detalleVentas> correspondiente (valorRetIva/' +
          'valorRetRenta quedan en 0.00). Deben completarse manualmente en el XML antes de presentarlo.',
      });
    }

    for (const v of vouchers) {
      const contraparte = v.direccion === 'VENTA' || v.tipoComprobante === 'LIQUIDACION' ? v.identificacionContraparte : v.rucEmisor;
      if (!contraparte || (contraparte.length !== 13 && contraparte.length !== 10 && contraparte.length < 3)) {
        errores.push({
          campo: `voucher:${v.id}`,
          mensaje: `Identificación de contraparte con formato inválido: "${contraparte}".`,
        });
      }
      if (v.claveAcceso.length !== 49) {
        advertencias.push({
          campo: `voucher:${v.id}`,
          mensaje: `Clave de acceso con longitud distinta a 49 caracteres (tiene ${v.claveAcceso.length}) — revisar autorización manualmente.`,
        });
      }
      if (v.direccion === 'NO_RELACIONADO') {
        advertencias.push({
          campo: `voucher:${v.id}`,
          mensaje: 'Comprobante sin relación clara con el RUC del contribuyente — revisar antes de incluir en el ATS.',
        });
      }
      if ((v.direccion === 'VENTA' || v.direccion === 'COMPRA') && metadataAts(v.xmlOriginal).pagos.length === 0 && v.tipoComprobante !== 'NOTA_CREDITO') {
        advertencias.push({ campo: `voucher:${v.id}:formasPago`, mensaje: 'No consta forma de pago en el XML conservado. Revisa y completa este dato antes de presentar el ATS.' });
      }
      if (v.direccion === 'RETENCION_EMITIDA' || v.withholding) {
        advertencias.push({ campo: `voucher:${v.id}:retenciones`, mensaje: 'Las retenciones requieren vinculación con su documento de sustento. No se exportan cálculos sugeridos como retenciones efectivamente emitidas.' });
      }
      const baseIva0 = Number(v.baseImponibleIva0);
      const baseGrav = Number(v.baseImponibleIva);
      if ((v.direccion === 'COMPRA' || v.direccion === 'VENTA') && baseIva0 === 0 && baseGrav === 0) {
        errores.push({
          campo: `voucher:${v.id}`,
          mensaje:
            'Según la ficha técnica, al menos una de las bases (no objeto de IVA, tarifa 0% o gravada) debe ser mayor a 0.00.',
        });
      }
    }

    return { errores, advertencias };
  }

  /// Genera el XML siguiendo el orden y nombres de campo verificados
  /// contra el XSD y la ficha técnica oficiales, para las secciones
  /// <compras> y <ventas> (las únicas que nuestro modelo de datos soporta
  /// hoy — exportaciones, recaps, fideicomisos y rendimientos financieros
  /// no se generan porque no tenemos esos datos).
  async generarXml(companyId: string, mes: number, anio: number, userId: string) {
    const { errores, advertencias } = await this.validar(companyId, mes, anio);
    if (errores.length > 0) {
      throw new BadRequestException(
        `No se puede generar el XML: hay ${errores.length} error(es) de validación pendientes. Corrígelos primero.`,
      );
    }

    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    const establecimientos = await this.prisma.establishment.count({ where: { companyId } });
    const vouchers = await this.obtenerDetalle(companyId, mes, anio);

    // validar() bloquea NC de compra sin vinculación. Las NC de venta se reportan.
    const compras = vouchers.filter(
      (v: (typeof vouchers)[number]) => v.direccion === 'COMPRA' && v.tipoComprobante !== 'NOTA_CREDITO',
    );
    const ventas = vouchers.filter(
      (v: (typeof vouchers)[number]) => v.direccion === 'VENTA',
    );

    const totalVentasPeriodo = ventas.reduce(
      (acc: Prisma.Decimal, v: (typeof vouchers)[number]) =>
        acc.plus(new Prisma.Decimal(v.baseImponibleIva).plus(v.baseImponibleIva0)
          .times(v.tipoComprobante === 'NOTA_CREDITO' ? -1 : 1)),
      new Prisma.Decimal(0),
    );

    const doc = create({ version: '1.0', encoding: 'UTF-8' }).ele('iva');
    doc.ele('TipoIDInformante').txt('R').up();
    doc.ele('IdInformante').txt(company.ruc).up();
    doc.ele('razonSocial').txt(company.razonSocial.slice(0, 300)).up();
    doc.ele('Anio').txt(String(anio)).up();
    doc.ele('Mes').txt(String(mes).padStart(2, '0')).up();
    doc.ele('numEstabRuc').txt(String(Math.max(establecimientos, 1)).padStart(3, '0')).up();
    doc.ele('totalVentas').txt(totalVentasPeriodo.toFixed(2)).up();
    doc.ele('codigoOperativo').txt('IVA').up();

    const comprasEl = doc.ele('compras');
    for (const c of compras) {
      const meta = metadataAts(c.xmlOriginal);
      // No usar retenciones sugeridas históricas como si hubieran sido emitidas.
      const valBienes30 = 0, valServicios70 = 0, valServ100 = 0;
      const proveedor = c.tipoComprobante === 'LIQUIDACION' ? c.identificacionContraparte! : c.rucEmisor;

      const det = comprasEl.ele('detalleCompras');
      det.ele('codSustento').txt('01').up(); // REQUIERE_VERIFICACION: depende de inventario/activo fijo/gasto
      det.ele('tpIdProv').txt(tipoIdentificacionAts(proveedor, false, c.tipoComprobante === 'LIQUIDACION' ? meta.tipoIdentificacion : undefined)).up();
      det.ele('idProv').txt(proveedor).up();
      det.ele('tipoComprobante').txt(mapearCodigoComprobante(c.tipoComprobante)).up();
      det.ele('parteRel').txt('NO').up(); // REQUIERE_VERIFICACION por comprobante
      det.ele('fechaRegistro').txt(formatearFecha(c.fechaEmision)).up();
      det.ele('establecimiento').txt(extraerSegmentoClave(c.claveAcceso, 24, 27, '001')).up();
      det.ele('puntoEmision').txt(extraerSegmentoClave(c.claveAcceso, 27, 30, '001')).up();
      det.ele('secuencial').txt(extraerSegmentoClave(c.claveAcceso, 30, 39, '000000001')).up();
      det.ele('fechaEmision').txt(formatearFecha(c.fechaEmision)).up();
      det.ele('autorizacion').txt(c.claveAcceso).up();
      det.ele('baseNoGraIva').txt('0.00').up();
      det.ele('baseImponible').txt(new Prisma.Decimal(c.baseImponibleIva0).toFixed(2)).up();
      det.ele('baseImpGrav').txt(new Prisma.Decimal(c.baseImponibleIva).toFixed(2)).up();
      det.ele('baseImpExe').txt('0.00').up();
      det.ele('montoIce').txt('0.00').up();
      det.ele('montoIva').txt(new Prisma.Decimal(c.montoIva).toFixed(2)).up();
      det.ele('valRetBien10').txt('0.00').up();
      det.ele('valRetServ20').txt('0.00').up();
      det.ele('valorRetBienes').txt(valBienes30.toFixed(2)).up();
      det.ele('valRetServ50').txt('0.00').up();
      det.ele('valorRetServicios').txt(valServicios70.toFixed(2)).up();
      det.ele('valRetServ100').txt(valServ100.toFixed(2)).up();
      det.ele('pagoExterior')
        .ele('pagoLocExt').txt('01').up() // 01 = local; REQUIERE_VERIFICACION Tabla 15
        .ele('aplicConvDobTrib').txt('NA').up() // NA = no aplica (compra local); REQUIERE_VERIFICACION si hay proveedores del exterior
        .ele('pagExtSujRetNorLeg').txt('NA').up()
        .up();
      if (meta.pagos.length) {
        const pagos = det.ele('formasDePago');
        for (const pago of meta.pagos) pagos.ele('formaPago').txt(pago).up();
      }
    }

    const ventasEl = doc.ele('ventas');
    const grupos = new Map<string, typeof ventas>();
    for (const v of ventas) {
      const meta = metadataAts(v.xmlOriginal);
      const key = JSON.stringify([v.identificacionContraparte, v.tipoComprobante,
        tipoIdentificacionAts(v.identificacionContraparte ?? '', true, meta.tipoIdentificacion), meta.parteRelacionada ?? 'NO']);
      grupos.set(key, [...(grupos.get(key) ?? []), v]);
    }
    for (const grupo of grupos.values()) {
      const v = grupo[0];
      const meta = metadataAts(v.xmlOriginal);
      const sumar = (campo: 'baseImponibleIva0' | 'baseImponibleIva' | 'montoIva') =>
        grupo.reduce((s, item) => s.plus(item[campo]), new Prisma.Decimal(0)).toFixed(2);
      const det = ventasEl.ele('detalleVentas');
      det.ele('tpIdCliente').txt(tipoIdentificacionAts(v.identificacionContraparte ?? '', true, meta.tipoIdentificacion)).up();
      det.ele('idCliente').txt(v.identificacionContraparte!).up();
      det.ele('parteRelVtas').txt(meta.parteRelacionada ?? 'NO').up();
      det.ele('tipoComprobante').txt(mapearCodigoComprobante(v.tipoComprobante)).up();
      det.ele('tipoEmision').txt('E').up(); // XML electrónico importado; no acredita autorización remota.
      det.ele('numeroComprobantes').txt(String(grupo.length)).up();
      det.ele('baseNoGraIva').txt('0.00').up();
      det.ele('baseImponible').txt(sumar('baseImponibleIva0')).up();
      det.ele('baseImpGrav').txt(sumar('baseImponibleIva')).up();
      det.ele('montoIva').txt(sumar('montoIva')).up();
      det.ele('montoIce').txt('0.00').up();
      det.ele('valorRetIva').txt('0.00').up(); // se completa desde RETENCION_RECIBIDA por separado — ver limitación abajo
      det.ele('valorRetRenta').txt('0.00').up();
      const formas = [...new Set(grupo.flatMap((item) => metadataAts(item.xmlOriginal).pagos))].sort();
      if (formas.length) {
        const pagos = det.ele('formasDePago');
        for (const pago of formas) pagos.ele('formaPago').txt(pago).up();
      }
    }

    const xml = doc.end({ prettyPrint: true });
    const hash = createHash('sha256').update(xml).digest('hex');

    const reporte = await this.prisma.atsReport.upsert({
      where: { companyId_mes_anio: { companyId, mes, anio } },
      create: {
        companyId,
        mes,
        anio,
        usuarioId: userId,
        versionCatalogo: this.VERSION_CATALOGO_ASUMIDA,
        versionXsd: this.VERSION_XSD_ASUMIDA,
        estado: 'BORRADOR_REQUIERE_REVISION',
        advertenciasJson: advertencias.map((a) => ({ ...a })),
        hashArchivo: hash,
      },
      update: {
        usuarioId: userId,
        estado: 'BORRADOR_REQUIERE_REVISION',
        advertenciasJson: advertencias.map((a) => ({ ...a })),
        hashArchivo: hash,
        fechaGeneracion: new Date(),
      },
    });

    await this.audit.registrar({
      userId,
      companyId,
      accion: 'GENERAR_ATS',
      modulo: 'ATS',
      registroId: reporte.id,
      resultado: 'OK',
    });

    return { xml, reporte, advertencias };
  }

  async historial(companyId: string) {
    return this.prisma.atsReport.findMany({ where: { companyId }, orderBy: [{ anio: 'desc' }, { mes: 'desc' }] });
  }
}

/// Códigos de tipo de comprobante (Tabla 4 de la ficha técnica). Se
/// confirmaron 01 (factura), 03 (liquidación de compra) y 04 (nota de
/// crédito) por texto explícito de la ficha técnica; el resto de la Tabla
/// 4 completa (guías de remisión, tiquetes, etc.) no se transcribió aquí
/// — REQUIERE VERIFICACIÓN si se necesitan esos tipos.
function mapearCodigoComprobante(tipo: string): string {
  switch (tipo) {
    case 'FACTURA':
      return '01';
    case 'NOTA_CREDITO':
      return '04';
    case 'LIQUIDACION':
      return '03';
    default:
      return '01';
  }
}

function extraerSegmentoClave(claveAcceso: string, inicio: number, fin: number, porDefecto: string): string {
  if (claveAcceso.length < fin) return porDefecto;
  return claveAcceso.slice(inicio, fin);
}

function formatearFecha(fecha: Date): string {
  const d = String(fecha.getDate()).padStart(2, '0');
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  return `${d}/${m}/${fecha.getFullYear()}`;
}

