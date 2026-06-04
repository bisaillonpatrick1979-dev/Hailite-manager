<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/148abb89-fbf1-4a9d-9841-7febcada62c2

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set `AI_PROVIDER` plus the server-side provider key you want in [.env.local](.env.local): `GEMINI_API_KEY`, `OPENAI_API_KEY`, or `ANTHROPIC_API_KEY`. The admin can choose and test the active provider in Réglages > Compagnie.
3. For Vercel, add the same variables in Project Settings > Environment Variables for the correct environment (Production and/or Preview), without the `VITE_` prefix, then redeploy so the serverless `/api/chat` function can read them.
4. Run the app:
   `npm run dev`
