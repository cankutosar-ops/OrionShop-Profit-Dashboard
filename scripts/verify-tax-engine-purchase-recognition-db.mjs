import assert from "node:assert/strict";
import pg from "pg";

const { Client } = pg;
const db = new Client({ connectionString: process.env.LOCAL_SUPABASE_DB_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres" });

async function mustFail(name, statement, values = []) {
  await db.query(`SAVEPOINT ${name}`);
  try {
    await db.query(statement, values);
    assert.fail(`${name} unexpectedly succeeded`);
  } catch (error) {
    if (error?.code === "ERR_ASSERTION") throw error;
  } finally {
    await db.query(`ROLLBACK TO SAVEPOINT ${name}`);
    await db.query(`RELEASE SAVEPOINT ${name}`);
  }
}

await db.connect();
await db.query("BEGIN");
try {
  const schema = await db.query(`
    SELECT c.relname, c.relrowsecurity,
      has_table_privilege('anon', c.oid, 'INSERT') AS anon_insert,
      has_table_privilege('authenticated', c.oid, 'SELECT') AS authenticated_select,
      has_table_privilege('service_role', c.oid, 'UPDATE') AS service_update,
      has_table_privilege('service_role', c.oid, 'DELETE') AS service_delete
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = ANY($1::text[])
    ORDER BY c.relname
  `, [["company_purchase_tax_policies", "purchase_payment_audit", "tax_purchase_recognition_events"]]);
  assert.equal(schema.rows.length, 3);
  for (const table of schema.rows) {
    assert.equal(table.relrowsecurity, true, `${table.relname} must have RLS`);
    assert.equal(table.anon_insert, false, `${table.relname} must reject anon writes`);
    assert.equal(table.authenticated_select, true, `${table.relname} must allow tenant reads`);
    assert.equal(table.service_delete, false, `${table.relname} must not grant direct deletes`);
    assert.equal(table.service_update, false, `${table.relname} must not grant direct updates`);
  }

  const company1 = (await db.query(`INSERT INTO public.companies(name,country,currency)
    VALUES ('Sprint3B Company 1','RU','RUB') RETURNING id`)).rows[0].id;
  const company2 = (await db.query(`INSERT INTO public.companies(name,country,currency)
    VALUES ('Sprint3B Company 2','RU','RUB') RETURNING id`)).rows[0].id;
  const account1 = (await db.query(`INSERT INTO public.marketplace_accounts
    (company_id,marketplace,account_name,api_key_encrypted)
    VALUES ($1,'wildberries','Sprint3B A1','') RETURNING id`, [company1])).rows[0].id;
  const account2 = (await db.query(`INSERT INTO public.marketplace_accounts
    (company_id,marketplace,account_name,api_key_encrypted)
    VALUES ($1,'wildberries','Sprint3B A2','') RETURNING id`, [company2])).rows[0].id;
  const brand = (await db.query("INSERT INTO public.brands(name) VALUES ('Sprint3B Brand') RETURNING id")).rows[0].id;
  const category = (await db.query("INSERT INTO public.categories(name) VALUES ('Sprint3B Category') RETURNING id")).rows[0].id;
  const product1 = (await db.query(`INSERT INTO public.products
    (marketplace_account_id,supplier_article,nm_id,name,brand_id,category_id,barcode)
    VALUES ($1,'SPRINT3B-1',9300001,'Sprint3B Product',$2,$3,'9300001') RETURNING id`,
    [account1, brand, category])).rows[0].id;

  await db.query(`INSERT INTO public.company_purchase_tax_policies
    (company_id,allocation_method,payment_policy,return_policy,effective_from,evidence_reference)
    VALUES ($1,'FIFO','FULL_PAYMENT_ONLY','RETURN_EVENT_DATE','2026-01-01','Approved Human Gate 3')`, [company1]);
  assert.equal((await db.query("SELECT count(*)::int n FROM public.company_purchase_tax_policies WHERE company_id=$1", [company2])).rows[0].n, 0,
    "unrelated companies must not receive an inferred policy");

  const purchase = (await db.query(`INSERT INTO public.purchases
    (marketplace_account_id,purchase_date,supplier,currency,exchange_rate,invoice_number)
    VALUES ($1,'2026-01-01','Supplier','RUB',NULL,'INV-1') RETURNING *`, [account1])).rows[0];
  assert.equal(purchase.payment_status, "UNPAID");
  assert.equal(Number(purchase.paid_amount), 0);
  assert.equal(purchase.payment_date, null, "purchase creation must not imply payment");
  const line = (await db.query(`INSERT INTO public.purchase_lines
    (purchase_id,product_id,supplier_article,quantity,unit_cost)
    VALUES ($1,$2,'SPRINT3B-1',2,100) RETURNING id`, [purchase.id, product1])).rows[0].id;
  await db.query(`UPDATE public.purchases SET payment_status='PAID', payment_date='2026-01-02',
    paid_amount=200, payment_reference='BANK-1' WHERE id=$1`, [purchase.id]);
  assert.equal((await db.query("SELECT count(*)::int n FROM public.purchase_payment_audit WHERE purchase_id=$1", [purchase.id])).rows[0].n, 2,
    "creation and payment change must be audited");

  const sale = (await db.query(`INSERT INTO public.wb_sales
    (marketplace_account_id,sale_id,event_type,srid,nm_id,product_id,sale_date,revenue,
      quantity,is_return,return_date,tech_size,barcode)
    VALUES ($1,'S9300001','SALE','SR-SPRINT3B',9300001,$2,'2026-01-03',150,1,false,NULL,'0','9300001')
    RETURNING id`, [account1, product1])).rows[0].id;
  const recognitionValues = ["recognition:test", company1, account1, purchase.id, line, product1,
    sale, "S9300001", "SR-SPRINT3B", "RECOGNITION", "2026-01-03", 1, 100, 100];
  await db.query(`INSERT INTO public.tax_purchase_recognition_events
    (event_key,company_id,marketplace_account_id,purchase_id,purchase_line_id,product_id,
      source_sale_row_id,source_sale_id,source_srid,event_type,recognition_date,quantity,
      unit_cost_rub,amount_rub,allocation_method)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'FIFO')`, recognitionValues);
  await mustFail("duplicate_event", `INSERT INTO public.tax_purchase_recognition_events
    (event_key,company_id,marketplace_account_id,purchase_id,purchase_line_id,product_id,
      source_sale_row_id,source_sale_id,source_srid,event_type,recognition_date,quantity,
      unit_cost_rub,amount_rub,allocation_method)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'FIFO')`, recognitionValues);
  const wrongCompany = [...recognitionValues];
  wrongCompany[0] = "recognition:wrong-company";
  wrongCompany[1] = company2;
  await mustFail("cross_company", `INSERT INTO public.tax_purchase_recognition_events
    (event_key,company_id,marketplace_account_id,purchase_id,purchase_line_id,product_id,
      source_sale_row_id,source_sale_id,source_srid,event_type,recognition_date,quantity,
      unit_cost_rub,amount_rub,allocation_method)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'FIFO')`, wrongCompany);
  await mustFail("ledger_update", "UPDATE public.tax_purchase_recognition_events SET amount_rub=99 WHERE event_key='recognition:test'");
  await mustFail("ledger_delete", "DELETE FROM public.tax_purchase_recognition_events WHERE event_key='recognition:test'");

  await db.query("SET LOCAL ROLE authenticated");
  await db.query("SELECT set_config('request.jwt.claims',$1,true)", [JSON.stringify({
    role: "authenticated", app_metadata: { orion: { company_ids: [String(company1)], marketplace_account_ids: [String(account1)] } },
  })]);
  assert.equal((await db.query("SELECT count(*)::int n FROM public.tax_purchase_recognition_events")).rows[0].n, 1);
  assert.equal((await db.query("SELECT count(*)::int n FROM public.company_purchase_tax_policies")).rows[0].n, 1);
  await db.query("RESET ROLE");
  await db.query("SET LOCAL ROLE authenticated");
  await db.query("SELECT set_config('request.jwt.claims',$1,true)", [JSON.stringify({
    role: "authenticated", app_metadata: { orion: { company_ids: [String(company2)], marketplace_account_ids: [String(account2)] } },
  })]);
  assert.equal((await db.query("SELECT count(*)::int n FROM public.tax_purchase_recognition_events")).rows[0].n, 0,
    "other company must not see recognition events");
  assert.equal((await db.query("SELECT count(*)::int n FROM public.company_purchase_tax_policies")).rows[0].n, 0,
    "other company must not see policy rows");
  await db.query("RESET ROLE");

  console.log("Tax Engine Sprint 3B local DB verification passed (schema, audit, append-only, idempotency, tenant isolation).");
} finally {
  await db.query("ROLLBACK");
  await db.end();
}
