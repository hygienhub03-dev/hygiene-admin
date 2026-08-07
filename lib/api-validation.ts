import { z } from "zod";

const comboItemSchema = z.object({
  product_id: z.string().uuid(),
  quantity: z.number().int().min(1).max(100).optional().default(1),
});

export const productInputSchema = z.object({
  image: z.string().trim().max(500).optional().default(""),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional().default(""),
  category: z.string().trim().max(100).optional().default(""),
  brand: z.string().trim().max(100).optional().default(""),
  price: z.number().min(0).max(1_000_000),
  salePrice: z.number().min(0).max(1_000_000).optional().default(0),
  totalStock: z.number().int().min(0).max(1_000_000),
  isCombo: z.boolean().optional().default(false),
  comboItems: z.array(comboItemSchema).max(20).optional().default([]),
});

export const productUpdateSchema = productInputSchema.partial().refine(
  (payload) => Object.keys(payload).length > 0,
  "At least one field is required",
);

export const idParamSchema = z.object({
  id: z.string().trim().min(3).max(128),
});

export const allowedUploadMime = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
