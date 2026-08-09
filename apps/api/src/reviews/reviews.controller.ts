import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';
import { NotFoundException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';

class UpdateReviewDto {
  @ApiProperty({ description: 'Exibir/ocultar na página pública' })
  @IsBoolean()
  isPublished!: boolean;
}

@ApiTags('reviews')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.prisma.review.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
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
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateReviewDto,
  ) {
    const review = await this.prisma.review.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!review) throw new NotFoundException('Avaliação não encontrada');
    return this.prisma.review.update({
      where: { id },
      data: { isPublished: dto.isPublished },
    });
  }
}
