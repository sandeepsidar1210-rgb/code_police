// API configuration
export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

// App configuration
export const APP_CONFIG = {
  name: 'GhostHunter',
  description: 'The modern platform for teams to collaborate, manage projects, and ship products faster than ever before.',
  url: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
};

// Route paths
export const ROUTES = {
  home: '/',
  signin: '/auth/signin',
  signup: '/auth/signup',
  signout: '/auth/signout',
  dashboard: '/dashboard',
  projects: '/dashboard/projects',
  tasks: '/dashboard/tasks',
  team: '/dashboard/team',
  reports: '/dashboard/reports',
  settings: '/dashboard/settings',
} as const;

// Authentication config
export const AUTH_CONFIG = {
  sessionDuration: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
  tokenKey: 'auth_token',
  refreshTokenKey: 'refresh_token',
};
