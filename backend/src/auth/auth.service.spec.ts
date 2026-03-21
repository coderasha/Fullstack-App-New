import { AuthService } from './auth.service';

describe('AuthService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      JWT_SECRET: '12345678901234567890123456789012',
      JWT_ISSUER: 'attendance-api-test',
      JWT_AUDIENCE: 'attendance-client-test',
      ACCESS_TOKEN_TTL_SECONDS: '3600',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('hashes and verifies passwords', () => {
    const service = new AuthService();
    const hash = service.hashPassword('strong-password');

    expect(service.verifyPassword('strong-password', hash)).toBe(true);
    expect(service.verifyPassword('wrong-password', hash)).toBe(false);
  });

  it('signs and verifies access tokens', () => {
    const service = new AuthService();
    const { accessToken } = service.signAccessToken({
      sub: 'user-1',
      email: 'worker@example.com',
      role: 'WORKER',
      name: 'Worker One',
    });

    const payload = service.verifyAccessToken(accessToken);
    expect(payload.sub).toBe('user-1');
    expect(payload.role).toBe('WORKER');
    expect(payload.email).toBe('worker@example.com');
  });
});
