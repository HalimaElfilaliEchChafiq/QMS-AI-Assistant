-- Migration: llm_config
-- Creates a configuration table to dynamically select the LLM provider.

CREATE TABLE IF NOT EXISTS public.llm_config (
    id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    deployment_mode text NOT NULL DEFAULT 'local' CHECK (deployment_mode IN ('local', 'cloud')),
    local_model text NOT NULL DEFAULT 'llama3:latest',
    local_url text NOT NULL DEFAULT 'http://127.0.0.1:11434',
    cloud_model text NOT NULL DEFAULT 'gpt-4o',
    cloud_key text,
    updated_at timestamptz DEFAULT now()
);

-- Insert the default configuration row
INSERT INTO public.llm_config (id, deployment_mode)
VALUES (1, 'local')
ON CONFLICT (id) DO NOTHING;

-- Enable Row Level Security
ALTER TABLE public.llm_config ENABLE ROW LEVEL SECURITY;

-- Policies
-- Anyone authenticated can read the config to instantiate the client
CREATE POLICY "Allow read access for authenticated users"
ON public.llm_config
FOR SELECT
TO authenticated
USING (true);

-- Only admins can update the config
CREATE POLICY "Allow update for admins only"
ON public.llm_config
FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.accounts
        WHERE accounts.id = auth.uid() AND accounts.role = 'admin'
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.accounts
        WHERE accounts.id = auth.uid() AND accounts.role = 'admin'
    )
);

