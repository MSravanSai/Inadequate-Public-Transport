import React, { createContext, useState, useContext, useEffect } from 'react';
import { app as firebaseApp } from '@/services/firebase';

let app = null;
let auth = null;
let googleProvider = null;

const initializeFirebase = async () => {
  if (auth) return;

  try {
    const { getAuth: getAuthFn, GoogleAuthProvider: GoogleProvider } = await import('firebase/auth');
    app = firebaseApp;
    auth = getAuthFn(app);
    googleProvider = new GoogleProvider();
  } catch (error) {
    console.warn('Firebase initialization failed:', error);
  }
};

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [appPublicSettings, setAppPublicSettings] = useState({ id: 'demo-app' });

  // Load user from localStorage on mount
  useEffect(() => {
    const savedUser = localStorage.getItem('smartbus_user');
    const savedAuth = localStorage.getItem('smartbus_authenticated');

    if (savedUser && savedAuth === 'true') {
      try {
        setUser(JSON.parse(savedUser));
        setIsAuthenticated(true);
      } catch (error) {
        console.error('Error loading saved user:', error);
        localStorage.removeItem('smartbus_user');
        localStorage.removeItem('smartbus_authenticated');
      }
    }

    setIsLoadingAuth(false);
    setIsLoadingPublicSettings(false);
  }, []);

  // Save user to localStorage when user changes
  useEffect(() => {
    if (user) {
      localStorage.setItem('smartbus_user', JSON.stringify(user));
      localStorage.setItem('smartbus_authenticated', 'true');
    } else {
      localStorage.removeItem('smartbus_user');
      localStorage.removeItem('smartbus_authenticated');
    }
  }, [user]);

  const login = async (email, password) => {
    // Check local storage for registered users
    const users = JSON.parse(localStorage.getItem('smartbus_users') || '[]');
    const foundUser = users.find(u => u.email === email && u.password === password);

    if (foundUser) {
      const { password: _, ...userWithoutPassword } = foundUser;
      setUser(userWithoutPassword);
      setIsAuthenticated(true);
      setAuthError(null);
      return userWithoutPassword;
    }

    // Demo credentials
    if (email === 'admin@smartbus.com' && password === 'admin123') {
      const demoUser = {
        id: 'demo-user',
        name: 'Demo Admin',
        email: 'admin@smartbus.com',
        role: 'admin',
        avatar: null
      };
      setUser(demoUser);
      setIsAuthenticated(true);
      setAuthError(null);
      return demoUser;
    }

    throw new Error('Invalid email or password');
  };

  const register = async (name, email, password) => {
    const users = JSON.parse(localStorage.getItem('smartbus_users') || '[]');

    // Check if user already exists
    if (users.find(u => u.email === email)) {
      throw new Error('User already exists with this email');
    }

    const newUser = {
      id: Date.now().toString(),
      name,
      email,
      password, // In a real app, this would be hashed
      role: 'user',
      createdAt: new Date().toISOString()
    };

    users.push(newUser);
    localStorage.setItem('smartbus_users', JSON.stringify(users));

    const { password: _, ...userWithoutPassword } = newUser;
    setUser(userWithoutPassword);
    setIsAuthenticated(true);
    setAuthError(null);
    return userWithoutPassword;
  };

  const loginWithGoogle = async () => {
    await initializeFirebase();

    if (!auth) {
      throw new Error('Google authentication is not ready. Check that Firebase Auth is enabled and the Firebase config matches this project.');
    }

    try {
      const { signInWithPopup: signIn } = await import('firebase/auth');
      const result = await signIn(auth, googleProvider);
      const googleUser = {
        id: result.user.uid,
        name: result.user.displayName,
        email: result.user.email,
        avatar: result.user.photoURL,
        role: 'user',
        provider: 'google'
      };

      setUser(googleUser);
      setIsAuthenticated(true);
      setAuthError(null);
      return googleUser;
    } catch (error) {
      throw new Error('Google sign-in failed: ' + error.message);
    }
  };

  const logout = async () => {
    if (auth) {
      try {
        const { signOut: signOutFn } = await import('firebase/auth');
        await signOutFn(auth);
      } catch (error) {
        console.warn('Firebase sign out error:', error);
      }
    }

    setUser(null);
    setIsAuthenticated(false);
    setAuthError(null);
  };

  const navigateToLogin = () => {
    // This would typically use react-router to navigate
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated,
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      appPublicSettings,
      login,
      register,
      loginWithGoogle,
      logout,
      navigateToLogin
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
