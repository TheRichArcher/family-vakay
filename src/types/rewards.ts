export interface RewardBase {
  title: string;
  description?: string;
  pointsCost: number;
  icon?: string;
}

export interface RewardCreate extends RewardBase {}

export interface RewardUpdate {
  title?: string;
  description?: string;
  pointsCost?: number;
  icon?: string;
}

export interface Reward extends RewardBase {
  id: string;
  familyId: string;
  isRedeemed: boolean;
  redeemedBy?: string;
  redeemedAt?: string; // Using string for date for simplicity
  createdAt?: string;
} 