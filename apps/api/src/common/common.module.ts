import { Global, Module } from '@nestjs/common';
import { RedisCacheService } from './cache/redis-cache.service';
import { RolesGuard } from './decorators/roles.guard';

@Global()
@Module({
  providers: [RolesGuard, RedisCacheService],
  exports: [RolesGuard, RedisCacheService],
})
export class CommonModule {}
