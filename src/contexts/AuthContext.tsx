import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Platform } from 'react-native';
import { 
  signOut as firebaseSignOut, 
  onAuthStateChanged as onWebAuthStateChanged, // For Web
  signInWithCustomToken,
  User as FirebaseUser,
  Auth,
  AuthError,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
} from 'firebase/auth';
import rnAuth, { FirebaseAuthTypes } from '@react-native-firebase/auth'; // For Native
import { auth } from '../config/firebaseConfig';
import { userService, UserProfile } from '../services/userService';
import { authService } from '../services/authService';
import { setUserContext, addBreadcrumb } from '../monitoring';

// Unify user type, now including our custom profile for kids
export type AppUser = (FirebaseAuthTypes.User | FirebaseUser) & UserProfile;

interface AuthContextType {
  authInitializing: boolean;
  isLoading: boolean;
  user: AppUser | null;
  error: AuthError | null;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (email: string, password: string, name: string, familyId?: string, role?: 'admin' | 'member' | 'kid') => Promise<void>;
  signOut: () => Promise<void>;
  loginKid: (token: string) => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  authInitializing: true,
  isLoading: false,
  user: null,
  error: null,
  signInWithEmail: async () => {},
  registerWithEmail: async () => {},
  signOut: async () => {},
  loginKid: async () => {},
  forgotPassword: async () => {},
  refreshUser: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [authInitializing, setAuthInitializing] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<AuthError | null>(null);

  useEffect(() => {
    const handleAuthChange = async (authUser: FirebaseAuthTypes.User | FirebaseUser | null) => {
      if (authUser) {
        try {
          await authService.getIdToken(authUser as FirebaseUser);
          const profile = await userService.getUserProfile(authUser.uid);

          if (profile) {
            const userWithProfile = { ...authUser, ...profile };
            setUser(userWithProfile as AppUser);
            setUserContext({ id: authUser.uid, email: authUser.email, username: profile?.name ?? null, family_id: (profile as any)?.family_id || (profile as any)?.familyId || null });
          } else {
            console.error(`User ${authUser.uid} is missing their profile. Logging out.`);
            firebaseSignOut(auth as Auth);
          }
        } catch (error) {
          console.error("Critical error fetching user profile:", error);
          firebaseSignOut(auth as Auth);
          alert("A critical error occurred while loading your profile. Please try signing in again.");
        } finally {
          setAuthInitializing(false);
        }
      } else {
        setUser(null);
        setUserContext(null);
        await authService.clearStoredApiToken();
        setAuthInitializing(false);
      }
    };

    const unsubscribe = Platform.OS === 'web'
      ? onWebAuthStateChanged(auth as Auth, handleAuthChange as any)
      : rnAuth().onAuthStateChanged(handleAuthChange as any);

    return () => {
      unsubscribe();
    };
  }, []);
  
  const signInWithEmail = async (email: string, password: string) => {
    setIsLoading(true);
    setError(null);
    try {
      if (Platform.OS === 'web') {
        await signInWithEmailAndPassword(auth as Auth, email, password);
      } else {
        await rnAuth().signInWithEmailAndPassword(email, password);
      }
      // onAuthStateChanged will handle setting the user
    } catch (error) {
      setError(error as AuthError);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const registerWithEmail = async (email: string, password: string, name: string, familyId?: string, role?: 'admin' | 'member' | 'kid') => {
    setIsLoading(true);
    setError(null);
    try {
      let userCredential;
      if (Platform.OS === 'web') {
        userCredential = await createUserWithEmailAndPassword(auth as Auth, email, password);
      } else {
        userCredential = await rnAuth().createUserWithEmailAndPassword(email, password);
      }
      
      const { user: authUser } = userCredential;
      if (!authUser.uid) throw new Error("User UID is not available for registration.");
      
      const profileDetails = {
        name: name,
        email: authUser.email || undefined,
        role: role,
      };

      const profile = await userService.createUserProfile(authUser.uid, profileDetails, familyId);
      const userWithProfile = { ...authUser, ...profile };
      setUser(userWithProfile as AppUser);

    } catch (error: any) {
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };
  
  const signOut = async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (Platform.OS === 'web') {
        await firebaseSignOut(auth as any);
      } else {
        await rnAuth().signOut();
      }
      await authService.clearStoredApiToken();
      addBreadcrumb({ category: 'auth', message: 'User signed out', level: 'info' });
    } catch (error) {
      setError(error as AuthError);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const loginKid = async (token: string) => {
    setIsLoading(true);
    setError(null);
    try {
      let userCredential;
      if (Platform.OS === 'web') {
        userCredential = await signInWithCustomToken(auth as any, token);
      } else {
        userCredential = await rnAuth().signInWithCustomToken(token);
      }
      await authService.getIdToken(userCredential.user as FirebaseUser);
    } catch (e) {
      setError(e as AuthError);
      console.error("Failed to login kid with custom token", e);
      throw new Error("Could not log in kid.");
    } finally {
      setIsLoading(false);
    }
  };

  const forgotPassword = async (email: string) => {
    setIsLoading(true);
    setError(null);
    try {
      if (Platform.OS === 'web') {
        await sendPasswordResetEmail(auth as Auth, email);
      } else {
        await rnAuth().sendPasswordResetEmail(email);
      }
    } catch (error) {
      setError(error as AuthError);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const refreshUser = useCallback(async () => {
    if (!user?.uid) return;
    try {
      const profile = await userService.getUserProfile(user.uid);
      if (profile) {
        setUser(prevUser => ({ ...prevUser!, ...profile }));
      }
    } catch (error) {
      console.error("Failed to refresh user:", error);
      // Optional: handle error, maybe sign out if profile is gone
    }
  }, [user?.uid]);

  return (
    <AuthContext.Provider
      value={{
        user,
        authInitializing,
        isLoading,
        error,
        signInWithEmail,
        registerWithEmail,
        signOut,
        loginKid,
        forgotPassword,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}; 