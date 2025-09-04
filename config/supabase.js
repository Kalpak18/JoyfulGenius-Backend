import { createClient } from "@supabase/supabase-js";
import { env } from "./validateEnv.js";

const {SUPABASE_URL, SUPABASE_KEY} = env;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export default supabase;
