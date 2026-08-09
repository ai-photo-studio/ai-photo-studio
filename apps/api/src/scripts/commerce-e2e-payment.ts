import { PrismaClient } from "@prisma/client";
import { applyVerifiedPaymentEvidence } from "../services/p4a-payment-verified-execution-queue.service";

if (process.env.NODE_ENV === "production") throw new Error("COMMERCE_E2E_TEST_MODE is unavailable in production");
if (process.env.COMMERCE_E2E_TEST_MODE !== "true") throw new Error("set COMMERCE_E2E_TEST_MODE=true explicitly");
if (process.env.RESTORATION_PROVIDER !== "mock") throw new Error("set RESTORATION_PROVIDER=mock for zero-cost E2E");

export async function verifyTestPayment(attemptId: string, orderId: string, amountMinor: string, currency: "PKR" | "USD") {
  const prisma = new PrismaClient();
  try {
    const attempt = await prisma.paymentAttempt.findUniqueOrThrow({ where: { id: attemptId } });
    const order = await prisma.fixedOrder.findUniqueOrThrow({ where: { id: orderId } });
    if (attempt.fixedOrderId !== order.id || attempt.amountMinor.toString() !== amountMinor || attempt.currency !== currency) throw new Error("test payment evidence does not match server order");
    const providerEventId = `commerce-e2e:${attempt.id}`;
    const providerRef = `commerce-e2e:${attempt.id}`;
    const dedupeHash = `commerce-e2e:${attempt.id}:${amountMinor}:${currency}`;
    return applyVerifiedPaymentEvidence({
      fixedOrderId: orderId,
      paymentAttemptId: attemptId,
      provider: "commerce-e2e-test",
      providerEventId,
      providerRef,
      amountMinor: BigInt(amountMinor),
      currency,
      dedupeHash
    });
  } finally { await prisma.$disconnect(); }
}

if (require.main === module) {
  const [attemptId, orderId, amountMinor, currency] = process.argv.slice(2);
  if (!attemptId || !orderId || !amountMinor || (currency !== "PKR" && currency !== "USD")) throw new Error("usage: commerce-e2e-payment <attemptId> <orderId> <amountMinor> <PKR|USD>");
  verifyTestPayment(attemptId, orderId, amountMinor, currency).then((result) => { console.log(JSON.stringify({ ...result, testMode: true, realCharge: false })); }).catch((error) => { console.error(error); process.exitCode = 1; });
}
