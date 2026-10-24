import { Body, Controller, Ip, Post, UseGuards } from '@nestjs/common';
import { AuthRateGuard } from '../security/auth-rate.guard';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto, RefreshDto } from './dto/auth.dto';

@ApiTags('auth')
@Controller('api/auth')
@UseGuards(AuthRateGuard)
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Crea una cuenta de usuario (sin empresa asociada todavía).' })
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('login')
  @ApiOperation({ summary: 'Inicia sesión y devuelve access + refresh token.' })
  login(@Body() dto: LoginDto, @Ip() ip: string) {
    return this.auth.login(dto, ip);
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Rota el refresh token y emite un nuevo access token.' })
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('logout')
  @ApiOperation({ summary: 'Revoca el refresh token (cierra la sesión de ese dispositivo).' })
  logout(@Body() dto: RefreshDto) {
    return this.auth.logout(dto.refreshToken);
  }
}
