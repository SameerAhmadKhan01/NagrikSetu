import cron, { ScheduledTask } from "node-cron";
import { prisma } from "../../db.js";
import { predictEscalationRisk } from "./model.js";

/**
 * Scans active reports, flags any that have exceeded their SLA threshold,
 * scores their escalation risk using ML, and escalates them in order of priority.
 */
export async function runEscalationCheck() {
  console.log("[Escalation Scheduler] Scanning reports for SLA breaches...");
  try {
    // Fetch all unresolved, un-escalated reports
    const reports = await prisma.grievanceReport.findMany({
      where: {
        status: { in: ["SUBMITTED", "UNDER_REVIEW"] },
      },
    });

    const now = new Date();
    const breached: typeof reports = [];

    // Identify reports that have passed their SLA deadline
    for (const r of reports) {
      const deadline = new Date(r.createdAt.getTime() + r.slaHours * 60 * 60 * 1000);
      if (now >= deadline) {
        breached.push(r);
      }
    }

    if (breached.length === 0) {
      console.log("[Escalation Scheduler] No active reports have breached SLA.");
      return;
    }

    console.log(`[Escalation Scheduler] Found ${breached.length} breached reports. Computing ML priority scores...`);

    // Score and priority rank the reports (highest risk score escalated first)
    const scoredReports = await Promise.all(
      breached.map(async (report) => {
        const score = await predictEscalationRisk(report.category, report.region, report.createdAt);
        return { report, score };
      })
    );

    scoredReports.sort((a, b) => b.score - a.score);

    // Apply state transitions
    for (const item of scoredReports) {
      const { report, score } = item;
      console.log(
        `[Auto-Escalate] Escalating tracking ID: ${report.trackingId} (ML risk score: ${score.toFixed(3)})`
      );

      await prisma.grievanceReport.update({
        where: { id: report.id },
        data: {
          status: "ESCALATED",
          escalationRiskScore: score,
          escalatedAt: new Date(),
        },
      });
    }

    console.log("[Escalation Scheduler] SLA escalation scan completed.");
  } catch (error) {
    console.error("[Escalation Scheduler] Error during escalation process:", error);
  }
}

let escalationJob: ScheduledTask | null = null;

/**
 * Starts the background cron check.
 * Default: runs every minute for high visibility and quick demo cycles.
 */
export function startEscalationScheduler() {
  const schedulePattern = "*/1 * * * *"; // Every minute
  console.log(`[Escalation Scheduler] Initializing cron job. Schedule: '${schedulePattern}'`);
  
  escalationJob = cron.schedule(schedulePattern, async () => {
    await runEscalationCheck();
  });
}

export function stopEscalationScheduler() {
  if (escalationJob) {
    escalationJob.stop();
    escalationJob = null;
    console.log("[Escalation Scheduler] Background cron service stopped.");
  }
}
