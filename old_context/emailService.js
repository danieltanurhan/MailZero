'use client';

import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  getDocs, 
  getDoc, 
  query, 
  where,
  orderBy,
  serverTimestamp,
  writeBatch 
} from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { getUserRoleInfo } from "@/services/authService";
import { encryptPassword, decryptPassword } from "@/lib/encryption";

// Collection names for email system
const COLLECTIONS = {
  EMAIL_ACCOUNTS: "email_accounts",
  EMAIL_ASSIGNMENTS: "email_assignments", 
  EMAIL_FOLDERS: "email_folders",
  EMAIL_MESSAGES: "email_messages",
  EMAIL_SYNC_STATUS: "email_sync_status"
};

/**
 * Email Account Management
 * Admin-controlled email accounts with encrypted passwords
 */

/**
 * Create a new email account (Admin only)
 * @param {Object} accountData - Email account data
 * @param {string} accountData.email_address - Email address
 * @param {string} accountData.imap_password - IMAP password (will be encrypted)
 * @param {string} accountData.smtp_password - SMTP password (will be encrypted)
 * @param {string} accountData.display_name - Display name for the account
 * @param {Object} accountData.server_config - Server configuration
 * @returns {Promise<{id: string}>} - The ID of the created account
 */
export const createEmailAccount = async (accountData) => {
  try {
    // Check if user is authenticated and has admin permissions
    if (!auth.currentUser) {
      throw new Error("You must be logged in to create email accounts");
    }
    
    const roleInfo = await getUserRoleInfo();
    const canManageEmail = roleInfo.isAdmin || 
                          roleInfo.permissions.includes('manage_email') || 
                          roleInfo.role === 'system_admin';
    
    if (!canManageEmail) {
      throw new Error("You don't have permission to create email accounts");
    }

    // Sanitize the data and encrypt passwords
    const sanitizedData = {
      email_address: accountData.email_address,
      imap_password: encryptPassword(accountData.imap_password),
      smtp_password: encryptPassword(accountData.smtp_password),
      display_name: accountData.display_name || accountData.email_address,
      server_config: accountData.server_config || {
        imap_server: 'bartalogistics.com',
        imap_port: 993,
        smtp_server: 'bartalogistics.com',
        smtp_port: 465,
        encryption: 'TLS'
      },
      status: 'active',
      createdBy: auth.currentUser.uid,
      createdByEmail: auth.currentUser.email,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    const docRef = await addDoc(collection(db, COLLECTIONS.EMAIL_ACCOUNTS), sanitizedData);
    
    return { id: docRef.id, ...sanitizedData };
  } catch (error) {
    console.error("Error creating email account:", error);
    throw error;
  }
};

/**
 * Get email account with decrypted passwords (Server-side only)
 * @param {string} accountId - Email account ID
 * @returns {Promise<Object>} Email account with decrypted passwords
 */
export const getEmailAccountWithPasswords = async (accountId) => {
  try {
    const accountRef = doc(db, COLLECTIONS.EMAIL_ACCOUNTS, accountId);
    const accountDoc = await getDoc(accountRef);
    
    if (!accountDoc.exists()) {
      throw new Error('Email account not found');
    }
    
    const accountData = accountDoc.data();
    
    // Decrypt passwords for server-side use
    return {
      id: accountDoc.id,
      ...accountData,
      imap_password: decryptPassword(accountData.imap_password),
      smtp_password: decryptPassword(accountData.smtp_password)
    };
  } catch (error) {
    console.error("Error getting email account with passwords:", error);
    throw error;
  }
};

/**
 * Get all email accounts (Admin only)
 * @returns {Promise<Array>} Array of email accounts
 */
export const getAllEmailAccounts = async () => {
  try {
    const roleInfo = await getUserRoleInfo();
    const canManageEmail = roleInfo.isAdmin || 
                          roleInfo.permissions.includes('manage_email') || 
                          roleInfo.role === 'system_admin';
    
    if (!canManageEmail) {
      throw new Error("You don't have permission to view email accounts");
    }

    const q = query(
      collection(db, COLLECTIONS.EMAIL_ACCOUNTS),
      orderBy("createdAt", "desc")
    );
    
    const querySnapshot = await getDocs(q);
    const accounts = [];
    
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      // Don't return passwords in the list view
      const { imap_password, smtp_password, ...safeData } = data;
      accounts.push({ id: doc.id, ...safeData });
    });
    
    return accounts;
  } catch (error) {
    console.error("Error getting email accounts:", error);
    throw error;
  }
};

