'use client';

import { motion, AnimatePresence } from 'framer-motion';

export default function LoadingOverlay({ show, message = 'Loading...' }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="overlay"
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/50 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          role="alert"
          aria-live="assertive"
        >
          {/* 🔵 Spinner */}
          <motion.div
            className="w-14 h-14 border-4 border-t-transparent border-white dark:border-gray-300 dark:border-t-sky-400 rounded-full animate-spin mb-6"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.4 }}
          />

          {/* 💬 Message text */}
          <motion.p
            className="text-white dark:text-gray-100 text-lg font-medium text-center px-6"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
          >
            {message}
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
