// Import Supabase client factory (v2)
import { createClient } from 'npm:@supabase/supabase-js@2'

// Initialize Supabase client with service role (bypasses RLS):contentReference[oaicite:0]{index=0}
const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!  // safe in Edge Functions, bypasses RLS:contentReference[oaicite:1]{index=1}
);

// (Optional) CORS headers for browser requests:contentReference[oaicite:2]{index=2}
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Start the Edge Function server
Deno.serve(async (req) => {
    // Handle preflight OPTIONS request for CORS:contentReference[oaicite:3]{index=3}
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        // Compute timestamp for 10 minutes ago
        const now = new Date();
        const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000).toISOString();

        // Query for usernames created within the last 10 minutes
        const { data, error } = await supabaseAdmin
            .from('User_list')
            .select('user_name')               // select only the username field
            .gte('created_at', tenMinutesAgo); // created_at >= 10 minutes ago:contentReference[oaicite:4]{index=4}

        if (error) {
            throw error;
        }

        // Return the data as JSON (array of { username: ... })
        return new Response(JSON.stringify(data), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });
    } catch (err) {
        // Return error as JSON with appropriate CORS and content type
        const errorResponse = { error: err.message ?? 'Unexpected error' };
        return new Response(JSON.stringify(errorResponse), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
        });
    }
});