import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { AvailabilityService } from './availability.service';
import { CreateAvailabilityRuleDto } from './dto/availability.dto';

@ApiTags('availability')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('availability')
export class AvailabilityController {
  constructor(private readonly availability: AvailabilityService) {}

  @Get('rules')
  list(@CurrentUser() user: AuthUser) {
    return this.availability.listRules(user.tenantId);
  }

  @Post('rules')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateAvailabilityRuleDto) {
    return this.availability.createRule(user.tenantId, user.userId, dto);
  }

  @Delete('rules/:id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.availability.deleteRule(user.tenantId, id);
  }
}
