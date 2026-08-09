import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

/** Step-up: reconfirma senha do OWNER antes de export/delete LGPD. */
export class AccountStepUpDto {
  @ApiProperty({ description: 'Senha atual do OWNER (reautenticação)' })
  @IsString()
  @MinLength(8)
  password!: string;
}
