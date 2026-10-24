import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/// Protege cualquier ruta que requiera sesión iniciada. Se usa como
/// @UseGuards(JwtAuthGuard) en los controllers; el RBAC (PermissionsGuard)
/// se aplica encima de este, nunca lo reemplaza.
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
