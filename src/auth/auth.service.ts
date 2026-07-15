import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';

export interface AuthResult {
  token: string;
  user: {
    id: string;
    email: string;
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async register(email: string, password: string): Promise<AuthResult> {
    const existing = await this.usersService.findByEmail(email);

    if (existing) {
      throw new ConflictException('Email is already registered');
    }

    const user = await this.usersService.create(email, password);

    return {
      token: this.generateToken(user.id as string, user.email),
      user: {
        id: user.id as string,
        email: user.email,
      },
    };
  }

  async login(email: string, password: string): Promise<AuthResult> {
    const user = await this.usersService.findByEmail(email);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isValid = await this.usersService.validatePassword(
      password,
      user.password,
    );

    if (!isValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return {
      token: this.generateToken(user.id as string, user.email),
      user: {
        id: user.id as string,
        email: user.email,
      },
    };
  }

  generateToken(userId: string, email: string): string {
    return this.jwtService.sign(
      { sub: userId, email },
      { expiresIn: '7d' },
    );
  }
}
