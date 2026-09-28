import type { Json, PowerFundAgentClient, Query, WriteOptions } from "./agent-client";

/**
 * Test double for the agent API. Records every call so tests can assert what
 * a tool did *not* do — a read that quietly wrote would pass a test that only
 * checks the answer.
 */
export type RecordedCall = {
  method: keyof PowerFundAgentClient;
  args: unknown[];
  write?: WriteOptions;
};

export const WRITE_METHODS = [
  "updateDossier",
  "createDecision",
  "recordDecisionOutcome",
  "createPlannedAction",
  "updatePlannedAction",
  "createReviewTask",
  "updateReviewTask",
  "completeReviewTask",
  "addWatchlistCompany",
  "setWatchlistArchived",
] as const satisfies ReadonlyArray<keyof PowerFundAgentClient>;

export const READ_METHODS = [
  "getFundState",
  "getPortfolio",
  "getPerformance",
  "getJournal",
  "getCalibrationStatus",
  "getPlannedActions",
  "getResearchInbox",
  "getReviewQueue",
  "getCompanyDossier",
  "getDossierVersions",
  "getDossierVersion",
] as const satisfies ReadonlyArray<keyof PowerFundAgentClient>;

type Responder = (...args: unknown[]) => Json | Promise<Json>;

export function fakeAgentClient(
  responses: Partial<Record<keyof PowerFundAgentClient, Json | Responder>> = {},
): PowerFundAgentClient & { calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const client = { calls } as PowerFundAgentClient & { calls: RecordedCall[] };
  const writes = new Set<string>(WRITE_METHODS);
  for (const method of [...READ_METHODS, ...WRITE_METHODS]) {
    (client as unknown as Record<string, unknown>)[method] = async (...args: unknown[]) => {
      const isWrite = writes.has(method);
      calls.push({
        method,
        args: isWrite ? args.slice(0, -1) : args,
        write: isWrite ? (args[args.length - 1] as WriteOptions | undefined) : undefined,
      });
      const response = responses[method];
      if (typeof response === "function") return response(...args);
      return response ?? { ok: true, method };
    };
  }
  return client;
}

export type { Json, Query };
