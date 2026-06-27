import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';

/** Global so the rate-limit guard, idempotency service and queues can inject one Redis client. */
@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
