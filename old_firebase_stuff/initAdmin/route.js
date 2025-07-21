import { NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebaseAdmin';

/**
 * API route to initialize the root admin user
 * This should only be called once during initial setup
 * 
 * @returns {NextResponse} Success or error message
 */
export async function GET() {
  try {
    // Security check: Only allow this to be run in development or with a special header
    const isProduction = process.env.NODE_ENV === 'production';
    
    if (isProduction) {
      return NextResponse.json(
        { error: 'This endpoint is disabled in production for security reasons' },
        { status: 403 }
      );
    }

    // The email address to set as root admin
    const rootAdminEmail = 'danieltanurhan@gmail.com';
    
    // Find the user by email
    const userRecord = await adminAuth().getUserByEmail(rootAdminEmail);
    
    if (!userRecord) {
      return NextResponse.json(
        { error: `User with email ${rootAdminEmail} not found` },
        { status: 404 }
      );
    }
    
    // Set custom claims for the root admin
    // We're setting multiple role-related claims to give maximum flexibility
    await adminAuth().setCustomUserClaims(userRecord.uid, {
      admin: true,             // General admin flag
      role: 'system_admin',    // Specific role
      roles: ['system_admin'], // Array of roles for more granular permissions
      permissions: [           // Specific permissions
        'manage_users',
        'manage_roles',
        'manage_personnel',
        'manage_system'
      ],
      isRootAdmin: true        // Special flag for the system owner
    });
    
    return NextResponse.json({
      success: true,
      message: `User ${rootAdminEmail} has been set as the root admin`,
      userId: userRecord.uid
    });
  } catch (error) {
    console.error('Error setting root admin:', error);
    
    return NextResponse.json(
      { error: error.message || 'Failed to set root admin' },
      { status: 500 }
    );
  }
}
