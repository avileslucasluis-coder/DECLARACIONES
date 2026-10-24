import { Injectable, UnauthorizedException, ConflictException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RegisterDto, LoginDto } from './dto/auth.dto';

/// Duración del access token (corta, para limitar el daño si se filtra) y
/// del refresh token (más largo, pero rotado y revocable en cada uso).
const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL_DIAS = 30;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
  ) {}

  async register(dto: RegisterDto) {
    if (process.env.NODE_ENV === 'production' && process.env.ALLOW_PUBLIC_REGISTRATION !== 'true') {
      throw new ForbiddenException('El registro público está deshabilitado. Contacta al administrador.');
    }
    const existente = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existente) {
      throw new ConflictException('Ya existe una cuenta con ese correo.');
    }

    // Argon2id: recomendado sobre bcrypt para hashing de contraseñas nuevas.
    const passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });

    const user = await this.prisma.user.create({
      data: { email: dto.email, passwordHash, nombre: dto.nombre },
    });

    await this.audit.registrar({
      userId: user.id,
      accion: 'REGISTRO_USUARIO',
      modulo: 'AUTH',
      resultado: 'OK',
    });

    return this.emitirTokens(user.id, user.email);
  }

  async login(dto: LoginDto, ip?: string) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });

    // Mismo mensaje de error exista o no el usuario: evita filtrar qué
    // correos están registrados (enumeración de usuarios).
    if (!user || !user.activo) {
      await this.audit.registrar({
        accion: 'LOGIN',
        modulo: 'AUTH',
        resultado: 'ERROR',
        ip,
      });
      throw new UnauthorizedException('Credenciales inválidas.');
    }

    const passwordValida = await argon2.verify(user.passwordHash, dto.password);
    await this.prisma.loginHistory.create({
      data: { userId: user.id, ip, exitoso: passwordValida },
    });

    if (!passwordValida) {
      await this.audit.registrar({
        userId: user.id,
        accion: 'LOGIN',
        modulo: 'AUTH',
        resultado: 'ERROR',
        ip,
      });
      throw new UnauthorizedException('Credenciales inválidas.');
    }

    await this.audit.registrar({
      userId: user.id,
      accion: 'LOGIN',
      modulo: 'AUTH',
      resultado: 'OK',
      ip,
    });

    return this.emitirTokens(user.id, user.email);
  }

  async refresh(refreshTokenPlano: string) {
    const tokenHash = this.hashToken(refreshTokenPlano);
    const registro = await this.prisma.refreshToken.findFirst({
      where: { tokenHash, revocado: false, expiraEn: { gt: new Date() } },
    });
    if (!registro) {
      throw new UnauthorizedException('Sesión inválida o expirada, inicia sesión de nuevo.');
    }

    // Rotación: el refresh token usado se revoca y se emite uno nuevo,
    // así un token robado y reutilizado deja rastro (revocado dos veces).
    const consumed = await this.prisma.refreshToken.updateMany({
      where: { id: registro.id, revocado: false, expiraEn: { gt: new Date() } },
      data: { revocado: true },
    });
    if (consumed.count !== 1) throw new UnauthorizedException('Sesión inválida o expirada.');

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: registro.userId } });
    if (!user.activo) throw new UnauthorizedException('Sesión inválida.');
    await this.audit.registrar({ userId: user.id, accion: 'REFRESH', modulo: 'AUTH', resultado: 'OK' });
    return this.emitirTokens(user.id, user.email);
  }

  async logout(refreshTokenPlano: string) {
    const tokenHash = this.hashToken(refreshTokenPlano);
    const token = await this.prisma.refreshToken.findFirst({ where: { tokenHash } });
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash },
      data: { revocado: true },
    });
    if (token) await this.audit.registrar({ userId: token.userId, accion: 'LOGOUT', modulo: 'AUTH', resultado: 'OK' });
  }

  private async emitirTokens(userId: string, email: string) {
    const accessToken = await this.jwt.signAsync(
      { sub: userId, email },
      { expiresIn: ACCESS_TOKEN_TTL },
    );

    const refreshTokenPlano = randomUUID() + randomUUID();
    const expiraEn = new Date();
    expiraEn.setDate(expiraEn.getDate() + REFRESH_TOKEN_TTL_DIAS);

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: this.hashToken(refreshTokenPlano),
        expiraEn,
      },
    });

    return { accessToken, refreshToken: refreshTokenPlano, expiresIn: ACCESS_TOKEN_TTL };
  }

  /// El refresh token nunca se guarda en texto plano en la base — solo su
  /// hash, igual que una contraseña — así una fuga de la tabla no permite
  /// reutilizar sesiones directamente.
  private hashToken(tokenPlano: string): string {
    return require('crypto').createHash('sha256').update(tokenPlano).digest('hex');
  }
}
