import { describe, expect, it } from "vitest";
import { parseQuery } from "@/lib/estimate/parseQuery";
import { EstimateInputError } from "@/lib/estimate/types";

describe("estimate chatbot: parseQuery", () => {
  it("reads a zip code, its state and a cost question", () => {
    expect(parseQuery("How much to ship to 30303?")).toEqual({
      zipcode: "30303",
      stateCode: "GA",
      cacheKey: "30303",
      queryType: "cost",
      weightPounds: null,
      glossarySlug: null,
    });
  });

  it("reads a state name and a transit-time question, caching by state", () => {
    const parsed = parseQuery("How long does delivery to Texas take?");
    expect(parsed).toMatchObject({ zipcode: null, stateCode: "TX", cacheKey: "TX", queryType: "transit_time" });
  });

  it("asks for both when the question covers cost and transit, or neither", () => {
    expect(parseQuery("rate and transit days to 30303").queryType).toBe("both");
    expect(parseQuery("shipping to 30303").queryType).toBe("both");
  });

  it("prefers the longer state name (West Virginia, not Virginia)", () => {
    expect(parseQuery("cost to West Virginia").stateCode).toBe("WV");
  });

  it("only reads two-letter state codes written in capitals", () => {
    expect(parseQuery("cost to GA").stateCode).toBe("GA");
    expect(() => parseQuery("can you help me in or out")).toThrow(EstimateInputError);
  });

  it("reads a stated weight and ignores a zero weight", () => {
    expect(parseQuery("cost for 150 lbs to 30303").weightPounds).toBe(150);
    expect(parseQuery("cost for 12.5 pounds to 30303").weightPounds).toBe(12.5);
    expect(parseQuery("cost for 0 lbs to 30303").weightPounds).toBeNull();
  });

  it("picks a glossary term for freight jargon", () => {
    expect(parseQuery("reefer cost to 30303").glossarySlug).toBe("temperature-controlled-shipping");
    expect(parseQuery("LTL rate to 30303").glossarySlug).toBe("less-than-truckload-ltl");
  });

  it("explains what's missing when there is no usable location", () => {
    expect(() => parseQuery("what does freight cost?")).toThrow("Please include a US zip code or state name.");
    expect(() => parseQuery("cost to 00001")).toThrow("ZIP code 00001 isn't in a US state we can route to.");
  });
});
