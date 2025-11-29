// Simple utility to merge class names conditionally
export function cn(...classes) {
  return classes.filter(Boolean).join(' ');
}