import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { CsrfGuard } from '../common/decorators/csrf.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/decorators/roles.guard';
import {
  UpdateBookingSettingsDto,
  UpdateLoyaltySettingsDto,
  UpdateProfileSettingsDto,
} from './dto/settings.dto';
import { SettingsService } from './settings.service';

@ApiTags('settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  get(@CurrentUser() user: AuthUser) {
    return this.settings.get(user.tenantId);
  }

  @Patch('profile')
  @Roles(UserRole.OWNER)
  updateProfile(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileSettingsDto) {
    return this.settings.updateProfile(user.tenantId, dto);
  }

  @Patch('booking')
  @Roles(UserRole.OWNER)
  updateBooking(@CurrentUser() user: AuthUser, @Body() dto: UpdateBookingSettingsDto) {
    return this.settings.updateBooking(user.tenantId, dto);
  }

  @Patch('loyalty')
  @Roles(UserRole.OWNER)
  updateLoyalty(@CurrentUser() user: AuthUser, @Body() dto: UpdateLoyaltySettingsDto) {
    return this.settings.updateLoyalty(user.tenantId, dto);
  }
}
