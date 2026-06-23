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

-- 3. Alter tables to add new tracking and delegation columns
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS can_edit BOOLEAN DEFAULT FALSE NOT NULL;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS completed BOOLEAN DEFAULT FALSE NOT NULL;

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- 5. Create helper function to check privilege based on user claims
CREATE OR REPLACE FUNCTION public.check_user_privilege(user_uuid UUID, check_write BOOLEAN DEFAULT TRUE)
RETURNS BOOLEAN AS $$
DECLARE
    member_record RECORD;
BEGIN
    -- A. Super Admin Check
    IF auth.jwt() ->> 'email' = 'jcsayan7@gmail.com' THEN
        RETURN TRUE;
    END IF;

    -- B. Find user's member card
    SELECT year, can_edit INTO member_record FROM public.members WHERE user_id = user_uuid;
    
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    -- C. Admins (3rd and 4th Years) have full write/read access
    IF member_record.year IN ('3rd Year', '4th Year') THEN
        RETURN TRUE;
    END IF;

    -- D. Operational Members (1st and 2nd Years) write check
    IF check_write THEN
        RETURN member_record.can_edit;
    ELSE
        RETURN TRUE;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Apply granular RLS Policies
-- Members Policies
CREATE POLICY members_select_policy ON public.members 
    FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY members_write_policy ON public.members 
    FOR ALL TO authenticated USING (public.check_user_privilege(auth.uid(), TRUE));

-- Events Policies
CREATE POLICY events_select_policy ON public.events 
    FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY events_write_policy ON public.events 
    FOR ALL TO authenticated USING (public.check_user_privilege(auth.uid(), TRUE));

