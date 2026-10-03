import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { auth, firebaseConfigured } from '../firebase';
import { authApi } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [quota, setQuota] = useState(null);
  const [loading, setLoading] = useState(true);

  async function refreshProfile() {
    if (!auth?.currentUser) {
      setProfile(null);
      setQuota(null);
      return null;
    }
    try {
      const data = await authApi.me();
      setProfile(data.profile);
      setQuota(data.quota || null);
      return data.profile;
    } catch (err) {
      console.warn('Profile fetch failed', err.message);
      setProfile(null);
      return null;
    }
  }

  useEffect(() => {
    if (!firebaseConfigured || !auth) {
      setLoading(false);
      return undefined;
    }
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      setUser(fbUser);
      if (fbUser) {
        await refreshProfile();
      } else {
        setProfile(null);
        setQuota(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  async function register(email, password, displayName) {
    if (!auth) throw new Error('Firebase is not configured');
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    if (displayName) await updateProfile(cred.user, { displayName });
    setUser(cred.user);
    return cred.user;
  }

  async function login(email, password) {
    if (!auth) throw new Error('Firebase is not configured');
    const cred = await signInWithEmailAndPassword(auth, email, password);
    setUser(cred.user);
    await refreshProfile();
    return cred.user;
  }

  async function logout() {
    if (auth) await signOut(auth);
    setUser(null);
    setProfile(null);
    setQuota(null);
  }

  async function completeProfile(payload) {
    const data = await authApi.upsertProfile(payload);
    setProfile(data.profile);
    await refreshProfile();
    return data.profile;
  }

  const value = useMemo(
    () => ({
      user,
      profile,
      quota,
      loading,
      firebaseConfigured,
      register,
      login,
      logout,
      completeProfile,
      refreshProfile,
      role: profile?.role || null,
    }),
    [user, profile, quota, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
