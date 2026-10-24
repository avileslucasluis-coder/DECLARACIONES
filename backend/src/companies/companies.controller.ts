import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto } from './dto/company.dto';

@ApiTags('companies')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/companies')
export class CompaniesController {
  constructor(private readonly companies: CompaniesService) {}

  @Get()
  listar(@CurrentUser() user: { userId: string }) {
    return this.companies.listarParaUsuario(user.userId);
  }

  @Post()
  crear(@Body() dto: CreateCompanyDto, @CurrentUser() user: { userId: string }) {
    // Cualquier usuario autenticado puede dar de alta una empresa nueva y
    // se convierte automáticamente en su ADMIN_EMPRESA — no requiere un
    // permiso previo porque, por definición, todavía no pertenece a ella.
    return this.companies.crear(dto, user.userId);
  }
}
