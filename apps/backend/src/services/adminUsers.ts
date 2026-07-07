const DAY_MS = 24 * 60 * 60 * 1000;

export function calculateGiftedTrialEnd(input: {
  now?: Date;
  currentTrialEndsAt?: Date | null;
  days: number;
}) {
  const now = input.now ?? new Date();
  if (!Number.isInteger(input.days) || input.days <= 0) {
    throw new Error("Gift days must be a positive integer");
  }
  const base = input.currentTrialEndsAt && input.currentTrialEndsAt.getTime() > now.getTime()
    ? input.currentTrialEndsAt
    : now;
  return new Date(base.getTime() + input.days * DAY_MS);
}

export function calculateTrialDaysLeft(trialEndsAt: Date | null | undefined, now = new Date()) {
  if (!trialEndsAt) return null;
  return Math.max(0, Math.ceil((trialEndsAt.getTime() - now.getTime()) / DAY_MS));
}
