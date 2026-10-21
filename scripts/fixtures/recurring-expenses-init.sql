CREATE TABLE public.companies(id bigint PRIMARY KEY,name text);
CREATE TABLE public.marketplace_accounts(id bigint PRIMARY KEY,company_id bigint REFERENCES companies(id));
INSERT INTO companies VALUES (2,'Orion'),(3,'Gunay');
INSERT INTO marketplace_accounts VALUES (2,2),(6,3),(7,3);
CREATE SCHEMA auth;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
CREATE FUNCTION public.orion_jwt_company_ids() RETURNS bigint[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT COALESCE(ARRAY(SELECT DISTINCT NULLIF(trim(value),'')::BIGINT FROM jsonb_array_elements_text(COALESCE(auth.jwt()->'app_metadata'->'orion'->'company_ids','[]'::jsonb)) AS t(value) WHERE trim(value) ~ '^[0-9]+$'),ARRAY[]::BIGINT[]) $$;
GRANT USAGE ON SCHEMA public TO authenticated,service_role;
GRANT SELECT ON public.marketplace_accounts TO service_role;
