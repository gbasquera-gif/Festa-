import { Injectable } from "@nestjs/common";
import { prisma } from "@festae/database";

/**
 * MVP não integra um gateway de pagamento real — a reserva é apenas
 * solicitada e confirmada manualmente pela operação. Este serviço existe
 * para já ter o modelo de dados e o ponto de extensão prontos quando
 * Pix/cartão forem integrados.
 */
@Injectable()
export class PaymentsService {
  findByOrder(orderId: string) {
    return prisma.payment.findMany({ where: { orderId }, orderBy: { createdAt: "desc" } });
  }
}
