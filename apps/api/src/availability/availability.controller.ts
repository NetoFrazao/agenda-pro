import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { CsrfGuard } from '../common/decorators/csrf.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/decorators/roles.guard';
import { AvailabilityService } from './availability.service';
import { CreateAvailabilityExceptionDto, CreateAvailabilityRuleDto } from './dto/availability.dto';

@ApiTags('availability')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
@Controller('availability')
export class AvailabilityController {
  constructor(private readonly availability: AvailabilityService) {}

  @Get('rules')
  list(@CurrentUser() user: AuthUser) {
    return this.availability.listRules(user.tenantId);
  }

  @Post('rules')
  @Roles(UserRole.OWNER)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateAvailabilityRuleDto) {
    return this.availability.createRule(user.tenantId, user.userId, dto);
  }

  @Delete('rules/:id')
  @Roles(UserRole.OWNER)
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.availability.deleteRule(user.tenantId, id);
  }

  @Get('exceptions')
  listExceptions(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.availability.listExceptions(user.tenantId, from, to);
  }

  @Post('exceptions')
  @Roles(UserRole.OWNER)
  createException(@CurrentUser() user: AuthUser, @Body() dto: CreateAvailabilityExceptionDto) {
    return this.availability.createException(user.tenantId, dto);
  }

  @Delete('exceptions/:id')
  @Roles(UserRole.OWNER)
  removeException(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.availability.deleteException(user.tenantId, id);
  }
}
