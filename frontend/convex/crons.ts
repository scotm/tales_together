import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Daily bounded cleanup. The mutation reschedules itself when a batch is full,
// so a burst cannot turn one run into an unbounded delete.
crons.interval(
  "expire diagnostics",
  { hours: 24 },
  internal.diagnostics.cleanupExpired,
  {},
);

export default crons;
