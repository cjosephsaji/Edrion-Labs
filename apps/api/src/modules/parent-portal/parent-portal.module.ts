import './parent-portal.types';
import { Module } from '@nestjs/common';
import { PortalModule } from '../portal/portal.module';
import { GuardianScopeGuard } from './guardian-scope.guard';
import { ParentController } from './parent.controller';
import { ParentMeService } from './parent-me.service';

/**
 * Parent Portal module. Reuses the institution-portal auth stack (InstitutionAuthGuard + its session /
 * rate-limit / principal services, exported by PortalModule) and layers GuardianScopeGuard + the
 * parent-facing services on top. Routes live under /v1/parent/*.
 */
@Module({
  imports: [PortalModule],
  controllers: [ParentController],
  providers: [GuardianScopeGuard, ParentMeService],
})
export class ParentPortalModule {}
