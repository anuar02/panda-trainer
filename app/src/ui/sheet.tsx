import {
  useCallback,
  useEffect,
  useRef,
  type PropsWithChildren,
  type ReactNode,
} from 'react';
import { BackHandler, View, useWindowDimensions } from 'react-native';
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
  fixedContent,
}: PropsWithChildren<{
  open: boolean;
  title: string;
  onClose: () => void;
  fixedContent?: { header: ReactNode; footer: ReactNode };
}>) {
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
  const { height } = useWindowDimensions();
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
  return (
    <BottomSheetModal
      ref={ref}
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
          <BottomSheetScrollView
            style={{ flex: 1 }}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingTop: 12 }}
          >
            {children}
          </BottomSheetScrollView>
          <View
            style={{
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
            label={t('common.close')}
            variant="secondary"
            onPress={dismiss}
          />
        </BottomSheetScrollView>
      )}
    </BottomSheetModal>
  );
}
