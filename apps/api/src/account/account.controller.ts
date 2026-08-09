import { Controller, Delete, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { AccountService } from './account.service';

@ApiTags('account')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('account')
export class AccountController {
  constructor(private readonly account: AccountService) {}

  @Delete()
  @ApiOperation({ summary: 'Exclui conta e dados pessoais (LGPD)' })
  delete(@CurrentUser() user: AuthUser) {
    return this.account.deleteAccount(user.tenantId, user.userId);
  }
}
