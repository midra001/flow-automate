// src/services/historyStorage.js
let runHistory = [
  {
    id: 'run_init_1',
    workflowName: 'Rain Alert Notification',
    timestamp: '1:00:41 PM',
    status: 'success',
    durationMs: 1850,
    stepsCount: 3,
  },
];

export function getExecutionHistory() {
  return [...runHistory];
}

export function saveExecutionRun(runData) {
  runHistory = [runData, ...runHistory];
}