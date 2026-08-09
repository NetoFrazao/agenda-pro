import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { IsBoolean } from 'class-validator';
import { NotFoundException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/decorators/roles.guard';
import { RedisCacheService } from '../common/cache/redis-cache.service';
import { PrismaService } from '../prisma/prisma.service';

class UpdateReviewDto {
  @ApiProperty({ description: 'Exibir/ocultar na página pública' })
  @IsBoolean()
  isPublished!: boolean;
}

@ApiTags('reviews')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('reviews')
export class ReviewsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: RedisCacheService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.prisma.review.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        rating: true,
        comment: true,
        clientName: true,
        isPublished: true,
        createdAt: true,
        appointment: {
          select: {
            startsAt: true,
            service: { select: { name: true } },
            professional: { select: { name: true } },
          },
        },
      },
    });
  }

  @Patch(':id')
  @Roles(UserRole.OWNER)
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateReviewDto,
  ) {
    const review = await this.prisma.review.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!review) throw new NotFoundException('Avaliação não encontrada');
    const updated = await this.prisma.review.update({
      where: { id },
      data: { isPublished: dto.isPublished },
    });
    await this.cache.invalidatePublicProfileByTenantId(user.tenantId, async (tenantId) => {
      const t = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { slug: true },
      });
      return t?.slug ?? null;
    });
    return updated;
  }
}
