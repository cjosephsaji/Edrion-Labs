import { Module } from '@nestjs/common';
import { WebPushChannel } from './parent-portal/notification-channels';
import { TodayNotifyService } from './student/today/today-notify.service';
import { FeatureControlsModule } from './feature-controls/feature-controls.module';

/** Shared domain notification adapter used by Today writers without introducing another queue/channel stack. */
@Module({imports:[FeatureControlsModule],providers:[TodayNotifyService,WebPushChannel],exports:[TodayNotifyService]})
export class TodayNotificationModule{}
