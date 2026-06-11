import { z } from "zod";

export const deviceStateSchema = z.enum([
  "device",
  "unauthorized",
  "offline",
  "no permissions",
  "recovery",
  "sideload",
  "bootloader",
  "unknown",
]);

export const deviceShape = z.object({
  serial: z.string(),
  state: deviceStateSchema,
  product: z.string().optional(),
  model: z.string().optional(),
  device: z.string().optional(),
  transportId: z.string().optional(),
  usb: z.string().optional(),
  raw: z.string(),
});

export const deviceIdInput = z
  .string()
  .optional()
  .describe(
    "Target device serial. Omit when exactly one device is connected; required when multiple are."
  );
