import { SettingsLayoutContent } from '@/components/ui/settings-content';
import { Outlet } from 'react-router';
import { RequireAuth } from '@/components/require-auth';

export default function SettingsLayout() {
  return (
    <RequireAuth>
      <SettingsLayoutContent>
        <Outlet />
      </SettingsLayoutContent>
    </RequireAuth>
  );
}