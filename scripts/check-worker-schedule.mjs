/** Keep the emergency stop, but make a stopped production schedule fail visibly. */
export function validateWorkerSchedule({ eventName, enabled, accounts }) {
  if (eventName === "schedule" && enabled !== "true") {
    throw Error("Scheduled WB sync is disabled: SYNC_WORKER_SCHEDULE_ENABLED must be true. No sync requests were made.");
  }
  if (eventName === "schedule" && !accounts?.trim()) {
    throw Error("Scheduled WB sync requires explicit SYNC_WORKER_ACCOUNT_IDS.");
  }
  if (accounts?.trim() && (!/^\d+(,\d+)*$/.test(accounts) || accounts.split(",").some(id => !/^[1-9]\d*$/.test(id)))) {
    throw Error("Worker account ids must be comma-separated positive integers.");
  }
}
if (process.argv[1] && import.meta.url === (await import("node:url")).pathToFileURL(process.argv[1]).href) {
  try {
    validateWorkerSchedule({ eventName: process.env.GITHUB_EVENT_NAME,
      enabled: process.env.SYNC_WORKER_SCHEDULE_ENABLED, accounts: process.env.WORKER_ACCOUNT_IDS });
    console.log("PASS scheduled sync policy; configured account scope validated");
  } catch (error) {
    console.error(`::error::${error.message}`);
    process.exitCode = 20;
  }
}
