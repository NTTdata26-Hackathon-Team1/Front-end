import { supabaseAdmin } from "./supabaseAdmin.ts";

export type UsernameRow = { user_name: string };

export async function fetchRecentUsernames(minutes = 10): Promise<{ user_name: string }[]> {
    const since = new Date(Date.now() - minutes * 60 * 1000).toISOString();
    const { data, error } = await supabaseAdmin
        .from("User_list")
        .select("user_name")
        .gte("created_at", since);

    if (error) throw error;
    return data ?? [];
}
