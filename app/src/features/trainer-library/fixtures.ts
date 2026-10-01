import type { ImageSourcePropType } from 'react-native';
import type { trainerLibrary } from './ru';
export type LibraryExercise = (typeof trainerLibrary.exerciseData)[number] & {
  sourceKey?: string | null;
  measure?: 'reps' | 'seconds';
  archivedAt?: string | null;
  revision?: number;
  bodyweight?: boolean;
};
export type LibraryTemplate = (typeof trainerLibrary.templateData)[number];
export type LibraryExerciseMedia = {
  image: ImageSourcePropType;
  gif: ImageSourcePropType;
};
export type LibraryMediaMap = Readonly<
  Partial<Record<string, LibraryExerciseMedia>>
>;
export const media: Record<string, LibraryExerciseMedia> = {
  e0: {
    image: require('../../../assets/exercises/0043-qXTaZnJ.jpg'),
    gif: require('../../../assets/exercises/0043-qXTaZnJ.gif'),
  },
  e1: {
    image: require('../../../assets/exercises/0085-wQ2c4XD.jpg'),
    gif: require('../../../assets/exercises/0085-wQ2c4XD.gif'),
  },
  e3: {
    image: require('../../../assets/exercises/0336-RRWFUcw.jpg'),
    gif: require('../../../assets/exercises/0336-RRWFUcw.gif'),
  },
  e6: {
    image: require('../../../assets/exercises/0032-ila4NZS.jpg'),
    gif: require('../../../assets/exercises/0032-ila4NZS.gif'),
  },
  e8: {
    image: require('../../../assets/exercises/0180-hvV79Si.jpg'),
    gif: require('../../../assets/exercises/0180-hvV79Si.gif'),
  },
  e10: {
    image: require('../../../assets/exercises/0652-lBDjFxJ.jpg'),
    gif: require('../../../assets/exercises/0652-lBDjFxJ.gif'),
  },
  e12: {
    image: require('../../../assets/exercises/0025-EIeI8Vf.jpg'),
    gif: require('../../../assets/exercises/0025-EIeI8Vf.gif'),
  },
  e15: {
    image: require('../../../assets/exercises/0662-I4hDWkc.jpg'),
    gif: require('../../../assets/exercises/0662-I4hDWkc.gif'),
  },
  e17: {
    image: require('../../../assets/exercises/0334-DsgkuIt.jpg'),
    gif: require('../../../assets/exercises/0334-DsgkuIt.gif'),
  },
  e18: {
    image: require('../../../assets/exercises/0294-NbVPDMW.jpg'),
    gif: require('../../../assets/exercises/0294-NbVPDMW.gif'),
  },
  e67: {
    image: require('../../../assets/exercises/0175-WW95auq.jpg'),
    gif: require('../../../assets/exercises/0175-WW95auq.gif'),
  },
  e80: {
    image: require('../../../assets/exercises/0818-rkg41Fb.jpg'),
    gif: require('../../../assets/exercises/0818-rkg41Fb.gif'),
  },
};
export const normalize = (value: string) =>
  value.toLowerCase().replace(/ё/g, 'е').replace(/[-–]/g, ' ');
export const matches = (query: string, value: string) =>
  normalize(query)
    .trim()
    .split(/\s+/)
    .every((word) => normalize(value).includes(word));
