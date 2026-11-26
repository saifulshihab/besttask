import { z } from "zod";
import { paginationSchema } from "../../lib/pagination.js";

export const listActivityQuery = paginationSchema.extend({
  /** One task's events, for the task panel timeline. */
  entityId: z.uuid().optional(),
});

export type ListActivityQuery = z.infer<typeof listActivityQuery>;
