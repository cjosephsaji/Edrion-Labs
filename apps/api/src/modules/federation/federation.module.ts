import { Module, forwardRef } from '@nestjs/common';
import { PortalModule } from '../portal/portal.module';
import { FederationService } from './federation.service';
import { PortalFederationController } from './portal-federation.controller';
import { PortalAuthOidcController } from './portal-auth-oidc.controller';
import { PortalAuthSamlController } from './portal-auth-saml.controller';

@Module({
  imports: [forwardRef(() => PortalModule)],
  controllers: [PortalFederationController, PortalAuthOidcController, PortalAuthSamlController],
  providers: [FederationService],
  exports: [FederationService],
})
export class FederationModule {}
