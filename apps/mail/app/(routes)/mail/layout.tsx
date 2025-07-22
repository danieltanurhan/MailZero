import { HotkeyProviderWrapper } from '@/components/providers/hotkey-provider-wrapper';
import { OnboardingWrapper } from '@/components/onboarding';

import { NotificationProvider } from '@/components/party';
import { AppSidebar } from '@/components/ui/app-sidebar';
import { Outlet } from 'react-router';
import { RequireAuth } from '@/components/require-auth';


export default function MailLayout() {
  return (
    <RequireAuth>
      <HotkeyProviderWrapper>
        <AppSidebar />
        <div className="bg-sidebar dark:bg-sidebar w-full">
          <Outlet />
        </div>
        <OnboardingWrapper />
        <NotificationProvider />
      </HotkeyProviderWrapper>
    </RequireAuth>
  );
}
