import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateAvailabilityRuleDto {
  @ApiProperty({ description: '0=Dom ... 6=Sáb', example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number;

  @ApiProperty({ example: 540, description: 'Minutos desde meia-noite local' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(24 * 60 - 1)
  startMinute!: number;

  @ApiProperty({ example: 1080 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24 * 60)
  endMinute!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  professionalId?: string;
}

export class CreateAvailabilityExceptionDto {
  @ApiProperty({ description: 'Data civil YYYY-MM-DD no fuso do estabelecimento' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;

  @ApiPropertyOptional({
    description: 'false = dia bloqueado (folga/feriado); true = janela especial',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;

  @ApiPropertyOptional({ example: 540 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(24 * 60 - 1)
  startMinute?: number;

  @ApiPropertyOptional({ example: 780 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24 * 60)
  endMinute?: number;

  @ApiPropertyOptional({ example: 'Feriado' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  professionalId?: string;
}
