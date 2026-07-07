import { db } from './firebase-config.js';
import {
  collection,
  addDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

export async function logActivity(userId, activity) {
  if (!userId || !activity?.title || !activity?.description) {
    console.warn('logActivity missing required parameters');
    return;
  }

  try {
    const docRef = await addDoc(collection(db, 'users', userId, 'activities'), {
      title: activity.title,
      description: activity.description,
      icon: activity.icon || '📋',
      color: activity.color || 'green',
      timestamp: serverTimestamp()
    });

    console.log('Activity logged with ID:', docRef.id);
    return docRef.id;
  } catch (err) {
    console.error('Failed to log activity:', err);
  }
}