import { NextResponse } from "next/server";
import { getFinanceSnapshot } from "@/lib/finance/db-utils";

export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = await getFinanceSnapshot();
  const totalBalanceCentavos = Object.values(snapshot.balances).reduce((sum, value) => sum + value, 0);
  const unliquidatedCentavos = snapshot.liquidations.reduce((sum, row) => sum + row.unliquidatedCentavos, 0);
  return NextResponse.json({
    accounts: snapshot.accounts,
    balances: snapshot.balances,
    totalBalanceCentavos,
    unliquidatedCentavos,
    missingReceiptCount: snapshot.missingReceipts.length,
    missingReceipts: snapshot.missingReceipts,
    eventTotals: snapshot.eventTotals,
    liquidations: snapshot.liquidations,
    budgets: snapshot.budgets,
    whatToDoNow: snapshot.whatToDoNow,
    chain: snapshot.chain,
  });
}
