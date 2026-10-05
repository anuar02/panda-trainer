import { RoleTabs } from '@/features/navigation/role-tabs';
export const unstable_settings = { initialRouteName: 'today' };
export default function Layout() {
  return <RoleTabs role="trainer" />;
}
