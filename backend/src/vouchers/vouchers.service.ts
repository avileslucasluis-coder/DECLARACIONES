import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { parseComprobanteXml, XmlComprobanteException } from './xml-parser.util';

@Injectable()
export class VouchersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async importarXml(companyId: string, xmlContent: string, userId: string) {
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Empresa no encontrada.');

    let parseado;
    try {
      parseado = parseComprobanteXml(xmlContent, company.ruc);
    } catch (e) {
      if (e instanceof XmlComprobanteException) throw new BadRequestException(e.message);
      throw e;
    }

    const yaExiste = await this.prisma.voucher.findUnique({
      where: { companyId_claveAcceso: { companyId, claveAcceso: parseado.claveAcceso } },
    });
    if (yaExiste) {
      throw new BadRequestException('Este comprobante ya fue importado (clave de acceso duplicada).');
    }

    const voucher = await this.prisma.voucher.create({
      data: {
        companyId,
        tipoComprobante: parseado.tipoComprobante,
        direccion: parseado.direccion,
        claveAcceso: parseado.claveAcceso,
        xmlOriginal: xmlContent,
        rucEmisor: parseado.rucEmisor,
        razonSocialEmisor: parseado.razonSocialEmisor,
        identificacionContraparte: parseado.identificacionContraparte,
        razonSocialContraparte: parseado.razonSocialContraparte,
        fechaEmision: parseado.fechaEmision,
        baseImponibleIva: parseado.baseImponibleIva,
        baseImponibleIva0: parseado.baseImponibleIva0,
        montoIva: parseado.montoIva,
        montoRentaRetenida: parseado.montoRentaRetenida,
        importeTotal: parseado.importeTotal,
      },
    });

    // Una compra no demuestra que exista una retención ni determina sus
    // porcentajes. Las retenciones reales se importan desde su propio XML.
    const withholding = null;

    await this.audit.registrar({
      userId,
      companyId,
      accion: 'IMPORTAR_COMPROBANTE',
      modulo: 'VOUCHERS',
      registroId: voucher.id,
      valorNuevo: { tipoComprobante: voucher.tipoComprobante, direccion: voucher.direccion },
      resultado: 'OK',
    });

    const { xmlOriginal: _xmlOriginal, ...resumen } = voucher;
    return { voucher: resumen, withholding };
  }

  async listar(companyId: string, mes?: number, anio?: number) {
    const vouchers = await this.prisma.voucher.findMany({
      where: {
        companyId,
        ...(mes && anio
          ? {
              fechaEmision: {
                gte: new Date(anio, mes - 1, 1),
                lt: new Date(anio, mes, 1),
              },
            }
          : {}),
      },
      include: { withholding: true },
      orderBy: { fechaEmision: 'asc' },
    });
    return vouchers.map(({ xmlOriginal: _xmlOriginal, ...resumen }) => resumen);
  }
}
