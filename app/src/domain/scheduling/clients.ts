import { workoutClients } from '../workout/fixtures';

export const schedulingClients: Record<string, { name: string }> = {
  ...workoutClients,
  c6: { name: 'Тимур Ахметов' },
};
