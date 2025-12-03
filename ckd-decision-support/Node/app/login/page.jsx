'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'react-hot-toast';
import LoadingOverlay from '@/components/ui/LoadingOverlay';
import { motion } from "framer-motion";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [errors, setErrors] = useState({ email: '', password: '' });

  // Check session once on load (prevents flicker + duplicate login toast)
  useEffect(() => {
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();

      if (data?.session) {
        router.replace('/patientform');
        return;
      }

      setCheckingSession(false);
    };

    checkSession();
  }, [router]);

  // Prevent UI flash while checking session
  if (checkingSession) return null;

  // Validation
  const validateForm = () => {
    const newErrors = { email: '', password: '' };
    let valid = true;

    if (!email.trim()) {
      newErrors.email = 'Email is required.';
      valid = false;
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = 'Enter a valid email address.';
      valid = false;
    }

    if (!password.trim()) {
      newErrors.password = 'Password is required.';
      valid = false;
    }

    setErrors(newErrors);
    return valid;
  };

  // Login handler
  async function handleLogin(e) {
    e.preventDefault();
    if (!validateForm()) return;

    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      toast.error('Login failed: ' + error.message, { id: 'login-error' });
      setLoading(false);
      return;
    }

    toast.success('Login successful!', { id: 'login-success' });

    // Allow toast to show briefly before redirecting
    setTimeout(() => router.replace('/patientform'), 900);
  }

  // Signup handler
  async function handleSignup() {
    if (!validateForm()) return;

    setLoading(true);

    const { data, error } = await supabase.auth.signUp({ email, password });

    if (error) {
      toast.error('Signup failed: ' + error.message, { id: 'signup-error' });
      setLoading(false);
      return;
    }

    if (!data.user.confirmed_at) {
      toast.success('Account created! Please verify your email.', {
        id: 'signup-success',
      });
    } else {
      toast.success('Account created successfully!', {
        id: 'signup-success',
      });
      setTimeout(() => router.replace('/patientform'), 900);
    }

    setLoading(false);
  }

  // Reset password
  async function handlePasswordReset() {
    if (!email.trim()) {
      toast.error('Enter your email to reset password.', { id: 'reset-error' });
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) {
      toast.error('Reset failed: ' + error.message, { id: 'reset-error' });
    } else {
      toast.success('Reset link sent.', { id: 'reset-success' });
    }

    setLoading(false);
  }

  return (
    <div
      className="relative flex flex-col items-center justify-center min-h-screen bg-center bg-cover bg-no-repeat pt-32"
      style={{
        backgroundImage:
          "linear-gradient(rgba(0,0,0,0.45), rgba(0,0,0,0.6)), url('/kidney-bg.jpg')",
        filter: "brightness(1.1) contrast(1.1)",
      }}
    >

      <LoadingOverlay show={loading} message="Authenticating..." />

      {/* Header */}
      <div className="absolute top-8 left-1/2 -translate-x-1/2 text-center">
        <motion.h1
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-3xl md:text-5xl font-extrabold tracking-wider text-sky-100 uppercase"
        >
          AI-POWERED CKD CDS SYSTEM
        </motion.h1>

        <motion.div
          className="mx-auto mt-2 h-[3px] w-32 md:w-48 bg-gradient-to-r from-sky-400 via-cyan-300 to-sky-400 rounded-full shadow-lg"
          animate={{ opacity: [0.8, 1, 0.8], scaleX: [1, 1.15, 1] }}
          transition={{ duration: 3, repeat: Infinity }}
        />
      </div>

      {/* Card */}
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        className="z-20 w-full max-w-md bg-white/40 dark:bg-gray-800/30 shadow-2xl rounded-xl p-8 backdrop-blur-2xl border border-white/30"
      >
        <h2 className="text-2xl font-bold text-center mb-6">Clinician Login</h2>

        <form onSubmit={handleLogin} className="space-y-4">
          {/* Email */}
          <div>
            <input
              type="email"
              placeholder="Email"
              className={`w-full px-4 py-2 border ${
                errors.email ? 'border-red-500' : 'border-gray-300'
              } rounded bg-white/80`}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {errors.email && (
              <p className="text-red-500 text-sm mt-1">{errors.email}</p>
            )}
          </div>

          {/* Password */}
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              className={`w-full px-4 py-2 border ${
                errors.password ? 'border-red-500' : 'border-gray-300'
              } rounded bg-white/80 pr-10`}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-3 text-gray-600"
            >
              {showPassword ? "🙈" : "👁️"}
            </button>

            {errors.password && (
              <p className="text-red-500 text-sm mt-1">{errors.password}</p>
            )}
          </div>

          {/* Forgot Password */}
          <button
            type="button"
            onClick={handlePasswordReset}
            className="text-blue-600 text-sm hover:underline block text-right"
          >
            Forgot password?
          </button>

          {/* Sign In */}
          <motion.button
            whileTap={{ scale: 0.97 }}
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
          >
            Sign In
          </motion.button>

          {/* Create Account */}
          <motion.button
            whileTap={{ scale: 0.97 }}
            type="button"
            disabled={loading}
            onClick={handleSignup}
            className="w-full bg-gray-200 py-2 rounded hover:bg-gray-300"
          >
            Create Account
          </motion.button>
        </form>
      </motion.div>

      {/* Footer */}
      <motion.footer
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="mt-10 text-gray-100 text-center"
      >
        Supported by AstraZeneca
      </motion.footer>
    </div>
  );
}