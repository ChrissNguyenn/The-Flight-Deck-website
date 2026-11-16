/* tfd-config.example.js — public runtime configuration of /datlich, /datlich-hanoi, /taikhoan, /quanli.
   In production the GitHub Actions deploy writes /tfd-config.js from repository secrets (tools/build-tfd-config.js).
   For a local test copy this file to tfd-config.js (git-ignored) and fill in the TEST project values.
   Only PUBLIC values: the Supabase URL and the anon key. Never the service-role key or any other secret. */
window.TFD_CONFIG = {
  supabaseUrl: 'https://<project-ref>.supabase.co',
  supabaseAnonKey: '<anon key>',
  environment: 'test',
};
