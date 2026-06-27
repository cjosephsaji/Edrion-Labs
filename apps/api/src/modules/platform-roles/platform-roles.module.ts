import { Module } from '@nestjs/common';
import { PlatformRolesController } from './platform-roles.controller';
import { PlatformRolesService } from './platform-roles.service';
import { PlatformRolesRepository } from './platform-roles.repository';

@Module({
  controllers: [PlatformRolesController],
  providers: [PlatformRolesService, PlatformRolesRepository],
  exports: [PlatformRolesService],
})
export class PlatformRolesModule {}
