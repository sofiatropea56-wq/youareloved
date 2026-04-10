# You Are Loved

This app now supports two storage modes:

- `cloudinary`: durable hosted storage for production and Vercel-style deployments
- `local`: local disk storage in `uploads/` and `photos.json` for quick development

If Cloudinary credentials are present, the app will automatically use Cloudinary unless you explicitly set `PHOTO_STORAGE_PROVIDER=local`.

## Cloudinary setup

1. Create a free Cloudinary account.
2. Copy `.env.example` to `.env`.
3. Fill in `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET`.
4. Start the app with `npm start`.

The gallery will upload images to Cloudinary, list them through the Cloudinary Admin Search API, and delete them by immutable `asset_id`.

## Local development fallback

Set `PHOTO_STORAGE_PROVIDER=local` if you want uploads to stay on your machine instead of using Cloudinary.

## Vercel deployment notes

For Vercel or any host with an ephemeral filesystem, set the Cloudinary environment variables in the hosting dashboard. Do not rely on `uploads/` or `photos.json` in production.
