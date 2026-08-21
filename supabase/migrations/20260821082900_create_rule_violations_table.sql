-- Create rule_violations table for logging AI sales agent rule violations

CREATE TABLE IF NOT EXISTS public.rule_violations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
    rules_triggered TEXT[] NOT NULL DEFAULT '{}',
    original_text TEXT NOT NULL,
    modified_text TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS policies
ALTER TABLE public.rule_violations ENABLE ROW LEVEL SECURITY;

-- Allow read access for authenticated users (admin dashboard)
CREATE POLICY "Allow authenticated read on rule_violations"
    ON public.rule_violations FOR SELECT
    TO authenticated
    USING (true);

-- Allow service role to insert
CREATE POLICY "Allow service role insert on rule_violations"
    ON public.rule_violations FOR INSERT
    TO service_role
    WITH CHECK (true);
