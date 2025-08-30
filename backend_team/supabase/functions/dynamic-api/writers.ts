import { supabaseAdmin } from "./supabaseAdmin.ts";
// User_list_test へ1行追加
export async function insertUserRow(row) {
    const payload = {
        user_id: row.user_id,
        user_name: row.user_name,
        tab_id: row.tab_id,
        device_id: row.device_id
    };
    const { data, error } = await supabaseAdmin.from("User_list_test").insert([
        payload
    ]).select().single();
    if (error) throw error;
    return data;
}
// tab_messages へ追加（Realtime 配信用）
export async function pushMessageToTab(row) {
    const payload = {
        user_id: row.user_id,
        tab_id: row.tab_id ?? null,
        device_id: row.device_id ?? null,
        type: row.type,
        payload: row.payload ?? {}
    };
    const { data, error } = await supabaseAdmin.from("tab_messages").insert([
        payload
    ]).select().single();
    if (error) throw error;
    return data;
}