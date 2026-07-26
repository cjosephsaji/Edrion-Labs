import { Module } from '@nestjs/common';
import {
  InstitutionAvailableRolesController,
  InstitutionUsersController,
} from './institution-users.controller';
import { InstitutionUsersService } from './institution-users.service';
import { InstitutionUsersRepository } from './institution-users.repository';

@Module({
  controllers: [InstitutionUsersController, InstitutionAvailableRolesController],
  providers: [InstitutionUsersService, InstitutionUsersRepository],
  exports: [InstitutionUsersService],
})
export class InstitutionUsersModule {}
