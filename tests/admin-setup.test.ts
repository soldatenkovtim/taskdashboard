import { test } from "node:test";
import assert from "node:assert/strict";
import { devPreviewEnabled } from "../lib/dev-preview";
import { provisionAdmin } from "../scripts/provision-admin.mjs";

test("Предпросмотр требует development и явный флаг; в production запрещён", () => {
  assert.equal(
    devPreviewEnabled({ NODE_ENV: "development", DEV_PREVIEW_ENABLED: "true" }),
    true,
  );
  assert.equal(devPreviewEnabled({ NODE_ENV: "development" }), false);
  assert.equal(
    devPreviewEnabled({ NODE_ENV: "production", DEV_PREVIEW_ENABLED: "true" }),
    false,
  );
});
function mock(existingEmail = "owner@example.com", confirmed = true) {
  const calls: Array<Record<string, unknown>> = [];
  const profile = { id: "owner-id", role: "admin", access_status: "active" };
  const chain = {
    select: () => chain,
    limit: async () => ({ error: null }),
    update: (values: object) => {
      calls.push({ update: values });
      return chain;
    },
    eq: (column: string, value: string) => {
      calls.push({ column, value });
      return chain;
    },
    single: async () => ({ data: profile, error: null }),
  };
  const db = {
    from: () => chain,
    auth: {
      admin: {
        createUser: async (values: object) => {
          calls.push({ create: values });
          return { data: { user: { id: "owner-id" } }, error: null };
        },
        getUserById: async () => ({
          data: {
            user: {
              id: "owner-id",
              email: existingEmail,
              email_confirmed_at: confirmed ? "2026-01-01" : null,
            },
          },
          error: null,
        }),
      },
    },
  };
  return { db, calls };
}
test("Команда создаёт подтверждённого администратора и назначает роль по UUID", async () => {
  const { db, calls } = mock();
  const result = await provisionAdmin(db, {
    ADMIN_EMAIL: "owner@example.com",
    ADMIN_PASSWORD: "a-long-test-password",
  });
  assert.equal(result.role, "admin");
  assert.equal(
    (calls[0].create as { email_confirm: boolean }).email_confirm,
    true,
  );
  assert.deepEqual(calls[1], {
    update: { role: "admin", access_status: "active" },
  });
  assert.deepEqual(calls[2], { column: "id", value: "owner-id" });
});
test("Существующий аккаунт: нельзя повысить чужой или неподтверждённый email", async () => {
  for (const [email, confirmed] of [
    ["other@example.com", true],
    ["owner@example.com", false],
  ] as const) {
    const { db, calls } = mock(email, confirmed);
    await assert.rejects(
      provisionAdmin(db, {
        ADMIN_EMAIL: "owner@example.com",
        ADMIN_USER_ID: "owner-id",
      }),
    );
    assert.equal(calls.length, 0);
  }
});
test("Повторная настройка не создаёт пользователя и не меняет пароль", async () => {
  const { db, calls } = mock();
  await provisionAdmin(db, {
    ADMIN_EMAIL: "owner@example.com",
    ADMIN_USER_ID: "owner-id",
  });
  assert.equal(
    calls.some((call) => call.create),
    false,
  );
  assert.equal(calls.length, 2);
});
test("Короткий пароль отклоняется до каких-либо изменений", async () => {
  const { db, calls } = mock();
  await assert.rejects(
    provisionAdmin(db, {
      ADMIN_EMAIL: "owner@example.com",
      ADMIN_PASSWORD: "short",
    }),
  );
  assert.equal(calls.length, 0);
});
