import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Clipboard } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { userService, UserProfile, FamilyInvite } from '../services/userService';
import { ConfirmModal } from '../components/ConfirmModal';
import { AccessibleModal } from '../components/AccessibleModal';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import { env } from '../config/env';

export default function AdminFamilyScreen() {
  const { user } = useAuth();
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(null);
  const [familyMembers, setFamilyMembers] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberPin, setNewMemberPin] = useState('');
  const [newMemberAge, setNewMemberAge] = useState('');
  const [invites, setInvites] = useState<FamilyInvite[]>([]);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [isCreatingInvite, setIsCreatingInvite] = useState(false);
  const [addMemberErrors, setAddMemberErrors] = useState<{ name?: string, pin?: string, age?: string }>({});
  const [isAddingMember, setIsAddingMember] = useState(false);
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
        const [members, familyInvites] = await Promise.all([
          userService.getFamilyMembers(profile.familyId),
          userService.getFamilyInvites(),
        ]);
        setFamilyMembers(members);
        setInvites(familyInvites);
      } else {
        setFamilyMembers([]);
        setInvites([]);
      }
    } catch (error) {
      console.error('Error fetching family data:', error);
      showNotification("Could not load family data.", 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const validateAddMember = () => {
    const errors: { name?: string, pin?: string, age?: string } = {};
    if (!newMemberName.trim()) {
      errors.name = "Please enter a name.";
    }
    if (!/^\d{4}$/.test(newMemberPin)) {
      errors.pin = "PIN must be exactly 4 digits.";
    }
    if (newMemberAge) {
        const age = parseInt(newMemberAge, 10);
        if (isNaN(age) || age <= 0) {
            errors.age = "Please enter a valid age.";
        }
    }
    setAddMemberErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleAddMember = async () => {
    if (!validateAddMember()) return;
    
    setIsAddingMember(true);
    try {
      const age = newMemberAge ? parseInt(newMemberAge, 10) : null;
      const newMember = await userService.createKidProfile(newMemberName, newMemberPin, age);
      setFamilyMembers(prevMembers => [...prevMembers, newMember]);
      setNewMemberName('');
      setNewMemberPin('');
      setNewMemberAge('');
      setAddMemberErrors({});
      showNotification(`${newMember.name} was added to your family!`, 'success');
    } catch (error) {
      showNotification("Could not add member profile.", 'error');
      console.error("Error adding member profile:", error);
    } finally {
      setIsAddingMember(false);
    }
  };

  const buildInviteLink = (code: string) => {
    const baseUrl = env.QR_BASE_URL || env.DEEPLINK_BASE_URL || '';
    return baseUrl ? `${baseUrl}/register?inviteCode=${code}` : code;
  };

  const copyInvite = (invite: FamilyInvite) => {
    Clipboard.setString(buildInviteLink(invite.code));
    showNotification("Invite copied.", 'success');
  };

  const handleCreateInvite = async () => {
    setIsCreatingInvite(true);
    try {
      const invite = await userService.createFamilyInvite({
        recipientName: inviteName.trim() || undefined,
        recipientEmail: inviteEmail.trim() || undefined,
        role: 'member',
      });
      setInvites(prev => [invite, ...prev]);
      setInviteName('');
      setInviteEmail('');
      Clipboard.setString(buildInviteLink(invite.code));
      showNotification("Invite created and copied.", 'success');
    } catch (error) {
      console.error("Error creating invite:", error);
      showNotification("Could not create invite.", 'error');
    } finally {
      setIsCreatingInvite(false);
    }
  };

  const handleRevokeInvite = async (invite: FamilyInvite) => {
    try {
      const updatedInvite = await userService.revokeFamilyInvite(invite.id);
      setInvites(prev => prev.map(item => item.id === invite.id ? updatedInvite : item));
      showNotification("Invite revoked.", 'success');
    } catch (error) {
      console.error("Error revoking invite:", error);
      showNotification("Could not revoke invite.", 'error');
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
      <Text style={styles.title}>Manage Family</Text>
      
      {notification && (
        <View style={[styles.notification, { backgroundColor: notification.type === 'success' ? colors.success : colors.error }]}>
          <Text style={styles.notificationText}>{notification.message}</Text>
        </View>
      )}
      
      <ScrollView contentContainerStyle={styles.contentContainer}>
        <View>
            <Text style={styles.subtitle}>Invite Adults</Text>
            <View style={styles.addKidForm}>
                <TextInput
                style={styles.input}
                placeholder="Name (optional)"
                value={inviteName}
                onChangeText={setInviteName}
                placeholderTextColor={colors.textSecondary}
                />
                <TextInput
                style={styles.input}
                placeholder="Email (optional)"
                value={inviteEmail}
                onChangeText={setInviteEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholderTextColor={colors.textSecondary}
                />
                <TouchableOpacity style={styles.button} onPress={handleCreateInvite} disabled={isCreatingInvite}>
                <Text style={styles.buttonText}>{isCreatingInvite ? 'Creating...' : 'Create Invite Link'}</Text>
                </TouchableOpacity>
            </View>
            <View style={styles.inviteList}>
              {invites.map(invite => (
                <View key={invite.id} style={styles.inviteCard}>
                  <View style={styles.memberInfo}>
                    <Text style={styles.memberName}>{invite.recipientName || invite.recipientEmail || 'Family invite'}</Text>
                    <Text style={styles.memberRole}>{invite.code} - {invite.status}</Text>
                  </View>
                  <View style={styles.memberActions}>
                    <TouchableOpacity style={styles.editButton} onPress={() => copyInvite(invite)}>
                      <Text style={styles.actionButtonText}>Copy</Text>
                    </TouchableOpacity>
                    {invite.status === 'pending' && (
                      <TouchableOpacity style={styles.deleteButton} onPress={() => handleRevokeInvite(invite)}>
                        <Text style={styles.actionButtonText}>Revoke</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              ))}
              {invites.length === 0 && (
                <Text style={styles.noMembersText}>Adult invite links will show here.</Text>
              )}
            </View>
        </View>

        <View>
            <Text style={styles.subtitle}>Add Kid Profile</Text>
            <View style={styles.addKidForm}>
                <TextInput
                style={styles.input}
                placeholder="Member's Name"
                value={newMemberName}
                onChangeText={setNewMemberName}
                placeholderTextColor={colors.textSecondary}
                />
                {addMemberErrors.name && <Text style={styles.errorText}>{addMemberErrors.name}</Text>}
                <TextInput
                style={styles.input}
                placeholder="Member's Age (Optional)"
                value={newMemberAge}
                onChangeText={setNewMemberAge}
                keyboardType="number-pad"
                maxLength={2}
                placeholderTextColor={colors.textSecondary}
                />
                {addMemberErrors.age && <Text style={styles.errorText}>{addMemberErrors.age}</Text>}
                <TextInput
                style={styles.input}
                placeholder="4-Digit PIN for limited access"
                value={newMemberPin}
                onChangeText={setNewMemberPin}
                keyboardType="number-pad"
                maxLength={4}
                secureTextEntry
                placeholderTextColor={colors.textSecondary}
                />
                {addMemberErrors.pin && <Text style={styles.errorText}>{addMemberErrors.pin}</Text>}
                <TouchableOpacity style={styles.button} onPress={handleAddMember} disabled={isAddingMember}>
                <Text style={styles.buttonText}>{isAddingMember ? 'Adding...' : 'Add Kid Profile'}</Text>
                </TouchableOpacity>
            </View>
        </View>
        <View>
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
        </View>
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
    title: { 
      fontSize: 32,
      fontWeight: 'bold',
      color: colors.text,
      marginBottom: spacing.m 
    },
    subtitle: { 
      fontSize: 20,
      fontWeight: '600',
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
    inviteList: {
      paddingHorizontal: 20,
      marginTop: spacing.s,
      marginBottom: spacing.m,
    },
    inviteCard: {
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
      fontSize: 16,
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
