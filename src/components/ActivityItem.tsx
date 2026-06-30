import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Modal, Pressable, Image } from 'react-native';
import { Activity, ChallengeCompletion, Rating } from '../services/activitiesService';
import { useAuth } from '../contexts/AuthContext';
import { format, parseISO } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import { openWebsiteUrl } from '../utils/urlUtils';
import { isDateInThePast } from '../utils/dateComparison';
import { getDateTime } from '../utils/dateUtils';
import { Vote } from '../types/activity';
import { StorageImage } from './StorageImage';
import { colors } from '../theme/colors';

interface ActivityItemProps {
  item: Activity;
  uploadingActivityId: string | null;
  uploadingChallenge: string | null;
  onVote: (activityId: string, vote: Vote) => void;
  onRating: (activityId: string, rating: Rating) => void;
  onPhotoUpload: (activityId: string) => void;
  onChallengeUpload: (activityId: string, challengeIndex: number) => void;
  renderChallengeStatus: (completion: ChallengeCompletion | undefined, activityId: string, challengeIndex: number) => React.ReactNode;
  scavengerHuntEnabled: boolean;
}

const getAgeGroup = (age: number | undefined | null): string => {
  if (typeof age !== 'number') return 'all';
  if (age >= 5 && age <= 7) return '5-7';
  if (age >= 8 && age <= 9) return '8-9';
  if (age >= 10 && age <= 13) return '10-13';
  if (age >= 14 && age <= 17) return '14-17';
  if (age >= 18) return '18+';
  return 'all';
};

