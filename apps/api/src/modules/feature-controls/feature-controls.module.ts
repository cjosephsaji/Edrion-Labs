import { Module } from '@nestjs/common';
import { FeatureControlsController } from './feature-controls.controller';
import { FeatureControlsService } from './feature-controls.service';
import { FeatureControlsRepository } from './feature-controls.repository';

@Module({
  controllers: [FeatureControlsController],
  providers: [FeatureControlsService, FeatureControlsRepository],
  exports: [FeatureControlsService, FeatureControlsRepository],
})
export class FeatureControlsModule {}
