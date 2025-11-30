'use client';

import React from 'react';
import clsx from 'clsx';

export function Button({ children, variant = 'default', className, ...props }) {
  const styles =
    variant === 'outline'
      ? 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-100'
      : 'bg-blue-600 text-white hover:bg-blue-700';
  return (
    <button
      type="button"
      className={clsx(
        'rounded-lg px-4 py-2 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-blue-500',
        styles,
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
