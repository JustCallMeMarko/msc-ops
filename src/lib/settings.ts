import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { settings } from "@/lib/db/schema";

export const orgProfileSchema = z.object({
  name: z.string().max(120).default(""),
  shortName: z.string().max(32).default(""),
  nature: z.enum(["independent", "academic", "extracurricular"]).nullable().default(null),
  logoDataUrl: z.string().max(350_000).optional(),
});

export const aiDefaultsSchema = z.object({
  chat: z.object({ providerId: z.string().uuid(), model: z.string().min(1) }).optional(),
  embedding: z.object({ providerId: z.string().uuid(), model: z.string().min(1) }).optional(),
});

export const settingSchemas = {
  "org.profile": orgProfileSchema,
  "ai.defaults": aiDefaultsSchema,
  "privacy.offlineMode": z.boolean(),
  "privacy.sensitiveLocalOnly": z.boolean(),
  "setup.completed": z.boolean(),
} as const;

export type SettingKey = keyof typeof settingSchemas;
export type SettingValue<K extends SettingKey> = z.infer<(typeof settingSchemas)[K]>;

const defaults: { [K in SettingKey]: SettingValue<K> } = {
  "org.profile": { name: "", shortName: "", nature: null },
  "ai.defaults": {},
  "privacy.offlineMode": false,
  "privacy.sensitiveLocalOnly": false,
  "setup.completed": false,
};

export async function getSetting<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
  const { db } = await getDb();
  const [entry] = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
  if (!entry) return defaults[key];
  return settingSchemas[key].parse(entry.value) as SettingValue<K>;
}

export async function setSetting<K extends SettingKey>(
  key: K,
  value: unknown,
): Promise<SettingValue<K>> {
  const parsed = settingSchemas[key].parse(value) as SettingValue<K>;
  const { db } = await getDb();
  await db
    .insert(settings)
    .values({ key, value: parsed })
    .onConflictDoUpdate({ target: settings.key, set: { value: parsed, updatedAt: new Date() } });
  return parsed;
}

export async function getSettings(): Promise<Record<SettingKey, unknown>> {
  const { db } = await getDb();
  const rows = await db.select().from(settings);
  const values = { ...defaults } as Record<SettingKey, unknown>;
  for (const row of rows) {
    if (row.key in settingSchemas) {
      const key = row.key as SettingKey;
      values[key] = settingSchemas[key].parse(row.value);
    }
  }
  return values;
}
