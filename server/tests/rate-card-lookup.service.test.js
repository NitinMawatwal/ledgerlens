import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  findOne: vi.fn(),
  findOneSort: vi.fn(),
  findOneLean: vi.fn(),
  find: vi.fn(),
  findSort: vi.fn(),
  findLean: vi.fn(),
}));

vi.mock("../src/models/RateCard.js", () => ({
  default: {
    findOne: mocks.findOne,
    find: mocks.find,
  },
}));

import {
  findApplicableRateCard,
  findApplicableRateCards,
} from "../src/services/rate-card-lookup.service.js";

const workspaceId = "64b000000000000000000001";

const createRateCard = ({
  courierKey = "delhivery",
  zone = "A",
  version = 1,
  effectiveFrom = "2026-01-01",
  effectiveTo = null,
} = {}) => ({
  _id: `rate-${version}`,
  courierKey,
  zone,
  version,
  effectiveFrom: new Date(effectiveFrom),
  effectiveTo: effectiveTo ? new Date(effectiveTo) : null,
  isActive: true,
});

const createFreightRecord = ({
  id,
  courier = "Delhivery",
  zone = "A",
  shipmentDate = "2026-06-15",
} = {}) => ({
  _id: id,
  standardizedData: {
    courier,
    zone,
    shipmentDate,
  },
});

