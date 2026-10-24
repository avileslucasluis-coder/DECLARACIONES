import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RegimenGeneralRules } from './regimenes/regimen-general.rules';
import { RimpeEmprendedorRules } from './regimenes/rimpe-emprendedor.rules';
import { RimpeNegocioPopularRules } from './regimenes/rimpe-negocio-popular.rules';
import { novenoDigito } from './reglas-comunes';
import { Obligacion, PerfilTributario } from './types';

/// Punto único de entrada del motor de reglas: recibe una empresa y un
/// periodo, arma su PerfilTributario a partir de lo guardado en BD, elige
/// el archivo de reglas del régimen correspondiente (nunca una regla
/// codificada aquí mismo), y persiste el resultado en
/// `tax_obligations` para que quede como historial verificable.
///
/// Agregar un nuevo régimen es: crear su archivo en `regimenes/` + un
/// `case` más en el switch de abajo — el resto del sistema no cambia.
@Injectable()
export class TaxRulesService {
  constructor(private readonly prisma: PrismaService) {}

  async evaluarObligaciones(companyId: string, mes: number, anio: number): Promise<Obligacion[]> {
    if (!Number.isInteger(mes) || mes < 1 || mes > 12 || !Number.isInteger(anio) || anio < 2000 || anio > 2100) {
      throw new BadRequestException('Período inválido: mes del 1 al 12 y año entre 2000 y 2100.');
    }
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Empresa no encontrada.');

    const perfil: PerfilTributario = {
      regimen: company.regimen as PerfilTributario['regimen'],
      obligadoLlevarContabilidad: company.obligadoLlevarContabilidad ?? undefined,
      esContribuyenteEspecial: company.esContribuyenteEspecial ?? undefined,
      designadoAgenteRetencionPorSri: company.esAgenteRetencion ?? undefined,
      // realizaVentasGravadasIva / realizaVentasTarifa0 / realizaOperacionesExterior
      // se completan en una futura Fase con datos declarados por el
      // contador (aquí quedan sin definir => PENDIENTE_INFORMACION).
      deberesFormalesRegistrados: new Set<string>(),
    };

    const ruc9 = novenoDigito(company.ruc);

    let obligaciones: Obligacion[];
    switch (perfil.regimen) {
      case 'GENERAL':
        obligaciones = RegimenGeneralRules.evaluar(perfil, ruc9, mes, anio);
        break;
      case 'RIMPE_EMPRENDEDOR':
        obligaciones = RimpeEmprendedorRules.evaluar(perfil, ruc9, mes, anio);
        break;
      case 'RIMPE_NEGOCIO_POPULAR':
        obligaciones = RimpeNegocioPopularRules.evaluar(perfil, ruc9, mes, anio);
        break;
      default:
        throw new NotFoundException(`Régimen no soportado: ${perfil.regimen}`);
    }

    obligaciones = obligaciones.map((o) => o.fechaVencimiento ? {
      ...o,
      motivo: `${o.motivo} Fecha ordinaria referencial: verifica feriados nacionales/locales y ampliaciones del SRI.`,
    } : o);

    await Promise.all(
      obligaciones.map((o) =>
        this.prisma.taxObligationInstance.upsert({
          where: { companyId_mes_anio_tipo: { companyId, mes, anio, tipo: o.tipo } },
          create: {
            companyId,
            mes,
            anio,
            tipo: o.tipo,
            formulario: o.formulario,
            periodicidad: o.periodicidad,
            estado: o.estado,
            motivo: o.motivo,
            baseLegal: o.baseLegal,
            fechaVencimiento: o.fechaVencimiento,
          },
          update: {
            formulario: o.formulario,
            periodicidad: o.periodicidad,
            estado: o.estado,
            motivo: o.motivo,
            baseLegal: o.baseLegal,
            fechaVencimiento: o.fechaVencimiento,
          },
        }),
      ),
    );

    return obligaciones;
  }
}
