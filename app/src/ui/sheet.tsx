import { useCallback, useEffect, useRef, type PropsWithChildren } from 'react';
import { BackHandler } from 'react-native';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
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
  const { colors } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  useEffect(() => {
    if (open) ref.current?.present();
    else ref.current?.dismiss();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        onClose();
        return true;
      },
    );
    return () => subscription.remove();
  }, [open, onClose]);
  const backdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
      />
    ),
    [],
  );
  return (
    <BottomSheetModal
      ref={ref}
      onDismiss={onClose}
      enablePanDownToClose
      topInset={insets.top}
      backdropComponent={backdrop}
      backgroundStyle={{
        backgroundColor: colors.surface,
        borderRadius: tokens.radius.sheet,
      }}
      handleIndicatorStyle={{ backgroundColor: colors.secondary }}
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
          onPress={onClose}
        />
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}
