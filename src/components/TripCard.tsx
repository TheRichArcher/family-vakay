import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Platform } from 'react-native';
import { colors } from '../theme/colors';
import { Trip } from '../services/trips';
import { format } from 'date-fns';
import { StorageImage } from './StorageImage';

interface TripCardProps {
  trip: Trip;
  onPress?: (trip: Trip) => void;
  onEdit?: (trip: Trip) => void;
  onDelete?: (id: string) => void;
  onManageActivities?: (tripId: string) => void;
  onManageScavengerHunt?: (tripId: string) => void;
}

export function TripCard({ trip, onPress, onEdit, onDelete, onManageActivities, onManageScavengerHunt }: TripCardProps) {
  const handleDelete = () => {
    Alert.alert(
      'Delete Trip',
      'Are you sure you want to delete this trip?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => onDelete && onDelete(trip.id) }
      ]
    );
  };

  const getStatusColor = (status: Trip['status']) => {
    switch (status) {
      case 'upcoming':
        return colors.primary;
      case 'in-progress':
        return colors.success;
      case 'completed':
        return colors.muted;
      default:
        return colors.primary;
    }
  };

  return (
    <TouchableOpacity style={styles.container} onPress={() => onPress && onPress(trip)} activeOpacity={0.7}>
      {trip.coverImageResizedUrl ? (
        <StorageImage path={trip.coverImageResizedUrl} style={styles.coverImage} resizeMode="contain" />
      ) : trip.coverImageThumbnailUrl ? (
        <StorageImage path={trip.coverImageThumbnailUrl} style={styles.coverImage} resizeMode="contain" />
      ) : trip.coverImageUrl ? (
        <StorageImage path={trip.coverImageUrl} style={styles.coverImage} resizeMode="contain" />
      ) : null}
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>{trip.name}</Text>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(trip.status) }]}>
            <Text style={styles.statusText}>{trip.status}</Text>
          </View>
        </View>

        <Text style={styles.description}>{trip.description}</Text>

        <View style={styles.details}>
          <View style={styles.detailRow}>
            <Text style={styles.label}>Location:</Text>
            <Text style={styles.value}>{trip.location}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.label}>Dates:</Text>
            <Text style={styles.value}>
              {format(new Date(`${trip.startDate}T00:00:00`), 'MMM d, yyyy')} - {format(new Date(`${trip.endDate}T00:00:00`), 'MMM d, yyyy')}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.label}>Participants:</Text>
            <Text style={styles.value}>{trip.participants.length}</Text>
          </View>
        </View>

        <View style={styles.actions}>
          {onManageActivities && (
            <TouchableOpacity style={[styles.button, styles.manageButton]} onPress={(e) => { e.stopPropagation(); onManageActivities(trip.id); }}>
              <Text style={styles.buttonText}>Activities</Text>
            </TouchableOpacity>
          )}
          {onManageScavengerHunt && (
            <TouchableOpacity style={[styles.button, styles.scavengerHuntButton]} onPress={(e) => { e.stopPropagation(); onManageScavengerHunt(trip.id); }}>
              <Text style={styles.buttonText}>Scavenger Hunt</Text>
            </TouchableOpacity>
          )}
          {onEdit && (
            <TouchableOpacity style={[styles.button, styles.editButton]} onPress={(e) => { e.stopPropagation(); onEdit(trip); }}>
              <Text style={styles.buttonText}>Edit</Text>
            </TouchableOpacity>
          )}
          {onDelete && (
            <TouchableOpacity style={[styles.button, styles.deleteButton]} onPress={(e) => { e.stopPropagation(); handleDelete(); }}>
              <Text style={styles.buttonText}>Delete</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    marginBottom: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 3,
      },
      web: {
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.06)',
      },
    }),
  },
  coverImage: {
    height: 150,
    width: '100%',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  content: {
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 8,
  },
  statusText: {
    color: colors.textLight,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  description: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 16,
  },
  details: {
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  label: {
    fontSize: 14,
    color: colors.textSecondary,
    width: 100,
  },
  value: {
    fontSize: 14,
    color: colors.text,
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  button: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 80,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  editButton: {
    backgroundColor: colors.primary,
  },
  deleteButton: {
    backgroundColor: colors.error,
  },
  manageButton: {
    backgroundColor: colors.secondary,
  },
  scavengerHuntButton: {
    backgroundColor: colors.accent,
  },
  buttonText: {
    color: colors.textLight,
    fontSize: 14,
    fontWeight: '600',
  },
}); 