import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Suspense, useEffect, useState, type ReactNode } from 'react';
import type { EnvVarInfo } from '@zero/server/auth-providers';
import { Google, Microsoft } from '@/components/icons/icons';
import ErrorMessage from '@/app/(auth)/login/error-message';
import { Button } from '@/components/ui/button';
import { TriangleAlert } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useQueryState } from 'nuqs';
import { toast } from 'sonner';
// Firebase auth
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase';

interface EnvVarStatus {
  name: string;
  set: boolean;
  source: string;
  defaultValue?: string;
}

interface Provider {
  id: string;
  name: string;
  enabled: boolean;
  required?: boolean;
  envVarInfo?: EnvVarInfo[];
  envVarStatus: EnvVarStatus[];
  isCustom?: boolean;
  customRedirectPath?: string;
}

interface LoginClientProps {
  providers: Provider[];
  isProd: boolean;
}

const getProviderIcon = (providerId: string, className?: string): ReactNode => {
  const defaultClass = className || 'w-5 h-5 mr-2';

  switch (providerId) {
    case 'google':
      return <Google className={defaultClass} />;

    case 'microsoft':
      return <Microsoft className={defaultClass} />;

    case 'zero':
      return (
        <>
          <img
            src="/white-icon.svg"
            alt="Zero"
            width={15}
            height={15}
            className="mr-2 hidden dark:block"
          />
          <img
            src="/black-icon.svg"
            alt="Zero"
            width={15}
            height={15}
            className="mr-2 block dark:hidden"
          />
        </>
      );
    default:
      return null;
  }
};

function LoginClientContent({ providers, isProd }: LoginClientProps) {
  const navigate = useNavigate();
  const [expandedProviders, setExpandedProviders] = useState<Record<string, boolean>>({});
  const [error, _] = useQueryState('error');

  useEffect(() => {
    const missing = providers.find((p) => p.required && !p.enabled);
    if (missing?.id) {
      setExpandedProviders({ [missing.id]: true });
    }
  }, [providers]);

  const missingRequiredProviders = providers
    .filter((p) => p.required && !p.enabled)
    .map((p) => p.name);

  const missingProviders = providers
    .filter((p) => p.required && !p.enabled && p.envVarInfo)
    .map((p) => ({
      id: p.id,
      name: p.name,
      envVarInfo: p.envVarInfo || [],
      envVarStatus: p.envVarStatus,
    }));

  const toggleProvider = (providerId: string) => {
    setExpandedProviders((prev) => ({
      ...prev,
      [providerId]: !prev[providerId],
    }));
  };

  // Email/password state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleEmailLogin = () => {
    if (!email || !password) {
      toast('Email and password required');
      return;
    }
    toast.promise(
      signInWithEmailAndPassword(auth, email, password).then(async (userCredential) => {
        // Ensure user is fully authenticated and ID token is available
        const user = userCredential.user;
        await user.getIdToken(); // Force token refresh
        
        // Add small delay to ensure auth state has propagated
        await new Promise(resolve => setTimeout(resolve, 100));
        
        navigate('/mail', { replace: true });
      }),
      {
        loading: 'Logging in...',
        success: 'Logged in',
        error: 'Login failed',
      },
    );
  };

  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-between bg-[#111111]">
      <div className="animate-in slide-in-from-bottom-4 mx-auto flex max-w-[600px] flex-grow items-center justify-center space-y-8 px-4 duration-500 sm:px-12 md:px-0">
        <div className="w-full space-y-4">
          <p className="text-center text-4xl font-bold text-white md:text-5xl">Login to Zero</p>

          {error && (
            <Alert variant="default" className="border-orange-500/40 bg-orange-500/10">
              <AlertTitle className="text-orange-400">Error</AlertTitle>
              <AlertDescription>Failed to log you in. Please try again.</AlertDescription>
            </Alert>
          )}

          {/* Email/password form */}
          <div className="space-y-4">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-white/20 bg-transparent p-3 text-white"
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-white/20 bg-transparent p-3 text-white"
            />
            <button
              onClick={handleEmailLogin}
              className="w-full rounded-md bg-white py-3 font-semibold text-black hover:bg-white/90"
            >
              Sign in
            </button>
          </div>

          {/* End email/password block */}

          {error && (
            <Alert variant="default" className="border-orange-500/40 bg-orange-500/10">
              <AlertTitle className="text-orange-400">Error</AlertTitle>
              <AlertDescription>Failed to log you in. Please try again.</AlertDescription>
            </Alert>
          )}

          <ErrorMessage />

          {/* Hide social provider buttons since only email/password is supported */}
        </div>
      </div>
      <a href={'/'}>Return home</a>

      <footer className="w-full px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-center gap-6">
          <a
            href="/terms"
            className="text-[10px] text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
          >
            Terms of Service
          </a>
          <a
            href="/privacy"
            className="text-[10px] text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
          >
            Privacy Policy
          </a>
        </div>
      </footer>
    </div>
  );
}

export function LoginClient(props: LoginClientProps) {
  const fallback = (
    <div className="flex min-h-screen w-full items-center justify-center">
      <p>Loading...</p>
    </div>
  );

  return (
    <Suspense fallback={fallback}>
      <LoginClientContent {...props} />
    </Suspense>
  );
}
