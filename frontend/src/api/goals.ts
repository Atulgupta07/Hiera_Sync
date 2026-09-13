import { client } from './client';
import { DepartmentGoalCreate, DepartmentGoalResponse, GoalMilestoneCreate, GoalMilestoneResponse } from '../types';

export const goalsApi = {
  getAll: () => client<DepartmentGoalResponse[]>('/goals'),
  getById: (id: string) => client<DepartmentGoalResponse>(`/goals/${id}`),
  create: (data: DepartmentGoalCreate) => client<DepartmentGoalResponse>('/goals', { method: 'POST', data }),
  update: (id: string, data: any) => client<DepartmentGoalResponse>(`/goals/${id}`, { method: 'PATCH', data }),
  delete: (id: string) => client<{message: string}>(`/goals/${id}`, { method: 'DELETE' }),
  
  createMilestone: (goalId: string, data: GoalMilestoneCreate) => client<GoalMilestoneResponse>(`/goals/${goalId}/milestones`, { method: 'POST', data }),
  updateMilestone: (goalId: string, milestoneId: string, data: any) => client<GoalMilestoneResponse>(`/goals/${goalId}/milestones/${milestoneId}`, { method: 'PATCH', data }),
  deleteMilestone: (goalId: string, milestoneId: string) => client<{message: string}>(`/goals/${goalId}/milestones/${milestoneId}`, { method: 'DELETE' }),
};
