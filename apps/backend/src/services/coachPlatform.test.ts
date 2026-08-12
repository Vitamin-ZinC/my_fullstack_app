import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/orken_test";
const { calculateHabitCorrelations, serializeCoachClient } = await import("./coachPlatform.js");

function metric(day: number, clarity: number) {
  return { date: new Date(Date.UTC(2026, 6, day)), energy: 6, clarity, stability: 6 };
}

test("habit correlations stay hidden until at least fourteen metric days exist", () => {
  const metrics = Array.from({ length: 13 }, (_, index) => metric(index + 1, 6));
  assert.deepEqual(calculateHabitCorrelations({ dailyMetrics: metrics, enrollments: [] }), []);
});

test("habit correlations require four completed and four comparison observations", () => {
  const metrics = Array.from({ length: 14 }, (_, index) => metric(index + 1, index < 4 ? 9 : 5));
  const completedDates = metrics.slice(0, 4).map((item) => ({ date: item.date, completed: true }));
  const correlations = calculateHabitCorrelations({ dailyMetrics: metrics, enrollments: [{ title: "Фокус", checkins: completedDates }] });
  const clarity = correlations.find((item: any) => item.metric === "clarity") as any;
  assert.equal(clarity.completedDays, 4);
  assert.equal(clarity.comparisonDays, 10);
  assert.match(clarity.message, /связь, а не доказанная причина/);
});

test("coach client summary raises a red flag for a critical latest metric", () => {
  const now = new Date();
  const summary = serializeCoachClient({
    id: "relationship-1",
    userId: "user-1",
    funding: "COACH_PAID",
    status: "ACTIVE",
    metricsConsentAt: now,
    journalConsentAt: null,
    user: { email: "client@example.com", name: "Клиент", avatarUrl: null },
    habitProgram: {
      dailyMetrics: [{ date: now, energy: 3, clarity: 6, stability: 6 }],
      enrollments: [{ checkins: [{ date: now, completed: true }] }]
    }
  });
  assert.match(summary.attentionReason ?? "", /3 или ниже/);
});

test("coach client summary detects three consecutive declining check-ins", () => {
  const now = new Date();
  const day = 86_400_000;
  const summary = serializeCoachClient({
    id: "relationship-2",
    userId: "user-2",
    funding: "CLIENT_PAID",
    status: "ACTIVE",
    metricsConsentAt: now,
    journalConsentAt: null,
    user: { email: "client2@example.com", name: "Клиент 2", avatarUrl: null },
    habitProgram: {
      dailyMetrics: [
        { date: now, energy: 5, clarity: 5, stability: 5 },
        { date: new Date(now.getTime() - day), energy: 6, clarity: 6, stability: 6 },
        { date: new Date(now.getTime() - 2 * day), energy: 7, clarity: 7, stability: 7 }
      ],
      enrollments: [{ checkins: [{ date: now, completed: true }] }]
    }
  });
  assert.match(summary.attentionReason ?? "", /снижается три отметки подряд/);
});
