export function hasValidCoachRevenueSplit(coachShareBps?: number | null, platformShareBps?: number | null) {
  return Number.isInteger(coachShareBps)
    && Number.isInteger(platformShareBps)
    && Number(coachShareBps) >= 0
    && Number(platformShareBps) >= 0
    && Number(coachShareBps) + Number(platformShareBps) === 10_000;
}

export function availableCoachSlots(clientLimit: number | null | undefined, activeCoachPaidClients: number) {
  if (clientLimit == null) return null;
  return Math.max(0, clientLimit - Math.max(0, activeCoachPaidClients));
}

export function shouldMigrateCoachSubscriptions(mode: "NEW_ONLY" | "NEXT_RENEWAL") {
  return mode === "NEXT_RENEWAL";
}

export function assertCoachRewardAffordable(balance: number, pointsCost: number) {
  if (!Number.isInteger(pointsCost) || pointsCost <= 0) throw new Error("Invalid ORKEN Points cost");
  if (balance < pointsCost) throw new Error("Not enough ORKEN Points");
}

export function coachConsultationRefundAmount(input: {
  amount: number;
  scheduledFor?: Date | null;
  now?: Date;
  cancellationHours: number;
  refundPercent: number;
}) {
  const now = input.now ?? new Date();
  const eligible = !input.scheduledFor
    || input.scheduledFor.getTime() - now.getTime() >= Math.max(0, input.cancellationHours) * 3_600_000;
  if (!eligible) return 0;
  const percent = Math.min(100, Math.max(0, input.refundPercent));
  return Math.round(Math.max(0, input.amount) * percent / 100);
}
