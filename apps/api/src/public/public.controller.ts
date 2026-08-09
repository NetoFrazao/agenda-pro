import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AppointmentsService } from '../appointments/appointments.service';
import { BookPublicDto } from '../appointments/dto/appointment.dto';

@ApiTags('public')
@Controller('public')
export class PublicController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Get(':slug')
  @ApiOperation({ summary: 'Perfil público + serviços' })
  profile(@Param('slug') slug: string) {
    return this.appointments.getPublicProfile(slug);
  }

  @Get(':slug/slots')
  @ApiOperation({ summary: 'Slots disponíveis (UTC ISO)' })
  slots(
    @Param('slug') slug: string,
    @Query('serviceId') serviceId: string,
    @Query('date') date: string,
  ) {
    return this.appointments.getPublicSlots(slug, serviceId, date);
  }

  @Post(':slug/book')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Criar agendamento público (rate limited)' })
  book(@Param('slug') slug: string, @Body() dto: BookPublicDto) {
    return this.appointments.bookPublic(slug, dto);
  }
}
