import React, { useState } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Activity, PartialActivityData } from '../services/activitiesService';
import { activitiesService } from '../services/activitiesService';
import { storageService } from '../services/storageService';
import { ActivityForm } from '../components/ActivityForm';

type EditActivityScreenRouteProp = RouteProp<{ params: { activity: Activity } }, 'params'>;

export default function EditActivityScreen() {
    const navigation = useNavigation();
    const route = useRoute<EditActivityScreenRouteProp>();
    const { activity } = route.params;
    const [isSaving, setIsSaving] = useState(false);

    const handleSubmit = async (activityFormData: PartialActivityData, newImageUris: string[] = [], newCoverImageUri?: string) => {
        setIsSaving(true);

        try {
            const uploadedImageUrls = await Promise.all(
                newImageUris.map(uri => {
                    const imagePath = `activity_images/${activity.tripId}/${Date.now()}`;
                    return storageService.uploadImageAndGetDownloadURL(uri, imagePath);
                })
            );

            let coverImageUrlToSave = activityFormData.coverImageUrl;
            if (newCoverImageUri) {
                const imagePath = `activity_covers/${activity.tripId}_${Date.now()}`;
                coverImageUrlToSave = await storageService.uploadImageAndGetDownloadURL(newCoverImageUri, imagePath);
            } else if (activityFormData.coverImageUrl === null) {
                coverImageUrlToSave = null; // Explicitly set to null for removal
            }

            const updatedData = {
                ...activityFormData,
                imageUrls: [...(activity.imageUrls || []), ...uploadedImageUrls],
                coverImageUrl: coverImageUrlToSave,
                activityTypes: activityFormData.activityTypes || [],
            };

            await activitiesService.updateActivity(activity.id, updatedData);
            navigation.goBack();
        } catch (error) {
            console.error('Failed to update activity:', error);
            Alert.alert('Error', 'Failed to update activity. Please try again.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <View style={styles.container}>
            <ActivityForm
                initialValues={activity}
                onSubmit={handleSubmit}
                onCancel={() => navigation.goBack()}
                isLoading={isSaving}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
}); 