import { Body, Controller, Get, Query, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsInt, IsUUID, Max, Min } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { DeclarationsService } from './declarations.service';

class GenerarDeclaracionDto {
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
  constructor(private readonly declarations: DeclarationsService) {}

  @Get('history')
  @RequirePermissions('declaraciones.generar')
  historial(@Query('companyId') companyId: string, @Query('mes') mes: string, @Query('anio') anio: string) {
    return this.declarations.historial(companyId, Number(mes), Number(anio));
  }

  @Post('generar')
  @RequirePermissions('declaraciones.generar')
  generar(@Body() dto: GenerarDeclaracionDto, @CurrentUser() user: { userId: string }) {
    return this.declarations.generarParaPeriodo(dto.companyId, dto.mes, dto.anio, user.userId);
  }

  @Post('presentar')
  @ApiOperation({ summary: 'Registrar manualmente una presentación efectuada por el usuario en SRI en Línea; no envía al SRI.' })
  @RequirePermissions('declaraciones.presentar')
  presentar(@Body() dto: GenerarDeclaracionDto, @CurrentUser() user: { userId: string }) {
    return this.declarations.marcarPresentada(dto.companyId, dto.mes, dto.anio, user.userId);
  }
}
