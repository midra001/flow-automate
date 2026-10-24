import { 
  collection, 
  getDocs, 
  doc, 
  setDoc, 
  updateDoc 
} from 'firebase/firestore';
import { db } from './firebase';
import { INITIAL_WORKFLOWS } from '../utils/mockWorkflows';
import { deleteDoc } from 'firebase/firestore';

const WORKFLOWS_COLLECTION = 'workflows';

// Fetch all workflows from Firestore (seeds defaults if collection is empty)
export async function fetchWorkflows() {
  try {
    const colRef = collection(db, WORKFLOWS_COLLECTION);
    const snapshot = await getDocs(colRef);

    if (snapshot.empty) {
      for (const wf of INITIAL_WORKFLOWS) {
        await setDoc(doc(db, WORKFLOWS_COLLECTION, wf.id), wf);
      }
      return INITIAL_WORKFLOWS;
    }

    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.warn('Firestore fetch failed, falling back to local data:', error);
    return INITIAL_WORKFLOWS;
  }
}

// Toggle enabled status
export async function toggleWorkflowStatus(id, currentStatus) {
  try {
    const docRef = doc(db, WORKFLOWS_COLLECTION, id);
    await updateDoc(docRef, { enabled: !currentStatus });
  } catch (error) {
    console.error('Error toggling workflow:', error);
  }
}

// Save or update workflow nodes & config
export async function saveWorkflowToFirestore(workflow) {
  try {
    const docRef = doc(db, WORKFLOWS_COLLECTION, workflow.id);
    await setDoc(docRef, workflow, { merge: true });
  } catch (error) {
    console.error('Error saving workflow:', error);
  }
}

const LOGS_COLLECTION = 'execution_logs';

// Save an execution run to Firestore
export async function saveRunToFirestore(runData) {
  try {
    const docRef = doc(db, LOGS_COLLECTION, runData.id);
    await setDoc(docRef, {
      ...runData,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error saving execution run to Firestore:', error);
  }
}

// Fetch all recorded runs ordered newest first
export async function fetchExecutionLogs() {
  try {
    const colRef = collection(db, LOGS_COLLECTION);
    const snapshot = await getDocs(colRef);
    if (snapshot.empty) return [];
    
    return snapshot.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  } catch (error) {
    console.warn('Failed to fetch cloud logs:', error);
    return [];
  }
}

export async function deleteWorkflowFromFirestore(id) {
  try {
    const docRef = doc(db, WORKFLOWS_COLLECTION, id);
    await deleteDoc(docRef);
  } catch (error) {
    console.error('Error deleting workflow:', error);
  }
}