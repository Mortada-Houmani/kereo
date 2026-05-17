import { Body, Controller, Get, Post, Query, Redirect } from '@nestjs/common';

import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('login')
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Post('verify-email')
  verifyEmail(@Body() verifyEmailDto: VerifyEmailDto) {
    return this.authService.verifyEmail(verifyEmailDto.token);
  }

  @Post('resend-verification')
  resendVerification(@Body() resendVerificationDto: ResendVerificationDto) {
    return this.authService.resendVerificationEmail(
      resendVerificationDto.email,
    );
  }

  @Get('github/url')
  getGithubAuthUrl() {
    return this.authService.getGithubAuthUrl();
  }

  @Get('github/callback')
  @Redirect()
  async githubCallback(@Query('code') code?: string) {
    if (!code) {
      return {
        url: '/login?github=error',
      };
    }

    const response = await this.authService.loginWithGithub(code);
    const redirectUrl = new URL(
      '/auth/github/callback',
      process.env.PUBLIC_BASE_URL,
    );
    redirectUrl.searchParams.set('token', response.accessToken);
    redirectUrl.searchParams.set(
      'user',
      Buffer.from(JSON.stringify(response.user)).toString('base64url'),
    );

    return {
      url: redirectUrl.toString(),
    };
  }
}
