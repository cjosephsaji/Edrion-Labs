import { Module } from '@nestjs/common';
import { CampusesController } from './campuses.controller';
import { CampusesService } from './campuses.service';
import { CampusesRepository } from './campuses.repository';

@Module({
  controllers: [CampusesController],
  providers: [CampusesService, CampusesRepository],
  exports: [CampusesService],
})
export class CampusesModule {}
