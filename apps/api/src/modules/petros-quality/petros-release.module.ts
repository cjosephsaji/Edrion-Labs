import { Module } from '@nestjs/common';
import { PetrosReleaseRepository } from './petros-release.repository';
import { PetrosReleaseService } from './petros-release.service';
@Module({providers:[PetrosReleaseRepository,PetrosReleaseService],exports:[PetrosReleaseService,PetrosReleaseRepository]})
export class PetrosReleaseModule {}
