import { IsString, IsUUID } from 'class-validator';

export class ImportVoucherDto {
  @IsUUID()
  companyId!: string;

  @IsString()
  xmlContent!: string;
}
