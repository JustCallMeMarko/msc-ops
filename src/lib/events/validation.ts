import { z } from "zod";

export const lumaUrlSchema = z.union([z.literal(""), z.string().url(), z.null()]).optional()
  .transform((value) => value === "" ? null : value)
  .refine((value) => {
    if (!value) return true;
    try {
      const url = new URL(value);
      return url.protocol === "https:" && ["lu.ma", "luma.com"].includes(url.hostname.toLowerCase())
        && !url.username && !url.password && url.pathname.length > 1;
    } catch {
      return false;
    }
  }, "Luma links must use https://lu.ma/… or https://luma.com/…");
