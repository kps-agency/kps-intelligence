import "reflect-metadata";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module";
import { configureApp } from "./app.setup";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  const config = app.get(ConfigService);

  app.enableCors({
    origin: config.getOrThrow<string>("APP_URL"),
    exposedHeaders: ["x-request-id"],
  });
  configureApp(app);

  if (config.get<string>("APP_ENV") !== "production") {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle("KPS Intelligence API")
        .setDescription("API REST de KPS Intelligence (voir docs/API.md).")
        .setVersion("0.1.0")
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup("api/docs", app, document);
  }

  const port = process.env.API_PORT ? Number(process.env.API_PORT) : 4000;
  await app.listen(port);
}

bootstrap();
