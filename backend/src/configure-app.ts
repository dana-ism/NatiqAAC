import { INestApplication, ValidationPipe } from '@nestjs/common';

export function configureApp(app: INestApplication): void {
  const webOrigins = process.env.WEB_CORS_ORIGINS?.trim();
  if (webOrigins) {
    const origins = webOrigins.split(',').map((value) => value.trim());
    for (const origin of origins) {
      try {
        const url = new URL(origin);
        if (
          !['http:', 'https:'].includes(url.protocol) ||
          url.origin !== origin ||
          url.username ||
          url.password
        ) {
          throw new Error();
        }
      } catch {
        throw new Error(
          'WEB_CORS_ORIGINS must contain explicit HTTP(S) origins',
        );
      }
    }
    app.enableCors({
      origin: origins,
      methods: ['GET', 'POST'],
      allowedHeaders: ['Authorization', 'Content-Type'],
      exposedHeaders: ['Retry-After'],
      credentials: false,
    });
  }
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
}
