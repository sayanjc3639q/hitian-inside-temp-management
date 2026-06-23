-- 1. Create Members Table
CREATE TABLE IF NOT EXISTS public.members (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    year TEXT NOT NULL,
    domain TEXT NOT NULL,
    completed INTEGER DEFAULT 0 NOT NULL,
    user_id UUID UNIQUE DEFAULT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Create Events Table
CREATE TABLE IF NOT EXISTS public.events (
    id TEXT PRIMARY KEY, -- e.g., 'E-1082'
    name TEXT NOT NULL,
    date DATE,
    photographer JSONB DEFAULT NULL,
    graphic JSONB DEFAULT NULL,
    writer JSONB DEFAULT NULL,
    videographer JSONB DEFAULT NULL,
    editor JSONB DEFAULT NULL,
    pr JSONB DEFAULT NULL,
    dev JSONB DEFAULT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Configure Policies (Disable Row Level Security for simple anonymous prototyping)
ALTER TABLE public.members DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.events DISABLE ROW LEVEL SECURITY;
