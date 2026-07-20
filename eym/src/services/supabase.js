import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://kxuwbjkyjngcgpkqopnh.supabase.co";
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_XjmWgZ23j-G1NeyvZJTgMg_iI2STE3A";

export const supabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

function stateForCloud(state) {
  return {
    ...state,
    strava: {
      ...state.strava,
      token: null,
      refreshToken: null,
    },
  };
}

export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}


export async function resetPassword(email) {
  const redirectTo = `${window.location.origin}${import.meta.env.BASE_URL}`;
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw error;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function loadCloudState(userId) {
  const { data, error } = await supabase
    .from("athlete_data")
    .select("app_data, calendar_token, updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function saveCloudState(userId, state) {
  const { data, error } = await supabase
    .from("athlete_data")
    .upsert({ user_id: userId, app_data: stateForCloud(state) }, { onConflict: "user_id" })
    .select("calendar_token, updated_at")
    .single();
  if (error) throw error;
  return data;
}

export function calendarSubscriptionUrl(token) {
  if (!token) return "";
  return `${supabaseUrl}/functions/v1/calendar?token=${encodeURIComponent(token)}`;
}
