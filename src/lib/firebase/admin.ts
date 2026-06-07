/**
 * ============================================================================
 * FIREBASE ADMIN CONFIGURATION
 * ============================================================================
 * Server-side Firebase Admin SDK for secure database operations.
 * Only use in API routes and server components.
 * 
 * Supports three methods (in order of priority):
 * 1. Individual env vars: FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL
 * 2. FIREBASE_SERVICE_ACCOUNT_PATH - path to JSON file
 * 3. FIREBASE_ADMIN_SERVICE_ACCOUNT - base64 encoded JSON
 * 
 * NOTE: Firebase is optional for development. Will return null if not configured.
 */

import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getStorage, Storage } from 'firebase-admin/storage';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// Use global cache for development hot reload persistence
declare global {
  var firebaseAdminApp: App | undefined;
  var firebaseAdminDb: Firestore | undefined;
  var firebaseAdminStorage: Storage | undefined;
  var firebaseInitAttempted: boolean | undefined;
  var firebaseInitFailed: boolean | undefined;
}

let adminApp: App | undefined = global.firebaseAdminApp;
let adminDb: Firestore | undefined = global.firebaseAdminDb;
let adminStorage: Storage | undefined = global.firebaseAdminStorage;
let initAttempted = global.firebaseInitAttempted || false;
let initFailed = global.firebaseInitFailed || false;

/**
 * Get the Firebase Admin service account credentials
 * Tries multiple methods in order of priority
 */
function getServiceAccount(): object | null {
  // Method 1: Individual environment variables (easiest for development)
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  
  if (projectId && privateKey && clientEmail) {
    return {
      type: 'service_account',
      project_id: projectId,
      private_key: privateKey.replace(/\\n/g, '\n'), // Handle escaped newlines
      client_email: clientEmail,
    };
  }

  // Method 2: Direct file path
  const filePath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (filePath) {
    try {
      const resolvedPath = resolve(process.cwd(), filePath);
      if (existsSync(resolvedPath)) {
        const fileContent = readFileSync(resolvedPath, 'utf-8');
        const parsed = JSON.parse(fileContent);
        if (parsed.project_id && parsed.private_key && parsed.client_email) {
          return parsed;
        }
      }
    } catch (error) {
      console.warn('[Firebase Admin] Failed to read service account file:', error);
    }
  }

  // Method 3: Base64 encoded (for production)
  const base64 = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT;
  if (base64 && base64.trim() !== '') {
    try {
      const json = Buffer.from(base64, 'base64').toString('utf-8');
      const parsed = JSON.parse(json);
      if (parsed.project_id && parsed.private_key && parsed.client_email) {
        return parsed;
      }
    } catch {
      // Silent fail for base64
    }
  }

  // Not configured
  if (!initFailed) {
    console.warn('[Firebase Admin] Not configured. Set one of:');
    console.warn('  - FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL');
    console.warn('  - FIREBASE_SERVICE_ACCOUNT_PATH');
    console.warn('  - FIREBASE_ADMIN_SERVICE_ACCOUNT (base64)');
  }
  return null;
}

/**
 * Get or initialize the Firebase Admin app
 */
export function getAdminApp(): App | null {
  if (initAttempted) {
    return adminApp || null;
  }
  
  initAttempted = true;
  global.firebaseInitAttempted = true;
  
  const apps = getApps();
  if (apps.length > 0) {
    adminApp = apps[0];
    global.firebaseAdminApp = adminApp;
    return adminApp;
  }
  
  const serviceAccount = getServiceAccount();
  if (!serviceAccount) {
    initFailed = true;
    global.firebaseInitFailed = true;
    return null;
  }
  
  try {
    adminApp = initializeApp({
      credential: cert(serviceAccount),
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    });
    global.firebaseAdminApp = adminApp;
    console.log('[Firebase Admin] ✓ Initialized successfully');
    return adminApp;
  } catch (error) {
    console.error('[Firebase Admin] Failed to initialize:', error);
    initFailed = true;
    global.firebaseInitFailed = true;
    return null;
  }
}

/**
 * Get the Firestore Admin database instance
 */
export function getAdminDb(): Firestore | null {
  // Return cached instance if available
  if (adminDb) return adminDb;
  if (global.firebaseAdminDb) {
    adminDb = global.firebaseAdminDb;
    return adminDb;
  }
  
  const app = getAdminApp();
  if (!app) return null;
  
  try {
    // Get Firestore instance (this will reuse existing if already initialized)
    const db = getFirestore(app);
    
    // Cache the instance
    adminDb = db;
    global.firebaseAdminDb = db;
    return adminDb;
  } catch (error) {
    console.error('[Firebase Admin] Failed to get Firestore:', error);
    return null;
  }
}

/**
 * Get the Firebase Storage Admin instance
 */
export function getAdminStorage(): Storage | null {
  if (adminStorage) return adminStorage;
  if (global.firebaseAdminStorage) {
    adminStorage = global.firebaseAdminStorage;
    return adminStorage;
  }
  
  const app = getAdminApp();
  if (!app) return null;
  
  try {
    adminStorage = getStorage(app);
    global.firebaseAdminStorage = adminStorage;
    return adminStorage;
  } catch (error) {
    console.error('[Firebase Admin] Failed to get Storage:', error);
    return null;
  }
}

/**
 * Check if Firebase is configured and working
 */
export function isFirebaseConfigured(): boolean {
  return getAdminApp() !== null;
}

// Legacy exports
export { adminApp, adminDb, adminStorage };
