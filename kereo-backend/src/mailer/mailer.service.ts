import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';

@Injectable()
export class MailerService {
  private transporter: Transporter | null = null;

  constructor(private readonly configService: ConfigService) {}

  async sendEmailVerificationEmail(input: {
    to: string;
    verificationUrl: string;
  }) {
    const fromEmail = this.configService.get<string>('SMTP_FROM_EMAIL');

    if (!fromEmail) {
      throw new InternalServerErrorException(
        'SMTP_FROM_EMAIL is not configured',
      );
    }

    const fromName = this.configService.get<string>('SMTP_FROM_NAME');

    await this.getTransporter().sendMail({
      from: fromName ? `${fromName} <${fromEmail}>` : fromEmail,
      to: input.to,
      subject: 'Verify your Kereo email',
      text: `Verify your email for Kereo by opening this link: ${input.verificationUrl}`,
      html: `<p>Verify your email for <strong>Kereo</strong> by opening this link:</p><p><a href="${input.verificationUrl}">${input.verificationUrl}</a></p>`,
    });
  }

  private getTransporter() {
    if (this.transporter) {
      return this.transporter;
    }

    const host = this.configService.get<string>('SMTP_HOST');
    const port = parseInt(
      this.configService.get<string>('SMTP_PORT') || '587',
      10,
    );
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASSWORD');

    if (!host || !user || !pass) {
      throw new InternalServerErrorException(
        'SMTP configuration is incomplete',
      );
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: {
        user,
        pass,
      },
    });

    return this.transporter;
  }
}
