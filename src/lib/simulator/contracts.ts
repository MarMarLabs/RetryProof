import { z } from "zod";

import { identifier, jsonValue, schemaVersion } from "@/domain";

export const httpMockSchema = z
  .object({
    routeId: identifier,
    method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
    path: z.string().min(1).max(512).regex(/^\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]*$/),
    status: z.number().int().min(100).max(599),
    responseBody: z.record(z.string(), jsonValue),
  })
  .strict();

export const simulationFixtureSchema = z
  .object({
    schemaVersion,
    id: identifier,
    input: z.record(z.string(), jsonValue),
    httpMocks: z.array(httpMockSchema).max(100),
  })
  .strict()
  .superRefine((fixture, context) => {
    const routes = fixture.httpMocks.map((mock) => mock.routeId);
    if (new Set(routes).size !== routes.length) {
      context.addIssue({ code: "custom", message: "HTTP mock route IDs must be unique" });
    }
  });

export type HttpMock = z.infer<typeof httpMockSchema>;
export type SimulationFixture = z.infer<typeof simulationFixtureSchema>;
