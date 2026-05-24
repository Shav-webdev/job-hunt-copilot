import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import * as path from 'path';
import { AppModule } from './app.module';

async function runMigrations() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  const db = drizzle(pool);
  await migrate(db, { migrationsFolder: path.join(__dirname, '..', '..', 'drizzle') });
  await pool.end();
}

async function bootstrap() {
  if (process.env.RUN_MIGRATIONS_ON_BOOT === 'true') {
    console.log('Running DB migrations…');
    await runMigrations();
    console.log('Migrations complete.');
  }

  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: [
      process.env.WEB_URL ?? 'http://localhost:3001',
      /\.vercel\.app$/,
    ],
    credentials: true,
  });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const doc = new DocumentBuilder()
    .setTitle('Job Hunt Copilot API')
    .setDescription('REST API for the Job Hunt Copilot application')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, doc));

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
