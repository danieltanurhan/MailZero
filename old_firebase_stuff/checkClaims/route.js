// src/app/api/auth/checkClaims/route.js
import { NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebaseAdmin';

export async function POST(request) {
  try {
    const { idToken } = await request.json();
    
    if (!idToken) {
      return NextResponse.json({ error: 'No ID token provided' }, { status: 400 });
    }
    
    // Verify the ID token
    const decodedToken = await adminAuth().verifyIdToken(idToken);
    
    return NextResponse.json({
      uid: decodedToken.uid,
      email: decodedToken.email,
      claims: {
        admin: decodedToken.admin || false,
        role: decodedToken.role || 'none',
        roles: decodedToken.roles || [],
        permissions: decodedToken.permissions || [],
        isRootAdmin: decodedToken.isRootAdmin || false
      },
      allClaims: decodedToken
    });
  } catch (error) {
    console.error('Error checking claims:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to verify token' },
      { status: 500 }
    );
  }
}