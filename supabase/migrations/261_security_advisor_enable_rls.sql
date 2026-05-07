-- Enables RLS on public tables flagged by the advisor as having no RLS, plus
-- adds an admin-only policy. All callers verified to use createAdminClient()
-- (service_role), which bypasses RLS, so backend code is unaffected.
-- anon and viewer auth users were never meant to read these tables directly.

-- payroll_payouts: accounting/admin only
ALTER TABLE public.payroll_payouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY payroll_payouts_admin_all ON public.payroll_payouts FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- nerd_conversations: admin chat history (auth user_id check happens in code via service_role)
ALTER TABLE public.nerd_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY nerd_conversations_admin_all ON public.nerd_conversations FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- nerd_messages
ALTER TABLE public.nerd_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY nerd_messages_admin_all ON public.nerd_messages FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- brand_fonts: admin asset library
ALTER TABLE public.brand_fonts ENABLE ROW LEVEL SECURITY;
CREATE POLICY brand_fonts_admin_all ON public.brand_fonts FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- brand_ad_templates: admin asset library (no callers found, lock down)
ALTER TABLE public.brand_ad_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY brand_ad_templates_admin_all ON public.brand_ad_templates FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- brand_scene_photos: ad-creatives backend
ALTER TABLE public.brand_scene_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY brand_scene_photos_admin_all ON public.brand_scene_photos FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ad_monthly_generation_settings: admin + cron only
ALTER TABLE public.ad_monthly_generation_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY ad_monthly_generation_settings_admin_all ON public.ad_monthly_generation_settings FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ad_reference_ads: admin reference library
ALTER TABLE public.ad_reference_ads ENABLE ROW LEVEL SECURITY;
CREATE POLICY ad_reference_ads_admin_all ON public.ad_reference_ads FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- app_secrets: RLS already enabled, no policy. Lock down to admin only.
CREATE POLICY app_secrets_admin_all ON public.app_secrets FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
