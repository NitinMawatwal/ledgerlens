import RateCard from "../models/RateCard.js";

const isValidNonNegativeNumber = (value) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

const validateRateCardInput = (body) => {
  const errors = [];

  if (
    typeof body.courierName !== "string" ||
    !body.courierName.trim() ||
    body.courierName.trim().length > 100
  ) {
    errors.push("A valid courierName is required (maximum 100 characters).");
  }

  if (typeof body.zone !== "string" || !body.zone.trim()) {
    errors.push("A valid zone is required.");
  }

  if (!Array.isArray(body.weightSlabs) || body.weightSlabs.length === 0) {
    errors.push("At least one weight slab is required.");
  } else {
    const slabs = [...body.weightSlabs].sort(
      (a, b) => a.minWeight - b.minWeight,
    );

    for (let i = 0; i < slabs.length; i += 1) {
      const slab = slabs[i];

      if (
        !isValidNonNegativeNumber(slab.minWeight) ||
        !isValidNonNegativeNumber(slab.maxWeight) ||
        !isValidNonNegativeNumber(slab.baseCharge) ||
        !isValidNonNegativeNumber(slab.additionalChargePerKg ?? 0)
      ) {
        errors.push(`Weight slab ${i + 1} contains invalid numeric values.`);
        continue;
      }

      if (slab.maxWeight <= slab.minWeight) {
        errors.push(`Weight slab ${i + 1} has an invalid weight range.`);
      }

      if (i > 0 && slab.minWeight < slabs[i - 1].maxWeight) {
        errors.push("Weight slabs must not overlap.");
      }
    }
  }

  const optionalCharges = [
    "codFee",
    "codFeePercentage",
    "rtoFee",
    "additionalCharges",
  ];

  for (const field of optionalCharges) {
    if (body[field] !== undefined && !isValidNonNegativeNumber(body[field])) {
      errors.push(`${field} must be a non-negative number.`);
    }
  }

  if (
    !body.effectiveFrom ||
    Number.isNaN(new Date(body.effectiveFrom).getTime())
  ) {
    errors.push("A valid effectiveFrom date is required.");
  }

  if (
    body.effectiveTo !== undefined &&
    body.effectiveTo !== null &&
    Number.isNaN(new Date(body.effectiveTo).getTime())
  ) {
    errors.push("effectiveTo must be a valid date or null.");
  }

  if (
    body.effectiveTo &&
    body.effectiveFrom &&
    new Date(body.effectiveTo) < new Date(body.effectiveFrom)
  ) {
    errors.push("effectiveTo cannot be earlier than effectiveFrom.");
  }

  if (
    body.channelName !== undefined &&
    body.channelName !== null &&
    typeof body.channelName !== "string"
  ) {
    errors.push("channelName must be a string or null.");
  }

  return errors;
};

// POST /api/rate-cards
export const createRateCard = async (req, res, next) => {
  try {
    const errors = validateRateCardInput(req.body);

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid rate-card data",
        errors,
      });
    }

    const workspaceId = req.user.workspaceId;
    const userId = req.user.id;

    const courierName = req.body.courierName.trim();
    const courierKey = courierName.toLowerCase();
    const zone = req.body.zone.trim().toUpperCase();

    // Automatically increment the version for this courier and zone.
    const latestRateCard = await RateCard.findOne({
      workspaceId,
      courierKey,
      zone,
    })
      .sort({ version: -1 })
      .select("version")
      .lean();

    const nextVersion = (latestRateCard?.version || 0) + 1;

    const rateCard = await RateCard.create({
      workspaceId,
      courierName,
      courierKey,
      channelName: req.body.channelName?.trim() || null,
      zone,
      weightSlabs: req.body.weightSlabs,
      codFee: req.body.codFee ?? 0,
      codFeePercentage: req.body.codFeePercentage ?? 0,
      rtoFee: req.body.rtoFee ?? 0,
      additionalCharges: req.body.additionalCharges ?? 0,
      effectiveFrom: new Date(req.body.effectiveFrom),
      effectiveTo: req.body.effectiveTo ? new Date(req.body.effectiveTo) : null,
      version: nextVersion,
      isActive: true,
      createdBy: userId,
    });

    return res.status(201).json({
      success: true,
      message: "Rate card created successfully",
      data: {
        rateCard,
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message:
          "A rate-card version already exists for this courier and zone. Please retry.",
      });
    }

    if (error.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message: "Rate-card validation failed",
        errors: Object.values(error.errors).map((item) => item.message),
      });
    }

    return next(error);
  }
};

// GET /api/rate-cards
export const getRateCards = async (req, res, next) => {
  try {
    const filters = {
      workspaceId: req.user.workspaceId,
    };

    if (req.query.courierKey) {
      filters.courierKey = String(req.query.courierKey).trim().toLowerCase();
    }

    if (req.query.zone) {
      filters.zone = String(req.query.zone).trim().toUpperCase();
    }

    if (req.query.isActive !== undefined) {
      if (!["true", "false"].includes(req.query.isActive)) {
        return res.status(400).json({
          success: false,
          message: "isActive must be true or false.",
        });
      }

      filters.isActive = req.query.isActive === "true";
    }

    const rateCards = await RateCard.find(filters)
      .sort({ courierName: 1, zone: 1, version: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      message: "Rate cards retrieved successfully",
      data: {
        count: rateCards.length,
        rateCards,
      },
    });
  } catch (error) {
    return next(error);
  }
};
