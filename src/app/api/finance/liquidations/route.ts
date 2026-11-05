import { NextResponse } from "next/server";
import { getFinanceSnapshot } from "@/lib/finance/db-utils";

export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = await getFinanceSnapshot();
  return NextResponse.json(snapshot.liquidations.map((liquidation) => ({
    ...liquidation,
    entries: snapshot.liquidationItems
      .filter((item) => item.liquidationId === liquidation.liquidation?.id)
      .map((item) => snapshot.entries.find((entry) => entry.id === item.entryId))
      .filter(Boolean),
  })));
}
