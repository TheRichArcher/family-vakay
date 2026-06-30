import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, TouchableOpacity, ActivityIndicator, RefreshControl, Platform, Switch } from 'react-native';
import { RouteProp, useRoute, useNavigation, useFocusEffect } from '@react-navigation/native';
import { TripsStackParamList, RootStackParamList } from '../navigation/AppNavigator';
import { Trip, tripsService } from '../services/trips';
import { activitiesService, Activity } from '../services/activitiesService';
import { format, parseISO, isValid } from 'date-fns';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../contexts/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { userService, UserProfile } from '../services/userService';
import { getDateTime } from '../utils/dateUtils';
import { v4 as uuidv4 } from 'uuid';
import { aiService } from '../services/aiService';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import { scavengerHuntService } from '../services/scavengerHuntService';
import ActivityCard from '../components/ActivityCard';
import { colors } from '../theme/colors';
import { Vote } from '../types/activity';
import { isDateInThePast } from '../utils/dateComparison';
import { calculateActivityScore } from '../utils/activityUtils';
import KidsScavengerHunt from '../components/KidsScavengerHunt';
import { StorageImage } from '../components/StorageImage';

const activityCategories = [
  'All', 'Dining', 'Outdoor', 'Entertainment', 'Adults Only', 'Relaxation'
];

const activityPriceRanges = ['All', '$', '$$', '$$$', '$$$$'];

let RNHTMLtoPDF: any;
let Share: any;

if (Platform.OS !== 'web') {
  RNHTMLtoPDF = require('react-native-html-to-pdf').default;
  Share = require('react-native-share').default;
}

type TripDetailRouteProp = RouteProp<TripsStackParamList, 'TripDetail'>;
type TripDetailNavigationProp = NativeStackNavigationProp<RootStackParamList & TripsStackParamList>;

interface GroupedActivities {
  [key: string]: Activity[];
}

