import { RoleTabs } from '@/features/navigation/role-tabs';
export const unstable_settings = { initialRouteName: 'home' };
export default function Layout() {
  return <RoleTabs role="client" />;
}
