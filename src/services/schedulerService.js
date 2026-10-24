// src/services/schedulerService.js
import { runWorkflow } from '../engine/WorkflowEngine';
import { saveExecutionLog } from './historyStorage';

class WorkflowScheduler {
  constructor() {
    this.activeTimers = new Map(); // workflowId -> intervalId
  }

  syncActiveWorkflows(workflows) {
    const currentEnabledIds = new Set();

    workflows.forEach((wf) => {
      const isEnabled = wf.enabled ?? wf.isActive;
      const firstNode = wf.nodes?.[0];
      const isTimerTrigger = firstNode?.type === 'timer_trigger';

      if (isEnabled && isTimerTrigger) {
        currentEnabledIds.add(wf.id);

        // If not already scheduled, register interval
        if (!this.activeTimers.has(wf.id)) {
          const intervalSec = Math.max(
            5,
            Number(firstNode.config?.delaySeconds || 15)
          );

          console.log(`[Scheduler] Starting interval for "${wf.name}" every ${intervalSec}s`);

          const timerId = setInterval(async () => {
            console.log(`[Scheduler] Auto-executing "${wf.name}"...`);
            try {
              const result = await runWorkflow(wf.nodes);
              await saveExecutionLog({
                workflowId: wf.id,
                workflowName: wf.name,
                status: result.status,
                executedAt: new Date().toISOString(),
                isScheduledRun: true,
                logs: result.logs,
              });
            } catch (err) {
              console.error(`[Scheduler] Error running "${wf.name}":`, err);
            }
          }, intervalSec * 1000);

          this.activeTimers.set(wf.id, timerId);
        }
      }
    });

    // Clear any timers for workflows that were disabled or deleted
    for (const [wfId, timerId] of this.activeTimers.entries()) {
      if (!currentEnabledIds.has(wfId)) {
        console.log(`[Scheduler] Stopping interval for workflow ${wfId}`);
        clearInterval(timerId);
        this.activeTimers.delete(wfId);
      }
    }
  }

  stopAll() {
    for (const timerId of this.activeTimers.values()) {
      clearInterval(timerId);
    }
    this.activeTimers.clear();
  }
}

export const scheduler = new WorkflowScheduler();