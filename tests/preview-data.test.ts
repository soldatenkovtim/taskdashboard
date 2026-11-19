import { test } from "node:test";
import assert from "node:assert/strict";
import { previewData } from "../lib/preview-data";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import Dashboard from "../components/dashboard";
test("Наборы плотности 5/15/30 доступны только в development и не подменяют production", () => {
  const original = {
    NODE_ENV: process.env.NODE_ENV,
    DEV_PREVIEW_ENABLED: process.env.DEV_PREVIEW_ENABLED,
  };
  try {
    Object.assign(process.env, {
      NODE_ENV: "production",
      DEV_PREVIEW_ENABLED: "true",
    });
    assert.throws(() => previewData(30, "admin"), /локальной/);
    Object.assign(process.env, {
      NODE_ENV: "development",
      DEV_PREVIEW_ENABLED: "false",
    });
    assert.throws(() => previewData(5, "employee"), /локальной/);
    Object.assign(process.env, { DEV_PREVIEW_ENABLED: "true" });
    for (const count of [5, 15, 30] as const) {
      for (const role of ["admin", "employee"] as const) {
        const data = previewData(count, role);
        assert.equal(data.tasks.length, count);
        assert.equal(new Set(data.tasks.map((t) => t.id)).size, count);
        assert.equal(data.profile.role, role);
        assert.equal(new Set(data.tasks.map((t) => t.status)).size, 4);
        // The browser can hydrate after a deadline, or have a skewed clock.
        // Both initial renders must still use the serialized server snapshot.
        const originalNow = Date.now;
        try {
          Date.now = () => Date.parse(data.serverNow) - 1000;
          const serverHtml = renderToString(
            createElement(Dashboard, { setup: true, previewRole: role, previewData: data }),
          );
          if (role === "employee") {
            assert.ok(serverHtml.includes("Кажется, у нас разговор"));
            assert.ok(serverHtml.includes("Посмотреть просроченные"));
            assert.equal((serverHtml.match(/class="noir-character noir-character-board/g) ?? []).length, 1);
          } else {
            assert.ok(!serverHtml.includes("Кажется, у нас разговор"));
          }
          Date.now = () => Date.parse(data.serverNow) + 86400000;
          const clientHtml = renderToString(
            createElement(Dashboard, { setup: true, previewRole: role, previewData: data }),
          );
          assert.equal(clientHtml, serverHtml, `Stable initial HTML: ${role}, ${count} tasks`);
        } finally {
          Date.now = originalNow;
        }
        if (role === "employee")
          assert.ok(data.tasks.every((t) => t.assignee_id === data.profile.id));
      }
    }
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
