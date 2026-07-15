import { DynamicModule, Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { getJwtSecret } from '../config/environment';
import { getMongoUri } from '../mongo/mongo.config';
import { AuthController } from './auth.controller';
import { JwtAuthGuard } from './jwt-auth.guard';
import { JwtStrategy } from './jwt.strategy';
import { RolesGuard } from './roles.guard';
import { AuthService } from './auth.service';
import {
  accountSchema,
  ACCOUNT_MODEL,
  emailActionTokenSchema,
  EMAIL_ACTION_TOKEN_MODEL,
  localCredentialSchema,
  LOCAL_CREDENTIAL_MODEL,
  refreshSessionSchema,
  REFRESH_SESSION_MODEL,
} from './auth.schema';

@Global()
@Module({})
export class AuthModule {
  static register(): DynamicModule {
    const imports = [
      PassportModule,
      JwtModule.register({
        secret: getJwtSecret(),
        signOptions: { algorithm: 'HS256', expiresIn: '15m' },
      }),
    ];
    const providers = [JwtStrategy, JwtAuthGuard, RolesGuard];
    const exports = [JwtAuthGuard, RolesGuard];

    if (!getMongoUri()) {
      return { module: AuthModule, imports, providers, exports };
    }

    return {
      module: AuthModule,
      imports: [
        ...imports,
        MongooseModule.forFeature([
          { name: ACCOUNT_MODEL, schema: accountSchema },
          { name: LOCAL_CREDENTIAL_MODEL, schema: localCredentialSchema },
          { name: REFRESH_SESSION_MODEL, schema: refreshSessionSchema },
          { name: EMAIL_ACTION_TOKEN_MODEL, schema: emailActionTokenSchema },
        ]),
      ],
      controllers: [AuthController],
      providers: [...providers, AuthService],
      exports,
    };
  }
}
