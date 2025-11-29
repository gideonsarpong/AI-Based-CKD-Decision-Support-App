'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { Toaster, toast } from 'react-hot-toast';
import LoadingOverlay from '@/components/ui/LoadingOverlay';
import { motion } from "framer-motion";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({ email: '', password: '' });

  // Clear any leftover toasts (from logout)
  useEffect(() => {
    toast.dismiss();
  }, []);

  // Check session & redirect if already logged in
  useEffect(() => {
  const checkSession = async () => {
    const { data } = await supabase.auth.getSession();
    if (data?.session) {
      setSession(data.session);
      router.replace('/'); // silent redirect, no toast here
    }
  };
  checkSession();

  // ⚠️ Don't redirect here — just update session silently
  const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
    setSession(session);
  });

  return () => listener.subscription.unsubscribe();
}, [router]);


  // Validation helper
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
    } else if (password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters.';
      valid = false;
    }

    setErrors(newErrors);
    return valid;
  };

 async function handleLogin(e) {
  e.preventDefault();
  if (!validateForm()) return;

  setLoading(true);
  toast.dismiss(); // clear any previous toasts

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
  toast.error(`Login failed: ${error.message}`, { id: 'auth-toast' });
  setLoading(false);
} else {
  // Show toast once and let react-hot-toast auto-hide it
  toast.success('Login successful!', {
    id: 'auth-toast',
    duration: 1500, // auto dismiss after 1.5s
  });

  // Redirect after a short delay
  setTimeout(() => {
    router.replace('/');
  }, 1200);
}
 }

  // Handle signup
  async function handleSignup() {
    if (!validateForm()) return;

    setLoading(true);
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) toast.error('Signup failed: ' + error.message);
    else toast.success('Account created. Check your email to confirm.');
    setLoading(false);
  }

  // Handle password reset
  async function handlePasswordReset() {
    if (!email) {
      toast.error('Please enter your email to reset your password.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) toast.error('Password reset failed: ' + error.message);
    else toast.success('Password reset email sent. Check your inbox.');
    setLoading(false);
  }

  // Already signed in screen
  if (session) {
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <Toaster />
        <h2 className="text-xl font-semibold mb-4">Already signed in</h2>
        <button
          onClick={() => router.push('/')}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
        >
          Proceed to CKD Form
        </button>
      </div>
    );
  }

// Main login form UI
return (
  <div
  className="relative flex flex-col items-center justify-center min-h-screen bg-center bg-cover bg-no-repeat transition-colors duration-500 pt-32"
  style={{
    backgroundImage:
      "linear-gradient(rgba(0,0,0,0.45), rgba(0,0,0,0.6)), url('/kidney-bg.jpg')",
    filter: "brightness(1.1) contrast(1.1)",
  }}
>
  {/* ===== Header Title with Animated Underline ===== */}
  <div className="absolute top-8 left-1/2 -translate-x-1/2 text-center z-20">
    <motion.h1
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 1, ease: "easeOut" }}
      className="text-3xl md:text-5xl font-extrabold tracking-wider text-sky-100 drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)] uppercase"
    >
      AI-POWERED CKD CDS SYSTEM
    </motion.h1>

    {/* Glowing Underline */}
    <motion.div
      className="mx-auto mt-2 h-[3px] w-32 md:w-48 bg-gradient-to-r from-sky-400 via-cyan-300 to-sky-400 rounded-full shadow-[0_0_10px_rgba(56,189,248,0.7)]"
      animate={{
        opacity: [0.7, 1, 0.7],
        scaleX: [1, 1.15, 1],
      }}
      transition={{
        duration: 3,
        repeat: Infinity,
        ease: "easeInOut",
      }}
    />
  </div>

    {/* ===== Animated Kidney Glow ===== */}
    <div className="kidney-glow" aria-hidden="true" />

    {/* ===== Toast + Loading overlay ===== */}
    <Toaster />
    <LoadingOverlay show={loading} message="Authenticating..." />

    {/* ===== Frosted Glass Login Card ===== */}
    <motion.div
      initial={{ opacity: 0, y: 40, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="relative z-20 w-full max-w-md bg-white/40 dark:bg-gray-800/30 shadow-2xl rounded-xl p-8 backdrop-blur-2xl border border-white/30 dark:border-gray-700/50"
    >
      <h2 className="text-2xl font-bold text-center text-gray-900 dark:text-gray-100 mb-6">
        Clinician Login
      </h2>

      <form onSubmit={handleLogin} className="space-y-4">
        {/* Email */}
        <div>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={`w-full px-4 py-2 border ${
              errors.email ? "border-red-500" : "border-gray-300"
            } rounded focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600`}
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
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={`w-full px-4 py-2 border ${
              errors.password ? "border-red-500" : "border-gray-300"
            } rounded focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10 dark:bg-gray-700 dark:border-gray-600`}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-2 top-2 text-gray-500 hover:text-gray-700 dark:text-gray-300 focus:outline-none"
            aria-label="Toggle password visibility"
          >
            {showPassword ? "🙈" : "👁️"}
          </button>
          {errors.password && (
            <p className="text-red-500 text-sm mt-1">{errors.password}</p>
          )}
        </div>

        {/* Forgot password */}
        <div className="text-right text-sm">
          <button
            type="button"
            onClick={handlePasswordReset}
            className="text-blue-600 hover:underline focus:outline-none"
          >
            Forgot password?
          </button>
        </div>

        {/* Sign In Button */}
        <motion.button
          whileTap={{ scale: 0.97 }}
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition disabled:opacity-70 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <svg
                className="animate-spin h-5 w-5 mr-2 text-white"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                />
              </svg>
              Signing in...
            </>
          ) : (
            "Sign In"
          )}
        </motion.button>

        {/* Create Account */}
        <motion.button
          whileTap={{ scale: 0.97 }}
          type="button"
          onClick={handleSignup}
          disabled={loading}
          className="w-full bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100 py-2 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition disabled:opacity-50"
        >
          {loading ? "Creating account..." : "Create Account"}
        </motion.button>
      </form>
    </motion.div>

    {/* ===== Responsive Footer (Aligned) ===== */}
    <motion.footer
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 1, ease: "easeOut", delay: 0.8 }}
      className="w-full flex flex-col items-center justify-center gap-6 mt-10 md:mt-14 z-20 bg-transparent"
    >
      {/* Partner Logos *
      <div className="flex flex-col md:flex-row justify-center items-center gap-y-6 md:gap-x-12">
        <img
          src="/moh-logo.png"
          alt="Ministry of Health Ghana Logo"
          className="w-24 h-24 md:w-28 md:h-28 object-contain drop-shadow-2xl"
        />
        <img
          src="/ghs-logo.jpg"
          alt="Ghana Health Service Logo"
          className="w-24 h-24 md:w-28 md:h-28 object-contain drop-shadow-2xl"
        />
        <img
          src="/az-logo.png"
          alt="AstraZeneca Logo"
          className="w-28 h-10 md:w-36 md:h-12 object-contain drop-shadow-2xl"
        />
        <img
          src="/path-logo.png"
          alt="PATH Logo"
          className="w-32 h-12 md:w-40 md:h-14 object-contain drop-shadow-2xl"
        />*
      </div>*/}

      {/* Support Text */}
      <p className="text-base md:text-lg text-gray-100 dark:text-gray-300 opacity-90 font-semibold tracking-wide text-center max-w-xl leading-relaxed">
        Supported by AstraZeneca
      </p>
    </motion.footer>
  </div>
);
}
