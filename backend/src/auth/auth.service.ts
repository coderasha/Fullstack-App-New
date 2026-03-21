import { Injectable, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { randomBytes, scryptSync, timingSafeEqual, createHmac } from 'node:crypto';
import type { AccessTokenPayload, AuthenticatedUser } from './auth.types';

@Injectable()
export class AuthService {
  private readonly issuer = process.env.JWT_ISSUER ?? 'attendance-api';
  private readonly audience = process.env.JWT_AUDIENCE ?? 'attendance-client';
  private readonly ttlSeconds = Number(process.env.ACCESS_TOKEN_TTL_SECONDS ?? 3600);
  private readonly secret = process.env.JWT_SECRET ?? '';

  constructor() {
    if (this.secret.length < 32) {
      throw new InternalServerErrorException('JWT_SECRET must be at least 32 characters.');
    }
  }

  hashPassword(password: string) {
    const salt = randomBytes(16).toString('hex');
    const derived = scryptSync(password, salt, 64).toString('hex');
    return `scrypt:${salt}:${derived}`;
  }

  verifyPassword(password: string, passwordHash: string) {
    const [algorithm, salt, expectedHash] = passwordHash.split(':');
    if (algorithm !== 'scrypt' || !salt || !expectedHash) {
      return false;
    }

    const candidate = Buffer.from(scryptSync(password, salt, 64).toString('hex'), 'hex');
    const expected = Buffer.from(expectedHash, 'hex');
    return candidate.length === expected.length && timingSafeEqual(candidate, expected);
  }

  signAccessToken(user: AuthenticatedUser) {
    const now = Math.floor(Date.now() / 1000);
    const payload: AccessTokenPayload = {
      ...user,
      iss: this.issuer,
      aud: this.audience,
      iat: now,
      nbf: now,
      exp: now + this.ttlSeconds,
    };

    const encodedHeader = this.base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const encodedPayload = this.base64UrlEncode(JSON.stringify(payload));
    const signature = this.sign(`${encodedHeader}.${encodedPayload}`);

    return {
      accessToken: `${encodedHeader}.${encodedPayload}.${signature}`,
      expiresInSeconds: this.ttlSeconds,
    };
  }

  verifyAccessToken(token: string) {
    const [encodedHeader, encodedPayload, signature] = token.split('.');
    if (!encodedHeader || !encodedPayload || !signature) {
      throw new UnauthorizedException('Invalid bearer token.');
    }

    const expectedSignature = this.sign(`${encodedHeader}.${encodedPayload}`);
    const provided = Buffer.from(signature);
    const expected = Buffer.from(expectedSignature);
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      throw new UnauthorizedException('Invalid bearer token signature.');
    }

    const payload = JSON.parse(this.base64UrlDecode(encodedPayload)) as AccessTokenPayload;
    const now = Math.floor(Date.now() / 1000);

    if (payload.iss !== this.issuer || payload.aud !== this.audience) {
      throw new UnauthorizedException('Invalid token audience or issuer.');
    }

    if (payload.nbf > now || payload.exp <= now) {
      throw new UnauthorizedException('Token expired or not yet active.');
    }

    return payload;
  }

  private sign(value: string) {
    return createHmac('sha256', this.secret).update(value).digest('base64url');
  }

  private base64UrlEncode(value: string) {
    return Buffer.from(value).toString('base64url');
  }

  private base64UrlDecode(value: string) {
    return Buffer.from(value, 'base64url').toString('utf8');
  }
}
