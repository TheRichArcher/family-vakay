import React, { useState, useEffect } from 'react';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ActivityForm } from '../components/ActivityForm';
import { activitiesService, ActivityData, PartialActivityData } from '../services/activitiesService';
import { TripsStackParamList } from '../navigation/AppNavigator';
import { Alert, View } from 'react-native';
import { storageService } from '../services/storageService';
import { useAuth } from '../contexts/AuthContext';

type CreateActivityRouteProp = RouteProp<TripsStackParamList, 'CreateActivity'>;
type CreateActivityNavigationProp = NativeStackNavigationProp<TripsStackParamList, 'CreateActivity'>;

export default function CreateActivityScreen() {
  const navigation = useNavigation<CreateActivityNavigationProp>();
  const route = useRoute<CreateActivityRouteProp>();
  const { user } = useAuth();
  const { tripId } = route.params || {}; // Make tripId optional
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    // No permission check needed here if we allow creation of ideas
    // Admins are likely the ones creating ideas without a tripId
  }, [user, navigation]);

  const handleSubmit = async (activityFormData: PartialActivityData, imageUris?: string[], coverImageUri?: string) => {
    if (!user) {
      Alert.alert('Error', 'You must be logged in to create an activity.');
      return;
    }
    
    setIsSaving(true);

    try {
      const uploadedImageUrls = await Promise.all(
        (imageUris || []).map((uri: string) => {
          const path = tripId ? `activities/${tripId}/${Date.now()}` : `ideas/${Date.now()}`;
          return storageService.uploadImageAndGetDownloadURL(uri, path);
        })
      );

      let uploadedCoverUrl: string | undefined | null = activityFormData.coverImageUrl;
      if (coverImageUri) {
        const imagePath = tripId ? `activity_covers/${tripId}_${Date.now()}` : `idea_covers/${Date.now()}`;
        uploadedCoverUrl = await storageService.uploadImageAndGetDownloadURL(coverImageUri, imagePath);
      }

      const finalActivityData: ActivityData = {
        ...activityFormData,
        name: activityFormData.name || "Unnamed Activity",
        tripId: tripId || null, // Handle null tripId
        isIdea: tripId ? activityFormData.isIdea : true, // Force isIdea if no tripId
        imageUrls: [...(activityFormData.imageUrls || []), ...uploadedImageUrls],
        coverImageUrl: uploadedCoverUrl,
        activityTypes: activityFormData.activityTypes || [],
      };
      
      await activitiesService.createActivity(finalActivityData);
      navigation.goBack();
    } catch (error) {
      console.error('Failed to create activity:', error);
      Alert.alert('Error', 'Failed to create activity. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
        <ActivityForm 
            onSubmit={handleSubmit} 
            onCancel={() => navigation.goBack()}
            isLoading={isSaving}
            initialValues={{ isIdea: !tripId }} // Default to idea if no tripId
        />
    </View>
  );
} 