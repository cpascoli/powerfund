import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  latch: vi.fn(),
  preview: vi.fn(),
  listRows: vi.fn(),
}));

vi.mock("./evaluate", () => ({
  evaluateStoredReviewTriggers: mocks.latch,
  previewDueReviewTaskIds: mocks.preview,
}));
vi.mock("./records", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  listReviewTaskRows: mocks.listRows,
  reviewTaskIdsFor: async () => null,
  // Hydration only adds links; identity keeps the test about statuses.
  hydrateReviewTasks: async (_db: unknown, rows: Array<Record<string, unknown>>) =>
    rows.map((row) => ({ ...row, symbols: [], themes: [], outputs: [], trigger: { type: "scheduled" } })),
}));

import { parseReviewQueueFilter } from "./filter";
import { getReviewQueue, getReviewRadar } from "./queue";

const row = (id: string, status: string) => ({
  id,
  title: id,
  status,
  became_due_at: status === "due" ? "2026-09-20T00:00:00Z" : null,
});
const db = {} as never;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.latch.mockResolvedValue(1);
  // "fired" is stored pending but its trigger is satisfied now.
  mocks.preview.mockResolvedValue(["fired"]);
  mocks.listRows.mockImplementation(async (_db: unknown, statuses?: string[]) =>
    [row("recorded", "due"), row("fired", "pending"), row("later", "pending")].filter(
      (candidate) => !statuses || statuses.includes(candidate.status),
    ),
  );
});

describe("evaluate=preview on the review queue", () => {
  it("reports a fired trigger as due without recording it", async () => {
    const body = await getReviewQueue(db, parseReviewQueueFilter(new URLSearchParams("status=due&evaluate=preview")));
    expect(mocks.latch).not.toHaveBeenCalled();
    expect(body.tasks.map((task) => [task.id, task.status])).toEqual([
      ["recorded", "due"],
      ["fired", "due"],
    ]);
    expect(body.tasks.find((task) => task.id === "fired")).toMatchObject({ due_by_trigger: true });
    expect(body.tasks.find((task) => task.id === "recorded")).not.toHaveProperty("due_by_trigger");
    expect(body.marked_due).toBe(0);
    expect(body.previewed_due).toBe(1);
  });

  it("no longer lists a previewed task as pending", async () => {
    const body = await getReviewQueue(db, parseReviewQueueFilter(new URLSearchParams("status=pending&evaluate=preview")));
    expect(body.tasks.map((task) => task.id)).toEqual(["later"]);
    expect(mocks.latch).not.toHaveBeenCalled();
  });

  it("still latches by default, so the GPT and the Briefing behave as before", async () => {
    await getReviewQueue(db, parseReviewQueueFilter(new URLSearchParams("status=due")));
    expect(mocks.latch).toHaveBeenCalledTimes(1);
    expect(mocks.preview).not.toHaveBeenCalled();
  });
});

describe("the fund-state radar", () => {
  it("previews without writing when asked", async () => {
    const radar = await getReviewRadar(db, { previewDue: true });
    expect(mocks.latch).not.toHaveBeenCalled();
    expect(radar.due_reviews.map((task) => task.id)).toEqual(["recorded", "fired"]);
    expect(radar.upcoming_reviews.map((task) => task.id)).toEqual(["later"]);
    expect(radar.due_reviews[1]).toMatchObject({ due_by_trigger: true });
  });

  it("latches by default", async () => {
    await getReviewRadar(db);
    expect(mocks.latch).toHaveBeenCalledTimes(1);
  });
});
