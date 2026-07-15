import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { getJwtSecret } from '../config/environment';

export interface JwtPayload {
  sub: string;
  roles?: unknown;
}

export interface AuthenticatedUser {
  subject: string;
  roles: string[];
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      algorithms: ['HS256'],
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (request: { cookies?: { access_token?: string } }) =>
          request.cookies?.access_token ?? null,
      ]),
      ignoreExpiration: false,
      secretOrKey: getJwtSecret(),
    });
  }

  validate(payload: JwtPayload): AuthenticatedUser {
    if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
      throw new UnauthorizedException();
    }

    return {
      subject: payload.sub,
      roles: Array.isArray(payload.roles)
        ? payload.roles.filter(
            (role): role is string => typeof role === 'string',
          )
        : [],
    };
  }
}
