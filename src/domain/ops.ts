/**
 * L3 ops events — append-only audit / analytics trail.
 */
import { z } from "zod";

export const OpsEventTypeSchema = z.enum([
  "session.opened",
  "session.closed",
  "session.seats_changed",
  "session.guests_changed",
  "sale.reversed",
  "order.confirmed",
  "line.qty_changed",
  "line.canceled",
  "line.served",
  "writeoff.upserted",
  "sale.created",
  "day.opened",
  "day.closed",
]);
export type OpsEventType = z.infer<typeof OpsEventTypeSchema>;

export const OpsEventSchema = z.object({
  id: z.string().min(1),
  type: OpsEventTypeSchema,
  at: z.string().datetime(),
  businessDate: z.string().min(8).optional(),
  sessionId: z.string().optional(),
  batchId: z.string().optional(),
  lineId: z.string().optional(),
  saleId: z.string().optional(),
  productId: z.string().optional(),
  deviceId: z.string().optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
});
export type OpsEvent = z.infer<typeof OpsEventSchema>;

export const OrderBatchSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  confirmedAt: z.string().datetime(),
  deviceId: z.string().optional(),
});
export type OrderBatch = z.infer<typeof OrderBatchSchema>;

export const SeatStateSchema = z.object({
  id: z.string().min(1),
  activeSessionId: z.string().nullable(),
  updatedAt: z.string().datetime(),
});
export type SeatState = z.infer<typeof SeatStateSchema>;

export const OpsMetaSchema = z.object({
  dailySeqByDate: z.record(z.string(), z.number().int().min(0)),
  updatedAt: z.string().datetime(),
});
export type OpsMeta = z.infer<typeof OpsMetaSchema>;
