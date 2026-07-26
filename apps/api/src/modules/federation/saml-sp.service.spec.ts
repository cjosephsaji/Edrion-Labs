import { describe, expect, it } from 'vitest';
import { createSamlClient } from './saml-sp.service';

const TEST_CERT = `-----BEGIN CERTIFICATE-----
MIIDDTCCAfWgAwIBAgIUKFakeCertForUnitTestOnly0000000000000000wDQYJKoZIhvcNAQEL
BQAwFjEUMBIGA1UEAwwLRWRyaW9uIFRlc3QwHhcNMjQwMTAxMDAwMDAwWhcNMzQwMTAxMDAw
MDAwWjAWMRQwEgYDVQQDDAtFZHJpb24gVGVzdDCCASIwDQYJKoZIhvcNAQEBBQADggEPADCC
AQoCggEBALFakeKeyMaterialForTestingPurposesOnlyNotARealCertificate0000000000
0000000000000000000000000000000000000000000000000000000000000000000000000000
0000000000000000000000000000000000000000000000000000000000000000000000000000
0000000000000000000000000000000000000000000000000000000000000000000000000000
0wIDAQABo1MwUTAdBgNVHQ4EFgQUFakeFingerprintForTestsOnly0000000000000000wHwYD
VR0jBBgwFoAUFakeFingerprintForTestsOnly0000000000000000wDwYDVR0TAQH/BAUwAwEB
/zANBgkqhkiG9w0BAQsFAAOCAQEAfakeSignatureBlockForUnitTestsOnlyNotValid00000
-----END CERTIFICATE-----`;

describe('createSamlClient', () => {
  it('builds a SAML client', () => {
    expect(() =>
      createSamlClient({
        spEntityId: 'https://api.edrion.test/sp',
        idpEntityId: 'https://idp.example.com',
        ssoUrl: 'https://idp.example.com/sso',
        idpCertificate: TEST_CERT,
        acsUrl: 'https://api.edrion.test/v1/portal/auth/saml/acs',
      }),
    ).not.toThrow();
  });
});
