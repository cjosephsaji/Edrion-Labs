import { Module } from '@nestjs/common';
import { IndependentUsersController } from './independent-users.controller';
import { IndependentUsersService } from './independent-users.service';
import { IndependentUsersRepository } from './independent-users.repository';

@Module({
  controllers: [IndependentUsersController],
  providers: [IndependentUsersService, IndependentUsersRepository],
  exports: [IndependentUsersService],
})
export class IndependentUsersModule {}
