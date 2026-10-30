import { DeclarationsService } from '../src/declarations/declarations.service';

function transaccional(prisma: any) {
  prisma.taxDeclaration.findUnique ??= jest.fn().mockResolvedValue(null);
  prisma.$executeRaw = jest.fn().mockResolvedValue(1);
  prisma.declarationRevision = { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() };
  prisma.$transaction = (callback: any) => callback(prisma);
  return prisma;
}

describe('Papel de trabajo 103 y104', () => {
  it('conserva centavos al compensar compras, ventas y notas de crédito', async () => {
    const base = { tipoComprobante: 'FACTURA', direccion: 'VENTA', baseImponibleIva: '0', baseImponibleIva0: '0', montoIva: '0', montoRentaRetenida: '0' };
    const prisma: any = { voucher: { findMany: jest.fn().mockResolvedValue([
      { ...base, montoIva: '0.10' }, { ...base, montoIva: '0.20' },
      { ...base, direccion: 'COMPRA', montoIva: '0.25' },
      { ...base, tipoComprobante: 'NOTA_CREDITO', montoIva: '0.10' },
    ]) }, taxDeclaration: { upsert: jest.fn(async ({ create }) => ({ id: 'id', ...create })) } };
    const r = await new DeclarationsService(transaccional(prisma), { registrar: jest.fn() } as any).generarParaPeriodo('empresa', 12, 2026, 'usuario');
    expect(r.totalIvaVentas).toBe(0.2);
    expect(r.ivaAPagar104).toBe(0);
    expect(r.creditoTributarioSiguientePeriodo).toBe(0.05);
  });
  it('103 solo contiene renta y 104 incorpora IVA retenido efectivamente emitido', async () => {
    const base = { tipoComprobante: 'FACTURA', baseImponibleIva: 0, baseImponibleIva0: 0, montoIva: 0, montoRentaRetenida: 0 };
    const prisma: any = { voucher: { findMany: jest.fn().mockResolvedValue([
      { ...base, direccion: 'VENTA', baseImponibleIva: 200, montoIva: 30 },
      { ...base, direccion: 'COMPRA', baseImponibleIva: 100, montoIva: 15, withholding: { valorRetenidoIva: 999, valorRetenidoRenta: 999 } },
      { ...base, tipoComprobante: 'RETENCION', direccion: 'RETENCION_EMITIDA', montoIva: 10.50, montoRentaRetenida: 2 },
      { ...base, tipoComprobante: 'RETENCION', direccion: 'RETENCION_RECIBIDA', montoIva: 3, montoRentaRetenida: 4 },
    ]) }, taxDeclaration: { upsert: jest.fn(async ({ create }) => ({ id: 'declaracion', ...create })) } };
    const resultado = await new DeclarationsService(transaccional(prisma), { registrar: jest.fn() } as any).generarParaPeriodo('empresa', 10, 2026, 'usuario');
    expect(resultado.totalAPagar103).toBe(2);
    expect(resultado.ivaAPagar104).toBe(12);
    expect(resultado.totalAPagar104).toBe(22.5);
    expect(resultado.rentaRetenidaEnVentasInformativo).toBe(4);
    expect(resultado.alcance).toBe('PAPEL_TRABAJO_MENSUAL');
  });
  it('registrar presentación manual nunca indica envío al SRI', async () => {
    const prisma: any = { taxDeclaration: { findUnique: jest.fn().mockResolvedValue({ id: 'id' }), update: jest.fn(async ({ data }) => ({ id: 'id', ...data })) } };
    const r = await new DeclarationsService(transaccional(prisma), { registrar: jest.fn() } as any).marcarPresentada('empresa', 10, 2026, 'usuario');
    expect(r.enviadaAlSri).toBe(false);
    expect(r.estado).toBe('PRESENTADA_LOCAL');
  });
});
