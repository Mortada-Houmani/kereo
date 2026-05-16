import { Body, Controller, Headers, Post, Req } from '@nestjs/common';
import { Request } from 'express';

import { GithubWebhookService } from './github-webhook.service';

type RawBodyRequest = Request & {
  rawBody?: Buffer;
};

type GithubWebhookPayload = {
  ref?: string;
  after?: string;
  pusher?: {
    name?: string;
  };
  repository?: {
    full_name?: string;
  };
};

@Controller('webhooks')
export class GithubWebhookController {
  constructor(private readonly githubWebhookService: GithubWebhookService) {}

  @Post('github')
  handleGithubWebhook(
    @Headers('x-github-event') event: string | undefined,
    @Headers('x-github-delivery') deliveryId: string | undefined,
    @Headers('x-hub-signature-256') signature: string | undefined,
    @Req() req: RawBodyRequest,
    @Body() payload: GithubWebhookPayload,
  ) {
    return this.githubWebhookService.handleGithubWebhook({
      event,
      deliveryId,
      signature,
      rawBody: req.rawBody,
      payload,
    });
  }
}
