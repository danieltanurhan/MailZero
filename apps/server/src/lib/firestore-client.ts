import { env } from 'cloudflare:workers';

interface FirestoreDocument {
  name: string;
  fields: Record<string, any>;
  createTime: string;
  updateTime: string;
}

interface FirestoreQueryResult {
  documents?: FirestoreDocument[];
}

/**
 * A Cloudflare Workers-compatible Firestore client that uses the REST API
 * instead of the Firebase Admin SDK to avoid code generation issues.
 */
export class WorkersCompatibleFirestore {
  private projectId: string;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor() {
    this.projectId = (env as any).FIREBASE_PROJECT_ID;
    if (!this.projectId) {
      throw new Error('FIREBASE_PROJECT_ID is required');
    }
  }

  /**
   * Get access token for Firestore REST API using service account credentials
   */
  private async getAccessToken(): Promise<string> {
    // Return cached token if still valid (with 5 minute buffer)
    if (this.accessToken && Date.now() < this.tokenExpiry - 300000) {
      return this.accessToken;
    }

    const clientEmail = (env as any).FIREBASE_CLIENT_EMAIL;
    let privateKey = (env as any).FIREBASE_PRIVATE_KEY;
    
    if (!clientEmail || !privateKey) {
      throw new Error('Firebase service account credentials not found');
    }

    // Fix private key formatting
    privateKey = privateKey.replace(/\\n/g, '\n');

    // Create JWT for Google OAuth
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: clientEmail,
      scope: 'https://www.googleapis.com/auth/datastore',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600, // 1 hour
      iat: now,
    };

    // Sign JWT (you might need to implement this or use a library)
    const jwt = await this.signJWT(payload, privateKey);

    // Exchange JWT for access token
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to get access token: ${response.statusText}`);
    }

    const tokenData = await response.json() as any;
    this.accessToken = tokenData.access_token;
    this.tokenExpiry = Date.now() + (tokenData.expires_in * 1000);
    
    if (!this.accessToken) {
      throw new Error('Failed to obtain access token from Google OAuth');
    }
    
    return this.accessToken;
  }

  /**
   * Sign JWT for service account authentication
   */
  private async signJWT(payload: any, privateKey: string): Promise<string> {
    // Import JOSE for JWT signing
    const { SignJWT, importPKCS8 } = await import('jose');
    
    const key = await importPKCS8(privateKey, 'RS256');
    
    return await new SignJWT(payload)
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(key);
  }

  /**
   * Query Firestore collection with where clauses
   */
  async queryCollection(
    collectionPath: string, 
    where: Array<{ field: string; op: string; value: any }>
  ): Promise<any[]> {
    const accessToken = await this.getAccessToken();
    
    // Build structured query for Firestore REST API
    const structuredQuery = {
      from: [{ collectionId: collectionPath }],
      where: {
        compositeFilter: {
          op: 'AND',
          filters: where.map(condition => ({
            fieldFilter: {
              field: { fieldPath: condition.field },
              op: this.mapOperator(condition.op),
              value: this.serializeValue(condition.value)
            }
          }))
        }
      }
    };

    const response = await fetch(
      `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/(default)/documents:runQuery`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ structuredQuery }),
      }
    );

    if (!response.ok) {
      throw new Error(`Firestore query failed: ${response.statusText}`);
    }

    const result = await response.json() as any[];
    return result
      .filter(item => item.document)
      .map(item => ({
        id: item.document.name.split('/').pop(),
        data: this.deserializeFields(item.document.fields || {}),
      }));
  }

  /**
   * Get a single document by path
   */
  async getDocument(documentPath: string): Promise<any | null> {
    const accessToken = await this.getAccessToken();
    
    const response = await fetch(
      `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/(default)/documents/${documentPath}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    );

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`Failed to get document: ${response.statusText}`);
    }

    const doc = await response.json() as FirestoreDocument;
    return {
      id: doc.name.split('/').pop(),
      data: this.deserializeFields(doc.fields || {}),
      exists: true,
    };
  }

  /**
   * Get all documents in a collection (for debugging)
   */
  async getAllDocuments(collectionPath: string, limit: number = 10): Promise<any[]> {
    const accessToken = await this.getAccessToken();
    
    const response = await fetch(
      `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/(default)/documents/${collectionPath}?pageSize=${limit}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to list documents: ${response.statusText}`);
    }

    const result = await response.json() as any;
    const documents = result.documents || [];
    
    return documents.map((doc: any) => ({
      id: doc.name.split('/').pop(),
      data: this.deserializeFields(doc.fields || {}),
    }));
  }

  /**
   * Map query operators to Firestore REST API format
   */
  private mapOperator(op: string): string {
    const operatorMap: Record<string, string> = {
      '==': 'EQUAL',
      '!=': 'NOT_EQUAL',
      '<': 'LESS_THAN',
      '<=': 'LESS_THAN_OR_EQUAL',
      '>': 'GREATER_THAN',
      '>=': 'GREATER_THAN_OR_EQUAL',
      'array-contains': 'ARRAY_CONTAINS',
      'in': 'IN',
      'array-contains-any': 'ARRAY_CONTAINS_ANY',
      'not-in': 'NOT_IN',
    };
    return operatorMap[op] || 'EQUAL';
  }

  /**
   * Serialize values for Firestore REST API
   */
  private serializeValue(value: any): any {
    if (typeof value === 'string') {
      return { stringValue: value };
    }
    if (typeof value === 'number') {
      return Number.isInteger(value) ? { integerValue: value.toString() } : { doubleValue: value };
    }
    if (typeof value === 'boolean') {
      return { booleanValue: value };
    }
    if (value === null) {
      return { nullValue: null };
    }
    if (Array.isArray(value)) {
      return { arrayValue: { values: value.map(v => this.serializeValue(v)) } };
    }
    if (typeof value === 'object') {
      return { mapValue: { fields: Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, this.serializeValue(v)])
      )}};
    }
    return { stringValue: String(value) };
  }

  /**
   * Deserialize Firestore fields to plain objects
   */
  private deserializeFields(fields: Record<string, any>): any {
    const result: any = {};
    for (const [key, field] of Object.entries(fields)) {
      result[key] = this.deserializeValue(field);
    }
    return result;
  }

  /**
   * Deserialize individual Firestore value
   */
  private deserializeValue(field: any): any {
    if (field.stringValue !== undefined) return field.stringValue;
    if (field.integerValue !== undefined) return parseInt(field.integerValue);
    if (field.doubleValue !== undefined) return field.doubleValue;
    if (field.booleanValue !== undefined) return field.booleanValue;
    if (field.nullValue !== undefined) return null;
    if (field.timestampValue !== undefined) return new Date(field.timestampValue);
    if (field.arrayValue !== undefined) {
      return field.arrayValue.values?.map((v: any) => this.deserializeValue(v)) || [];
    }
    if (field.mapValue !== undefined) {
      return this.deserializeFields(field.mapValue.fields || {});
    }
    return null;
  }
}

export const getWorkersFirestore = () => new WorkersCompatibleFirestore(); 