// Server-side email service for API routes
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
import { adminFirestore } from "@/lib/firebaseAdmin";
import { encryptPassword, decryptPassword } from "@/lib/encryption";
import ImapSimple from 'imap-simple';
import { simpleParser } from 'mailparser';
import { convert } from 'html-to-text';

// Collection names for email system
const COLLECTIONS = {
  EMAIL_ACCOUNTS: "email_accounts",
  EMAIL_ASSIGNMENTS: "email_assignments", 
  EMAIL_FOLDERS: "email_folders",
  EMAIL_MESSAGES: "email_messages",
  EMAIL_SYNC_STATUS: "email_sync_status"
};

/**
 * Create a new email account (Admin only) - Server-side
 * @param {Object} accountData - Email account data
 * @param {string} createdBy - User ID who created the account
 * @param {string} createdByEmail - Email of user who created the account
 * @returns {Promise<{id: string}>} - The ID of the created account
 */
export const createEmailAccount = async (accountData, createdBy, createdByEmail) => {
  try {
    const db = adminFirestore();
    
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
      createdBy: createdBy,
      createdByEmail: createdByEmail,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const docRef = await db.collection(COLLECTIONS.EMAIL_ACCOUNTS).add(sanitizedData);
    
    return { id: docRef.id, ...sanitizedData };
  } catch (error) {
    console.error("Error creating email account:", error);
    throw error;
  }
};

/**
 * Get all email accounts (Admin only) - Server-side
 * @returns {Promise<Array>} Array of email accounts
 */
