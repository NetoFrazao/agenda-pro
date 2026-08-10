import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/decorators/roles.guard';
import { CsrfGuard } from '../common/decorators/csrf.guard';
import type { ClientSegment, InactiveBucket } from './client-segment';
import { ClientsService } from './clients.service';

const SEGMENTS = ['new', 'frequent', 'vip', 'inactive', 'at_risk'] as const;
const INACTIVE_DAYS = [30, 60, 90] as const;

class ListClientsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @ApiPropertyOptional({
    enum: SEGMENTS,
    description:
      'Filtro de segmento resolvido no tenant (groupBy COMPLETED) antes da paginação — total/páginas corretos',
  })
  @IsOptional()
  @IsIn(SEGMENTS)
  segment?: ClientSegment;

  @ApiPropertyOptional({
    enum: INACTIVE_DAYS,
    description: 'Clientes inativos há pelo menos N dias (campanhas; respeitar marketingOptIn)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsIn(INACTIVE_DAYS)
  inactiveDays?: InactiveBucket;
}

class UpdateClientNotesDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

class UpdateClientConsentDto {
  @ApiProperty({ description: 'Consentimento marketing/lembretes (LGPD)' })
  @IsBoolean()
  marketingOptIn!: boolean;
}

class UpdateClientProfileDto {
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];

  @ApiPropertyOptional({ description: 'YYYY-MM-DD; omitir ou string vazia para limpar' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsDateString()
  birthday?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}

@ApiTags('clients')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
@Controller('clients')
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListClientsQueryDto) {
    return this.clients.list(user.tenantId, query.search, query.page, query.pageSize, {
      segment: query.segment,
      inactiveDays: query.inactiveDays,
      actor: { userId: user.userId, role: user.role },
    });
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.clients.detail(user.tenantId, id, {
      actor: { userId: user.userId, role: user.role },
    });
  }

  /** CRM writes (notas / LGPD consent / perfil) — só OWNER */
  @Patch(':id/notes')
  @Roles(UserRole.OWNER)
  updateNotes(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateClientNotesDto,
  ) {
    return this.clients.updateNotes(user.tenantId, id, dto.notes ?? null);
  }

  @Patch(':id/consent')
  @Roles(UserRole.OWNER)
  updateConsent(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateClientConsentDto,
  ) {
    return this.clients.updateMarketingConsent(user.tenantId, id, dto.marketingOptIn);
  }

  @Patch(':id/profile')
  @Roles(UserRole.OWNER)
  updateProfile(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateClientProfileDto,
  ) {
    return this.clients.updateProfile(user.tenantId, id, {
      tags: dto.tags,
      birthday:
        dto.birthday === undefined
          ? undefined
          : dto.birthday === null || dto.birthday === ''
            ? null
            : new Date(dto.birthday),
      notes: dto.notes,
    });
  }
}
