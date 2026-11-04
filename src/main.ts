import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import type { EnvironmentVariables } from './config/environment.js';
import { WEB_DIST_DIR } from './export/web-assets.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const configService = app.get(ConfigService<EnvironmentVariables, true>);

  // Static JS/CSS of the admin page; they contain no data. The page itself
  // (/export-excel) and its API are served by ExcelExportController.
  app.useStaticAssets(WEB_DIST_DIR, {
    prefix: '/export-excel/',
    index: false,
    redirect: false,
  });
  app.enableShutdownHooks();
  await app.listen(configService.get('PORT', { infer: true }));
}
await bootstrap();
