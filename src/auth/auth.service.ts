import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'crypto';
import { Model, Types } from 'mongoose';
import { Resend } from 'resend';
import { getAuthConfig } from '../config/environment';
import { SOURCE_WRITER_ROLE } from './auth.constants';
import {
  Account,
  ACCOUNT_MODEL,
  EmailActionToken,
  EMAIL_ACTION_TOKEN_MODEL,
  LocalCredential,
  LOCAL_CREDENTIAL_MODEL,
  RefreshSession,
  REFRESH_SESSION_MODEL,
} from './auth.schema';

const scrypt = (password: string, salt: string): Promise<Buffer> =>
  new Promise((resolve, reject) =>
    scryptCallback(password, salt, 64, (error, key) =>
      error ? reject(error) : resolve(key),
    ),
  );
const digest = (value: string): string =>
  createHash('sha256').update(value).digest('hex');
const opaqueToken = (): string => randomBytes(32).toString('base64url');
const genericLoginError = () =>
  new UnauthorizedException('Invalid email or password.');

@Injectable()
export class AuthService {
  private readonly config = getAuthConfig();
  private readonly resend = new Resend(this.config.resendApiKey);

  constructor(
    @InjectModel(ACCOUNT_MODEL) private readonly accounts: Model<Account>,
    @InjectModel(LOCAL_CREDENTIAL_MODEL)
    private readonly credentials: Model<LocalCredential>,
    @InjectModel(REFRESH_SESSION_MODEL)
    private readonly sessions: Model<RefreshSession>,
    @InjectModel(EMAIL_ACTION_TOKEN_MODEL)
    private readonly actionTokens: Model<EmailActionToken>,
    private readonly jwt: JwtService,
  ) {}

  async register(email: string, password: string) {
    const normalizedEmail = email.trim().toLowerCase();
    if (await this.accounts.exists({ email: normalizedEmail })) {
      throw new ConflictException('Unable to register this email.');
    }
    const account = await this.accounts.create({
      email: normalizedEmail,
      identities: [{ provider: 'local', subject: normalizedEmail }],
      roles: [SOURCE_WRITER_ROLE],
    });
    const salt = randomBytes(16).toString('base64url');
    await this.credentials.create({
      accountId: account._id,
      salt,
      passwordHash: (await scrypt(password, salt)).toString('base64url'),
    });
    await this.sendAction(account._id, normalizedEmail, 'verify_email');
    return this.issue(account);
  }

  async login(email: string, password: string) {
    const account = await this.accounts.findOne({
      email: email.trim().toLowerCase(),
    });
    if (!account) throw genericLoginError();
    const credential = await this.credentials.findOne({
      accountId: account._id,
    });
    const expected = credential
      ? Buffer.from(credential.passwordHash, 'base64url')
      : undefined;
    const actual = credential
      ? await scrypt(password, credential.salt)
      : undefined;
    if (
      !expected ||
      !actual ||
      expected.length !== actual.length ||
      !timingSafeEqual(expected, actual)
    ) {
      throw genericLoginError();
    }
    return this.issue(account);
  }

  async refresh(refreshToken: string) {
    const session = await this.sessions.findOne({
      tokenHash: digest(refreshToken),
      revokedAt: { $exists: false },
      expiresAt: { $gt: new Date() },
    });
    if (!session) throw new UnauthorizedException();
    const account = await this.accounts.findById(session.accountId);
    if (!account) throw new UnauthorizedException();
    const next = opaqueToken();
    const update = await this.sessions.updateOne(
      { _id: session._id, revokedAt: { $exists: false } },
      { $set: { revokedAt: new Date(), replacedByHash: digest(next) } },
    );
    if (update.modifiedCount !== 1) throw new UnauthorizedException();
    return this.issue(account, next);
  }

  async logout(refreshToken: string): Promise<void> {
    await this.sessions.updateOne(
      { tokenHash: digest(refreshToken), revokedAt: { $exists: false } },
      { $set: { revokedAt: new Date() } },
    );
  }

  async requestPasswordReset(email: string): Promise<void> {
    const account = await this.accounts.findOne({
      email: email.trim().toLowerCase(),
    });
    if (account)
      await this.sendAction(account._id, account.email, 'reset_password');
  }

  async verifyEmail(token: string): Promise<void> {
    await this.consumeAction(token, 'verify_email', async (accountId) => {
      await this.accounts.updateOne(
        { _id: accountId },
        { $set: { emailVerifiedAt: new Date() } },
      );
    });
  }
  async resetPassword(token: string, password: string): Promise<void> {
    await this.consumeAction(token, 'reset_password', async (accountId) => {
      const salt = randomBytes(16).toString('base64url');
      await this.credentials.updateOne(
        { accountId },
        {
          $set: {
            salt,
            passwordHash: (await scrypt(password, salt)).toString('base64url'),
          },
        },
      );
      await this.sessions.updateMany(
        { accountId, revokedAt: { $exists: false } },
        { $set: { revokedAt: new Date() } },
      );
    });
  }

  private async issue(
    account: Account & { _id: Types.ObjectId },
    token = opaqueToken(),
  ) {
    await this.sessions.create({
      accountId: account._id,
      tokenHash: digest(token),
      expiresAt: new Date(Date.now() + this.config.refreshTtlMs),
    });
    const roles = account.emailVerifiedAt ? account.roles : [];
    return {
      accessToken: await this.jwt.signAsync({
        sub: account._id.toString(),
        roles,
      }),
      refreshToken: token,
      account: {
        id: account._id.toString(),
        email: account.email,
        emailVerified: Boolean(account.emailVerifiedAt),
        roles,
      },
    };
  }
  private async sendAction(
    accountId: Types.ObjectId,
    email: string,
    purpose: EmailActionToken['purpose'],
  ): Promise<void> {
    const token = opaqueToken();
    const actionToken = await this.actionTokens.create({
      accountId,
      tokenHash: digest(token),
      purpose,
      expiresAt: new Date(Date.now() + this.config.actionTtlMs),
    });
    const url = `${this.config.appUrl}/auth/${purpose === 'verify_email' ? 'verify-email' : 'reset-password'}?token=${encodeURIComponent(token)}`;
    try {
      await this.resend.emails.send({
        from: this.config.resendFrom,
        to: [email],
        subject:
          purpose === 'verify_email'
            ? 'Verify your email'
            : 'Reset your password',
        text: `Use this link: ${url}`,
      });
    } catch {
      await this.actionTokens.deleteOne({ _id: actionToken._id });
    }
  }
  private async consumeAction(
    token: string,
    purpose: EmailActionToken['purpose'],
    action: (accountId: Types.ObjectId) => Promise<void>,
  ) {
    const record = await this.actionTokens.findOne({
      tokenHash: digest(token),
      purpose,
      consumedAt: { $exists: false },
      expiresAt: { $gt: new Date() },
    });
    if (!record) throw new UnauthorizedException('Invalid or expired token.');
    const result = await this.actionTokens.updateOne(
      { _id: record._id, consumedAt: { $exists: false } },
      { $set: { consumedAt: new Date() } },
    );
    if (result.modifiedCount !== 1) {
      throw new UnauthorizedException('Invalid or expired token.');
    }
    await action(record.accountId);
  }
}