describe("Rate Card Lookup Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.findOne.mockReturnValue({
      sort: mocks.findOneSort,
    });

    mocks.findOneSort.mockReturnValue({
      lean: mocks.findOneLean,
    });

    mocks.findOneLean.mockResolvedValue({
      courierKey: "delhivery",
      zone: "A",
      version: 2,
    });

    mocks.find.mockReturnValue({
      sort: mocks.findSort,
    });

    mocks.findSort.mockReturnValue({
      lean: mocks.findLean,
    });

    mocks.findLean.mockResolvedValue([]);
  });

  describe("findApplicableRateCard", () => {
    it("should find a rate card using workspace, courier, zone and effective date", async () => {
      const result = await findApplicableRateCard({
        workspaceId,
        courier: "Delhivery",
        zone: "a",
        shipmentDate: "2026-06-15",
      });

      expect(mocks.findOne).toHaveBeenCalledWith({
        workspaceId,
        courierKey: "delhivery",
        zone: "A",
        isActive: true,
        effectiveFrom: {
          $lte: new Date("2026-06-15"),
        },
        $or: [
          { effectiveTo: null },
          {
            effectiveTo: {
              $gte: new Date("2026-06-15"),
            },
          },
        ],
      });

      expect(mocks.findOneSort).toHaveBeenCalledWith({
        effectiveFrom: -1,
        version: -1,
      });

      expect(result.version).toBe(2);
    });

    it("should return null when courier is missing", async () => {
      const result = await findApplicableRateCard({
        workspaceId,
        courier: "",
        zone: "A",
        shipmentDate: "2026-06-15",
      });

      expect(result).toBeNull();
      expect(mocks.findOne).not.toHaveBeenCalled();
    });

    it("should return null when zone is missing", async () => {
      const result = await findApplicableRateCard({
        workspaceId,
        courier: "Delhivery",
        zone: "",
        shipmentDate: "2026-06-15",
      });

      expect(result).toBeNull();
      expect(mocks.findOne).not.toHaveBeenCalled();
    });

    it("should return null for an invalid shipment date", async () => {
      const result = await findApplicableRateCard({
        workspaceId,
        courier: "Delhivery",
        zone: "A",
        shipmentDate: "invalid-date",
      });

      expect(result).toBeNull();
      expect(mocks.findOne).not.toHaveBeenCalled();
    });

    it("should return null when shipment date is missing", async () => {
      const result = await findApplicableRateCard({
        workspaceId,
        courier: "Delhivery",
        zone: "A",
      });

      expect(result).toBeNull();
      expect(mocks.findOne).not.toHaveBeenCalled();
    });

    it("should return null when no applicable rate card exists", async () => {
      mocks.findOneLean.mockResolvedValue(null);

      const result = await findApplicableRateCard({
        workspaceId,
        courier: "Delhivery",
        zone: "A",
        shipmentDate: "2026-06-15",
      });

      expect(result).toBeNull();
    });
  });

  describe("findApplicableRateCards", () => {
    it("should load rate cards in one database query for multiple freight records", async () => {
      const records = [
        createFreightRecord({ id: "freight-1" }),
        createFreightRecord({ id: "freight-2" }),
      ];

      const rateCard = createRateCard({ version: 2 });

      mocks.findLean.mockResolvedValue([rateCard]);

      const result = await findApplicableRateCards({
        workspaceId,
        freightRecords: records,
      });

      expect(mocks.find).toHaveBeenCalledTimes(1);

      expect(mocks.find).toHaveBeenCalledWith({
        workspaceId,
        courierKey: { $in: ["delhivery"] },
        zone: { $in: ["A"] },
        isActive: true,
        effectiveFrom: {
          $lte: new Date("2026-06-15"),
        },
      });

      expect(mocks.findSort).toHaveBeenCalledWith({
        effectiveFrom: -1,
        version: -1,
      });

      expect(result.get("freight-1").version).toBe(2);
      expect(result.get("freight-2").version).toBe(2);
    });

    it("should return an empty map when no freight records are supplied", async () => {
      const result = await findApplicableRateCards({
        workspaceId,
        freightRecords: [],
      });

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
      expect(mocks.find).not.toHaveBeenCalled();
    });

    it("should ignore records with missing or invalid shipment dates", async () => {
      const records = [
        createFreightRecord({
          id: "freight-1",
          shipmentDate: null,
        }),
        createFreightRecord({
          id: "freight-2",
          shipmentDate: "invalid-date",
        }),
      ];

      const result = await findApplicableRateCards({
        workspaceId,
        freightRecords: records,
      });

      expect(result.size).toBe(0);
      expect(mocks.find).not.toHaveBeenCalled();
    });

    it("should select the rate card effective on each shipment date", async () => {
      const records = [
        createFreightRecord({
          id: "freight-old",
          shipmentDate: "2026-03-01",
        }),
        createFreightRecord({
          id: "freight-new",
          shipmentDate: "2026-08-01",
        }),
      ];

      const oldCard = createRateCard({
        version: 1,
        effectiveFrom: "2026-01-01",
        effectiveTo: "2026-05-31",
      });

      const newCard = createRateCard({
        version: 2,
        effectiveFrom: "2026-06-01",
      });

      mocks.findLean.mockResolvedValue([newCard, oldCard]);

      const result = await findApplicableRateCards({
        workspaceId,
        freightRecords: records,
      });

      expect(result.get("freight-old").version).toBe(1);
      expect(result.get("freight-new").version).toBe(2);
    });

    it("should not assign a rate card when no card covers the shipment date", async () => {
      const records = [
        createFreightRecord({
          id: "freight-1",
          shipmentDate: "2026-03-01",
        }),
      ];

      const card = createRateCard({
        version: 1,
        effectiveFrom: "2026-01-01",
        effectiveTo: "2026-02-28",
      });

      mocks.findLean.mockResolvedValue([card]);

      const result = await findApplicableRateCards({
        workspaceId,
        freightRecords: records,
      });

      expect(result.has("freight-1")).toBe(false);
    });

    it("should keep different courier and zone rate cards separate", async () => {
      const records = [
        createFreightRecord({
          id: "freight-1",
          courier: "Delhivery",
          zone: "A",
        }),
        createFreightRecord({
          id: "freight-2",
          courier: "BlueDart",
          zone: "B",
        }),
      ];

      const delhiveryCard = createRateCard({
        courierKey: "delhivery",
        zone: "A",
        version: 1,
      });

      const blueDartCard = createRateCard({
        courierKey: "bluedart",
        zone: "B",
        version: 3,
      });

      mocks.findLean.mockResolvedValue([delhiveryCard, blueDartCard]);

      const result = await findApplicableRateCards({
        workspaceId,
        freightRecords: records,
      });

      expect(result.get("freight-1").version).toBe(1);
      expect(result.get("freight-2").version).toBe(3);
    });
  });
});
