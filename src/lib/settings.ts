import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { settings } from "@/lib/db/schema";
import { DEFAULT_NUDGE_TEMPLATE } from "@/lib/tasks/logic";

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

export const brandKitSchema = z.object({
  logoFileId: z.string().uuid().optional(),
  colors: z.object({
    primary: z.string().regex(/^#[0-9a-f]{6}$/i),
    secondary: z.string().regex(/^#[0-9a-f]{6}$/i),
    accent: z.string().regex(/^#[0-9a-f]{6}$/i),
    background: z.string().regex(/^#[0-9a-f]{6}$/i),
    text: z.string().regex(/^#[0-9a-f]{6}$/i),
  }),
  headingFontFileId: z.string().uuid().optional(),
  bodyFontFileId: z.string().uuid().optional(),
  frameFileId: z.string().uuid().optional(),
});

export const settingSchemas = {
  "org.profile": orgProfileSchema,
  "ai.defaults": aiDefaultsSchema,
  "privacy.offlineMode": z.boolean(),
  "privacy.sensitiveLocalOnly": z.boolean(),
  "setup.completed": z.boolean(),
  "tasks.nudgeTemplate": z.string().max(2000),
  "brand.kit": brandKitSchema,
  "creatives.autoSchedule": z.boolean(),
} as const;

export type SettingKey = keyof typeof settingSchemas;
export type SettingValue<K extends SettingKey> = z.infer<(typeof settingSchemas)[K]>;

const defaults: { [K in SettingKey]: SettingValue<K> } = {
  "org.profile": { name: "", shortName: "", nature: null },
  "ai.defaults": {},
  "privacy.offlineMode": false,
  "privacy.sensitiveLocalOnly": false,
  "setup.completed": false,
  "tasks.nudgeTemplate": DEFAULT_NUDGE_TEMPLATE,
  "brand.kit": {
    colors: { primary: "#0969da", secondary: "#1f6feb", accent: "#bf8700", background: "#0d1117", text: "#f0f6fc" },
  },
  "creatives.autoSchedule": true,
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
