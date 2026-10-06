import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type PropsWithChildren,
  type ReactNode,
} from 'react';
import {
  BackHandler,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import {
  BottomSheetHandle,
  BottomSheetModal,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
  type BottomSheetHandleProps,
} from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useNavigation } from 'expo-router';
import { Button } from './button';
import { Text } from './text';
import { tokens, useTheme } from './theme';
import Animated, {
  ReduceMotion,
  cancelAnimation,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { motion, useMotionDisabled } from './motion';
export function Sheet({
  open,
  title,
  onClose,
  children,
  fixedContent,
  stackBehavior,
  closeLabel,
  immediate = false,
}: PropsWithChildren<{
  open: boolean;
  immediate?: boolean;
  title: string;
  onClose: () => void;
  stackBehavior?: 'push' | 'switch' | 'replace';
  closeLabel?: string;
  fixedContent?: { header: ReactNode; footer: ReactNode };
}>) {
  const reduced = useMotionDisabled();
  const scrim = useSharedValue(0);
  const ref = useRef<BottomSheetModal>(null);
  const presented = useRef(false);
  const navigation = useNavigation();
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);
  const { colors, scheme } = useTheme();
  const moveScrim = useCallback(
    (visible: boolean) => {
      cancelAnimation(scrim);
      scrim.set(
        reduced || immediate
          ? Number(visible)
          : withTiming(Number(visible), {
              duration: 280,
              easing: motion.ease,
              reduceMotion: ReduceMotion.System,
            }),
      );
    },
    [scrim, reduced, immediate],
  );
  useEffect(() => {
    moveScrim(open);
    return () => cancelAnimation(scrim);
  }, [open, moveScrim, scrim]);
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { height, fontScale } = useWindowDimensions();
  const scrollHeader = fontScale > 1.5 || height < 600;
  useEffect(() => {
    if (open && navigation.isFocused()) {
      presented.current = true;
      ref.current?.present();
    } else if (presented.current) {
      presented.current = false;
      ref.current?.dismiss();
    }
  }, [open, navigation]);
  useEffect(() => {
    const unsubscribe = navigation.addListener('blur', () => {
      if (!presented.current) return;
      presented.current = false;
      ref.current?.dismiss();
      close.current();
    });
    const modal = ref.current;
    return () => {
      unsubscribe();
      if (!presented.current) return;
      presented.current = false;
      modal?.dismiss();
    };
  }, [navigation]);
  const handleDismiss = useCallback(() => {
    const notify = presented.current;
    presented.current = false;
    if (notify) onClose();
  }, [onClose]);
  const currentScrim = useRef(moveScrim);
  useLayoutEffect(() => {
    currentScrim.current = moveScrim;
  }, [moveScrim]);
  const dismiss = useCallback(() => {
    currentScrim.current(false);
    ref.current?.dismiss();
  }, []);
  useEffect(() => {
    if (!open) return;
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (!presented.current) return false;
        dismiss();
        return true;
      },
    );
    return () => subscription.remove();
  }, [open, dismiss]);
  const backdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <SheetScrim
        {...props}
        opacity={scrim}
        reduced={reduced || immediate}
        open={open}
        scheme={scheme}
        label={t('common.close')}
        onPress={dismiss}
      />
    ),
    [scrim, reduced, immediate, open, scheme, t, dismiss],
  );
  const fixed = !!fixedContent;
  const handle = useCallback(
    (props: BottomSheetHandleProps) => (
      <BottomSheetHandle
        {...props}
        style={fixed ? { paddingTop: 10, paddingBottom: 4 } : undefined}
        indicatorStyle={
          fixed
            ? { width: 38, height: 5, backgroundColor: colors.border }
            : { backgroundColor: colors.secondary }
        }
        accessibilityLabel={t('common.sheetHandle')}
        accessibilityHint={t('common.sheetHandleHint')}
      />
    ),
    [fixed, colors.border, colors.secondary, t],
  );
  const header = fixedContent ? (
    <View>
      <Text
        accessibilityRole="header"
        style={{
          fontFamily: 'Montserrat_800ExtraBold',
          fontSize: 23,
          lineHeight: 33.35,
          letterSpacing: -0.3,
        }}
      >
        {title}
      </Text>
      {fixedContent.header}
    </View>
  ) : null;
  return (
    <BottomSheetModal
      overrideReduceMotion={
        reduced || immediate ? ReduceMotion.Always : ReduceMotion.System
      }
      onAnimate={(_from, to) => moveScrim(to >= 0)}
      animationConfigs={{
        duration: motion.sheetDuration,
        easing: motion.sheetEasing,
      }}
      ref={ref}
      stackBehavior={stackBehavior}
      onDismiss={handleDismiss}
      enablePanDownToClose
      enableDynamicSizing={!fixedContent}
      snapPoints={
        fixedContent ? [Math.min(680, height * 0.78) + 19] : undefined
      }
      topInset={insets.top}
      backdropComponent={backdrop}
      handleComponent={handle}
      accessible={false}
      accessibilityLabel={title}
      backgroundStyle={{
        backgroundColor: colors.surface,
        borderRadius: tokens.radius.sheet,
      }}
    >
      {fixedContent ? (
        <View
          style={{
            flex: 1,
            paddingHorizontal: 22,
            paddingTop: 8,
            paddingBottom: Math.max(insets.bottom, 28),
          }}
        >
          {!scrollHeader && header}
          <BottomSheetScrollView
            style={{ flex: 1 }}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingTop: 12 }}
          >
            {scrollHeader && header}
            {children}
          </BottomSheetScrollView>
          <View
            style={{
              flexShrink: 0,
              borderTopWidth: 1,
              borderTopColor: colors.border,
              paddingTop: 12,
              paddingBottom: 8,
            }}
          >
            {fixedContent.footer}
          </View>
        </View>
      ) : (
        <BottomSheetScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            padding: tokens.spacing.page,
            paddingBottom: insets.bottom + tokens.spacing.page,
            gap: tokens.spacing.row,
          }}
        >
          <Text accessibilityRole="header" className="font-heading text-xl">
            {title}
          </Text>
          {children}
          <Button
            label={closeLabel ?? t('common.close')}
            variant="secondary"
            onPress={dismiss}
          />
        </BottomSheetScrollView>
      )}
    </BottomSheetModal>
  );
}

function SheetScrim({
  style,
  opacity,
  reduced,
  open,
  scheme,
  label,
  onPress,
}: BottomSheetBackdropProps & {
  opacity: { value: number };
  reduced: boolean;
  open: boolean;
  scheme: 'light' | 'dark';
  label: string;
  onPress: () => void;
}) {
  const animated = useAnimatedStyle(() => ({
    opacity: reduced ? Number(open) : opacity.value,
  }));
  return (
    <Animated.View
      style={[
        style,
        StyleSheet.absoluteFill,
        {
          backgroundColor:
            scheme === 'dark' ? 'rgba(0,0,0,0.62)' : 'rgba(14,16,28,0.45)',
        },
        animated,
      ]}
    >
      <Pressable
        style={StyleSheet.absoluteFill}
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
      />
    </Animated.View>
  );
}
