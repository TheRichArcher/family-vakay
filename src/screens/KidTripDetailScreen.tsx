import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, TouchableOpacity, ActivityIndicator, RefreshControl, Platform, Switch } from 'react-native';
import { RouteProp, useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import { KidDashboardStackParamList } from '../navigation/AppNavigator';
import { Trip, tripsService } from '../services/trips';
import { activitiesService, Activity, ChallengeCompletion } from '../services/activitiesService';
import { format, parseISO } from 'date-fns';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../contexts/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { getDateTime } from '../utils/dateUtils';
import * as ImagePicker from 'expo-image-picker';
import { scavengerHuntService } from '../services/scavengerHuntService';
import { StorageImage } from '../components/StorageImage';
import { aiService } from '../services/aiService';
import { Vote } from '../types/activity';
import { Rating } from '../services/activitiesService';
import { calculateActivityScore } from '../utils/activityUtils';
import ActivityItem from '../components/ActivityItem';
import { colors } from '../theme/colors';

type KidTripDetailScreenRouteProp = RouteProp<KidDashboardStackParamList, 'KidTripDetail'>;
type KidTripDetailNavigationProp = NativeStackNavigationProp<KidDashboardStackParamList, 'KidTripDetail'>;

interface GroupedActivities {
  [key: string]: Activity[];
}

export default function KidTripDetailScreen() {
  const route = useRoute<KidTripDetailScreenRouteProp>();
  const navigation = useNavigation<KidTripDetailNavigationProp>();
  const { user } = useAuth();
  const { tripId } = route.params;

  const [currentTrip, setCurrentTrip] = useState<Trip | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [groupedActivities, setGroupedActivities] = useState<GroupedActivities>({});
  const [activityIdeas, setActivityIdeas] = useState<Activity[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [uploadingChallenge, setUploadingChallenge] = useState<string | null>(null);
  const [uploadingActivityId, setUploadingActivityId] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState<{ text: string; type: 'fun' | 'bored' | 'error' } | null>(null);
  const [scavengerHuntEnabled, setScavengerHuntEnabled] = useState(false);

  const loadActivities = useCallback(async (tripId: string) => {
    try {
      let fetchedActivities = await activitiesService.getActivitiesForTrip(tripId);
      
      // For kids, filter out surprise activities
      if (user?.role === 'kid') {
        fetchedActivities = fetchedActivities.filter(a => !a.isSurprise);
      }
      
      const ideas = fetchedActivities.filter(a => a.isIdea);
      const scheduled = fetchedActivities.filter(a => !a.isIdea);
      
      const sortedIdeas = ideas.sort((a, b) => calculateActivityScore(b) - calculateActivityScore(a));
      setActivityIdeas(sortedIdeas);
      
      const sortedActivities = scheduled.sort((a, b) => getDateTime(a).getTime() - getDateTime(b).getTime());
      
      const groups: GroupedActivities = sortedActivities.reduce((acc, activity) => {
        if (activity.date) {
          const activityDate = format(parseISO(activity.date), 'yyyy-MM-dd');
          if (!acc[activityDate]) acc[activityDate] = [];
          acc[activityDate].push(activity);
        }
        return acc;
      }, {} as GroupedActivities);
      
      setGroupedActivities(groups);
    } catch (error) {
      console.error("Failed to load activities for kid:", error);
    }
  }, [user]);

  const fetchTripDetails = useCallback(async () => {
    setIsLoading(true);
    if (tripId) {
      try {
        const trip = await tripsService.getTripById(tripId);
        if (trip) {
          setCurrentTrip(trip);
          setScavengerHuntEnabled(trip.scavengerHuntEnabled ?? false);
          navigation.setOptions({ title: trip.name });
          await loadActivities(tripId);
        } else {
          Alert.alert("Error", "Trip not found.");
          navigation.goBack();
        }
      } catch (error) {
        console.error("Failed to fetch trip details for kid:", error);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    } else {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [tripId, navigation, loadActivities]);

  useFocusEffect(
    useCallback(() => {
      fetchTripDetails();
    }, [fetchTripDetails])
  );

  const handleToggleScavengerHunt = async (value: boolean) => {
    if (!currentTrip) return;
    
    setScavengerHuntEnabled(value);
    try {
      await tripsService.updateTrip(currentTrip.id, { scavengerHuntEnabled: value });
      // Optionally show feedback to the user
      // Alert.alert("Success", `Scavenger hunt ${value ? 'enabled' : 'disabled'}.`);
    } catch (error) {
      console.error("Failed to update scavenger hunt status:", error);
      Alert.alert("Error", "Could not update scavenger hunt setting. Please try again.");
      // Revert the state if the update fails
      setScavengerHuntEnabled(!value);
    }
  };

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    fetchTripDetails();
  }, [fetchTripDetails]);

  const handleAiFunRequest = async () => {
    if (!currentTrip) return;
    setIsAiLoading(true);
    setAiResponse(null);
    try {
      const response = await aiService.generateJokeOrFact(currentTrip.id);
      setAiResponse({ text: response.text, type: 'fun' });
    } catch (error: any) {
      console.error("Failed to get AI joke/fact:", JSON.stringify(error, null, 2));
      const message = error.response?.data?.detail || "Couldn't think of anything right now. Please try again!";
      setAiResponse({ text: message, type: 'error' });
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleAiImBored = async () => {
    if (!currentTrip) return;
    setIsAiLoading(true);
    setAiResponse(null);
    // For kids, the context is simpler. We can just say they are on a trip.
    try {
      const response = await aiService.suggestActivity(currentTrip.id, `on my trip with my family`);
      setAiResponse({ text: response.text, type: 'bored' });
    } catch (error: any) {
      console.error("Failed to get AI activity:", JSON.stringify(error, null, 2));
      const message = error.response?.data?.detail || "My creativity is running low. Please try again!";
      setAiResponse({ text: message, type: 'error' });
    } finally {
      setIsAiLoading(false);
    }
  };

  const handlePhotoUpload = async (activityId: string) => {
    setUploadingActivityId(activityId);

    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
    if (permissionResult.granted === false) {
      Alert.alert("Permission required", "You need to allow access to your camera to add photos.");
      setUploadingActivityId(null);
      return;
    }

    const pickerResult = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.7,
    });

    if (pickerResult.canceled || !pickerResult.assets || pickerResult.assets.length === 0) {
      setUploadingActivityId(null);
      return;
    }
    
    try {
      await activitiesService.uploadImageForActivity(activityId, pickerResult.assets[0].uri);
      Alert.alert("Awesome!", "Your photo has been added to the gallery.");
      await fetchTripDetails();
    } catch (error) {
      // The service layer's apiClient should have already shown an alert.
      console.error("Failed to upload photo for activity:", error);
    } finally {
      setUploadingActivityId(null);
    }
  };

  const handleImageUpload = async (activityId: string, challengeIndex: number) => {
    if (!currentTrip) return;
    const challengeKey = `${activityId}-${challengeIndex}`;
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
      quality: 0.5,
    });

    if (pickerResult.canceled) {
      setUploadingChallenge(null);
      return;
    }
    
    const asset = pickerResult.assets[0];
    const fileName = asset.uri.split('/').pop() || 'upload.jpg';
    const contentType = asset.mimeType || 'image/jpeg';
    
    try {
      const { signed_url, image_url } = await scavengerHuntService.generateUploadUrl(currentTrip.id, activityId, challengeIndex, fileName, contentType);
      const response = await fetch(asset.uri);
      const blob = await response.blob();
      
      await fetch(signed_url, {
        method: 'PUT',
        body: blob,
        headers: {
          'Content-Type': contentType,
          'Content-Length': String(blob.size),
        },
      });

      await scavengerHuntService.submitChallengeForScoring(currentTrip.id, activityId, challengeIndex, image_url);
      
      Alert.alert("Got it!", "Your photo has been sent to the judges. Good luck!");
      fetchTripDetails();

    } catch (error) {
      console.error("Image upload process failed:", error);
      Alert.alert("Uh oh!", "We couldn't upload your photo. Please try again.");
    } finally {
      setUploadingChallenge(null);
    }
  };

  const handleVote = async (activityId: string, vote: Vote) => {
    if (!user) return;
    const activity = activityIdeas.find(a => a.id === activityId);
    if (!activity) return;

    const currentVotes = activity.votes || {};
    const newVotes = { ...currentVotes, [user.uid]: currentVotes[user.uid] === vote ? undefined : vote };
    Object.keys(newVotes).forEach(key => (newVotes as any)[key] === undefined && delete (newVotes as any)[key]);

    try {
      await activitiesService.updateActivity(activityId, { votes: newVotes as any });
      if (tripId) {
        await loadActivities(tripId);
      }
    } catch (error) {
      Alert.alert('Error', 'Could not save your vote.');
    }
  };

  const handleRating = async (activityId: string, rating: Rating) => {
    if (!user) return;
  
    const activity = Object.values(groupedActivities).flat().find(a => a.id === activityId);
    if (!activity) return;
  
    const currentRatings = activity.ratings || {};
    const newRatings = { ...currentRatings, [user.uid]: currentRatings[user.uid] === rating ? undefined : rating };
    Object.keys(newRatings).forEach(key => (newRatings as any)[key] === undefined && delete (newRatings as any)[key]);
  
    try {
      await activitiesService.updateActivity(activityId, { ratings: newRatings as any });
      // We no longer need to reload all activities, the backend will filter on next load
      // and the frontend hides it immediately. Let's find the activity and update its state locally.
      const updateActivities = (prev: GroupedActivities) => {
        const newGroups = { ...prev };
        for (const date in newGroups) {
          const index = newGroups[date].findIndex(a => a.id === activityId);
          if (index > -1) {
            const newActivity = { ...newGroups[date][index], ratings: newRatings as any };
            newGroups[date][index] = newActivity;
            return newGroups;
          }
        }
        return newGroups;
      };
      setGroupedActivities(updateActivities);

    } catch (error) {
      Alert.alert('Error', 'Could not save your rating.');
      console.error("Failed to save rating:", error);
    }
  };

  const renderChallengeStatus = (completion: ChallengeCompletion | undefined, activityId: string, challengeIndex: number) => {
    const key = `${activityId}-${challengeIndex}`;

    if (uploadingChallenge === key) {
      return <ActivityIndicator style={styles.uploadSpinner} color={colors.primary} />;
    }
    
    if (completion?.status === 'approved') {
        if (typeof completion.pointsAwarded === 'number') {
            return (
                <View style={styles.scoreContainer}>
                    <Text style={styles.scoreText}>+{completion.pointsAwarded}</Text>
                    <Text style={styles.scoreLabel}>pts</Text>
                </View>
            );
        }
        return <Ionicons name="checkmark-circle" size={30} color={colors.success} />;
    }

    if (completion?.status === 'rejected') {
        return <Ionicons name={'close-circle'} size={30} color={colors.error} />;
    }

    if (completion?.imageUrl) {
      return <Ionicons name="hourglass-outline" size={30} color={colors.accent} />;
    }

    return (
      <TouchableOpacity onPress={() => handleImageUpload(activityId, challengeIndex)}>
        <Ionicons name="camera-outline" size={30} color={colors.primary} />
      </TouchableOpacity>
    );
  };

  if (isLoading || !currentTrip) {
    return <View style={styles.containerCentered}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={Platform.OS === 'web' ? undefined : <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
    >
      {currentTrip.coverImageUrl && <StorageImage path={currentTrip.coverImageUrl} style={styles.coverImage} />}
      
      <View style={styles.card}>
        <Text style={styles.title}>{currentTrip.name}</Text>
        <TouchableOpacity 
          style={styles.leaderboardButton} 
          onPress={() => navigation.navigate('Leaderboard', { tripId: currentTrip.id })}
        >
          <Ionicons name="trophy-outline" size={20} color="#fff" />
          <Text style={styles.leaderboardButtonText}>View Leaderboard</Text>
        </TouchableOpacity>

        <View style={styles.scavengerHuntToggleContainer}>
          <Text style={styles.scavengerHuntToggleLabel}>Scavenger Hunt</Text>
          <Switch
            trackColor={{ false: "#ccc", true: "rgba(255, 255, 255, 0.5)" }}
            thumbColor={scavengerHuntEnabled ? "#fff" : "#f4f3f4"}
            ios_backgroundColor="#3e3e3e"
            onValueChange={handleToggleScavengerHunt}
            value={scavengerHuntEnabled}
          />
        </View>

        <View style={styles.funZone}>
            <TouchableOpacity style={[styles.funButton, {backgroundColor: '#3498db'}]} onPress={handleAiFunRequest}><Ionicons name="happy-outline" size={24} color="white" /><Text style={styles.funButtonText}>Tell Me Something Fun</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.funButton, {backgroundColor: '#f1c40f'}]} onPress={handleAiImBored}><Ionicons name="bulb-outline" size={24} color="white" /><Text style={styles.funButtonText}>I'm Bored</Text></TouchableOpacity>
        </View>

        <View style={styles.tripActions}>
          <TouchableOpacity 
            style={[styles.tripActionButton, styles.bedtimeStoryButton]}
            onPress={() => navigation.navigate('BedtimeStory', { tripId })}
          >
            <Ionicons name="moon-outline" size={24} color="white" />
            <Text style={styles.tripActionButtonText}>Bedtime Story</Text>
          </TouchableOpacity>
        </View>

        
        {isAiLoading && <View style={[styles.aiResponseContainer, styles.aiLoadingContainer]}><ActivityIndicator color="#007AFF" /><Text style={{fontSize: 16, color: '#333', marginLeft: 10}}>Thinking...</Text></View>}

        {aiResponse && (
          <View style={[styles.aiResponseContainer, aiResponse.type === 'error' ? styles.aiError : (aiResponse.type === 'fun' ? styles.aiFun : styles.aiBored)]}>
            <Text style={styles.aiResponseText}>{aiResponse.text}</Text>
            <TouchableOpacity onPress={() => setAiResponse(null)} style={styles.aiCloseButton}><Ionicons name="close-circle" size={24} color="#666" /></TouchableOpacity>
          </View>
        )}
      </View>

      <View style={styles.activitiesSection}>
        <Text style={styles.sectionTitle}>Our Plan</Text>
        {isLoading ? <ActivityIndicator size="large" color="#007AFF" /> : Object.keys(groupedActivities).length === 0 ? <Text style={styles.emptyMessage}>No activities scheduled yet.</Text> :
          Object.keys(groupedActivities).map(date => (
            <View key={date}>
              <Text style={styles.daySeparatorText}>{format(parseISO(date), 'EEEE, MMM d')}</Text>
              {groupedActivities[date].map(item => (
                <ActivityItem
                  key={item.id}
                  item={item}
                  uploadingActivityId={uploadingActivityId}
                  uploadingChallenge={uploadingChallenge}
                  onVote={handleVote}
                  onRating={handleRating}
                  onPhotoUpload={handlePhotoUpload}
                  onChallengeUpload={handleImageUpload}
                  renderChallengeStatus={renderChallengeStatus}
                  scavengerHuntEnabled={scavengerHuntEnabled}
                />
              ))}
            </View>
          ))
        }
      </View>

      <View style={styles.activitiesSection}>
        <Text style={styles.sectionTitle}>Activity Ideas</Text>
        <Text style={styles.sectionDescription}>Vote for your favorite ideas!</Text>
        {activityIdeas.length === 0 ? <Text style={styles.emptyMessage}>No ideas yet. Ask an adult to add some!</Text> :
          activityIdeas.map(item => (
            <ActivityItem
              key={item.id}
              item={item}
              uploadingActivityId={uploadingActivityId}
              uploadingChallenge={uploadingChallenge}
              onVote={handleVote}
              onRating={handleRating}
              onPhotoUpload={handlePhotoUpload}
              onChallengeUpload={handleImageUpload}
              renderChallengeStatus={renderChallengeStatus}
              scavengerHuntEnabled={scavengerHuntEnabled}
            />
          ))
        }
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  containerCentered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background },
  coverImage: { width: '100%', height: 220, resizeMode: 'cover' },
  card: { padding: 20, margin: 16, marginTop: -60, backgroundColor: colors.white, borderRadius: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 5 },
  title: { fontSize: 28, fontWeight: 'bold', color: colors.text, textAlign: 'center', marginBottom: 16 },
  daySeparatorText: { fontSize: 18, fontWeight: 'bold', color: '#495057', paddingVertical: 15, paddingHorizontal: 16, backgroundColor: 'rgba(0,0,0,0.02)', marginTop: 10 },
  leaderboardButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent, paddingVertical: 12, borderRadius: 12 },
  leaderboardButtonText: { color: colors.textLight, fontSize: 16, fontWeight: 'bold', marginLeft: 8 },
  scavengerHuntToggleContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 15,
    backgroundColor: colors.success,
    borderRadius: 12,
  },
  scavengerHuntToggleLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textLight,
  },
  activitiesSection: { marginHorizontal: 16, marginBottom: 20 },
  sectionTitle: { fontSize: 24, fontWeight: 'bold', color: colors.text, marginBottom: 12 },
  sectionDescription: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 16,
    paddingHorizontal: 10,
    lineHeight: 22,
  },
  emptyMessage: { fontSize: 16, color: colors.textSecondary, textAlign: 'center', paddingVertical: 20 },
  activityCard: { backgroundColor: '#fff', borderRadius: 12, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2, overflow: 'hidden' },
  activityCoverImage: { width: '100%', height: 180, resizeMode: 'cover' },
  activityContent: { padding: 16 },
  activityName: { fontSize: 20, fontWeight: '700', color: '#333', marginBottom: 8 },
  activityDate: { fontSize: 15, color: '#666', marginBottom: 8 },
  activityDescription: { fontSize: 15, color: '#666' },
  surpriseText: { fontSize: 22, fontWeight: 'bold', textAlign: 'center', paddingVertical: 40, color: '#ff6b6b' },
  challengesContainer: { marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  challengeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  challengesTitle: { fontSize: 18, fontWeight: 'bold' },
  toggleButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
    backgroundColor: '#eef5ff',
  },
  toggleButtonText: {
    color: '#007AFF',
    fontWeight: '600',
    fontSize: 14,
  },
  challengeItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  challengeText: { fontSize: 16, color: '#333', flex: 1, marginLeft: 12 },
  challengeActionContainer: { justifyContent: 'center', alignItems: 'center', width: 40 },
  uploadSpinner: { padding: 4 },
  scoreContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  scoreLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: -4,
  },
  funZone: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 16,
    marginTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    gap: 10
  },
  funButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 10 },
  funButtonText: { color: 'white', marginLeft: 10, fontWeight: '600', fontSize: 14 },
  tripActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 16,
    gap: 10,
  },
  tripActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
  },
  tripActionButtonText: {
    color: '#fff',
    marginLeft: 10,
    fontWeight: 'bold',
    fontSize: 15,
  },
  scavengerHuntButton: {
    backgroundColor: '#FF6347', // A nice tomato color
  },
  bedtimeStoryButton: {
    backgroundColor: '#6A5ACD', // A nice slate blue color
  },
  aiResponseContainer: {
    padding: 16,
    borderRadius: 8,
    marginTop: 16,
    position: 'relative',
  },
  aiLoadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eef5ff',
  },
  aiFun: { backgroundColor: '#eef5ff' },
  aiBored: { backgroundColor: '#fffbe6' },
  aiError: { backgroundColor: '#ffeef0' },
  aiResponseText: {
    fontSize: 16,
    color: colors.text,
    lineHeight: 24,
  },
  aiCloseButton: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  websiteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#5bc0de',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 12,
    alignSelf: 'flex-start',
  },
  websiteButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    marginLeft: 8,
  },
  votingContainer: { marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#f0f0f0' },
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
});