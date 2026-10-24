import { parseComprobanteXml, XmlComprobanteException } from '../src/vouchers/xml-parser.util';

const ruc = '0999999999001';
function factura(comprador = ruc, fecha = '15/08/2026') {
  return `<factura><infoTributaria><ruc>0992345678001</ruc><claveAcceso>clave-prueba</claveAcceso></infoTributaria>
  <infoFactura><fechaEmision>${fecha}</fechaEmision><identificacionComprador>${comprador}</identificacionComprador>
  <importeTotal>117</importeTotal><totalConImpuestos>
  <totalImpuesto><codigo>2</codigo><baseImponible>100</baseImponible><valor>15</valor></totalImpuesto>
  <totalImpuesto><codigo>3</codigo><baseImponible>100</baseImponible><valor>2</valor></totalImpuesto>
  </totalConImpuestos></infoFactura></factura>`;
}

describe('Importación de XML', () => {
  it('clasifica la compra y suma únicamente el impuesto de IVA', () => {
    const resultado = parseComprobanteXml(factura(), ruc);
    expect(resultado.direccion).toBe('COMPRA');
    expect(resultado.baseImponibleIva).toBe(100);
    expect(resultado.montoIva).toBe(15);
  });

  it('no transforma comprobantes ajenos en compras de la empresa', () => {
    expect(parseComprobanteXml(factura('0991111111001'), ruc).direccion).toBe('NO_RELACIONADO');
  });

  it('interpreta el comprobante dentro de una autorización con CDATA', () => {
    expect(parseComprobanteXml(`<autorizacion><comprobante><![CDATA[${factura()}]]></comprobante></autorizacion>`, ruc).direccion).toBe('COMPRA');
  });

  it.each(['31/02/2026', '', 'no-es-fecha'])('rechaza la fecha inválida %s en lugar de asignar hoy', (fecha) => {
    expect(() => parseComprobanteXml(factura(ruc, fecha), ruc)).toThrow(XmlComprobanteException);
  });

  it('rechaza XML sin cierre de raíz', () => {
    expect(() => parseComprobanteXml(factura().replace('</factura>', ''), ruc)).toThrow(XmlComprobanteException);
  });

  it('lee las retenciones de los documentos de sustento', () => {
    const xml = `<comprobanteRetencion version="2.0.0"><infoTributaria><ruc>0992345678001</ruc><claveAcceso>retencion-prueba</claveAcceso></infoTributaria>
      <infoCompRetencion><fechaEmision>15/08/2026</fechaEmision><identificacionSujetoRetenido>${ruc}</identificacionSujetoRetenido></infoCompRetencion>
      <docsSustento><docSustento><retenciones>
      <retencion><codigo>1</codigo><baseImponible>100</baseImponible><valorRetenido>2</valorRetenido></retencion>
      <retencion><codigo>2</codigo><baseImponible>15</baseImponible><valorRetenido>4.50</valorRetenido></retencion>
      </retenciones></docSustento></docsSustento></comprobanteRetencion>`;
    const resultado = parseComprobanteXml(xml, ruc);
    expect(resultado.direccion).toBe('RETENCION_RECIBIDA');
    expect(resultado.montoIva).toBe(4.5);
    expect(resultado.montoRentaRetenida).toBe(2);
  });
});
