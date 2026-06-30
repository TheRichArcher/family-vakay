import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, RefreshControl, Platform } from 'react-native';
import { RouteProp, useRoute, useFocusEffect, useNavigation } from '@react-navigation/native';
import { KidDashboardStackParamList, TripsStackParamList } from '../navigation/AppNavigator';
import { activitiesService, Activity, Challenge, ChallengeCompletion } from '../services/activitiesService';
import { scavengerHuntService } from '../services/scavengerHuntService';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import apiClient from '../utils/apiClient';
import { ConfirmModal } from '../components/ConfirmModal';
import { getDateTime } from '../utils/dateUtils';
import { StorageImage } from '../components/StorageImage';
import { colors } from '../theme/colors';

const getAgeGroupForAge = (age: number): string => {
  if (age >= 5 && age <= 7) return '5-7';
  if (age >= 8 && age <= 9) return '8-9';
  if (age >= 10 && age <= 13) return '10-13';
  if (age >= 14 && age <= 17) return '14-17';
  if (age >= 18) return '18+';
  return 'all';
};

type ScavengerHuntScreenRouteProp = RouteProp<TripsStackParamList & KidDashboardStackParamList, 'ScavengerHunt'>;

export default function ScavengerHuntScreen() {
  const route = useRoute<ScavengerHuntScreenRouteProp>();
  const navigation = useNavigation();
  const { tripId } = route.params;
  const { user } = useAuth();

  const [allChallenges, setAllChallenges] = useState<{ activityId: string; challenge: Challenge; activityName: string; challengeIndex: number; }[]>([]);
  const [displayedChallenges, setDisplayedChallenges] = useState<{ activityId: string; challenge: Challenge; activityName: string; challengeIndex: number; }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [isConfirmModalVisible, setConfirmModalVisible] = useState(false);
  const [uploadingChallenge, setUploadingChallenge] = useState<string | null>(null);
  const [uploadErrors, setUploadErrors] = useState<{ [key: string]: boolean }>({});
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [listeningChallengeKey, setListeningChallengeKey] = useState<string | null>(null);

  const getAgeGroupTag = (ageGroup: string | undefined): string | null => {
    if (!ageGroup) return null;
    const ageGroupTags: { [key: string]: string } = {
      'all': '🌟 All Ages',
      '5-7': '🎈 Ages 5-7',
      '8-9': '🎨 Ages 8-9',
      '10-13': '🕵️ Ages 10-13',
      '14-17': '🚀 Ages 14-17',
      '18+': '💼 Ages 18+',
    };
    return ageGroupTags[ageGroup] || null;
  };

  const sortChallenges = (challenges: { activityId: string; challenge: Challenge; activityName: string; challengeIndex: number; }[]) => {
    return challenges.sort((a, b) => {
      const aStatus = a.challenge.completions?.[user!.uid]?.status;
      const bStatus = b.challenge.completions?.[user!.uid]?.status;

      const getStatusWeight = (status: string | undefined) => {
        if (!status) return 0; // New/unattempted
        switch (status) {
          case 'pending':
          case 'error':
            return 1; // Attempted, but not finalized
          case 'approved':
          case 'rejected':
            return 2; // Finalized
          default:
            return 0;
        }
      };

      const aWeight = getStatusWeight(aStatus);
      const bWeight = getStatusWeight(bStatus);

      if (aWeight !== bWeight) {
        return aWeight - bWeight;
      }
      
      // If weights are the same, maintain original chronological order from activities
      return 0;
    });
  };

  const loadHuntData = useCallback(async (showLoading = true) => {
    if (!user) return; // Don't run if user is not loaded yet

    if (showLoading) setIsLoading(true);
    try {
      const fetchedActivities = await activitiesService.getActivitiesForTrip(tripId);
      const sortedActivities = fetchedActivities.sort((a, b) => getDateTime(a).getTime() - getDateTime(b).getTime());
      setActivities(sortedActivities);

      const allChallenges = sortedActivities.flatMap(activity => 
        (activity.challenges || []).map((challenge, index) => ({
          activityId: activity.id,
          challenge: challenge,
          activityName: activity.name,
          challengeIndex: index
        }))
      );
      
      const sortedAllChallenges = sortChallenges(allChallenges);
      
      setAllChallenges(sortedAllChallenges);
      
    } catch (error) {
      console.error("Failed to load scavenger hunt data:", error);
      Alert.alert("Error", "Could not load the scavenger hunt.");
    } finally {
      if (showLoading) setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [tripId, user]);
  
  useEffect(() => {
    if (!user) return;

    if (user.isKid) {
      const kidAgeGroup = user.age ? getAgeGroupForAge(user.age) : 'all';
      
      // Prioritize challenges for the user's specific age group
      let ageGroupChallenges = allChallenges.filter(c => c.challenge.age_group === kidAgeGroup);
      
      // If none exist for their age, fall back to 'all'
      if (ageGroupChallenges.length === 0) {
        ageGroupChallenges = allChallenges.filter(c => c.challenge.age_group === 'all');
      }
      
      // Limit to 5 challenges. The list is already sorted by completion status.
      const finalChallenges = ageGroupChallenges.slice(0, 5);

      setDisplayedChallenges(finalChallenges);
    } else {
      // This is for admin/parent users
      const filtered = activeFilter === 'all'
        ? allChallenges
        // For 'all', show everything. Otherwise, filter to the specific group.
        : allChallenges.filter(c => c.challenge.age_group === activeFilter);
      setDisplayedChallenges(filtered);
    }
  }, [allChallenges, activeFilter, user]);

  useFocusEffect(
    useCallback(() => {
      loadHuntData();
    }, [loadHuntData])
  );

  useEffect(() => {
    if (!listeningChallengeKey || !user) return;
  
    const [activityId, challengeIndexStr] = listeningChallengeKey.split('-');
    const challengeIndex = parseInt(challengeIndexStr, 10);
    
    // Subscribe to real-time updates for the specific activity
    const unsubscribe = activitiesService.listenForChallengeUpdates(activityId, (updatedActivityData) => {
      const updatedChallenges = updatedActivityData.challenges || [];
      const challenge = updatedChallenges[challengeIndex];
      const completion = challenge?.completions?.[user.uid];
  
      if (completion && (completion.status === 'approved' || completion.status === 'rejected')) {
        const resultTitle = completion.status === 'approved' ? 'Challenge Approved!' : 'Challenge Update';
        const resultMessage = `${completion.comment || ''} ${completion.status === 'approved' ? `\nYou got ${completion.pointsAwarded} points!` : ''}`;
        Alert.alert(resultTitle, resultMessage.trim());
  
        // Stop listening after we get the result.
        unsubscribe();
        setListeningChallengeKey(null);
  
        // Perform a final data load to ensure UI consistency
        loadHuntData(false);
      }
    });
  
    // Cleanup function to unsubscribe when the component unmounts or the key changes
    return () => {
      unsubscribe();
    };
  }, [listeningChallengeKey, user, loadHuntData]);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    loadHuntData(false);
  }, [loadHuntData]);

  const handleFilter = (filter: string) => {
    setActiveFilter(filter);
  };

  const handleShuffle = () => {
    setDisplayedChallenges(prev => [...prev].sort(() => Math.random() - 0.5));
  };

  const handleImageUpload = async (activityId: string, challengeIndex: number) => {
    const challengeKey = `${activityId}-${challengeIndex}`;
    // Clear previous errors for this challenge on retry
    setUploadErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[challengeKey];
      return newErrors;
    });
    setUploadingChallenge(challengeKey);

    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
    if (permissionResult.granted === false) {
      Alert.alert("Permission required", "You need to allow access to your camera to upload evidence.");
      setUploadingChallenge(null);
      return;
    }

    const pickerResult = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.7,
    });

    if (pickerResult.canceled || !pickerResult.assets || pickerResult.assets.length === 0) {
      setUploadingChallenge(null);
      return;
    }
    
    const asset = pickerResult.assets[0];
    const fileName = asset.uri.split('/').pop() || 'upload.jpg';
    const contentType = asset.mimeType || 'image/jpeg';
    
    try {
      // 1. Get signed URL
      const { signed_url, image_url } = await scavengerHuntService.generateUploadUrl(tripId, activityId, challengeIndex, fileName, contentType);

      // 2. Upload image to signed URL
      const response = await fetch(asset.uri);
      const blob = await response.blob();
      
      const uploadResponse = await fetch(signed_url, {
        method: 'PUT',
        body: blob,
        headers: {
          'Content-Type': contentType,
          // Do not set Content-Length in browser requests; it is managed by the user agent
        },
      });

      if (!uploadResponse.ok) {
        const responseText = await uploadResponse.text();
        console.error("GCS Upload Failed — Status:", uploadResponse.status);
        console.error("Full response text:", responseText);
        Alert.alert("Upload Error", `Cloud rejected the upload. Status: ${uploadResponse.status}`);
        throw new Error(`Upload failed: ${uploadResponse.status} - ${responseText}`);
      }

      // 3. Submit for scoring
      const submissionResponse = await scavengerHuntService.submitChallengeForScoring(tripId, activityId, challengeIndex, image_url);
      
      Alert.alert("Submission Received!", submissionResponse.message || "Your photo has been submitted and is being judged by our AI!");
      
      // Refresh the data from the server to get the 'pending' state
      await loadHuntData(false);

      // Start listening for this challenge's result
      setListeningChallengeKey(challengeKey);

    } catch (error) {
      const challengeKey = `${activityId}-${challengeIndex}`;
      setUploadErrors(prev => ({ ...prev, [challengeKey]: true }));
      console.error("Image upload process failed:", error);
      // The specific Alert is now in the !uploadResponse.ok block
    } finally {
      setUploadingChallenge(null);
    }
  };

  const handleGenerateHunt = async () => {
    if (activities.length === 0) {
      Alert.alert("No Activities", "Please add some activities to your trip before generating a scavenger hunt.");
      return;
    }
    const hasExistingChallenges = activities.some(a => a.challenges && a.challenges.length > 0);
    if (hasExistingChallenges) {
      setConfirmModalVisible(true);
    } else {
      generateChallenges();
    }
  };

  const generateChallenges = async () => {
    setConfirmModalVisible(false);
    setIsGenerating(true);
    try {
      await apiClient.post(`/api/v1/trips/${tripId}/generate-ai-hunt`);
      Alert.alert("Success!", "A new AI-powered scavenger hunt has been generated.");
      await loadHuntData(false);
    } catch (error: any) {
      console.error("Failed to generate hunt:", error);
      const errorMessage = error.response?.data?.detail || "Could not generate the scavenger hunt.";
      Alert.alert("Error", errorMessage);
    } finally {
      setIsGenerating(false);
    }
  };

  const renderChallengeStatus = (completion: ChallengeCompletion | undefined, activityId: string, challengeIndex: number) => {
    const key = `${activityId}-${challengeIndex}`;

    if (uploadErrors[key]) {
      return (
        <TouchableOpacity onPress={() => handleImageUpload(activityId, challengeIndex)}>
          {/* Using a different icon to signify a failed UPLOAD vs a rejected SUBMISSION */}
          <Ionicons name="cloud-offline-outline" size={30} color="#F44336" />
        </TouchableOpacity>
      );
    }

    if (uploadingChallenge === key) {
      return <ActivityIndicator style={styles.uploadSpinner} color={colors.primary} />;
    }
    
    if (completion?.status === 'approved') {
        // The score is the most important feedback. Prioritize showing it.
        if (typeof completion.pointsAwarded === 'number') {
            return (
                <View style={styles.scoreContainer}>
                    <Text style={styles.scoreText}>+{completion.pointsAwarded}</Text>
                    <Text style={styles.scoreLabel}>pts</Text>
                </View>
            );
        }
        // If for some reason points aren't available yet, show a temporary indicator.
        return <ActivityIndicator style={styles.uploadSpinner} color={colors.success} />;
    }

    if (completion?.status === 'rejected') {
        return <Ionicons name={'close-circle'} size={30} color={colors.error} />;
    }

    if (completion?.status === 'pending') {
        return <Ionicons name="hourglass-outline" size={30} color={colors.accent} />;
    }

    if (completion?.status === 'error') {
        return (
            <TouchableOpacity onPress={() => handleImageUpload(activityId, challengeIndex)}>
                <Ionicons name="alert-circle-outline" size={30} color="#F44336" />
            </TouchableOpacity>
        );
    }
    
    // Default: camera icon to upload
    return (
      <TouchableOpacity onPress={() => handleImageUpload(activityId, challengeIndex)}>
        <Ionicons name="camera-outline" size={30} color={colors.primary} />
      </TouchableOpacity>
    );
  };
  
  if (isLoading) {
    return <View style={styles.centerContainer}><ActivityIndicator size="large" color={colors.accent} /></View>;
  }

  if (!user) {
    return <View style={styles.centerContainer}><Text>Please log in to see the scavenger hunt.</Text></View>
  }

  const completedCount = allChallenges.filter(c => c.challenge.completions?.[user.uid]?.status === 'approved').length;
  const totalPoints = allChallenges.reduce((sum, c) => sum + (c.challenge.completions?.[user.uid]?.pointsAwarded || 0), 0);

  const ageGroups = ['all', '5-7', '8-9', '10-13', '14-17', '18+'];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={28} color={colors.textLight} />
        </TouchableOpacity>
        <Text style={styles.title}>Scavenger Hunt</Text>
        <Text style={styles.subtitle}>Complete challenges to win!</Text>
      </View>

      <View style={styles.controlsContainer}>
        {!user?.isKid && (
          <TouchableOpacity 
            style={styles.generateButton} 
            onPress={handleGenerateHunt} 
            disabled={isGenerating}
          >
            {isGenerating ? <ActivityIndicator color={colors.textLight} /> : <Text style={styles.generateButtonText}>✨ Gen AI Hunt</Text>}
          </TouchableOpacity>
        )}
        <View style={styles.progressContainer}>
          <Text style={styles.progressText}>{`${completedCount} / ${displayedChallenges.length}`}</Text>
          <View style={styles.progressBarBackground}>
            <View style={[styles.progressBarFill, { width: `${(completedCount / (displayedChallenges.length || 1)) * 100}%` }]} />
          </View>
          <Text style={styles.pointsText}>{totalPoints} pts</Text>
        </View>
      </View>

      {!user?.isKid && (
        <View style={styles.filterContainer}>
          <Text style={styles.filterTitle}>Select Difficulty:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {ageGroups.map(group => (
              <TouchableOpacity 
                key={group} 
                style={[styles.filterButton, activeFilter === group && styles.activeFilterButton]} 
                onPress={() => handleFilter(group)}
              >
                <Text style={[styles.filterButtonText, activeFilter === group && styles.activeFilterButtonText]}>{getAgeGroupTag(group)}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.shuffleButton} onPress={handleShuffle}>
              <Ionicons name="shuffle" size={20} color="#fff" />
            </TouchableOpacity>
          </ScrollView>
        </View>
      )}

      <ScrollView 
        keyboardShouldPersistTaps="handled"
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContentContainer}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} colors={[colors.accent]} tintColor={colors.accent} />}
      >
        {displayedChallenges.length === 0 ? (
          <View style={styles.noChallengesContainer}>
            <Text style={styles.noChallengesText}>No scavenger hunt challenges yet.</Text>
            <Text style={styles.noChallengesSubText}>Press "Generate with AI" to get started!</Text>
          </View>
        ) : (
          displayedChallenges.map(({ activityId, challenge, activityName, challengeIndex }) => {
            const userCompletion = challenge.completions?.[user.uid];
            const challengeKey = `${activityId}-${challengeIndex}`;

            let cardStyle = styles.challengeCard;
            let statusIcon: React.ReactNode = null;
            let statusColor = colors.primary; // Default

            if (userCompletion) {
                switch (userCompletion.status) {
                    case 'approved':
                        cardStyle = { ...cardStyle, ...styles.approvedCard };
                         statusIcon = <Ionicons name="checkmark-circle" size={24} color={colors.textLight} />;
                         statusColor = colors.success;
                        break;
                    case 'rejected':
                        cardStyle = { ...cardStyle, ...styles.rejectedCard };
                         statusIcon = <Ionicons name="close-circle" size={24} color={colors.textLight} />;
                         statusColor = colors.error;
                        break;
                    case 'pending':
                        cardStyle = { ...cardStyle, ...styles.pendingCard };
                         statusIcon = <Ionicons name="hourglass" size={24} color={colors.textLight} />;
                         statusColor = colors.accent;
                        break;
                    case 'error':
                        cardStyle = { ...cardStyle, ...styles.errorCard };
                         statusIcon = <Ionicons name="alert-circle" size={24} color={colors.textLight} />;
                         statusColor = colors.error;
                        break;
                }
            }

            return (
              <View key={challengeKey} style={cardStyle}>
                <View style={styles.cardHeader}>
                    <Text style={styles.activityNameText}>From: {activityName}</Text>
                    {challenge.age_group && (
                      <View style={[styles.ageTag, { backgroundColor: statusColor }]}>
                        {statusIcon}
                        <Text style={styles.ageTagText}>{getAgeGroupTag(challenge.age_group)}</Text>
                      </View>
                    )}
                </View>

                <View style={styles.challengeContent}>
                  {userCompletion?.imageUrl && (
                      <StorageImage path={userCompletion.imageUrl} style={styles.challengeImage} />
                  )}
                  <Text style={styles.challengeText}>{challenge.text}</Text>
                </View>
                
                {userCompletion?.comment && (
                  <View style={styles.commentContainer}>
                    <Text style={styles.commentLabel}>Judge's Comment:</Text>
                    <Text style={styles.commentText}>"{userCompletion.comment}"</Text>
                  </View>
                )}

                <View style={styles.cardFooter}>
                  <View style={styles.pointsContainer}>
                    {userCompletion?.status === 'approved' && userCompletion.pointsAwarded && (
                      <Text style={styles.pointsAwardedText}>+{userCompletion.pointsAwarded} pts</Text>
                    )}
                  </View>
                  <View style={styles.challengeActionContainer}>
                      {renderChallengeStatus(userCompletion, activityId, challengeIndex)}
                  </View>
                </View>
              </View>
            )
          })
        )}
      </ScrollView>

      <ConfirmModal
        visible={isConfirmModalVisible}
        title="Overwrite Hunt?"
        message="This will replace any existing challenges with a new AI-generated hunt. Are you sure?"
        onCancel={() => setConfirmModalVisible(false)}
        onConfirm={generateChallenges}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  header: {
    backgroundColor: colors.accent,
    paddingTop: Platform.OS === 'android' ? 25 : 50, // Adjust for status bar
    paddingBottom: 20,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 25,
    borderBottomRightRadius: 25,
    alignItems: 'center',
    width: '100%',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'rgba(255, 255, 255, 0.9)',
    marginTop: 2,
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
    marginTop: 2,
  },
  controlsContainer: {
    flexDirection: 'row',
    padding: 16,
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  generateButton: {
    backgroundColor: colors.accent,
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 20,
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
    flexShrink: 0,
    minWidth: 120,
    alignItems: 'center',
    color: colors.textLight,
    fontWeight: '600',
    marginBottom: 4,
  },
  generateButtonText: {
    color: colors.textLight,
    fontSize: 14,
    fontWeight: 'bold',
  },
  progressContainer: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  progressText: {
    fontSize: 12,
    color: colors.accent,
    fontWeight: '600',
    marginBottom: 4,
  },
  pointsText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.accent,
    marginTop: 4,
  },
  progressBarBackground: {
    height: 8,
    width: '100%',
    backgroundColor: 'rgba(255, 138, 76, 0.2)',
    borderRadius: 4,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.accent,
    borderRadius: 4,
  },
  scrollView: {
    flex: 1,
    width: '100%',
  },
  scrollContentContainer: {
    paddingVertical: 8,
  },
  challengeCard: {
    backgroundColor: colors.white,
    borderRadius: 15,
    marginVertical: 8,
    marginHorizontal: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    borderLeftWidth: 5,
    borderLeftColor: colors.primary,
  },
  approvedCard: {
    borderLeftColor: colors.success,
  },
  rejectedCard: {
    borderLeftColor: colors.error,
  },
  pendingCard: {
    borderLeftColor: colors.accent,
  },
  errorCard: {
    borderLeftColor: colors.error,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  activityNameText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    flexShrink: 1,
  },
  challengeText: {
    fontSize: 18,
    fontWeight: '500',
    color: colors.text,
    marginBottom: 12,
    lineHeight: 24,
  },
  challengeImage: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 10,
    marginBottom: 12,
    backgroundColor: '#eef2f6',
    resizeMode: 'cover',
  },
  ageTag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 15,
  },
  ageTagText: {
    color: colors.textLight,
    fontWeight: 'bold',
    fontSize: 12,
    marginLeft: 5,
  },
  commentContainer: {
    backgroundColor: colors.backgroundAlt,
    borderRadius: 8,
    padding: 12,
    marginTop: 10,
  },
  commentLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 4,
  },
  commentText: {
    fontSize: 14,
    fontStyle: 'italic',
    color: colors.text,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 12,
  },
  pointsContainer: {
    flex: 1,
  },
  pointsAwardedText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.success,
  },
  challengeActionContainer: {
    // Keeps the button on the right
  },
  uploadSpinner: {
    padding: 4,
  },
  scoreContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreText: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.success,
  },
  scoreLabel: {
    fontSize: 12,
    color: colors.success,
  },
  noChallengesContainer: {
    marginTop: 50,
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  noChallengesText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.textSecondary,
    textAlign: 'center',
  },
  noChallengesSubText: {
    fontSize: 14,
    color: colors.muted,
    marginTop: 8,
    textAlign: 'center',
  },
  backButton: {
    position: 'absolute',
    top: Platform.OS === 'android' ? 25 : 50,
    left: 15,
    zIndex: 10,
  },
  backButtonText: {
    color: colors.textLight,
    fontSize: 18,
    marginLeft: 5,
    fontWeight: '600',
  },
  filterContainer: {
    paddingVertical: 12,
    paddingLeft: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.white,
  },
  filterTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 8,
  },
  filterButton: {
    backgroundColor: colors.backgroundAlt,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  activeFilterButton: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  filterButtonText: {
    color: colors.text,
    fontWeight: '600',
    fontSize: 13,
  },
  activeFilterButtonText: {
    color: colors.textLight,
  },
  shuffleButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    marginLeft: 4,
  },
  challengeContent: {
    flexDirection: 'column',
  },
}); 
