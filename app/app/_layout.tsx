import '../global.css';
import '@/lib/i18n';
import { useEffect } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from '@expo-google-fonts/inter';
import {
  Montserrat_400Regular,
  Montserrat_600SemiBold,
  Montserrat_700Bold,
  Montserrat_800ExtraBold,
  Montserrat_900Black,
} from '@expo-google-fonts/montserrat';
import { Stack, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { useTranslation } from 'react-i18next';
import { ThemeProvider, useTheme } from '@/ui/theme';
import { ToastProvider } from '@/ui/toast';
import { Text } from '@/ui/text';
import {
  SchedulingDemoProvider,
  useSchedulingDemo,
} from '@/features/scheduling-demo/provider';
import { WorkoutDemoProvider } from '@/features/workout-demo';
void SplashScreen.preventAutoHideAsync();
function Navigation() {
  const { scheme, colors } = useTheme();
  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.canvas },
        }}
      />
    </>
  );
}
function ConnectedNavigation() {
  const scheduling = useSchedulingDemo();
  return (
    <WorkoutDemoProvider
      catalog={scheduling.state.sessions}
      catalogReady={scheduling.hydrated && !scheduling.readError}
      onFinishedSessionIds={scheduling.registerFinished}
    >
      <Navigation />
    </WorkoutDemoProvider>
  );
}
export default function RootLayout() {
  const segments: readonly string[] = useSegments();
  const role = ['(trainer)', 'new', 'client', 'session', 'inbox'].includes(
    segments[0] ?? '',
  )
    ? 'trainer'
    : 'client';
  const [loaded, error] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
    Montserrat_400Regular,
    Montserrat_600SemiBold,
    Montserrat_700Bold,
    Montserrat_800ExtraBold,
    Montserrat_900Black,
  });
  const { t } = useTranslation();
  useEffect(() => {
    if (loaded || error) void SplashScreen.hideAsync();
  }, [loaded, error]);
  if (!loaded && !error) return null;
  return (
    <GestureHandlerRootView className="flex-1">
      <SafeAreaProvider>
        <ThemeProvider role={role} workout={segments.includes('session')}>
          <BottomSheetModalProvider>
            <ToastProvider>
              {error ? (
                <SafeAreaView className="flex-1 bg-canvas p-page">
                  <Text accessibilityRole="alert">{t('common.fontError')}</Text>
                </SafeAreaView>
              ) : (
                <SchedulingDemoProvider waitForWorkout>
                  <ConnectedNavigation />
                </SchedulingDemoProvider>
              )}
            </ToastProvider>
          </BottomSheetModalProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
