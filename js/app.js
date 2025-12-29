// js/app.js
import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";
import { createSupabaseClient } from "./db.js";
import { createUI } from "./ui.js";

const supabase = createSupabaseClient(SUPABASE_URL, SUPABASE_KEY);
const ui = createUI({ supabase });

ui.boot();
