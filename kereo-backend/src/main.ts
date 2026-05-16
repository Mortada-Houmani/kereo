import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
  });

  const expressApp = app.getHttpAdapter().getInstance();

  app.setGlobalPrefix('api');

  expressApp.use((req, res, next) => {
    const origin = req.headers.origin ?? '*';

    res.header('Access-Control-Allow-Origin', origin);
    res.header('Vary', 'Origin');
    res.header(
      'Access-Control-Allow-Methods',
      'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    );
    res.header(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization',
    );

    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }

    next();
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
