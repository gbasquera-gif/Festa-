import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AuthModule } from "./modules/auth/auth.module";
import { UsersModule } from "./modules/users/users.module";
import { ThemesModule } from "./modules/themes/themes.module";
import { ProductsModule } from "./modules/products/products.module";
import { KitsModule } from "./modules/kits/kits.module";
import { EventsModule } from "./modules/events/events.module";
import { OrdersModule } from "./modules/orders/orders.module";
import { ReservationsModule } from "./modules/reservations/reservations.module";
import { PartnersModule } from "./modules/partners/partners.module";
import { PaymentsModule } from "./modules/payments/payments.module";
import { AiMagicModule } from "./modules/ai-magic/ai-magic.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AuthModule,
    UsersModule,
    ThemesModule,
    ProductsModule,
    KitsModule,
    EventsModule,
    OrdersModule,
    ReservationsModule,
    PartnersModule,
    PaymentsModule,
    AiMagicModule,
  ],
})
export class AppModule {}
