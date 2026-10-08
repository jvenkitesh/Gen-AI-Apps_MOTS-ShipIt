// Definitions shown in the ⓘ tooltip after each label. Plain language, one or two sentences.
export const LABEL_DEFINITIONS = {
  // Load estimate
  bestChoice: "The cheapest option found: either the routing guide's carrier or ShipStation's lowest live rate.",
  estimatedCost: "Freight cost in US dollars for the best choice. Estimates only; nothing is booked.",
  transitDays: "Typical number of days in transit from the origin hub to the ship-to, from the routing guide.",
  weight: "Shipment weight used for the estimate. If the question has no weight, a default is assumed.",
  option: "Where the price comes from: your routing guide, or a live ShipStation rate estimate.",
  carrier: "The trucking, rail or parcel company that would move the freight.",
  cost: "Total price in US dollars. For ShipStation this adds shipping, insurance, confirmation and other charges.",
  delivery: "Days until delivery. Routing guide transit days, or ShipStation's delivery-day estimate.",
  shipTo: "The routing guide's gateway destination for this state: the place freight is delivered to.",
  corridor: "The highway or rail route the freight travels, from the routing guide.",
  sources: "The knowledge sources used for this answer.",

  // Loads
  loadStatus: "Where the load is in the process: sourcing, negotiating, booked, exception (needs a person) or cancelled.",
  load: "The load's ID in your TMS and its version. A new version is created when the TMS changes the load's terms.",
  customer: "The customer (shipper) the load belongs to, from Master Data Management.",
  lane: "Origin and destination of the load: state and zip code.",
  equipment: "Trailer type the load needs: dry van (standard enclosed) or reefer (refrigerated).",
  loadWeight: "Total weight of the load in pounds.",
  targetRate: "The price you aim to pay the carrier for this load, in US dollars.",
  rateCeiling: "The most you will pay for this load. Negotiation can never go above it.",
  pickup: "Scheduled pickup date and time at the origin.",
  delivery_scheduled: "Scheduled delivery date and time at the destination.",
  commodity: "What is being shipped.",
  received: "When ShipIt first received this load from the TMS.",
  eligibility: "The policy engine's check of the load against the customer's active sourcing policy. Only eligible loads go to carriers.",
  reasonCodes: "Why a load did not pass the sourcing policy check.",
  sourcingPolicy: "The customer's guardrails: allowed lanes, equipment and rate range. One policy is active per customer.",
  policyVersion: "Which version of the sourcing policy the load was checked against.",
  eligibleLanes: "Origin and destination states this customer allows. * means any state.",
  eligibleEquipment: "Trailer types this customer allows.",
  rateBounds: "The minimum target rate and maximum rate ceiling this customer allows, in US dollars.",
  exceptions: "Problems that need a person to decide, with the deadline (SLA) to resolve them.",
  slaDeadline: "The time by which a person should resolve this exception.",
  riskLevel: "How serious the problem is: low, medium, high or critical.",
} as const;

export type LabelKey = keyof typeof LABEL_DEFINITIONS;
