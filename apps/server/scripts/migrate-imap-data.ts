import { getWorkersFirestore } from '../src/lib/firestore-client';
import { decryptStoredPassword } from '../src/lib/encryption';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { connection } from '../src/db/schema';
import { eq } from 'drizzle-orm';

// Migration script to transfer IMAP data from Firestore to SQL
async function migrateImapData() {
  console.log('🚀 Starting IMAP data migration from Firestore to SQL...');

  try {
    // Initialize Firestore client
    const firestore = getWorkersFirestore();
    console.log('✅ Firestore client initialized');

    // Initialize SQL database (you'll need to set up the connection URL)
    const client = createClient({
      url: process.env.DATABASE_URL || 'file:./dev.db', // Update with your DB URL
    });
    const db = drizzle(client);
    console.log('✅ SQL database connected');

    // Step 1: Get all personnel documents to map userId to personnelId
    console.log('📖 Fetching personnel documents...');
    const personnelDocs = await firestore.getAllDocuments('personnel');
    console.log(`Found ${personnelDocs.length} personnel documents`);

    const userIdToPersonnelId = new Map<string, string>();
    personnelDocs.forEach(doc => {
      if (doc.data?.userId) {
        userIdToPersonnelId.set(doc.data.userId, doc.id);
      }
    });
    console.log(`Mapped ${userIdToPersonnelId.size} userId -> personnelId relationships`);

    // Step 2: Get all active email assignments
    console.log('📖 Fetching email assignments...');
    const assignments = await firestore.queryCollection('email_assignments', [
      { field: 'status', op: '==', value: 'active' }
    ]);
    console.log(`Found ${assignments.length} active email assignments`);

    // Step 3: Process each assignment and migrate to SQL
    let migratedCount = 0;
    let errorCount = 0;

    for (const assignment of assignments) {
      try {
        const assignmentData = assignment.data;
        const personnelId = assignmentData.personnel_id;
        const emailAccountId = assignmentData.email_account_id;

        // Find the userId for this personnel
        const userId = Array.from(userIdToPersonnelId.entries())
          .find(([, id]) => id === personnelId)?.[0];

        if (!userId) {
          console.warn(`❌ No userId found for personnel ${personnelId}, skipping...`);
          errorCount++;
          continue;
        }

        // Get the email account data
        const accountDoc = await firestore.getDocument(`email_accounts/${emailAccountId}`);
        if (!accountDoc?.exists || !accountDoc.data) {
          console.warn(`❌ Email account ${emailAccountId} not found, skipping...`);
          errorCount++;
          continue;
        }

        const account = accountDoc.data;
        console.log(`🔄 Processing ${account.email_address} for user ${userId}...`);

        // Check if connection already exists
        const existingConnection = await db
          .select()
          .from(connection)
          .where(eq(connection.email, account.email_address))
          .where(eq(connection.userId, userId));

        if (existingConnection.length > 0) {
          console.log(`⏭️  Connection already exists for ${account.email_address}, skipping...`);
          continue;
        }

        // Decrypt the IMAP password
        let decryptedPassword: string;
        try {
          decryptedPassword = await decryptStoredPassword(account.imap_password);
          console.log(`🔓 Successfully decrypted password for ${account.email_address}`);
        } catch (error) {
          console.error(`❌ Failed to decrypt password for ${account.email_address}:`, error);
          errorCount++;
          continue;
        }

        // Parse server config
        const serverConfig = account.server_config || {};
        
        // Insert into SQL database
        await db.insert(connection).values({
          id: crypto.randomUUID(),
          userId: userId,
          email: account.email_address,
          name: account.display_name || account.email_address,
          picture: '', // IMAP doesn't have profile pictures
          
          // OAuth fields (null for IMAP)
          accessToken: null,
          refreshToken: null,
          scope: null,
          expiresAt: null,
          
          // Provider
          providerId: 'imap',
          
          // IMAP configuration
          imapHost: serverConfig.imap_server,
          imapPort: parseInt(serverConfig.imap_port) || 993,
          imapTls: serverConfig.encryption === 'TLS',
          smtpHost: serverConfig.smtp_server,
          smtpPort: parseInt(serverConfig.smtp_port) || 465,
          smtpTls: serverConfig.encryption === 'TLS',
          encryptedPassword: account.imap_password, // Store original encrypted format
          
          // Timestamps
          createdAt: account.createdAt || new Date(),
          updatedAt: account.updatedAt || new Date(),
        });

        console.log(`✅ Migrated ${account.email_address} to SQL database`);
        migratedCount++;

      } catch (error) {
        console.error(`❌ Error processing assignment ${assignment.id}:`, error);
        errorCount++;
      }
    }

    console.log('\n🎉 Migration completed!');
    console.log(`✅ Successfully migrated: ${migratedCount} connections`);
    console.log(`❌ Errors encountered: ${errorCount} connections`);
    
    if (migratedCount > 0) {
      console.log('\n📋 Next steps:');
      console.log('1. Test the connections with mail.count and labels.list');
      console.log('2. Verify email operations work correctly');
      console.log('3. Remove Firestore fallback code if everything works');
    }

  } catch (error) {
    console.error('💥 Migration failed:', error);
    process.exit(1);
  }
}

// Run the migration
if (require.main === module) {
  migrateImapData().then(() => {
    console.log('Migration script completed');
    process.exit(0);
  }).catch((error) => {
    console.error('Migration script failed:', error);
    process.exit(1);
  });
}

export { migrateImapData }; 