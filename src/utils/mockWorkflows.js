export const INITIAL_WORKFLOWS = [
  {
    id: 'wf_1',
    name: 'Rain Alert Notification',
    description: 'Checks precipitation every morning and notifies',
    enabled: true,
    nodeCount: 4,
    lastRun: '10 mins ago',
    lastStatus: 'success',
  },
  {
    id: 'wf_2',
    name: 'Battery Saver Log',
    description: 'Logs low battery events to Firebase',
    enabled: false,
    nodeCount: 3,
    lastRun: '2 hours ago',
    lastStatus: 'failed',
  },
  {
    id: 'wf_3',
    name: 'Server Ping Monitor',
    description: 'GET request to health check endpoint',
    enabled: true,
    nodeCount: 5,
    lastRun: 'Just now',
    lastStatus: 'success',
  },
];
