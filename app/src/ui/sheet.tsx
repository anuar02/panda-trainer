import { useCallback, useEffect, useRef, type PropsWithChildren } from 'react';
import { BackHandler } from 'react-native';
import {
  BottomSheetBackdrop,
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
export function Sheet({
  open,
  title,
  onClose,
  children,
}: PropsWithChildren<{ open: boolean; title: string; onClose: () => void }>) {
  const ref = useRef<BottomSheetModal>(null);
  const presented = useRef(false);
  const navigation = useNavigation();
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);
  const { colors } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
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
  const dismiss = useCallback(() => ref.current?.dismiss(), []);
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
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        accessibilityLabel={t('common.close')}
        accessibilityHint=""
      />
    ),
    [t],
  );
  const handle = useCallback(
    (props: BottomSheetHandleProps) => (
      <BottomSheetHandle
        {...props}
        indicatorStyle={{ backgroundColor: colors.secondary }}
        accessibilityLabel={t('common.sheetHandle')}
        accessibilityHint={t('common.sheetHandleHint')}
      />
    ),
    [colors.secondary, t],
  );
  return (
    <BottomSheetModal
      ref={ref}
      onDismiss={handleDismiss}
      enablePanDownToClose
      topInset={insets.top}
      backdropComponent={backdrop}
      handleComponent={handle}
      accessibilityLabel={title}
      backgroundStyle={{
        backgroundColor: colors.surface,
        borderRadius: tokens.radius.sheet,
      }}
    >
      <BottomSheetScrollView
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
          label={t('common.close')}
          variant="secondary"
          onPress={dismiss}
        />
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}
