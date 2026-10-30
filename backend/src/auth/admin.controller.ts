import { Body, Controller, ForbiddenException, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { IsBoolean } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RecoveryMailService } from './recovery-mail.service';

class AccountStatusDto {
  @IsBoolean()
  activo!: boolean;
}

@Controller('api/admin')
@UseGuards(JwtAuthGuard)
export class AdminController {
  constructor(private readonly prisma: PrismaService, private readonly mail: RecoveryMailService) {}

  private async authorize(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.activo || !user.platformAdmin) throw new ForbiddenException('Acceso reservado al administrador.');
  }

  @Get('status')
  async status(@Req() req: any) {
    await this.authorize(req.user.userId);
    let mailConfigured = false;
    try { this.mail.checkConfiguration(); mailConfigured = true; } catch {}
    return { mailConfigured };
  }

  @Get('users')
  async users(@Req() req: any) {
    await this.authorize(req.user.userId);
    return this.prisma.user.findMany({ take: 100, orderBy: { createdAt: 'desc' },
      select: { id: true, nombre: true, email: true, ruc: true, activo: true, platformAdmin: true } });
  }

  @Post('users/:id/status')
  async update(@Req() req: any, @Param('id') id: string, @Body() dto: AccountStatusDto) {
    return this.prisma.$transaction(async tx => {
      // Serializa las operaciones administrativas; nunca permite desactivar administradores.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(290003)`;
      const admin = await tx.user.findUnique({ where: { id: req.user.userId } });
      if (!admin?.activo || !admin.platformAdmin) throw new ForbiddenException();
      const changed = await tx.user.updateMany({ where: { id, platformAdmin: false },
        data: { activo: dto.activo, sessionVersion: { increment: 1 } } });
      if (changed.count !== 1) throw new ForbiddenException('No se puede modificar esta cuenta.');
      await tx.refreshToken.updateMany({ where: { userId: id }, data: { revocado: true } });
      await tx.auditLog.create({ data: { userId: admin.id, accion: dto.activo ? 'ACTIVAR_USUARIO' : 'DESACTIVAR_USUARIO',
        modulo: 'ADMIN', resultado: 'OK', registroId: id } });
      return { activo: dto.activo };
    });
  }
}
