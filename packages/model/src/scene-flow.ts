import { z } from "zod";
import { sceneOperationSchema } from "@mosaic/blueprints";

const id = z.string().min(1).max(100);
export const sceneFlowSchema = z.object({
  routes: z
    .array(
      z.object({
        id,
        name: z.string().trim().min(1).max(100),
        from: id.nullable(),
        to: id,
        operation: sceneOperationSchema,
        signalId: id.optional(),
        fade: z.number().min(0).max(5),
        offset: z
          .object({
            x: z.number().int().min(0).max(16384),
            y: z.number().int().min(0).max(16384),
          })
          .optional(),
      }),
    )
    .max(512),
  positions: z
    .record(
      id,
      z.object({
        x: z.number().min(0).max(24000),
        y: z.number().min(0).max(24000),
      }),
    )
    .optional(),
});
export type SceneFlow = z.infer<typeof sceneFlowSchema>;
export type SceneRoute = SceneFlow["routes"][number];