/**
 * Email Assignment Management
 * Admin assigns email accounts to personnel
 */

/**
 * Assign email account to personnel (Admin only)
 * @param {string} personnelId - Personnel ID
 * @param {string} emailAccountId - Email account ID
 * @returns {Promise<{id: string}>} - The ID of the assignment
 */
export const assignEmailToPersonnel = async (personnelId, emailAccountId) => {
  try {
    if (!auth.currentUser) {
      throw new Error("You must be logged in to assign email accounts");
    }
    
    const roleInfo = await getUserRoleInfo();
    const canManageEmail = roleInfo.isAdmin || 
                          roleInfo.permissions.includes('manage_email') || 
                          roleInfo.role === 'system_admin';
    
    if (!canManageEmail) {
      throw new Error("You don't have permission to assign email accounts");
    }

    // Check if assignment already exists
    const existingQuery = query(
      collection(db, COLLECTIONS.EMAIL_ASSIGNMENTS),
      where("personnel_id", "==", personnelId),
      where("email_account_id", "==", emailAccountId),
      where("status", "==", "active")
    );
    
    const existingSnapshot = await getDocs(existingQuery);
    if (!existingSnapshot.empty) {
      throw new Error("This email account is already assigned to this personnel");
    }

    const assignmentData = {
      personnel_id: personnelId,
      email_account_id: emailAccountId,
      assigned_date: serverTimestamp(),
      status: 'active',
      createdBy: auth.currentUser.uid,
      createdByEmail: auth.currentUser.email,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    const docRef = await addDoc(collection(db, COLLECTIONS.EMAIL_ASSIGNMENTS), assignmentData);
    
    return { id: docRef.id, ...assignmentData };
  } catch (error) {
    console.error("Error assigning email to personnel:", error);
    throw error;
  }
};

/**
 * Get assigned email accounts for current user (Personnel)
 * @returns {Promise<Array>} Array of assigned email accounts
 */
export const getMyAssignedEmailAccounts = async () => {
  try {
    if (!auth.currentUser) {
      throw new Error("You must be logged in to view assigned email accounts");
    }

    // First, get the personnel record for the current user
    const personnelQuery = query(
      collection(db, "personnel"),
      where("userId", "==", auth.currentUser.uid)
    );
    
    const personnelSnapshot = await getDocs(personnelQuery);
    if (personnelSnapshot.empty) {
      return []; // No personnel record found
    }
    
    const personnelDoc = personnelSnapshot.docs[0];
    const personnelId = personnelDoc.id;

    // Get active assignments for this personnel
    const assignmentsQuery = query(
      collection(db, COLLECTIONS.EMAIL_ASSIGNMENTS),
      where("personnel_id", "==", personnelId),
      where("status", "==", "active")
    );
    
    const assignmentsSnapshot = await getDocs(assignmentsQuery);
    const assignments = [];
    
    // Get the email account details for each assignment
    for (const assignmentDoc of assignmentsSnapshot.docs) {
      const assignmentData = assignmentDoc.data();
      
      // Get the email account details
      const accountDoc = await getDoc(doc(db, COLLECTIONS.EMAIL_ACCOUNTS, assignmentData.email_account_id));
      if (accountDoc.exists()) {
        const accountData = accountDoc.data();
        // Don't return passwords to personnel
        const { imap_password, smtp_password, ...safeAccountData } = accountData;
        
        assignments.push({
          assignmentId: assignmentDoc.id,
          accountId: assignmentData.email_account_id,
          ...safeAccountData,
          assigned_date: assignmentData.assigned_date
        });
      }
    }
    
    return assignments;
  } catch (error) {
    console.error("Error getting assigned email accounts:", error);
    throw error;
  }
};

/**
 * Email Folder Management
 * Cache email folders for each account
 */

/**
 * Save email folders for an account
 * @param {string} accountId - Email account ID
 * @param {Array} folders - Array of folder objects
 * @returns {Promise<void>}
 */
export const saveEmailFolders = async (accountId, folders) => {
  try {
    const batch = writeBatch(db);
    
    // Delete existing folders for this account
    const existingQuery = query(
      collection(db, COLLECTIONS.EMAIL_FOLDERS),
      where("account_id", "==", accountId)
    );
    
    const existingSnapshot = await getDocs(existingQuery);
    existingSnapshot.forEach((doc) => {
      batch.delete(doc.ref);
    });
    
    // Add new folders
    folders.forEach((folder) => {
      const folderRef = doc(collection(db, COLLECTIONS.EMAIL_FOLDERS));
      batch.set(folderRef, {
        account_id: accountId,
        folder_name: folder.name,
        folder_path: folder.path,
        message_count: folder.messageCount || 0,
        last_sync_date: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    });
    
    await batch.commit();
  } catch (error) {
    console.error("Error saving email folders:", error);
    throw error;
  }
};

/**
 * Email Message Management
 * Cache email messages for performance
 */

/**
 * Save email messages for a folder
 * @param {string} accountId - Email account ID
 * @param {string} folderId - Folder ID
 * @param {Array} messages - Array of message objects
 * @returns {Promise<void>}
 */
export const saveEmailMessages = async (accountId, folderId, messages) => {
  try {
    const batch = writeBatch(db);
    
    messages.forEach((message) => {
      const messageRef = doc(collection(db, COLLECTIONS.EMAIL_MESSAGES));
      batch.set(messageRef, {
        account_id: accountId,
        folder_id: folderId,
        message_uid: message.uid,
        subject: message.subject || '',
        sender: message.from || '',
        recipient: message.to || '',
        body_text: message.text || '',
        body_html: message.html || '',
        received_date: message.date || serverTimestamp(),
        read_status: message.flags && message.flags.includes('\\Seen') ? 'read' : 'unread',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    });
    
    await batch.commit();
  } catch (error) {
    console.error("Error saving email messages:", error);
    throw error;
  }
};

/**
 * Email Sync Status Management
 * Track synchronization status for folders
 */

/**
 * Update sync status for a folder
 * @param {string} accountId - Email account ID
 * @param {string} folderId - Folder ID
 * @param {string} lastSyncUid - Last synchronized UID
 * @param {string} status - Sync status
 * @returns {Promise<void>}
 */
export const updateSyncStatus = async (accountId, folderId, lastSyncUid, status = 'completed') => {
  try {
    // Check if sync status record exists
    const syncQuery = query(
      collection(db, COLLECTIONS.EMAIL_SYNC_STATUS),
      where("account_id", "==", accountId),
      where("folder_id", "==", folderId)
    );
    
    const syncSnapshot = await getDocs(syncQuery);
    
    const syncData = {
      account_id: accountId,
      folder_id: folderId,
      last_sync_uid: lastSyncUid,
      last_sync_date: serverTimestamp(),
      sync_status: status,
      updatedAt: serverTimestamp()
    };
    
    if (syncSnapshot.empty) {
      // Create new sync status record
      await addDoc(collection(db, COLLECTIONS.EMAIL_SYNC_STATUS), {
        ...syncData,
        createdAt: serverTimestamp()
      });
    } else {
      // Update existing sync status record
      const syncDoc = syncSnapshot.docs[0];
      await updateDoc(syncDoc.ref, syncData);
    }
  } catch (error) {
    console.error("Error updating sync status:", error);
    throw error;
  }
};

export { COLLECTIONS }; 