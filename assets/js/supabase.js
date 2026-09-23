// Supabase Client Initialization
// IMPORTANT: Replace YOUR_URL and YOUR_KEY with your Supabase project credentials

const SUPABASE_URL = 'https://jbshrucfzwwzrsronodm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impic2hydWNmend3enJzcm9ub2RtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAxNjkyNjcsImV4cCI6MjEwNTc0NTI2N30.aZvGaGCWT06gUZDPaEyn6kWLC13eFZjXFP8Fp8mgxKI';

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

window.db = db;
