# AI Knowledge Vault

A production-ready Next.js 14 application for intelligent knowledge management using AI-powered summarization and vector search.

## Features

- **Authentication**: Magic link email authentication via Supabase
- **Knowledge Management**: Store prompts and links with automatic categorization
- **AI-Powered Summaries**: Traditional Chinese summaries using Google Gemini
- **Vector Search**: Semantic search using embeddings for content discovery
- **Similar Items**: Find related content using cosine similarity
- **Image Upload**: Support for images with Supabase Storage
- **Responsive Design**: Apple-inspired clean UI with Tailwind CSS
 
## Tech Stack

- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS
- **Backend**: Supabase (Auth, Database, Storage)
- **AI**: Google Gemini (Summarization & Embeddings)
- **Database**: PostgreSQL with pgvector extension
- **Deployment**: Vercel-ready

## Setup Instructions

### 1. Create Supabase Project

1. Go to [https://supabase.com](https://supabase.com) and create a new project
2. Wait for the project to be fully initialized

### 2. Set up Database Schema

1. Go to your Supabase Dashboard
2. Navigate to the SQL Editor
3. Run the migration file `supabase/migrations/0001_init.sql`:
   - Copy the entire contents of the file
   - Paste it in the SQL Editor
   - Click "Run"
4. Run the search functions migration `supabase/migrations/0002_search_functions.sql`:
   - Copy the entire contents of the file
   - Paste it in the SQL Editor  
   - Click "Run"

### 3. Configure Storage

1. In your Supabase Dashboard, go to Storage
2. Create a new bucket called `images`
3. Make it public by:
   - Going to the bucket settings
   - Enabling "Public bucket" option

### 4. Get API Keys

1. In your Supabase Dashboard, go to Settings > API
2. Copy the following:
   - Project URL
   - `anon` `public` key
   - `service_role` `secret` key

### 5. Get Gemini API Key

1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Create a new API key
3. Copy the API key

### 6. Environment Variables

1. Copy `.env.example` to `.env.local`
2. Fill in your values:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
GEMINI_API_KEY=your_gemini_api_key
```

### 7. Install Dependencies and Run

```bash
npm install
npm run dev
```

The application will be available at `http://localhost:3000`.

## Usage

1. **Sign Up/Login**: Use magic link authentication with your email
2. **Add Items**: Click "新增項目" to add prompts or links
3. **Search**: Use the search bar for semantic search across your knowledge base
4. **Browse**: Filter by categories and browse your items
5. **View Details**: Click on any item to see full details and similar items
6. **Manage**: Edit, delete, or copy content from the item detail page

## Deployment

This application is optimized for Vercel deployment:

1. Push your code to GitHub
2. Connect your repository to Vercel
3. Add your environment variables in Vercel dashboard
4. Deploy

## Key Features Explained

### AI Summarization
- Automatic Traditional Chinese summaries using Gemini 1.5 Flash
- Summaries are generated in the background after item creation

### Vector Search  
- Text embeddings using Gemini text-embedding-004 model
- 768-dimensional vectors stored in PostgreSQL with pgvector
- Cosine similarity search for finding relevant content

### Similar Items
- Automatically find related items using vector similarity
- Excludes current item and shows top 5 most similar results

### Storage
- Images uploaded to Supabase Storage
- 5MB file size limit with JPG/PNG support
- Automatic public URL generation

## Architecture

- **App Router**: Modern Next.js 14 routing
- **Server Actions**: For background processing
- **RLS**: Row Level Security for data protection  
- **Edge Functions**: Serverless API routes
- **Vector Database**: PostgreSQL with pgvector for similarity search

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details.
