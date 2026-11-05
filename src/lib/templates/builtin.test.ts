import { afterAll, beforeAll, describe, expect, it } from "vitest";
import JSZip from "jszip";
import { uuidv7 } from "uuidv7";

process.env.MSC_DATA_DIR = "memory://";

describe("built-in templates and packets", () => {
  let database: Awaited<ReturnType<typeof import("@/lib/db/client").getDb>>;
  let seedBuiltinTemplates: typeof import("./builtin").seedBuiltinTemplates;
  let createPacket: typeof import("./packets").createPacket;
  let readFileBlob: typeof import("@/lib/files/storage").readFileBlob;

  beforeAll(async () => {
    const dbClient = await import("@/lib/db/client");
    database = await dbClient.getDb();
    ({ seedBuiltinTemplates } = await import("./builtin"));
    ({ createPacket } = await import("./packets"));
    ({ readFileBlob } = await import("@/lib/files/storage"));
  });

  afterAll(async () => {
    const { closeDb } = await import("@/lib/db/client");
    await closeDb();
  });

  it("seeds each built-in once across repeated boots", async () => {
    const { files, templates } = await import("@/lib/db/schema");
    await seedBuiltinTemplates(database);
    const firstTemplates = await database.db.select().from(templates);
    const firstFiles = await database.db.select().from(files);
    await seedBuiltinTemplates(database);
    expect(await database.db.select().from(templates)).toHaveLength(firstTemplates.length);
    expect(await database.db.select().from(files)).toHaveLength(firstFiles.length);
    expect(firstTemplates).toHaveLength(6);
  });

  it("stores a packet ZIP with a README for unavailable packet items", async () => {
    const result = await createPacket({
      kind: "pre_event",
      entityType: "event",
      entityId: uuidv7(),
      title: "Fixture Event",
    });
    expect(result.packet?.kind).toBe("pre_event");
    expect(result.file.kind).toBe("generated");
    const archive = await JSZip.loadAsync(await readFileBlob("memory://", result.file.sha256));
    const readme = await archive.file("README.txt")?.async("string");
    expect(readme).toContain("Unavailable or unmapped items:");
    expect(readme).toContain("budget proposal template");
  });
});
