import assert from "node:assert/strict";
import test from "node:test";
import { formatPriceLabel } from "./pricing.js";

test("formatPriceLabel renders whole and fractional major currency amounts", () => {
  assert.equal(formatPriceLabel(300, "usd"), "$3");
  assert.equal(formatPriceLabel(350, "usd"), "$3.50");
});
