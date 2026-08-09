import { Controller, Delete, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/decorators/roles.guard';
import { AccountService } from './account.service';

@ApiTags('account')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('account')
export class AccountController {
  constructor(private readonly account: AccountService) {}

  @Get('export')
  @Roles(UserRole.OWNER)
  @ApiOperation({
    summary: 'Exporta dados do estabelecimento (portabilidade LGPD) — somente OWNER',
  })
  export(@CurrentUser() user: AuthUser) {
    return this.account.exportData(user.tenantId);
  }

  @Delete()
  @Roles(UserRole.OWNER)
  @ApiOperation({
    summary: 'Encerra conta com anonimização LGPD (retém trilha financeira mínima) — somente OWNER',
  })
  delete(@CurrentUser() user: AuthUser) {
    return this.account.deleteAccount(user.tenantId, user.userId);
  }
}
