import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsInt, IsUUID, Max, Min } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AtsService } from './ats.service';

class AtsPeriodoDto {
  @IsUUID()
  companyId!: string;

  @IsInt()
  @Min(1)
  @Max(12)
  mes!: number;

  @IsInt()
  anio!: number;
}

@ApiTags('ats')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/ats')
export class AtsController {
  constructor(private readonly ats: AtsService) {}

  @Post('validate')
  @RequirePermissions('ats.validar')
  validar(@Body() dto: AtsPeriodoDto) {
    return this.ats.validar(dto.companyId, dto.mes, dto.anio);
  }

  @Post('generate')
  @RequirePermissions('ats.generate')
  generar(@Body() dto: AtsPeriodoDto, @CurrentUser() user: { userId: string }) {
    return this.ats.generarXml(dto.companyId, dto.mes, dto.anio, user.userId);
  }

  @Get('history')
  @RequirePermissions('ats.validar')
  historial(@Query('companyId') companyId: string) {
    return this.ats.historial(companyId);
  }
}
