import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/// Cliente Prisma como servicio inyectable en toda la app. La conexión se
/// abre en onModuleInit y se cierra ordenadamente en onModuleDestroy, para
/// que el proceso no deje conexiones colgadas en despliegues/reinicios.
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
