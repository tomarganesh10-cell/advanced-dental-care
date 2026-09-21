import { describe, expect, it } from "vitest";

import { pruneAnalyticsEvents, pruneAuditLogs, runRetention } from "@/server/retention";

import { testDb } from "./setup";

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

async function seedAnalytics(count: number, createdAt: Date) {
  await testDb.analyticsEvent.createMany({
    data: Array.from({ length: count }, (_, i) => ({
      name: "page_view",
      path: `/p/${i}`,
      createdAt,
    })),
  });
}

/**
 * Analytics events are the only table that grows with traffic rather than with
 * patients treated, so it is the one that decides whether a small database plan
 * lasts years or months.
 */
describe("data retention", () => {
  it("deletes analytics events past the retention window and keeps the rest", async () => {
    await seedAnalytics(5, daysAgo(500));
    await seedAnalytics(3, daysAgo(100));

    const deleted = await pruneAnalyticsEvents(400);

    expect(deleted).toBe(5);
    expect(await testDb.analyticsEvent.count()).toBe(3);
  });

  it("deletes nothing when the window covers everything", async () => {
    await seedAnalytics(4, daysAgo(30));

    expect(await pruneAnalyticsEvents(400)).toBe(0);
    expect(await testDb.analyticsEvent.count()).toBe(4);
  });

  it("treats a zero or negative window as disabled rather than delete-everything", async () => {
    await seedAnalytics(4, daysAgo(900));

    expect(await pruneAnalyticsEvents(0)).toBe(0);
    expect(await pruneAnalyticsEvents(-1)).toBe(0);
    expect(await testDb.analyticsEvent.count()).toBe(4);
  });

  it("deletes more than one batch in a single pass", async () => {
    // Above the 5,000-row batch size, so the loop has to run twice.
    await seedAnalytics(5_200, daysAgo(500));

    expect(await pruneAnalyticsEvents(400)).toBe(5_200);
    expect(await testDb.analyticsEvent.count()).toBe(0);
  });

  it("never prunes the audit trail unless a period is explicitly configured", async () => {
    await testDb.auditLog.createMany({
      data: Array.from({ length: 4 }, () => ({
        action: "VIEW",
        entity: "Patient",
        createdAt: daysAgo(3000),
      })),
    });

    // The default: no retention period, so the trail survives.
    expect(await pruneAuditLogs(undefined)).toBe(0);
    expect(await pruneAuditLogs(0)).toBe(0);
    expect(await testDb.auditLog.count()).toBe(4);

    // Only an explicit choice removes anything.
    expect(await pruneAuditLogs(1000)).toBe(4);
    expect(await testDb.auditLog.count()).toBe(0);
  });

  it("runs both in one pass and reports what it removed", async () => {
    await seedAnalytics(2, daysAgo(500));
    await testDb.auditLog.createMany({
      data: [{ action: "VIEW", entity: "Patient", createdAt: daysAgo(500) }],
    });

    const result = await runRetention({ analyticsRetentionDays: 400 });

    expect(result).toEqual({ analyticsEvents: 2, auditLogs: 0 });
    expect(await testDb.auditLog.count()).toBe(1);
  });
});
