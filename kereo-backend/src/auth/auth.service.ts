import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';

import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { MailerService } from '../mailer/mailer.service';
import { GithubService } from '../github/github.service';
import { User } from '../users/entities/user.entity';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly mailerService: MailerService,
    private readonly githubService: GithubService,
  ) {}

  async register(registerDto: RegisterDto) {
    if (registerDto.password !== registerDto.confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    const existingUser = await this.usersService.findByEmail(registerDto.email);
    if (existingUser) {
      throw new BadRequestException('User already exists');
    }
    const hashedPassword = await bcrypt.hash(registerDto.password, 10);
    const verification = this.createEmailVerificationToken();
    const user = await this.usersService.create({
      email: registerDto.email,
      password: hashedPassword,
      isEmailVerified: false,
      emailVerificationTokenHash: verification.tokenHash,
      emailVerificationExpiresAt: verification.expiresAt,
    });

    let verificationEmailSent = false;
    let verificationEmailError: string | null = null;

    try {
      await this.sendVerificationEmail(user.email, verification.rawToken);
      verificationEmailSent = true;
    } catch (error) {
      verificationEmailError =
        error instanceof Error
          ? error.message
          : 'Failed to send verification email';
      this.logger.error(
        `Verification email failed for ${user.email}: ${verificationEmailError}`,
      );
    }

    return this.issueAuthResponse(user, {
      verificationEmailSent,
      verificationEmailError,
    });
  }

  async login(loginDto: LoginDto) {
    const user = await this.usersService.findByEmail(loginDto.email);
    if (!user || !user.password) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      user.password,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.issueAuthResponse(user);
  }

  async verifyEmail(token: string) {
    const tokenHash = this.hashVerificationToken(token);
    const user =
      await this.usersService.findByEmailVerificationTokenHash(tokenHash);

    if (
      !user ||
      !user.emailVerificationExpiresAt ||
      user.emailVerificationExpiresAt.getTime() < Date.now()
    ) {
      throw new BadRequestException('Verification link is invalid or expired');
    }

    user.isEmailVerified = true;
    user.emailVerificationTokenHash = null;
    user.emailVerificationExpiresAt = null;
    await this.usersService.save(user);

    return { success: true };
  }

  async resendVerificationEmail(email: string) {
    const user = await this.usersService.findByEmail(email);

    if (!user || user.isEmailVerified) {
      return { success: true, verificationEmailSent: false };
    }

    const verification = this.createEmailVerificationToken();
    user.emailVerificationTokenHash = verification.tokenHash;
    user.emailVerificationExpiresAt = verification.expiresAt;
    await this.usersService.save(user);
    try {
      await this.sendVerificationEmail(user.email, verification.rawToken);
      return { success: true, verificationEmailSent: true };
    } catch (error) {
      const verificationEmailError =
        error instanceof Error
          ? error.message
          : 'Failed to send verification email';
      this.logger.error(
        `Resend verification email failed for ${user.email}: ${verificationEmailError}`,
      );
      return {
        success: true,
        verificationEmailSent: false,
        verificationEmailError,
      };
    }
  }

  getGithubAuthUrl() {
    return { url: this.githubService.getUserAuthUrl() };
  }

  async loginWithGithub(code: string) {
    const githubIdentity = await this.githubService.authenticateUser(code);

    let user =
      (await this.usersService.findByGithubUserId(
        githubIdentity.githubUserId,
      )) ?? null;

    if (!user) {
      user = await this.usersService.findByEmail(githubIdentity.email);
    }

    if (user) {
      user.githubUserId = githubIdentity.githubUserId;
      user.githubLogin = githubIdentity.githubLogin;
      user.githubAvatarUrl = githubIdentity.githubAvatarUrl;
      user.githubAccessToken = githubIdentity.githubAccessToken;
      user.isEmailVerified =
        user.isEmailVerified || githubIdentity.emailVerified;
      await this.usersService.save(user);
    } else {
      user = await this.usersService.create({
        email: githubIdentity.email,
        password: null,
        isEmailVerified: githubIdentity.emailVerified,
        githubUserId: githubIdentity.githubUserId,
        githubLogin: githubIdentity.githubLogin,
        githubAvatarUrl: githubIdentity.githubAvatarUrl,
        githubAccessToken: githubIdentity.githubAccessToken,
      });
    }

    return this.issueAuthResponse(user);
  }

  private issueAuthResponse(
    user: User,
    options?: {
      verificationEmailSent?: boolean;
      verificationEmailError?: string | null;
    },
  ) {
    const payload = { sub: user.id, email: user.email };
    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        isEmailVerified: user.isEmailVerified,
        githubLogin: user.githubLogin,
        githubAvatarUrl: user.githubAvatarUrl,
      },
      verificationEmailSent:
        options?.verificationEmailSent ?? user.isEmailVerified,
      verificationEmailError: options?.verificationEmailError ?? null,
    };
  }

  private createEmailVerificationToken() {
    const rawToken = randomBytes(32).toString('hex');

    return {
      rawToken,
      tokenHash: this.hashVerificationToken(rawToken),
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
    };
  }

  private hashVerificationToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private async sendVerificationEmail(email: string, token: string) {
    const publicBaseUrl =
      this.configService.get<string>('PUBLIC_BASE_URL') ??
      'http://localhost:5173';
    const verificationUrl = `${publicBaseUrl.replace(/\/+$/g, '')}/auth/verify-email?token=${encodeURIComponent(token)}`;

    try {
      await this.mailerService.sendEmailVerificationEmail({
        to: email,
        verificationUrl,
      });
    } catch (error) {
      throw new InternalServerErrorException(
        error instanceof Error
          ? `Failed to send verification email: ${error.message}`
          : 'Failed to send verification email',
      );
    }
  }
}
