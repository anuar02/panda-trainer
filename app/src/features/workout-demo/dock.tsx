import { router } from 'expo-router';
import { useId, useState } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import {
  getWorkoutSession,
  workoutClients,
  workoutEligible,
  workoutProgress,
  workoutSessions,
} from '@/domain/workout';
import { Icon } from '@/ui/icons';
import { Text } from '@/ui/text';
import { GradientBackground } from '@/ui/gradient-background';
import { useTheme } from '@/ui/theme';
import { useOptionalWorkoutDemo } from './provider';
import { useWorkoutRuntime } from './runtime';
import { WorkoutEffect } from '@/features/workout/workout-motion';
import { runtimeExercise } from './runtime-state';

export function WorkoutDock() {
  const demo = useOptionalWorkoutDemo();
  const { t } = useTranslation();
  const { scheme } = useTheme();
  const gradientId = useId().replace(/:/g, '');
  const { fontScale } = useWindowDimensions();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [pressed, setPressed] = useState(false);
  const dark = scheme === 'dark';
  const onDark = dark ? '#f2f2f3' : '#f4f5fb';
  const gradientLength = size.width * 0.5 + (size.height * Math.sqrt(3)) / 2;
  const gradientX = gradientLength * 0.5;
  const gradientY = (gradientLength * Math.sqrt(3)) / 2;
  const id = demo?.state.activeSessionId;
  const activeJournal = id ? demo?.state.sessions[id] : undefined;
  const journal =
    activeJournal && !activeJournal.finished
      ? activeJournal
      : (demo?.state.catalog ?? workoutSessions)
          .filter((session) => session.date === '2026-09-14')
          .sort(
            (a, b) =>
              b.start.localeCompare(a.start) || a.id.localeCompare(b.id),
          )
          .map((session) => demo?.state.sessions[session.id])
          .find((entry) => entry && !entry.finished);
  const session = journal
    ? getWorkoutSession(journal.sessionId, demo?.state.catalog)
    : undefined;
  const runtime = useWorkoutRuntime(
    journal?.sessionId ?? '',
    journal?.active ?? '',
  );
  if (!demo?.hydrated || !journal || journal.finished || !session) return null;
  const progress = workoutProgress(journal);
  const clientName =
    workoutClients[journal.active]?.name ?? t('workoutDemo.participant');
  const name =
    session.kind === 'group'
      ? t('workoutDemo.groupName', { title: session.title, name: clientName })
      : clientName;
  const participating = workoutEligible(journal, journal.active);
  const error = demo.storageStatus === 'error';
  const exercise =
    participating && !error && journal.sessionId === id
      ? runtimeExercise(journal, runtime.focusedExerciseId)
      : undefined;
  const draftParticipants = Object.keys(journal.plans).filter(
    (clientId) => workoutProgress(journal, clientId).drafts > 0,
  ).length;
  const draftDetail =
    session.kind === 'group' && draftParticipants
      ? t('workoutDemo.groupDrafts', { participants: draftParticipants })
      : progress.drafts
        ? t('workoutDemo.draft')
        : '';
  const detail = error
    ? t('workoutDemo.saveError')
    : !participating
      ? t('workoutDemo.notParticipating')
      : progress.total
        ? t('workoutDemo.progress', progress)
        : t('workoutDemo.noProgram');
  const description = draftDetail
    ? t('workoutDemo.join', { first: detail, second: draftDetail })
    : detail;
  const baseLine =
    error || !participating || !progress.total
      ? description
      : exercise
        ? draftDetail
          ? t('workoutDemo.join', { first: exercise.name, second: draftDetail })
          : exercise.name
        : t('workoutDemo.join', { first: session.start, second: description });
  const rest =
    participating && !error && journal.sessionId === id ? runtime.rest : null;
  const restLabel = rest
    ? t(rest.done ? 'workoutDemo.restDone' : 'workoutDemo.rest') +
      (rest.done ? '' : t('workoutDemo.restTime', { time: rest.label }))
    : '';
  const line = rest
    ? exercise
      ? t('workoutDemo.join', {
          first: restLabel,
          second: rest.done
            ? exercise.name
            : t('workoutDemo.nextExercise', { name: exercise.name }),
        })
      : restLabel
    : baseLine;
  return (
    <Pressable
      testID="workout-dock"
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onLayout={({ nativeEvent: { layout } }) =>
        setSize((previous) =>
          previous.width === layout.width && previous.height === layout.height
            ? previous
            : { width: layout.width, height: layout.height },
        )
      }
      accessibilityRole="button"
      accessibilityLabel={t('workoutDemo.resumeLabel', {
        name,
        start: session.start,
        detail: exercise
          ? t('workoutDemo.current', {
              detail: description,
              exercise: exercise.name,
            })
          : description,
      })}
      onPress={() =>
        router.push({ pathname: '/session/[id]', params: { id: session.id } })
      }
      style={{
        marginTop: 6,
        marginBottom: 8,
        borderRadius: 22,
        minHeight: 64,
        paddingVertical: 10,
        paddingLeft: 12,
        paddingRight: 10,
        backgroundColor: dark ? '#18191d' : '#141726',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        overflow: 'hidden',
        boxShadow: `0px 14px 30px -14px ${dark ? 'rgba(242,242,243,0.75)' : 'rgba(18,20,32,0.75)'}, inset 0px 0px 0px 1px rgba(255,255,255,0.06)`,
      }}
    >
      <Svg
        pointerEvents="none"
        width={size.width}
        height={size.height}
        style={{ position: 'absolute', left: 0, top: 0 }}
      >
        <Defs>
          <LinearGradient
            id={gradientId}
            gradientUnits="userSpaceOnUse"
            x1={(size.width - gradientX) / 2}
            y1={(size.height - gradientY) / 2}
            x2={(size.width + gradientX) / 2}
            y2={(size.height + gradientY) / 2}
          >
            <Stop offset="0%" stopColor={dark ? '#26272e' : '#262b45'} />
            <Stop offset="100%" stopColor={dark ? '#18191d' : '#141726'} />
          </LinearGradient>
        </Defs>
        <Rect
          width={size.width}
          height={size.height}
          rx={22}
          fill={`url(#${gradientId})`}
        />
      </Svg>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          width: 140,
          height: 140,
          right: -40,
          top: -90,
        }}
      >
        <GradientBackground
          radius={70}
          radials={[
            {
              color: '#5b74f0',
              opacity: 0.45,
              cx: 0.5,
              cy: 0.5,
              rx: 70 * Math.sqrt(2),
              ry: 70 * Math.sqrt(2),
              stop: 0.7,
            },
          ]}
        />
      </View>
      {pressed && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: 'rgba(255,255,255,0.06)',
          }}
        />
      )}
      <WorkoutEffect
        kind="dock"
        active={!!rest && !rest.done}
        style={{
          width: 42,
          height: 42,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Svg width={42} height={42} style={{ position: 'absolute' }}>
          <Circle
            cx={21}
            cy={21}
            r={19}
            stroke={dark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.16)'}
            strokeWidth={4}
            fill={dark ? '#0b0c0e' : '#10121c'}
          />
          <Circle
            cx={21}
            cy={21}
            r={19}
            stroke={dark ? '#8c9eff' : '#5b74f0'}
            strokeWidth={4}
            fill="none"
            strokeDasharray={`${progress.total ? (progress.done / progress.total) * 119.38 : 0} 119.38`}
            transform="rotate(-90 21 21)"
          />
        </Svg>
        <Icon name="play" size={16} color={onDark} />
      </WorkoutEffect>
      <View style={{ flex: 1, gap: 2 }}>
        <View
          style={{
            flexDirection: 'row',
            flexWrap: fontScale > 1.3 ? 'wrap' : 'nowrap',
            alignItems: 'baseline',
            gap: 8,
          }}
        >
          <Text
            numberOfLines={fontScale > 1.3 ? undefined : 1}
            style={{
              flexShrink: 1,
              color: onDark,
              fontFamily: 'Inter_700Bold',
              fontSize: 15,
              lineHeight: 19.5,
            }}
          >
            {name}
          </Text>
          {progress.total > 0 && participating && !error && (
            <Text
              style={{
                color: onDark,
                opacity: 0.72,
                fontSize: 13,
                lineHeight: 18,
                fontFamily: 'Inter_600SemiBold',
              }}
            >
              {t('workoutDemo.count', progress)}
            </Text>
          )}
        </View>
        <Text
          numberOfLines={fontScale > 1.3 ? undefined : 1}
          style={{
            color: error
              ? '#ffb4a8'
              : dark
                ? 'rgba(242,242,243,0.74)'
                : 'rgba(244,245,251,0.74)',
            fontSize: 13,
            lineHeight: 17.55,
          }}
        >
          {line}
        </Text>
      </View>
      <View
        style={{
          minHeight: 40,
          paddingLeft: 14,
          paddingRight: 8,
          backgroundColor: onDark,
          borderRadius: 99,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 2,
        }}
      >
        <Text
          style={{
            color: '#151827',
            fontSize: 13,
            fontFamily: 'Inter_700Bold',
          }}
        >
          {t('workoutDemo.resume')}
        </Text>
        <Icon name="chevR" size={18} color="#151827" />
      </View>
    </Pressable>
  );
}
