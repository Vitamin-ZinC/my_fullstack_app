const CHANNEL = "orken-habit-program-updates";

export function publishHabitProgramUpdate(programId: string) {
  try {
    const channel = new BroadcastChannel(CHANNEL);
    channel.postMessage({ programId });
    channel.close();
  } catch { /* The saved backend response remains authoritative without cross-tab support. */ }
}

export function subscribeHabitProgramUpdates(programId: string, refresh: () => void) {
  try {
    const channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = event => { if (event.data?.programId === programId) refresh(); };
    return () => channel.close();
  } catch { return () => {}; }
}
