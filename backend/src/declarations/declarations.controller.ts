import { Body, Controller, Get, Query, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsIn, IsInt, IsUUID, Max, Min, ValidateIf, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { AdjustmentsDto, FilingDto } from './adjustments.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { DeclarationsService } from './declarations.service';

class GenerarDeclaracionDto {
  @ValidateIf((_, v) => v !== undefined)
  @ValidateNested() @Type(() => AdjustmentsDto)
  ajustes?: AdjustmentsDto;
  @ValidateIf((_, value) => value !== undefined)
  @IsIn(['MENSUAL', 'SEMESTRAL', 'ANUAL'])
  periodicidad?: string;
  @IsUUID()
  companyId!: string;

  @IsInt()
  @Min(1)
  @Max(12)
  mes!: number;

  @IsInt()
  @Min(2000)
  @Max(2100)
  anio!: number;
}

@ApiTags('declarations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/declarations')
export class DeclarationsController {
  @Post('filings')
  @RequirePermissions('declaraciones.presentar')
  registrarEvidencia(@Body() dto: FilingDto, @CurrentUser() user: { userId: string }) {
    return this.declarations.registrarEvidencia(dto, user.userId);
  }

  @Get('filings')
  @RequirePermissions('declaraciones.generar')
  evidencias(@Query('companyId') companyId: string, @Query('declarationId') declarationId: string) {
    return this.declarations.evidencias(companyId, declarationId);
  }

  @Get('filing-file')
  @RequirePermissions('declaraciones.generar')
  archivo(@Query('companyId') companyId: string, @Query('id') id: string) {
    return this.declarations.archivoEvidencia(companyId, id);
  }
  constructor(private readonly declarations: DeclarationsService) {}

  @Get('history')
  @RequirePermissions('declaraciones.generar')
  historial(@Query('companyId') companyId: string, @Query('mes') mes: string, @Query('anio') anio: string, @Query('periodicidad') periodicidad?: string) {
    return this.declarations.historial(companyId, Number(mes), Number(anio), periodicidad);
  }

  @Post('generar')
  @RequirePermissions('declaraciones.generar')
  generar(@Body() dto: GenerarDeclaracionDto, @CurrentUser() user: { userId: string }) {
    return this.declarations.generarParaPeriodo(dto.companyId, dto.mes, dto.anio, user.userId, dto.periodicidad, dto.ajustes);
  }

  @Post('presentar')
  @ApiOperation({ summary: 'Registrar manualmente una presentación efectuada por el usuario en SRI en Línea; no envía al SRI.' })
  @RequirePermissions('declaraciones.presentar')
  presentar(@Body() dto: GenerarDeclaracionDto, @CurrentUser() user: { userId: string }) {
    return this.declarations.marcarPresentada(dto.companyId, dto.mes, dto.anio, user.userId, dto.periodicidad);
  }
}
