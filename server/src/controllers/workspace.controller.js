import Workspace from "../models/Workspace.js";

const formatWorkspace = (workspace) => ({
  id: workspace._id,
  name: workspace.name,
  slug: workspace.slug,
  status: workspace.status,
  settings: {
    currency: workspace.settings?.currency || "INR",
    reconciliationTolerance: workspace.settings?.reconciliationTolerance ?? 10,
  },
});

export const getWorkspaceSettings = async (req, res, next) => {
  try {
    const workspace = await Workspace.findById(req.user.workspaceId);

    if (!workspace) {
      return res.status(404).json({
        success: false,
        message: "Workspace not found.",
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        workspace: formatWorkspace(workspace),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const updateWorkspaceSettings = async (req, res, next) => {
  try {
    const { name, currency, reconciliationTolerance } = req.body;

    if (name !== undefined) {
      if (
        typeof name !== "string" ||
        name.trim().length < 2 ||
        name.trim().length > 100
      ) {
        return res.status(400).json({
          success: false,
          message: "Workspace name must contain 2 to 100 characters.",
        });
      }
    }

    const allowedCurrencies = ["INR", "USD", "AUD", "GBP", "EUR"];

    if (currency !== undefined && !allowedCurrencies.includes(currency)) {
      return res.status(400).json({
        success: false,
        message: "Unsupported currency.",
      });
    }

    if (reconciliationTolerance !== undefined) {
      if (
        typeof reconciliationTolerance !== "number" ||
        !Number.isFinite(reconciliationTolerance) ||
        reconciliationTolerance < 0 ||
        reconciliationTolerance > 10000
      ) {
        return res.status(400).json({
          success: false,
          message: "Reconciliation tolerance must be between 0 and 10000.",
        });
      }
    }

    if (
      name === undefined &&
      currency === undefined &&
      reconciliationTolerance === undefined
    ) {
      return res.status(400).json({
        success: false,
        message: "No settings were provided for update.",
      });
    }

    const update = {};

    if (name !== undefined) {
      update.name = name.trim();
    }

    if (currency !== undefined) {
      update["settings.currency"] = currency;
    }

    if (reconciliationTolerance !== undefined) {
      update["settings.reconciliationTolerance"] = reconciliationTolerance;
    }

    const workspace = await Workspace.findByIdAndUpdate(
      req.user.workspaceId,
      { $set: update },
      { new: true, runValidators: true },
    );

    if (!workspace) {
      return res.status(404).json({
        success: false,
        message: "Workspace not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Workspace settings updated successfully.",
      data: {
        workspace: formatWorkspace(workspace),
      },
    });
  } catch (error) {
    next(error);
  }
};
