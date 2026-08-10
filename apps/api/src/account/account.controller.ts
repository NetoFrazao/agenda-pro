import { Body, Controller, Delete, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { CsrfGuard } from '../common/decorators/csrf.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/decorators/roles.guard';
import { AccountService } from './account.service';
import { AccountStepUpDto } from './dto/account.dto';

@ApiTags('account')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
@Controller('account')
export class AccountController {
  constructor(private readonly account: AccountService) {}

  @Post('export')
  @Roles(UserRole.OWNER)
  @ApiOperation({
    summary: 'Exporta dados do estabelecimento (portabilidade LGPD) — OWNER + senha (step-up)',
  })
  export(@CurrentUser() user: AuthUser, @Body() dto: AccountStepUpDto) {
    return this.account.exportData(user.tenantId, user.userId, dto.password);
  }

  @Delete()
  @Roles(UserRole.OWNER)
  @ApiOperation({
    summary:
      'Encerra conta com anonimização LGPD — OWNER + senha (step-up); retém trilha financeira mínima',
  })
  delete(@CurrentUser() user: AuthUser, @Body() dto: AccountStepUpDto) {
    return this.account.deleteAccount(user.tenantId, user.userId, dto.password);
  }
}
