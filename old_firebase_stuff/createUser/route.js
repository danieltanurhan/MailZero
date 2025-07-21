import { NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebaseAdmin';

/**
 * API route to create a new Firebase Auth user
 * This is a protected endpoint that should only be accessible to admins or managers
 * 
 * @returns {NextResponse} Success or error message with the created user ID
 */
export async function POST(request) {
  try {
    // Get the request body
    const body = await request.json();
    const { email, password, displayName, role, authToken } = body;
    
    // Validate inputs
    if (!email || !password || !authToken) {
      return NextResponse.json(
        { error: 'Missing required fields: email, password, or authToken' },
        { status: 400 }
      );
    }
    
    // Verify the auth token to ensure the requester is authenticated
    const decodedToken = await adminAuth().verifyIdToken(authToken);
    
    // Check if the requester has appropriate privileges
    const canCreateUsers = decodedToken.admin || 
                           decodedToken.isRootAdmin || 
                           (decodedToken.permissions && 
                            decodedToken.permissions.includes('manage_users'));
    
    if (!canCreateUsers) {
      return NextResponse.json(
        { error: 'Unauthorized: You do not have permission to create users' },
        { status: 403 }
      );
    }
    
    // Define available roles and their permissions
    const roleDefinitions = {
      admin: {
        admin: true,
        role: 'admin',
        roles: ['admin'],
        permissions: ['manage_personnel', 'view_all_personnel']
      },
      manager: {
        admin: false,
        role: 'manager',
        roles: ['manager'],
        permissions: ['create_personnel', 'edit_personnel', 'view_personnel']
      },
      staff: {
        admin: false,
        role: 'staff',
        roles: ['staff'],
        permissions: ['view_personnel']
      }
    };
    
    // Default to staff role if none specified or invalid
    const userRole = (role && roleDefinitions[role]) ? role : 'staff';
    const claims = roleDefinitions[userRole];
    
    // Create the user in Firebase Auth
    const userRecord = await adminAuth().createUser({
      email,
      password,
      displayName: displayName || email.split('@')[0],
      emailVerified: false,
      disabled: false
    });
    
    // Set the custom claims for the user
    await adminAuth().setCustomUserClaims(userRecord.uid, claims);
    
    return NextResponse.json({
      success: true,
      message: `User created successfully with role: ${userRole}`,
      userId: userRecord.uid,
      role: userRole,
      permissions: claims.permissions
    });
  } catch (error) {
    console.error('Error creating user:', error);
    
    // Handle common Firebase Auth errors
    if (error.code === 'auth/email-already-exists') {
      return NextResponse.json(
        { error: 'The email address is already in use by another account' },
        { status: 400 }
      );
    }
    
    if (error.code === 'auth/invalid-password') {
      return NextResponse.json(
        { error: 'The password must be at least 6 characters long' },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { error: error.message || 'Failed to create user' },
      { status: 500 }
    );
  }
}
