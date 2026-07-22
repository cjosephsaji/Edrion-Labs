import { Module } from '@nestjs/common';
import { FeatureControlsModule } from '../../feature-controls/feature-controls.module';
import { VisualStudioModule } from '../visual-studio/visual-studio.module';
import { LabHomeController } from './lab-home.controller';
import { LabHomeService } from './lab-home.service';

@Module({
  imports: [FeatureControlsModule, VisualStudioModule],
  controllers: [LabHomeController],
  providers: [LabHomeService],
})
export class LabHomeModule {}
