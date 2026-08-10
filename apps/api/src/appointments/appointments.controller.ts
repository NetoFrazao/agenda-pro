import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/decorators/roles.guard';
import { CsrfGuard } from '../common/decorators/csrf.guard';
import { AppointmentsService } from './appointments.service';
import { ListAppointmentsQueryDto, UpdateAppointmentStatusDto } from './dto/appointment.dto';

@ApiTags('appointments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListAppointmentsQueryDto) {
    return this.appointments.list(user.tenantId, {
      from: query.from,
      to: query.to,
      professionalId: query.professionalId,
      page: query.page,
      pageSize: query.pageSize,
      actor: { userId: user.userId, role: user.role },
    });
  }

  /** Staff (OWNER/MEMBER) pode operar status; FSM + gate PIX bloqueiam furo de sinal. */
  @Patch(':id/status')
  @Roles(UserRole.OWNER, UserRole.MEMBER)
  updateStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateAppointmentStatusDto,
  ) {
    return this.appointments.updateStatus(user.tenantId, id, dto.status);
  }
}
