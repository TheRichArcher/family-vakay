import { Activity } from '../services/activitiesService';
import { Vote } from '../types/activity';

const voteScores: Record<Vote, number> = {
  'very-sad': -2,
  'sad': -1,
  'neutral': 0,
  'happy': 1,
  'very-happy': 2,
};

export function calculateActivityScore(activity: Activity): number {
  if (!activity.votes) {
    return 0;
  }
  return Object.values(activity.votes).reduce((score, vote) => {
    return score + (voteScores[vote as Vote] || 0);
  }, 0);
} 