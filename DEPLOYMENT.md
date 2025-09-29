# Cloudflare Pages Deployment Guide

## Quick Deploy to Cloudflare Pages

1. **Connect Repository**
   - Go to [Cloudflare Pages Dashboard](https://dash.cloudflare.com/pages)
   - Click "Create a project"
   - Connect to Git and select your repository

2. **Configure Build Settings**
   - Framework preset: `Next.js (Static HTML Export)`
   - Build command: `npm run build`
   - Build output directory: `out`
   - Node.js version: `18` or later

3. **Deploy**
   - Click "Save and Deploy"
   - Your app will be available at `https://your-project.pages.dev`

## Environment Variables

No environment variables are required. The app uses the public VATSIM API directly.

## Custom Domain (Optional)

1. In Cloudflare Pages dashboard, go to your project
2. Navigate to "Custom domains"
3. Add your domain and follow DNS configuration instructions

## Build Commands Reference

- **Development**: `npm start`
- **Production Build**: `npm run build`
- **Serve Production Locally**: `npm run start:prod`

The app is configured with:
- Static HTML export for optimal Cloudflare Pages compatibility
- Automatic CORS handling
- Optimized caching for VATSIM API responses