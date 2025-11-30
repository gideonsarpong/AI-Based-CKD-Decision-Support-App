'use client';

import React from 'react';

export function Input({ className = '', ...props }) {
  return (
    <input
      className={`w-full rounded-lg border border-gray-300 p-2 focus:border-blue-500 focus:ring-blue-500 ${className}`}
      {...props}
    />
  );
}
