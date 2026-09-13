import { client } from './client';
import { FacultyPerformance } from '../types';

export const analyticsApi = {
  getFacultyPerformance: async (): Promise<FacultyPerformance[]> => {
    return client<FacultyPerformance[]>('/analytics/faculty-performance');
  },
};
