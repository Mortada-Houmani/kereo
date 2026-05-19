import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
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
    const emailTemplate = this.buildVerificationEmailTemplate({
      verificationUrl: input.verificationUrl,
      fromName: fromName ?? 'Kereo',
    });

    await this.getTransporter().sendMail({
      from: fromName ? `${fromName} <${fromEmail}>` : fromEmail,
      to: input.to,
      subject: 'Verify your Kereo email',
      text: emailTemplate.text,
      html: emailTemplate.html,
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
    const rawPassword = this.configService.get<string>('SMTP_PASSWORD');
    const pass = rawPassword?.replace(/\s+/g, '');
    const secure =
      this.configService.get<string>('SMTP_SECURE') === 'true' || port === 465;

    if (!host || !user || !pass) {
      throw new InternalServerErrorException(
        'SMTP configuration is incomplete',
      );
    }

    this.logger.log(`Creating SMTP transporter for ${host}:${port}`);

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: {
        user,
        pass,
      },
      tls: {
        servername: host,
      },
    });

    return this.transporter;
  }

  private buildVerificationEmailTemplate(input: {
    verificationUrl: string;
    fromName: string;
  }) {
    const productName = input.fromName || 'Kereo';
    const preview = 'Verify your email to start deploying with Kereo.';
    const buttonStyles = [
      'display:inline-block',
      'padding:13px 20px',
      'border-radius:12px',
      'background:#b5ff4d',
      'color:#0d0d0f',
      'text-decoration:none',
      'font-weight:700',
      'letter-spacing:.01em',
    ].join(';');

    return {
      text: [
        `Verify your email for ${productName}.`,
        '',
        'Finish setting up your account by confirming your email address.',
        '',
        `Verify your address: ${input.verificationUrl}`,
        '',
        'If you did not create this account, you can ignore this email.',
      ].join('\n'),
      html: `
        <!doctype html>
        <html>
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <title>Verify your email</title>
          </head>
          <body style="margin:0;padding:24px;background:#0b0b0d;font-family:Inter,Arial,sans-serif;color:#ececf1;">
            <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preview}</div>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
              <tr>
                <td align="center">
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;border-collapse:collapse;">
                    <tr>
                      <td style="padding:0 0 18px 0;">
                        <div style="font-size:14px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#b5ff4d;">${productName}</div>
                      </td>
                    </tr>
                    <tr>
                      <td style="background:#111114;border:1px solid #2e2e42;border-radius:20px;padding:36px 32px;box-shadow:0 18px 54px rgba(0,0,0,.35);">
                        <div style="display:inline-flex;align-items:center;gap:8px;padding:7px 11px;border-radius:999px;background:rgba(181,255,77,.10);border:1px solid rgba(181,255,77,.18);font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#b5ff4d;margin:0 0 18px 0;">
                          Email verification
                        </div>
                        <div style="font-size:32px;line-height:1.15;font-weight:700;color:#ececf1;margin:0 0 14px 0;">
                          Verify your email
                        </div>
                        <div style="font-size:15px;line-height:1.8;color:#a7a7ba;margin:0 0 24px 0;">
                          Finish setting up your Kereo account by confirming your email address. Once verified, you can keep deploying projects, managing infrastructure, and connecting integrations without the extra nags.
                        </div>
                        <div style="margin:0 0 26px 0;">
                          <a href="${input.verificationUrl}" style="${buttonStyles}">Verify email</a>
                        </div>
                        <div style="font-size:13px;line-height:1.7;color:#8888a0;margin:0 0 12px 0;">
                          If the button does not work, copy and open this link:
                        </div>
                        <div style="word-break:break-all;font-size:13px;line-height:1.7;color:#b5ff4d;padding:14px 16px;border-radius:14px;background:#0f0f12;border:1px solid #1f1f2a;">
                          <a href="${input.verificationUrl}" style="color:#b5ff4d;text-decoration:none;">${input.verificationUrl}</a>
                        </div>
                        <div style="margin-top:24px;padding-top:20px;border-top:1px solid #1f1f2a;font-size:13px;line-height:1.8;color:#8888a0;">
                          If you did not create this account, you can safely ignore this email.
                        </div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </body>
        </html>
      `,
    };
  }
}
