import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

/// Papel de trabajo mensual a partir de comprobantes importados. El 103
/// contiene retenciones de renta; las retenciones de IVA corresponden al 104.
/// No sustituye la conciliación ni presenta declaraciones ante el SRI.
@Injectable()
export class DeclarationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async generarParaPeriodo(companyId: string, mes: number, anio: number, userId: string) {
    this.validarPeriodo(mes, anio);
    const desde = new Date(anio, mes - 1, 1);
    const hasta = new Date(anio, mes, 1);

    const vouchers = await this.prisma.voucher.findMany({
      where: { companyId, fechaEmision: { gte: desde, lt: hasta } },
    });

    let ventasGravadas = 0,
      ventas0 = 0,
      ivaVentas = 0;
    let comprasGravadas = 0,
      compras0 = 0,
      ivaCompras = 0;
    let ivaRetenidoEnVentas = 0,
      rentaRetenidaEnVentas = 0;
    let retIvaAplicada = 0,
      retRentaAplicada = 0;

    for (const v of vouchers) {
      const signo = v.tipoComprobante === 'NOTA_CREDITO' ? -1 : 1;
      const baseIva = Number(v.baseImponibleIva);
      const base0 = Number(v.baseImponibleIva0);
      const iva = Number(v.montoIva);

      switch (v.direccion) {
        case 'VENTA':
          ventasGravadas += signo * baseIva;
          ventas0 += signo * base0;
          ivaVentas += signo * iva;
          break;
        case 'COMPRA':
          comprasGravadas += signo * baseIva;
          compras0 += signo * base0;
          ivaCompras += signo * iva;
          break;
        case 'RETENCION_RECIBIDA':
          ivaRetenidoEnVentas += iva;
          rentaRetenidaEnVentas += Number(v.montoRentaRetenida);
          break;
        case 'RETENCION_EMITIDA':
          retIvaAplicada += iva;
          retRentaAplicada += Number(v.montoRentaRetenida);
          break;
        default:
          break;
      }
    }

    // Las retenciones preparadas sobre compras no prueban una retención
    // emitida. Solo se suman los comprobantes de retención importados, en
    // su fecha de emisión, incluso si sustentan compras de otro período.
    const redondear = (valor: number) => Math.round((valor + Number.EPSILON) * 100) / 100;
    const totales = {
      totalVentasGravadas: redondear(ventasGravadas),
      totalVentas0: redondear(ventas0),
      totalIvaVentas: redondear(ivaVentas),
      totalComprasGravadas: redondear(comprasGravadas),
      totalCompras0: redondear(compras0),
      totalIvaCompras: redondear(ivaCompras),
      totalIvaRetenidoEnVentas: redondear(ivaRetenidoEnVentas),
      totalRetencionesIvaAplicadas: redondear(retIvaAplicada),
      totalRetencionesRentaAplicadas: redondear(retRentaAplicada),
    };

    const declaration = await this.prisma.taxDeclaration.upsert({
      where: { companyId_mes_anio: { companyId, mes, anio } },
      create: {
        companyId,
        mes,
        anio,
        ...totales,
      },
      update: {
        ...totales,
        estado: 'BORRADOR',
        fechaPresentacion: null,
      },
    });

    await this.audit.registrar({
      userId,
      companyId,
      accion: 'GENERAR_DECLARACION',
      modulo: 'DECLARATIONS',
      registroId: declaration.id,
      resultado: 'OK',
    });

    return {
      ...declaration,
      ivaAPagar104: redondear(Math.max(0, ivaVentas - ivaCompras - ivaRetenidoEnVentas)),
      totalAPagar104: redondear(Math.max(0, ivaVentas - ivaCompras - ivaRetenidoEnVentas) + retIvaAplicada),
      creditoTributarioSiguientePeriodo: redondear(Math.max(0, ivaCompras + ivaRetenidoEnVentas - ivaVentas)),
      totalAPagar103: redondear(retRentaAplicada),
      rentaRetenidaEnVentasInformativo: redondear(rentaRetenidaEnVentas),
      alcance: 'PAPEL_TRABAJO_MENSUAL',
      advertencias: [
        'Este resumen mensual no presenta declaraciones ante el SRI. Para IVA semestral se debe consolidar todo el semestre.',
        'El IVA de compras requiere revisar el derecho a crédito tributario, proporcionalidad, saldos anteriores, ajustes, multas e intereses.',
        'Las retenciones se obtienen de comprobantes importados; los cálculos de preparación no se consideran retenciones emitidas.',
      ],
    };
  }

  async marcarPresentada(companyId: string, mes: number, anio: number, userId: string) {
    this.validarPeriodo(mes, anio);
    const existente = await this.prisma.taxDeclaration.findUnique({
      where: { companyId_mes_anio: { companyId, mes, anio } },
    });
    if (!existente) throw new NotFoundException('Primero genera el papel de trabajo del período.');
    const declaration = await this.prisma.taxDeclaration.update({
      where: { companyId_mes_anio: { companyId, mes, anio } },
      data: { estado: 'PRESENTADA_LOCAL', fechaPresentacion: new Date() },
    });

    await this.audit.registrar({
      userId,
      companyId,
      accion: 'MODIFICAR_DECLARACION',
      modulo: 'DECLARATIONS',
      registroId: declaration.id,
      valorNuevo: { estado: 'PRESENTADA_LOCAL', origen: 'REGISTRO_MANUAL_USUARIO' },
      resultado: 'OK',
    });

    return { ...declaration, enviadaAlSri: false, mensaje: 'Presentación registrada manualmente. Este sistema no envió la declaración al SRI.' };
  }

  private validarPeriodo(mes: number, anio: number) {
    if (!Number.isInteger(mes) || mes < 1 || mes > 12 || !Number.isInteger(anio) || anio < 2000 || anio > 2100) {
      throw new BadRequestException('El período requiere un mes del 1 al 12 y un año entre 2000 y 2100.');
    }
  }
}
