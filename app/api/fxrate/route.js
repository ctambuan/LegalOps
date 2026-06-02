// app/api/fxrate/route.js — today's market FX rates (base USD) for the Document Number Generator's
// value field. The dashboard converts the entered amount to a USD-per-annum equivalent to route the
// approver. Rates are public, non-privileged data, so this route needs no auth.
//
// Note on "Google exchange rate": Google does not publish a stable public FX API (the old Google
// Finance API was retired). We use a free, no-key market-rate feed (open.er-api.com) that covers
// every currency the form offers (incl. IDR, PHP, KRW…). Swap the endpoint here if a preferred
// provider is licensed later — the response shape { base, rates, date } is all the client needs.
export const runtime = "nodejs";
export const revalidate = 21600; // cache ~6h — intraday moves don't change approval routing

const FX_URL = "https://open.er-api.com/v6/latest/USD";

export async function GET() {
  try {
    const r = await fetch(FX_URL, { next: { revalidate } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.result !== "success" || !j.rates) {
      return Response.json({ error: "Exchange rates are temporarily unavailable." }, { status: 502 });
    }
    return Response.json({
      base: "USD",
      rates: j.rates,
      date: j.time_last_update_utc || null,
    });
  } catch {
    return Response.json({ error: "Could not reach the exchange-rate service." }, { status: 502 });
  }
}
