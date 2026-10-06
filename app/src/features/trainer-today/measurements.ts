import { StyleSheet } from 'react-native';
import { tokens } from '@/ui/theme';

export const todayStyles = StyleSheet.create({
  root: { flex: 1 },
  actions: { flexDirection: 'row', gap: 8 },
  small: { fontSize: 14, lineHeight: 20.3 },
  strong: { fontFamily: tokens.font.strong },
  notice: {
    marginHorizontal: 16,
    marginBottom: 12,
    paddingVertical: 13,
    paddingHorizontal: 15,
    borderRadius: 18,
    flexDirection: 'row',
    gap: 11,
  },
  noticeText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 21,
    fontFamily: tokens.font.medium,
  },
  empty: {
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 24,
    paddingVertical: 52,
    paddingHorizontal: 48,
    gap: 4,
    borderWidth: 1,
    borderRadius: 24,
    alignItems: 'center',
  },
  emptyArtBox: {
    width: 190,
    height: 140,
    marginBottom: 18,
    alignItems: 'center',
  },
  emptyArt: { width: 170, height: 170, marginBottom: 14 },
  emptyTitle: {
    fontFamily: tokens.font.heading,
    fontSize: 19,
    lineHeight: 27.55,
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  emptyDescription: {
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 6,
  },
  emptyButton: { marginTop: 20, maxWidth: 280, opacity: 1, width: '100%' },
  skeletonHead: {
    paddingTop: 10,
    paddingHorizontal: 22,
    paddingBottom: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  skeletonTitle: { width: 120, height: 24, borderRadius: 8 },
  skeletonSubtitle: { width: 150, height: 12, marginTop: 10, borderRadius: 8 },
  skeletonAction: { width: 44, height: 44, borderRadius: 14 },
  skeletonLabel: {
    width: 92,
    height: 12,
    borderRadius: 8,
    marginLeft: 22,
    marginTop: 2,
    marginBottom: 12,
  },
  skeletonCard: { height: 280, borderRadius: 26, marginHorizontal: 16 },
});

export function getTodayStyles(fontScale: number, width: number) {
  if (fontScale <= 1.3 && width >= 360) return todayStyles;
  return {
    ...todayStyles,
    empty: { ...todayStyles.empty, paddingHorizontal: 16 },
  };
}
