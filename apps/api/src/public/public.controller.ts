import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AppointmentsService } from '../appointments/appointments.service';
import {
  BookPublicDto,
  CancelByTokenDto,
  JoinWaitlistDto,
  PublicReviewDto,
  RescheduleDto,
} from '../appointments/dto/appointment.dto';
import { WaitlistService } from '../waitlist/waitlist.service';

@ApiTags('public')
@Controller('public')
export class PublicController {
  constructor(
    private readonly appointments: AppointmentsService,
    private readonly waitlist: WaitlistService,
  ) {}

  // ---- Auto-gestão do cliente (link do agendamento, sem login) ----
  // Rotas fixas antes de :slug para não haver colisão de rota.

  @Get('appointments/:token')
  @ApiOperation({ summary: 'Detalhe do agendamento via link do cliente' })
  manageDetail(@Param('token') token: string) {
    return this.appointments.getByManageToken(token);
  }

  @Post('appointments/:token/confirm')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Cliente confirma presença' })
  confirm(@Param('token') token: string) {
    return this.appointments.confirmByToken(token);
  }

  @Post('appointments/:token/cancel')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Cliente cancela (respeitando prazo do estabelecimento)' })
  cancel(@Param('token') token: string, @Body() dto: CancelByTokenDto) {
    return this.appointments.cancelByToken(token, dto.reason);
  }

  @Post('appointments/:token/reschedule')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Cliente remarca para um novo horário' })
  reschedule(@Param('token') token: string, @Body() dto: RescheduleDto) {
    return this.appointments.rescheduleByToken(token, dto);
  }

  @Post('appointments/:token/review')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Cliente avalia o atendimento concluído' })
  review(@Param('token') token: string, @Body() dto: PublicReviewDto) {
    return this.appointments.reviewByToken(token, dto);
  }

  // ---- Página pública do estabelecimento ----

  @Get(':slug')
  @ApiOperation({ summary: 'Perfil público + serviços + profissionais + avaliações' })
  profile(@Param('slug') slug: string) {
    return this.appointments.getPublicProfile(slug);
  }

  @Get(':slug/slots')
  @ApiOperation({ summary: 'Slots disponíveis (UTC ISO)' })
  slots(
    @Param('slug') slug: string,
    @Query('serviceId') serviceId: string,
    @Query('date') date: string,
    @Query('professionalId') professionalId?: string,
  ) {
    return this.appointments.getPublicSlots(slug, serviceId, date, professionalId);
  }

  @Post(':slug/book')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Criar agendamento público (rate limited)' })
  book(@Param('slug') slug: string, @Body() dto: BookPublicDto) {
    return this.appointments.bookPublic(slug, dto);
  }

  @Post(':slug/waitlist')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Entrar na lista de espera de um dia lotado' })
  joinWaitlist(@Param('slug') slug: string, @Body() dto: JoinWaitlistDto) {
    return this.waitlist.joinPublic(slug, dto);
  }
}