export const getAllEmailAccounts = async () => {
  try {
    const db = adminFirestore();
    
    const snapshot = await db.collection(COLLECTIONS.EMAIL_ACCOUNTS)
      .orderBy("createdAt", "desc")
      .get();
    
    const accounts = [];
    
    snapshot.forEach((doc) => {
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
 * Get email account with decrypted passwords (Server-side only)
 * @param {string} accountId - Email account ID
 * @returns {Promise<Object>} Email account with decrypted passwords
 */
export const getEmailAccountWithPasswords = async (accountId) => {
  try {
    const db = adminFirestore();
    
    const doc = await db.collection(COLLECTIONS.EMAIL_ACCOUNTS).doc(accountId).get();
    
    if (!doc.exists) {
      throw new Error('Email account not found');
    }
    
    const accountData = doc.data();
    
    // Decrypt passwords for server-side use
    return {
      id: doc.id,
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
 * Assign email account to personnel (Admin only) - Server-side
 * @param {string} personnelId - Personnel ID
 * @param {string} emailAccountId - Email account ID
 * @param {string} createdBy - User ID who created the assignment
 * @param {string} createdByEmail - Email of user who created the assignment
 * @returns {Promise<{id: string}>} - The ID of the assignment
 */
export const assignEmailToPersonnel = async (personnelId, emailAccountId, createdBy, createdByEmail) => {
  try {
    const db = adminFirestore();
    
    // Check if assignment already exists
    const existingSnapshot = await db.collection(COLLECTIONS.EMAIL_ASSIGNMENTS)
      .where("personnel_id", "==", personnelId)
      .where("email_account_id", "==", emailAccountId)
      .where("status", "==", "active")
      .get();
    
    if (!existingSnapshot.empty) {
      throw new Error("This email account is already assigned to this personnel");
    }

    const assignmentData = {
      personnel_id: personnelId,
      email_account_id: emailAccountId,
      assigned_date: new Date(),
      status: 'active',
      createdBy: createdBy,
      createdByEmail: createdByEmail,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const docRef = await db.collection(COLLECTIONS.EMAIL_ASSIGNMENTS).add(assignmentData);
    
    return { id: docRef.id, ...assignmentData };
  } catch (error) {
    console.error("Error assigning email to personnel:", error);
    throw error;
  }
};

/**
 * Create a new email assignment (Admin only) - Server-side
 * @param {Object} assignmentData - Assignment data
 * @returns {Promise<Object>} Created assignment
 */
export const createEmailAssignment = async (assignmentData) => {
  try {
    const db = adminFirestore();
    
    // Check if assignment already exists
    const existingSnapshot = await db.collection(COLLECTIONS.EMAIL_ASSIGNMENTS)
      .where("personnel_id", "==", assignmentData.personnel_id)
      .where("email_account_id", "==", assignmentData.email_account_id)
      .where("status", "==", "active")
      .get();
    
    if (!existingSnapshot.empty) {
      throw new Error("This email account is already assigned to this personnel");
    }

    const newAssignment = {
      personnel_id: assignmentData.personnel_id,
      email_account_id: assignmentData.email_account_id,
      assigned_by: assignmentData.assigned_by,
      assigned_date: new Date(),
      status: assignmentData.status || 'active',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const docRef = await db.collection(COLLECTIONS.EMAIL_ASSIGNMENTS).add(newAssignment);
    
    return { id: docRef.id, ...newAssignment };
  } catch (error) {
    console.error("Error creating email assignment:", error);
    throw error;
  }
};

/**
 * Get all email assignments (Admin only) - Server-side
 * @returns {Promise<Array>} Array of email assignments
 */
export const getAllEmailAssignments = async () => {
  try {
    const db = adminFirestore();
    
    const snapshot = await db.collection(COLLECTIONS.EMAIL_ASSIGNMENTS)
      .orderBy("createdAt", "desc")
      .get();
    
    const assignments = [];
    
    snapshot.forEach((doc) => {
      assignments.push({ id: doc.id, ...doc.data() });
    });
    
    return assignments;
  } catch (error) {
    console.error("Error getting email assignments:", error);
    throw error;
  }
};

/**
 * Update email assignment (Admin only) - Server-side
 * @param {string} assignmentId - Assignment ID
 * @param {Object} updateData - Data to update
 * @returns {Promise<Object>} Updated assignment
 */
export const updateEmailAssignment = async (assignmentId, updateData) => {
  try {
    const db = adminFirestore();
    
    const assignmentRef = db.collection(COLLECTIONS.EMAIL_ASSIGNMENTS).doc(assignmentId);
    const assignmentDoc = await assignmentRef.get();
    
    if (!assignmentDoc.exists) {
      throw new Error('Assignment not found');
    }
    
    const updatedData = {
      ...updateData,
      updatedAt: new Date()
    };
    
    await assignmentRef.update(updatedData);
    
    const updatedDoc = await assignmentRef.get();
    return { id: updatedDoc.id, ...updatedDoc.data() };
  } catch (error) {
    console.error("Error updating email assignment:", error);
    throw error;
  }
};

/**
 * Delete email assignment (Admin only) - Server-side
 * @param {string} assignmentId - Assignment ID
 * @returns {Promise<void>}
 */
export const deleteEmailAssignment = async (assignmentId) => {
  try {
    const db = adminFirestore();
    
    const assignmentRef = db.collection(COLLECTIONS.EMAIL_ASSIGNMENTS).doc(assignmentId);
    const assignmentDoc = await assignmentRef.get();
    
    if (!assignmentDoc.exists) {
      throw new Error('Assignment not found');
    }
    
    await assignmentRef.delete();
  } catch (error) {
    console.error("Error deleting email assignment:", error);
    throw error;
  }
};

/**
 * Get assignments by personnel ID - Server-side
 * @param {string} personnelId - Personnel ID
 * @returns {Promise<Array>} Array of assignments for the personnel
 */
export const getAssignmentsByPersonnel = async (personnelId) => {
  try {
    const db = adminFirestore();
    
    const snapshot = await db.collection(COLLECTIONS.EMAIL_ASSIGNMENTS)
      .where("personnel_id", "==", personnelId)
      .orderBy("createdAt", "desc")
      .get();
    
    const assignments = [];
    
    snapshot.forEach((doc) => {
      assignments.push({ id: doc.id, ...doc.data() });
    });
    
    return assignments;
  } catch (error) {
    console.error("Error getting assignments by personnel:", error);
    throw error;
  }
};

/**
 * Get assignments by email account ID - Server-side
 * @param {string} emailAccountId - Email account ID
 * @returns {Promise<Array>} Array of assignments for the email account
 */
export const getAssignmentsByEmailAccount = async (emailAccountId) => {
  try {
    const db = adminFirestore();
    
    const snapshot = await db.collection(COLLECTIONS.EMAIL_ASSIGNMENTS)
      .where("email_account_id", "==", emailAccountId)
      .orderBy("createdAt", "desc")
      .get();
    
    const assignments = [];
    
    snapshot.forEach((doc) => {
      assignments.push({ id: doc.id, ...doc.data() });
    });
    
    return assignments;
  } catch (error) {
    console.error("Error getting assignments by email account:", error);
    throw error;
  }
};

/**
 * Create IMAP connection for email account
 * @param {string} emailAccountId - Email account ID
 * @returns {Promise<Object>} IMAP connection object
 */
export const createImapConnection = async (emailAccountId) => {
  try {
    const account = await getEmailAccountWithPasswords(emailAccountId);
    
    const config = {
      imap: {
        user: account.email_address,
        password: account.imap_password,
        host: account.server_config.imap_server,
        port: account.server_config.imap_port,
        tls: true,
        authTimeout: 30000,
        connTimeout: 30000,
        tlsOptions: {
          servername: account.server_config.imap_server,
          rejectUnauthorized: false
        }
      }
    };

    const connection = await ImapSimple.connect(config);
    return connection;
  } catch (error) {
    console.error("Error creating IMAP connection:", error);
    throw error;
  }
};

/**
 * Get folders for an email account
 * @param {string} emailAccountId - Email account ID
 * @returns {Promise<Array>} Array of folders
 */
export const getEmailFolders = async (emailAccountId) => {
  try {
    const connection = await createImapConnection(emailAccountId);
    
    const folders = await connection.getBoxes();
    connection.end();
    
    // Convert folder structure to flat array
    const flatFolders = [];
    
    const processFolders = (folderObj, parentPath = '') => {
      Object.keys(folderObj).forEach(folderName => {
        const folder = folderObj[folderName];
        
        // Build full path based on folder structure
        let fullPath = parentPath ? `${parentPath}${folder.delimiter || '/'}${folderName}` : folderName;
        
        // Handle different mail server configurations
        if (parentPath === 'INBOX') {
          // Try different variations based on mail server type
          const variations = [
            folderName, // Standard: "Sent"
            `INBOX${folder.delimiter || '.'}${folderName}`, // Some servers: "INBOX.Sent"
            `INBOX${folder.delimiter || '/'}${folderName}`, // Some servers: "INBOX/Sent"
          ];
          
          // Use the first variation as default, but store all for testing
          fullPath = variations[0];
        }
        
        if (folder.attribs && !folder.attribs.includes('\\Noselect')) {
          flatFolders.push({
            name: folderName,
            path: fullPath,
            originalPath: parentPath ? `${parentPath}${folder.delimiter || '/'}${folderName}` : folderName,
            delimiter: folder.delimiter,
            attributes: folder.attribs || [],
            parentPath: parentPath
          });
        }
        
        if (folder.children) {
          processFolders(folder.children, fullPath);
        }
      });
    };
    
    processFolders(folders);
    
    // Cache folders in database
    await cacheFolders(emailAccountId, flatFolders);
    
    return flatFolders;
  } catch (error) {
    console.error("Error getting email folders:", error);
    throw error;
  }
};

/**
 * Cache folders in database
 * @param {string} emailAccountId - Email account ID
 * @param {Array} folders - Array of folders
 */
const cacheFolders = async (emailAccountId, folders) => {
  try {
    const db = adminFirestore();
    
    // Clear existing folders for this account
    const existingFolders = await db.collection(COLLECTIONS.EMAIL_FOLDERS)
      .where("account_id", "==", emailAccountId)
      .get();
    
    const batch = db.batch();
    existingFolders.forEach(doc => {
      batch.delete(doc.ref);
    });
    
    // Add new folders
    folders.forEach(folder => {
      const docRef = db.collection(COLLECTIONS.EMAIL_FOLDERS).doc();
      batch.set(docRef, {
        account_id: emailAccountId,
        folder_name: folder.name,
        folder_path: folder.path,
        delimiter: folder.delimiter,
        attributes: folder.attributes,
        message_count: 0,
        last_sync_date: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      });
    });
    
    await batch.commit();
  } catch (error) {
    console.error("Error caching folders:", error);
    throw error;
  }
};

/**
 * Get messages from a specific folder
 * @param {string} emailAccountId - Email account ID
 * @param {string} folderPath - Folder path (e.g., 'INBOX')
 * @param {number} limit - Number of messages to retrieve (default: 200)
 * @returns {Promise<Array>} Array of messages
 */
export const getEmailMessages = async (emailAccountId, folderPath = 'INBOX', limit = 200) => {
  try {
    console.log('Fetching messages from IMAP for account:', emailAccountId, 'folder:', folderPath);
    
    const connection = await createImapConnection(emailAccountId);
    
    // Try to open the folder - if it fails, try alternative paths
    let actualFolderPath = folderPath;
    let folderOpened = false;
    
    // List of possible folder path variations to try
    const folderVariations = [
      folderPath, // Original path
      `INBOX.${folderPath}`, // Some servers use dot notation
      `INBOX/${folderPath}`, // Some servers use slash notation
      `INBOX.${folderPath.replace('INBOX/', '')}`, // Remove INBOX prefix and try with dot
      folderPath.replace('INBOX/', ''), // Just the folder name without prefix
    ];
    
    // Remove duplicates
    const uniqueVariations = [...new Set(folderVariations)];
    
    for (const variation of uniqueVariations) {
      try {
        console.log(`Trying to open folder with path: ${variation}`);
        await connection.openBox(variation);
        actualFolderPath = variation;
        folderOpened = true;
        console.log(`Successfully opened folder: ${variation}`);
        break;
      } catch (folderError) {
        console.log(`Failed to open folder with path ${variation}:`, folderError.message);
        // Continue to next variation
      }
    }
    
    if (!folderOpened) {
      connection.end();
      throw new Error(`Unable to access folder ${folderPath}. Tried paths: ${uniqueVariations.join(', ')}`);
    }
    
    // Get recent messages using simple search
    const searchCriteria = ['ALL'];
    const fetchOptions = {
      bodies: 'HEADER.FIELDS (FROM TO SUBJECT DATE)',
      markSeen: false,
      struct: true
    };
    
    const messages = await connection.search(searchCriteria, fetchOptions);
    console.log('Retrieved', messages.length, 'messages from IMAP');
    
    // Format messages with safe property access
    const formattedMessages = [];
    const usedUids = new Set();
    
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      try {
        // Safe access to message properties
        const attributes = msg.attributes || {};
        const header = msg.parts?.[0]?.body || {};
        
        // Generate unique UID - use IMAP UID if available, otherwise create unique ID
        let uid = attributes.uid;
        if (!uid || usedUids.has(uid)) {
          // Create a unique ID using index + timestamp + random
          uid = `${emailAccountId}_${actualFolderPath}_${i}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        }
        usedUids.add(uid);
        
        // Parse header fields safely
        const from = Array.isArray(header.from) ? header.from[0] : header.from || 'Unknown';
        const to = Array.isArray(header.to) ? header.to[0] : header.to || 'Unknown';
        const subject = Array.isArray(header.subject) ? header.subject[0] : header.subject || 'No Subject';
        const date = Array.isArray(header.date) ? header.date[0] : header.date || new Date().toISOString();
        
        const formattedMessage = {
          uid: uid,
          messageId: uid, // Use the same unique ID
          from: from,
          to: to,
          subject: subject,
          date: new Date(date),
          flags: attributes.flags || [],
          size: attributes.size || 0,
          seen: attributes.flags?.includes('\\Seen') || false,
          read: attributes.flags?.includes('\\Seen') || false, // Add read property for compatibility
          folder_path: folderPath, // Use original folder path for consistency
          actual_folder_path: actualFolderPath, // Store actual path used
          account_id: emailAccountId
        };
        
        formattedMessages.push(formattedMessage);
      } catch (msgError) {
        console.error('Error processing message:', msgError);
        // Continue with other messages
      }
    }
    
    connection.end();
    
    // Sort by date (newest first) with safe date handling
    const sortedMessages = formattedMessages
      .sort((a, b) => {
        const dateA = new Date(a.date);
        const dateB = new Date(b.date);
        return dateB.getTime() - dateA.getTime();
      })
      .slice(0, limit);
    
    console.log('Processed', sortedMessages.length, 'messages successfully');
    
    // Cache the messages
    await cacheMessages(emailAccountId, folderPath, sortedMessages);
    
    return sortedMessages;
  } catch (error) {
    console.error("Error getting email messages:", error);
    throw error;
  }
};

/**
 * Cache messages in database
 * @param {string} emailAccountId - Email account ID
 * @param {string} folderPath - Folder path
 * @param {Array} messages - Array of messages
 */
const cacheMessages = async (emailAccountId, folderPath, messages) => {
  try {
    const db = adminFirestore();
    
    // Clear existing messages for this folder
    const existingMessages = await db.collection(COLLECTIONS.EMAIL_MESSAGES)
      .where("account_id", "==", emailAccountId)
      .where("folder_path", "==", folderPath)
      .get();
    
    const batch = db.batch();
    existingMessages.forEach(doc => {
      batch.delete(doc.ref);
    });
    
    // Add new messages
    messages.forEach(message => {
      const docRef = db.collection(COLLECTIONS.EMAIL_MESSAGES).doc();
      batch.set(docRef, {
        ...message,
        createdAt: new Date(),
        updatedAt: new Date()
      });
    });
    
    await batch.commit();
    
    // Update folder message count
    const folderQuery = await db.collection(COLLECTIONS.EMAIL_FOLDERS)
      .where("account_id", "==", emailAccountId)
      .where("folder_path", "==", folderPath)
      .get();
    
    if (!folderQuery.empty) {
      const folderDoc = folderQuery.docs[0];
      await folderDoc.ref.update({
        message_count: messages.length,
        last_sync_date: new Date(),
        updatedAt: new Date()
      });
    }
  } catch (error) {
    console.error("Error caching messages:", error);
    throw error;
  }
};

/**
 * Get full message content by UID
 * @param {string} emailAccountId - Email account ID
 * @param {string} folderPath - Folder path
 * @param {number} uid - Message UID
 * @returns {Promise<Object>} Full message content
 */
export const getEmailMessageContent = async (emailAccountId, folderPath, uid) => {
  try {
    const connection = await createImapConnection(emailAccountId);
    
    // Try to open the folder - if it fails, try alternative paths
    let actualFolderPath = folderPath;
    let folderOpened = false;
    
    // List of possible folder path variations to try
    const folderVariations = [
      folderPath, // Original path
      `INBOX.${folderPath}`, // Some servers use dot notation
      `INBOX/${folderPath}`, // Some servers use slash notation
      `INBOX.${folderPath.replace('INBOX/', '')}`, // Remove INBOX prefix and try with dot
      folderPath.replace('INBOX/', ''), // Just the folder name without prefix
    ];
    
    // Remove duplicates
    const uniqueVariations = [...new Set(folderVariations)];
    
    for (const variation of uniqueVariations) {
      try {
        console.log(`Trying to open folder with path: ${variation}`);
        await connection.openBox(variation);
        actualFolderPath = variation;
        folderOpened = true;
        console.log(`Successfully opened folder: ${variation}`);
        break;
      } catch (folderError) {
        console.log(`Failed to open folder with path ${variation}:`, folderError.message);
        // Continue to next variation
      }
    }
    
    if (!folderOpened) {
      connection.end();
      throw new Error(`Unable to access folder ${folderPath}. Tried paths: ${uniqueVariations.join(', ')}`);
    }
    
    const fetchOptions = {
      bodies: '',
      markSeen: false,
      struct: true
    };
    
    const messages = await connection.search([['UID', uid]], fetchOptions);
    
    if (messages.length === 0) {
      connection.end();
      throw new Error('Message not found');
    }
    
    const message = messages[0];
    const fullBody = message.parts.find(part => part.which === '').body;
    
    connection.end();
    
    // Parse the full message
    const parsed = await simpleParser(fullBody);
    
    // Convert HTML to text if needed
    const textBody = parsed.text || (parsed.html ? convert(parsed.html) : '');
    
    return {
      uid: message.attributes.uid,
      message_id: parsed.messageId,
      subject: parsed.subject || 'No Subject',
      from: parsed.from ? parsed.from.text : 'Unknown Sender',
      to: parsed.to ? parsed.to.text : '',
      cc: parsed.cc ? parsed.cc.text : '',
      bcc: parsed.bcc ? parsed.bcc.text : '',
      date: parsed.date || new Date(),
      html: parsed.html || '',
      text: textBody,
      attachments: parsed.attachments || [],
      read: message.attributes.flags.includes('\\Seen'),
      folder_path: folderPath,
      actual_folder_path: actualFolderPath,
      account_id: emailAccountId
    };
  } catch (error) {
    console.error("Error getting email message content:", error);
    throw error;
  }
};

/**
 * Get cached messages from database
 * @param {string} emailAccountId - Email account ID
 * @param {string} folderPath - Folder path
 * @returns {Promise<Array>} Array of cached messages
 */
export const getCachedMessages = async (emailAccountId, folderPath) => {
  try {
    const db = adminFirestore();
    
    console.log('Getting cached messages for account:', emailAccountId, 'folder:', folderPath);
    
    // Try query without orderBy to avoid index issues
    const snapshot = await db.collection(COLLECTIONS.EMAIL_MESSAGES)
      .where("account_id", "==", emailAccountId)
      .where("folder_path", "==", folderPath)
      .limit(200)
      .get();
    
    const messages = [];
    
    snapshot.forEach((doc) => {
      const data = doc.data();
      messages.push({
        id: doc.id,
        uid: data.uid,
        messageId: data.messageId,
        from: data.from,
        to: data.to,
        subject: data.subject,
        date: data.date && data.date.toDate ? data.date.toDate() : new Date(data.date),
        read: data.read,
        seen: data.seen,
        size: data.size,
        folder_path: data.folder_path,
        account_id: data.account_id
      });
    });
    
    // Sort by date in memory (newest first)
    messages.sort((a, b) => {
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);
      return dateB.getTime() - dateA.getTime();
    });
    
    console.log('Retrieved', messages.length, 'cached messages');
    return messages;
  } catch (error) {
    console.error("Error getting cached messages:", error);
    return [];
  }
};

/**
 * Get user's assigned email accounts
 * @param {string} userId - User ID from Firebase Auth
 * @returns {Promise<Array>} Array of assigned email accounts
 */
export const getUserAssignedAccounts = async (userId) => {
  try {
    const db = adminFirestore();
    
    // First, try to get personnel record for this user by userId
    const personnelQueryByUserId = await db.collection('personnel')
      .where('userId', '==', userId)
      .get();
    
    let personnelId = null;
    
    if (!personnelQueryByUserId.empty) {
      // Found personnel record with userId
      personnelId = personnelQueryByUserId.docs[0].id;
      console.log('Found personnel record by userId:', personnelId);
    } else {
      // Fallback: try to find by createdBy field (for older records)
      console.log('No personnel record found with userId, trying createdBy field...');
      const personnelQueryByCreatedBy = await db.collection('personnel')
        .where('createdBy', '==', userId)
        .get();
      
      if (!personnelQueryByCreatedBy.empty) {
        personnelId = personnelQueryByCreatedBy.docs[0].id;
        console.log('Found personnel record by createdBy:', personnelId);
      } else {
        // If we still can't find a personnel record, return empty array
        console.log('No personnel record found for user:', userId);
        return [];
      }
    }
    
    // Get active assignments for this personnel
    const assignmentsQuery = await db.collection(COLLECTIONS.EMAIL_ASSIGNMENTS)
      .where('personnel_id', '==', personnelId)
      .where('status', '==', 'active')
      .get();
    
    if (assignmentsQuery.empty) {
      console.log('No active email assignments found for personnel:', personnelId);
      return [];
    }
    
    // Get email accounts for these assignments
    const emailAccountIds = assignmentsQuery.docs.map(doc => doc.data().email_account_id);
    const emailAccounts = [];
    
    for (const accountId of emailAccountIds) {
      const accountDoc = await db.collection(COLLECTIONS.EMAIL_ACCOUNTS).doc(accountId).get();
      if (accountDoc.exists) {
        const accountData = accountDoc.data();
        // Don't return passwords
        const { imap_password, smtp_password, ...safeData } = accountData;
        emailAccounts.push({
          id: accountDoc.id,
          ...safeData
        });
      }
    }
    
    console.log('Returning', emailAccounts.length, 'email accounts for user:', userId);
    return emailAccounts;
  } catch (error) {
    console.error("Error getting user assigned accounts:", error);
    throw error;
  }
};

/**
 * Send email message
 * @param {string} emailAccountId - Email account ID
 * @param {Object} emailData - Email data (to, cc, bcc, subject, body)
 * @returns {Promise<Object>} Send result
 */
export const sendEmailMessage = async (emailAccountId, emailData) => {
  try {
    // Get account with credentials
    const account = await getEmailAccountWithPasswords(emailAccountId);
    
    // Import nodemailer
    const nodemailer = await import('nodemailer');
    
    // Create transporter
    const transporter = nodemailer.default.createTransporter({
      host: account.server_config.smtp_server,
      port: account.server_config.smtp_port,
      secure: account.server_config.smtp_port === 465, // true for 465, false for other ports
      auth: {
        user: account.email_address,
        pass: account.smtp_password
      },
      tls: {
        rejectUnauthorized: false
      }
    });

    // Prepare email options
    const mailOptions = {
      from: account.email_address,
      to: emailData.to,
      subject: emailData.subject,
      text: emailData.body
    };

    // Add CC and BCC if provided
    if (emailData.cc) {
      mailOptions.cc = emailData.cc;
    }
    if (emailData.bcc) {
      mailOptions.bcc = emailData.bcc;
    }

    // Send email
    const info = await transporter.sendMail(mailOptions);
    
    console.log('Email sent successfully:', info.messageId);
    
    return {
      success: true,
      messageId: info.messageId,
      response: info.response
    };
  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  }
};

/**
 * Update message read status in database
 * @param {string} emailAccountId - Email account ID
 * @param {string} folderPath - Folder path
 * @param {string} uid - Message UID
 * @param {boolean} read - Read status
 * @returns {Promise<Object>} Updated message
 */
export const updateMessageReadStatus = async (emailAccountId, folderPath, uid, read) => {
  try {
    const db = adminFirestore();
    
    // Find the message in the database
    const messageQuery = await db.collection(COLLECTIONS.EMAIL_MESSAGES)
      .where("account_id", "==", emailAccountId)
      .where("folder_path", "==", folderPath)
      .where("uid", "==", uid)
      .get();
    
    if (messageQuery.empty) {
      throw new Error('Message not found');
    }
    
    const messageDoc = messageQuery.docs[0];
    const messageData = messageDoc.data();
    
    // Update the read status
    await messageDoc.ref.update({
      read: read,
      seen: read, // Also update seen for compatibility
      updatedAt: new Date()
    });
    
    // Return the updated message
    const updatedData = {
      id: messageDoc.id,
      uid: messageData.uid,
      messageId: messageData.messageId,
      from: messageData.from,
      to: messageData.to,
      subject: messageData.subject,
      date: messageData.date && messageData.date.toDate ? messageData.date.toDate() : new Date(messageData.date),
      read: read,
      seen: read,
      size: messageData.size,
      folder_path: messageData.folder_path,
      account_id: messageData.account_id
    };
    
    console.log('Updated message read status:', uid, 'read:', read);
    return updatedData;
  } catch (error) {
    console.error("Error updating message read status:", error);
    throw error;
  }
};

export { COLLECTIONS }; 