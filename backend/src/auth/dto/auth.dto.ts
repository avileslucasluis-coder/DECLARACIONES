import { IsEmail, IsString, MinLength, MaxLength, Matches, ValidateIf } from 'class-validator';

export class RegisterDto {
  @Matches(/^[0-9]{13}$/, { message: 'El RUC debe tener 13 dígitos.' })
  ruc!: string;
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(12, { message: 'La contraseña debe tener al menos 12 caracteres.' })
  @MaxLength(128)
  password!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  nombre!: string;
}

export class LoginDto {
  @ValidateIf(o => o.ruc !== undefined || o.email === undefined)
  @Matches(/^[0-9]{13}$/)
  ruc?: string;

  @ValidateIf(o => o.email !== undefined || o.ruc === undefined)
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @IsString()
  @MaxLength(128)
  password!: string;
}

export class RefreshDto {
  @IsString()
  @MaxLength(256)
  refreshToken!: string;
}

export class ForgotPasswordDto {
  @IsEmail() @MaxLength(254)
  email!: string;
}

export class ResetPasswordDto {
  @IsString() @Matches(/^[a-f0-9]{64}$/)
  token!: string;
  @IsString() @MinLength(12) @MaxLength(128)
  password!: string;
}
