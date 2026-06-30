import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, useWindowDimensions, Platform, TextInput } from 'react-native';
import { colors } from '../theme/colors';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import { Activity, Challenge, Rating } from '../services/activitiesService';
import { getDateTime } from '../utils/dateUtils';
import { openWebsiteUrl } from '../utils/urlUtils';
import { Vote } from '../types/activity';
import { StorageImage } from './StorageImage';

type ActivityCardUser = {
  uid: string;
  role?: 'admin' | 'adult' | 'kid' | 'member';
};

type ActivityCardProps = {
  item: Activity;
  isIdeaSection?: boolean;
  user: ActivityCardUser | null;
  canPerformAdminActions?: boolean;
  canDelete?: boolean;
  onVote?: (activityId: string, vote: Vote) => void;
  onRating?: (activityId: string, rating: number, feedback?: string) => void;
  onEdit?: (activity: Activity) => void;
  onSchedule?: (activity: Activity) => void;
  onDelete?: (activityId: string) => void;
  onImageUpload?: (activityId: string, challengeIndex: number) => void;
  uploadingChallenge?: string | null;
  scavengerHuntVisible?: boolean;
};

const ActivityCard: React.FC<ActivityCardProps> = ({
  item,
  isIdeaSection = false,
  user,
  canPerformAdminActions,
  canDelete,
  onVote,
  onRating,
  onEdit,
  onSchedule,
  onDelete,
  onImageUpload,
  uploadingChallenge,
  scavengerHuntVisible = true,
}) => {
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width > 768;
  const [userRating, setUserRating] = useState<number>(0);
  const [feedback, setFeedback] = useState('');
  const [showFeedback, setShowFeedback] = useState(false);

  React.useEffect(() => {
    if (user && item.ratings && item.ratings[user.uid]) {
      setUserRating(item.ratings[user.uid].rating);
      setFeedback(item.ratings[user.uid].feedback || '');
    }
  }, [item.ratings, user]);

  if (item.isSurprise && user?.role === 'kid') {
    return (
      <View style={styles.activityCard}>
        <View style={styles.activityTextContent}>
           <Text style={styles.surpriseText}>🎉 Surprise Activity!</Text>
          {item.date && <Text style={styles.activityDate}>{format(parseISO(item.date), 'MMM d, yyyy')} {item.time || ''}</Text>}
        </View>
      </View>
    );
  }

  let displayCoverImageUrl = item.coverImageUrl;
  if (!displayCoverImageUrl && item.images && item.images.length > 0) {
    displayCoverImageUrl = item.images[0].url;
  } else if (!displayCoverImageUrl && item.imageUrls && item.imageUrls.length > 0) {
    displayCoverImageUrl = item.imageUrls[0];
  }

  const votes = item.votes || {};
  const voteCounts = {
    'very-sad': Object.values(votes).filter(v => v === 'very-sad').length,
    sad: Object.values(votes).filter(v => v === 'sad').length,
    neutral: Object.values(votes).filter(v => v === 'neutral').length,
    happy: Object.values(votes).filter(v => v === 'happy').length,
    'very-happy': Object.values(votes).filter(v => v === 'very-happy').length,
  };

  const ratings = item.ratings || {};
  const ratingValues = Object.values(ratings).map((r: Rating) => r.rating);
  const averageRating = ratingValues.length > 0 ? (ratingValues.reduce((a, b) => a + b, 0) / ratingValues.length) : 0;
  const currentUserRatingInfo = user ? ratings[user.uid] : undefined;

  const handleSetRating = (rating: number) => {
    setUserRating(rating);
    setShowFeedback(true);
  };

  const handleSubmitRating = () => {
    if (onRating && userRating > 0) {
      onRating(item.id, userRating, feedback);
      setShowFeedback(false);
    }
  };

  const isPastActivity = !isIdeaSection && getDateTime(item) < new Date();

  return (
    <View style={[styles.activityCard, isPastActivity && styles.pastActivity]}>
      <View style={[styles.activityLayoutContainer, isDesktop && styles.desktopActivityLayoutContainer]}>
        {displayCoverImageUrl && (
          <View style={[styles.activityImageContainer, isDesktop && styles.desktopActivityImageContainer]}>
            <StorageImage path={displayCoverImageUrl} style={styles.activityCoverImage} />
          </View>
        )}
        <View style={styles.activityTextContent}>
          <View style={styles.activityHeader}>
            {item.isBooked && (
             <View style={styles.bookedBadge}>
              <Text style={styles.bookedBadgeText}>✓ Booked</Text>
            </View>
            )}
            <Text style={styles.activityName}>{item.name}</Text>
          </View>
          {item.date && <Text style={styles.activityDate}>{format(parseISO(item.date), 'MMM d, yyyy')} {item.time || ''}</Text>}
          {(item.portName || item.itineraryDate) && (
            <Text style={styles.itineraryStopText}>
              {[item.itineraryDate, item.portName].filter(Boolean).join(' • ')}
            </Text>
          )}
          {item.description && <Text style={styles.activityDescription}>{item.description}</Text>}
          {item.location && <Text style={styles.activityDetailText}>📍 {item.location}</Text>}
           {item.website && <TouchableOpacity onPress={() => openWebsiteUrl(item.website)}><Text style={styles.linkText}>🔗 Visit Website</Text></TouchableOpacity>}
          
          {item.activityTypes && item.activityTypes.length > 0 && (
            <View style={styles.categoryContainer}>
              {item.activityTypes.map((category: string, index: number) => (
                <View key={index} style={styles.categoryTag}>
                  <Text style={styles.categoryTagText}>{category}</Text>
                </View>
              ))}
            </View>
          )}

          {canPerformAdminActions && typeof item.budget === 'number' && <Text style={styles.activityDetailText}>💰 Budget: ${item.budget.toFixed(2)}</Text>}
          
          {canPerformAdminActions && (
            (typeof item.cost === 'number' && item.cost > 0) || 
            (typeof item.additionalExpenses === 'number' && item.additionalExpenses > 0)
          ) && (
            <View style={styles.costContainer}>
               <Text style={styles.costTitle}>Expenses</Text>
              {typeof item.cost === 'number' && item.cost > 0 && (
                <Text style={styles.activityDetailText}>Item Cost: ${item.cost.toFixed(2)}</Text>
              )}
              {typeof item.additionalExpenses === 'number' && item.additionalExpenses > 0 && (
                <Text style={styles.activityDetailText}>Extra: ${item.additionalExpenses.toFixed(2)}</Text>
              )}
              <Text style={styles.totalCostText}>
                Total: $
                {((item.cost || 0) + (item.additionalExpenses || 0)).toFixed(2)}
              </Text>
            </View>
          )}

          {scavengerHuntVisible && item.challenges && item.challenges.length > 0 && (
            <View style={styles.challengesContainer}>
              <Text style={styles.challengesTitle}>🎯 Scavenger Hunt</Text>
              {item.challenges.map((challenge: Challenge, index: number) => {
                const challengeKey = `${item.id}-${index}`;
                const completion = user ? challenge.completions?.[user.uid] : undefined;

                return (
                  <View key={index} style={styles.challengeItem}>
                    <View style={styles.challengeActionContainer}>
                      {completion?.status === 'approved' ? (
                        typeof completion.pointsAwarded === 'number' ? (
                          <View style={styles.scoreContainer}>
                            <Text style={styles.scoreText}>+{completion.pointsAwarded}</Text>
                            <Text style={styles.scoreLabel}>pts</Text>
                          </View>
                         ) : <Ionicons name="checkmark-circle" size={24} color={colors.success} />
                      ) : completion?.status === 'rejected' ? (
                        <Ionicons name="close-circle" size={24} color={colors.error} />
                      ) : completion?.status === 'pending' ? (
                        <Ionicons name="hourglass-outline" size={24} color={colors.accent} />
                      ) : (
                        uploadingChallenge === challengeKey ? (
                          <ActivityIndicator style={styles.uploadSpinner} />
                        ) : (
                          <TouchableOpacity onPress={() => onImageUpload && onImageUpload(item.id, index)}>
                            <Ionicons name="camera-outline" size={24} color={colors.primary} />
                          </TouchableOpacity>
                        )
                      )}
                    </View>
                    <Text style={styles.challengeText}>{challenge.text}</Text>
                  </View>
                );
              })}
            </View>
          )}

          {isIdeaSection && !canPerformAdminActions && (
            <View style={[styles.votingContainer, {paddingHorizontal: 0, paddingBottom: 0}]}>
              <Text style={styles.votingTitle}>How excited is everyone?</Text>
              <View style={styles.voteButtons}>
                <TouchableOpacity style={styles.voteButton} onPress={() => onVote && onVote(item.id, 'very-sad')}><Text style={[styles.voteEmoji, votes[user?.uid || ''] === 'very-sad' && styles.selectedVote]}>😩</Text><Text style={styles.voteCount}>{voteCounts['very-sad']}</Text></TouchableOpacity>
                <TouchableOpacity style={styles.voteButton} onPress={() => onVote && onVote(item.id, 'sad')}><Text style={[styles.voteEmoji, votes[user?.uid || ''] === 'sad' && styles.selectedVote]}>😞</Text><Text style={styles.voteCount}>{voteCounts.sad}</Text></TouchableOpacity>
                <TouchableOpacity style={styles.voteButton} onPress={() => onVote && onVote(item.id, 'neutral')}><Text style={[styles.voteEmoji, votes[user?.uid || ''] === 'neutral' && styles.selectedVote]}>😐</Text><Text style={styles.voteCount}>{voteCounts.neutral}</Text></TouchableOpacity>
                <TouchableOpacity style={styles.voteButton} onPress={() => onVote && onVote(item.id, 'happy')}><Text style={[styles.voteEmoji, votes[user?.uid || ''] === 'happy' && styles.selectedVote]}>🙂</Text><Text style={styles.voteCount}>{voteCounts.happy}</Text></TouchableOpacity>
                <TouchableOpacity style={styles.voteButton} onPress={() => onVote && onVote(item.id, 'very-happy')}><Text style={[styles.voteEmoji, votes[user?.uid || ''] === 'very-happy' && styles.selectedVote]}>😄</Text><Text style={styles.voteCount}>{voteCounts['very-happy']}</Text></TouchableOpacity>
              </View>
            </View>
          )}
          
          {isIdeaSection && canPerformAdminActions && (
            <View style={[styles.votingContainer, {paddingHorizontal: 0, paddingBottom: 0}]}>
              <Text style={styles.votingTitle}>Excitement Votes</Text>
              <View style={styles.voteButtons}>
                <View style={styles.voteButton}><Text style={styles.voteEmoji}>😩</Text><Text style={styles.voteCount}>{voteCounts['very-sad']}</Text></View>
                <View style={styles.voteButton}><Text style={styles.voteEmoji}>😞</Text><Text style={styles.voteCount}>{voteCounts.sad}</Text></View>
                <View style={styles.voteButton}><Text style={styles.voteEmoji}>😐</Text><Text style={styles.voteCount}>{voteCounts.neutral}</Text></View>
                <View style={styles.voteButton}><Text style={styles.voteEmoji}>🙂</Text><Text style={styles.voteCount}>{voteCounts.happy}</Text></View>
                <View style={styles.voteButton}><Text style={styles.voteEmoji}>😄</Text><Text style={styles.voteCount}>{voteCounts['very-happy']}</Text></View>
              </View>
            </View>
          )}

          {isPastActivity && (
            <View style={styles.ratingSection}>
              <Text style={styles.votingTitle}>How was this activity?</Text>
              
              {averageRating > 0 && (
                <View style={styles.averageRatingContainer}>
                  <Text style={styles.averageRatingText}>Avg: {averageRating.toFixed(1)}</Text>
                  <Ionicons name="star" size={16} color={colors.warning} />
                  <Text style={styles.averageRatingText}>({ratingValues.length} ratings)</Text>
                </View>
              )}

              <View style={styles.starsContainer}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <TouchableOpacity key={star} onPress={() => handleSetRating(star)}>
                    <Ionicons 
                      name={star <= userRating ? 'star' : 'star-outline'} 
                      size={32} 
                      color={star <= userRating ? colors.warning : '#d3d3d3'} 
                      style={styles.star} 
                    />
                  </TouchableOpacity>
                ))}
              </View>

              {showFeedback && (
                <View style={styles.feedbackContainer}>
                  <TextInput
                    style={styles.feedbackInput}
                    onChangeText={setFeedback}
                    value={feedback}
                    placeholder="Tell us what you thought..."
                    multiline
                  />
                  <TouchableOpacity style={styles.submitButton} onPress={handleSubmitRating}>
                    <Text style={styles.submitButtonText}>Submit Rating</Text>
                  </TouchableOpacity>
                </View>
              )}
              
              {currentUserRatingInfo && !showFeedback && (
                <View style={styles.yourRatingContainer}>
                  <Text style={styles.yourRatingText}>Your rating: {currentUserRatingInfo.rating} stars</Text>
                  {currentUserRatingInfo.feedback && <Text style={styles.yourFeedbackText}>"{currentUserRatingInfo.feedback}"</Text>}
                   <TouchableOpacity onPress={() => setShowFeedback(true)}>
                    <Text style={styles.editRatingText}>Edit your rating</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          <View style={styles.activityActions}>
            {canPerformAdminActions && (
              <>
                {isIdeaSection ? (
                  <>
                   <TouchableOpacity style={[styles.actionButton, styles.scheduleButton]} onPress={() => onSchedule && onSchedule(item)}>
                      <Text style={styles.actionButtonText}>Schedule</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.actionButton, styles.editButton]} onPress={() => onEdit && onEdit(item)}>
                      <Text style={styles.actionButtonText}>Edit</Text>
                    </TouchableOpacity>
                    {canDelete && (
                      <TouchableOpacity style={[styles.actionButton, styles.deleteButton]} onPress={() => onDelete && onDelete(item.id)}>
                        <Text style={styles.actionButtonText}>Delete</Text>
                      </TouchableOpacity>
                    )}
                  </>
                ) : (
                  <>
                   <TouchableOpacity style={[styles.actionButton, styles.editButton]} onPress={() => onEdit && onEdit(item)}>
                      <Text style={styles.actionButtonText}>Edit</Text>
                    </TouchableOpacity>
                    {canDelete && (
                      <TouchableOpacity style={[styles.actionButton, styles.deleteButton]} onPress={() => onDelete && onDelete(item.id)}>
                        <Text style={styles.actionButtonText}>Delete</Text>
                      </TouchableOpacity>
                    )}
                  </>
                )}
              </>
            )}
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  activityCard: { 
    backgroundColor: colors.surface, 
    borderRadius: 12, 
    marginBottom: 16, 
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  activityLayoutContainer: {
    flexDirection: 'column',
  },
  desktopActivityLayoutContainer: {
    flexDirection: 'row-reverse',
  },
  activityTextContent: {
    flex: 1,
    padding: 16,
  },
  activityImageContainer: {
    width: '100%',
  },
  desktopActivityImageContainer: {
    width: '25%',
  },
  activityCoverImage: {
    width: '100%',
    height: 'auto',
    aspectRatio: 16 / 9,
    resizeMode: 'cover',
    backgroundColor: '#eef2f6',
  },
  activityName: { fontSize: 18, fontWeight: '700', color: colors.text },
  activityHeader: {
    flexDirection: 'column',
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  activityDate: { fontSize: 14, color: colors.textSecondary, marginBottom: 8 },
  itineraryStopText: { fontSize: 13, color: colors.primary, fontWeight: '700', marginBottom: 8 },
  activityDescription: { fontSize: 14, color: colors.textSecondary, marginBottom: 8 },
  activityDetailText: { fontSize: 14, color: colors.textSecondary, marginBottom: 4 },
  activityActions: { 
    flexDirection: 'row', 
    justifyContent: 'flex-start', 
    gap: 8, 
    paddingTop: 16, 
    borderTopWidth: 1, 
    borderTopColor: colors.border, 
    flexWrap: 'wrap' 
  },
  actionButton: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  actionButtonText: { color: colors.textLight, fontSize: 14, fontWeight: '700' },
  editButton: { backgroundColor: colors.primary },
  scheduleButton: { backgroundColor: colors.success },
  deleteButton: { backgroundColor: colors.error },
  surpriseText: { fontSize: 20, fontWeight: 'bold', textAlign: 'center', paddingVertical: 40 },
  votingContainer: { marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#eee' },
  voteButton: { alignItems: 'center' },
  voteEmoji: { fontSize: 28, opacity: 0.4 },
  selectedVote: { opacity: 1, transform: [{ scale: 1.2 }] },
  votingTitle: { fontSize: 16, fontWeight: '600', textAlign: 'center', marginBottom: 12 },
  voteButtons: { 
    flexDirection: 'row', 
    justifyContent: 'space-around',
    flexWrap: 'wrap',
    gap: 10,
  },
  voteCount: { fontSize: 14, fontWeight: '600', color: colors.text, marginTop: 4 },
  linkText: { color: colors.primary, marginTop: 4, textDecorationLine: 'underline' },
  challengesContainer: { marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#eee' },
  challengesTitle: { fontSize: 16, fontWeight: '600', marginBottom: 8 },
  challengeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  challengeText: {
    fontSize: 16,
    color: colors.text,
    flex: 1,
    marginLeft: 10,
  },
  challengeActionContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadSpinner: {
    padding: 4,
  },
  scoreContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.success,
  },
  scoreLabel: {
    fontSize: 10,
    color: colors.success,
  },
  pastActivity: {
    backgroundColor: colors.backgroundAlt,
    borderColor: colors.border,
  },
  ratingSection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    alignItems: 'center',
  },
  starsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 16,
  },
  star: {
    marginHorizontal: 5,
  },
  feedbackContainer: {
    width: '100%',
    paddingHorizontal: 10,
  },
  feedbackInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  submitButton: {
    backgroundColor: colors.primary,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  submitButtonText: {
    color: colors.textLight,
    fontWeight: 'bold',
  },
  averageRatingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  averageRatingText: {
    fontSize: 14,
    color: colors.textSecondary,
    marginHorizontal: 4,
  },
  yourRatingContainer: {
    alignItems: 'center',
    marginTop: 8,
  },
  yourRatingText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  yourFeedbackText: {
    fontSize: 14,
    color: colors.textSecondary,
    fontStyle: 'italic',
    marginTop: 4,
  },
  editRatingText: {
    fontSize: 14,
    color: colors.primary,
    marginTop: 8,
  },
  costContainer: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  costTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  totalCostText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.text,
    marginTop: 4,
  },
  categoryContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
    marginBottom: 4,
  },
  categoryTag: {
    backgroundColor: colors.backgroundAlt,
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 10,
    marginRight: 6,
    marginBottom: 6,
  },
  categoryTagText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  bookedBadge: {
    backgroundColor: colors.success,
    borderRadius: 12,
    paddingVertical: 2,
    paddingHorizontal: 8,
    marginBottom: 6,
  },
  bookedBadgeText: {
    color: colors.textLight,
    fontSize: 10,
    fontWeight: '600',
  },
});

export default ActivityCard;
