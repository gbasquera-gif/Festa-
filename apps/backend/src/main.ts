import "reflect-metadata";
import { RequestMethod } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { PrismaExceptionFilter } from "./common/prisma-exception.filter";
import { UPLOADS_ROOT } from "./modules/storage/local-disk-storage.service";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { cors: true });

  // A hospedagem termina o TLS antes de chegar aqui. Sem confiar no proxy, o
  // Express enxerga todo mundo com o mesmo IP interno — e o rate limiting por
  // IP protegeria contra ninguém.
  app.set("trust proxy", 1);

  app.use(
    helmet({
      // As páginas legais são servidas por este mesmo processo e usam CSS
      // embutido; a política padrão do helmet bloquearia o estilo.
      contentSecurityPolicy: {
        directives: { defaultSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"] },
      },
      // Diz ao navegador para só voltar por HTTPS. Não substitui o TLS do
      // provedor, mas fecha a janela de um primeiro acesso em texto claro.
      hsts: { maxAge: 60 * 60 * 24 * 180, includeSubDomains: true },
      // A API é consumida por app e painel em outro domínio.
      crossOriginResourcePolicy: { policy: "cross-origin" },
    }),
  );

  // Erro de banco vira resposta legível em vez de "Internal server error".
  app.useGlobalFilters(new PrismaExceptionFilter());

  app.useStaticAssets(UPLOADS_ROOT, { prefix: "/uploads" });

  // As páginas legais ficam fora do prefixo da API: elas são endereço para
  // pessoa ler e para as lojas conferirem, não endpoint.
  app.setGlobalPrefix("api/v1", {
    exclude: [
      { path: "legal/:slug", method: RequestMethod.GET },
      { path: "legal/:slug/json", method: RequestMethod.GET },
    ],
  });

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
