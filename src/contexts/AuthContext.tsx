import {
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { supabase } from '../lib/supabase';
import type { User } from '@supabase/supabase-js';
import { AuthContext } from './auth-context';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [signupDate, setSignupDate] = useState<Date | null>(null);

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        if (!isMounted) return;
        setUser(session?.user ?? null);
        if (!session?.user) setSignupDate(null);
      })
      .catch(() => {
        if (!isMounted) return;
        setUser(null);
        setSignupDate(null);
      })
      .finally(() => {
        if (!isMounted) return;
        setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (!session?.user) setSignupDate(null);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Fetch signup date when user changes
  useEffect(() => {
    if (!user) return;

    let isMounted = true;

    const loadSignupDate = async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('created_at')
          .eq('id', user.id)
          .single();

        if (!isMounted) return;
        if (data && !error) {
          setSignupDate(new Date(data.created_at));
          return;
        }
        setSignupDate(null);
      } catch {
        if (!isMounted) return;
        setSignupDate(null);
      }
    };

    void loadSignupDate();

    return () => {
      isMounted = false;
    };
  }, [user]);

  const signUp = async (email: string, password: string, displayName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName },
      },
    });
    if (error) throw error;
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  return (
    <AuthContext.Provider value={{ user, loading, signupDate, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}