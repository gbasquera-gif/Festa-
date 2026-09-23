-- CreateEnum
CREATE TYPE "CategoriaDaPerda" AS ENUM ('PRECO', 'DATA_INDISPONIVEL', 'FECHOU_COM_OUTRO', 'DESISTIU', 'SEM_RESPOSTA', 'OUTRO');

-- AlterTable
ALTER TABLE "orcamentos" ADD COLUMN     "canal" "SaleChannel",
ADD COLUMN     "categoriaDaPerda" "CategoriaDaPerda",
ADD COLUMN     "primeiroEnvioEm" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "kitCongeladoEm" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "order_kit_items" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "order_kit_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "order_kit_items_productId_idx" ON "order_kit_items"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "order_kit_items_orderId_productId_key" ON "order_kit_items"("orderId", "productId");

-- AddForeignKey
ALTER TABLE "order_kit_items" ADD CONSTRAINT "order_kit_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_kit_items" ADD CONSTRAINT "order_kit_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
