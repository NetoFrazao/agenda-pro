import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AppointmentStatus } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateAppointmentStatusDto {
  @ApiProperty({ enum: AppointmentStatus })
  @IsEnum(AppointmentStatus)
  status!: AppointmentStatus;
}

export class ListAppointmentsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  to?: string;

  @ApiPropertyOptional({ description: 'Filtra pela agenda de um profissional' })
  @IsOptional()
  @IsString()
  professionalId?: string;
}

export class BookPublicDto {
  @ApiProperty()
  @IsString()
  serviceId!: string;

  @ApiPropertyOptional({ description: 'Profissional escolhido (default: dono da conta)' })
  @IsOptional()
  @IsString()
  professionalId?: string;

  @ApiProperty({ description: 'Início em ISO UTC' })
  @IsISO8601()
  startsAt!: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  clientName!: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  @MaxLength(32)
  clientPhone!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  clientEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class RescheduleDto {
  @ApiProperty({ description: 'Novo início em ISO UTC' })
  @IsISO8601()
  startsAt!: string;
}

export class CancelByTokenDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;
}

export class PublicReviewDto {
  @ApiProperty({ minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}

export class JoinWaitlistDto {
  @ApiProperty({ description: 'Data desejada (YYYY-MM-DD no fuso do estabelecimento)' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dateKey!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  serviceId?: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  clientName!: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  @MaxLength(32)
  clientPhone!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  clientEmail?: string;
}
