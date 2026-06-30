import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Platform, Clipboard } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { userService, UserProfile } from '../services/userService';
import { ConfirmModal } from '../components/ConfirmModal';
import QRCode from 'react-native-qrcode-svg';
import { AccessibleModal } from '../components/AccessibleModal';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { env } from '../config/env';
import ScreenHeader from '../components/ScreenHeader';
import { typography } from '../theme/typography';

export default function FamilyScreen() {
  const { user } = useAuth();
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(null);
  const [familyMembers, setFamilyMembers] = useState<UserProfile[]>([]);
  const [familyShareCode, setFamilyShareCode] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [memberToDelete, setMemberToDelete] = useState<UserProfile | null>(null);
  const [memberToEdit, setMemberToEdit] = useState<UserProfile | null>(null);
  const [editedName, setEditedName] = useState('');
  const [pinToUpdate, setPinToUpdate] = useState<{ member: UserProfile, pin: string } | null>(null);
  const [notification, setNotification] = useState<{ message: string, type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    fetchFamilyData();
  }, [user]);

  const showNotification = (message: string, type: 'success' | 'error') => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification(null);
    }, 3000);
  };

  const fetchFamilyData = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      let profile = await userService.getUserProfile(user.uid);

      if (profile && !profile.familyId) {
        const newFamilyId = user.uid;
        await userService.updateUserProfile(user.uid, { familyId: newFamilyId });
        profile = { ...profile, familyId: newFamilyId };
      }

      setCurrentUserProfile(profile);

      if (profile?.familyId) {
        const members = await userService.getFamilyMembers(profile.familyId);
        setFamilyMembers(members);
        if (profile.role !== 'kid') {
            const shareCodeData = await userService.getShareCode();
            if (shareCodeData) {
              setFamilyShareCode(shareCodeData.code);
            }
        }
      } else {
        setFamilyMembers([]);
      }
    } catch (error) {
      console.error('Error fetching family data:', error);
      showNotification("Could not load family data.", 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditMember = (member: UserProfile) => {
    setMemberToEdit(member);
    setEditedName(member.name || '');
  };

  const handleSaveName = async () => {
    if (!memberToEdit || !editedName.trim()) {
      showNotification("Name cannot be empty.", 'error');
      return;
    }

    try {
      await userService.updateUserProfile(memberToEdit.uid, { name: editedName.trim() });
      setFamilyMembers(prev => prev.map(m =>
        m.uid === memberToEdit.uid ? { ...m, name: editedName.trim() } : m
      ));
      setMemberToEdit(null);
      setEditedName('');
      showNotification(`Name has been updated to ${editedName.trim()}.`, 'success');
    } catch (error) {
      console.error("Error updating name:", error);
      showNotification("Could not update the name.", 'error');
    }
  };

  const handleUpdatePin = async () => {
    if (!pinToUpdate || !/^\d{4}$/.test(pinToUpdate.pin)) {
      showNotification("PIN must be 4 digits.", 'error');
      return;
    }

    try {
      await userService.setKidPin(pinToUpdate.member.uid, pinToUpdate.pin);
      showNotification(`PIN for ${pinToUpdate.member.name} has been updated.`, 'success');
      setPinToUpdate(null);
    } catch (error) {
      console.error("Error updating PIN:", error);
      showNotification("Could not update the PIN.", 'error');
    }
  };

  const executeDelete = async () => {
    if (!memberToDelete) return;
    try {
      await userService.deleteUserProfile(memberToDelete.uid);
      setFamilyMembers(prev => prev.filter(member => member.uid !== memberToDelete.uid));
      showNotification(`${memberToDelete.name} has been deleted.`, 'success');
    } catch (error) {
      showNotification("Could not delete user.", 'error');
      console.error("Delete user error:", error);
    } finally {
      setMemberToDelete(null);
    }
  };

  const handleDeleteMember = (member: UserProfile) => {
    setMemberToDelete(member);
  };

  const handleCancelDelete = () => {
    setMemberToDelete(null);
  };

  if (isLoading) {
    return <View style={styles.container}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="My Family" background="band" />

      {notification && (
        <View style={[styles.notification, { backgroundColor: notification.type === 'success' ? colors.success : colors.error }]}>
          <Text style={styles.notificationText}>{notification.message}</Text>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.contentContainer}>
        <Text style={styles.subtitle}>My Profile</Text>
        {currentUserProfile && (
          <View style={styles.memberCard}>
              <View style={styles.memberInfo}>
                  <Text style={styles.memberName}>{currentUserProfile.name}</Text>
                  <Text style={styles.memberRole}>{currentUserProfile.role}</Text>
              </View>
          </View>
        )}

        {currentUserProfile?.role !== 'kid' && familyShareCode && (
          <View style={styles.familyCodeContainer}>
            <Text style={styles.familyCodeLabel}>Your Family Share Code:</Text>
            <View style={styles.codeBox}>
              <Text style={styles.familyCodeText}>{familyShareCode}</Text>
              <TouchableOpacity onPress={() => {
                Clipboard.setString(familyShareCode);
                showNotification("Family Code copied to clipboard.", 'success');
              }}>
                <Text style={styles.copyButton}>Copy</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.qrCodeRow}>
              <View style={styles.qrCodeContainer}>
                <Text style={styles.modalTitle}>Invite a Family Member</Text>
                <QRCode
                  value={`${env.QR_BASE_URL}/register?familyCode=${familyShareCode}`}
                  size={150}
                  backgroundColor="white"
                  color="black"
                />
              </View>
              <View style={styles.qrCodeContainer}>
                <Text style={styles.modalTitle}>Kid Login QR Code</Text>
                <QRCode
                  value={`${env.QR_BASE_URL}/join?familyCode=${familyShareCode}`}
                  size={150}
                  backgroundColor="white"
                  color="black"
                />
              </View>
            </View>
          </View>
        )}

        <View style={styles.infoBox}>
          <Text style={styles.infoBoxText}>
            <Text style={{fontWeight: 'bold'}}>How to Add an Adult:</Text> To add another parent or adult to your family, have them download the app and create their own account. During registration, they can join your family using the share code.
          </Text>
        </View>

        <Text style={styles.subtitle}>Family Members</Text>
        {familyMembers.map(item => (
          <View key={item.uid} style={styles.memberCard}>
            <View style={styles.memberInfo}>
              <Text style={styles.memberName}>{item.name} {item.role === 'kid' && item.age ? `(Age: ${item.age})` : ''}</Text>
              <Text style={styles.memberRole}>{item.role}</Text>
            </View>
            {currentUserProfile?.role !== 'kid' && item.uid !== user?.uid && (
              <View style={styles.memberActions}>
                <TouchableOpacity style={styles.editButton} onPress={() => handleEditMember(item)}>
                  <Text style={styles.actionButtonText}>Edit</Text>
                </TouchableOpacity>
                {item.role === 'kid' && (
                  <TouchableOpacity style={styles.editButton} onPress={() => setPinToUpdate({ member: item, pin: '' })}>
                    <Text style={styles.actionButtonText}>Set PIN</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.deleteButton} onPress={() => handleDeleteMember(item)}>
                  <Text style={styles.actionButtonText}>Delete</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        ))}
        {familyMembers.length === 0 && !isLoading && (
          <Text style={styles.noMembersText}>Your family members will appear here once they join.</Text>
        )}
      </ScrollView>

      <ConfirmModal
        visible={!!memberToDelete}
        title={`Delete ${memberToDelete?.name}?`}
        message="Are you sure you want to delete this family member? This action cannot be undone."
        onConfirm={executeDelete}
        onCancel={handleCancelDelete}
      />

      {pinToUpdate && (
        <AccessibleModal
          visible={true}
          onClose={() => setPinToUpdate(null)}
        >
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>Update PIN for {pinToUpdate.member.name}</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Enter new 4-digit PIN"
              value={pinToUpdate.pin}
              onChangeText={(text) => setPinToUpdate({ ...pinToUpdate, pin: text })}
              keyboardType="number-pad"
              maxLength={4}
              secureTextEntry
            />
            <View style={styles.pinModalButtonContainer}>
              <TouchableOpacity style={[styles.button, styles.modalButton]} onPress={handleUpdatePin}>
                <Text style={styles.buttonText}>Update PIN</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.button, styles.modalButton, styles.pinModalCancelButton]} onPress={() => setPinToUpdate(null)}>
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </AccessibleModal>
      )}

      <AccessibleModal
        visible={!!memberToEdit}
        onClose={() => setMemberToEdit(null)}
      >
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Edit Name</Text>
          <TextInput
            style={styles.input}
            value={editedName}
            onChangeText={setEditedName}
            placeholder="Enter new name"
            autoCapitalize="words"
          />
          <View style={styles.modalButtonContainer}>
            <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={() => setMemberToEdit(null)}>
              <Text style={styles.buttonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.button, styles.saveButton]} onPress={handleSaveName}>
              <Text style={[styles.buttonText, {color: colors.white}]}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </AccessibleModal>
    </View>
  );
}

const styles = StyleSheet.create({
    container: {
      flex: 1,
      padding: spacing.m,
      backgroundColor: colors.background
    },
    contentContainer: {
      paddingBottom: spacing.l,
    },
    subtitle: {
      ...typography.h3,
      color: colors.text,
      marginBottom: 15,
      marginTop: 10,
      paddingHorizontal: 20,
    },
    addKidForm: {
      paddingHorizontal: 20,
    },
    input: {
      backgroundColor: colors.white,
      fontSize: 16,
      color: colors.text,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      padding: spacing.m,
      marginBottom: 10,
    },
    button: {
      backgroundColor: colors.primary,
      paddingVertical: 12,
      paddingHorizontal: 30,
      borderRadius: 25,
      alignItems: 'center',
      marginTop: 10,
      shadowColor: '#000',
      shadowOffset: {
        width: 0,
        height: 2,
      },
      shadowOpacity: 0.23,
      shadowRadius: 2.62,
      elevation: 4,
    },
    buttonText: {
      color: colors.white,
      fontSize: 16,
      fontWeight: 'bold',
    },
    memberCard: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: spacing.m,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      marginBottom: spacing.s,
      backgroundColor: colors.white,
    },
    memberInfo: {},
    memberName: {
      ...typography.body,
      color: colors.text,
      fontWeight: 'bold',
    },
    memberRole: {
      fontSize: 12,
      color: colors.textSecondary,
      textTransform: 'capitalize'
    },
    memberActions: {
      flexDirection: 'row',
      gap: spacing.s
    },
    editButton: {
      backgroundColor: colors.primary,
      paddingHorizontal: spacing.m,
      paddingVertical: spacing.s,
      borderRadius: 8,
    },
    actionButtonText: {
      color: colors.white,
      fontWeight: 'bold',
    },
    deleteButton: {
      backgroundColor: colors.error,
      paddingHorizontal: spacing.m,
      paddingVertical: spacing.s,
      borderRadius: 8,
    },
    familyCodeContainer: {
      marginVertical: spacing.l,
      padding: spacing.m,
      backgroundColor: colors.white,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
    },
    familyCodeLabel: {
      fontSize: 20,
      fontWeight: 'bold',
      color: colors.text,
      marginBottom: spacing.m,
    },
    codeBox: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: colors.background,
      padding: spacing.m,
      borderRadius: 8,
    },
    familyCodeText: {
      fontSize: 14,
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    copyButton: {
      color: colors.primary,
      fontWeight: 'bold',
    },
    qrButton: {
      marginTop: spacing.m,
      backgroundColor: colors.background,
      padding: spacing.m,
      borderRadius: 8,
      alignItems: 'center',
    },
    qrButtonText: {
      color: colors.primary,
      fontWeight: 'bold',
    },
    qrCodeRow: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      marginTop: spacing.m,
    },
    qrCodeContainer: {
      alignItems: 'center',
    },
    modalContent: {
      width: '90%',
      maxWidth: 400,
      backgroundColor: 'white',
      borderRadius: 10,
      padding: spacing.l,
      alignItems: 'center',
    },
    modalTitle: {
      fontSize: 20,
      fontWeight: 'bold',
      color: colors.text,
      marginBottom: spacing.m,
    },
    modalButtonContainer: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      width: '100%',
      marginTop: spacing.m,
      gap: spacing.s,
    },
    cancelButton: {
      backgroundColor: colors.disabled,
    },
    saveButton: {
      backgroundColor: colors.success,
    },
    noMembersText: {
      fontSize: 16,
      color: colors.textSecondary,
      textAlign: 'center',
      marginTop: spacing.l,
      fontStyle: 'italic',
    },
    infoBox: {
      backgroundColor: '#E7F3FF',
      borderRadius: 8,
      padding: spacing.m,
      marginVertical: spacing.l,
      borderWidth: 1,
      borderColor: '#C2DFFF'
    },
    infoBoxText: {
      color: '#004085',
      fontSize: 14,
      lineHeight: 20,
    },
    logoutButton: {
      backgroundColor: colors.error,
      paddingVertical: spacing.s,
      paddingHorizontal: spacing.m,
      borderRadius: 8,
      alignItems: 'center',
    },
    logoutButtonText: {
      color: colors.white,
      fontWeight: 'bold',
    },
    errorText: {
      fontSize: 12,
      color: colors.error,
      marginBottom: spacing.s,
    },
    notification: {
      padding: spacing.m,
      borderRadius: 8,
      marginBottom: spacing.m,
    },
    notificationText: {
      color: colors.white,
      textAlign: 'center',
      fontWeight: 'bold',
    },
    modalView: {
      margin: 20,
      backgroundColor: 'white',
      borderRadius: 20,
      padding: spacing.l,
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: {
        width: 0,
        height: 2,
      },
      shadowOpacity: 0.23,
      shadowRadius: 4,
      elevation: 5,
    },
    modalInput: {
      width: '80%',
      padding: 10,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 5,
      marginBottom: 20,
    },
    pinModalButtonContainer: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      width: '100%',
    },
    modalButton: {
      width: '40%',
    },
    pinModalCancelButton: {
      backgroundColor: colors.textSecondary,
    }
});
