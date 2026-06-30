export interface RewardBase {
  title: string;
  description?: string;
  pointsCost: number;
  icon?: string;
  isActive?: boolean;
}

export interface RewardCreate extends RewardBase {}

export interface RewardUpdate {
  title?: string;
  description?: string;
  pointsCost?: number;
  icon?: string;
  isActive?: boolean;
}

export interface Reward extends RewardBase {
  id: string;
  familyId: string;
  isRedeemed: boolean;
  redeemedBy?: string;
  redeemedAt?: string; // Using string for date for simplicity
  createdAt?: string;
  updatedAt?: string;
}

export type RewardRedemptionStatus = 'requested' | 'approved' | 'fulfilled' | 'denied';

export interface RewardRedemption {
  id: string;
  familyId: string;
  rewardId: string;
  rewardTitle: string;
  rewardDescription?: string;
  pointsCost: number;
  kidId: string;
  kidName?: string;
  status: RewardRedemptionStatus;
  requestedAt?: string;
  updatedAt?: string;
  approvedAt?: string;
  approvedBy?: string;
  fulfilledAt?: string;
  fulfilledBy?: string;
  deniedAt?: string;
  deniedBy?: string;
  note?: string;
}
