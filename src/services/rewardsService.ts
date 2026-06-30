import apiClient from "../utils/apiClient";
import { Reward, RewardCreate, RewardUpdate } from "../types/rewards";

export const rewardsService = {
  async getRewards(): Promise<Reward[]> {
    const response = await apiClient.get<Reward[]>('/api/v1/rewards');
    return response.data;
  },

  async createReward(rewardData: RewardCreate): Promise<Reward> {
    const response = await apiClient.post<Reward>('/api/v1/rewards', rewardData);
    return response.data;
  },

  async updateReward(rewardId: string, rewardData: RewardUpdate): Promise<Reward> {
    const response = await apiClient.put<Reward>(`/api/v1/rewards/${rewardId}`, rewardData);
    return response.data;
  },

  async deleteReward(rewardId: string): Promise<void> {
    await apiClient.delete(`/api/v1/rewards/${rewardId}`);
  },

  async redeemReward(rewardId: string): Promise<Reward> {
    const response = await apiClient.post<Reward>(`/api/v1/rewards/${rewardId}/redeem`);
    return response.data;
  }
}; 