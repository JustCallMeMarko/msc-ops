export const runtime = "nodejs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const [{ getDb }, { logger }] = await Promise.all([
      import("@/lib/db/client"),
      import("@/lib/log"),
    ]);
    await getDb().catch((error: unknown) => logger.error("Database startup failed.", error));
  }
}
