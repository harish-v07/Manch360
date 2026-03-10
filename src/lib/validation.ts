import { z } from 'zod';

// Auth validation
export const signUpSchema = z.object({
  name: z.string()
    .trim()
    .min(1, 'Name is required')
    .max(100, 'Name must be less than 100 characters'),
  email: z.string()
    .trim()
    .email('Invalid email address')
    .max(255, 'Email must be less than 255 characters'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(100, 'Password must be less than 100 characters'),
  role: z.enum(['learner', 'creator'])
});

export const signInSchema = z.object({
  email: z.string()
    .trim()
    .email('Invalid email address')
    .max(255, 'Email must be less than 255 characters'),
  password: z.string()
    .min(1, 'Password is required')
    .max(100, 'Password must be less than 100 characters')
});

export const forgotPasswordSchema = z.object({
  email: z.string()
    .trim()
    .email('Invalid email address')
    .max(255, 'Email must be less than 255 characters')
});

export const resetPasswordSchema = z.object({
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(100, 'Password must be less than 100 characters'),
  confirmPassword: z.string()
    .min(1, 'Please confirm your password')
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"]
});

// Course validation
export const courseSchema = z.object({
  title: z.string()
    .trim()
    .min(1, 'Title is required')
    .max(200, 'Title must be less than 200 characters'),
  description: z.string()
    .trim()
    .max(5000, 'Description must be less than 5000 characters')
    .optional()
    .or(z.literal('')),
  price: z.number()
    .min(0, 'Price cannot be negative')
    .max(999999, 'Price must be less than 1,000,000'),
  category: z.string()
    .trim()
    .max(50, 'Category must be less than 50 characters')
    .optional()
    .or(z.literal('')),
  status: z.enum(['draft', 'published'])
});

// Product validation
export const productSchema = z.object({
  name: z.string()
    .trim()
    .min(1, 'Name is required')
    .max(200, 'Name must be less than 200 characters'),
  description: z.string()
    .trim()
    .max(5000, 'Description must be less than 5000 characters')
    .optional()
    .or(z.literal('')),
  price: z.number()
    .min(0, 'Price cannot be negative')
    .max(999999, 'Price must be less than 1,000,000'),
  type: z.enum(['digital', 'physical', 'service']),
  media_urls: z.array(z.string().url()).optional().default([]),
  file_url: z.string()
    .trim()
    .url('Invalid file URL format')
    .optional()
    .or(z.literal('')),
  usage_instructions: z.string()
    .trim()
    .max(5000, 'Instructions must be less than 5000 characters')
    .optional()
    .or(z.literal(''))
});

// Profile validation
export const profileSchema = z.object({
  bio: z.string()
    .trim()
    .max(2000, 'Bio must be less than 2000 characters')
    .optional()
    .or(z.literal('')),
  banner_url: z.string()
    .trim()
    .url('Invalid banner URL format')
    .max(2048, 'URL must be less than 2048 characters')
    .optional()
    .or(z.literal('')),
  avatar_url: z.string()
    .trim()
    .url('Invalid avatar URL format')
    .max(2048, 'URL must be less than 2048 characters')
    .optional()
    .or(z.literal('')),
  social_links: z.object({
    instagram: z.string()
      .trim()
      .url('Invalid Instagram URL')
      .max(2048, 'URL too long')
      .optional()
      .or(z.literal('')),
    twitter: z.string()
      .trim()
      .url('Invalid Twitter URL')
      .max(2048, 'URL too long')
      .optional()
      .or(z.literal('')),
    website: z.string()
      .trim()
      .url('Invalid website URL')
      .max(2048, 'URL too long')
      .optional()
      .or(z.literal(''))
  })
});
