import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AuthModule } from "./modules/auth/auth.module";
import { UsersModule } from "./modules/users/users.module";
import { ThemesModule } from "./modules/themes/themes.module";
import { ProductsModule } from "./modules/products/products.module";
import { KitsModule } from "./modules/kits/kits.module";
import { EventsModule } from "./modules/events/events.module";
import { AvailabilityModule } from "./modules/availability/availability.module";
import { AnalyticsModule } from "./modules/analytics/analytics.module";
import { StorageModule } from "./modules/storage/storage.module";
import { OrdersModule } from "./modules/orders/orders.module";
import { ReservationsModule } from "./modules/reservations/reservations.module";
import { PartnersModule } from "./modules/partners/partners.module";
import { PaymentsModule } from "./modules/payments/payments.module";
import { AiMagicModule } from "./modules/ai-magic/ai-magic.module";
import { LegalModule } from "./modules/legal/legal.module";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Teto geral por IP. Folgado para o uso normal do app (navegar catálogo
    // dispara várias chamadas por tela) e apertado o bastante para não deixar
    // um script varrer a API à vontade. O login tem limite próprio, bem menor.
    ThrottlerModule.forRoot([{ name: "default", ttl: 60_000, limit: 120 }]),
    AuthModule,
    UsersModule,
    ThemesModule,
    ProductsModule,
    KitsModule,
    EventsModule,
    AvailabilityModule,
    AnalyticsModule,
    StorageModule,
    OrdersModule,
    ReservationsModule,
    PartnersModule,
    PaymentsModule,
    AiMagicModule,
    LegalModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