export default function ActivityItem({ 
  item, 
  uploadingActivityId,
  uploadingChallenge,
  onVote,
  onRating,
  onPhotoUpload,
  onChallengeUpload,
  renderChallengeStatus,
  scavengerHuntEnabled,
}: ActivityItemProps) {
  const { user } = useAuth();
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  if (item.isSurprise) {
    return (
      <View style={styles.activityCard}>
        <View style={styles.activityContent}>
          <Text style={styles.surpriseText}>🎉 Surprise Activity!</Text>
          {item.date && <Text style={styles.activityDate}>{format(parseISO(item.date), 'MMM d, yyyy')} {item.time || ''}</Text>}
        </View>
      </View>
    );
  }

  let displayCoverImageUrl = item.coverImageUrl;
  if (!displayCoverImageUrl && item.images && item.images.length > 0) {
    displayCoverImageUrl = item.images[0].thumbnailUrl || item.images[0].resizedUrl || item.images[0].url;
  } else if (!displayCoverImageUrl && item.imageUrls && item.imageUrls.length > 0) {
    displayCoverImageUrl = item.imageUrls[0];
  }

  const isPastActivity = isDateInThePast(getDateTime(item));
  const ratings = item.ratings || {};
  const ratingCounts = {
    'very-sad': Object.values(ratings).filter(v => v.rating === 1).length,
    sad: Object.values(ratings).filter(v => v.rating === 2).length,
    neutral: Object.values(ratings).filter(v => v.rating === 3).length,
    happy: Object.values(ratings).filter(v => v.rating === 4).length,
    'very-happy': Object.values(ratings).filter(v => v.rating === 5).length,
  };

  const votes = item.votes || {};
  const voteCounts = {
    'very-sad': Object.values(votes).filter(v => v === 'very-sad').length,
    sad: Object.values(votes).filter(v => v === 'sad').length,
    neutral: Object.values(votes).filter(v => v === 'neutral').length,
    happy: Object.values(votes).filter(v => v === 'happy').length,
    'very-happy': Object.values(votes).filter(v => v === 'very-happy').length,
  };

  return (
    <View style={styles.activityCard}>
      {displayCoverImageUrl && <StorageImage path={displayCoverImageUrl} style={styles.activityCoverImage} />}
      <View style={styles.activityContent}>
        <Text style={styles.activityName}>{item.name}</Text>
        {item.date && <Text style={styles.activityDate}>{format(parseISO(item.date), 'MMM d, yyyy')} {item.time || ''}</Text>}
        {item.description && <Text style={styles.activityDescription}>{item.description}</Text>}
        
        <View style={styles.galleryContainer}>
          <Text style={styles.galleryTitle}>Photo Gallery</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {(item.images || []).map((img, index) => {
              const thumb = img.thumbnailUrl || img.resizedUrl || img.url;
              const full = img.resizedUrl || img.url;
              return (
                <TouchableOpacity key={index} onPress={() => setLightboxImage(full)}>
                  <StorageImage path={thumb} style={styles.galleryImage} />
                </TouchableOpacity>
              );
            })}
            {(item.images?.length ? [] : (item.imageUrls || [])).map((url, index) => (
              <TouchableOpacity key={index} onPress={() => setLightboxImage(url)}>
                <StorageImage path={url} style={styles.galleryImage} />
              </TouchableOpacity>
            ))}
            {(item.images?.length === 0 && item.imageUrls?.length === 0) && (
              <Text style={styles.noPhotosText}>No photos yet. Add one!</Text>
            )}
          </ScrollView>
        </View>

        <Modal visible={!!lightboxImage} transparent animationType="fade" onRequestClose={() => setLightboxImage(null)}>
          <Pressable style={styles.lightboxBackdrop} onPress={() => setLightboxImage(null)}>
            <Pressable onPress={(e) => e.stopPropagation()}>
              {lightboxImage && (
                <Image source={{ uri: lightboxImage }} style={styles.lightboxImage} resizeMode="contain" />
              )}
            </Pressable>
          </Pressable>
        </Modal>

        {item.website && (
          <TouchableOpacity style={styles.websiteButton} onPress={() => openWebsiteUrl(item.website!)}>
            <Ionicons name="globe-outline" size={16} color="#fff" />
            <Text style={styles.websiteButtonText}>Visit Website</Text>
          </TouchableOpacity>
        )}
        
        {item.isIdea && (
          <View style={styles.votingContainer}>
            <Text style={styles.votingTitle}>How excited are you?</Text>
            <View style={styles.voteButtons}>
              <TouchableOpacity style={styles.voteButton} onPress={() => onVote(item.id, 'very-sad')}><Text style={[styles.voteEmoji, votes[user?.uid || ''] === 'very-sad' && styles.selectedVote]}>😩</Text><Text style={styles.voteCount}>{voteCounts['very-sad']}</Text></TouchableOpacity>
              <TouchableOpacity style={styles.voteButton} onPress={() => onVote(item.id, 'sad')}><Text style={[styles.voteEmoji, votes[user?.uid || ''] === 'sad' && styles.selectedVote]}>😞</Text><Text style={styles.voteCount}>{voteCounts.sad}</Text></TouchableOpacity>
              <TouchableOpacity style={styles.voteButton} onPress={() => onVote(item.id, 'neutral')}><Text style={[styles.voteEmoji, votes[user?.uid || ''] === 'neutral' && styles.selectedVote]}>😐</Text><Text style={styles.voteCount}>{voteCounts.neutral}</Text></TouchableOpacity>
              <TouchableOpacity style={styles.voteButton} onPress={() => onVote(item.id, 'happy')}><Text style={[styles.voteEmoji, votes[user?.uid || ''] === 'happy' && styles.selectedVote]}>🙂</Text><Text style={styles.voteCount}>{voteCounts.happy}</Text></TouchableOpacity>
              <TouchableOpacity style={styles.voteButton} onPress={() => onVote(item.id, 'very-happy')}><Text style={[styles.voteEmoji, votes[user?.uid || ''] === 'very-happy' && styles.selectedVote]}>😄</Text><Text style={styles.voteCount}>{voteCounts['very-happy']}</Text></TouchableOpacity>
            </View>
          </View>
        )}

        {scavengerHuntEnabled && item.challenges && item.challenges.length > 0 && (
          <View style={styles.challengesContainer}>
            <View style={styles.challengeHeader}>
              <Text style={styles.challengesTitle}>🎯 Scavenger Hunt</Text>
            </View>
            {(() => {
              const userAgeGroup = getAgeGroup(user?.age);
              const filteredChallenges = item.challenges!.filter(c => c.age_group === 'all' || c.age_group === userAgeGroup || !c.age_group);
              
              if (filteredChallenges.length === 0) {
                return <Text style={styles.emptyMessage}>No challenges for your age group yet!</Text>;
              }

              return filteredChallenges.map((challenge, index) => {
                const userCompletion = user ? challenge.completions?.[user.uid] : undefined;
                // Find original index
                const originalIndex = item.challenges!.findIndex(c => c.text === challenge.text);
                return (
                  <View key={originalIndex} style={styles.challengeItem}>
                    <View style={styles.challengeActionContainer}>
                      {renderChallengeStatus(userCompletion, item.id, originalIndex)}
                    </View>
                    <Text style={styles.challengeText}>{challenge.text}</Text>
                  </View>
                );
              });
            })()}
          </View>
        )}

        {isPastActivity && (
          <View style={styles.actionContainer}>
            <View style={styles.votingContainer}>
              <Text style={styles.votingTitle}>How was it?</Text>
              <View style={styles.voteButtons}>
                <TouchableOpacity style={styles.voteButton} onPress={() => onRating(item.id, { rating: 1 })}><Text style={[styles.voteEmoji, ratings[user?.uid || '']?.rating === 1 && styles.selectedVote]}>😩</Text><Text style={styles.voteCount}>{ratingCounts['very-sad']}</Text></TouchableOpacity>
                <TouchableOpacity style={styles.voteButton} onPress={() => onRating(item.id, { rating: 2 })}><Text style={[styles.voteEmoji, ratings[user?.uid || '']?.rating === 2 && styles.selectedVote]}>😞</Text><Text style={styles.voteCount}>{ratingCounts.sad}</Text></TouchableOpacity>
                <TouchableOpacity style={styles.voteButton} onPress={() => onRating(item.id, { rating: 3 })}><Text style={[styles.voteEmoji, ratings[user?.uid || '']?.rating === 3 && styles.selectedVote]}>😐</Text><Text style={styles.voteCount}>{ratingCounts.neutral}</Text></TouchableOpacity>
                <TouchableOpacity style={styles.voteButton} onPress={() => onRating(item.id, { rating: 4 })}><Text style={[styles.voteEmoji, ratings[user?.uid || '']?.rating === 4 && styles.selectedVote]}>🙂</Text><Text style={styles.voteCount}>{ratingCounts.happy}</Text></TouchableOpacity>
                <TouchableOpacity style={styles.voteButton} onPress={() => onRating(item.id, { rating: 5 })}><Text style={[styles.voteEmoji, ratings[user?.uid || '']?.rating === 5 && styles.selectedVote]}>😄</Text><Text style={styles.voteCount}>{ratingCounts['very-happy']}</Text></TouchableOpacity>
              </View>
            </View>
            <TouchableOpacity
              style={[styles.addPhotoButton, uploadingActivityId === item.id && styles.addPhotoButtonDisabled]}
              onPress={() => onPhotoUpload(item.id)}
              disabled={uploadingActivityId === item.id}
            >
              {uploadingActivityId === item.id ? (
                <ActivityIndicator color={colors.textLight} />
              ) : (
                <>
                  <Ionicons name="camera" size={20} color={colors.textLight} />
                  <Text style={styles.addPhotoButtonText}>Add Photo</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  activityCard: { backgroundColor: colors.surface, borderRadius: 12, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2, overflow: 'hidden' },
  activityCoverImage: { width: '100%', height: 180, resizeMode: 'cover' },
  activityContent: { padding: 16 },
  activityName: { fontSize: 20, fontWeight: '700', color: colors.text, marginBottom: 8 },
  activityDate: { fontSize: 15, color: colors.textSecondary, marginBottom: 8 },
  activityDescription: { fontSize: 15, color: colors.textSecondary },
  surpriseText: { fontSize: 22, fontWeight: 'bold', textAlign: 'center', paddingVertical: 40, color: colors.accent },
  challengesContainer: { marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.border },
  challengeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  challengesTitle: { fontSize: 18, fontWeight: 'bold', color: colors.text },
  toggleButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
    backgroundColor: '#eef5ff',
  },
  toggleButtonText: {
    color: colors.primary,
    fontWeight: '600',
    fontSize: 14,
  },
  challengeItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  challengeText: { fontSize: 16, color: colors.text, flex: 1, marginLeft: 12 },
  challengeActionContainer: { justifyContent: 'center', alignItems: 'center', width: 40 },
  websiteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 12,
    alignSelf: 'flex-start',
  },
  websiteButtonText: {
    color: colors.textLight,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  votingContainer: { marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.border },
  votingTitle: { fontSize: 18, fontWeight: 'bold', textAlign: 'center', marginBottom: 12 },
  voteButtons: { flexDirection: 'row', justifyContent: 'space-around', flexWrap: 'wrap', gap: 10 },
  voteButton: { alignItems: 'center' },
  voteEmoji: { fontSize: 32, padding: 8, borderRadius: 30, overflow: 'hidden' },
  selectedVote: {
    backgroundColor: 'rgba(14, 165, 168, 0.12)',
  },
  voteCount: { fontSize: 14, fontWeight: 'bold', color: colors.textSecondary, marginTop: 4 },
  actionContainer: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  addPhotoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  addPhotoButtonDisabled: {
    backgroundColor: colors.disabled,
  },
  addPhotoButtonText: {
    color: colors.textLight,
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  galleryContainer: {
    marginTop: 16,
  },
  galleryTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 8,
  },
  galleryImage: {
    width: 100,
    height: 100,
    borderRadius: 8,
    marginRight: 10,
  },
  noPhotosText: {
    fontStyle: 'italic',
    color: colors.textSecondary,
  },
  emptyMessage: { fontSize: 16, color: colors.textSecondary, textAlign: 'center', paddingVertical: 20 },
  lightboxBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  lightboxImage: {
    width: '90%',
    height: '80%',
  },
}); 