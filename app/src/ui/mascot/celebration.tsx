import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import { Mascot } from '../mascot';

type Props = { finished: boolean; hidden?: boolean };

export function MascotCelebration({ finished, hidden = false }: Props) {
  const previous = useRef(finished);
  const [visible, setVisible] = useState(false);
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (active) setReduced(value);
    });
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduced,
    );
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  useEffect(() => {
    const completed = finished && !previous.current;
    previous.current = finished;
    if (!completed || hidden || reduced) return;
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), 2200);
    return () => {
      clearTimeout(timer);
      setVisible(false);
    };
  }, [finished, hidden, reduced]);
  if (!visible || hidden || reduced) return null;
  return (
    <View pointerEvents="none" accessible={false} style={styles.overlay}>
      <Mascot pose="jump" size={170} style={styles.panda} />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 200,
  },
  panda: {
    position: 'absolute',
    left: '50%',
    bottom: 170,
    width: 170,
    height: 200,
    marginLeft: -85,
  },
});
