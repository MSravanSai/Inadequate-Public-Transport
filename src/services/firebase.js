import { getFirestore, collection, addDoc, getDocs, doc, updateDoc, deleteDoc, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
// Import the functions you need from the SDKs you need
import { getApp, getApps, initializeApp } from "firebase/app";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDDwCWYm0ev_p9kGywCxIbd4TpPuiIDxYw",
  authDomain: "inadequate-bus-transport.firebaseapp.com",
  projectId: "inadequate-bus-transport",
  storageBucket: "inadequate-bus-transport.firebasestorage.app",
  messagingSenderId: "831039863906",
  appId: "1:831039863906:web:c0bcec9b45c003de90e53b",
  measurementId: "G-QYE537QDCG"
};

// Initialize Firebase
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

// Firestore collections
export const COLLECTIONS = {
  CROWD_READINGS: 'crowdReadings',
  BUS_REQUESTS: 'busRequests',
  FESTIVALS: 'festivals',
  ROUTES: 'routes',
  USERS: 'users'
};

// Crowd Readings operations
export const crowdReadingsService = {
  // Add new crowd reading
  async addReading(reading) {
    try {
      const docRef = await addDoc(collection(db, COLLECTIONS.CROWD_READINGS), {
        ...reading,
        timestamp: new Date(),
        createdAt: new Date()
      });
      return { id: docRef.id, ...reading };
    } catch (error) {
      console.error('Error adding crowd reading:', error);
      throw error;
    }
  },

  // Get all readings for a route
  async getReadingsByRoute(routeId) {
    try {
      const q = query(
        collection(db, COLLECTIONS.CROWD_READINGS),
        where('route_id', '==', routeId),
        orderBy('timestamp', 'desc')
      );
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.error('Error getting readings:', error);
      throw error;
    }
  },

  // Get all readings
  async getAllReadings() {
    try {
      const q = query(collection(db, COLLECTIONS.CROWD_READINGS), orderBy('timestamp', 'desc'));
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.error('Error getting readings:', error);
      throw error;
    }
  },

  // Subscribe to real-time readings
  subscribeToReadings(callback) {
    const q = query(collection(db, COLLECTIONS.CROWD_READINGS), orderBy('timestamp', 'desc'));
    return onSnapshot(q, (querySnapshot) => {
      const readings = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      callback(readings);
    });
  }
};

// Bus Requests operations
export const busRequestsService = {
  // Add new bus request
  async addRequest(request) {
    try {
      const docRef = await addDoc(collection(db, COLLECTIONS.BUS_REQUESTS), {
        ...request,
        createdAt: new Date(),
        status: 'pending'
      });
      return { id: docRef.id, ...request };
    } catch (error) {
      console.error('Error adding bus request:', error);
      throw error;
    }
  },

  // Update request status
  async updateRequest(id, updates) {
    try {
      const docRef = doc(db, COLLECTIONS.BUS_REQUESTS, id);
      await updateDoc(docRef, { ...updates, updatedAt: new Date() });
    } catch (error) {
      console.error('Error updating request:', error);
      throw error;
    }
  },

  // Get all requests
  async getAllRequests() {
    try {
      const q = query(collection(db, COLLECTIONS.BUS_REQUESTS), orderBy('createdAt', 'desc'));
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.error('Error getting requests:', error);
      throw error;
    }
  },

  // Subscribe to real-time requests
  subscribeToRequests(callback) {
    const q = query(collection(db, COLLECTIONS.BUS_REQUESTS), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (querySnapshot) => {
      const requests = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      callback(requests);
    });
  }
};

// Festivals operations
export const festivalsService = {
  // Get all festivals
  async getFestivals() {
    try {
      const querySnapshot = await getDocs(collection(db, COLLECTIONS.FESTIVALS));
      return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.error('Error getting festivals:', error);
      throw error;
    }
  },

  // Backward-compatible alias
  async getAllFestivals() {
    const querySnapshot = await getDocs(collection(db, COLLECTIONS.FESTIVALS));
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  },

  // Add festival
  async addFestival(festival) {
    try {
      const docRef = await addDoc(collection(db, COLLECTIONS.FESTIVALS), festival);
      return { id: docRef.id, ...festival };
    } catch (error) {
      console.error('Error adding festival:', error);
      throw error;
    }
  },

  // Update festival
  async updateFestival(id, updates) {
    try {
      const docRef = doc(db, COLLECTIONS.FESTIVALS, id);
      await updateDoc(docRef, updates);
    } catch (error) {
      console.error('Error updating festival:', error);
      throw error;
    }
  },

  // Delete festival
  async deleteFestival(id) {
    try {
      const docRef = doc(db, COLLECTIONS.FESTIVALS, id);
      await deleteDoc(docRef);
    } catch (error) {
      console.error('Error deleting festival:', error);
      throw error;
    }
  }
};

// Routes operations
export const routesService = {
  // Get all routes
  async getRoutes() {
    try {
      const querySnapshot = await getDocs(collection(db, COLLECTIONS.ROUTES));
      return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.error('Error getting routes:', error);
      throw error;
    }
  },

  // Backward-compatible alias
  async getAllRoutes() {
    const querySnapshot = await getDocs(collection(db, COLLECTIONS.ROUTES));
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  },

  // Add route
  async addRoute(route) {
    try {
      const docRef = await addDoc(collection(db, COLLECTIONS.ROUTES), route);
      return { id: docRef.id, ...route };
    } catch (error) {
      console.error('Error adding route:', error);
      throw error;
    }
  },

  // Update route
  async updateRoute(id, updates) {
    try {
      const docRef = doc(db, COLLECTIONS.ROUTES, id);
      await updateDoc(docRef, updates);
    } catch (error) {
      console.error('Error updating route:', error);
      throw error;
    }
  },

  // Delete route
  async deleteRoute(id) {
    try {
      const docRef = doc(db, COLLECTIONS.ROUTES, id);
      await deleteDoc(docRef);
    } catch (error) {
      console.error('Error deleting route:', error);
      throw error;
    }
  }
};

// Storage operations
export const storageService = {
  // Upload image
  async uploadImage(file, path) {
    try {
      const storageRef = ref(storage, path);
      const snapshot = await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(snapshot.ref);
      return downloadURL;
    } catch (error) {
      console.error('Error uploading image:', error);
      throw error;
    }
  },

  // Upload video
  async uploadVideo(file, path) {
    try {
      const storageRef = ref(storage, path);
      const snapshot = await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(snapshot.ref);
      return downloadURL;
    } catch (error) {
      console.error('Error uploading video:', error);
      throw error;
    }
  }
};

export { app, db, storage };
