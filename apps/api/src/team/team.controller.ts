import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/decorators/roles.guard';
import { CsrfGuard } from '../common/decorators/csrf.guard';
import { CreateTeamMemberDto, UpdateTeamMemberDto } from './dto/team.dto';
import { TeamService } from './team.service';

@ApiTags('team')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
@Controller('team')
export class TeamController {
  constructor(private readonly team: TeamService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.team.list(user.tenantId);
  }

  @Post()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Roles(UserRole.OWNER)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTeamMemberDto) {
    return this.team.create(user.tenantId, user.role, dto);
  }

  @Patch(':id')
  @Roles(UserRole.OWNER)
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateTeamMemberDto) {
    return this.team.update(user.tenantId, user.role, id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.OWNER)
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.team.remove(user.tenantId, user.role, user.userId, id);
  }
}
