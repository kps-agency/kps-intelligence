import { ValidationPipe, type INestApplication } from "@nestjs/common";

// Configuration HTTP partagée par main.ts et par les tests d'intégration :
// une seule définition, pour que les tests exercent exactement le
// comportement de production (préfixe, validation stricte des DTO).
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix("api/v1", { exclude: ["health"] });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
}
