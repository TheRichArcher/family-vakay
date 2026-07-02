import apiClient from '../utils/apiClient';

export interface UserProfile {
  uid: string;
  email?: string;
  name: string;
  role: 'admin' | 'member' | 'kid';
  familyId?: string;
  family_id?: string;
  isKid: boolean;
  avatarUrl?: string;
  age?: number;
  shareCode?: string;
  points?: number;
}

export interface PublicUserProfile {
  uid: string;
  name: string | null;
  role: 'admin' | 'kid' | 'member';
}

export interface AdminStats {
  active_trips: number;
  family_members: number;
  pending_requests: number;
}

export interface FamilyInvite {
  id: string;
  code: string;
  familyId: string;
  role: 'member' | 'kid';
  status: 'pending' | 'accepted' | 'revoked';
  recipientName?: string | null;
  recipientEmail?: string | null;
  createdBy: string;
  acceptedBy?: string | null;
  revokedBy?: string | null;
  createdAt?: string | null;
  acceptedAt?: string | null;
  revokedAt?: string | null;
}

export interface FamilyInviteResolve {
  code: string;
  familyId: string;
  role: 'member' | 'kid';
  status: 'pending' | 'accepted' | 'revoked';
  recipientName?: string | null;
  recipientEmail?: string | null;
}

const normalizeUserProfile = (profile: UserProfile): UserProfile => ({
  ...profile,
  familyId: profile.familyId || profile.family_id,
});

const normalizeFamilyInvite = (invite: FamilyInvite): FamilyInvite => ({
  ...invite,
  familyId: invite.familyId || (invite as any).family_id,
  recipientName: invite.recipientName || (invite as any).recipient_name,
  recipientEmail: invite.recipientEmail || (invite as any).recipient_email,
  createdBy: invite.createdBy || (invite as any).created_by,
  acceptedBy: invite.acceptedBy || (invite as any).accepted_by,
  revokedBy: invite.revokedBy || (invite as any).revoked_by,
  createdAt: invite.createdAt || (invite as any).created_at,
  acceptedAt: invite.acceptedAt || (invite as any).accepted_at,
  revokedAt: invite.revokedAt || (invite as any).revoked_at,
});

export const userService = {
  async getUserProfile(uid: string): Promise<UserProfile | null> {
    try {
      const response = await apiClient.get(`/api/v1/users/${uid}`);
      return normalizeUserProfile(response.data);
    } catch (error) {
      console.error('Failed to fetch user profile:', error);
      // It might be a 404, which is a valid case (profile not created yet)
      return null;
    }
  },

  async createUserProfile(
    uid: string,
    profileDetails: { name?: string, email?: string, role?: 'admin' | 'member' | 'kid' },
    familyId?: string,
    inviteCode?: string
  ): Promise<UserProfile> {
    const profileData = {
      name: profileDetails.name,
      email: profileDetails.email,
      role: profileDetails.role || 'member',
      isKid: false,
      familyId,
      inviteCode,
    };
    const response = await apiClient.put(`/api/v1/users/${uid}`, profileData);
    return normalizeUserProfile(response.data);
  },

  async createKidProfile(name: string, pin: string, age: number | null): Promise<UserProfile> {
    const response = await apiClient.post('/api/v1/users/kid', { name, pin, age });
    return normalizeUserProfile(response.data);
  },

  async updateUserProfile(uid:string, profileData: Partial<UserProfile>): Promise<void> {
    await apiClient.put(`/api/v1/users/${uid}`, profileData);
  },

  async deleteUserProfile(userId: string): Promise<void> {
    await apiClient.delete(`/api/v1/users/${userId}`);
  },

  async getFamilyMembers(familyId: string): Promise<UserProfile[]> {
    const response = await apiClient.get(`/api/v1/family/${familyId}/members`);
    return response.data.map(normalizeUserProfile);
  },

  async getUsersByIds(userIds: string[]): Promise<UserProfile[]> {
    if (!userIds || userIds.length === 0) {
      return [];
    }
    try {
      const response = await apiClient.post('/api/v1/users/batch', { user_ids: userIds });
      return response.data.map(normalizeUserProfile);
    } catch (error) {
      console.error('Failed to fetch users by IDs:', error);
      return []; // Return empty array on error to prevent crashes
    }
  },

  async getPublicFamilyMembers(familyId: string): Promise<PublicUserProfile[]> {
    try {
      const response = await apiClient.get(`/api/v1/family/${familyId}/public_members`);
      return response.data as PublicUserProfile[];
    } catch (error) {
      console.error(`Failed to fetch public family members for ${familyId}:`, error);
      throw error;
    }
  },

  async generateFamilyCode(): Promise<string> {
    // This should ideally be done on the backend to ensure uniqueness
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    return code;
  },

  async validateFamilyCode(code: string): Promise<{ valid: boolean; familyId?: string }> {
    try {
      await apiClient.post('/api/v1/family/validate', { familyId: code });
      return { valid: true, familyId: code };
    } catch (error) {
      console.error("Error validating family code:", error);
      return { valid: false };
    }
  },

  async setKidPin(kidId: string, pin: string): Promise<void> {
    await apiClient.post(`/api/v1/users/${kidId}/pin`, { pin });
  },

  async getUserByEmail(email: string): Promise<UserProfile | null> {
    try {
      const response = await apiClient.get(`/api/v1/users/by-email/${email}`);
      return response.data;
    } catch (error) {
      console.error('Failed to fetch user by email:', error);
      return null;
    }
  },

  async getShareCode(): Promise<{ code: string }> {
    const response = await apiClient.get('/api/v1/family/share-code');
    return response.data;
  },

  async getFamilyIdByShareCode(shareCode: string): Promise<{ familyId: string }> {
    const response = await apiClient.get(`/api/v1/family/by-code/${shareCode}`);
    return response.data;
  },

  async createFamilyInvite(invite: { recipientName?: string; recipientEmail?: string; role?: 'member' }): Promise<FamilyInvite> {
    const response = await apiClient.post('/api/v1/family/invites', {
      recipientName: invite.recipientName || undefined,
      recipientEmail: invite.recipientEmail || undefined,
      role: invite.role || 'member',
    });
    return normalizeFamilyInvite(response.data);
  },

  async getFamilyInvites(): Promise<FamilyInvite[]> {
    const response = await apiClient.get('/api/v1/family/invites');
    return response.data.map(normalizeFamilyInvite);
  },

  async resolveFamilyInvite(inviteCode: string): Promise<FamilyInviteResolve> {
    const response = await apiClient.get(`/api/v1/family/invites/by-code/${inviteCode}`);
    return normalizeFamilyInvite(response.data as FamilyInvite) as FamilyInviteResolve;
  },

  async revokeFamilyInvite(inviteId: string): Promise<FamilyInvite> {
    const response = await apiClient.post(`/api/v1/family/invites/${inviteId}/revoke`);
    return normalizeFamilyInvite(response.data);
  },

  async getAdminStats(): Promise<AdminStats> {
    const response = await apiClient.get('/api/v1/users/stats');
    return response.data;
  },
};
