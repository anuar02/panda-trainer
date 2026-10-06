import { Pressable, View } from 'react-native';
import { Text } from '@/ui/text';
import { Icon, type IconName } from '@/ui/icons';
import { GradientBackground } from '@/ui/gradient-background';
import { useTheme } from '@/ui/theme';

export function ChoiceRow({
  title,
  meta,
  lead,
  icon,
  selected,
  onPress,
  last = false,
  disabled = false,
}: {
  title: string;
  meta?: string;
  lead?: string;
  icon?: IconName;
  selected: boolean;
  onPress: () => void;
  last?: boolean;
  disabled?: boolean;
}) {
  const { colors, scheme } = useTheme();
  const dark = scheme === 'dark';
  const color = selected ? '#ffffff' : dark ? '#aab8ff' : '#2238b0';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      className="flex-row items-center gap-[14px] px-3 py-[14px]"
      style={{
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: dark ? '#212227' : '#efefeb',
      }}
    >
      <View className="h-[34px] w-[34px] items-center justify-center">
        <GradientBackground
          start={
            selected
              ? dark
                ? '#26272e'
                : '#262b45'
              : dark
                ? '#232845'
                : '#e3e8fd'
          }
          end={
            selected
              ? dark
                ? '#18191d'
                : '#141726'
              : dark
                ? '#1b1f36'
                : '#d3dbfb'
          }
          radius={17}
        />
        {icon ? (
          <Icon name={icon} size={20} color={color} />
        ) : (
          <Text className="font-heading text-[14px]" style={{ color }}>
            {lead}
          </Text>
        )}
      </View>
      <View className="min-w-0 flex-1">
        <Text className="font-strong text-[15.5px] leading-[22.475px] tracking-[0.1px]">
          {title}
        </Text>
        {meta ? (
          <Text className="mt-[2px] font-medium text-[14px] leading-[20.3px] text-secondary">
            {meta}
          </Text>
        ) : null}
      </View>
      {selected && (
        <Icon name="check" size={20} strokeWidth={2.6} color={colors.ink} />
      )}
    </Pressable>
  );
}

export function EditorNotice({
  children,
  warning = false,
}: {
  children: string;
  warning?: boolean;
}) {
  const { colors, scheme } = useTheme();
  return (
    <View
      className="flex-row gap-[11px] rounded-[18px] px-[15px] py-[13px]"
      style={{
        backgroundColor: warning
          ? scheme === 'dark'
            ? 'rgba(245,196,81,0.14)'
            : 'rgba(255,178,61,0.2)'
          : colors.sunken,
      }}
    >
      <Icon name={warning ? 'alert' : 'info'} size={18} color={colors.ink} />
      <Text className="flex-1 font-medium text-[14px] leading-[21px]">
        {children}
      </Text>
    </View>
  );
}

export function EditorLabel({ children }: { children: string }) {
  return (
    <Text className="mb-[10px] ml-[6px] font-bold text-[14px] uppercase leading-[20.3px] tracking-[0.6px] text-secondary">
      {children}
    </Text>
  );
}

export function EditorChip({
  label,
  selected,
  onPress,
  disabled = false,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      className={`min-h-touch justify-center rounded-full border px-4 py-2 ${selected ? 'border-ink bg-ink' : 'border-border bg-surface'}`}
    >
      <Text
        className={`font-strong text-[14px] leading-[20.3px] ${selected ? 'text-canvas' : 'text-secondary'}`}
      >
        {label}
      </Text>
    </Pressable>
  );
}
