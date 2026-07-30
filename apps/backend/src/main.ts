import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true });
  app.setGlobalPrefix("api/v1");

  const config = new DocumentBuilder()
    .setTitle("Festaê API")
    .setDescription(
      "API da plataforma Festaê — criação de eventos, catálogo de temas/kits/produtos, orçamento automático e reservas.",
    )
    .setVersion("1.0")
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("api/docs", app, document);

  const port = process.env.PORT ? Number(process.env.PORT) : 3333;
  await app.listen(port);
  console.log(`Festaê API rodando em http://localhost:${port}/api/v1`);
  console.log(`Swagger docs em http://localhost:${port}/api/docs`);
}

bootstrap();
