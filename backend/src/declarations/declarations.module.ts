import { Module } from '@nestjs/common';
import { DeclarationsService } from './declarations.service';
import { DeclarationsController } from './declarations.controller';
import { PermissionsGuard } from '../rbac/permissions.guard';

@Module({
  providers: [DeclarationsService, PermissionsGuard],
  controllers: [DeclarationsController],
  exports: [DeclarationsService],
})
export class DeclarationsModule {}
