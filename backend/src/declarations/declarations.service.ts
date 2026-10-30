import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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

    let ventasGravadas = new Prisma.Decimal(0),
      ventas0 = new Prisma.Decimal(0),
      ivaVentas = new Prisma.Decimal(0);
    let comprasGravadas = new Prisma.Decimal(0),
      compras0 = new Prisma.Decimal(0),
      ivaCompras = new Prisma.Decimal(0);
    let ivaRetenidoEnVentas = new Prisma.Decimal(0),
      rentaRetenidaEnVentas = new Prisma.Decimal(0);
    let retIvaAplicada = new Prisma.Decimal(0),
      retRentaAplicada = new Prisma.Decimal(0);

    for (const v of vouchers) {
      const signo = v.tipoComprobante === 'NOTA_CREDITO' ? -1 : 1;
      const baseIva = new Prisma.Decimal(v.baseImponibleIva);
      const base0 = new Prisma.Decimal(v.baseImponibleIva0);
      const iva = new Prisma.Decimal(v.montoIva);

      switch (v.direccion) {
        case 'VENTA':
          ventasGravadas = ventasGravadas.plus(baseIva.times(signo));
          ventas0 = ventas0.plus(base0.times(signo));
          ivaVentas = ivaVentas.plus(iva.times(signo));
          break;
        case 'COMPRA':
          comprasGravadas = comprasGravadas.plus(baseIva.times(signo));
          compras0 = compras0.plus(base0.times(signo));
          ivaCompras = ivaCompras.plus(iva.times(signo));
          break;
        case 'RETENCION_RECIBIDA':
          ivaRetenidoEnVentas = ivaRetenidoEnVentas.plus(iva);
          rentaRetenidaEnVentas = rentaRetenidaEnVentas.plus(v.montoRentaRetenida);
          break;
        case 'RETENCION_EMITIDA':
          retIvaAplicada = retIvaAplicada.plus(iva);
          retRentaAplicada = retRentaAplicada.plus(v.montoRentaRetenida);
          break;
        default:
          break;
      }
    }

    // Las retenciones preparadas sobre compras no prueban una retención
    // emitida. Solo se suman los comprobantes de retención importados, en
    // su fecha de emisión, incluso si sustentan compras de otro período.
    const redondear = (valor: Prisma.Decimal) => valor.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toNumber();
    const saldoIva = ivaVentas.minus(ivaCompras).minus(ivaRetenidoEnVentas);
    const ivaAPagar = Prisma.Decimal.max(0, saldoIva);
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

    const declaration = await this.versionar(companyId, mes, anio, userId, 'GENERAR_BORRADOR', async tx => tx.taxDeclaration.upsert({
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
        fechaGeneracion: new Date(),
      },
    }));

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
      ivaAPagar104: redondear(ivaAPagar),
      totalAPagar104: redondear(ivaAPagar.plus(retIvaAplicada)),
      creditoTributarioSiguientePeriodo: redondear(Prisma.Decimal.max(0, saldoIva.negated())),
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
    const declaration = await this.versionar(companyId, mes, anio, userId, 'REGISTRO_MANUAL', async tx => {
      const existente = await tx.taxDeclaration.findUnique({
        where: { companyId_mes_anio: { companyId, mes, anio } },
      });
      if (!existente) throw new NotFoundException('Primero genera el papel de trabajo del período.');
      return tx.taxDeclaration.update({
        where: { companyId_mes_anio: { companyId, mes, anio } },
        data: { estado: 'PRESENTADA_LOCAL', fechaPresentacion: new Date() },
      });
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

  async historial(companyId: string, mes: number, anio: number) {
    this.validarPeriodo(mes, anio);
    return this.prisma.declarationRevision.findMany({
      where: { declaration: { companyId, mes, anio } },
      orderBy: { version: 'asc' },
    });
  }

  private async versionar<T extends { id: string }>(
    companyId: string, mes: number, anio: number, actorId: string, action: string,
    mutation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async tx => {
      // Serializa las revisiones del mismo período, también cuando aún no existe la declaración.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${companyId}), hashtext(${`${anio}-${mes}`}))`;
      const previous = await tx.taxDeclaration.findUnique({ where: { companyId_mes_anio: { companyId, mes, anio } } });
      const result = await mutation(tx);
      const last = await tx.declarationRevision.findFirst({ where: { declarationId: result.id }, orderBy: { version: 'desc' } });
      await tx.declarationRevision.create({ data: {
        declarationId: result.id, version: (last?.version ?? 0) + 1, actorId, action,
        previous: previous ? JSON.parse(JSON.stringify(previous)) : Prisma.DbNull,
        snapshot: JSON.parse(JSON.stringify(result)),
      } });
      return result;
    });
  }

  private validarPeriodo(mes: number, anio: number) {
    if (!Number.isInteger(mes) || mes < 1 || mes > 12 || !Number.isInteger(anio) || anio < 2000 || anio > 2100) {
      throw new BadRequestException('El período requiere un mes del 1 al 12 y un año entre 2000 y 2100.');
    }
  }
}
