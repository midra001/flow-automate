/*
 * This file is part of FlowAutomate.
 *
 * Copyright © 2026 midra001
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * FlowAutomate is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * FlowAutomate is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with FlowAutomate. If not, see <https://www.gnu.org/licenses/>.
 *
 * @author midra001
 * @since 2026-09-26
 */

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