export default function TripDetailScreen() {
  const route = useRoute<TripDetailRouteProp>();
  const navigation = useNavigation<TripDetailNavigationProp>();
  const { user } = useAuth();
  const { tripId } = route.params;

  const [currentTrip, setCurrentTrip] = useState<Trip | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [groupedActivities, setGroupedActivities] = useState<GroupedActivities>({});
  const [activityIdeas, setActivityIdeas] = useState<Activity[]>([]);
  const [isLoadingActivities, setIsLoadingActivities] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [participants, setParticipants] = useState<UserProfile[]>([]);
  const [uploadingChallenge, setUploadingChallenge] = useState<string | null>(null);
  const [totalSpent, setTotalSpent] = useState(0);
  const [copied, setCopied] = useState(false);

  const [aiResponse, setAiResponse] = useState<{text: string, type: 'fun' | 'bored' | 'error'} | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [activityView, setActivityView] = useState<'upcoming' | 'past' | 'all'>('upcoming');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedPriceRanges, setSelectedPriceRanges] = useState<string[]>([]);
  const [showScavengerHunt, setShowScavengerHunt] = useState(true);

  const copyToClipboard = async () => {
    if (currentTrip?.vacationCode) {
      await Clipboard.setStringAsync(currentTrip.vacationCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000); // Reset after 2 seconds
    }
  };

  const handleToggleCategory = (category: string) => {
    if (category === 'All') {
      setSelectedCategories([]);
      return;
    }
    const newSelection = selectedCategories.includes(category)
      ? selectedCategories.filter(c => c !== category)
      : [...selectedCategories, category];
    setSelectedCategories(newSelection);
  };

  const handleTogglePrice = (price: string) => {
    if (price === 'All') {
      setSelectedPriceRanges([]);
      return;
    }
    const newSelection = selectedPriceRanges.includes(price)
      ? selectedPriceRanges.filter(p => p !== price)
      : [...selectedPriceRanges, price];
    setSelectedPriceRanges(newSelection);
  };

  const filteredGroupedActivities = useMemo(() => {
    let activitiesToFilter = groupedActivities;

    if (activityView !== 'all') {
        const filteredByView: GroupedActivities = {};
        for (const date in activitiesToFilter) {
            const activitiesInDate = activitiesToFilter[date].filter(activity => {
                const activityDate = getDateTime(activity);
                if (activityView === 'upcoming') {
                    return !isDateInThePast(activityDate);
                } else {
                    return isDateInThePast(activityDate);
                }
            });
            if (activitiesInDate.length > 0) {
                filteredByView[date] = activitiesInDate;
            }
        }
        activitiesToFilter = filteredByView;
    }
    
    if (selectedCategories.length > 0) {
        const filteredByCategory: GroupedActivities = {};
        for (const date in activitiesToFilter) {
            const activitiesInDate = activitiesToFilter[date].filter(activity => 
                activity.activityTypes?.some(type => selectedCategories.includes(type))
            );
            if (activitiesInDate.length > 0) {
                filteredByCategory[date] = activitiesInDate;
            }
        }
        activitiesToFilter = filteredByCategory;
    }

    if (selectedPriceRanges.length > 0) {
      const filteredByPrice: GroupedActivities = {};
      for (const date in activitiesToFilter) {
        const activitiesInDate = activitiesToFilter[date].filter(activity =>
          activity.priceRange && selectedPriceRanges.includes(activity.priceRange)
        );
        if (activitiesInDate.length > 0) {
          filteredByPrice[date] = activitiesInDate;
        }
      }
      activitiesToFilter = filteredByPrice;
    }

    return activitiesToFilter;
  }, [groupedActivities, activityView, selectedCategories, selectedPriceRanges]);

  const filteredActivityIdeas = useMemo(() => {
    let ideasToFilter = [...activityIdeas];
    
    if (selectedCategories.length > 0) {
      ideasToFilter = ideasToFilter.filter(idea =>
        idea.activityTypes?.some(cat => selectedCategories.includes(cat))
      );
    }
    
    if (selectedPriceRanges.length > 0) {
      ideasToFilter = ideasToFilter.filter(idea =>
        idea.priceRange && selectedPriceRanges.includes(idea.priceRange)
      );
    }
    
    return ideasToFilter;
  }, [activityIdeas, selectedCategories, selectedPriceRanges]);

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
    try {
      const response = await aiService.suggestActivity(currentTrip.id);
      setAiResponse({ text: response.text, type: 'bored' });
    } catch (error: any) {
      console.error("Failed to get AI activity:", JSON.stringify(error, null, 2));
      const message = error.response?.data?.detail || "My creativity is running low. Please try again!";
      setAiResponse({ text: message, type: 'error' });
    } finally {
      setIsAiLoading(false);
    }
  };

  const loadActivities = useCallback(async (trip: Trip) => {
    if (!tripId) return;
    setIsLoadingActivities(true);
    try {
      const fetchedActivities = await activitiesService.getActivitiesForTrip(tripId);

      const ideas = fetchedActivities.filter(a => a.isIdea);
      const scheduled = fetchedActivities.filter(a => !a.isIdea);
      
      const sortedIdeas = ideas.sort((a, b) => calculateActivityScore(b) - calculateActivityScore(a));
      setActivityIdeas(sortedIdeas);

      const spent = fetchedActivities
        .filter(act => act.isBooked && (act.cost || act.additionalExpenses))
        .reduce((sum, act) => sum + (Number(act.cost) || 0) + (Number(act.additionalExpenses) || 0), 0);
      setTotalSpent(spent);

      const sortedActivities = scheduled.sort((a: any, b: any) => getDateTime(a).getTime() - getDateTime(b).getTime());
      
      const groups: GroupedActivities = sortedActivities.reduce((acc: any, activity: any) => {
        if (activity.date && isValid(parseISO(activity.date))) {
          const activityDate = format(parseISO(activity.date), 'yyyy-MM-dd');
          if (!acc[activityDate]) acc[activityDate] = [];
          acc[activityDate].push(activity);
        }
        return acc;
      }, {} as GroupedActivities);
      
      setGroupedActivities(groups);
    } catch (error) {
      console.error("Failed to load activities:", error);
      Alert.alert("Error", "Could not load activities for this trip.");
    } finally {
      setIsLoadingActivities(false);
    }
  }, [tripId]);

  const fetchTripDetails = useCallback(async () => {
    setIsLoading(true);
    try {
      const trip = await tripsService.getTripById(tripId);
      if (trip) {
        const today = new Date();
        today.setHours(0, 0, 0, 0); 
        const tripEndDate = parseISO(trip.endDate);

        if (tripEndDate < today && trip.status !== 'completed') {
          await tripsService.updateTrip(trip.id, { status: 'completed' });
          trip.status = 'completed';
        }
        
        if (!trip.vacationCode) {
          const newCode = `${trip.name.substring(0, 4).toUpperCase()}-${uuidv4().substring(0, 4)}`;
          await tripsService.updateTrip(trip.id, { vacationCode: newCode });
          trip.vacationCode = newCode;
        }
        setCurrentTrip(trip);
        navigation.setOptions({ title: trip.name });
        
        const participantProfiles = await Promise.all((trip.participants || []).map(uid => userService.getUserProfile(uid)));
        const validParticipants = participantProfiles.filter((p): p is UserProfile => p !== null);
        setParticipants(validParticipants);
        
        await loadActivities(trip);
      } else {
        Alert.alert("Error", "Trip not found.");
        navigation.goBack();
      }
    } catch (error) {
      console.error("Failed to fetch trip details:", error);
      Alert.alert("Error", "Could not load trip details.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [tripId, navigation, user]);

  useFocusEffect(
    useCallback(() => {
      fetchTripDetails();
    }, [])
  );

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    fetchTripDetails();
  }, [fetchTripDetails]);

  const handleVote = async (activityId: string, vote: Vote) => {
    if (!user) return;
    const activity = activityIdeas.find(a => a.id === activityId);
    if (!activity) return;

    const currentVotes = activity.votes || {};
    const newVotes = { ...currentVotes, [user.uid]: currentVotes[user.uid] === vote ? undefined : vote };
    Object.keys(newVotes).forEach(key => (newVotes as any)[key] === undefined && delete (newVotes as any)[key]);

    try {
      await activitiesService.updateActivity(activityId, { votes: newVotes as any });
      setActivityIdeas(prev => prev.map(act => (act.id === activityId ? { ...act, votes: newVotes as any } : act)));
    } catch (error) {
      Alert.alert('Error', 'Could not save your vote.');
    }
  };

  const handleRating = async (activityId: string, rating: number, feedback?: string) => {
    if (!user) return;
  
    try {
      await activitiesService.rateActivity(activityId, rating, feedback);
      if (currentTrip) {
        await loadActivities(currentTrip); 
      }
       Alert.alert('Success', 'Your rating has been saved!');
    } catch (error) {
      Alert.alert('Error', 'Could not save your rating.');
      console.error("Failed to save rating:", error);
    }
  };

  const handleEditActivity = (activity: Activity) => {
    navigation.navigate('EditActivity', { activity });
  };

  const handleDeleteActivity = (activity: Activity) => {
    Alert.alert("Delete Activity", "Are you sure you want to delete this activity?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        try {
          if (activity.tripId) {
            await activitiesService.deleteActivity(activity.tripId, activity.id);
            if (currentTrip) {
              loadActivities(currentTrip);
            }
          }
        } catch (error) {
          Alert.alert("Error", "Could not delete activity.");
        }
      }}
    ]);
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
      const { signed_url } = await scavengerHuntService.generateUploadUrl(currentTrip.id, activityId, challengeIndex, fileName, contentType);

      const response = await fetch(asset.uri);
      const blob = await response.blob();
      
      await fetch(signed_url, {
        method: 'PUT',
        body: blob,
        headers: {
          'Content-Type': contentType,
        },
      });

      Alert.alert("Success!", "Your photo has been submitted and is being judged by our AI!");
      fetchTripDetails();

    } catch (error) {
      console.error("Image upload process failed:", error);
      Alert.alert("Upload Failed", "We couldn't upload your photo. Please try again.");
    } finally {
      setUploadingChallenge(null);
    }
  };

  const handleExportPDF = async () => {
    if (!currentTrip) return;

    const showBudget = user?.role !== 'kid' && typeof currentTrip.budget === 'number';

    const budgetSection = showBudget ? `
      <div class="section">
        <h2>Budget</h2>
        <table class="budget-table">
          <tr>
            <td>Total Budget:</td>
            <td>$${currentTrip.budget?.toFixed(2) || '0.00'}</td>
          </tr>
          <tr>
            <td>Spent:</td>
            <td>$${totalSpent.toFixed(2)}</td>
          </tr>
          <tr>
            <td>Remaining:</td>
            <td>$${((currentTrip.budget || 0) - totalSpent).toFixed(2)}</td>
          </tr>
        </table>
      </div>
    ` : '';

    const scheduledActivitiesSection = Object.keys(groupedActivities).length > 0 ? `
      <div class="section">
        <h2>Scheduled Activities</h2>
        ${Object.keys(groupedActivities).map(date => `
          <div class="date-group">
            <h3>${format(parseISO(date), 'EEEE, MMM d, yyyy')}</h3>
            ${groupedActivities[date].map(activity => `
              <div class="activity">
                <h4>${activity.name}</h4>
                <p>${activity.description || ''}</p>
                <p><strong>Location:</strong> ${activity.location || 'N/A'}</p>
                <p><strong>Time:</strong> ${activity.time || 'N/A'}</p>
              </div>
            `).join('')}
          </div>
        `).join('')}
      </div>
    ` : '';

    const activityIdeasSection = activityIdeas.length > 0 ? `
      <div class="section">
        <h2>Activity Ideas</h2>
        ${activityIdeas.map(activity => `
          <div class="activity">
            <h4>${activity.name}</h4>
            <p>${activity.description || ''}</p>
          </div>
        `).join('')}
      </div>
    ` : '';

    const htmlContent = `
      <html>
        <head>
          <style>
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333; }
            .container { padding: 20px; }
            h1 { font-size: 24px; text-align: center; margin-bottom: 20px; color: #007AFF; }
            .section { margin-bottom: 20px; }
            h2 { font-size: 20px; border-bottom: 2px solid #eee; padding-bottom: 5px; margin-bottom: 15px; }
            .details-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px; }
            .detail-item { padding: 5px; }
            .detail-label { font-weight: bold; }
            .budget-table { width: 100%; border-collapse: collapse; }
            .budget-table td { padding: 8px; border: 1px solid #ddd; }
            .date-group { margin-bottom: 15px; }
            h3 { font-size: 18px; color: #495057; margin-bottom: 10px; }
            .activity { margin-bottom: 10px; padding-left: 15px; border-left: 3px solid #007AFF; }
            h4 { font-size: 16px; margin-bottom: 5px; }
            p { margin: 0 0 5px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>${currentTrip.name}</h1>
            <div class="section">
              <h2>Trip Details</h2>
              <div class="details-grid">
                <div class="detail-item"><span class="detail-label">Location:</span> ${currentTrip.location}</div>
                <div class="detail-item"><span class="detail-label">Dates:</span> 
                  ${currentTrip.startDate && isValid(parseISO(currentTrip.startDate)) ? format(parseISO(currentTrip.startDate), 'MMM d, yyyy') : 'N/A'} - 
                  ${currentTrip.endDate && isValid(parseISO(currentTrip.endDate)) ? format(parseISO(currentTrip.endDate), 'MMM d, yyyy') : 'N/A'}
                </div>
              </div>
            </div>
            <div class="section">
              <h2>Participants</h2>
              <p>${participants.map(p => p.name || p.email).join(', ') || 'None'}</p>
            </div>
            ${budgetSection}
            ${scheduledActivitiesSection}
            ${activityIdeasSection}
          </div>
        </body>
      </html>
    `;
    
    if (Platform.OS === 'web') {
      const html2pdf = require('html2pdf.js');
      const element = document.createElement('div');
      element.innerHTML = htmlContent;

      const opt = {
        margin: 0.5,
        filename: `${currentTrip.name.replace(/\s/g, '_')}_Itinerary.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
      };

      html2pdf().from(element).set(opt).save();
    } else {
      try {
        const options = {
          html: htmlContent,
          fileName: `${currentTrip.name.replace(/\s/g, '_')}_Itinerary`,
          directory: 'Documents',
        };
        const file = await RNHTMLtoPDF.convert(options);
        
        const shareOptions = {
          title: 'Share Trip Itinerary',
          message: `Here is the itinerary for ${currentTrip.name}.`,
          url: `file://${file.filePath}`,
          type: 'application/pdf',
        };

        await Share.open(shareOptions);
      } catch (error) {
        console.error('Failed to export PDF:', error);
        Alert.alert('Error', 'Could not export the trip itinerary as a PDF.');
      }
    }
  };

  const isOwner = currentTrip?.ownerId === user?.uid;
  const isKid = user?.isKid;
  const isAdmin = user?.role === 'admin' && !isKid;
  const canPerformAdminActions = (isOwner && !isKid) || isAdmin;

  if (isLoading || !currentTrip) {
    return <View style={styles.loadingContainer}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  return (
    <ScrollView 
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />
      }
    >
      {currentTrip?.coverImageResizedUrl ? (
        <StorageImage path={currentTrip.coverImageResizedUrl} style={styles.coverImage} resizeMode="contain" />
      ) : currentTrip?.coverImageThumbnailUrl ? (
        <StorageImage path={currentTrip.coverImageThumbnailUrl} style={styles.coverImage} resizeMode="contain" />
      ) : currentTrip?.coverImageUrl ? (
        <StorageImage path={currentTrip.coverImageUrl} style={styles.coverImage} resizeMode="contain" />
      ) : (
        <View style={styles.coverImagePlaceholder}>
          <Ionicons name="image-outline" size={80} color={colors.textSecondary} />
        </View>
      )}

      <View style={styles.contentContainer}>
        <View style={styles.headerSection}>
          <Text style={styles.tripName}>{currentTrip?.name}</Text>
          <View style={styles.tripMeta}>
            <Ionicons name="location-outline" size={16} color={colors.textSecondary} />
            <Text style={styles.metaText}>{currentTrip?.location}</Text>
          </View>
          <View style={styles.tripMeta}>
            <Ionicons name="calendar-outline" size={16} color={colors.textSecondary} />
            <Text style={styles.metaText}>
              {currentTrip?.startDate && isValid(parseISO(currentTrip.startDate)) ? format(parseISO(currentTrip.startDate), 'MMM d, yyyy') : 'N/A'} - 
              {currentTrip?.endDate && isValid(parseISO(currentTrip.endDate)) ? format(parseISO(currentTrip.endDate), 'MMM d, yyyy') : 'N/A'}
            </Text>
          </View>
        </View>

        {currentTrip.tripType === 'cruise' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Cruise Itinerary</Text>
            {currentTrip.itinerary && currentTrip.itinerary.length > 0 ? (
              <View style={styles.itineraryList}>
                {currentTrip.itinerary.map((stop, index) => (
                  <View key={stop.id} style={styles.itineraryStop}>
                    <View style={styles.itineraryDayBadge}>
                      <Text style={styles.itineraryDayText}>Day {index + 1}</Text>
                    </View>
                    <View style={styles.itineraryStopBody}>
                      <Text style={styles.itineraryStopTitle}>{stop.portName}</Text>
                      <Text style={styles.itineraryStopMeta}>
                        {[
                          stop.date,
                          stop.type === 'sea' ? 'Sea day' : stop.type,
                          [stop.arrivalTime, stop.departureTime].filter(Boolean).join(' - '),
                        ].filter(Boolean).join(' • ')}
                      </Text>
                      {!!stop.notes && <Text style={styles.itineraryStopNotes}>{stop.notes}</Text>}
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.emptyMessage}>No cruise stops added yet. Add them from Manage Trips.</Text>
            )}
          </View>
        )}

        {currentTrip?.vacationCode && !isKid && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Trip Code</Text>
            <View style={styles.vacationCodeContainer}>
              <Text style={styles.vacationCode}>{currentTrip.vacationCode}</Text>
              <TouchableOpacity onPress={copyToClipboard} style={styles.copyButton}>
                <Ionicons name={copied ? "checkmark-circle" : "copy-outline"} size={24} color="white" />
                <Text style={styles.copyButtonText}>{copied ? 'Copied!' : 'Copy'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={styles.adminButtons}>
          {!isKid && (
            <>
              <TouchableOpacity
                style={[styles.adminButton, { backgroundColor: colors.accent }]}
                onPress={() => navigation.navigate('CreateActivity', { tripId: currentTrip.id })}>
                <Ionicons name="add-circle-outline" size={20} color="white" />
                <Text style={styles.adminButtonText}>Add Activity</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.adminButton, { backgroundColor: colors.primary, marginLeft: 10 }]}
                onPress={() => navigation.navigate('ActivitySuggestion', { tripId: currentTrip.id })}
              >
                <Ionicons name="bulb-outline" size={20} color="white" />
                <Text style={styles.adminButtonText}>Get Suggestions</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        <View style={styles.funZone}>
            <TouchableOpacity style={[styles.funButton, {backgroundColor: '#3498db'}]} onPress={handleAiFunRequest}><Ionicons name="happy-outline" size={24} color="white" /><Text style={styles.funButtonText}>Tell Me Something Fun</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.funButton, {backgroundColor: colors.accent}]} onPress={handleAiImBored}><Ionicons name="bulb-outline" size={24} color="white" /><Text style={styles.funButtonText}>I'm Bored</Text></TouchableOpacity>
        </View>
        
        {isAiLoading && <View style={[styles.aiResponseContainer, styles.aiLoadingContainer]}><ActivityIndicator color={colors.primary} /><Text style={{fontSize: 16, color: '#333', marginLeft: 10}}>Thinking...</Text></View>}

        {aiResponse && (
          <View style={[styles.aiResponseContainer, aiResponse.type === 'error' ? styles.aiError : (aiResponse.type === 'fun' ? styles.aiFun : styles.aiBored)]}>
            <Text style={styles.aiResponseText}>{aiResponse.text}</Text>
            <TouchableOpacity onPress={() => setAiResponse(null)} style={styles.aiCloseButton}><Ionicons name="close-circle" size={24} color="#666" /></TouchableOpacity>
          </View>
        )}

        <View style={styles.actionsContainer}>
          <TouchableOpacity style={[styles.button, styles.leaderboardButton]} onPress={() => navigation.navigate('Leaderboard', { tripId: currentTrip.id })}>
            <Ionicons name="trophy-outline" size={20} color="#fff" style={styles.buttonIcon} />
            <Text style={styles.buttonText}>Leaderboard</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.button, styles.exportButton]} onPress={handleExportPDF}>
              <Ionicons name="download-outline" size={20} color="#fff" style={styles.buttonIcon} />
              <Text style={styles.buttonText}>Export PDF</Text>
          </TouchableOpacity>
        </View>
        
        {currentTrip.status === 'completed' && <TouchableOpacity style={[styles.button, styles.reportButton]} onPress={() => navigation.navigate('Report', { tripId: currentTrip.id })}><Text style={styles.buttonText}>View Report</Text></TouchableOpacity>}
      </View>

      <View style={styles.scavengerHuntContainer}>
        <View style={styles.scavengerHuntToggleContainer}>
          <Text style={styles.sectionTitle}>Scavenger Hunt</Text>
          <Switch
            trackColor={{ false: "#ccc", true: colors.primaryLight }}
            thumbColor={showScavengerHunt ? colors.primary : "#f4f3f4"}
            ios_backgroundColor="#3e3e3e"
            onValueChange={() => setShowScavengerHunt(prev => !prev)}
            value={showScavengerHunt}
          />
        </View>

        {showScavengerHunt && <KidsScavengerHunt tripId={tripId} />}

        <Text style={styles.activitiesSectionTitle}>Scheduled Activities</Text>
        
        <View style={styles.viewToggle}>
          <TouchableOpacity 
            style={[styles.toggleButton, activityView === 'upcoming' && styles.toggleButtonActive]} 
            onPress={() => setActivityView('upcoming')}>
            <Text style={[styles.toggleButtonText, activityView === 'upcoming' && styles.toggleButtonTextActive]}>Upcoming</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.toggleButton, activityView === 'past' && styles.toggleButtonActive]} 
            onPress={() => setActivityView('past')}>
            <Text style={[styles.toggleButtonText, activityView === 'past' && styles.toggleButtonTextActive]}>Past</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.toggleButton, activityView === 'all' && styles.toggleButtonActive]} 
            onPress={() => setActivityView('all')}>
            <Text style={[styles.toggleButtonText, activityView === 'all' && styles.toggleButtonTextActive]}>All</Text>
          </TouchableOpacity>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScrollView}>
          {activityCategories.map(category => {
            const isSelected = category === 'All' 
              ? selectedCategories.length === 0 
              : selectedCategories.includes(category);
            return (
              <TouchableOpacity
                key={category}
                style={[
                  styles.categoryButton,
                  isSelected && styles.categoryButtonActive,
                ]}
                onPress={() => handleToggleCategory(category)}
              >
                <Text style={[
                  styles.categoryButtonText,
                  isSelected && styles.categoryButtonTextActive
                ]}>
                  {category}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScrollView}>
          {activityPriceRanges.map(price => {
            const isSelected = price === 'All'
              ? selectedPriceRanges.length === 0
              : selectedPriceRanges.includes(price);
            return (
              <TouchableOpacity
                key={price}
                style={[
                  styles.categoryButton,
                  isSelected && styles.categoryButtonActive,
                ]}
                onPress={() => handleTogglePrice(price)}
              >
                <Text style={[
                  styles.categoryButtonText,
                  isSelected && styles.categoryButtonTextActive
                ]}>
                  {price}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {isLoadingActivities ? <ActivityIndicator size="large" color={colors.primary} /> : Object.keys(filteredGroupedActivities).length === 0 ? <Text style={styles.emptyMessage}>No activities scheduled for this view.</Text> :
          Object.keys(filteredGroupedActivities).map(date => (
            <View key={date}>
              <View style={styles.daySeparator}><Text style={styles.daySeparatorText}>{format(parseISO(date), 'EEEE, MMM d, yyyy')}</Text></View>
              {filteredGroupedActivities[date].map(item => (
                <ActivityCard
                  key={item.id}
                  item={item}
                  isIdeaSection={false}
                  user={user}
                  onVote={handleVote}
                  onRating={(activityId, rating, feedback) => handleRating(activityId, rating as number, feedback)}
                  onImageUpload={handleImageUpload}
                  uploadingChallenge={uploadingChallenge}
                  canPerformAdminActions={false}
                  scavengerHuntVisible={showScavengerHunt}
                />
              ))}
            </View>
          ))
        }
      </View>

      <View style={styles.activitiesSection}>
        <Text style={styles.activitiesSectionTitle}>Decision Board</Text>
        <Text style={styles.sectionDescription}>Vote on ideas, then schedule the winners into the trip plan.</Text>
        {filteredActivityIdeas.length === 0 ? <Text style={styles.emptyMessage}>No matching ideas found.</Text> :
          filteredActivityIdeas.map(item => (
            <ActivityCard
              key={item.id}
              item={item}
              isIdeaSection={true}
              user={user}
              onVote={handleVote}
              onRating={(activityId, rating, feedback) => handleRating(activityId, rating as number, feedback)}
              onImageUpload={handleImageUpload}
              uploadingChallenge={uploadingChallenge}
              canPerformAdminActions={canPerformAdminActions}
              canDelete={canPerformAdminActions}
              onSchedule={() => handleEditActivity(item)}
              onEdit={() => handleEditActivity(item)}
              onDelete={() => handleDeleteActivity(item)}
              scavengerHuntVisible={showScavengerHunt}
            />
          ))
        }
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  coverImage: {
    width: '100%',
    height: 250,
  },
  coverImagePlaceholder: {
    width: '100%',
    height: 250,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  contentContainer: {
    padding: 20,
  },
  headerSection: {
    marginBottom: 20,
  },
  tripName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 8,
  },
  tripMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  metaText: {
    fontSize: 16,
    color: colors.textSecondary,
    marginLeft: 8,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 10,
  },
  itineraryList: {
    gap: 10,
  },
  itineraryStop: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
  },
  itineraryDayBadge: {
    width: 58,
    borderRadius: 6,
    backgroundColor: colors.backgroundAlt,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  itineraryDayText: {
    color: colors.textSecondary,
    fontWeight: '700',
    fontSize: 12,
  },
  itineraryStopBody: {
    flex: 1,
  },
  itineraryStopTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  itineraryStopMeta: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  itineraryStopNotes: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 6,
    lineHeight: 18,
  },
  vacationCodeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.white,
    padding: 15,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  vacationCode: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
    letterSpacing: 2,
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
  },
  copyButtonText: {
    color: 'white',
    marginLeft: 5,
    fontWeight: 'bold',
  },
  participantsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  value: { fontSize: 16, color: colors.text },
  funZone: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 16, marginTop: 20, borderTopWidth: 1, borderTopColor: colors.border, gap: 10 },
  funButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 10 },
  funButtonText: { color: colors.textLight, marginLeft: 10, fontWeight: '600', fontSize: 14 },
  actionsContainer: { flexDirection: 'row', justifyContent: 'space-around', flexWrap: 'wrap', marginTop: 10, paddingTop: 20, borderTopWidth: 1, borderTopColor: colors.border, gap: 8 },
  button: { flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 15, borderRadius: 8, alignItems: 'center', justifyContent: 'center', flex: 1, minWidth: '45%' },
  buttonIcon: {
    marginRight: 8,
  },
  reportButton: { backgroundColor: '#5856D6', marginTop: 10 },
  leaderboardButton: { backgroundColor: '#AF52DE' },
  exportButton: { backgroundColor: '#8E44AD' },
  buttonText: { color: colors.textLight, fontWeight: '600', fontSize: 16 },
  activitiesSection: { 
    marginTop: 16, 
    marginHorizontal: 16, 
    marginBottom: 20, 
    backgroundColor: colors.white, 
    borderRadius: 12, 
    padding: 16, 
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 2 }, 
    shadowOpacity: 0.1, 
    shadowRadius: 4, 
    elevation: 3 
  },
  scavengerHuntContainer: {
    marginTop: 16,
    marginHorizontal: 16,
    marginBottom: 20,
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3
  },
  scavengerHuntHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  activitiesSectionTitle: { 
    fontSize: 22, 
    fontWeight: 'bold', 
    color: colors.text, 
    marginBottom: 12, 
    paddingBottom: 8, 
    borderBottomWidth: 1, 
    borderBottomColor: colors.border 
  },
  sectionDescription: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 16,
    paddingHorizontal: 10,
    lineHeight: 22,
  },
  emptyMessage: { fontSize: 16, color: colors.textSecondary, textAlign: 'center', paddingVertical: 20 },
  aiResponseContainer: { 
    padding: 15, 
    borderRadius: 8, 
    marginTop: 15, 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between' 
  },
  aiLoadingContainer: { 
    backgroundColor: '#f0f0f0' 
  },
  aiResponseText: { 
    flex: 1, 
    fontSize: 16, 
    color: colors.text 
  },
  aiCloseButton: { 
    marginLeft: 10, 
    padding: 5 
  },
  aiFun: { 
    backgroundColor: '#eaf5ff', 
    borderColor: '#3498db', 
    borderLeftWidth: 4 
  },
  aiBored: { 
    backgroundColor: colors.background, 
    borderColor: colors.accent, 
    borderLeftWidth: 4 
  },
  aiError: { 
    backgroundColor: '#feeeee', 
    borderColor: colors.error, 
    borderLeftWidth: 4 
  },
  pastActivity: {
    backgroundColor: colors.background,
    borderColor: colors.border,
  },
  viewToggle: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 16,
    backgroundColor: '#e9ecef',
    borderRadius: 8,
    padding: 4,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  toggleButtonActive: {
    backgroundColor: colors.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  toggleButtonText: {
    fontWeight: '600',
    color: colors.textSecondary,
  },
  toggleButtonTextActive: {
    color: colors.primary,
  },
  categoryScrollView: {
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  categoryButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#f0f2f5',
    marginHorizontal: 4,
  },
  categoryButtonActive: {
    backgroundColor: colors.primary,
  },
  categoryButtonText: {
    color: colors.textSecondary,
    fontWeight: '600',
  },
  categoryButtonTextActive: {
    color: colors.white,
  },
  daySeparator: { 
    paddingVertical: 12, 
    backgroundColor: colors.background, 
    marginTop: 16, 
    marginHorizontal: -16, 
    borderBottomWidth: 1, 
    borderTopWidth: 1, 
    borderColor: colors.border 
  },
  daySeparatorText: { 
    fontSize: 16, 
    fontWeight: 'bold', 
    color: colors.textSecondary, 
    textAlign: 'center' 
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  label: { 
    fontSize: 16, 
    fontWeight: '600', 
    color: colors.textSecondary, 
    marginBottom: 4 
  },
  adminButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 20,
  },
  adminButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    padding: 10,
    borderRadius: 8,
  },
  adminButtonText: {
    color: 'white',
    marginLeft: 8,
    fontWeight: 'bold',
  },
  scavengerHuntToggleContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 16,
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
});
