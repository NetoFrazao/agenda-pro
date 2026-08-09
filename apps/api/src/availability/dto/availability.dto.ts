import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

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
